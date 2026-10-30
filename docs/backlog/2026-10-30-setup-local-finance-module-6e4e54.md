## 🧵 Gastos · «En qué se va» con hilos y desglose por sede (2026-10-30, ADR-0493 act. 2026-10-30) — solo web, sin migración; rama `claude/setup-local-finance-module-6e4e54`

- [x] Reglas puras con pruebas (`lib/gastos-hilos-reglas.ts`): filas, cambio contra el mes anterior, línea de meses seguidos, frase, chip del mes, desglose y su resumen.
- [x] La página lee los 5 meses de antes con `fn_gastos_panel` (solo desde el inicio de Finanzas; un mes en cero no se compara) y avisa si uno no responde.
- [x] `HilosGastos` reemplaza a `RetazoGastos` (borrado, con su CSS y el acomodo «squarified»). Las filas se deslizan al cambiar de sede.
- [x] Desglose en columna, «Ver N más», un gasto abre su hoja y «Ver en la tabla» con el filtro nuevo `sede` (`FiltrosLista`, con su píldora).
- [x] Guía de Gastos con el paso «Lo que se gastó exactamente» (recorrida: 32 pasos ✓), huella aceptada, escenario `gastos.desglose` en el auditor del tema (nada de lo nuevo falla en claro ni en oscuro), Knip limpio.
- [x] Probado en local con 320 gastos de ejemplo de junio a octubre (foto `gastos-hilos`, restaurada al final): 1920, 1440 y 375 px, claro y oscuro.
- [ ] **Sin PR:** todo en commits locales de la rama; el PR se abre con `/abrir-pr` cuando Felipe lo pida.
- [ ] **Sin `/formidable` ni `/chaos`:** `/chaos` no aplica (no guarda nada); `/formidable` queda para el cierre de Gastos completo.
- [ ] **En producción hoy no se verá la comparación:** septiembre de 2026 no tuvo gastos registrados (ADR-0332), así que el chip, la rayita y la píldora salen desde noviembre; la línea, con tres meses seguidos.
- [ ] Lo siguiente que pidió Felipe: rediseñar «Cuándo» (el calendario), que ya traía 8 días con contraste bajo en oscuro (`calendario-dia`, número crema sobre gris medio).
- [ ] Menor: en la guía, el paso del desglose queda en parte bajo la barra de sede fija cuando el desglose es alto.
