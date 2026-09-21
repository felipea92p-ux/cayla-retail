/**
 * Cómo se lee el stock de un producto en `/productos` (Grilla y Tabla) — pantalla:productos,
 * tareas #1, #2 y #4 (docs/pantallas/productos.md).
 *
 * Tres decisiones de Felipe (2026-09-22) que viven aquí para que la tarjeta de la Grilla y la fila de
 * la Tabla no las repitan cada una a su manera:
 *
 *  1. Una prenda DESCONTINUADA no dispara alertas. Sigue listada y consultable, pero ni «Sin stock» ni
 *     «Stock bajo» le corresponden: no hay nada que reponer de algo que ya no se vende. La base aplica
 *     la misma regla a los contadores del subtítulo, al filtro y a «A quién pedirle» (migración
 *     20260922120000); esta función es la copia para lo que se pinta en cada fila. «Sin stock» y «Stock
 *     bajo» son EXCLUYENTES, igual que en la base: 0 unidades es «sin stock», no las dos cosas.
 *  2. El número es el TOTAL de todas las sedes y el Taller (`fn_productos.stock_total`, decisión del
 *     2026-09-15). El rótulo lo dice: «Stock total», y no «Stock» a secas bajo un selector de sede
 *     que parecía cambiarlo.
 *  3. «Sin stock» no es rojo: con 23 prendas en 0, más de la mitad de la grilla quedaba en rojo y el
 *     rojo dejaba de avisar (MAX_ROJO_POR_PANTALLA = 2). Se dice con la misma palabra que el subtítulo y
 *     el filtro («sin stock»), en un chip neutro. Una descontinuada en 0 dice «Stock total 0»: es un
 *     hecho, no una alerta, y así ninguna tarjeta dice «Sin stock» sin contar en el número de arriba.
 */

export type AlertaStock = "sin_stock" | "bajo" | null;

type ProductoConStock = { estado: string; stockTotal: number; stockMinimo: number | null };

/** Lo que dice el total, tal como se pinta junto al nombre de la prenda. */
export const ROTULO_STOCK_TOTAL = "Stock total";

/** Para el `title` (al pasar el mouse o dejar el dedo) y para la nota de la cabecera. */
export const EXPLICACION_STOCK_TOTAL = "Suma de todas las sedes y el Taller.";

/**
 * ¿Esta prenda pide atención por su stock? Solo las activas. `sin_stock` = 0 unidades en toda la red;
 * `bajo` = quedan, pero menos que su mínimo (el mínimo se carga al editar el producto).
 */
export function alertaDeStock(p: ProductoConStock): AlertaStock {
  if (p.estado !== "activo") return null;
  if (p.stockTotal === 0) return "sin_stock";
  if (p.stockMinimo != null && p.stockTotal < p.stockMinimo) return "bajo";
  return null;
}

/** «Stock total 12». En cero también: «Stock total 0» (la alerta «Sin stock» la pinta el chip, no este texto). */
export function textoDeStock(stockTotal: number): string {
  return `${ROTULO_STOCK_TOTAL} ${stockTotal}`;
}

/** El vacío de siempre. */
export const MENSAJE_SIN_RESULTADOS = "Ningún producto calza con esos filtros.";

/**
 * Qué decir cuando no hay tarjetas. Pedir prendas descontinuadas Y una alerta de stock a la vez no puede
 * devolver nada (una descontinuada no es una alerta): se dice por qué, en vez del «no hay» genérico que
 * dejaría a una persona sin contexto pensando que el catálogo está vacío.
 */
export function mensajeSinResultados(filtros: { estado?: string; stock?: string }): string {
  if (filtros.estado === "descontinuado" && filtros.stock) {
    return "Las prendas descontinuadas no cuentan como sin stock, con stock bajo ni para pedir. Quita el filtro de stock para verlas.";
  }
  return MENSAJE_SIN_RESULTADOS;
}
