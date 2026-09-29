## 🧾 CAYLA Global: vista de toda la empresa, solo Admin (2026-09-28, ADR-0275) — migración sin pegar; rama `claude/vista-global-admin-4a5ca2`

- [x] Migración `20260929140000_cayla_global_modulo_solo_admin.sql`: módulo `cayla_global` (Admin, nace quitado al
      Líder de equipo), «módulo del Admin» (`modulos.del_admin`), «solo das lo que ves» también para el líder,
      `fn_ve_finanzas_de_todo` con el módulo, `fn_exigir_rol_de_terminal` (solo personas) y `fn_global_cobertura`.
      Probada con Postgres desechable (358 migraciones, 0 errores) y con mutación: `pnpm pruebas:cayla-global` (10/10),
      `pnpm pruebas:roles-lider-editable` (13/13, sin romperse), `pnpm pruebas:roles-por-modulo` (70/70),
      `pnpm pruebas:roles-cobertura` (32/32). **Sin pegar en producción.**
- [x] `lib/vista-global.ts`: qué módulos y rutas funcionan en la vista (`vista-global.test.ts`, 14 casos), reusado por
      el menú, `proxy.ts` y `exigirModulo`.
- [x] `proxy.ts`: barrera de rutas — en CAYLA Global, toda pantalla fuera de la lista manda a `/global/elige-sede`
      (ofrece solo las sedes donde esa pantalla existe, p. ej. Producción solo el Taller).
- [x] `/global` («Salud del negocio»): con qué datos cuenta cada sede (`fn_global_cobertura`,
      `lib/cayla-global-tablero.ts`, 10 pruebas) y accesos a lo que ya suma toda CAYLA.
- [x] Selector (`UbicacionSwitcher`): «CAYLA Global» primero, en su grupo, solo para quien ve el módulo; se resincroniza
      si la sede cambia por otro camino («Elige sede»).
- [x] Finanzas (Resumen, Reportes, Gastos, Dinero, Presupuesto) abre con «todas» las sedes en CAYLA Global
      (`verDeLaVista`); verificado en el navegador (Estado de resultados con columna CAYLA).
- [x] Verificado en el navegador contra Postgres local (puesto al día con `main`): tablero con datos reales (TRU/AQP
      con historia, LIM y Taller sin ella, dicho en palabras), menú filtrado, `/vender` y `/produccion/ordenes` piden
      sede, Finanzas consolidada, sin errores de consola, sin desborde a 375 px.
- [x] `docs/investigacion/2026-09-28-cayla-global-indicadores-y-metodo-buffett.md`: Buffett/Berkshire, Inditex/Zara,
      Walmart/Costco/Amazon/Constellation, y la síntesis de indicadores para CAYLA.
- [x] Maqueta `docs/maquetas/cayla-global-2026-09/`: el tablero completo (los 4 veredictos, decisiones de la semana con
      botón, «Cada negocio de CAYLA», el Taller contra maquilar afuera) — **para que Felipe la apruebe antes de programarla.**
- [ ] **Pegar la migración en producción** (pide el «dale» de Felipe).
- [ ] **Decidir con la maqueta:** si «Decisiones de esta semana» y «Para decidir hoy» de Finanzas ▸ Resumen son una
      sola lista o dos (resuelven lo mismo, ADR-0195); umbrales de «Gran/Buen/Pesado negocio»; si el traslado que arma
      el Admin lo confirma la sede antes de despacharlo.
- [ ] **Traer de Alegra los totales mensuales por sede** (ventas, costo, gastos y stock valorizado): sin esto, «¿Crece?»
      y «¿Crea valor?» no tienen historia.
- [ ] **Precio de maquila de referencia por tipo de prenda** (Configuración), para medir el Taller contra maquilar
      afuera.
- [ ] **Construir el tablero completo** una vez aprobada la maqueta.
- [ ] Sumar Existencias, Movimientos, Análisis, Traslados y Producción a la vista cuando lean toda la red (cada uno con
      su propia migración y prueba).
- [ ] Cuando alguien que no es líder tenga CAYLA Global (p. ej. una contadora), revisar las pantallas de Finanzas que
      todavía preguntan `rol === "lider"` en vez de `fn_ve_finanzas_de_todo`/el permiso — mismo hueco que dejó el
      ADR-0253 en Configuración y Cierre de mes.
