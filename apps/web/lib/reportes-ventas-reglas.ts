import { NOMBRES_MES } from "./facturacion-reglas";

// Ventas ▸ Reportes ▸ Ventas del mes: las reglas, sin React ni base (maqueta docs/maquetas/reportes-ventas-2026-11/). Lo que dice la base
// (`fn_reporte_ventas_mes`, 20261103230000) se lee aquí una sola vez y de aquí salen las cifras derivadas y la frase de la comparación.
//
// PROMETE: (1) `leerReporteMes` no deja pasar un dato roto: un número que no es número vale 0 y una forma que no es la esperada da `null`;
// (2) las cifras derivadas (ticket, prendas por venta, parte devuelta) son `null` cuando el divisor es 0, nunca `NaN` ni infinito;
// (3) un cambio contra un mes sin ventas es `null` («no hay con qué comparar»), nunca «+∞ %»; (4) la frase dice contra qué se compara
// (los mismos N días si el mes está en curso).
// ASUME: que la base ya hizo la cuenta de qué ventas cuentan (completadas, sin pruebas) y de cuál es el tramo; aquí no se vuelve a decidir.

/** Las cifras de un tramo de días: `desde` incluido, `hasta` excluido (fechas de Lima, «YYYY-MM-DD»). */
export type CifrasMes = { desde: string; hasta: string; vendido: number; tickets: number; unidades: number; devuelto: number };

export type ReporteMes = {
  /** El primer día del mes pedido. */
  mes: string;
  /** Hoy en Lima. */
  hoy: string;
  /** El mes pedido es el de hoy: se mide «a la fecha». */
  enCurso: boolean;
  /** El día de la primera venta que la cuenta ve (null si no hay ninguna). */
  primeraVenta: string | null;
  actual: CifrasMes;
  anterior: CifrasMes;
};

const numero = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const fecha = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

function leerCifras(v: unknown): CifrasMes | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const desde = fecha(o.desde);
  const hasta = fecha(o.hasta);
  if (!desde || !hasta) return null;
  return { desde, hasta, vendido: numero(o.vendido), tickets: numero(o.tickets), unidades: numero(o.unidades), devuelto: numero(o.devuelto) };
}

/** Lo que devuelve `fn_reporte_ventas_mes`, ya validado. `null` si la forma no es la esperada. */
export function leerReporteMes(v: unknown): ReporteMes | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const mes = fecha(o.mes);
  const hoy = fecha(o.hoy);
  const actual = leerCifras(o.actual);
  const anterior = leerCifras(o.anterior);
  if (!mes || !hoy || !actual || !anterior) return null;
  return { mes, hoy, enCurso: o.en_curso === true, primeraVenta: fecha(o.primera_venta), actual, anterior };
}

/** Lo que deja cada venta, en promedio. `null` sin ventas. */
export const ticketPromedio = (c: Pick<CifrasMes, "vendido" | "tickets">): number | null => (c.tickets > 0 ? c.vendido / c.tickets : null);

/** Cuántas prendas lleva cada venta, en promedio. `null` sin ventas. */
export const prendasPorVenta = (c: Pick<CifrasMes, "unidades" | "tickets">): number | null => (c.tickets > 0 ? c.unidades / c.tickets : null);

/** Qué parte de lo vendido se devolvió (0 a 1). `null` si no se vendió nada. */
export const parteDevuelta = (c: Pick<CifrasMes, "vendido" | "devuelto">): number | null => (c.vendido > 0 ? c.devuelto / c.vendido : null);

/** Cuánto cambió una cifra contra la del tramo anterior (0,116 = subió 11,6 %). `null` si falta alguna o la anterior es 0: no hay con qué comparar. */
export function cambio(actual: number | null, anterior: number | null): number | null {
  if (actual === null || anterior === null || !(anterior > 0)) return null;
  return actual / anterior - 1;
}

/** «+11,6 %» / «−3 %» / «igual»: un cambio menor a medio punto es «igual». Sin decimales si es entero. */
export function textoCambio(c: number | null): string {
  if (c === null) return "—";
  const pct = Math.round(c * 1000) / 10;
  if (Math.abs(pct) < 0.5) return "igual";
  const cuerpo = Math.abs(pct).toLocaleString("es-PE", { maximumFractionDigits: 1 });
  return `${pct > 0 ? "+" : "−"}${cuerpo} %`;
}

export type SentidoCambio = "sube" | "baja" | "igual" | null;
export const sentidoDe = (c: number | null): SentidoCambio => (c === null ? null : Math.abs(c * 100) < 0.5 ? "igual" : c > 0 ? "sube" : "baja");

const dia = (s: string): number => {
  const [a, m, d] = s.split("-").map(Number) as [number, number, number];
  return Date.UTC(a, m - 1, d);
};
/** Cuántos días hay de `desde` (incluido) a `hasta` (excluido). */
export const diasDelTramo = (c: Pick<CifrasMes, "desde" | "hasta">): number => Math.max(0, Math.round((dia(c.hasta) - dia(c.desde)) / 86_400_000));

const nombreDelMes = (fechaIso: string): string => NOMBRES_MES[Number(fechaIso.slice(5, 7)) - 1]!.toLowerCase();
const capitalizada = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
/** «30 de septiembre». */
const diaYMes = (fechaIso: string): string => `${Number(fechaIso.slice(8, 10))} de ${nombreDelMes(fechaIso)}`;

export type Comparacion =
  | { hay: true; /** «septiembre» */ contra: string; /** Si el mes está en curso: cuántos días se comparan; si no, `null`. */ mismosDias: number | null; frase: string }
  | { hay: false; motivo: string };

/**
 * Contra qué se compara el mes. Un mes cerrado, contra el anterior entero (o el tramo que alcance); el mes en curso, contra los MISMOS días
 * del anterior. Sin ventas en el tramo anterior no hay con qué comparar, y el motivo dice por qué (no es lo mismo «es el primer mes» que
 * «ese mes no se vendió»).
 */
export function comparacionDe(r: ReporteMes): Comparacion {
  // El mes anterior quedó a medias: se empezó a vender DENTRO de él (el ERP es joven). Comparar un mes entero contra unos pocos días da
  // porcentajes de miles que no dicen nada, así que no se compara y se dice por qué.
  if (r.primeraVenta !== null && r.primeraVenta > r.anterior.desde && r.primeraVenta < r.actual.desde) {
    return { hay: false, motivo: `${capitalizada(nombreDelMes(r.anterior.desde))} quedó a medias: se empezó a vender el ${diaYMes(r.primeraVenta)}. No se compara.` };
  }
  if (r.anterior.vendido > 0) {
    const contra = nombreDelMes(r.anterior.desde);
    const mismosDias = r.enCurso ? diasDelTramo(r.actual) : null;
    return { hay: true, contra, mismosDias, frase: mismosDias === null ? `vs ${contra}` : `vs ${contra}, los mismos ${mismosDias} ${mismosDias === 1 ? "día" : "días"}` };
  }
  if (r.primeraVenta === null) return { hay: false, motivo: "Todavía no hay ventas." };
  if (r.primeraVenta >= r.actual.desde) return { hay: false, motivo: "Es el primer mes con ventas: no hay con qué compararlo." };
  return { hay: false, motivo: `No hubo ventas en ${nombreDelMes(r.anterior.desde)} para compararlo.` };
}

/** Lo que se está midiendo, en una línea: «el mes entero» o «a la fecha, 2 días». */
export function tramoEnPalabras(r: ReporteMes): string {
  if (!r.enCurso) return "el mes entero";
  const n = diasDelTramo(r.actual);
  return `a la fecha, ${n} ${n === 1 ? "día" : "días"}`;
}

/** El `?tienda=` de la URL: solo un id (uuid); cualquier otra cosa es «todas». */
export function tiendaDeUrl(v: string | string[] | undefined | null): string | null {
  const t = Array.isArray(v) ? v[0] : v;
  return typeof t === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t) ? t.toLowerCase() : null;
}

/** El primer día del mes que pide la base: «2026-10-01». */
export const primerDiaDelMes = ({ anio, mes }: { anio: number; mes: number }): string => `${anio}-${String(mes).padStart(2, "0")}-01`;
