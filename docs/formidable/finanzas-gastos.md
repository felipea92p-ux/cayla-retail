# Formidable · Finanzas ▸ Gastos — la fila de un gasto del viaje   (`/finanzas/gastos`)

- **Fecha / SHA:** 2026-10-14 · medido sobre `adcbe6c40` (rama de la fase 6, PR #1055) + el arreglo del papel del viaje; el commit se rebasó después
  sobre `5d196ead4`, que no toca esta pantalla   · **Dispositivo que manda:** escritorio (Mac mini); a 375 px la tabla se apila en tarjetas
- **Pregunta que debería resolver (1 frase):** ¿cuánto se gastó, en qué, con qué papel y cómo se pagó?   · **Protagonista:** el dinero
- **Veredicto en una línea:** «Solo medido (`rapido`): la fila ya no se contradice. Queda un "IGV descontable" que no lo es cuando la factura de
  S/ 2 000 o más se pagó en efectivo.»

**Alcance.** Solo lo que cambió el 2026-10-14: la celda «Comprobante», la línea bajo el gasto (quién lo dio) y la bajada del detalle. El resto de
la pantalla no se calificó. Sin agentes: `rapido` mide y no hace prueba ciega ni revisión de leyes.

## Notas (0–10)
Sin notas: `rapido` solo mide, y una ley sin evidencia observada no lleva número (la ley 1 nunca se califica sin observar a alguien).

## Lo que cambió (antes → después) — [Medido]
Banco propio con datos inventados, la misma base antes y después (`antes-1440` y `despues-1440` en el scratchpad de la sesión):
- Hotel de S/ 2 360 con factura F001-4321 y RUC 20123456789: **«Sin comprobante · Sin proveedor · IGV S/ 360.00» → «Factura F001-4321 ·
  RUC 20123456789 · IGV S/ 360.00»**. Ningún proveedor tenía ese RUC: por eso dice el RUC.
- La factura de un RUC que sí es proveedor dice su nombre. La boleta dice «Boleta B002-1203»; el pasaje, «Ticket o boleto»; el taxi, «Sin
  comprobante» y debajo «Planilla de movilidad». Son las palabras de la hoja «Gasto del viaje» (`TEXTO_PAPEL`).
- La bajada del detalle: «De la empresa · 14 oct 2026 · Factura F001-4321 · RUC 20123456789», y con la planilla, «Sin comprobante (planilla
  de movilidad)». Antes, un ticket sin número decía «Sin comprobante».
- La cifra «IGV que puedes descontar» dice «1 boleta sin IGV descontable» (antes «0»: no contaba la boleta del viaje).
- Los gastos de Finanzas (la luz con factura, el mototaxi sin comprobante) se ven igual que antes.

## Medido (Chromium sin pantalla contra el banco propio; el panel del navegador estaba oculto)
| Comprobación | 1440 × 900 | 1024 × 768 | 375 × 812 |
|---|---|---|---|
| Desborde de la página | 0 px | 0 px | 0 px |
| Una celda de la fila cortada | ninguna (7 filas) | ninguna | ninguna |
| Contraste: tipo / línea de abajo (12 px) | 14,9–16,4 : 1 / 5,0–5,6 : 1 | igual | igual |
| Alto de la fila | 62 px; 79 px con «Planilla de movilidad», que se parte en dos líneas | 62–98 px | tarjeta apilada; la celda, 150 × 38 a 56 |
| Scroll de lado dentro de la tabla | no | 230 px: es el `min-width: 900px` de `.fin-tabla` (kit de Finanzas, ADR-0195), ya estaba antes | no |

`medir-oficio.js` sobre la página entera a 1440 da 6 de 8 comprobaciones con fallas, **todas fuera de la fila**: «Salir» de 16,5 px de alto, el
«Ctrl K» del buscador a 3,3 : 1, textos de 10–11 px en la cabecera y el lateral, bordes a 1–3 px de alinearse en la cabecera y el combo de
categoría, ocho radios distintos. La pestaña activa «Gastos» a 1,06 : 1 es un falso positivo (el texto va sobre la píldora oscura).

## Lo que sobra (ley 8)
Nada nuevo. «Planilla de movilidad» alarga la fila del taxi una línea, pero no se acorta a «Planilla»: en esta misma pantalla, «planilla» es el
sueldo (la nota del pie dice «La planilla no se registra aquí: se lee de Dynamic»).

## Lo que no pediste y importa más
**«IGV descontable S/ 360.00» en un IGV que se perdió.** El hotel se pagó en efectivo de la caja fuerte y la factura pasa de S/ 2 000: desde la
actividad 8, `fn_igv_perdido` lo da por perdido e Impuestos lo resta. Pero Finanzas ▸ Gastos lo sigue diciendo «descontable» en el detalle y lo
suma en «IGV que puedes descontar». [Medido] en el banco: `fn_igv_perdido` lista F001-4321 con 360,00. Lo mismo le pasa a una factura de
Finanzas pagada así. Es dinero y SUNAT: cómo se dice lo decide Felipe. Va como tarea aparte, no en este arreglo.

## Lista aparte (no se ejecuta)
- La Caja de la tienda («Gastos del turno») dice «con comprobante» o «sin comprobante» de un gasto del viaje pagado desde el cajón con la misma
  regla (`tieneComprobante`): probada en `gastos-reglas.test.ts`, no vista en el navegador (el banco no tenía una caja abierta con un gasto así).

## Prueba ciega
Sin hacer (`rapido`).

## Antes de decir «listo»
- **Concurrencia:** son dos lecturas (`fn_gastos_lista`, `fn_gastos_panel`); no escriben nada.
- **Caída externa:** si la base no responde, la pantalla sigue con su aviso de «no se pudo leer» de siempre; no cambió.
- **Persona sin contexto:** sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-14 | `adcbe6c40` + arreglo | — (`rapido`) | — (fila sin fallas medidas) | el papel del viaje en la lista, el detalle y las cifras |
