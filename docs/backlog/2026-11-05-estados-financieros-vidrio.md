## Estados financieros en vidrio (ADR-0611, rama `claude/estados-financieros-vidrio`)

- [x] Las 9 actividades que aprobó Felipe (2026-11-05). El PR #1650, de donde salió esta rama, ya se fusionó.
- [x] La migración `20261105230000_estados_financieros_patrimonio_en_fechas.sql` (`retail.fn_patrimonio_en_fechas`), pegada en producción el 2026-11-05 con el OK de Felipe y comprobada.
- [ ] Refrescar el volcado de producción y `pnpm datos:generar:produccion` para que esa función entre al diccionario. Hasta entonces `pnpm datos:comparar` la marca (la foto es del 2026-11-04), aunque en producción ya existe.
- [ ] Fusionar este PR. Las tareas 23 y 28 de «Las 36 de Finanzas» esperan a que entre esta rama. La tanda 3 (#1655) ya está incluida. Queda un choque probable con #1658: los dos bajan `MODALES_PENDIENTES_HOY`, y con los dos el valor correcto es 44.
- [x] Los 3 cambios de `/formidable` (solo textos; Felipe, 2026-11-05): cómo se usa el calendario, cómo se dice una pérdida y los lados del tubo del Balance.
- [x] Ganancias resta los sueldos estimados que Dynamic no pagó y Patrimonio lee el diario, así que los dos «ganaste» pueden diferir en un mes con sueldos sin pagar. Felipe eligió explicarlo: el detalle de «Ganaste» en Patrimonio lo dice. Si conviene igualarlos es tema para el contador.
- [ ] Medir la fluidez en el Mac mini de la tienda (lente, desenfoque y lienzos). No se puede medir desde aquí. Si no alcanza, se apaga primero la lente (`LentesDeVidrio`).
- [ ] La pasada con una colaboradora real (ley 1 de `/formidable`).

Las mejoras al resto de los módulos siguen en `docs/backlog/2026-11-05-financial-statements-redesign-afaa35.md`. Empiezan ahora que esta rama está lista, cuando Felipe lo diga.
