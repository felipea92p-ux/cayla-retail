## 🧾 Historial de cierres: detalle en la misma hoja (2026-10-10, ADR-0374) — solo web, sin migración; rama `claude/cierre-modal-close-button-design-b1207e`

- [x] ✕ en «Historial de cierres»; el detalle ya no se abre encima: cambia la vista de la misma hoja, que crece a `max-w-5xl` (probado en local con datos de ejemplo: escritorio, 375 px y modo oscuro).
- [x] «Qué se cobró» por medio de pago (`cobrosPorMedio`, con 4 pruebas) y movimientos con quién los registró, en su columna fija a la derecha.
- [ ] **Sin probar con cuenta real:** el detalle con un cierre de producción (pagos mixtos, anticipos de separaciones, ventas anuladas). El cobro por medio se cuenta por pago, no por venta.
- [ ] **Sin decidir:** si el texto «Historial de cierres» junto a la flecha pasa a ser regla para toda hoja que cambia de vista (hoy es excepción de esta hoja; ADR-0358).
