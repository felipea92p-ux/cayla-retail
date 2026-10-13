# Contrato · órdenes de insumos del Taller (ADR-0362, fase 7) — BORRADOR, espera a Felipe

Escrito la noche del 2026-10-12 para que la fase 7 arranque apenas Felipe responda. **No se construye sin su OK.** El anexo del
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
