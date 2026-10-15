# Contrato · órdenes de insumos del Taller (ADR-0362, fase 7) — partes 1 y 2 construidas

Escrito la noche del 2026-10-12 para que la fase 7 arranque apenas Felipe responda. **La parte 1 (la orden: puntos 1 y 4 de «Lo que se
construiría») se construyó esa misma noche, con lo no decidido marcado provisional** (ver «Cambios al construir»). **La parte 2
(el comprobante y la recepción del Taller, puntos 2 y 3) se construyó el 2026-10-14**, con las respuestas de Felipe (decisiones 52, 53,
62, 63 y 84 a 88): ver «Cambios al construir la parte 2». El anexo del
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

## Preguntas que faltaban (respondidas: 1 → decisión 52 · 2 → 53 · 3 → 62 · 4 → 63, todas con la recomendada)

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

## Cambios al construir la parte 2 (2026-10-14)

- **El papel es un comprobante del Taller** (`comprobantes_produccion` con `orden_insumo_id`; cada línea, con su `orden_insumo_item_id` o
  un insumo que no estaba en la orden, decisión 43), así Por pagar del Taller lo lee sin cambios. Los cuatro tipos (50), con
  «Sin comprobante» incluido. **Al contado (84)**, lo paga quien lo registra, desde una cuenta o desde «Mi fondo»; al crédito, con su
  vencimiento sugerido por el plazo del proveedor, y lo paga el líder después.
- **La recepción vieja del Taller no recibe un papel de orden** (`recibir_comprobante_produccion` lo rechaza y
  `fn_lineas_comprobantes_produccion` no lo lista): la tela de una orden entra solo por la orden, en Producción ▸ Recibir.
- **Recibir contra la orden:** una recepción por entrega (`orden_insumo_recepciones`) y, por línea que llega, un lote con su movimiento,
  juntos; nunca más de lo que queda. El costo, el del papel (si la línea tiene uno solo vigente) o el neto de la orden, y quien recibe lo
  corrige (53). Quien hizo la orden no la recibe (17).
- **Lo que no llegó (85):** «El resto no va a llegar» con su motivo; queda anotado en la orden (`orden_insumo_cierres`) como lo que el
  proveedor nos debe, a la vista en la orden y en la lista. Cómo se salda, con la fase 5b.
- **Candados nuevos de la orden:** con un papel (aunque se anule después) ya no se edita; con un papel vigente o algo recibido, no se anula.
- **El papel de una orden no se anula si responde por algo** (de /chaos, gravedad 1; arreglado con el OK de Felipe el 2026-10-14):
  `anular_comprobante_produccion` bloquea la orden y no anula el papel si una línea suya está anotada como «no llegará» o si respalda lo
  recibido de más. Primero se registra el papel correcto.
- **La orden muestra lo que llegó fuera de ella** (de /formidable): `fn_orden_insumo` devuelve `fuera_de_orden` (lo que el papel trajo y no
  estaba pedido, con lo facturado, lo recibido, lo anotado y lo que queda), y el estado de la orden lo cuenta: «Recibida» cuando no queda
  nada por recibir, también fuera de la orden.
- **Topes en la base** (de /chaos): el código de un lote va hasta 40 letras, la referencia de un pago hasta 100 y un pago lleva hasta 20
  medios, como en la pantalla.
- **Una columna nueva de `insumo_lotes`, `movimientos_insumo` o `producciones` nace sin poder leerse** (candado de dinero del Taller): la
  que no es dinero se abre en su misma migración (`grant select (columna)`), o la guardia `pruebas:candado-dinero-produccion` la marca. Pasó
  con las dos de esta parte y lo arregló `20261015112000`.
- Todo lo de esta parte está **en producción desde el 2026-10-15** (las seis migraciones, en orden y una sola vez, y la `…112000`). Detalle
  en el ADR-0362, «Fase 7, parte 2».
