# Auditoría al milímetro — `/rendimiento`: el calendario del rango y la pila de «El equipo» · 2026-11-17 · `claude/custom-date-range-filter-a43ea9`

Piezas: el calendario del rango (`components/rendimiento/RangoRendimiento.tsx`, `.rango-*`) y la pila de «El equipo» con su lista «+N»
(`PilaDelEquipo.tsx`, `.mesa-pila*`), en `app/estilos/vidrio/rendimiento.css`. Solo lo que cambió en esta rama (ADR-0678).

Medido: 1440×900 claro (estados, espacio, tipografía, color, textos, foco con Tab) · 1440 oscuro (color, a ojo y con los valores calculados) ·
375 y 1180 (a ojo y con la medida del DOM, en la construcción). Servidor: `next dev --webpack` en `rango.localhost:3047`, con una página temporal de
datos inventados (14 personas; ya borrada) porque la base local no estaba disponible. Los medidores se corrieron con `fetch` + `eval` desde
`public/auth/m` (borrado al terminar). Los medidores de espacio, tipografía, color y textos miden la pantalla entera: de lo que devolvieron se
tomó solo lo que cae dentro del calendario y de la pila. **Sin medir:** movimiento con las animaciones encendidas (el calendario y la lista usan
`anim-revelar` de la hoja y la cascada de ADR-0136; el medidor de movimiento no se corrió) y `guias:recorrer` (la guía nueva `rendimiento.rango` solo
se vio a ojo, no con el recorredor).

Resumen: **0 graves · 1 media (corregida) · 0 leves** en lo nuevo · 1 falso positivo del medidor.

## Lo que se midió

| Pieza | Medida | Regla | Resultado |
|---|---|---|---|
| Día del calendario | 43 × 40 px, 14 px; a 375 px táctil, 44 px (`tacto.css`) | 24 mínimo, 32 objetivo con mouse; 44 con el dedo (ADR-0611, mejora 5) | pasa |
| Flechas de mes | 36 × 36 px; con `area-dedo` | 32 con mouse; 44 con el dedo | pasa |
| Foco con Tab | 18 controles del calendario enfocados: 0 sin anillo, 0 con anillo flojo, 0 con el foco tapado | ADR-0351, WCAG 2.4.7 y 2.4.11 | pasa |
| Panel | `role="dialog"` con nombre; vidrio de lo que flota (74 % claro, 88 % oscuro) con desenfoque de 24 px | ADR-0596 (lo que flota quieto lleva desenfoque), ADR-0623 | pasa |
| Letra | días 14 px, mes 21 px serif, semana 11 px (versalita) | lectura ≥ 14 px; etiquetas ≥ 11 px | pasa |
| Color, claro | tinta (26, 26, 24) sobre el vidrio claro: números, mes y semana | 4,5:1 (WCAG 1.4.3); lo mide `lib/vidrio-contraste.test.ts` | pasa |
| Color, oscuro | crema (245, 240, 232) sobre el vidrio oscuro; semana al 66 % | 4,5:1; texto tenue ≥ 64 % (CLAUDE.md «Modo oscuro», 4) | pasa |
| Hoy | anillo interior de 1,5 px al 56 % de tinta (`aria-current="date"`) | WCAG 1.4.1: no solo el color | pasa (el medidor lo marcó «solo ARIA»: falso positivo, el anillo está) |
| Día elegido y rango | gota en las puntas, banda entre medio, `aria-pressed` | WCAG 1.4.1 y 4.1.2 | pasa |
| Día que pasa de 30 días | rayado, apagado y con `title` «Pasa de 30 días» | el motivo a la vista | pasa |
| Escape | cierra y devuelve el foco al botón del período; no limpia el rango de la pantalla | ADR-0136 (act. 2026-09-26) | pasa |
| Pila de «El equipo» | caras de 32 px que caben en la tarjeta; el resto en «+N» con lista por nombre | que no se salga de su tarjeta | pasa |

## Hallazgos

1. **Media · la flecha «Mes siguiente» apagada no decía por qué** (`RangoRendimiento.tsx:168`). En el mes de hoy se apaga sin ningún motivo a la vista;
   el medidor de estados la marcó «apagado sin motivo a la vista». Regla: el motivo de lo apagado, a la vista (`estados.md`, estado 10). Nivel: Práctica.
   **Corregido:** las dos flechas llevan `title` cuando están apagadas («Todavía no llega» y «Se mira desde el 1 de octubre»). Verificado en el navegador.

## Decidido a propósito, no es hallazgo

- «Rango» en 10,5 px versalita en el segmento del período: es la misma cara de «Hoy», «7 días» y «Este mes» (`SegmentoDeslizante`).
- El calendario tiene su propio vidrio y no usa `<Modal>` en escritorio: flota anclado al segmento, como `SelectorMes` y `MenuAcciones`; en el celular
  sí es `<Modal>` (ADR-0479).

## Lo que no se midió

- Movimiento con las animaciones encendidas y `guias:recorrer` de la guía nueva (arriba).
- Con una cuenta real y a 1920 px.

## A quién va

Nada para otra skill. `/formidable` sigue pendiente para la pantalla entera.
