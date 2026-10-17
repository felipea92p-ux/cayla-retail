## 🎯 Metas por mes y por fecha (2026-10-17) — rama `claude/configuracion-meta-68a95e`

- [x] **Estimación de octubre a diciembre** (modelo de nivel + mes + día, +6 %, validado hacia atrás) y **semana de octubre cargada en producción** (TRU 7 casillas, AQP 6; el domingo de AQP no abre).
- [x] **Migración `20261017020000`** (ADR-0435): tablas por mes y por fecha, `fn_parametros_caja` como envoltorio de `fn_parametros_caja_normal`, funciones que guardan y leen. Probada en local.
- [x] **Pantalla:** «Meta mes por mes» y «Fechas especiales» en Configuración ▸ Tiendas y caja. `pnpm pruebas:metas-mes-y-fecha` en el CI.
- [ ] **Pegar `20261017020000` en producción, en dos partes** (la web nueva no funciona hasta entonces; la de hoy sigue igual). Lo hace Felipe.
- [ ] **Cargar noviembre y diciembre** en «Meta mes por mes» y las fechas del 23, 24 y 31 de diciembre (TRU) y 24 y 31 (AQP); el 25-dic de las dos, con 0.
- [ ] **Panel comercial** (`lib/comercial.ts`) todavía lee `ubicaciones.meta_venta_diaria` (columna que nada escribe) en vez de `fn_parametros_caja`: alinearlo.
- [ ] **Refrescar el diccionario de datos** (`pnpm datos:generar:produccion`) cuando la migración esté en producción: las dos tablas nuevas y `fn_parametros_caja_normal`.
- [ ] **Recorredor de guías** (`guias:recorrer`) sin correr en local por falta de migraciones viejas en la base local; correrlo cuando se pueda.
- [ ] **LIM** sin datos históricos: sin meta hasta que los tenga. **Revisar en enero** el nivel (la validación pesa mucho lo reciente en TRU).
