# Modo oscuro: fallas de `main` y escenarios de la auditoría (ADR-0336, act. 2026-10-06) — pendientes

- [ ] **Escenario `cambios.confirmacion` (Cambios · paso 4): no abre por DATOS de la base local.** La primera venta de Tienda Lima tiene
      una prenda sin ninguna talla en Lima («Talla S/L/XL, no queda aquí»), así que «compró esta» no existe y el paso 3 no avanza. El
      escenario no está desactualizado. Si se quiere que no dependa de los datos: que pruebe otra prenda de la venta u otra venta, o que en
      «¿Qué se lleva?» elija una prenda con stock (cuidando que el cambio no pida medio de pago). Decisión de quien audite Cambios.
- [ ] **Escenario `analisis.ficha`: necesita las funciones de Análisis v4 en la base local** (`fn_analisis_sede`, `fn_analisis_por_llegar`,
      `fn_liquidar_desde`; el `next dev` dice «Could not find the function retail.fn_analisis_sede… in the schema cache»). La base local
      es compartida: **no se aplicaron sin el OK de Felipe.** Con ellas aplicadas (y `notify pgrst, 'reload schema'`), volver a correr
      `tema:auditar -- --cuenta admin --escenario analisis.ficha`.
- [ ] Heredados del claro que la auditoría sigue contando (no son del oscuro): 8 en Movimientos con el filtro «Ajustes y conteos» y los
      `text-tinta/55` de ayuda de Registrar factura (3.84:1 en claro). Se arreglan cuando se audite cada pantalla en claro.
- [ ] Correr las auditorías de las rutas de los otros escenarios con todas las cuentas (`--cuenta todas --escenarios`) cuando haya tiempo:
      esta pasada cubrió Admin en `/caja`, `/compras/nueva`, `/inventario` y `/inventario/movimientos`, más la Isla y «Pendientes de hoy»
      con las cuentas que los declaran.
