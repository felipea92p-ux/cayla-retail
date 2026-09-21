import type { EstadoComprobante } from "./comprobantes-reglas";

// Reglas del Resumen de Facturación (spec §6, ADR-0124). Puras: el reloj entra por parámetro,
// así que se prueban sin fecha real (como `marcarPorVencer`).

/** El color de una tarjeta: verde va bien, ámbar hay algo pendiente, rojo exige acción, taupe
 *  solo informa. El mismo criterio que `TarjetaKpi` de Caja. */
export type TonoKpi = "verde" | "ambar" | "rojo" | "taupe";

// Lima no tiene horario de verano: es UTC−5 todo el año (igual que `lib/fecha-lima.ts`).
const LIMA_MS = 5 * 3600 * 1000;
const DIA_MS = 24 * 3600 * 1000;

export type VentanaISO = { desde: string; hasta: string };

/** El día de Lima que contiene `ahora`, de medianoche a medianoche, en UTC. Una venta de las
 *  7:30 pm de Lima ya es del día siguiente en UTC y sigue siendo de este día (ADR-0110). */
export function ventanaDelDiaLima(ahora: Date): VentanaISO {
  const medianocheLima = Math.floor((ahora.getTime() - LIMA_MS) / DIA_MS) * DIA_MS + LIMA_MS;
  return { desde: new Date(medianocheLima).toISOString(), hasta: new Date(medianocheLima + DIA_MS).toISOString() };
}

/** «Lo mismo, hace N días, hasta esta hora»: de la medianoche de Lima de ese día a la misma
 *  hora de reloj de Lima que es ahora. Se resta al INSTANTE (no a la fecha UTC), y como Lima no
 *  cambia de hora, 7 días exactos son el mismo día de la semana a la misma hora. */
export function ventanaHastaEstaHora(ahora: Date, diasAtras: number): VentanaISO {
  const hasta = new Date(ahora.getTime() - diasAtras * DIA_MS);
  return { desde: ventanaDelDiaLima(hasta).desde, hasta: hasta.toISOString() };
}

/** «13:09» → 13.15: la hora de reloj de Lima con decimales, la unidad de los gráficos. */
export function horaDeReloj(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h + (m || 0) / 60;
}

/** Una fila por venta. `fn_ventas_del_dia` hace `left join comprobantes` y `comprobantes.venta_id` no es
 *  único: una venta con dos comprobantes (un anulado y su reemplazo) sale dos veces, con el mismo total.
 *  Para sumar y contar ventas se toma la primera de cada una; la lista de actividad sí muestra cada par. */
export function ventasUnicas<T extends { venta_id: string }>(filas: T[]): T[] {
  return [...new Map(filas.map((f) => [f.venta_id, f])).values()];
}

/** La hora de reloj de Lima de un instante, con decimales: 13:09 → 13.15. */
export function horaDeLima(iso: string): number {
  const lima = new Date(Date.parse(iso) - LIMA_MS);
  return lima.getUTCHours() + lima.getUTCMinutes() / 60;
}

/** «Vendido hoy»: verde si va por encima de la referencia (el mismo día de la semana pasada,
 *  hasta esta hora), ámbar si por debajo, taupe si no hay referencia — sin referencia no hay
 *  nada que juzgar. Igual a la referencia no está por debajo. */
export function tonoVendidoHoy(hoy: number, referencia: number | null): TonoKpi {
  if (referencia === null || referencia <= 0) return "taupe";
  return hoy >= referencia ? "verde" : "ambar";
}

/** «Por enviar a SUNAT»: rojo si SUNAT rechazó alguno, ámbar si hay pendientes, verde si no
 *  queda nada. `rechazados` ya está contado dentro de `porEnviar`. */
export function tonoPorEnviar(r: { porEnviar: number; rechazados: number }): TonoKpi {
  if (r.rechazados > 0) return "rojo";
  return r.porEnviar > 0 ? "ambar" : "verde";
}

type Comparativo = { texto: string; positivo: boolean };

function conSigno(n: number, sufijo: string): Comparativo {
  const positivo = n >= 0;
  return { texto: `${positivo ? "+" : "−"}${Math.abs(n)}${sufijo}`, positivo };
}

/** «+12%» / «−8%» de hoy sobre la referencia; `null` si no hay referencia con la que comparar
 *  (nula o cero: sin ventas a esta hora la semana pasada no hay porcentaje). Una
 *  diferencia diminuta por debajo (`−0`) se escribe «+0%»: `-0 >= 0`. */
export function comparativoEnPorcentaje(hoy: number, referencia: number | null): Comparativo | null {
  if (referencia === null || referencia <= 0) return null;
  return conSigno(Math.round(((hoy - referencia) / referencia) * 100), "%");
}

/** «+1» / «−2» ventas de diferencia. Contra una semana sin ventas (0) sí se puede comparar en
 *  cantidad; solo sin lectura de la referencia (`null`) no hay comparativo. */
export function comparativoEnCantidad(hoy: number, referencia: number | null): Comparativo | null {
  if (referencia === null) return null;
  return conSigno(hoy - referencia, "");
}

/** Una duración en pocas palabras: «12 min», «6 h 42 min», «3 d». `null` si es menos de un minuto
 *  (cada quien decide cómo decir «instantes»). */
export function duracionCorta(segundos: number): string | null {
  if (segundos < 60) return null;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return minutos % 60 === 0 ? `${horas} h` : `${horas} h ${minutos % 60} min`;
  return `${Math.floor(horas / 24)} d`;
}

/** Cuánto hace de un instante: «hace instantes», «hace 12 min», «hace 6 h 42 min», «hace 3 d».
 *  Nunca negativa: un reloj adelantado se lee como «hace instantes». */
export function antiguedad(iso: string, ahora: Date): string {
  const duracion = duracionCorta(Math.max(0, Math.floor((ahora.getTime() - Date.parse(iso)) / 1000)));
  return duracion ? `hace ${duracion}` : "hace instantes";
}

/** Cuánto falta para un instante futuro, en la misma forma que `antiguedad` («instantes», «45 min»,
 *  «5 h 20 min», «3 d»); va después de «Vence en». Nunca negativa: un instante ya pasado se lee «instantes». */
export function faltaPara(iso: string, ahora: Date): string {
  return duracionCorta(Math.max(0, Math.floor((Date.parse(iso) - ahora.getTime()) / 1000))) ?? "instantes";
}

/** La barra de «Por enviar»: de los comprobantes de hoy que cuentan (no anulados ni «no
 *  emitidos»), cuántos ya salieron hacia SUNAT (`enviado` o `aceptado`). */
export function progresoDeEnvio(comprobantesDeHoy: { estado: EstadoComprobante }[]): { enviados: number; total: number } {
  const cuentan = comprobantesDeHoy.filter((c) => c.estado !== "anulado" && c.estado !== "no_emitido");
  return { enviados: cuentan.filter((c) => c.estado === "enviado" || c.estado === "aceptado").length, total: cuentan.length };
}
