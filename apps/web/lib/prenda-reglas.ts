// Reglas puras sobre CÓMO SE NOMBRA una prenda en pantalla — sin `createClient`, cero
// dependencia de servidor: Vender, Cambios, Devoluciones y Anular venta son componentes
// cliente y necesitan esto como VALOR.
//
// Por qué es un módulo propio (2026-09-16): nació en `cambios-reglas.ts`, pero la misma
// pregunta —«¿qué código le muestro a la colaboradora?»— la hacen todos los flujos que
// pintan una prenda vendida. Dejarla en Cambios obligaba a Vender a importar reglas de
// Cambios, y la próxima pantalla que la necesitara iba a copiarla con otro orden.

/** Lo que se imprime en la etiqueta y lee la pistola: `variantes.codigo`, autogenerado
 *  por el disparador `variantes_asignar_codigo`. El `sku` es legado (antes del
 *  2026-09-09) y queda solo como respaldo para una variante vieja sin código. Las
 *  prendas del censo (`crear_producto_con_variantes`) nacen SIN sku: pintar `sku`
 *  directo deja un hueco vacío justo donde la colaboradora busca qué talla/color es.
 *  Solo se MUESTRA — para identificar una prenda se compara `varianteId`, nunca esto. */
export function codigoPrenda(v: { codigo: string | null; sku: string | null }): string {
  return v.codigo || v.sku || "sin código";
}
