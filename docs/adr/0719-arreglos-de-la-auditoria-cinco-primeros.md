# ADR-0719 — Los cinco primeros arreglos de la auditoría del 2026-11-28

**Fecha:** 2026-11-28. **Estado:** aceptado en local; **nada pegado en producción.** Felipe pidió la auditoría de Taller, Inventario,
Ventas y Compras (`docs/AUDITORIA-2026-11-28-taller-inventario-ventas-compras.md`, 103 hallazgos verificados) y aprobó programar «los 5
primeros». Las cinco migraciones (`20261128161000` a `20261128165000`) tocan dinero o stock: se pegan solo con su OK, en el orden de
abajo, siguiendo «Cómo aplicar SQL a producción». Todas son de una parte, re-ejecutables y con candado: si la función viva de
producción no es la del repo, abortan sin tocar nada.

## Contexto

La auditoría encontró cinco lugares donde el ERP deja el stock o la plata en un estado que no corresponde con la realidad, sin que nadie
lo vea: una prenda dañada que desaparece del inventario al anular su venta (N.º 1), una prenda apartada con adelanto que se suelta desde
Existencias y traba el vencimiento diario de las tres sedes (N.º 2 y 45), lo pagado a un servicio del Taller que tapa la deuda con el que
hizo el trabajo (N.º 3), un ajuste de tela que la base rechaza por un redondeo de JavaScript (N.º 4), y una compra ya recibida que se
puede anular o un mismo comprobante que entra dos veces con o sin ceros (N.º 9, 10 y 31). Todos violan el principio 2 (cero estados
inconsistentes), y en todos el arreglo va en la base y la pantalla solo deja de ofrecer lo que la base ya rechaza.

## Decisión

1. **Anular una venta con la prenda dañada la manda a Dañadas, igual que una devolución** (`20261128161000`). Con «Dañada para reparar»,
   «para donar» o «devolver al proveedor», `anular_venta` llama a la pieza nueva `fn_anulacion_a_danadas`: entrada a la cuarentena con
   motivo `anulacion_venta`, una fila en `prendas_danadas` y el movimiento guardado en `venta_anulacion_items`, como hace
   `aprobar_devolucion` desde ADR-0071. **La pérdida se cuenta al resolverla en Dañadas, no al anular** (`fn_perdidas_hechos`,
   `fn_asientos`, `fn_aliada_ventas`): si no, se contaba dos veces, y una dañada de CLAURE dejaba costo en la 201 de CAYLA. Una sede sin
   sububicación de cuarentena ahora rechaza la anulación con `anulacion_sin_cuarentena` (antes anulaba sin mover nada).
2. **La prenda de un apartado con adelanto se libera solo desde Apartados** (`20261128162000`). `liberar_apartado` rechaza con
   `apartado_de_separacion` la fila que es de un APT (por `separacion_id`, `venta_id` o `separacion_items`), `listar_apartados` la
   marca `puede_liberar = false` y Existencias muestra «Liberar en Apartados», que abre ese APT (RPC de lectura nueva
   `fn_apartados_de_separaciones`). **El vencimiento diario aísla cada apartado:** uno trabado ya no deshace la corrida de todas las
   sedes; se avisa con `raise warning` (solo ids y código), se cuenta en el resumen (`fallidas`, `fallidas_ids`, `simples_fallidos_ids`)
   y la ruta del cron lo manda a Sentry.
3. **Por pagar de una fase cuenta solo lo pagado al servicio que hoy la hace** (`20261128163000`). Si la maquila A cobró y la fase
   pasó a B, la deuda con B aparece y se le puede pagar. **Cambiar de servicio se frena** (`servicio_con_papel_anulable`) solo cuando el
   servicio de antes tiene en esa fase un papel que de verdad se puede anular (vigente, sin pagos, sin insumos, sin cierres): el mensaje
   dice cuál y dónde. **Un papel con pagos no frena**, porque hoy no hay cómo quitar un pago y frenar dejaría la orden sin salida; en
   ese caso lo pagado a A queda como plata adelantada sin trabajo y no se ve como saldo a favor (pendiente de Felipe, misma familia que el
   N.º 13).
4. **Una cantidad de insumo se redondea a la escala de su columna (3 decimales) en la regla pura** (`redondearCantidad` en
   `lib/insumos-reglas.ts`), no en el modal: `saldoDeLote` y `saldoDeInsumo` devuelven el número exacto de la base. `ajustar_lote_usado`
   sigue comparando exacto, porque es el candado de «lo que vio la pantalla». Sin migración.
5. **Una compra con mercadería ya no se anula, y un comprobante es uno solo aunque cambien los ceros** (`20261128164000` y
   `20261128165000`). `anular_compra` rechaza (`compra_con_mercaderia`, con el mensaje de siempre) si hay algo recibido por cualquiera de
   los dos caminos (movimientos, `recibido_cantidad`, `compra_item_recibido_antes` o una llegada unida al papel), e INV-14 mira también
   lo recibido antes. Nace **`fn_numero_comprobante_clave(serie, numero)`**, la misma regla que ya usaba SIRE (serie en mayúsculas,
   número sin ceros a la izquierda), y es la única: la usan los controles de compra rápida y de completar papel (con candado por
   comprobante, para dos compradoras a la vez) y dos índices únicos parciales, `compras_comprobante_clave_vigente_unico` (reemplaza a
   `compras_papel_vigente_unico`) y `compra_papeles_comprobante_unico`. **Los índices van en una migración aparte que primero busca
   repetidos y, si hay, aborta listándolos**, para que producción nunca quede a medias.

**Orden para pegar:** 161000, 162000 y 163000 son independientes entre sí; 164000 antes que 165000. La web funciona con o sin el SQL
(lo nuevo que lee falla en silencio y queda lo de antes), así que se puede publicar antes; el arreglo vale cuando la base está pegada.

## Consecuencias

- **Lo que ya pasó en producción no se repara solo.** Las anulaciones dañadas viejas siguen sin movimiento, los APT ya trabados siguen
  trabados y puede haber comprobantes repetidos por ceros. Cada migración trae en su encabezado la consulta de solo lectura que los
  cuenta; qué hacer con cada caso (reingresar la prenda, devolver el adelanto, anular el papel repetido) lo decide Felipe.
- **Gastos y Activos** siguen comparando el comprobante tal cual antes de guardar; un repetido con ceros ahora lo frena el índice, y la
  pantalla lo dice con su frase (`lib/error-escritura.ts`), no con el error de Postgres.
- **Quedan abiertos, a propósito:** la prenda de un pedido entre tiendas todavía se puede soltar desde Existencias (misma clase de
  puerta que el N.º 2, no pedida); el saldo a favor con un servicio pagado sin trabajo (N.º 3 y 13); y los otros 98 hallazgos del informe.
- Choques: cualquier PR que parche `anular_venta`, `fn_asientos`, `fn_aliada_ventas`, `fn_perdidas_hechos`, `liberar_apartado`,
  `listar_apartados`, el vencimiento de apartados, `fn_servicios_por_pagar`, `cambiar_quien_fase`, `anular_compra`,
  `registrar_compra_rapida` o `completar_papel_compra` hace abortar la segunda migración por su candado: se rehace sobre la otra.

## Cómo se verificó

Cada arreglo lo programó un agente que primero hizo fallar la prueba con el error del informe, y lo revisaron dos escépticos (uno
intentó romperlo y otro revisó las reglas de producción); F1 necesitó una ronda de corrección (la regla vieja de `fn_aliada_ventas`). Las
pruebas de Postgres corrieron contra una pila privada de Supabase con todo main aplicado, nunca contra la base compartida ni producción.
Detalle en `docs/backlog/2026-11-28-audit-workshop-inventory-sales-purchases-c19a93.md`.
