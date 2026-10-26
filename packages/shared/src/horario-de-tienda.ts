// El horario de una tienda por días (Tienda web ▸ Conf. Tienda, ADR-0518): lo que el ERP guarda y la tienda online lee, escrito UNA vez para que
// las dos apps digan lo mismo de «abierta ahora». Lógica pura, sin red ni reloj propio: quien llama pone la hora (`momentoEnLima`).
//
// CONTRATO
//   PROMETE: leer los días que manda la base (descartando lo mal formado sin caerse), armar el texto corto del horario («Lun–Sáb 10 a. m.–9 p. m.»)
//            y decir si la tienda está abierta, cuándo cierra o cuándo vuelve a abrir, con los cierres por fecha.
//   ASUME:   horas de la misma jornada (de las 0:00 a las 24:00, de a media hora): una tienda que cierra pasada la medianoche no cabe todavía.
//            La hora de Lima no tiene horario de verano (UTC−5 todo el año).
//   NO HACE: guardar nada ni conocer la base: la base repite los topes en sus CHECK (`ubicacion_horario_web_*`).

/** Lunes es 0 y domingo 6, como los guarda la base. */
export const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;
export const DIAS_LARGOS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;

/** De la apertura al cierre de un día, en minutos desde la medianoche y de a media hora (10 a. m. = 600; 9 p. m. = 1260). */
export type TramoDia = { abre: number; cierra: number };

/** Siete lugares, de lunes a domingo; `null` es un día cerrado. */
export type SemanaDeTienda = (TramoDia | null)[];

export const PASO_DE_HORA = 30;
export const MINUTOS_DEL_DIA = 24 * 60;
/** Lo más que cabe en el texto corto del horario (el tope de `ubicacion_datos_web.horario`). */
export const LARGO_MAXIMO_RESUMEN = 120;

export const semanaVacia = (): SemanaDeTienda => Array.from({ length: 7 }, () => null);

/** ¿Es un tramo que la base aceptaría? Enteros, de a media hora, y la apertura antes del cierre dentro del mismo día. */
export function tramoValido(t: unknown): t is TramoDia {
  if (typeof t !== "object" || t === null) return false;
  const { abre, cierra } = t as Record<string, unknown>;
  return (
    Number.isInteger(abre) && Number.isInteger(cierra) &&
    (abre as number) % PASO_DE_HORA === 0 && (cierra as number) % PASO_DE_HORA === 0 &&
    (abre as number) >= 0 && (abre as number) < (cierra as number) && (cierra as number) <= MINUTOS_DEL_DIA
  );
}

/** Las filas que manda la base (`[{dia, abre, cierra}]`) → los siete días. Una fila mal formada, repetida o de un día que no existe se ignora: un
 *  dato raro no tumba la pantalla (la primera fila de cada día manda). */
export function semanaDesdeFilas(filas: unknown): SemanaDeTienda {
  const semana = semanaVacia();
  if (!Array.isArray(filas)) return semana;
  for (const f of filas) {
    if (typeof f !== "object" || f === null) continue;
    const { dia, abre, cierra } = f as Record<string, unknown>;
    if (!Number.isInteger(dia) || (dia as number) < 0 || (dia as number) > 6 || semana[dia as number] !== null) continue;
    const tramo = { abre, cierra };
    if (tramoValido(tramo)) semana[dia as number] = { abre: tramo.abre, cierra: tramo.cierra };
  }
  return semana;
}

/** Los siete días → las filas que la base guarda (solo los días abiertos). */
export function filasDeSemana(semana: SemanaDeTienda): { dia: number; abre: number; cierra: number }[] {
  return semana.flatMap((t, dia) => (t ? [{ dia, abre: t.abre, cierra: t.cierra }] : []));
}

export const semanaTieneHoras = (semana: SemanaDeTienda): boolean => semana.some((t) => t !== null);

export const mismaSemana = (a: SemanaDeTienda, b: SemanaDeTienda): boolean =>
  a.length === b.length && a.every((t, i) => (t === null ? b[i] === null : b[i] !== null && b[i]!.abre === t.abre && b[i]!.cierra === t.cierra));

/** Una semana como texto corto y sin espacios, para guardarla en un borrador de pantalla: «600-1260|600-1260|x|…». */
export const serializarSemana = (semana: SemanaDeTienda): string => semana.map((t) => (t ? `${t.abre}-${t.cierra}` : "x")).join("|");

export function semanaDeSerializada(texto: string): SemanaDeTienda {
  const partes = texto.split("|");
  if (partes.length !== 7) return semanaVacia();
  const semana = partes.map((p) => {
    const m = /^(\d+)-(\d+)$/.exec(p);
    const t = m ? { abre: Number(m[1]), cierra: Number(m[2]) } : null;
    return t && tramoValido(t) ? t : null;
  });
  return semana;
}

/** «10 a. m.», «9:30 p. m.», «12 p. m.» (mediodía), «12 a. m.» (medianoche). */
export function etiquetaDeHora(minutos: number): string {
  const m = ((minutos % MINUTOS_DEL_DIA) + MINUTOS_DEL_DIA) % MINUTOS_DEL_DIA;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  return `${h % 12 === 0 ? 12 : h % 12}${resto ? `:${String(resto).padStart(2, "0")}` : ""} ${h < 12 ? "a. m." : "p. m."}`;
}

/**
 * El texto corto del horario: los días seguidos con las mismas horas van juntos («Lun–Sáb 10 a. m.–9 p. m. · Dom 11 a. m.–7 p. m.»). `null` si
 * no hay ningún día abierto. Si no cabe en el tope de la base (siete días todos distintos), dice «Horario según el día» en vez de cortarse a media
 * palabra: el detalle sigue en los días.
 */
export function resumenDeHorario(semana: SemanaDeTienda): string | null {
  const grupos: { desde: number; hasta: number; tramo: TramoDia }[] = [];
  semana.forEach((t, dia) => {
    if (!t) return;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.hasta === dia - 1 && ultimo.tramo.abre === t.abre && ultimo.tramo.cierra === t.cierra) ultimo.hasta = dia;
    else grupos.push({ desde: dia, hasta: dia, tramo: t });
  });
  if (grupos.length === 0) return null;
  const texto = grupos
    .map((g) => `${g.desde === g.hasta ? DIAS_CORTOS[g.desde] : `${DIAS_CORTOS[g.desde]}–${DIAS_CORTOS[g.hasta]}`} ${etiquetaDeHora(g.tramo.abre)}–${etiquetaDeHora(g.tramo.cierra)}`)
    .join(" · ");
  return texto.length <= LARGO_MAXIMO_RESUMEN ? texto : "Horario según el día";
}

// ---------------------------------------------------------------- Abierta ahora

/** El día y la hora de Lima en un instante: lo que se compara con el horario. `fecha` es «AAAA-MM-DD». */
export type MomentoEnLima = { dia: number; minutos: number; fecha: string };

/** Lima no tiene horario de verano: UTC−5 todo el año. Se calcula con `Intl` y no con la zona del aparato (un celular con otra zona vería otra hora). */
export function momentoEnLima(instante: Date = new Date()): MomentoEnLima {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instante);
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "0";
  const fecha = `${v("year")}-${v("month")}-${v("day")}`;
  const dia = (new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7;
  return { dia, minutos: Number(v("hour")) * 60 + Number(v("minute")), fecha };
}

/** La fecha `n` días después (o antes) de una «AAAA-MM-DD». */
export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Un día en que la tienda no abre por una razón puntual (feriado, inventario). */
export type CierrePorFecha = { fecha: string; motivo?: string | null };

export type EstadoDeAtencion = {
  /** Abierta en este momento. */
  abierta: boolean;
  /** Lo que se lee de un vistazo: «Abierta · cierra 9 p. m.», «Cerrada · abre mañana 10 a. m.», «Cerrada hoy». */
  texto: string;
  /** Hoy hay un cierre por fecha. */
  cierreHoy: boolean;
};

/**
 * ¿Está abierta la tienda ahora? `null` si no hay horario por días (sin horario no se dice nada: la tienda no se declara cerrada por falta de
 * datos). Un cierre por fecha manda sobre el horario del día; al decir cuándo abre se saltan los días con cierre.
 */
export function estadoDeAtencion(semana: SemanaDeTienda, cierres: readonly CierrePorFecha[], ahora: MomentoEnLima): EstadoDeAtencion | null {
  if (!semanaTieneHoras(semana)) return null;
  const cerradoEn = (fecha: string) => cierres.some((c) => c.fecha === fecha);
  if (cerradoEn(ahora.fecha)) return { abierta: false, texto: "Cerrada hoy", cierreHoy: true };

  const hoy = semana[ahora.dia] ?? null;
  if (hoy && ahora.minutos >= hoy.abre && ahora.minutos < hoy.cierra) {
    return { abierta: true, texto: `Abierta · cierra ${etiquetaDeHora(hoy.cierra)}`, cierreHoy: false };
  }
  if (hoy && ahora.minutos < hoy.abre) {
    return { abierta: false, texto: `Cerrada · abre ${etiquetaDeHora(hoy.abre)}`, cierreHoy: false };
  }
  for (let paso = 1; paso <= 7; paso++) {
    const dia = (ahora.dia + paso) % 7;
    const tramo = semana[dia];
    if (!tramo || cerradoEn(sumarDias(ahora.fecha, paso))) continue;
    const cuando = paso === 1 ? "mañana" : `el ${DIAS_LARGOS[dia]}`;
    return { abierta: false, texto: `Cerrada · abre ${cuando} ${etiquetaDeHora(tramo.abre)}`, cierreHoy: false };
  }
  return { abierta: false, texto: "Cerrada", cierreHoy: false };
}
