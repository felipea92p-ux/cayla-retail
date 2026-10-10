// El ejemplo de «Para reconocerla» al etiquetar una prenda de liquidación (ADR-0375, ADR-0290): sigue a la categoría elegida, como
// Nuevo producto. Sale de la MISMA tabla curada (`FICHAS_POR_CATEGORIA`, por prefijo, nunca por el nombre visible): la prenda de la
// categoría + un color de ejemplo + el primer detalle de su ficha («Blusa beige, manga globo»). Sin categoría, o una que aún no tiene
// ficha, un texto que no promete nada. Lógica pura: la prueba recorre todas las categorías.

import { FICHAS_POR_CATEGORIA, MAX_DESCRIPCION, type ContextoCategoria, type Sugerencia } from "./sugerencias-alta-producto";

/** Lo más largo que cabe de ejemplo en la caja a 375 px (la misma medida que la descripción de Nuevo producto). */
export const MAX_EJEMPLO_LIQUIDACION = MAX_DESCRIPCION;

const NEUTRO = "Color y un detalle que la distinga";

export function sugerirDescripcionLiquidacion(ctx: ContextoCategoria | null | undefined): Sugerencia {
  const ficha = ctx?.prefijo ? FICHAS_POR_CATEGORIA[ctx.prefijo] : undefined;
  if (!ficha) return { texto: NEUTRO, origen: "neutro" };
  const detalle = ficha.descripcion.split(",")[0]!.trim();
  const largo = `${ficha.prenda} beige, ${detalle.charAt(0).toLowerCase()}${detalle.slice(1)}`;
  return { texto: largo.length <= MAX_EJEMPLO_LIQUIDACION ? largo : `${ficha.prenda} beige`, origen: "categoria" };
}
