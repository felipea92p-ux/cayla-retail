/**
 * Cómo se lee el stock de un producto en `/productos` (Grilla y Tabla) — pantalla:productos,
 * tareas #1, #2 y #4 (docs/pantallas/productos.md).
 *
 * Tres decisiones de Felipe (2026-09-22) que viven aquí para que la tarjeta de la Grilla y la fila de
 * la Tabla no las repitan cada una a su manera:
 *
 *  1. Una prenda DESCONTINUADA no dispara alertas. Sigue listada y consultable, pero ni «Agotado» ni
 *     «Stock bajo» le corresponden: no hay nada que reponer de algo que ya no se vende. La base aplica
 *     la misma regla a los contadores del subtítulo y a «A quién pedirle» (migración 20260922120000);
 *     esta función es la copia para lo que se pinta en cada fila.
 *  2. El número es el TOTAL de todas las sedes y el Taller (`fn_productos.stock_total`, decisión del
 *     2026-09-15). El rótulo lo dice: «Stock total», y no «Stock» a secas bajo un selector de sede
 *     que parecía cambiarlo.
 *  3. «Agotado» no es rojo: con 23 prendas en 0, más de la mitad de la grilla quedaba en rojo y el
 *     rojo dejaba de avisar (MAX_ROJO_POR_PANTALLA = 2). Se dice en tinta, con un chip neutro.
 */

export type AlertaStock = "agotado" | "bajo" | null;

type ProductoConStock = {
  estado: string;
  stockTotal: number;
  stockMinimo: number | null;
};

/** Lo que dice el total, tal como se pinta junto al nombre de la prenda. */
export const ROTULO_STOCK_TOTAL = "Stock total";

/** Para el `title` (al pasar el mouse o dejar el dedo) y para la nota de la cabecera. */
export const EXPLICACION_STOCK_TOTAL = "Suma de todas las sedes y el Taller.";

/**
 * ¿Esta prenda pide atención por su stock? Solo las activas. `agotado` = 0 unidades en toda la red;
 * `bajo` = quedan, pero menos que su mínimo (el mínimo se carga al editar el producto).
 */
export function alertaDeStock(p: ProductoConStock): AlertaStock {
  if (p.estado !== "activo") return null;
  if (p.stockTotal === 0) return "agotado";
  if (p.stockMinimo != null && p.stockTotal < p.stockMinimo) return "bajo";
  return null;
}

/** «Agotado» o «Stock total 12». Un descontinuado en 0 también dice «Agotado» (es un hecho), sin alerta. */
export function textoDeStock(stockTotal: number): string {
  return stockTotal === 0 ? "Agotado" : `${ROTULO_STOCK_TOTAL} ${stockTotal}`;
}
