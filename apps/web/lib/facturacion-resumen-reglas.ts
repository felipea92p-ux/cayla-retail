import type { EstadoComprobante } from "./comprobantes-reglas";

// Reglas del Resumen de Facturación (spec §6, ADR-0124). Puras: el reloj entra por parámetro,
// así que se prueban sin fecha real (como `marcarPorVencer`).

/** El color de una tarjeta: verde va bien, ámbar hay algo pendiente, rojo exige acción, taupe
 *  solo informa. El mismo criterio que `TarjetaKpi` de Caja. */
export type TonoKpi = "verde" | "ambar" | "rojo" | "taupe";

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
