# Auditoría al milímetro · `<LineaMargen>` (el margen a la vista, tarea 8 de Recibir)

2026-11-14 · rama `claude/recibir-margen-a-la-vista-76b2f4` (PR #1861) · local, con la pieza sola entre dos `CampoMonto` reales
(la base local no tenía un envío abierto para verla en Recibir).

**Resultado: 0 graves, 0 medias, 0 leves.**

## Árbol
La familia no está en «Piezas únicas». Es una línea de texto de estado, no un control: `text-sm` (15 px), seminegrita, cifras tabulares y el
tono del dato con los tokens `verde`, `ambar` y `rojo-profundo`, los mismos de la cifra de margen que ya tenía Nuevo producto. El ícono de alerta es
lucide `CircleAlert` de 14 px (`h-3.5`, junto a un texto), sin `strokeWidth`. No pinta fondo propio: la pone la pantalla en su placa o su hoja.

## Medido
| Qué | 1440 claro | 1440 oscuro | 375 claro |
|---|---|---|---|
| Contraste «normal» (verde) | 6.13:1 | 9.38:1 | — |
| Contraste «bajo» (ámbar) | 6.37:1 | 9.46:1 | — |
| Contraste «pierdes» (rojo profundo) | 7.56:1 | 8.05:1 | — |
| Letra | 15 px · 600 | 15 px · 600 | 15 px, sin desborde ni scroll horizontal |
| Montos partibles (`tipografia`) | 0 | — | 0 |
| `textos` | sin fallas | — | sin fallas |
| `milimetro` (estados) | sin hallazgos en la raíz | — | — |
| Quieto (`data-movimiento="quieto"`) | sin bucles; la línea no anima | — | — |

## Estados
default: el texto en su tono, nada más · hover, focus-visible, active, selected, disabled, loading, read-only: no aplican (no es un control: no se toca) ·
error: no aplica (no valida nada; sin costo o sin precio no se dibuja) · vacío: no se dibuja · quieto: no tiene movimiento.
Bajo 30 % y en pérdida el color no es la única señal: el ícono y la palabra («Pierdes») lo dicen (WCAG 1.4.1). `aria-live="polite"`: el lector
oye el margen nuevo al cambiar el precio.

## Sin medir
El vidrio real de cada pantalla (la hoja de Recibir, la placa del cierre): los tres tokens pasan 6:1 sobre crema y sobre el negro cálido, y
`lib/tema-tokens.test.ts` los mide sobre cada superficie.
