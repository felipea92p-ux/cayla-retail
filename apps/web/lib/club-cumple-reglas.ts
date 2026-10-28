// El cumpleaños de una clienta (CL-3: día y mes; el año, opcional). UNA sola regla para las dos pantallas que lo escriben:
// Cobrar («Registrar clienta» e «Invitar al club») y /clientas (el alta, «Editar» y «Unirse al club»). Lógica pura, sin
// React ni red: la usan `lib/club-caja-reglas.ts`, la ficha y las piezas de `components/clientas/club-piezas.tsx`.
//
// Hasta el 2026-09-30 había dos reglas que no coincidían: la de /clientas (`estadoCumple`) aceptaba el 31 de abril y la de
// Cobrar (`problemaCumple`) lo rechazaba. Quedó la estricta: un día que el mes no tiene, o un 29 de febrero de un año que no
// fue bisiesto, es un error de tipeo, y el saludo de cumpleaños saldría un día que no existe.

export const MESES_DEL_ANIO = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Setiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

/**
 * El combo del mes (la forma de `Opcion` de `components/ui/campos`). Abreviado como el spike del club (`MESES`): día, mes y
 * año van en tres cajas iguales y a 375 px cada una mide ~100 px; «Setiembre» entero no cabría en la del medio.
 */
export const OPCIONES_MES_CUMPLE = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"].map((texto, i) => ({
  valor: String(i + 1),
  texto,
}));

/** El cumpleaños tal como está en la hoja: textos, vacíos si no se eligió. */
export type CumpleEscrito = { dia: string; mes: string; anio: string };
export const CUMPLE_VACIO: CumpleEscrito = { dia: "", mes: "", anio: "" };

/** Lo que queda en la caja del día al tipear: solo dígitos, hasta 2. */
export const ajustarDia = (texto: string) => texto.replace(/\D/g, "").slice(0, 2);
/** Lo que queda en la caja del año al tipear: solo dígitos, hasta 4. */
export const ajustarAnio = (texto: string) => texto.replace(/\D/g, "").slice(0, 4);

/** No escribió nada del cumpleaños (ni día, ni mes, ni año). */
export const cumpleVacio = (c: CumpleEscrito) => c.dia.trim() === "" && c.mes.trim() === "" && c.anio.trim() === "";

const DIAS_DEL_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const esBisiesto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
/** Nadie del club nació hace más de esto: un año más viejo es un error de tipeo. */
const EDAD_MAXIMA = 110;

/**
 * Por qué el cumpleaños escrito no sirve, o null. Vacío sirve: no es obligatorio (tampoco para entrar al club), aunque sin
 * él no hay beneficio de cumpleaños (CL-3). Día y mes van juntos; el año es opcional y solo con ellos.
 */
export function problemaCumple(c: CumpleEscrito, anioActual: number): string | null {
  const dia = c.dia.trim();
  const mes = c.mes.trim();
  const anio = c.anio.trim();
  if (!dia && !mes) return anio ? "Con el año, elige también el día y el mes." : null;
  if (!dia) return "Falta el día de su cumpleaños.";
  if (!mes) return "Falta el mes de su cumpleaños.";
  const d = Number(dia);
  const m = Number(mes);
  if (!Number.isInteger(m) || m < 1 || m > 12) return "Elige el mes de la lista.";
  if (!Number.isInteger(d) || d < 1 || d > DIAS_DEL_MES[m - 1]!) return `${MESES_DEL_ANIO[m - 1]} no tiene día ${dia}.`;
  if (!anio) return null;
  if (!/^[0-9]{4}$/.test(anio)) return "El año va con sus 4 cifras (o déjalo vacío).";
  const a = Number(anio);
  if (a > anioActual || a < anioActual - EDAD_MAXIMA) return `El año ${anio} no puede ser el de su nacimiento.`;
  if (m === 2 && d === 29 && !esBisiesto(a)) return `En ${anio} febrero tuvo 28 días.`;
  return null;
}

/** Día y mes escritos y bien (el año, si está, también): hay beneficio de cumpleaños. */
export function cumpleCompleto(c: CumpleEscrito, anioActual: number): boolean {
  return c.dia.trim() !== "" && c.mes.trim() !== "" && problemaCumple(c, anioActual) === null;
}

/**
 * Qué caja lleva el cursor cuando el cumpleaños no sirve (`avisar.error(…, { enfocar })`): el año si el problema es solo del
 * año (día y mes están bien); si no, el día. null si no hay problema.
 */
export function cajaDelProblemaCumple(c: CumpleEscrito, anioActual: number): "dia" | "anio" | null {
  if (problemaCumple(c, anioActual) === null) return null;
  return cumpleCompleto({ ...c, anio: "" }, anioActual) ? "anio" : "dia";
}
