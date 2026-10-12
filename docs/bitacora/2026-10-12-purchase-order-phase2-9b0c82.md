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
