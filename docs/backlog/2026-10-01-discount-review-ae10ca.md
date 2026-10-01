## Descuento de campaña exacto (2026-10-01, ADR-0300) — web + 1 migración **POR PEGAR**; rama `claude/discount-review-ae10ca`

- [x] Caja: `descuentoUnitarioPorPorcentaje` exacto en enteros y `descuentoDeCampana` = esa misma cuenta. Suite web, `tsc` y eslint en verde.
- [x] Base: `20261001150000_campana_descuento_exacto.sql` (solo el cuerpo de `fn_descuento_campana`). Probada contra Postgres con las 394 migraciones: `campana-redondeo` 9/9, control 3/9 con la regla vieja, regresión en verde, paridad 210 080 casos.
- [ ] **POR PEGAR en producción, con OK de Felipe**, fuera de horario y en la misma ventana que fusionar el PR (ADR-0300 §6). Hasta entonces rige el .90: hoy hay 2 campañas vigentes sobre 13 variantes.
- [ ] Después de pegar: F5 en Vender en cada caja; `pnpm datos:generar:produccion` cuando se refresque el volcado (cambia el comentario de la función).
- [ ] Cerrar la holgura de ±1 céntimo (`> 0.011`) con que `registrar_venta` y `separar_prendas` aceptan el descuento de campaña: con las dos cuentas exactas ya no hace falta (toca la función más parchada; aparte).
- [ ] Nuevo producto: el margen y el aviso de «bajo costo» no miran el descuento de las etiquetas elegidas (revisión del 2026-10-01; propuesto a Felipe, sin construir).
