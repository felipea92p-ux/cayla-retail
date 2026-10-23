// La hoja «Configuración» de una campaña (ADR-0488): lo que su formulario calcula para mostrarse, sin React ni red. Las reglas de
// lo que se acepta guardar NO viven aquí: son las de `etiqueta-campana.ts` (`parsearDescuento`) y las cierra la base.

import { parsearDescuento } from "./etiqueta-campana";

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
