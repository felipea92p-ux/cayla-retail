// Aritmética pura del rediseño visual de Caja (2026-09-18) — mismo patrón que
// panel-serie.ts: separar lo que se puede probar sin Supabase de lo que hace
// SELECTs. Nada acá conoce `createClient` ni React.

import { diaLima, horaDelDiaLima } from "./panel-serie";

/** "48 min" o "1 h 04 min": un solo formato para "lleva abierta" y "desde la última venta". */
export function formatoDuracion(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

/** Cuánto lleva abierta la caja, para el reloj del encabezado. Un reloj adelantado (la
 *  apertura quedó "en el futuro") da 0 min, no un negativo. */
export function duracionAbierta(abiertaEn: string, ahoraMs: number): string {
  const minutos = Math.max(0, Math.floor((ahoraMs - new Date(abiertaEn).getTime()) / 60_000));
  return Number.isFinite(minutos) ? formatoDuracion(minutos) : "—";
}

/** "13:09" → minutos desde la medianoche (789). La `hora` de `fn_ventas_del_dia` ya viene en hora de Lima. */
export function minutosDeHora(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export type MetodoRitmo = "efectivo" | "tarjeta" | "yape" | "transferencia" | "qr" | "otro";
export const ORDEN_METODOS: readonly MetodoRitmo[] = ["efectivo", "tarjeta", "yape", "transferencia", "qr", "otro"];

/** Los métodos de una venta tal como se leen en una fila: `"efectivo + qr"` → `"efectivo + QR"`. QR es una sigla y va en mayúscula;
 *  los demás medios quedan como los manda la base. */
export function textoMetodosDeVenta(texto: string | null): string {
  return (texto ?? "")
    .split("+")
    .map((t) => t.trim())
    .map((t) => (t.toLowerCase() === "qr" ? "QR" : t))
    .filter(Boolean)
    .join(" + ");
}

/** Los métodos de una venta: `"efectivo + yape"` → `["efectivo", "yape"]`. Sin repetir, y con Yape y
 *  Plin juntos, igual que la dona ("Yape / Plin"). Sin dato no inventa uno: lista vacía. */
export function metodosDe(texto: string | null): MetodoRitmo[] {
  const claves = (texto ?? "")
    .toLowerCase()
    .split("+")
    .map((t) => t.trim())
    // El redondeo del efectivo no es una forma de pago (ADR-0311): la base ya no lo manda aquí, pero si llegara no sería «Otro».
    .filter((t) => Boolean(t) && !t.includes("redondeo"))
    .map((t): MetodoRitmo =>
      t.includes("efectivo")
        ? "efectivo"
        : t.includes("tarjeta")
          ? "tarjeta"
          : t.includes("yape") || t.includes("plin")
            ? "yape"
            : t.includes("transferencia")
              ? "transferencia"
              : /\bqr\b/.test(t)
                ? "qr"
                : "otro"
    );
  return Array.from(new Set(claves));
}

export type PuntoRitmo = {
  id: string;
  /** "13:09", tal cual, para el globo al apuntarlo. */
  hora: string;
  total: number;
  /** 0–1 dentro del eje (apertura → ahora). */
  pos: number;
  /** 0–1, tamaño relativo: la raíz del monto sobre el mayor, para que el ÁREA del punto siga al monto. */
  peso: number;
  /** Los que caen en la misma zona del eje se apilan (fila 0, 1, 2…) en vez de taparse. */
  fila: number;
  metodos: MetodoRitmo[];
};

export type RitmoDelDia = {
  /** `false` si la caja quedó abierta de ayer: el eje entonces arranca a medianoche, no en su hora de apertura. */
  abrioHoy: boolean;
  cantidad: number;
  total: number;
  ticketPromedio: number;
  /** Minutos desde la última venta hasta ahora; `null` si todavía no hubo ninguna. */
  minutosDesdeUltima: number | null;
  puntos: PuntoRitmo[];
  /** Filas del apilado más alto (0 si no hay puntos). */
  filas: number;
  /** Métodos que aparecen, en orden fijo: la leyenda. */
  metodos: MetodoRitmo[];
};

/** El eje se parte en zonas iguales; los puntos de una misma zona se apilan. Más zonas, menos apilado. */
const ZONAS_RITMO = 24;

/**
 * "Ritmo del día" de Caja: cuántas ventas, ticket promedio, cuánto hace de la última y dónde cae
 * cada una sobre el eje apertura → ahora. Todo sale de `fn_ventas_del_dia`, sin consultas nuevas.
 *
 * Esa función trae las ventas de HOY de la ubicación, incluidas las de cajas anteriores del mismo
 * día: solo cuentan las de la caja actual (desde que abrió). Y si esta caja quedó abierta de
 * ayer, el eje arranca a medianoche, porque de ayer no llega nada.
 */
export function ritmoDelDia(
  ventas: readonly { ventaId: string; hora: string; total: number; metodosPago: string | null }[],
  abiertaEn: string,
  ahoraMs: number
): RitmoDelDia {
  const aperturaMs = new Date(abiertaEn).getTime();
  const ahoraMin = Math.floor(horaDelDiaLima(ahoraMs) / 60_000);
  const abrioHoy = diaLima(aperturaMs) === diaLima(ahoraMs);
  const aperturaMin = abrioHoy ? Math.floor(horaDelDiaLima(aperturaMs) / 60_000) : 0;

  const propias = ventas
    .map((v) => ({ ...v, min: minutosDeHora(v.hora) }))
    .filter((v) => v.min >= aperturaMin)
    .sort((a, b) => a.min - b.min);

  const cantidad = propias.length;
  const total = propias.reduce((a, v) => a + v.total, 0);
  const ultima = propias[cantidad - 1]?.min ?? null;
  // Un reloj atrasado (una venta "del futuro") no debe dejar puntos fuera del eje.
  const span = Math.max(ahoraMin, ultima ?? 0, aperturaMin + 1) - aperturaMin;
  const mayor = Math.max(0, ...propias.map((v) => v.total));

  const zonas = new Map<number, number>();
  const puntos = propias.map((v): PuntoRitmo => {
    const pos = Math.min(1, Math.max(0, (v.min - aperturaMin) / span));
    const zona = Math.min(ZONAS_RITMO - 1, Math.floor(pos * ZONAS_RITMO));
    const fila = zonas.get(zona) ?? 0;
    zonas.set(zona, fila + 1);
    return {
      id: v.ventaId,
      hora: v.hora,
      total: v.total,
      pos,
      peso: mayor > 0 ? Math.sqrt(v.total / mayor) : 0,
      fila,
      metodos: metodosDe(v.metodosPago),
    };
  });

  const presentes = new Set(puntos.flatMap((p) => p.metodos));
  return {
    abrioHoy,
    cantidad,
    total,
    ticketPromedio: cantidad > 0 ? total / cantidad : 0,
    minutosDesdeUltima: ultima === null ? null : Math.max(0, ahoraMin - ultima),
    puntos,
    filas: Math.max(0, ...Array.from(zonas.values())),
    metodos: ORDEN_METODOS.filter((m) => presentes.has(m)),
  };
}

export type Comparativo = { texto: string; positivo: boolean };

/** "▲ 12% vs. martes pasado" / null si no hay con qué comparar (semana pasada en
 *  cero: dividir daría un falso "infinito por ciento" en vez de decir la verdad). */
export function comparativoSemanaAnterior(hoy: number, semanaAnterior: number, nombreDiaPasado: string): Comparativo | null {
  if (semanaAnterior <= 0) return null;
  const pct = Math.round(((hoy - semanaAnterior) / semanaAnterior) * 100);
  const flecha = pct >= 0 ? "▲" : "▼";
  return { texto: `${flecha} ${Math.abs(pct)}% vs. ${nombreDiaPasado} pasado`, positivo: pct >= 0 };
}

/** Desde cuántas horas abierta una caja deja de ser «el turno de hoy» y pasa a pedir cierre (auditoría de /caja, #3). */
export const HORAS_TURNO_LARGO = 18;

/** ¿La caja lleva tanto abierta que casi seguro se quedó sin cerrar de un día para otro? */
export function turnoLargo(minutosAbierta: number, umbralHoras = HORAS_TURNO_LARGO): boolean {
  return Number.isFinite(minutosAbierta) && minutosAbierta >= umbralHoras * 60;
}

export const MOTIVO_AJUSTE_INGRESO = "Ajuste de caja (sobrante)";
export const MOTIVO_AJUSTE_EGRESO = "Ajuste de caja (faltante)";

// «Compra de insumos» ya no es una salida (Felipe 2026-10-10, ADR-0375): es un gasto y va por el gasto rápido. La base la rechaza
// desde 20261010223118; lo ya registrado con ese motivo no cambia (Gastos lo sigue sugiriendo como gasto al clasificarlo).
const MOTIVOS_EGRESO = ["Retiro de efectivo", "Depósito bancario", MOTIVO_AJUSTE_EGRESO, "Otro"];
const MOTIVOS_INGRESO = [MOTIVO_AJUSTE_INGRESO, "Otro"];

/** El motivo es de ajuste: marca `es_ajuste` en `registrar_movimiento_caja`. Desde ADR-0534 lo anota quien opera la caja, no solo el
 *  líder (la líder lo valida en persona). */
export function esMotivoDeAjuste(motivo: string): boolean {
  return motivo === MOTIVO_AJUSTE_INGRESO || motivo === MOTIVO_AJUSTE_EGRESO;
}

/** Los motivos que el modal ofrece. Desde ADR-0534 el ajuste lo ve toda cuenta que opera la caja. */
export function motivosDeMovimiento(tipo: "ingreso" | "egreso"): string[] {
  return tipo === "egreso" ? MOTIVOS_EGRESO : MOTIVOS_INGRESO;
}

/** «Depósito bancario» y «Otro» necesitan un rastro (N.º de operación o explicación) para poder revisarse después. */
export function referenciaObligatoria(motivo: string): boolean {
  return motivo === "Depósito bancario" || motivo === "Otro";
}
