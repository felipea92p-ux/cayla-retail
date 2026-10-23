// La hoja «Configuración» de una campaña (ADR-0488): lo que su formulario calcula para mostrarse, sin React ni red. Las reglas de
// lo que se acepta guardar NO viven aquí: son las de `etiqueta-campana.ts` (`parsearDescuento`) y las cierra la base.

import { parsearDescuento } from "./etiqueta-campana";
import { diasEntreFechas } from "./fechas-lima";

/** Cuánto sube o baja el descuento cada toque de − o + en la hoja. */
export const PASO_DESCUENTO = 5;

/**
 * El descuento después de un toque de − o +: de 5 en 5, hasta el múltiplo de 5 más cercano (12,5 % con + va a 20 %, con − a 10 %),
 * entre 0 y 100. Cero es «sin descuento» y se devuelve vacío, como lo escribe la hoja. Lo mal escrito cuenta como cero: el toque
 * deja un número que sí se puede guardar.
 */
export function pasoDeDescuento(texto: string, delta: number): string {
  const actual = parsearDescuento(texto);
  const v = actual.ok && actual.valor !== null ? actual.valor : 0;
  const n = Math.max(0, Math.min(100, Math.round((v + delta) / PASO_DESCUENTO) * PASO_DESCUENTO));
  return n === 0 ? "" : String(n);
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const diaDeSemana = (iso: string) => DIAS_SEMANA[new Date(`${iso}T00:00:00Z`).getUTCDay()];

/**
 * Cuánto dura la temporada, dicho como se dice en tienda: «25 días, de jueves a domingo» (las dos puntas cuentan; un solo día es
 * «1 día, el sábado»). `null` si falta una fecha o están al revés: eso ya lo dice el pie de «Hasta».
 */
export function textoDuracion(desde: string | null, hasta: string | null): string | null {
  if (!desde || !hasta || desde > hasta) return null;
  const dias = diasEntreFechas(desde, hasta) + 1;
  return dias === 1 ? `1 día, el ${diaDeSemana(desde)}` : `${dias} días, de ${diaDeSemana(desde)} a ${diaDeSemana(hasta)}`;
}
