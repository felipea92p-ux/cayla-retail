// Aritmética pura del rediseño visual de Caja (2026-09-18) — mismo patrón que
// panel-serie.ts: separar lo que se puede probar sin Supabase de lo que hace
// SELECTs. Nada acá conoce `createClient` ni React.

import { diaLima, horaDelDiaLima, inicioDeDiaLima } from "./panel-serie";

const DIAS_TREND_CIERRES = 7;
const NOMBRES_DIA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;

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

/** La cinta del turno del encabezado: cuántas horas abarca y qué fracción lleva recorrida. Abarca una
 *  jornada de 8 h; si el turno ya la pasó, hasta la hora entera siguiente, así el punto nunca se sale.
 *  La escala es solo visual: la caja no tiene hora de cierre prevista. */
export function escalaTurno(minutosAbierta: number): { horas: number; fraccion: number } {
  const m = Number.isFinite(minutosAbierta) ? Math.max(0, minutosAbierta) : 0;
  const horas = Math.max(8, Math.floor(m / 60) + 1);
  return { horas, fraccion: m / (horas * 60) };
}

/** "13:09" → minutos desde la medianoche (789). La `hora` de `fn_ventas_del_dia` ya viene en hora de Lima. */
export function minutosDeHora(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export type MetodoRitmo = "efectivo" | "tarjeta" | "yape" | "transferencia" | "otro";
const ORDEN_METODOS: readonly MetodoRitmo[] = ["efectivo", "tarjeta", "yape", "transferencia", "otro"];

/** Los métodos de una venta: `"efectivo + yape"` → `["efectivo", "yape"]`. Sin repetir, y con Yape y
 *  Plin juntos, igual que la dona ("Yape / Plin"). Sin dato no inventa uno: lista vacía. */
export function metodosDe(texto: string | null): MetodoRitmo[] {
  const claves = (texto ?? "")
    .toLowerCase()
    .split("+")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t): MetodoRitmo =>
      t.includes("efectivo")
        ? "efectivo"
        : t.includes("tarjeta")
          ? "tarjeta"
          : t.includes("yape") || t.includes("plin")
            ? "yape"
            : t.includes("transferencia")
              ? "transferencia"
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

/**
 * Agrupa eventos de venta por hora del día (0-23, hora de Lima), sumando su
 * `total`. Devuelve un Map — el caller decide qué rango de horas mostrar (desde
 * que abrió la caja hasta ahora), esta función no inventa un rango fijo.
 */
export function ventasPorHora(eventos: readonly { hora: string; total: number }[]): Map<number, number> {
  const mapa = new Map<number, number>();
  for (const e of eventos) {
    const t = new Date(e.hora).getTime();
    if (Number.isNaN(t)) continue;
    const hora = Math.floor(horaDelDiaLima(t) / 3_600_000);
    mapa.set(hora, (mapa.get(hora) ?? 0) + e.total);
  }
  return mapa;
}

/** Las horas a dibujar en el gráfico: desde que abrió la caja hasta ahora (o hasta
 *  la última hora con datos si "ahora" cayó antes por algún reloj desfasado). Nunca
 *  un rango fijo 9am-8pm — una sede que abre a las 8 o cierra a las 9 se vería con
 *  columnas vacías que no existen. */
export function rangoHorasCaja(abiertaEn: string, ahora: Date): number[] {
  const horaApertura = Math.floor(horaDelDiaLima(new Date(abiertaEn).getTime()) / 3_600_000);
  const horaActual = Math.floor(horaDelDiaLima(ahora.getTime()) / 3_600_000);
  const desde = Math.min(horaApertura, horaActual);
  const hasta = Math.max(horaApertura, horaActual);
  return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
}

export type PuntoTendenciaCierres = { diaLabel: string; monto: number; descuadre: boolean; esHoy: boolean };

/**
 * Últimos 7 días (calendario Lima) de cierres de ESTA sede, uno por día — si un día
 * tuvo más de un cierre se suman. `monto` es lo neto que entró en efectivo al cajón
 * ese día (cierre real − apertura, la misma resta que ya hace `montoCierreReal −
 * montoApertura` en el resto del sistema); `descuadre` es true si algún cierre de
 * ese día no cuadró (mismo umbral < 0.01 que `CerrarCajaModalV2`/`CierreCajaDetalle`).
 */
export function tendenciaCierres7Dias(
  cierres: readonly { ubicacionId: string; cerradaEn: string; montoApertura: number; montoCierreReal: number; diferencia: number }[],
  ubicacionId: string,
  ahora: Date
): PuntoTendenciaCierres[] {
  const hoy = diaLima(ahora.getTime());
  const porDia = new Map<number, { monto: number; descuadre: boolean }>();
  for (const c of cierres) {
    if (c.ubicacionId !== ubicacionId || !c.cerradaEn) continue;
    const dia = diaLima(new Date(c.cerradaEn).getTime());
    if (hoy - dia < 0 || hoy - dia >= DIAS_TREND_CIERRES) continue;
    const previo = porDia.get(dia) ?? { monto: 0, descuadre: false };
    porDia.set(dia, {
      monto: previo.monto + (c.montoCierreReal - c.montoApertura),
      descuadre: previo.descuadre || Math.abs(c.diferencia) >= 0.01,
    });
  }

  return Array.from({ length: DIAS_TREND_CIERRES }, (_, i) => {
    const dia = hoy - (DIAS_TREND_CIERRES - 1 - i);
    const punto = porDia.get(dia);
    const fecha = inicioDeDiaLima(dia);
    return {
      diaLabel: NOMBRES_DIA[fecha.getUTCDay()]!,
      monto: punto?.monto ?? 0,
      descuadre: punto?.descuadre ?? false,
      esHoy: dia === hoy,
    };
  });
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

/**
 * ponytail: el pedido original comparaba egresos contra el promedio de la semana
 * PARA ESTA HORA — eso pide historial de egresos por hora que hoy no existe en
 * ningún lado (ver auditoría). En vez de inventar esa infraestructura para un
 * banner, se usa una señal más simple pero igual de real: egresos ya son una
 * porción grande de lo vendido HOY MISMO (sin datos históricos, sin queries
 * nuevas). Umbral 15%: por encima de eso un egreso deja de ser un gasto chico del
 * día y empieza a valer la pena que alguien lo mire. Subir a comparar contra el
 * promedio real de días anteriores cuando exista esa serie histórica (BACKLOG).
 */
const UMBRAL_EGRESOS_SOBRE_VENTAS = 0.15;

export function egresosElevados(egresosHoy: number, ventasHoy: number): { alerta: boolean; pct: number } {
  if (ventasHoy <= 0 || egresosHoy <= 0) return { alerta: false, pct: 0 };
  const pct = egresosHoy / ventasHoy;
  return { alerta: pct >= UMBRAL_EGRESOS_SOBRE_VENTAS, pct: Math.round(pct * 100) };
}

/** Repropone el badge del encabezado sin romper el conteo ciego (ADR-0042): nunca
 *  compara contra "lo esperado" mientras la caja sigue abierta — solo informa si
 *  hay ventas offline sin subir, que es una señal real y verificable en cualquier
 *  momento sin necesidad de contar el cajón. */
export function senalCaja(cantidadEnCola: number): { tono: "verde" | "ambar"; texto: string } {
  if (cantidadEnCola === 0) return { tono: "verde", texto: "Caja abierta · sin pendientes" };
  return {
    tono: "ambar",
    texto: cantidadEnCola === 1 ? "1 venta sin subir" : `${cantidadEnCola} ventas sin subir`,
  };
}

/** Desde cuántas horas abierta una caja deja de ser «el turno de hoy» y pasa a pedir cierre (auditoría de /caja, #3). */
export const HORAS_TURNO_LARGO = 18;

/** ¿La caja lleva tanto abierta que casi seguro se quedó sin cerrar de un día para otro? */
export function turnoLargo(minutosAbierta: number, umbralHoras = HORAS_TURNO_LARGO): boolean {
  return Number.isFinite(minutosAbierta) && minutosAbierta >= umbralHoras * 60;
}

export const MOTIVO_AJUSTE_INGRESO = "Ajuste de caja (sobrante)";
export const MOTIVO_AJUSTE_EGRESO = "Ajuste de caja (faltante)";

const MOTIVOS_EGRESO = ["Retiro de efectivo", "Depósito bancario", MOTIVO_AJUSTE_EGRESO, "Compra de insumos", "Otro"];
const MOTIVOS_INGRESO = [MOTIVO_AJUSTE_INGRESO, "Otro"];

/** El motivo es de ajuste: la base lo exige de líder (`registrar_movimiento_caja`, ADR-0056). */
export function esMotivoDeAjuste(motivo: string): boolean {
  return motivo === MOTIVO_AJUSTE_INGRESO || motivo === MOTIVO_AJUSTE_EGRESO;
}

/** Los motivos que el modal ofrece. A quien no es líder no se le muestra «Ajuste»: la base lo rechazaría
 *  recién al enviar. Solo esconde lo que la base ya rechaza — el candado real sigue siendo la RPC. */
export function motivosDeMovimiento(tipo: "ingreso" | "egreso", esLider: boolean): string[] {
  const todos = tipo === "egreso" ? MOTIVOS_EGRESO : MOTIVOS_INGRESO;
  return esLider ? todos : todos.filter((m) => !esMotivoDeAjuste(m));
}

/** «Depósito bancario» y «Otro» necesitan un rastro (N.º de operación o explicación) para poder revisarse después. */
export function referenciaObligatoria(motivo: string): boolean {
  return motivo === "Depósito bancario" || motivo === "Otro";
}
