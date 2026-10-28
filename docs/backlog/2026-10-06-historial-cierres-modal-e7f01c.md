## 🧾 Historial de cierres en un modal (2026-10-06) — sin migración; rama `claude/historial-cierres-modal-e7f01c`

- [x] Botón «Historial de cierres» en la cabecera de Caja (escritorio) + `HistorialCierresModal` (resumen, filtro, meses, detalle encima).
- [x] Detalle del cierre rediseñado (`CierreCajaDetalle.tsx`, hook `useDetalleCierre`) y reglas puras con prueba (`lib/historial-cierres-reglas.ts`).
- [ ] Verlo con una caja real y una cuenta de líder (hoy solo se probó con datos inventados).
- [ ] En celular el botón no está: la barra fija de abajo solo trae «Cerrar caja». Decidir si se agrega.
- [ ] El resumen cuenta «últimos N cierres» (tope 60 de `getHistorialCierres`), no «últimos 30 días».
