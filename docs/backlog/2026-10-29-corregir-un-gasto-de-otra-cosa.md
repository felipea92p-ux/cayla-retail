# Backlog · Corregir un gasto de «otra cosa» (rama clever-goldwasser-719e02)

- `20261029171000_mis_compras_corregir_un_gasto.sql` ya está pegada en producción (2026-10-29, verificada por objeto). Falta refrescar el volcado del diccionario (tabla nueva `compra_gasto_correcciones`).
- «Revisar compras» no dice que un gasto fue corregido: `revisar_gasto_compra` lee el monto vigente, pero quien tenía la hoja abierta con el viejo no lo ve. Un chip «Corregido» en `GastosPorRevisar.tsx` pide parchar `fn_revisar_compras` (otra migración, reemplazo anclado).
- El chip «Corregida» en la fila de la lista de la ronda (hoy solo se ve al abrir el detalle); igual que las compras, pide parchar `fn_mi_plata_compras`.
- Correr `/formidable` y `/chaos` sobre `HojaCorregirGasto` y verla con una cuenta de compradora real.
- Decidir con Felipe si un gasto de una ronda cerrada debería corregirse sin reabrir (hoy: se reabre, ADR-0569).
