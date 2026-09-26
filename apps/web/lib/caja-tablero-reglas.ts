// Reglas puras del tablero de Caja como pantalla de trabajo (spike docs/maquetas/caja-tablero-spike-2026-09/,
// aprobado por Felipe el 2026-09-26). Sin React ni Supabase: se prueban en `caja-tablero-reglas.test.ts`.
//
// Qué decide este archivo:
//  - «Cobrado en el turno» sin el `anticipo`: el adelanto de una separación se cobró el día que se separó
//    (20260923090000_separaciones.sql lo registra como un pago `anticipo` de la venta final); sumarlo hoy infla lo
//    cobrado y la dona lo mostraba como si fuera una forma de pago.
//  - El desglose de «Efectivo en el cajón ahora»: las mismas piezas que suma `fn_calcular_esperado_caja` (la base es la
//    dueña del total, ADR-0186); aquí solo se ordenan para mostrarlas.
//  - Si un cierre cuadró, faltó o sobró, y en qué tono (el semáforo del historial).
//  - Qué vista del historial y qué tarjetas trae cada quien por defecto.

import type { CierreCaja, ResumenCaja } from "@/lib/caja";

/* ------------------------------------------------------------------
   Cobrado en el turno
   ------------------------------------------------------------------ */

export type MetodoCobrado = { clave: "efectivo" | "tarjeta" | "yape" | "transferencia" | "otro"; texto: string; monto: number };

const TEXTO_METODO: Record<MetodoCobrado["clave"], string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  yape: "Yape / Plin",
  transferencia: "Transferencia",
  otro: "Otro",
};
const ORDEN_METODO: MetodoCobrado["clave"][] = ["efectivo", "tarjeta", "yape", "transferencia", "otro"];

/**
 * Lo cobrado HOY por forma de pago, sin el adelanto de separaciones (`anticipo`), que va aparte. Yape y Plin se juntan
 * (en la tienda son lo mismo: una billetera). Los métodos en cero no salen.
 */
export function cobradoDelTurno(porMetodo: Partial<Record<string, number>>): { total: number; anticipo: number; metodos: MetodoCobrado[] } {
  const suma = new Map<MetodoCobrado["clave"], number>();
  let anticipo = 0;
  for (const [metodo, valor] of Object.entries(porMetodo)) {
    const monto = Number(valor ?? 0);
    if (!monto) continue;
    if (metodo === "anticipo") {
      anticipo += monto;
      continue;
    }
    const clave: MetodoCobrado["clave"] =
      metodo === "plin" || metodo === "yape" ? "yape" : metodo === "efectivo" || metodo === "tarjeta" || metodo === "transferencia" ? metodo : "otro";
    suma.set(clave, (suma.get(clave) ?? 0) + monto);
  }
  const metodos = ORDEN_METODO.filter((c) => (suma.get(c) ?? 0) > 0).map((c) => ({ clave: c, texto: TEXTO_METODO[c], monto: redondear(suma.get(c)!) }));
  return { total: redondear(metodos.reduce((a, m) => a + m.monto, 0)), anticipo: redondear(anticipo), metodos };
}

/* ------------------------------------------------------------------
   Efectivo en el cajón: las piezas
   ------------------------------------------------------------------ */

export type PiezaCajon = { etiqueta: string; monto: number; signo: "+" | "−" };

/**
 * Las piezas del efectivo esperado en el cajón, en el orden en que se leen. Apertura, ventas en efectivo, entradas y
 * salidas van siempre (son lo que la colaboradora reconoce); reembolsos y cambios solo si hubo, para no llenar la
 * tarjeta de ceros. El TOTAL no se calcula aquí: lo dice `fn_calcular_esperado_caja` (ADR-0186).
 */
export function piezasDelCajon(apertura: number, r: Pick<ResumenCaja, "ventasEfectivo" | "ingresos" | "egresos" | "reembolsosEfectivo" | "cambiosEfectivo">): PiezaCajon[] {
  const piezas: PiezaCajon[] = [
    { etiqueta: "Apertura", monto: apertura, signo: "+" },
    { etiqueta: "Ventas en efectivo", monto: r.ventasEfectivo, signo: "+" },
    { etiqueta: "Entradas", monto: r.ingresos, signo: "+" },
    { etiqueta: "Salidas", monto: r.egresos, signo: "−" },
  ];
  if (r.reembolsosEfectivo > 0) piezas.push({ etiqueta: "Devoluciones", monto: r.reembolsosEfectivo, signo: "−" });
  if (r.cambiosEfectivo !== 0) piezas.push({ etiqueta: "Cambios", monto: Math.abs(r.cambiosEfectivo), signo: r.cambiosEfectivo > 0 ? "+" : "−" });
  return piezas;
}

/* ------------------------------------------------------------------
   Movimientos del turno: filtro
   ------------------------------------------------------------------ */

export type FiltroMovimientos = "todo" | "ventas" | "cajon";

/** ¿El evento pasa el filtro? «Mueve el cajón» = movimientos manuales y ventas con algo en efectivo. */
export function pasaFiltroMovimiento(e: { icono: "venta" | "ingreso" | "egreso"; titulo: string }, filtro: FiltroMovimientos): boolean {
  if (filtro === "todo") return true;
  if (filtro === "ventas") return e.icono === "venta";
  return e.icono !== "venta" || e.titulo.toLowerCase().includes("efectivo");
}

/* ------------------------------------------------------------------
   Cierres anteriores
   ------------------------------------------------------------------ */

/** Hasta cuánto de diferencia un cierre es «poco» (ámbar) y no «mal» (rojo). Decisión del spike, 2026-09-26. */
export const TOLERANCIA_CUADRE = 5;

export type ClaveCuadre = "ok" | "poco" | "mal";
export type Cuadre = { clave: ClaveCuadre; texto: string; diferencia: number };

/** Un cierre cuadró si la diferencia es menos de un céntimo; si no, faltó (negativa) o sobró (positiva). */
export function cuadreDe(diferencia: number): Cuadre {
  const d = redondear(diferencia);
  if (Math.abs(d) < 0.01) return { clave: "ok", texto: "Cuadró", diferencia: 0 };
  const texto = `${d > 0 ? "Sobró" : "Faltó"} S/ ${Math.abs(d).toFixed(2)}`;
  return { clave: Math.abs(d) <= TOLERANCIA_CUADRE ? "poco" : "mal", texto, diferencia: d };
}

/** Cuántos de los cierres cuadraron y cuál fue el descuadre más grande (para la línea de resumen). */
export function resumenCuadres(cierres: readonly Pick<CierreCaja, "diferencia" | "cerradaEn" | "cerradaPorNombre">[]): {
  cuadraron: number;
  total: number;
  peor: { diferencia: number; cerradaEn: string; quien: string | null } | null;
} {
  let peor: { diferencia: number; cerradaEn: string; quien: string | null } | null = null;
  let cuadraron = 0;
  for (const c of cierres) {
    const q = cuadreDe(c.diferencia);
    if (q.clave === "ok") cuadraron++;
    else if (!peor || Math.abs(q.diferencia) > Math.abs(peor.diferencia)) peor = { diferencia: q.diferencia, cerradaEn: c.cerradaEn, quien: c.cerradaPorNombre };
  }
  return { cuadraron, total: cierres.length, peor };
}

export type ModoCierres = "ultimo" | "semaforo" | "tabla" | "grafico";
export const MODOS_CIERRES: readonly { clave: ModoCierres; etiqueta: string; corta: string; bajada: string }[] = [
  { clave: "ultimo", etiqueta: "Último cierre", corta: "Último", bajada: "Cómo quedó la caja que abriste hoy" },
  { clave: "semaforo", etiqueta: "Semáforo", corta: "Semáforo", bajada: "Un cuadro por turno · si cuadró o no" },
  { clave: "tabla", etiqueta: "Tabla de turnos", corta: "Tabla", bajada: "Los últimos turnos, la diferencia primero" },
  { clave: "grafico", etiqueta: "Gráfico", corta: "Gráfico", bajada: "Lo esperado al cerrar, un día por barra" },
];

/**
 * La vista que trae cada quien si no eligió otra: la colaboradora necesita saber cómo recibió la caja (el último
 * cierre); el líder busca si los descuadres se repiten (el semáforo). Decisión del 2026-09-26.
 */
export function modoCierresPredeterminado(esLider: boolean): ModoCierres {
  return esLider ? "semaforo" : "ultimo";
}

export function esModoCierres(x: unknown): x is ModoCierres {
  return typeof x === "string" && MODOS_CIERRES.some((m) => m.clave === x);
}

export type DiaCierres = { dia: string; esperado: number; peor: Cuadre };

/**
 * Un día por barra para el gráfico: si una sede cerró dos veces el mismo día (el historial viejo mostraba tres
 * «mar 22» seguidos), se suman los esperados y manda el peor cuadre del día. `dia` es YYYY-MM-DD de Lima.
 */
export function cierresPorDia(cierres: readonly { dia: string; montoCierreSistema: number; diferencia: number }[]): DiaCierres[] {
  const orden = { ok: 0, poco: 1, mal: 2 } as const;
  const porDia = new Map<string, DiaCierres>();
  for (const c of cierres) {
    const q = cuadreDe(c.diferencia);
    const previo = porDia.get(c.dia);
    if (!previo) porDia.set(c.dia, { dia: c.dia, esperado: c.montoCierreSistema, peor: q });
    else {
      previo.esperado = redondear(previo.esperado + c.montoCierreSistema);
      if (orden[q.clave] > orden[previo.peor.clave] || (q.clave === previo.peor.clave && Math.abs(q.diferencia) > Math.abs(previo.peor.diferencia))) previo.peor = q;
    }
  }
  return [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia));
}

/* ------------------------------------------------------------------
   Tarjetas que se muestran («Tu caja muestra»)
   ------------------------------------------------------------------ */

export type TarjetaCaja = "pendientes" | "apartados" | "gastos" | "posventa";
export const TARJETAS_CAJA: readonly TarjetaCaja[] = ["pendientes", "apartados", "gastos", "posventa"];
/** Prendidas de entrada: las dos que piden hacer algo. */
export const TARJETAS_PREDETERMINADAS: readonly TarjetaCaja[] = ["pendientes", "apartados"];

/** Lo guardado en el aparato, limpio: solo claves conocidas y disponibles para esta cuenta. Sin nada guardado, lo predeterminado. */
export function tarjetasElegidas(guardado: unknown, disponibles: readonly TarjetaCaja[]): TarjetaCaja[] {
  const base = Array.isArray(guardado) ? (guardado as unknown[]) : TARJETAS_PREDETERMINADAS;
  return TARJETAS_CAJA.filter((t) => base.includes(t) && disponibles.includes(t));
}

export function sonLasPredeterminadas(elegidas: readonly TarjetaCaja[], disponibles: readonly TarjetaCaja[]): boolean {
  const pred = TARJETAS_PREDETERMINADAS.filter((t) => disponibles.includes(t));
  return pred.length === elegidas.length && pred.every((t) => elegidas.includes(t));
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}
