## 🔑 Una llave para las campañas (2026-10-22, ADR-0476) — migración EN PRODUCCIÓN 2026-10-22; rama `claude/campanas-llave-unica`

- [x] **`fn_puede_campanas()` = líder o `campanas`, `campanas_web` o `etiquetas`**, y en el repo, como en producción, las funciones de una campaña (`crear_campana`, `guardar_campana`, `activar_campana`, `campana_detalle`, `etiquetar_variantes`, `actualizar_campana_etiqueta`, el disparador de alta). `pnpm pruebas:campanas-llave-unica` 27/27.
- [x] **Lo de diseño de #1190 archivado** (sin permiso de ejecutar; `campana_disenos` comentada; nada borrado).
- [x] **`20261022203000` pegada en producción** (2026-10-22, orden de Felipe, registrada como `20261022204822`, después de `20261022151000` de ADR-0473). Verificado: md5 de las 10 funciones igual al de la migración aplicada en local; diseño de #1190 sin permiso; `campanas` en Catálogo (orden 142) con Terminal Almacén.
- [x] **ADR-0473 (PR #1261):** usa la clave `campanas` en vez de `campanas_catalogo`, sin parchar `fn_puede_editar_etiquetas`; su ruta usa `crear_campana` y `activar_campana`.
- [x] **Tienda web ▸ Campañas ▸ [campaña]: «Datos y prendas»** con la misma pieza de Catálogo ▸ Campañas: la hace el PR #1261.
- [ ] **Cerrar el PR #1190 sin fusionar**: lo que sirve ya está aquí y en ADR-0471.
- [ ] **Roles:** si Compras o Terminal de ventas deben tener Campañas, lo da el líder en Roles y accesos. Con Sellos ya pueden.
- [ ] **Posible deriva aparte, no tocada:** `actualizar_variantes_etiquetas` en producción (md5 `ce8f37f3…`) no coincide con la base local compartida (`e9979200…`, a medio migrar). Revisar contra el repo.
