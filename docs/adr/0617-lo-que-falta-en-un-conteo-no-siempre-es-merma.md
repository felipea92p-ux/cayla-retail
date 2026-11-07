# ADR-0617 — Lo que falta en un conteo no siempre es merma

- Estado: aceptado (Felipe, 2026-11-06)
- Migración: `supabase/migrations/20261107001000_conteo_cruces_y_vendidas_sin_registrar.sql`
- Prueba: `pnpm pruebas:conteo-explicado` (`scripts/pruebas/conteo_explicado.mjs`)

## El problema

Desde el corte del 1-nov-2026 el diario asienta cada faltante de conteo como merma (6951) y cada sobrante como sobrante (6959).
Al revisar por qué el Resumen de noviembre daba negativo, Felipe vio «mermas» que no eran pérdidas:

1. **La prenda cruzada.** Se vende o se cuenta una talla por otra: el conteo dice «falta la M, sobra la L» del mismo modelo, el
   mismo día. En AQP, 19 de los faltantes de noviembre tenían su sobrante del mismo modelo. Inflaba mermas y sobrantes a la vez.
2. **La venta sin prenda.** Al cobrar sin escanear, la venta saca de la 201 su costo ESTIMADO, pero la prenda sigue en el stock del
   sistema. Cuando el conteo no la encuentra, el diario la sacaba otra vez como merma: el costo se cobraba dos veces.

## La decisión

- **Cruce:** un faltante y un sobrante de conteo del mismo modelo, sede y día se emparejan unidad por unidad, en orden de llegada.
  Ninguno es merma ni sobrante; si sus costos difieren, solo la diferencia se asienta (`merma_cruce` / `sobrante_cruce`). La 201 y
  el resultado quedan igual: cambia lo que se llama merma.
- **Vendida sin registrar:** un faltante de conteo que no se cruzó se empareja con una venta sin prenda cerrada sin prenda de la
  misma sede, categoría, talla y color, vendida ANTES del conteo (la k-ésima con la k-ésima; cada venta una sola vez). Deja de ser
  merma; solo se ajusta el costo de venta a lo real (691 | 201 por real − estimado, regla `venta_sin_registrar`).
- El emparejamiento es global y determinista (`retail.fn_conteo_explicado()`): da lo mismo con cualquier rango. Un mes cerrado lee
  su foto y no cambia.
- La comprobación de la 201 deja de contar como «venta sin prenda» las que un conteo ubicó (su costo ya cuadra contra el stock).

Medido en producción el 2026-11-06 (solo lectura), noviembre: AQP 19 unidades cruzadas y 7 vendidas sin registrar (+S/ 253 al
resultado: el estimado que se cobraba dos veces); TRU 1 y 1 (+S/ 23); LIM 2 cruzadas.

## Se descartó

- **Que el costo entre recién en el conteo** (la venta sin prenda no saca costo): el margen se vería mejor de lo que es hasta contar.
- **Exigir la prenda al cerrar la caja:** es la causa raíz, pero agrega trabajo en cada cierre y no arregla las ~1,200 de antes.
  Sigue abierto como mejora aparte.

## Lo que no cambia

Movimientos, stock y costos no se tocan. La pestaña Pérdidas de Inventario sigue mostrando el faltante del conteo (es lo que pasó en
el piso); la venta sin prenda sigue «cerrada sin prenda».

## Se rompe si

- Se cierra noviembre antes de pegar la migración (su foto queda con las mermas viejas).
- `prendas_por_regularizar` deja de traer categoría, talla o color, o una fila deja de ser una unidad.
- El emparejamiento por talla y color es aproximado: sin el código de la prenda, dos prendas distintas del mismo tipo pueden
  emparejarse. Es aceptable porque el costo se corrige a lo real.
