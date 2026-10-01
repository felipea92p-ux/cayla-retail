## Descuento de campaña exacto (2026-10-01, ADR-0300) — web + 1 migración **PEGADA 11:19**; rama `claude/discount-review-ae10ca`

- [x] Caja: `descuentoUnitarioPorPorcentaje` exacto en enteros y `descuentoDeCampana` = esa misma cuenta. Suite web, `tsc` y eslint en verde.
- [x] Base: `20261001150000_campana_descuento_exacto.sql` (solo el cuerpo de `fn_descuento_campana`). Probada contra Postgres con las 394 migraciones: `campana-redondeo` 9/9, control 3/9 con la regla vieja, regresión en verde, paridad 210 080 casos.
- [x] **Pegada en producción** el 2026-10-01 a las 11:19 (Lima), con la orden de Felipe, y verificada (ADR-0300 §7). El PR #685 se fusiona en la misma ventana.
- [x] La cascada del cumpleaños del Club (`club_cumpleanos.mjs` (a)) traía la campaña del .90 escrita a mano: corregida a 15.98 (34/34).
- [x] Revisión adversarial (ADR-0300 §8): proforma que empata con la campaña, totales en coma flotante (`totalDeLineas`), % de Nueva proforma y aviso «bajo costo», arreglados en el PR.
- [ ] **Reimprimir las etiquetas de las 2 campañas vigentes**: las impresas con el .90 dicen un precio menor que el que se cobra (Luna «S/ 30.90» y se cobra 31.20).
- [ ] **F5 en todas las pestañas del ERP abiertas desde antes** (Vender, Apartados, celulares) apenas Vercel publique; `pnpm datos:generar:produccion` cuando se refresque el volcado (cambia el comentario de la función).
- [ ] Cerrar la holgura de ±1 céntimo (`> 0.011`) con que `registrar_venta` y `separar_prendas` aceptan el descuento de campaña: con las dos cuentas exactas ya no hace falta (toca la función más parchada; aparte).
- [ ] Nuevo producto: el margen y el aviso de «bajo costo» no miran el descuento de las etiquetas elegidas (revisión del 2026-10-01; propuesto a Felipe, sin construir).
