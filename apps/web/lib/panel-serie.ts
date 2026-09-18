// Aritmética de "qué día es esto" para el Inicio, aparte de las consultas.
//
// Mismo patrón que ya usa el repo para separar lo que se puede probar de lo que
// necesita una base de datos: registro-contable.ts (puro) vs contabilidad.ts,
// proformas-reglas.ts (puro) vs proformas.ts. Sin este archivo, la lógica de
// zona horaria vivía enterrada dentro de una función que hace SELECTs y no
// había forma de probarla sin levantar Supabase.
//
// "Hoy" se calcula en hora de Lima (UTC-5), no del servidor — una venta a las
// 11pm en Trujillo debe contar como hoy, aunque en UTC ya sea mañana. Perú no
// tiene horario de verano, así que un desfase fijo es correcto: no hace falta
// una base de zonas horarias para esto.
const LIMA_OFFSET_MS = 5 * 3600 * 1000;
const DIA_MS = 86400000;

/** Días de historia diaria que alimentan la tendencia del Inicio (2 semanas). */
export const DIAS_TENDENCIA = 14;

/** Hoy es el ULTIMO punto de la serie: la mini-linea se lee de viejo a nuevo. */
export const INDICE_HOY = DIAS_TENDENCIA - 1;

/** Mismo día de la semana, 7 días atrás. */
export const INDICE_SEMANA_PASADA = DIAS_TENDENCIA - 8;

/**
 * Número de día calendario en Lima. Dos instantes con el mismo número son "el
 * mismo día" para el negocio, sin importar en qué día caigan en UTC.
 */
export function diaLima(t: number): number {
  return Math.floor((t - LIMA_OFFSET_MS) / DIA_MS);
}

/** Milisegundos desde la medianoche de Lima — la hora del día. */
export function horaDelDiaLima(t: number): number {
  return (t - LIMA_OFFSET_MS) % DIA_MS;
}

/** Instante UTC en que arranca el día `n` de Lima (el inverso de `diaLima`). */
export function inicioDeDiaLima(n: number): Date {
  return new Date(n * DIA_MS + LIMA_OFFSET_MS);
}

/** Medianoche de Lima del día 1 del mes en que cae `t` — para acumulados "este mes"
 *  (estadísticas de Cambios, etc). Perú no tiene horario de verano, así que restar
 *  el offset fijo para leer año/mes en hora de Lima es correcto (mismo criterio que
 *  el resto de este archivo). */
export function inicioDeMesLima(t: number): Date {
  const limaWallClock = new Date(t - LIMA_OFFSET_MS);
  return new Date(Date.UTC(limaWallClock.getUTCFullYear(), limaWallClock.getUTCMonth(), 1) + LIMA_OFFSET_MS);
}

/** El instante desde el que hay que pedir ventas para llenar la serie entera. */
export function inicioDeLaVentana(ahora: number): Date {
  return inicioDeDiaLima(diaLima(ahora) - INDICE_HOY);
}

/**
 * En qué punto de la serie cae `instante`, o null si quedó fuera de la ventana
 * (más viejo que DIAS_TENDENCIA, o en el futuro).
 */
export function indiceEnSerie(instante: number, ahora: number): number | null {
  const indice = INDICE_HOY - (diaLima(ahora) - diaLima(instante));
  return indice >= 0 && indice < DIAS_TENDENCIA ? indice : null;
}

/**
 * ¿Este instante ocurrió, en SU día, antes de la hora que es ahora? Es lo que
 * hace honesto el comparativo: a las 10am de un martes, el martes pasado solo
 * cuenta hasta sus 10am. Comparar contra el día completo pinta un rojo
 * permanente por la mañana que no significa nada.
 */
export function hastaEstaHora(instante: number, ahora: number): boolean {
  return horaDelDiaLima(instante) <= horaDelDiaLima(ahora);
}
