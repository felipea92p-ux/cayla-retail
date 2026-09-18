// «Hoy» según el reloj de Lima (ADR-0104). El servidor (Vercel) y la base corren
// en UTC: de 7 pm a medianoche de Lima ya es «mañana» para ellos. Todo cálculo de
// «vence hoy / venció hace N días / llega en N días» usa estas funciones, nunca
// `new Date()` a secas ni `current_date` — es la contraparte de `fn_hoy_lima()`
// en Postgres (migración 20260918160000). Fechas como texto `aaaa-mm-dd`.

/** `aaaa-mm-dd` de hoy en Lima. `ahora` existe para poder probar el corte de las 19:00. */
export function hoyLima(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

const MS_DIA = 86_400_000;

/** Días de calendario entre dos fechas `aaaa-mm-dd` (positivo si `hasta` es posterior). */
export function diasEntreFechas(desde: string, hasta: string): number {
  const a = Date.parse(`${desde.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / MS_DIA);
}

/** Días desde hoy (Lima) hasta `iso`: negativo si ya pasó, 0 si es hoy. */
export function diasHastaLima(iso: string, ahora: Date = new Date()): number {
  return diasEntreFechas(hoyLima(ahora), iso);
}
