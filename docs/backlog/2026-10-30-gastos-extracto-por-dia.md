## 🧾 Gastos · la lista por día, como el extracto del banco (2026-10-30, ADR-0493 act. 2026-10-30 (d)) — solo web, sin migración; rama `claude/gastos-extracto-por-dia`

- [x] Maqueta con cuatro propuestas (`docs/maquetas/gastos-lista-2026-10/`); Felipe eligió la L1 · Por día y el umbral de S/ 300 para «Sin comprobante».
- [x] Reglas puras con pruebas (`lib/gastos-extracto-reglas.ts`, 19): días con total y cuenta sin anulados, «Hoy»/«Ayer», la línea de debajo, una marca por fila (anulado, vencida en rojo, vence en 7 días en ámbar, sin comprobante desde S/ 300) y lo repetido en «×N».
- [x] `ExtractoGastos` reemplaza la tabla de la pestaña «Gastos»: `<SeparadorDia>` pegado bajo la mesa de mando (la mide), filas `fila-cayla` que abren la hoja del gasto, sede solo con varias a la vista, IGV y «perdido» bajo el monto como antes.
- [x] Lo repetido abre en su lugar (`<FilasDeMas>`) y se ven 5 días con «Ver los N días de antes»; buscar o elegir un día muestra todos.
- [x] Guía con tres pasos nuevos (el día, lo repetido, los días de antes) y el texto de la lista al día; recorrida a 1440 (36 pasos ✓) y a 375 (35 ✓). Escenario `gastos.extracto` en el auditor del tema: 0 hallazgos solo en oscuro. Knip limpio.
- [x] Probado en local con 11 gastos de ejemplo del 20 al 30 de octubre (foto `extracto-lista`; borrados por id al final, la base quedó idéntica a la foto): 1440, 1024 y 375 px, claro y oscuro. Medido: el separador en un renglón, el total del día alineado con el monto, nada se sale de lado.
- [ ] **No visto con datos:** la marca de una factura a crédito (por pagar o vencida). La base local no tiene un comprobante de gasto a crédito y la base no deja colgar un gasto de una compra de mercadería; está cubierta por las pruebas, pero conviene mirarla en producción.
- [ ] **Sin PR:** commits locales de la rama, que sale de la del PR #1501 (los gráficos). Cuando Felipe fusione el #1501, se trae main y se abre con `/abrir-pr`.
- [ ] Falta correr `/formidable` sobre la lista nueva (obligatoria al terminar una pantalla); `/chaos` no aplica (la lista no guarda: la hoja del gasto ya existía).
- [ ] Menor: la «×N» y las filas de adentro no siguen el rayado de las demás (cada grupo empieza su propio rayado).
