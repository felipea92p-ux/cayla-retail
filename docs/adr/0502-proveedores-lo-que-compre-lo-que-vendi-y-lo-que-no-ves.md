# ADR-0502 — Proveedores: lo que le compré, lo que vendí y «Lo que quizá no ves»

- **Fecha:** 2026-10-24 · **Estado:** construido y probado en local; **su primera migración `20261024221000_proveedor_prendas_compradas_y_vendidas.sql` ya está pegada en producción el 2026-10-24; la segunda, `20261024231000_proveedor_prendas_origen_compras_y_carga.sql` (ver «Actualización 2026-10-24 (b)»), la reemplaza y NO está pegada** (una parte, solo lectura; con `apply_migration`, así que su versión allá es la de la hora en que se aplicó). La web se publica DESPUÉS de la base: sin la función, la ficha y la lista se pintan como antes. Verificada con datos reales: 335 filas (proveedor, prenda) de 52 proveedores; Textil Anqori sale con 138 compradas (51 estimadas), 19 vendidas, 115 en stock y 42 % de margen.
- **Relacionados:** ADR-0111 (ficha de proveedor), ADR-0387 (el módulo Proveedores es la llave del dinero), ADR-0161 (módulos y roles), ADR-0358 (una función, una pieza), ADR-0389 (guías interactivas), ADR-0195 (políticas y deadlocks).

## El problema

Proveedores era un directorio con facturas: quién es, cuánto se le debe, cuándo entrega. No decía lo que importa para comprar bien: **cuánto le compré, cuánto gasté, cuánto de eso ya se vendió y con qué margen**. Y nada interpretaba esos números por el dueño.

## Lo que se decidió

1. **«Compré» = el mayor entre las entradas de inventario y (vendido + stock actual), prenda a prenda, al costo vigente de la prenda; lo que sobra sobre las entradas se marca «estimado»** (Felipe 2026-10-24). Cuando una entrada viene de una línea de factura vigente, esa línea manda y es exacta. No cuentan cambios, devoluciones, traslados ni lo que fabrica el Taller.
   Por qué no solo entradas: en producción las 9 facturas no tienen líneas con unidades, y parte de la mercadería llegó sin quedar como entrada (Textil Anqori: 87 entradas, 115 en stock y 19 vendidas).
2. **Una sola cuenta en la base.** `fn_proveedor_prendas_base` (sin permiso para nadie) calcula por (proveedor, prenda); tres lecturas con la llave `fn_ve_plata_de_proveedores()`: `fn_proveedor_prendas` (ficha), `fn_proveedores_rendimiento` (ranking) y `fn_proveedores_prendas` (filas para el análisis). Excluye la «Prenda sin registrar» (centinela, ADR-0179).
3. **Ficha:** sección «Lo que le compré» (cifras: unidades, plata, ya vendido, margen, sin vender; una tarjeta por marca con su tabla por prenda).
   **Lista:** «A quién le compro y qué me deja» (ranking por gasto con una palabra: Rinde / Plata parada / Margen bajo / Pocas ventas).
4. **«Lo que quizá no ves»:** avisos de reglas puras y probadas (`lib/proveedor-analisis-reglas.ts`), sin IA generativa: mismas cifras, mismos avisos. Cada uno trae su «¿Por qué?» con los números y la regla. Con menos de 10 unidades vendidas no se concluye nada. Una prenda que llegó hace menos de 21 días no se juzga.
5. **Los umbrales son reglas de negocio de Felipe**, todos con nombre al inicio de `proveedor-analisis-reglas.ts` (21 días, S/ 1,000 parados, 40 %, 7 puntos de margen, 10 unidades, 60 % vendido, 26 semanas, 40 % de dependencia). Se cambian en un solo lugar.

## Lo que NO hace

- No escribe nada ni cambia stock, precios o movimientos.
- No separa al Taller («CAYLA SAC» es un proveedor más hoy): lo resuelve el tipo de proveedor (Mercadería / Servicios), otra sesión.
- El costo es el vigente de la prenda, no el de cada compra: la evolución real llegará con facturas con líneas.
- No muestra la foto de la prenda ni el cumplimiento de entrega (hay solo 9 facturas).

## Cómo se verifica

`lib/proveedor-prendas-reglas.test.ts` y `lib/proveedor-analisis-reglas.test.ts`; pantallas en el navegador local (ficha y lista) a 1440 y ancho de tarjeta angosto; `lib/guias.test.ts` con sus pasos y huella. Pendiente: verla con datos de producción tras pegar la migración, y a 375 px.

## Actualización 2026-10-24 (b): dos orígenes, Taller aparte, costo de la carga y vendidas netas

Decidido por Felipe en una sesión hermana («Sí: aplica el diseño con origen Compras vs Carga inicial, Taller aparte, y empieza la actividad 1»), a partir de lo que dijo: Compras se termina en paralelo y entra en uso en unos días; hoy todo el inventario vino por cargas iniciales y «muchas veces hasta se distorsionaron los costos porque no había una correcta comunicación con el área de compras». **Reemplaza la definición de «compré» del punto 1** (el mayor entre entradas y vendido + stock, todo sumado). Migración nueva `20261024231000_proveedor_prendas_origen_compras_y_carga.sql` (la primera, `20261024221000`, ya estaba pegada en producción; esta la sustituye y **no está pegada**).

1. **Dos orígenes que nunca se suman a escondidas.**
   - **Compras (exacto):** entradas con motivo `recepcion`. Con factura (`compra_item_id`, compra vigente): proveedor y costo de la línea. Sin factura (un envío sin guía): proveedor del lote (`lotes.proveedor_id`) y costo de `costo_historial.costo_unitario_nuevo` de ese movimiento, contado aparte como «sin factura». Se atribuye al proveedor de la factura o del lote, no al habitual de la prenda.
   - **Carga inicial (estimado):** solo para prendas cuyo habitual es el proveedor, por variante: `greatest(entradas carga_inicial, vendido neto + stock − todo lo recibido por recepcion)`.
2. **Costo de la carga, no el vigente:** el `costo_anterior` del PRIMER registro de `costo_historial` de la variante o, si nunca cambió, `variantes.costo`. Al recibir se PROMEDIA `variantes.costo` (ADR-0362): el vigente mezclaría el costo distorsionado con el real.
3. **Vendidas netas desde `movimientos`** (salidas venta o cambio, menos entradas cambio, devolucion o anulacion_venta), para que cuadren con el stock y no cuenten dos veces una prenda devuelta. El ingreso y el costo de lo vendido siguen saliendo de `venta_items` (ventas completadas, no de prueba).
4. **Unidades vs dinero.** Lo de unidades (vendidas, rotación, sin venta) vale para los dos orígenes. Lo de dinero (margen, plata parada en soles, «Margen bajo», dependencia) solo con lo que tiene costo real (origen Compras). **Con la carga inicial como mayoría se dice «Costo por confirmar»** en lugar del veredicto de dinero. El umbral «tiene costo real» es `COSTO_REAL_MIN_PCT = 50` (mitad o más de lo comprado llegó por Compras): **lo puse yo; es regla de negocio de Felipe y se cambia en un solo lugar** (`proveedor-prendas-reglas.ts`).
5. **Ficha:** los dos bloques por separado («Llegó por Compras · exacto» / «De la carga inicial · estimado») y una `BarraApilada` «X % de lo que tienes de este proveedor ya tiene costo real» (hoy 0 % en todos; sube sola con Compras).
6. **Taller aparte:** «CAYLA SAC» (la producción propia) queda fuera del ranking y de los avisos y sale como una fila de resumen al final («Producción propia: X % del gasto…»). **Se reconoce por su nombre** (`retail.fn_proveedor_es_taller`, un solo lugar) porque no existe una marca de «Taller» en `proveedores`; cuando exista el tipo de proveedor, se cambia ahí.
7. **Prueba de Postgres del enlace con Compras:** `scripts/pruebas/proveedor_prendas_origen.mjs` (en la lista `PRUEBAS` del CI): una compra registrada y recibida cuenta como origen Compras con el costo de su factura y para el proveedor de la factura; una entrada sin factura cuenta aparte con el costo del historial; y vigila que `fn_recepcion_entrar` siga escribiendo `compra_item_id` en la entrada que deja. **Límite:** no maneja el despacho entero (`fn_recepcion_entrar` exige un despacho, órdenes y conteos); inserta la entrada tal como esa función la escribe y comprueba por texto que la función sigue haciéndolo. Si Compras cambia el enlace, el texto deja de coincidir y el CI se pone rojo.

**Lo que no cambió:** es solo lectura; la llave sigue siendo `fn_ve_plata_de_proveedores()`; los umbrales de los avisos siguen siendo de Felipe.
