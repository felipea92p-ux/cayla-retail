// Fechas del calendario de Lima (2026-09-19, ADR-0121). Nació para el período
// analizado del Resumen (el Análisis de antes de la v4: sus presets, su
// comparación y sus textos se borraron con él el 2026-10-06); lo que queda lo
// usan Existencias y `resumen-inventario.ts`.
// Puro y sin dependencias: trabaja con fechas «aaaa-mm-dd» del calendario de
// Lima, nunca con `new Date("aaaa-mm-dd")` — ese parseo es UTC y en Lima
// (UTC−5) corre la fecha un día para atrás. Todo el cálculo es con año/mes/día
// sueltos sobre `Date.UTC`, que no tiene zona horaria ni horario de verano.
//
// REGLA FUNDAMENTAL (pedida por Felipe): un rango de fechas mueve las métricas
// HISTÓRICAS (ventas, velocidad). El stock que se usa para decidir es siempre
// el ACTUAL. Este archivo solo sabe de fechas; quien lo use no puede mezclarlas,
// porque el stock no recibe ningún período.

export type Rango = { desde: string; hasta: string };

// ---------------------------------------------------------------------------
// Fechas sin zona horaria
// ---------------------------------------------------------------------------

type Dia = { a: number; m: number; d: number }; // m: 1-12

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIso(texto: string | null | undefined): Dia | null {
  if (!texto) return null;
  const m = RE_ISO.exec(texto);
  if (!m) return null;
  const dia = { a: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  // Una fecha que no existe (31/02) no sobrevive al viaje de ida y vuelta.
  const t = new Date(Date.UTC(dia.a, dia.m - 1, dia.d));
  if (t.getUTCFullYear() !== dia.a || t.getUTCMonth() !== dia.m - 1 || t.getUTCDate() !== dia.d) return null;
  return dia;
}

function aIso({ a, m, d }: Dia): string {
  return `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function aMs({ a, m, d }: Dia): number {
  return Date.UTC(a, m - 1, d);
}

const MS_DIA = 86_400_000;

export function sumarDias(iso: string, n: number): string {
  const dia = parseIso(iso);
  if (!dia) throw new Error(`Fecha inválida: ${iso}`);
  const t = new Date(aMs(dia) + n * MS_DIA);
  return aIso({ a: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

/** «aaaa-mm-dd» de hoy en Lima, a partir de un instante. */
export function hoyEnLima(ahora: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ahora);
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// ---------------------------------------------------------------------------
// Etiquetas
// ---------------------------------------------------------------------------

const MESES = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sep.", "oct.", "nov.", "dic."];

function textoDia(dia: Dia, conAnio: boolean): string {
  return `${dia.d} ${MESES[dia.m - 1]}${conAnio ? ` ${dia.a}` : ""}`;
}

/** «1–15 sep.», «28 ago. – 15 sep.», «28 dic. 2025 – 3 ene. 2026». Con `conAnio`
 *  siempre lleva el año: comparar con «el mismo período del año anterior» sin decir
 *  el año se lee como si fuera el período de hoy. */
export function etiquetaRango({ desde, hasta }: Rango, conAnio = false): string {
  const a = parseIso(desde);
  const b = parseIso(hasta);
  if (!a || !b) return "";
  if (aMs(a) === aMs(b)) return textoDia(a, conAnio);
  if (a.a !== b.a) return `${textoDia(a, true)} – ${textoDia(b, true)}`;
  if (a.m === b.m) return `${a.d}–${b.d} ${MESES[b.m - 1]}${conAnio ? ` ${b.a}` : ""}`;
  return `${textoDia(a, false)} – ${textoDia(b, conAnio)}`;
}
