// Período analizado del Resumen y su comparación (2026-09-19, ADR-0121).
// Puro y sin dependencias: trabaja con fechas «aaaa-mm-dd» del calendario de
// Lima, nunca con `new Date("aaaa-mm-dd")` — ese parseo es UTC y en Lima
// (UTC−5) corre la fecha un día para atrás. Todo el cálculo es con año/mes/día
// sueltos sobre `Date.UTC`, que no tiene zona horaria ni horario de verano.
//
// REGLA FUNDAMENTAL (pedida por Felipe): el período mueve las métricas
// HISTÓRICAS (ventas, velocidad, sell-through, tendencia). El stock que se usa
// para decidir es siempre el ACTUAL. Este archivo solo sabe de fechas; quien lo
// use no puede mezclarlas, porque el stock no recibe ningún período.

export type PresetPeriodo = "7d" | "30d" | "90d" | "mes" | "personalizado";
export type ModoComparacion = "anterior" | "anio" | "personalizado" | "ninguna";

export const PRESETS_PERIODO: readonly { valor: PresetPeriodo; texto: string }[] = [
  { valor: "7d", texto: "7 días" },
  { valor: "30d", texto: "30 días" },
  { valor: "90d", texto: "90 días" },
  { valor: "mes", texto: "Este mes" },
  { valor: "personalizado", texto: "Personalizado" },
];

export const MODOS_COMPARACION: readonly { valor: ModoComparacion; texto: string }[] = [
  { valor: "anterior", texto: "Período anterior" },
  { valor: "anio", texto: "Mismo período del año anterior" },
  { valor: "personalizado", texto: "Otro período…" },
  { valor: "ninguna", texto: "Sin comparación" },
];

/** Valores por defecto: 30 días, comparado con el período anterior. */
export const PRESET_INICIAL: PresetPeriodo = "30d";
export const COMPARACION_INICIAL: ModoComparacion = "anterior";

/** Un período personalizado más largo que esto se recorta (la RPC ya topa a 730
 *  días; a la pantalla le basta un año: más largo deja de ser «reciente»). */
export const MAX_DIAS_PERIODO = 366;

export type Rango = { desde: string; hasta: string };

export type PeriodoResuelto = Rango & {
  preset: PresetPeriodo;
  /** Días del calendario, ambos extremos incluidos. */
  dias: number;
  etiqueta: string;
  /** Si lo que pidió el usuario no se pudo respetar (fechas inválidas, rango
   *  demasiado largo…), qué se hizo en su lugar. */
  advertencia: string | null;
};

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

/** Días del calendario entre dos fechas, ambos extremos incluidos (mismo día = 1). */
export function diasDelRango({ desde, hasta }: Rango): number {
  const a = parseIso(desde);
  const b = parseIso(hasta);
  if (!a || !b) throw new Error(`Rango inválido: ${desde} – ${hasta}`);
  return Math.round((aMs(b) - aMs(a)) / MS_DIA) + 1;
}

/** El mismo día un año antes; el 29 de febrero cae en el 28. */
export function mismoDiaAnioAnterior(iso: string): string {
  const dia = parseIso(iso);
  if (!dia) throw new Error(`Fecha inválida: ${iso}`);
  const a = dia.a - 1;
  const ultimo = new Date(Date.UTC(a, dia.m, 0)).getUTCDate();
  return aIso({ a, m: dia.m, d: Math.min(dia.d, ultimo) });
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

/** La versión hablada de `etiquetaRango`, para donde hay sitio de sobra: «desde 24 jul. hasta 22 ago.»,
 *  «el 18 sep.» (un solo día). No abrevia el mes compartido («desde 1 sep. hasta 15 sep.», no «1–15 sep.»):
 *  leída en voz alta suena a dos fechas, no a una resta. Si el rango cruza de año, ambas fechas llevan año. */
export function etiquetaRangoLarga({ desde, hasta }: Rango, conAnio = false): string {
  const a = parseIso(desde);
  const b = parseIso(hasta);
  if (!a || !b) return "";
  if (aMs(a) === aMs(b)) return `el ${textoDia(a, conAnio)}`;
  const conAnios = conAnio || a.a !== b.a;
  return `desde ${textoDia(a, conAnios)} hasta ${textoDia(b, conAnios)}`;
}

/** El texto de la píldora de un período en «Comparar períodos»: «Período B: desde 23 ago. hasta 21 sep.».
 *  Cada letra recibe SU rango — el diseño de Figma (2026-09-21) tenía escrito el rango de A en las dos
 *  píldoras, y con dos períodos distintos eso miente: los gráficos de abajo dicen otra cosa. Sin rango
 *  (A sin definir) no se inventa una fecha: «Período A: —». */
export function textoPildoraPeriodo(letra: "A" | "B", rango: Rango | null, conAnio = false): string {
  const cuerpo = rango ? etiquetaRangoLarga(rango, conAnio) : "";
  return `Período ${letra}: ${cuerpo || "—"}`;
}

// ---------------------------------------------------------------------------
// Resolver el período elegido
// ---------------------------------------------------------------------------

const DIAS_DE_PRESET: Record<"7d" | "30d" | "90d", number> = { "7d": 7, "30d": 30, "90d": 90 };

function esPreset(valor: string | null | undefined): valor is PresetPeriodo {
  return PRESETS_PERIODO.some((p) => p.valor === valor);
}

export function esModoComparacion(valor: string | null | undefined): valor is ModoComparacion {
  return MODOS_COMPARACION.some((m) => m.valor === valor);
}

function periodoDeDias(preset: "7d" | "30d" | "90d", hoy: string): PeriodoResuelto {
  const dias = DIAS_DE_PRESET[preset];
  return {
    preset,
    desde: sumarDias(hoy, -(dias - 1)),
    hasta: hoy,
    dias,
    etiqueta: `Últimos ${dias} días`,
    advertencia: null,
  };
}

/**
 * Convierte lo que llegó por la URL en un período válido. Nunca lanza: lo que no
 * se pueda respetar cae en los últimos 30 días y lo dice en `advertencia`.
 * `hoy` es «aaaa-mm-dd» de Lima (quien llama lo saca del reloj del servidor, una
 * sola vez, para que toda la pantalla comparta el mismo «hoy»).
 */
export function resolverPeriodo(
  entrada: { preset?: string | null; desde?: string | null; hasta?: string | null },
  hoy: string,
): PeriodoResuelto {
  const preset: PresetPeriodo = esPreset(entrada.preset) ? entrada.preset : PRESET_INICIAL;

  if (preset === "mes") {
    const dia = parseIso(hoy)!;
    const desde = aIso({ a: dia.a, m: dia.m, d: 1 });
    const rango = { desde, hasta: hoy };
    return { preset, ...rango, dias: diasDelRango(rango), etiqueta: `Este mes (${etiquetaRango(rango)})`, advertencia: null };
  }

  if (preset !== "personalizado") return periodoDeDias(preset, hoy);

  const desdeP = parseIso(entrada.desde);
  const hastaP = parseIso(entrada.hasta);
  if (!desdeP || !hastaP) {
    return {
      ...periodoDeDias("30d", hoy),
      preset: "personalizado",
      etiqueta: "Últimos 30 días",
      advertencia: "Elige las dos fechas del período; mientras tanto se muestran los últimos 30 días.",
    };
  }

  let desde = aIso(desdeP);
  let hasta = aIso(hastaP);
  let advertencia: string | null = null;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  if (desde > hoy) {
    return { ...periodoDeDias("30d", hoy), preset: "personalizado", etiqueta: "Últimos 30 días", advertencia: "El período no puede empezar en el futuro; se muestran los últimos 30 días." };
  }
  if (hasta > hoy) {
    hasta = hoy;
    advertencia = "El período llega hasta hoy: no hay ventas de días que aún no pasaron.";
  }
  if (diasDelRango({ desde, hasta }) > MAX_DIAS_PERIODO) {
    desde = sumarDias(hasta, -(MAX_DIAS_PERIODO - 1));
    advertencia = `El período se acortó a ${MAX_DIAS_PERIODO} días (el máximo).`;
  }
  const rango = { desde, hasta };
  return { preset, ...rango, dias: diasDelRango(rango), etiqueta: etiquetaRango(rango), advertencia };
}

/**
 * El rango contra el que se compara, o null si no se compara.
 *  - anterior: los mismos días corridos justo antes (30 días vs los 30 previos).
 *  - anio: las mismas fechas del año anterior.
 *  - personalizado: el rango que eligió la persona (`personalizado`); si falta o no
 *    es válido cae en «anterior» — quien llama debe mirar `modoEfectivo` si le importa.
 * Nunca hay solapamiento con el período actual en «anterior».
 */
export function resolverComparacion(periodo: Rango, modo: ModoComparacion, personalizado: Rango | null = null): Rango | null {
  if (modo === "ninguna") return null;
  if (modo === "anio") return { desde: mismoDiaAnioAnterior(periodo.desde), hasta: mismoDiaAnioAnterior(periodo.hasta) };
  if (modo === "personalizado" && personalizado) return personalizado;
  const dias = diasDelRango(periodo);
  const hasta = sumarDias(periodo.desde, -1);
  return { desde: sumarDias(hasta, -(dias - 1)), hasta };
}

/**
 * El rango que la persona escribió a mano para comparar («Otro período…»), o null si
 * no sirve: falta una fecha, no existe, empieza en el futuro. Fechas al revés se
 * ordenan; lo que pase de hoy se recorta (no hay ventas de días que aún no pasaron)
 * y un rango más largo que `MAX_DIAS_PERIODO` se acorta hacia atrás desde su fin.
 */
export function resolverRangoPersonalizado(desde: string | null | undefined, hasta: string | null | undefined, hoy: string): Rango | null {
  const a = parseIso(desde);
  const b = parseIso(hasta);
  if (!a || !b) return null;
  let ini = aIso(a);
  let fin = aIso(b);
  if (ini > fin) [ini, fin] = [fin, ini];
  if (ini > hoy) return null;
  if (fin > hoy) fin = hoy;
  if (diasDelRango({ desde: ini, hasta: fin }) > MAX_DIAS_PERIODO) ini = sumarDias(fin, -(MAX_DIAS_PERIODO - 1));
  return { desde: ini, hasta: fin };
}

/** «Demanda analizada: últimos 30 días» / «Demanda analizada: 1–15 sep.». */
export function textoDemandaAnalizada(periodo: PeriodoResuelto): string {
  const base = periodo.etiqueta.startsWith("Últimos") ? periodo.etiqueta.toLowerCase() : periodo.etiqueta.replace(/^Este mes/, "este mes");
  return `Demanda analizada: ${base}`;
}

/** «10:21» en hora de Lima — la marca discreta de «Actualizado 10:21». */
export function horaLima(ahora: Date): string {
  const partes = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ahora);
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  return `${get("hour")}:${get("minute")}`;
}

/** «18 sep. 2026, 18:24» en hora de Lima — la marca de «stock actual al…». */
export function textoInstanteLima(ahora: Date): string {
  const partes = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(ahora);
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const mes = MESES[Number(get("month")) - 1] ?? "";
  return `${get("day")} ${mes} ${get("year")}, ${get("hour")}:${get("minute")}`;
}
