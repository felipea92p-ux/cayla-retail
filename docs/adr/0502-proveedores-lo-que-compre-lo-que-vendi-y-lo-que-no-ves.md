# ADR-0502 — Proveedores: lo que le compré, lo que vendí y «Lo que quizá no ves»

- **Fecha:** 2026-10-24 · **Estado:** construido y probado en local; **su primera migración `20261024221000_proveedor_prendas_compradas_y_vendidas.sql` ya está pegada en producción el 2026-10-24; la segunda, `20261024231000_proveedor_prendas_origen_compras_y_carga.sql` (ver «Actualización 2026-10-24 (b)»), la reemplaza y también está pegada en producción desde el 2026-10-24** (una parte, solo lectura; con `apply_migration`, así que su versión allá es la de la hora en que se aplicó). La web se publica DESPUÉS de la base: sin la función, la ficha y la lista se pintan como antes. Verificada con datos reales: 335 filas (proveedor, prenda) de 52 proveedores; Textil Anqori sale con 138 compradas (51 estimadas), 19 vendidas, 115 en stock y 42 % de margen.
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
5. **Los umbrales son reglas de negocio de Felipe**, todos con nombre al inicio de `proveedor-analisis-reglas.ts`. Se cambian en un solo lugar. Los de hoy están en «Actualización 2026-10-24 (c)».

## Lo que NO hace

- No escribe nada ni cambia stock, precios o movimientos.
- No separa al Taller («CAYLA SAC» es un proveedor más hoy): lo resuelve el tipo de proveedor (Mercadería / Servicios), otra sesión.
- El costo es el vigente de la prenda, no el de cada compra: la evolución real llegará con facturas con líneas.
- No muestra la foto de la prenda ni el cumplimiento de entrega (hay solo 9 facturas).

## Cómo se verifica

`lib/proveedor-prendas-reglas.test.ts` y `lib/proveedor-analisis-reglas.test.ts`; pantallas en el navegador local (ficha y lista) a 1440 y ancho de tarjeta angosto; `lib/guias.test.ts` con sus pasos y huella. Pendiente: verla con datos de producción tras pegar la migración, y a 375 px.

## Actualización 2026-10-24 (b): dos orígenes, Taller aparte, costo de la carga y vendidas netas

Decidido por Felipe en una sesión hermana («Sí: aplica el diseño con origen Compras vs Carga inicial, Taller aparte, y empieza la actividad 1»), a partir de lo que dijo: Compras se termina en paralelo y entra en uso en unos días; hoy todo el inventario vino por cargas iniciales y «muchas veces hasta se distorsionaron los costos porque no había una correcta comunicación con el área de compras». **Reemplaza la definición de «compré» del punto 1** (el mayor entre entradas y vendido + stock, todo sumado). Migración nueva `20261024231000_proveedor_prendas_origen_compras_y_carga.sql` (la primera, `20261024221000`, ya estaba pegada en producción; esta la sustituye y **también está pegada, 2026-10-24**).

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

## Actualización 2026-10-24 (c): umbrales nuevos y el ritmo en unidades

Felipe aprobó las recomendaciones de umbrales de una sesión hermana («Sí: pásale a la sesión de proveedores tus recomendaciones de umbrales tal como están»), después de aplicarlas a los proveedores reales con los datos de producción. **Motivo:** con los umbrales de antes, Lasak Store (183 compradas, 6 vendidas, 11 de 12 modelos con 0–1 ventas) no recibía ningún aviso: la exigencia de 10 ventas lo callaba justo por no vender, y «plata parada» solo contaba prendas con 0 ventas.

| Umbral | Antes | Ahora |
|---|---|---|
| `DIAS_PARA_JUZGAR` | 21 | 21 (se queda) |
| `PLATA_PARADA_MIN` | S/ 1,000 | **S/ 500** (Jacard: S/ 825 en 4 prendas) |
| «Frenar» en la lista | `PARADO_PCT` (40 % de lo gastado parado) | **ritmo en unidades**; se elimina `PARADO_PCT` en el análisis |
| `MIN_COMPRADAS` | — | **20** unidades compradas para hablar de ritmo |
| `SEMANAS_STOCK_LARGO` | 26 | **16** (una temporada) |
| `PUNTOS_MARGEN_BAJO` | 7 | 7 (se queda; es de dinero: solo con origen Compras) |
| `MIN_VENDIDAS` | 10 para todo | **10 solo para conclusiones de margen** (margen bajo, vuelve a comprarle) |
| «Vuelve a comprarle» | `VENDIDO_BUENO_PCT` (60 % vendido) | **agota lo que le queda en ≤ `SEMANAS_AGOTA` = 6 semanas**, con 10 vendidas y margen ≥ promedio; se elimina `VENDIDO_BUENO_PCT` |
| `DEPENDENCIA_PCT` | 40 | **25** (hoy no cambia nada: el mayor externo pesa ~9 %) |
| Prenda estrella (≥ 3 vendidas y ≥ 40 % de margen) | — | se queda |

**Una sola función de ritmo** (`ritmoDe`, pura): semanas que tardaría en venderse lo que queda, al ritmo actual desde la primera entrada. La usan el aviso «ritmo» de la ficha y «frenar» de la lista, para que no se contradigan. No exige un mínimo de ventas: con 0 o pocas, el ritmo es lento por definición; si no vendió nada, cuenta como lento cuando lleva ≥ 21 días en la tienda. Es de unidades: **vale para los dos orígenes, carga inicial incluida**. El Taller no entra. Casos esperados en producción (semanas): Lasak 99, Textil Anqori 22, Alex William Sevilla 22, Corporaciones Wayi 19, Marisol Bellido 17.

**Decisión sobre «vuelve a comprarle» sin margen confiable** (la dejó abierta la sesión que propuso los umbrales): con el costo por confirmar **no se recomienda comprar** (no se conoce lo que deja); sale un aviso distinto, **«se vende rápido: se agota en N semanas (margen por confirmar)»**, que dice que se mire el margen antes de reponer. «Vuelve a comprarle» sale solo con costo real y margen igual o mayor al promedio de la cartera. Así un proveedor que vende rápido no queda invisible, pero tampoco se recomienda gastar con costos que pudieron distorsionarse.

**Pruebas** (`lib/proveedor-analisis-reglas.test.ts`): el caso Lasak (carga inicial, avisa «frenar» sin exigir 10 ventas y sin nombrar plata), el caso Jacard (S/ 825 con costo real avisa en plata; los mismos 33 sin vender con costo de carga avisan en unidades, desde 30), el caso Deyner (406 compradas, 193 vendidas, 204 en estantes: «se agota pronto» con el costo por confirmar y «vuelve a comprarle» con costo real y margen ≥ promedio), la unión de la ficha y la lista en una sola regla, y el mínimo de 20 unidades.

**Lo que no cambió:** el veredicto de una palabra del ranking («Plata parada» a partir del 40 % de lo gastado por Compras, «Margen bajo», «Rinde») conserva sus umbrales; solo los avisos de «Lo que quizá no ves» cambiaron.

## Actualización 2026-10-24 (d): el ranking y el aviso de «frenar» usan la misma regla de ritmo

**El problema (Felipe lo vio con Lasak Store, 6 vendidas de 183):** el aviso de la lista decía «frena: vender lo que le queda tardaría unas 99 semanas» mientras el veredicto del ranking decía «Pocas ventas». Eran dos reglas distintas para lo mismo: el veredicto miraba solo cuántas unidades se habían vendido (menos de 10) y el aviso, el ritmo.

**Lo que se decidió:**
1. **Una sola regla de ritmo** en `lib/proveedor-ritmo-reglas.ts` (`ritmoDeDatos`, pura): semanas que tardaría en venderse lo que queda, al ritmo actual. La usan el aviso «ritmo» de la ficha, el aviso «frenar» de la lista y el veredicto del ranking. Sus umbrales (21 días, 20 unidades compradas, 16 semanas, 6 semanas para agotar) viven ahí y se cambian en un solo lugar.
2. **El veredicto del ranking** (`veredictoDe(r, hoy)`) lo evalúa primero: si el ritmo es lento dice **«Rota lento»** (ámbar), aunque haya vendido poco; si no, «Pocas ventas» (menos de 10 vendidas), «Costo por confirmar», «Margen bajo» o «Rinde». **Se elimina el veredicto «Plata parada»** (y `PARADO_PCT`): lo cubre «Rota lento», y la plata sin vender sigue a la vista en su columna.
3. **`fn_proveedores_rendimiento` devuelve dos columnas más** (migración `20261024234000_proveedores_rendimiento_con_ritmo.sql`): `primera_entrada` y `unidades_en_estantes`, que son lo que necesita el ritmo. Solo lectura, misma llave. Con la web nueva y la base de antes, esas dos columnas no llegan y el veredicto no mide el ritmo (cae a lo demás): nada se rompe.
4. **Prueba de que no se contradicen** (`lib/proveedor-analisis-reglas.test.ts`, «UNA SOLA REGLA»): para seis conjuntos de prendas (Lasak, sin ventas, recién llegado, vende rápido, justo en el umbral, poca mercadería), el aviso «frenar» sale si y solo si el veredicto dice «Rota lento».

## Actualización 2026-10-26 (e): las tallas que se llevan y cómo le va en cada sede

**El problema:** la ficha decía cuánto se le compró a un proveedor y cuánto se vendió, pero no qué tallas se llevan (para pedirle mejor repartido, no solo menos) ni en qué sede se venden (lo que en Trujillo tarda una temporada, en Lima puede agotarse en un mes). Felipe pidió las dos cosas el 2026-10-26.

**Lo que decidió Felipe (2026-10-26), entre opciones con lo que se gana y lo que se paga:**
1. **Tallas: la misma regla que Análisis** (`curvaDeTallas`, «Las tallas que se llevan»). Una talla «pide más» si pesa 4 puntos más en lo que vendes que en lo que tienes, y «sobra» si es al revés. El aviso sale con `MIN_VENDIDAS` (10) vendidas del proveedor o más. Cuenta todo lo vendido desde que llegó su ropa, como el resto de la ficha. «Lo que tienes» es todo su stock: tiendas, almacén y Taller.
2. **Sede: «rinde» se mide con el mismo ritmo que el ranking** (`ritmoDeDatos`): semanas que tardaría en venderse lo que queda EN esa sede. Cada tienda cuenta desde que le llegó su primera prenda de ese proveedor, con los mismos 20 unidades y 21 días para medir. Sale «Se agotó», «Se agota», «Rota lento», «Va bien» o «Aún no se mide».
3. **Traslado sugerido con cantidad.** Si una tienda va lenta (16 semanas o más) y otra no tiene para `SEMANAS_COBERTURA_TRASLADO` semanas, se sugiere llevar lo que le falta a la segunda, sin dejar a la primera por debajo de sus propias semanas. Solo se cuentan prendas que la segunda ya vende, empezando por las tallas que más vende. Solo se sugiere: el traslado lo hace una persona en Traslados.

**Los dos números del traslado (propuestos en la sesión y confirmados por Felipe el 2026-10-26; se cambian en un solo lugar, `lib/proveedor-tallas-sedes-reglas.ts`):** `SEMANAS_COBERTURA_TRASLADO = 8` (dos meses de venta que cada tienda se guarda o recibe) y `MIN_TRASLADO = 3` (menos no vale el viaje).

**Cómo:** `fn_proveedor_tallas_sedes(p_proveedor_id)` (migración `20261026193000`, solo lectura, misma llave `fn_ve_plata_de_proveedores()`) devuelve una fila por (prenda, talla, sede): lo vendido neto en esa sede (la misma cuenta de `movimientos` que `fn_proveedor_prendas_base`, por la sede del movimiento), lo que hay hoy y el día en que llegó por primera vez. Las prendas son las mismas que cuenta «Lo que le compré», así la ficha no se contradice. Las cuentas son puras y probadas (`lib/proveedor-tallas-sedes-reglas.test.ts`). Los avisos de tallas y de traslado se suman a «Lo que quizá no ves» con los de lo comprado (`juntarHallazgos`, máximo 5, los más importantes primero).

**Lo que no hace:** no escribe nada ni arma el traslado. No separa por categoría la curva: si un proveedor vende letras (S·M·L) y números (28·30), se compara el sistema que más pesa y la nota lo dice, como en Análisis. No está en la lista de proveedores, solo en la ficha.

**Producción:** pegada el 2026-10-26 (renumerada `20261026193000`; aplicada como `20261026202502`), junto con el reparto entre proveedores que la reemplaza (ADR-0521 act. (c)).

## Actualización 2026-10-26: la lista pasa a ser un ranking (ADR-0521)

El punto 3 («Lista: A quién le compro y qué me deja», con su veredicto en una palabra) lo reemplaza el **ranking de la pestaña Mercadería**
del ADR-0521: del que más le compras al que menos, por prendas o por dinero, con el ritmo en cuatro palabras, la línea de ventas por día y,
a la derecha, «Lo que no se ve a simple vista». `ProveedoresRendimiento.tsx` se borró. Las cuentas son las mismas de este ADR
(`rankingDeProveedores`, `veredictoDe`, `ritmoDeDatos`): el veredicto sigue explicando la insignia en su «¿por qué?».
