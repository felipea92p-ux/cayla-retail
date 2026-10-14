## 🎄 El bueno del Plan sale del historial cuando el ERP no tiene la campaña anterior (2026-10-13, ADR-0372 act. 2026-10-13): solo web, sin migración; rama `claude/plan-multiplicador-historial`

- [x] Orden del bueno por tienda: campaña en el ERP (como antes) → misma campaña en el historial de Sinatra (`conHistorial` + `medir`) → × 3. La explicación de la hoja lo dice por tienda.
- [x] `getPlanCompra` lee `fn_historial_ventas` para `rangoDeCampana(previa)` después de la propuesta; si falla, el Plan es el de antes (× 3) y la explicación no afirma que la campaña falte en el historial.
- [x] Pruebas: `lib/plan-compra-propuesta.test.ts` 26 (10 nuevas); suite web 461 archivos, `tsc`, `eslint`. Navegador local, Navidad 2026: Casacas (Trujillo) «normal × 2.0 … según su historial»; Vestidos (Lima) «normal × 3 (… ni en el ERP ni en su historial)».
- [ ] **Sin push ni PR** (Felipe lo ve antes). Al abrirlo, con `/abrir-pr`.
- [ ] **Decisión de Felipe — el simulador:** «¿Y si la campaña vende distinto?» arranca en ×3.0 y su mínimo es ×1.5 (`components/plan-compra/SimuladorPlan.tsx:16` y `:37`); Arequipa está en ×1,1. ¿Arranca en el multiplicador de la propuesta y baja el mínimo a ×1.0?
- [ ] **Sin probar con datos de producción en pantalla:** la cuenta se comprobó contra el historial real por SQL de solo lectura (Trujillo dic-2025 ×1,84, Arequipa ×1,11), no con una sesión real en `/compras/plan`.
