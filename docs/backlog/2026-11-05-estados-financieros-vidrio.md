## Estados financieros en vidrio (ADR-0611, rama `claude/estados-financieros-vidrio`)

- [x] Las 9 actividades que aprobó Felipe (2026-11-05), en local. Esta rama va sobre el PR #1650: primero se fusiona ese.
- [ ] **No está en producción:** la migración `20261105230000_estados_financieros_patrimonio_en_fechas.sql` (`retail.fn_patrimonio_en_fechas`). Espera el OK de Felipe. Sin ella, un mes entero funciona; otras fechas y la comparación del mes en curso, en Patrimonio, dicen que no se pudo leer. Al pegarla: refrescar el volcado y `pnpm datos:generar:produccion`, para que entre al diccionario. Hasta entonces `pnpm datos:comparar` avisa de esta función (esperado).
- [ ] Abrir el PR con `/abrir-pr` cuando Felipe lo diga. Mirar choques con las tandas de «Las 36 de Finanzas» (PR #1652, #1654 y `claude/finanzas-36-tanda-3`), que tocan los mismos archivos de Finanzas. Las tareas 23 y 28 de esa lista esperan a que entre esta rama.
- [x] Los 3 cambios de `/formidable` (solo textos; Felipe, 2026-11-05): cómo se usa el calendario, cómo se dice una pérdida y los lados del tubo del Balance.
- [x] Ganancias resta los sueldos estimados que Dynamic no pagó y Patrimonio lee el diario, así que los dos «ganaste» pueden diferir en un mes con sueldos sin pagar. Felipe eligió explicarlo: el detalle de «Ganaste» en Patrimonio lo dice. Si conviene igualarlos es tema para el contador.
- [ ] Medir la fluidez en el Mac mini de la tienda (lente, desenfoque y lienzos). No se puede medir desde aquí. Si no alcanza, se apaga primero la lente (`LentesDeVidrio`).
- [ ] La pasada con una colaboradora real (ley 1 de `/formidable`).

Las mejoras al resto de los módulos siguen en `docs/backlog/2026-11-05-financial-statements-redesign-afaa35.md`. Empiezan ahora que esta rama está lista, cuando Felipe lo diga.
