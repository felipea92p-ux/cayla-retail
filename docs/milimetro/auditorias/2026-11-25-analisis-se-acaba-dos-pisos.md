# Auditoría al milímetro — Análisis ▸ ficha de lo que se acaba en casillas de dos pisos · 2026-11-25 · `claude/se-acaba-dos-pisos`

Medido: la ficha del Chaleco Cecia (se acaba; 3 tallas, 7 colores), Blusa Alba (agotado, Arequipa tiene) y Polo Basico Manga Corta (una
talla), dibujadas con `AnalisisPantalla` en una página local de prueba (no se commitea) con las cifras de Tienda TRU de ese día, a 1440 × 1900
en claro y oscuro y a 375 × 812. Las medidas de la casilla son las del informe `2026-11-25-analisis-agotado-dos-pisos.md`: no cambian.

Resumen: **0 graves · 0 medias · 0 leves**.

## Lo que cambió y cómo se midió

| Pieza | Medida | Regla |
|---|---|---|
| Casilla con algo arriba (te queda 1, 2…) | piso de arriba sin tinte, 16 px, 600, tinta: contraste 16,44 | escalón de 16 (ADR-0691) |
| Casilla sin ventas ni nada (0 / —) | 0 en `tenue`, 400, sin tinte: contraste 5,17 | ≥ 4,5; el rojo solo dice lo que falta |
| Tabla con 3 tallas a 375 px | 325 px de ancho de caja y de contenido: no se desliza | `.m-tabla` sin desborde |

## Lo que se vio

- El rojo queda donde se vendió y ya no hay; las casillas con algo se leen en tinta y la de «nunca» queda tenue: se distingue de un vistazo qué falta.
- En oscuro, el mismo reparto con los tokens del tema.

## La clave, corregida (rama `claude/clave-dos-pisos`)

- La muestra («1 / 2») lleva el piso de arriba en tinta, sin tinte: dice lo mismo que una casilla con algo.
- El rojo tiene su propia muestra de un piso (44 × 32 px, «0» de 16 px en rojo profundo sobre su tinte: 6,99) y su frase de 8 palabras.
- A 375 px los dos pares de la clave van uno debajo del otro (8 px entre ellos); en escritorio, también (no caben lado a lado sin apretar).
