# ADR-0371 — Las prendas sueltas que se liquidan no entran al catálogo: se etiquetan como «piezas de liquidación»

**Fecha:** 2026-10-10 · **Estado:** aceptado (Felipe, 10 preguntas + «ok»), construido y verificado en local. **En producción desde el
2026-10-10** (OK de Felipe; por el MCP, versión registrada `20261010172258`): las 13 funciones nuevas tienen el mismo md5 que en
local y `registrar_venta` quedó igual a la local salvo una línea de comentario que ya difería antes (la del redondeo, ADR-0311).

## Contexto

En el almacén hay prendas de las que queda una sola unidad, con tiempo guardadas y que nunca entraron al sistema. Se van a
liquidar. Registrarlas como productos (ficha, foto, talla, color) es trabajo perdido: no vuelven. Pero venderlas por fuera deja
la caja sin cuadrar y sin boleta, y venderlas como «Prenda sin registrar» (ADR-0179) le deja a almacén una tarea por cada una.

Lo que decidió Felipe (2026-10-10): cada prenda tiene su precio, que se va bajando con una etiqueta nueva que siempre dice
«LIQUIDACIÓN»; cada sede liquida lo suyo; las etiquetan el líder y las terminales de almacén y caja (el líder les da el módulo);
al venderla queda el monto y la categoría; es venta final, sin cambio ni devolución; cuenta como venta normal; no lleva otros
descuentos; y hay un precio mínimo (S/ 10) bajo el cual solo un líder etiqueta.

## Decisión

1. **Una «pieza de liquidación» no es un producto.** Es una fila de `retail.piezas_liquidacion` con su sede, su categoría y su
   precio, y una etiqueta en `retail.piezas_liquidacion_etiquetas` con un código corto (`LQ` + 6, sin 0/O ni 1/I). No toca
   `stock` ni `movimientos`: nunca estuvo en el inventario.
2. **Cambiar el precio imprime una etiqueta nueva con otro código, y la vieja deja de valer.** Un índice único deja una sola
   vigente por pieza. Así una etiqueta vieja olvidada en la prenda nunca cobra el precio de antes.
3. **La caja la vende escaneando el código** (pistola, cámara o tecleado) como una línea de la variante centinela de «Prenda
   sin registrar», con `pieza_liquidacion_codigo`. `registrar_venta` (dos reemplazos anclados) la valida contra la etiqueta
   vigente (`fn_validar_linea_liquidacion`: misma sede, disponible, precio exacto, sin descuento ni regalo del club) y, en vez de
   dejarla en la cola de almacén, la marca vendida (`fn_vender_pieza_liquidacion`). La pieza se lee `for update`: una venta y una
   rebaja simultáneas se turnan. Anular la venta la devuelve a «disponible»; un cambio o una devolución se rechazan
   (`liquidacion_venta_final`, disparador en `cambios` y `devolucion_items`).
4. **El módulo `liquidacion` es Catálogo ▸ Liquidación** (`/productos/liquidacion`): nace sin rol (ADR-0161). Inventario ya
   estaba en su tope de filas (`menu.test.ts`), y Liquidación es la otra cara de «qué se vende y a cuánto».
5. **Precio mínimo** en `retail.parametros_liquidacion` (una fila, S/ 10); lo cambia solo un líder, desde la misma pantalla.

## Alternativas descartadas

- **Lotes por precio** («Liquidación S/ 20 × 14», un producto con stock): Felipe eligió un precio por prenda que se va bajando.
- **Reusar «Prenda sin registrar» tal cual:** cada venta dejaba una tarea a almacén, que es justo lo que se quería ahorrar.
- **Una variante nueva para la línea de venta:** habría que excluirla en ocho lugares (inventario, ledger, motor de demanda,
  plan del piso, buscar…). La centinela ya está excluida en todos.
- **Mantener el código al rebajar:** una etiqueta vieja en la prenda cobraría el precio anterior.

## Se rompe si

- **Alguien reescribe `registrar_venta` copiando un archivo**, no la definición viva: perdería los dos reemplazos y una pieza
  caería a la cola de almacén como «Prenda sin registrar» (sin talla ni color, la base la rechazaría con
  `prenda_sin_registrar_incompleta`). Todo cambio a esa función va anclado sobre la definición viva.
- **Las piezas cuentan en Análisis o en el motor de demanda.** Hoy no: no tienen movimientos, la centinela se excluye y el
  motor solo suma lo anotado en `prendas_por_regularizar`. Si alguien quiere la liquidación en la demanda, es una decisión de
  Felipe (son prendas viejas: ensuciarían lo que hay que reponer).
- **Se vende sin internet.** No se encola a propósito (`PuntoDeVenta.tsx`): es una sola prenda y otra caja podría venderla.

## Cómo se verifica

`pnpm pruebas:piezas-liquidacion` (19 casos con ROLLBACK, también en el CI): etiquetar, módulo, mínimo, rebaja, etiqueta vieja,
venta sin stock movido y sin fila para almacén, venta mixta, precio distinto, descuento, la misma pieza dos veces, ya vendida,
otra sede, retirada, anular, cambio rechazado y mínimo solo del líder. Vitest: `liquidacion-reglas`, `liquidacion-guia`,
`ticket-linea-reglas`. En el navegador (local, 2026-10-10): etiquetar, la etiqueta impresa, rebajar, leer la etiqueta vieja en
la pantalla y en Vender, la pieza en el ticket a 375 px.

## Actualización 2026-10-10 — /chaos: la pieza no se crea dos veces

`/chaos` (semilla 371) encontró que tres clics seguidos en «Etiquetar» creaban tres piezas, y que dos clics en «Cambiar precio»
mostraban éxito y error a la vez. Arreglo, como en Ajustar inventario: las tres hojas que guardan se traban con un `enVuelo`
(un `useRef`: el estado de React llega tarde dentro de un mismo clic) y `crear_pieza_liquidacion` recibe `p_token`
(migración `20261010200000`): el mismo token devuelve la pieza ya creada, también con dos llamadas simultáneas (índice único
parcial + `on conflict do nothing`). Así un reintento tras una respuesta perdida no deja una pieza fantasma. Prueba:
`pnpm pruebas:piezas-liquidacion` («el mismo token dos veces…») y la carrera real con dos sesiones (una pieza, una etiqueta).

## Actualización 2026-10-10 (b) — «Para reconocerla» y lo que pidió /formidable

La prueba ciega mostró que con dos «Camisas y Blusas» a la venta no había cómo distinguirlas. Felipe aprobó una **descripción corta y
opcional** al etiquetar (`piezas_liquidacion.descripcion`, hasta 60 letras; migración `20261010210000`): sale en la etiqueta, en la
lista, en el buscador y en la boleta («Liquidación · Blusa beige, manga globo»). Su ejemplo sigue a la categoría elegida
(`lib/sugerencias-liquidacion.ts`, ADR-0290). En pantalla se dice **«prenda»**, nunca «pieza» (la tabla y el código siguen con
`piezas_liquidacion`); el estado es «Precio bajado» y filtra la lista como las otras cifras.

**En producción el 2026-10-10** (OK de Felipe): `20261010200000` (token) y `20261010210000` (descripción), por el MCP, con las versiones
registradas `20261010201508` y `20261010201543`. Las 13 funciones `%liquidacion%` tienen el mismo md5 en producción y en local.
