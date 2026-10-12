## Compras ▸ fase 2 de las órdenes de compra: el módulo es la llave (2026-10-12) — rama `claude/purchase-order-phase2-9b0c82`

- **Qué:** arranca la fase 2 de ADR-0362 («pasar una orden a comprobante», 11 actividades que Felipe aprobó hoy). La actividad 1 deja
  de exigir «ser líder» en Compras cuando la persona tiene el módulo (ADR-0387): crear, editar, quitar y restaurar una campaña del Plan y
  fijar su tope; cambiar la tienda que gestiona un comprobante; confirmar un costo fuera de lo normal al recibir (quien ve los costos al
  recibir: la plata de Compras o el módulo Recibir, decisión 18); decidir qué pasa con lo que faltó en una recepción.
- **Por qué:** Felipe, al aprobar la fase: «quitar las validaciones de líder: solo tienes el módulo puede hacer todo en él, seas líder o
  no», en todo Compras; y quien tiene el módulo ve todas las tiendas (actividad 2).
- **Cómo:** migración `20261012202000` (reemplazos anclados sobre la función viva; huellas iguales al banco y a producción), web del Plan
  y de Recibir, `pnpm pruebas:compras-llave` (16/16; falla sin la migración) y las pruebas viejas pasadas a la regla nueva (plan 23/23,
  lote 24/24, envío 21/21, por tienda 35/35, reparto 57/57, dinero 30/30, roles 70/70), vitest completo 436/436, y en el navegador una
  integrante con Plan de campaña ve y abre lo que antes era del líder. **Sin pegar en producción** (espera el OK de Felipe al cerrar la fase).

## Compras ▸ fase 2, actividad 2: todas las tiendas y a nombre de la empresa (2026-10-12)

- **Qué:** quien tiene un módulo de plata de Compras ve las facturas de todas las tiendas y paga a nombre de la empresa, como el líder;
  Proveedores ve los montos de la empresa con su módulo (decisión 44); y la deuda de una factura es 100 % de la tienda que hizo el pedido
  (decisión 45), también en Finanzas (Por pagar por tienda y Balance por tienda). En la web, el camino del líder es el de todos: sin
  «Pagas desde» ni «Tu parte…», gestora libre al registrar.
- **Por qué:** Felipe, 2026-10-12: «todas las tiendas», «Sí, que los vea», y «Trujillo y Lima, si no hicieron el pedido, no tienen nada
  que pagar, sino quien realizó el pedido». Medido en el banco antes del cambio: una boleta de S/ 1,000 repartida 600/400 con un pago de
  la empresa de S/ 500 daba S/ 900 de deuda por tienda.
- **Cómo:** migración `20261012204000` (reemplazos anclados contados en producción; dos partes, las políticas solas al final), web de
  Compras y Finanzas, `pnpm pruebas:compras-llave` 37/37 (13 fallan sin la migración) y ya en la lista del CI; las pruebas viejas de
  «cada tienda lo suyo» pasadas a la regla nueva caso por caso. **Sin pegar en producción** (la base va antes que la web).

## Compras ▸ fase 2, actividades 3 a 8: el comprobante de una orden (2026-10-12)

- **Qué:** desde la orden abierta, «Registrar comprobante»: boleta, nota de venta o factura con IGV, al crédito o al contado (a nombre de
  la empresa), con lo pendiente de la orden ya puesto, el precio de venta sugerido y lo que no estaba en la orden; lo de más se acepta y
  se avisa; la orden muestra «Llegó en papel X de Y» y sus comprobantes, con «Anular». Las líneas «categoría + marca» (sin prenda) se ven
  bien en todo el ERP y Recibir no las ofrece (llegan por guía, fase 4). «Por repartir» pasa a la fase 3.
- **Por qué:** Felipe pidió cerrar la fase 2 hoy: las actividades 3 a 8 se hicieron juntas con tres agentes en paralelo sobre un contrato
  escrito (`docs/compras/ordenes-de-compra-2026-10/contrato-comprobante-de-orden.md`).
- **Cómo:** migraciones `20261012205000` (esquema), `20261012210000` (Recibir y lecturas) y `20261012211000` (la función); pruebas
  `pruebas:ordenes-compra-comprobante` 18/18 y `pruebas:compras-lineas-sin-prenda` 20/20 (las dos fallan sin su migración), vitest
  completo y tsc en verde, y en el navegador una integrante registró F001-000777 de la OC-000352. Los 57 reemplazos anclados de la fase
  2 se simularon contra producción (solo lectura): todos entran. **Sin pegar en producción.**
