// «Hoy» según el reloj de Lima (ADR-0111). El servidor (Vercel) y la base corren
// en UTC: de 7 pm a medianoche de Lima ya es «mañana» para ellos. Todo cálculo de
// «vence hoy / venció hace N días / llega en N días» usa estas funciones, nunca
// `new Date()` a secas ni `current_date` — es la contraparte de `fn_hoy_lima()`
// en Postgres (migración 20260918200000). Fechas como texto `aaaa-mm-dd`.

/** `aaaa-mm-dd` de hoy en Lima. `ahora` existe para poder probar el corte de las 19:00. */
export function hoyLima(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

/** El día de Lima (`aaaa-mm-dd`) de un INSTANTE: un timestamptz, que la base manda en UTC («2026-10-14T01:00:00+00:00» son las
 *  20:00 del 13 en Lima). Es `hoyLima` para cualquier momento, no solo para ahora. A un instante nunca se le cortan los 10
 *  primeros caracteres: eso da el día de UTC, y lo hecho de 7 pm a medianoche de Lima cae al día siguiente (lo vigila
 *  `sin-corte-de-instante.test.ts`). Una fecha sola (`aaaa-mm-dd`, un `date` de la base) ya es un día y vuelve tal cual; sin
 *  instante, o con uno que no se lee, `null`: no se inventa un día. */
export function diaLima(instante: string | null | undefined): string | null {
  if (!instante) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(instante)) return instante;
  const t = Date.parse(instante);
  return Number.isNaN(t) ? null : hoyLima(new Date(t));
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

/** `iso` (aaaa-mm-dd) más `dias` días de calendario, sin pasar por zonas horarias. */
export function sumarDias(iso: string, dias: number): string {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + dias * MS_DIA;
  return new Date(t).toISOString().slice(0, 10);
}

/** `dd/mm` de una fecha `aaaa-mm-dd` — como se rotulan las fechas en las listas de Compras. */
export function diaMes(iso: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/** «19/09» y «16:34» de un instante (con o sin offset), en hora de Lima. Lima va cinco horas detrás
 *  de UTC todo el año (sin horario de verano): se corre el instante y se lee en UTC, sin `Intl`, así
 *  que servidor y navegador dicen lo mismo. */
export function diaYHoraLima(iso: string): { dia: string; hora: string } {
  const lima = new Date(Date.parse(iso) - 5 * 3600 * 1000);
  const dos = (n: number) => String(n).padStart(2, "0");
  return { dia: `${dos(lima.getUTCDate())}/${dos(lima.getUTCMonth() + 1)}`, hora: `${dos(lima.getUTCHours())}:${dos(lima.getUTCMinutes())}` };
}
