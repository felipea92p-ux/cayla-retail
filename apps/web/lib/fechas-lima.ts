// «Hoy» según el reloj de Lima (ADR-0111). El servidor (Vercel) y la base corren
// en UTC: de 7 pm a medianoche de Lima ya es «mañana» para ellos. Todo cálculo de
// «vence hoy / venció hace N días / llega en N días» usa estas funciones, nunca
// `new Date()` a secas ni `current_date` — es la contraparte de `fn_hoy_lima()`
// en Postgres (migración 20260918200000). Fechas como texto `aaaa-mm-dd`.

const MS_DIA = 86_400_000;
/** Lima va cinco horas detrás de UTC todo el año: Perú no tiene horario de verano. */
const DESFASE_LIMA_MS = 5 * 3600 * 1000;

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

/** «20:00»: la hora de Lima (24 h) de un INSTANTE, la misma que da `diaYHoraLima`. Una fecha sola no tiene hora; sin instante, o
 *  con uno que no se lee, `null`: no se inventa una hora. */
export function horaLima(instante: string | null | undefined): string | null {
  if (!instante || /^\d{4}-\d{2}-\d{2}$/.test(instante) || Number.isNaN(Date.parse(instante))) return null;
  return diaYHoraLima(instante).hora;
}

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
  const lima = new Date(Date.parse(iso) - DESFASE_LIMA_MS);
  const dos = (n: number) => String(n).padStart(2, "0");
  return { dia: `${dos(lima.getUTCDate())}/${dos(lima.getUTCMonth() + 1)}`, hora: `${dos(lima.getUTCHours())}:${dos(lima.getUTCMinutes())}` };
}

// ── Un día o un mes de Lima como rango de instantes UTC [desde, hasta), para pedirle a la base lo de ese día o ese mes ──
// Vivían en `lib/fecha-lima.ts`, un archivo de nombre casi igual a este (extraídas de `finanzas-nucleo.ts` de V1); se mudaron
// aquí el 2026-10-14 para que las fechas de Lima estén en un solo archivo.

/** El mes `mes` (1-12) de `anio` en Lima: Comprobantes ▸ Emitidos y Proformas. */
export function mesLimaUTC(anio: number, mes: number): { desde: string; hasta: string } {
  const desde = new Date(Date.UTC(anio, mes - 1, 1) + DESFASE_LIMA_MS);
  const hasta = new Date(Date.UTC(anio, mes, 1) + DESFASE_LIMA_MS);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

/** El año y el mes (1-12) de hoy en Lima. `ahora` existe para poder probar el corte de las 19:00 del último día del mes. */
export function mesActualLima(ahora: number = Date.now()): { anio: number; mes: number } {
  const lima = new Date(ahora - DESFASE_LIMA_MS);
  return { anio: lima.getUTCFullYear(), mes: lima.getUTCMonth() + 1 };
}

/** El día de hoy en Lima: Comprobantes ▸ Hoy. */
export function hoyLimaUTC(ahora: number = Date.now()): { desde: string; hasta: string } {
  const lima = new Date(ahora - DESFASE_LIMA_MS);
  const inicio = Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate()) + DESFASE_LIMA_MS;
  return { desde: new Date(inicio).toISOString(), hasta: new Date(inicio + MS_DIA).toISOString() };
}
