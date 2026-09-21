# ADR-0144 — El historial de ventas vive en Ventas ▸ Historial y se lee sin función nueva en la base

**Fecha:** 2026-09-21
**Estado:** Aceptado e **implementado en local** (rama `claude/sales-history-placement-5a443d`, sin publicar). Verificado con la base local real
(8 pruebas de integración, como líder y como colaboradora) y con una vista previa de datos inventados en cuatro anchos. **No hay migración:
no hay nada que pegar en producción.**
**Decide:** el análisis de ubicación es de este documento; quien pidió el trabajo lo aprobó el 2026-09-21 («me parece bien, construye eso»).
Las dos decisiones de negocio las confirmó el mismo día (ver «Decisiones de negocio»).
**Afecta:** ruta nueva `/vender/historial`; el lateral (grupo Ventas: una entrada más); `lib/ventas-historial.ts` y
`lib/ventas-historial-reglas.ts`; tres componentes. **Ningún cambio de esquema, de función ni de política.**

## Contexto — el problema

No había dónde ver «todas las ventas de esta tienda —o de todas— en un rango de fechas». Lo dejaron dicho dos veces: `lib/ventas-v2.ts`
(«no es la pantalla de "historial de ventas" completa: esa sigue diferida») y el ADR-0052 («sigue sin haber una pantalla para "todas las
ventas de esta sede en este rango de fechas"»). Cada pantalla que hoy toca ventas mira **otra cosa**:

| Pantalla | Su unidad | Por qué no sirve como historial |
|---|---|---|
| Punto de Venta | el cobro de hoy | es para cobrar; solo hoy y solo su tienda |
| Caja e Historial de cierres | el turno (dinero contado) | 60 cierres; hay que saber en qué turno buscar |
| Cambios y Devoluciones | una prenda sobre la que actuar | 30 ventas de 15 días; búsqueda con tope de 20 |
| Facturación (solo líder) | el comprobante | una venta sin boleta (R-15) no aparece; solo comprobantes del mes; está en rediseño (ADR-0124) |
| Inventario ▸ Movimientos | el movimiento de stock | 464 movimientos frente a 9 ventas (foto de producción del 19-sep) |

Ninguna tiene **la venta** como unidad. Encontrar una venta vieja exigía conocer su turno, su comprobante o su prenda.

## Decisión

**Una pantalla propia, «Historial», en el grupo Ventas del lateral (`/vender/historial`), entre Caja y Cambios. La ve todo el equipo: la
RLS de `ventas` (`fn_puede_operar_ubicacion`) acota a cada quien su tienda y el líder ve todas. Se lee con PostgREST sobre las tablas que ya
existen; no se crea ninguna función en la base.**

Historial es para las ventas lo que Movimientos es para el stock: el libro donde todo queda escrito y que no se edita. Va después de Caja
(se lee tras cobrar y cuadrar) y antes de Cambios y Devoluciones (de ahí se pasa a corregir).

### Qué muestra

- **Filtros en la URL** (`rango`, `desde`, `hasta`, `sede`, `vendedor`, `estado`, `pago`, `comp`, `cursor`): se comparten y «atrás»
  funciona. Sin nada rige «últimos 30 días» y el botón aparece apretado. `sede` y `vendedor` solo los honra un líder.
- **Una fila por venta**, agrupada por día de Lima: hora y tienda, prendas (con clienta y vendedor debajo), comprobante con su estado, total
  con la forma de pago debajo. Tocarla abre el detalle de siempre (`DetalleVentaModal`: prendas, pagos, vuelto y reimpresión).
- **Tres cifras del rango completo, no de la página:** vendido, ticket promedio y anuladas.
- **Una venta anulada se ve** (tachada, con chip «Anulada») **y no suma** a lo vendido ni al ticket. Sigue en el libro: una venta no se borra.

### Decisiones de diseño

1. **Sin función nueva.** Producción tiene `ventas`, `venta_items`, `venta_pagos` y `comprobantes` **idénticas a las locales**, con la misma
   RLS y la FK `comprobantes_venta_id_fkey` (comprobado en solo lectura el 2026-09-21, columna por columna). Una RPC nueva habría sido un
   cambio de esquema en producción; con el volumen actual (16 ventas) no hace falta.
2. **No se parametriza `fn_ventas_del_dia`.** Está fija a hoy (`where …::date = now()::date`), no devuelve ni filtra `ventas.estado` (una
   venta anulada hoy cuenta completa en «Vendido hoy») y es justo la función que el rediseño de Facturación espera migrar con OK de
   Felipe: tocarla acá era chocar con esa rama.
3. **Filtros por pago y por comprobante con un embed de alias** (`pago_filtro`, `comp_filtro`) aparte del que se dibuja. `!inner` deja solo las
   ventas que cumplen, pero también recorta las líneas del embed donde se aplica: una venta pagada mitad efectivo y mitad Yape, filtrada por
   efectivo, mostraría solo la mitad. «Sin comprobante» es un anti-join (`is.null` sobre el embed con `!left`); una **nota de crédito no cuenta**
   como comprobante de la venta. Los dos se probaron contra la base local y contados a mano (11 = 11; 21 + 2 = 23).
4. **Días de Lima.** `desde`/`hasta` son días de Lima inclusivos; a la base va un intervalo `[desde, hasta)` en UTC (`limitesUTC`). Sin esto,
   una venta de las 9 p. m. caería en el día siguiente.
5. **Cursor `(created_at, id)`** con `.or()` y el timestamp tal como lo devuelve PostgREST (con microsegundos): estable aunque dos ventas
   compartan instante. Se pide una fila de más para saber si hay página siguiente, sin un `count` aparte.
6. **Totales con tope de 1000 ventas** (`TOPE_TOTALES`): PostgREST corta en 1000 filas, y un total parcial que no avisa es peor que ninguno.
   Pasado el tope la tarjeta dice «acota el rango» en vez de mostrar una cifra a medias.
7. **Lista y totales comparten la misma consulta base** (`consulta()`), para que nunca filtren distinto.
8. **Reuso, no copia:** período, cursor y etiquetas de día de Movimientos; `PaginacionCursor`; `Tabla`; `TarjetaCifra`; `Chip`;
   `DetalleVentaModal`; `nombreCortoSede`. Lo nuevo son las reglas de ventas y la barra de filtros.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Una quinta vista dentro de Facturación | su unidad es el comprobante (una venta sin boleta no aparece), es solo líder (la encargada no podría buscar una venta de su tienda) y su spec de cuatro vistas ya está aprobado |
| Pestaña «Ventas» en Caja ▸ Historial | Caja mira el turno y es de una tienda; mezclaría dinero contado con registro de ventas |
| Agregarlo a Inventario ▸ Movimientos | la unidad es el movimiento de stock por prenda, no el cobro |
| Parametrizar `fn_ventas_del_dia` | ver decisión 2 |
| RPC nueva `fn_ventas_historial` (lista + totales exactos) | mejor a gran volumen, pero es una migración en producción; queda como salida si algún rango supera el tope |

## Consecuencias y límites conocidos

- **Tope de totales: 1000 ventas por rango.** Hoy producción tiene 16. Si un rango lo supera, el camino es una RPC de agregados
  (migración con OK).
- **Sin búsqueda de texto** (boleta, DNI, clienta, prenda) todavía. La lógica existe en `ventas-v2.ts` (`buscarVentas`, hoy interna) y sirve
  a Cambios y Devoluciones; sumarla acá es un paso siguiente.
- **El filtro por vendedor** sale de `getColaboradores()` (`fn_colaboradores`, ya en producción); si esa lectura falla, desaparece el
  filtro y el historial sigue. «Vendedor» es quien registró la venta en caja, no necesariamente quien atendió (R-17).
- **Sin enlaces «Ver historial →»** desde las listas «de hoy» (Caja, Punto de Venta, Facturación) ni desde el detalle de un cierre de caja:
  esas pantallas están en rediseño en otras ramas y esta no las toca.
- **Local vs producción:** idénticos en todo lo que esta pantalla lee. La base local **no** tiene aún 8 migraciones recientes de `main`
  (caja, producción, notas de crédito); ninguna toca estas tablas.

## Decisiones de negocio (confirmadas el 2026-09-21)

1. **Cada quien ve su tienda; el líder ve todas.** («Sí, cada quien en su tienda».) Es lo que ya hace la pantalla: la RLS acota a la
   tienda de la persona y solo el líder tiene los selectores de tienda y de vendedor.
2. **El historial no incluye ventas de antes del ERP.** («No incluye ventas de antes».) Es lo registrado aquí. Si algún día se cargaran
   ventas de otro sistema, sería otro trabajo con su propio ADR: habría que cargarlas sin tocar stock ni cajas, o se descuadra el
   inventario de hoy.

## Addendum 2026-09-21 — el look

A pedido de quien encargó la pantalla («guiándote de las demás vistas de ventas y de catálogo, más futurista y sofisticado, manteniendo la
línea de las pantallas de ventas»), el aspecto se rehízo con la línea Atelier de Cambios, Devoluciones y Caja (ADR-0123) y los filtros de
Catálogo. Facturación no fue referencia (está en rediseño aparte). **Reemplaza la descripción de las tres tarjetas de arriba.** No cambia el
lugar, los permisos ni el esquema; no se agregó ninguna clase de CSS (ADR-0105): solo las que ya existen, con su apagado por
`prefers-reduced-motion`.

- **Cabecera:** `EncabezadoPagina` con `ResumenSede` a la derecha —vendido y ventas—, como en Cambios y Devoluciones. El ticket promedio
  pasó a la tarjeta del trazo (con tres cifras el resumen no cabía junto al título a 1440 px).
- **El trazo del período** (`HistorialVentasPulso`): lo vendido día por día dibujado como un **hilo** taupe que se traza una vez al llegar
  (`anim-trazo`), con un nudo en el mejor día —el mismo nudo de la línea de tiempo— y debajo la mezcla de pagos (barra con los colores de
  método, que son dato y no marca). SVG y CSS puros, sin librería de gráficos. Es lo único «audaz»; todo lo demás es quieto.
- **Lista:** línea de tiempo con el hilo taupe y un nudo por día (como `ComprasAgrupadas`); una hoja de papel por día; cada venta con un
  racimo de miniaturas, título serif con los nombres de las prendas, una línea chica (hora · tienda · clienta · vendedor), comprobante con
  su estado y total con la forma de pago. **El total de cada día es el del día completo** (sale de la serie de todo el rango), no el de las
  filas de la página: un día partido entre dos páginas muestra lo mismo en las dos.
- **Miniaturas:** la foto del color vendido si existe (mismo criterio que el catálogo) y, si no, un mosaico de ese color. En producción
  solo 5 de las 17 prendas vendidas tienen foto de su color (en local, ninguna), pero los 35 colores tienen su tono: el color es la
  identidad segura.
- **Filtros:** los atajos de período (7/30/90 días o fechas propias) a la vista y un botón «Filtros · N» con el panel de píldoras de
  Catálogo (tienda, vendedor, pago, estado, comprobante) y un chip por cada filtro aplicado.
- **Datos:** la consulta de totales (misma, con el mismo tope de 1000) ahora también entrega `porDia` y `porMetodo`; pasado el tope no se
  dibujan y la tarjeta lo dice. La lista pide además `color_codigo`, `colores.hex` y `producto_fotos` (ya existen en producción).
- **Anchos:** en celular (<640 px) racimo y texto arriba y, debajo, comprobante y total; de 640 a 1279 px el total arriba a la derecha y el
  comprobante en una segunda línea; cuatro columnas solo desde 1280 px (a 1024 px el contenido útil mide ~650 y el título se quedaba en ~130).

## Verificación

- `ventas-historial-reglas.test.ts`: 25 pruebas (límites de día en hora de Lima, filtros de la URL por rol, importes sin ruido de
  decimales, comprobante elegido entre varios, anuladas fuera de los totales). Suite completa: 1784/1784. `tsc` y `eslint` limpios.
- **8 pruebas de integración** (temporales, no versionadas) ejecutaron `ventas-historial.ts` **real** contra la base local con un JWT local, como
  líder y como colaboradora, y compararon con SQL independiente: paginado sin perder ni repetir (23 = 23, mismo orden), totales = suma SQL sin
  anuladas, filtros de pago/comprobante/tienda/estado, límites de día de Lima, y la colaboradora limitada a su tienda (1 de 23).
- **Producción, solo lectura, 2026-09-21:** columnas, RLS (`ventas_select`, `venta_items_select`, `venta_pagos_select`, `comprobantes_select`),
  FKs y funciones (`fn_nombres_personas`, `fn_colaboradores`, `fn_puede_operar_ubicacion`) idénticas o presentes. `pnpm datos:comparar` no
  marca ninguna función de esta pantalla.
- **Vista previa con datos inventados** (ruta temporal, borrada) en 1440, 1024, 768 y 390 px: sin desborde horizontal; se corrigió una
  tabla de seis columnas que pedía 860 px cuando el contenido útil mide ~650 px a 1024 px de ventana.
- **Falta:** abrir `/vender/historial` con una sesión real (líder e integrante) en el navegador. Las pruebas cubren la lectura y la interfaz
  por separado; recorrerlas juntas con sesión es el paso que no se pudo hacer sin las credenciales de nadie.
