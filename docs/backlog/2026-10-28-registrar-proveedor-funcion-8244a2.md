## 2026-10-28 · «Pendiente de registrar» y alta de proveedor desde la fase · rama `claude/registrar-proveedor-funcion-8244a2`
- [x] «+ Registrar proveedor nuevo» bajo el combo (`FilaFase`), en Nueva orden y «Cambiar quién» (hook `useAltaDeProveedorServicio`; `ProveedorProduccionModal` acepta `alGuardar`, `rubros`, `rubroInicial`).
- [x] «Pendiente de registrar» en el combo (portado de `0c442665c`), «Registrar quién» en la ruta de la orden y aviso al pasar al stock.
- [x] Migración `20261028072000` (anclas verificadas en producción, solo lectura) y prueba `pnpm pruebas:produccion-proveedor-pendiente` (8/8).
- [x] `20261028072000_produccion_proveedor_pendiente_de_registrar.sql` **pegada en producción el 2026-10-28** y verificada (7 huellas).
- [x] `20261028074000_produccion_entrega_pasada_vale_como_en_produccion.sql`: alinea `main` con producción (la entrega pasada vale en `abrir_orden_produccion`, ADR-0537). **No hace nada en producción** (el comentario ya está); se puede pegar o no.
- [ ] Probar el guardado de punta a punta tras pegar la migración (en el navegador se verificó hasta elegir «Pendiente de registrar»; no se guardó).
- [ ] La rama `claude/registrar-producto-trujillo-67e787` (commit `0c442665c`, sin subir) queda superada por esta: puede archivarse.
