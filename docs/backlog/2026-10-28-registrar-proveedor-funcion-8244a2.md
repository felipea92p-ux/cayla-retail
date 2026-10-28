## 2026-10-28 · «Pendiente de registrar» y alta de proveedor desde la fase · rama `claude/registrar-proveedor-funcion-8244a2`
- [x] «+ Registrar proveedor nuevo» bajo el combo (`FilaFase`), en Nueva orden y «Cambiar quién» (hook `useAltaDeProveedorServicio`; `ProveedorProduccionModal` acepta `alGuardar`, `rubros`, `rubroInicial`).
- [x] «Pendiente de registrar» en el combo (portado de `0c442665c`), «Registrar quién» en la ruta de la orden y aviso al pasar al stock.
- [x] Migración `20261028072000` (anclas verificadas en producción, solo lectura) y prueba `pnpm pruebas:produccion-proveedor-pendiente` (8/8).
- [ ] **POR PEGAR en producción: `supabase/migrations/20261028072000_produccion_proveedor_pendiente_de_registrar.sql`** (una parte). Sin ella, «Pendiente de registrar» falla con `fase_sin_proveedor`; el alta de proveedor funciona sin SQL. Antes: confirmar si el SQL de deshacer «por definir» (PR #1422, cerrado) ya se pegó.
- [ ] Probar el guardado de punta a punta tras pegar la migración (en el navegador se verificó hasta elegir «Pendiente de registrar»; no se guardó).
- [ ] La rama `claude/registrar-producto-trujillo-67e787` (commit `0c442665c`, sin subir) queda superada por esta: puede archivarse.
