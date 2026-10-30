/**
 * Las dos prendas de las pruebas de CLAURE (A, que pasa a ser de CLAURE; B, que sigue de CAYLA), elegidas entre las que NO tienen historia comercial.
 *
 * EL PROBLEMA (2026-10-30). Cada prueba de CLAURE tomaba «la primera variante por id» y marcaba su PRODUCTO entero como de CLAURE
 * (`update retail.productos set empresa_id = …`). Pero de quién es una línea vendida se decide por su producto (`fn_dueno_de_la_linea`), así que
 * si la base ya traía una venta, una devolución o una anulación de OTRA talla de ese producto, al marcarlo esa historia también pasaba a ser de
 * CLAURE y salía de las cifras de CAYLA: lo que la prueba mide «por diferencia» daba de menos. En el CI los ids son al azar y cada tanda deja
 * datos distintos, así que pasaba o fallaba según qué prenda tocara: `pruebas:claure-perdidas-y-danadas` esperaba `3|1` y salía `2|1`;
 * `pruebas:claure-fuera-de-las-cifras`, 192,90 de CLAURE donde iban 118,00 (en `main` y en los PR, el mismo día). Se reprodujo en local creando
 * una devolución dañada de hoy de otra talla del producto elegido: mismo `2|1`.
 *
 * QUÉ PROMETE. Las prendas elegidas son MERCADERÍA de verdad (talla activa con precio, producto activo, no de prueba, con una categoría que
 * entra a los motores: lo que Pérdidas, el Diario y Análisis cuentan) y de productos sin ninguna línea de venta, apartado, pedido web, cambio
 * ni prenda dañada, y sin movimientos que no sean de entrada (una merma vieja cambiaría «mermas sin costo» al poner el costo en 0). Lo que la
 * prueba arma encima es lo único que hay de ellas. Sigue siendo determinista: la primera por id entre las limpias. Si no queda ninguna, `\gset`
 * no recibe filas y psql falla en voz alta (nunca se prueba sobre una prenda sucia en silencio).
 * Lo de «mercadería»: la primera prenda limpia por id resultó ser un borrador sin categoría, apagado y a S/ 0, que Pérdidas no lista.
 */

/** La talla de `va` es mercadería y ninguna talla de su producto tiene historia comercial (la condición, para sumarla a un `where` con el alias `va`). */
export const PRODUCTO_SIN_HISTORIA = `va.activo and va.precio > 0
  and exists (select 1 from retail.productos pr_l
               where pr_l.id = va.producto_id and pr_l.estado = 'activo' and not pr_l.es_prueba
                 and pr_l.categoria_id is not null and retail.fn_categoria_entra_a_motores(pr_l.categoria_id))
  and not exists (
  select 1 from retail.variantes h
   where h.producto_id = va.producto_id
     and (exists (select 1 from retail.venta_items x where x.variante_id = h.id)
          or exists (select 1 from retail.separacion_items x where x.variante_id = h.id)
          or exists (select 1 from retail.apartados x where x.variante_id = h.id)
          or exists (select 1 from retail.pedido_web_lineas x where x.variante_id = h.id)
          or exists (select 1 from retail.cambio_salidas x where x.variante_id = h.id)
          or exists (select 1 from retail.prendas_danadas x where x.variante_id = h.id)
          or exists (select 1 from retail.movimientos x where x.variante_id = h.id and x.tipo <> 'entrada')))`;

/** La prenda A (`:va_a`, de su producto `:p_a`). */
export const ELEGIR_A = `select va.id as va_a, va.producto_id as p_a from retail.variantes va where ${PRODUCTO_SIN_HISTORIA} order by va.id limit 1 \\gset`;

/** La prenda B (`:va_b`), de otro producto que A. */
export const ELEGIR_B = `select va.id as va_b from retail.variantes va where va.producto_id <> :'p_a' and ${PRODUCTO_SIN_HISTORIA} order by va.id limit 1 \\gset`;

/** La prenda B con su producto (`:va_b`, `:p_b`). */
export const ELEGIR_B_CON_PRODUCTO = `select va.id as va_b, va.producto_id as p_b from retail.variantes va where va.producto_id <> :'p_a' and ${PRODUCTO_SIN_HISTORIA} order by va.id limit 1 \\gset`;
