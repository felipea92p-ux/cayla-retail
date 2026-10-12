## 🚫 «Desactivar» junto al chip de estado en la vista rápida (2026-10-09) — solo web, sin migración; rama `claude/desactivar-junto-al-estado`

- [x] El botón «Desactivar»/«Reactivar» pasa del pie al encabezado, pegado al chip «Activo»/«Descontinuado» (`VistaRapidaProducto`, clase `vr-estado`); el pie queda con «Eliminar» solo a la derecha (`vr-eliminar`). Verificado en local: desactivar y reactivar desde el encabezado, 375 px (botón de 44 px, sin desborde) y modo oscuro.
- [ ] **Sin correr:** `pnpm --filter web tema:auditar` (falta el Chromium de Playwright en esta Mac); el modo oscuro se miró a mano.
- [ ] «Eliminar» desde la Tabla y desde Existencias sigue ofreciendo «Editar» como salida; solo la Grilla ofrece «Desactivar» ahí mismo (viene de #891).
