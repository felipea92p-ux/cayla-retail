# Contrato · órdenes de insumos del Taller (ADR-0362, fase 7) — parte 1 construida (provisional), el resto espera a Felipe

Escrito la noche del 2026-10-12 para que la fase 7 arranque apenas Felipe responda. **La parte 1 (la orden: puntos 1 y 4 de «Lo que se
construiría») se construyó esa misma noche, con lo no decidido marcado provisional** (ver «Cambios al construir»); el comprobante y la
recepción del Taller (puntos 2 y 3) esperan sus respuestas. El anexo del
2026-10-08 (`insumos-por-orden-de-compra.md`) recomendaba UNIR prenda e insumo en una sola orden; **Felipe decidió lo contrario**
(decisiones 25, 28 y 47) y eso manda.

## Lo que ya está decidido

- **25:** los insumos sí pasan por orden de compra, pero **no se mezclan con la compra de tienda**: proveedores distintos y órdenes
  distintas. La orden de tienda lleva categoría + marca y se reparte a las sedes; la del Taller lleva el **insumo con su unidad** y va
  al Taller.
- **28:** correlativos distintos: `OC-000001` (tienda) y `OI-000001` (Taller).
- **29:** quien compra para el Taller recibe un fondo y lo rinde (fase 6).
- **47:** **entrada nueva «Órdenes de insumos»** (módulo propio, nace solo para el líder): quien la tiene ve y hace todo en esas
  órdenes, sin ver el resto de la plata del Taller.
- Y las de toda orden: el módulo es la llave (40); quien hace la orden no la recibe (17); el comprobante no bloquea (9); quien recibe
  ve y corrige el costo (18).

## Lo que se construiría

1. **Base:** `ordenes_insumo` + `orden_insumo_items` (`insumo_id`, `cantidad numeric(12,3)` en la unidad del insumo, precio, descuento;
   proveedor de `proveedores_produccion`; destino fijo: el Taller), con el mismo esqueleto probado de la fase 1 (crear, editar, anular,
   versiones, PDF, idempotencia, firma de la decisión 39). Módulo `ordenes_insumos` en `retail.modulos` (nace sin rol), su nodo en el
   menú de Producción y su `layout.tsx` con `exigirModulo`.
2. **Comprobante:** el de la orden pasa por el circuito que el Taller ya tiene (`comprobantes_produccion`), ligado a la orden
   (`orden_insumo_id`), con las mismas reglas de la fase 2 (boleta, nota de venta, factura con IGV o sin comprobante; crédito o
   contado; lo de más se acepta y se avisa).
3. **Recepción en el Taller** (`/produccion/recibir`): reglas de `recibir_comprobante_produccion` (lote de insumo + su movimiento de
   compra en la misma transacción, no más de lo pendiente, 3 decimales, idempotente), contra la orden; el costo del lote se congela al
   recibir (PEPS); los faltantes van a «Nos debe» (fase 5).
4. **Pantallas:** lista, nueva, ver, editar y anular la orden (copiando las de la fase 1, con la línea «insumo + cantidad en su unidad»
   en vez de «categoría + marca»); el comprobante y la recepción del Taller.

## Preguntas que faltan (para el cuadro de preguntas de Felipe; recomendada primero)

1. **¿Dónde vive en el menú?** (a, recomendada) Producción ▸ «Órdenes de insumos» (junto a Insumos y Comprobantes del Taller);
   (b) Compras ▸ «Órdenes de insumos».
2. **¿Quién del Taller ve el precio al recibir?** La decisión 18 dice que quien recibe ve y corrige el costo; ADR-0126 dejó el dinero
   del Taller solo al líder. (a, recomendada) la 18 también en el Taller: quien recibe ve el precio de lo que recibe (no el resto de la
   plata); (b) se mantiene el candado de 0126 y corrige el costo el líder.
3. **La «lista de compras» desde la orden de producción** (estimar cuánta tela pedir con el rendimiento de las órdenes cerradas): ¿se
   construye en esta fase o después? (a, recomendada) después: primero la orden, el comprobante y la recepción.
4. **Maquila y flete** (hoy líneas de concepto libre en los comprobantes del Taller): ¿siguen por Gastos de Finanzas o la orden de
   insumos acepta una línea de servicio? (a, recomendada) siguen por Gastos (fase 6 para los del viaje).

## Cambios al construir la parte 1 (2026-10-13, noche)

- **Ruta propia `/ordenes-insumos`** con la entrada en Producción ▸ Abastecimiento (primera: pedir → factura → recibir → pagar): todo lo
  que cuelga de `/produccion` exige el módulo de Producción (`app/(app)/produccion/layout.tsx`), y quien tiene «Órdenes de insumos» no
  tiene por qué tenerlo (47). Ojo: la entrada de Producción solo se ve parado en un taller; desde una tienda la pantalla abre por URL.
- **Lo que el formulario ofrece elegir sale de una lectura propia** (`fn_orden_insumo_opciones`): `proveedores_produccion` solo la lee el
  líder y trae cuentas bancarias; la lectura da nombre, RUC y rubro de los activos, los insumos sin archivar y los talleres.
- **Precio con 4 decimales** (`numeric(12,4)`), como `comprobantes_produccion_items` e `insumo_lotes`: un botón puede costar S/ 0.0350. El
  importe de la línea se redondea a 2: `round(cantidad × precio, 2)`; el descuento, en soles o en %, sobre ese importe.
- **La unidad del insumo se copia en la línea** (`orden_insumo_items.unidad_medida`): el documento no cambia si alguien cambia la unidad
  del insumo. Al editar, una línea cuya unidad cambió muestra un aviso y deja la cantidad vacía para escribirla en la unidad nueva.
- **La lista muestra lo pedido por unidad** («12.5 metros · 4 conos»): nunca suma metros con conos. Sus cifras («Pedido a proveedores»,
  «Entrega en los próximos 7 días») se calculan leyendo las órdenes generadas de a 100, hasta 1000.
- Sin cambios a lo de la fase 1: la orden de tienda, sus tablas y sus funciones no se tocan.

