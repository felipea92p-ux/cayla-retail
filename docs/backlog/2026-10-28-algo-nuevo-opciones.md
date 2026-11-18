## 2026-10-28 · Corregir una compra ya anotada · rama `claude/algo-nuevo-opciones` (ADR-0561)
- [x] Migración `20261029012000` (tabla `compra_correcciones`, `fn_compra_corregible`, `fn_compra_para_corregir`, `corregir_compra_rapida`, `fn_compra_correcciones`) + hoja web + rastro + guías + prueba de Postgres con ataque al azar.
- [ ] **Pegar la migración en producción** (dinero e historial: con el OK de Felipe, en una sola parte) y luego refrescar el volcado (`pnpm datos:generar:produccion`) y correr `pnpm datos:comparar`.
- [ ] Ver la hoja con una cuenta real (compradora con una compra pendiente) y a 1920 px; correr `/formidable` sobre la hoja.
- [ ] Decidir: anular una compra entera (H5); corregir después de que Compras completa (asiento o nota de crédito); registrar un saldo a favor con el proveedor si se entregó de más.
- [ ] Sumar el chip «Corregida» a cada fila de la lista de la ronda (hoy solo en el detalle): reemplazo anclado de `fn_mi_plata_compras`.
