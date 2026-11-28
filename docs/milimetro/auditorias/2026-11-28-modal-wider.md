# Auditoría al milímetro — «Historial de cierres» más ancho · 2026-11-28 · claude/modal-wider-8d2af5
Medido: 1440 claro y oscuro · 375×812 claro (antes y después)     Servidor: del worktree, con una página de prueba temporal y cierres inventados, sin base
Resumen: 0 graves · 0 medias · 0 leves del PR · 1 de antes, fuera de este PR · 3 sin medir

Cómo se midió: Chrome sin pantalla corrió los medidores de `/milimetro`, `/espacio`, `/tipografia` y `/color` sobre el modal, con el código
de antes y el de ahora, y se compararon. No se agrega ningún control, texto ni estado: cambia el ancho de la hoja (576 → 1024 px, el mismo
del detalle de un cierre) y la lista pasa a tres tickets por fila desde 1024 px.

## Graves
Ninguno. `/color`: ningún texto falla WCAG AA en claro ni en oscuro (92 textos medidos). A 1440 px las barras del gráfico quedan separadas:
los blancos menores de 24 px que fallaban WCAG 2.5.8 pasan de 26 a 0. A 375 px las cuatro mediciones son idénticas antes y después.

## Medidas
| Ancho de pantalla | Hoja | Tickets por fila | Ancho de ticket |
|---|---|---|---|
| 1440 | 1024 px (antes 576) | 3 (antes 2) | — |
| 1024 | 976 px | 3 | 290 px, el horario en una línea, ninguno se desborda |
| 900 | 852 px | 2 | 379 px |
| 375 | 375 px | 1 | 313 px, igual que antes |

A 1440×900 se ven enteros 6 tickets (antes 2). Abrir un cierre ya no cambia el ancho de la hoja (1024 → 1024).

## De antes, fuera de este PR
- Los filtros «Faltó · 9» y «Sobró · 10» y el globito del gráfico usan «·» (ADR-0716): Caja todavía no está en la lista de módulos limpios.

## Sin medir
`/movimiento` y `/textos` (no cambia ninguna animación salvo que se quita la transición de ancho, ni ningún texto), `/graficos` (el gráfico es
el mismo, con más ancho). La página de prueba no pasa por Caja: con caja abierta o cerrada se abre este mismo componente.
