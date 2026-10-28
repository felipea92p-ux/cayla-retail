## 2026-10-28 · «Pendiente de registrar» con su costo devengado · rama `claude/pendiente-con-costo-devengado`
- [x] Migración `20261028084000_produccion_pendiente_con_costo_devengado.sql`: CHECK ensanchado, `fn_produccion_fases_normalizar` (reemplazo anclado) y `dejar_fase_pendiente_de_registrar` de 5 parámetros.
- [x] Pantalla: campos de costo bajo «Pendiente de registrar», estimado y ficha de costos lo incluyen, aviso de «Pasar al stock» por separado.
- [x] Suite `pnpm pruebas:produccion-proveedor-pendiente` (14 casos; control sin la migración: 9 en rojo) y suite del ploteo con el inverso de la nueva migración.
- [ ] **POR PEGAR en producción** (una parte): ver el PR. Sin ella, escribir un costo al dejar una fase pendiente falla; sin costo sigue funcionando.
- [ ] Probar de punta a punta tras pegar: pendiente con tarifa, vuelven prendas, devengado = buenas × tarifa; después «Registrar quién» y comprobar que el devengado no cambia.
