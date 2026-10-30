## 🧵 Gastos · «En qué se va» con hilos y desglose por sede (2026-10-30, ADR-0493 act. 2026-10-30) — solo web, sin migración; rama `claude/setup-local-finance-module-6e4e54`

- [x] Reglas puras con pruebas (`lib/gastos-hilos-reglas.ts`): filas, cambio contra el mes anterior, línea de meses seguidos, frase, chip del mes, desglose y su resumen.
- [x] La página lee los 5 meses de antes con `fn_gastos_panel` (solo desde el inicio de Finanzas; un mes en cero no se compara) y avisa si uno no responde.
- [x] `HilosGastos` reemplaza a `RetazoGastos` (borrado, con su CSS y el acomodo «squarified»). Las filas se deslizan al cambiar de sede.
- [x] Desglose en columna, «Ver N más», un gasto abre su hoja y «Ver en la tabla» con el filtro nuevo `sede` (`FiltrosLista`, con su píldora).
- [x] Guía de Gastos con el paso «Lo que se gastó exactamente» (recorrida: 32 pasos ✓), huella aceptada, escenario `gastos.desglose` en el auditor del tema (nada de lo nuevo falla en claro ni en oscuro), Knip limpio.
- [x] Probado en local con 320 gastos de ejemplo de junio a octubre (foto `gastos-hilos`, restaurada al final): 1920, 1440 y 375 px, claro y oscuro.
- [ ] **Sin PR:** todo en commits locales de la rama; el PR se abre con `/abrir-pr` cuando Felipe lo pida.
- [x] `/formidable` de las dos secciones nuevas (2026-10-30, `docs/formidable/finanzas-gastos.md`): leyes 6,6 (ley 2 en 5), oficio 7, ciega ✓. `/chaos` no aplica (no guarda nada).
- [ ] **En producción hoy no se verá la comparación:** septiembre de 2026 no tuvo gastos registrados (ADR-0332), así que el chip, la rayita y la píldora salen desde noviembre; la línea, con tres meses seguidos.
- [x] Lo siguiente que pidió Felipe: rediseñar «Cuándo» (el calendario). Hecho abajo; sus 8 días con contraste bajo en oscuro se fueron con él.
- [ ] Menor: en la guía, el paso del desglose queda en parte bajo la barra de sede fija cuando el desglose es alto.

## 📈 Gastos · «Cuándo» como el ritmo del mes, y `<Linea>` sin textos tapados (2026-10-30, ADR-0493 act. 2026-10-30 (b)) — solo web, sin migración; misma rama

- [x] Maqueta con cuatro propuestas (`docs/maquetas/gastos-cuando-2026-10/`); Felipe eligió la C2 y pidió que el texto se lea mejor. Medido en la maqueta: ningún texto toca una línea desde 350 px de gráfico, en todas las sedes.
- [x] Reglas puras con pruebas (`lib/gastos-ritmo-reglas.ts`, 20): acumulado, mes anterior a la misma altura, «si sigue así» (un día normal sin fijos ni saltos + los fijos sin registrar en su fecha), saltos con nombre, frase, pie y día elegido.
- [x] Reglas de dónde va cada texto de `<Linea>` (`lib/linea-textos-reglas.ts`, 13, con 200 casos al azar): notas en franja, cifra que busca hueco, cifras del final separadas.
- [x] `<Linea>` gana `notas`, `vienen`, `cifraProyeccion`, `onElegir`/`elegido` (también con el teclado) y el borde de papel en sus textos. Finanzas ▸ Resumen, comprobado: su cifra no se movió.
- [x] La página lee los gastos del mes anterior (`getGastos`, solo si se compara); `RitmoGastos` reemplaza a `CalendarioGastos` (borrado con su regla, su prueba y su CSS) a todo el ancho bajo «En qué se va».
- [x] Guía con el paso «Lo que se gastó ese día» (recorrida: 33 pasos ✓) y huella aceptada; el piloto de las guías sabe tocar una pieza SVG. Escenario `gastos.ritmo-dia` en el auditor del tema: 0 hallazgos solo en oscuro. Knip limpio.
- [x] Probado en local con 159 gastos y 5 fijos de ejemplo en septiembre y octubre (foto `ritmo-cuando`, restaurada al final): 1920, 1440 y 375 px, claro y oscuro, el mes en curso, septiembre cerrado y Trujillo sola; ningún texto toca una línea y la página no se desplaza de lado en el celular.
- [ ] **Sin PR:** todo en commits locales de la rama; el PR se abre con `/abrir-pr` cuando Felipe lo pida (va con los hilos).
- [ ] **No revisado en pantallas con datos:** Caja, Rendimiento, el plan de campaña y el costo de una prenda también usan `<Linea>`; la base local no tiene datos para dibujarlas. La regla deja la cifra donde estaba si no choca, pero conviene mirarlas en producción.
- [ ] Menor: Playwright no puede tocar el centro de una nota (cae entre el texto y su punto, sobre el gráfico); el escenario toca su texto. Una persona toca el texto.
- [x] Arreglado en `/formidable`: «Cuándo» de un mes sin gastos (decía «S/ 0» con un eje «0, 1, 1»), el globito que saltaba a «hoy» al tocar el gráfico (pegado en el teléfono) y las lecturas para comparar en cadena (de 4 esperas seguidas a 3).
- [ ] **Esperan el OK de Felipe (los 3 cambios de `/formidable`):** 1) en el mes en curso, el chip de la cifra, la píldora y la rayita de cada categoría y la frase de los hilos comparan a la misma altura (hoy, contra el mes anterior entero: a mitad de mes contradicen a «Cuándo»); 2) la frase del «si sigue así» dice de qué está hecha (un día normal + los fijos sin registrar), a todo ancho; 3) «En qué se va» con las 6 más grandes y «Ver N más», su frase «entre lo que más pesa» y «menos de 1 %».
- [ ] Lista aparte de `/formidable`: a 375 el ▲/▼ de cada categoría no llega al lector de pantalla; el globito de `<Linea>` asoma ~10 px por el borde (se corta a 375); el dock flotante tapa filas y montos (pieza de todo Finanzas).
