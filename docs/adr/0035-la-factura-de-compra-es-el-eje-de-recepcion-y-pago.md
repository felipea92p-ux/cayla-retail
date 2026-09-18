# ADR-0035 — La factura de compra es el eje: de ella cuelgan la recepción y el pago

**Fecha:** 2026-09-12
**Estado:** Decidido con Felipe. Migración `20260912231956_compras_desde_factura.sql`
aplicada y verificada en local (seed con 3 facturas, 11 casos de rechazo probados).
Pantallas construidas y probadas en navegador el mismo día: `/compras` (lista),
`/compras/nueva`, `/compras/[compraId]` (detalle + pago + anular),
`/compras/recibir` (contra una o varias facturas, con reparto por variante) y
`/compras/por-pagar`. Pendiente: pegar la migración en producción.
**Afecta:** `supabase/migrations/` (tablas `compras`, `compra_items`, `compra_pagos`,
columna `movimientos.compra_item_id`, vistas `compras_resumen` y
`compra_items_resumen`, RPCs `registrar_compra`, `registrar_pago_compra`,
`anular_compra`, `recibir_compras`; se eliminan `ordenes_compra`,
`ordenes_compra_items` y `lotes.orden_compra_id`), `supabase/seed.sql`,
`packages/database/src/types.ts`; `apps/web/lib/compras.ts` (lectura, server) y
`apps/web/lib/compras-reglas.ts` (tipos/etiquetas, sin Supabase — lo importan
los componentes cliente), `components/CompraFormV2.tsx`,
`CompraDetallePanel.tsx`, `RecepcionCompraFormV2.tsx`, `ComprasNav.tsx`,
rutas en `app/(app)/compras/`, y "Compras" en el menú de `AppShell.tsx`.

## Contexto

V2 heredó del laboratorio un flujo "orden de compra → recepción" que ninguna
pantalla usaba: CAYLA no emite pedidos formales a sus proveedores. Lo que sí
existe físicamente es la **factura** que llega con la mercadería (o antes), y
lo que Felipe necesita controlar es (a) qué de esa factura ya llegó y (b) qué de
esa factura ya se pagó. Pidió tres módulos: registro de facturas de compra con
su pago, recepción de mercadería vinculada a facturas para no tipear dos veces,
y una vista de lo pendiente de pagar.

Dos realidades del negocio condicionan el diseño:

1. **Cada proveedor factura distinto.** Unos detallan por talla/color, otros
   agrupan por modelo ("Blusa Lino x 24"). El sistema no puede exigir un
   formato.
2. **Contado y crédito son dos operaciones distintas.** Al contado se paga en
   el momento; al crédito la factura queda como deuda con vencimiento.

## Decisión

**DECIDÍ: la factura (`compras`) es la entidad central. `ordenes_compra` se
elimina. La recepción y el pago son hechos que se registran *contra* una
factura, y lo pendiente de ambos se calcula, nunca se guarda.**

- **Líneas detalladas o agrupadas, un solo modelo.** `compra_items.producto_id`
  es obligatorio, `variante_id` opcional. Si la factura detalla, la línea trae
  la variante y la recepción sale precargada. Si agrupa, el desglose por
  talla/color se hace al recibir — que es cuando se abre la caja. La regla dura
  vive en `recibir_compras`: lo recibido de una línea nunca supera lo facturado
  y la variante recibida siempre pertenece al producto de la línea.
- **Contado ⇒ pago obligatorio en la misma transacción.** `registrar_compra`
  rechaza una factura al contado sin pago, o con pago distinto al total. Una
  factura al contado sin pago es un estado imposible, no un pendiente.
- **Crédito ⇒ vencimiento obligatorio, pago opcional.** Vive en "Por pagar"
  hasta que `registrar_pago_compra` la salde. Un pago nunca supera el saldo
  (la fila se bloquea con `for update` para que dos pagos simultáneos no se
  pasen).
- **Lo pendiente se calcula.** `compras_resumen` deriva `pagado`, `saldo`,
  `estado_pago`, `recibido_cantidad`, `estado_recepcion` y `vencida` desde
  `compra_pagos` y `movimientos`. Cero columnas que se desincronicen
  (principio 4).
- **Escritura solo por RPC.** Las tres tablas tienen RLS con política de
  SELECT únicamente; sin política de escritura, Postgres niega el INSERT
  directo aunque exista el grant. Nadie puede saltarse la regla del contado.
- **Una recepción = una guía = un `lote`**, que puede cubrir varias facturas
  del mismo proveedor. Cada `movimiento` de entrada apunta a su
  `compra_item_id` (mismo patrón que `venta_item_id`, `conteo_item_id`).
- **Pagos salen de cuenta de la empresa**, nunca de la caja de tienda:
  `compra_pagos` no escribe `caja_movimientos`. Si un día un pago sale del
  efectivo del día, ese es el único lugar a tocar.
- **Costo sin IGV.** `compra_items.costo_unitario` es el valor unitario de la
  factura; al recibir se copia a `variantes.costo`. El IGV es crédito fiscal,
  no costo de la prenda.
- **Permiso en una sola función.** `fn_puede_registrar_compras()` (hoy =
  `fn_es_lider()`) es la única puerta para facturas y pagos. Felipe indicó que
  los roles se afinarán después: cambiar quién registra es cambiar una línea.
- **El DROP de `ordenes_compra` está protegido:** si en producción hubiera
  filas, la migración frena con error en vez de borrar (regla del repo: nunca
  se borran datos con historial sin mirarlos primero).
- **Anular, nunca borrar.** `anular_compra` cambia `estado` y exige motivo; se
  niega si la factura ya tiene pagos o mercadería recibida.

## Consecuencias

- `recibir_lote` pierde `p_orden_compra_id` (firma vieja borrada, ADR-0026) y
  queda para mercadería **sin factura** (producción propia, ajustes). El camino
  principal de recepción pasa a ser `recibir_compras`.
- Una línea agrupada se puede recibir en varias entregas y repartida en
  distintas variantes cada vez; `compra_items_resumen` dice cuánto falta por
  línea para precargar la siguiente recepción.
- Una factura recibida a medias y con el proveedor avisando que no manda más
  queda `parcial` para siempre. Falta decidir (Felipe) si se agrega "cerrar
  línea con faltante" — pendiente, no bloquea las pantallas.
- Falta en producción: pegar la migración con prefijo `retail.` (ver
  CLAUDE.md). Si `ordenes_compra` tiene filas allá, frena y se decide primero.

## Cómo verificar

`npx supabase db reset` y en Studio local:
`select documento, condicion, saldo, estado_pago, estado_recepcion, vencida from retail.compras_resumen;`
Deben salir F001-000210 (contado, pagada, recibida), F002-001045 (crédito,
pendiente, parcial) y F001-000198 (crédito, parcial, sin recibir, vencida).
