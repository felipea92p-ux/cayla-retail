## 🔑 Una llave para las campañas (2026-10-22, ADR-0476) — migración sin pegar; rama `claude/campanas-llave-unica`

- [x] **`fn_puede_campanas()` = líder o `campanas`, `campanas_web` o `etiquetas`**, y en el repo, como en producción, las funciones de una campaña (`crear_campana`, `guardar_campana`, `activar_campana`, `campana_detalle`, `etiquetar_variantes`, `actualizar_campana_etiqueta`, el disparador de alta). `pnpm pruebas:campanas-llave` 27/27.
- [x] **Lo de diseño de #1190 archivado** (sin permiso de ejecutar; `campana_disenos` comentada; nada borrado).
- [ ] **Pegar `20261022203000` en producción** con el OK de Felipe, de una vez (sin políticas). Antes o junto con la migración de ADR-0473.
- [ ] **ADR-0473 (otra rama):** usar la clave `campanas` (`insert … on conflict (clave) do update` a Catálogo) en vez de `campanas_catalogo`, y no parchar `fn_puede_editar_etiquetas`.
- [ ] **Tienda web ▸ Campañas ▸ [campaña]: pestañas Datos y Prendas** con la misma pieza de Catálogo ▸ Campañas (decisión de Felipe). Depende de que esa pieza exista.
- [ ] **Cerrar el PR #1190 sin fusionar**: lo que sirve ya está aquí y en ADR-0471.
- [ ] **Roles:** si Compras o Terminal de ventas deben tener Campañas, lo da el líder en Roles y accesos. Con Sellos ya pueden.
- [ ] **Posible deriva aparte, no tocada:** `actualizar_variantes_etiquetas` en producción (md5 `ce8f37f3…`) no coincide con la base local compartida (`e9979200…`, a medio migrar). Revisar contra el repo.
