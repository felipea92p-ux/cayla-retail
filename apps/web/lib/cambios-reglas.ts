// Reglas puras de Cambios — sin `createClient`, cero dependencia de servidor, mismo
// patrón que `vender-reglas.ts`: `CambioFormV2` y `CambiosLista` son componentes
// cliente y necesitan esto como VALOR.
//
// Por qué existe (2026-09-16): el formulario identificaba "la prenda que se vendió"
// buscando en el catálogo la primera variante con el mismo `sku`. Las prendas del censo
// (`crear_producto_con_variantes`) nacen SIN sku, y el sku nulo viajaba como "" — así
// que con dos prendas nuevas en el catálogo, "" calzaba con la PRIMERA de ellas: se
// escondía una prenda que no tenía nada que ver y la vendida aparecía como opción de
// cambio por sí misma. La identidad de una prenda es su `varianteId`; el código es solo
// lo que se lee.

/** Lo que se imprime en la etiqueta y lee la pistola: `variantes.codigo`, autogenerado
 *  por el disparador `variantes_asignar_codigo`. El `sku` es legado (antes del
 *  2026-09-09) y queda solo como respaldo para una variante vieja sin código. */
export function codigoPrenda(v: { codigo: string | null; sku: string | null }): string {
  return v.codigo || v.sku || "sin código";
}

/** Qué se le puede entregar a la clienta en lugar de la prenda vendida: cualquier
 *  variante que NO sea la vendida (cambiarla por sí misma no tiene sentido) y que tenga
 *  stock en esta sede — no se ofrece lo que `registrar_cambio()` va a rechazar por falta
 *  de stock, mismo criterio que el POS y "Mover mercadería" (2026-09-14). */
export function opcionesDeCambio<T extends { varianteId: string; stockAqui: number }>(
  catalogo: T[],
  varianteVendidaId: string
): T[] {
  return catalogo.filter((v) => v.varianteId !== varianteVendidaId && v.stockAqui > 0);
}
