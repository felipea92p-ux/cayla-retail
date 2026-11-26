# Auditoría al milímetro — Análisis ▸ ficha de lo agotado en casillas de dos pisos · 2026-11-25 · `claude/agotado-dos-pisos`

Medido: la ficha de cuatro modelos agotados (Capa de Encaje, Pantalon Zenit, Blusa Alba, Top Tokio) dibujada con `AnalisisPantalla` en una
página local de prueba (no se commitea), con las cifras de Tienda TRU leídas de producción ese día, a 1440 × 1900 en claro y oscuro y a
375 × 812. Medición en el navegador con `getComputedStyle` y `getBoundingClientRect`; contraste WCAG calculado sobre la placa.

Resumen: **0 graves · 0 medias · 0 leves** · 1 heredado anotado abajo (el fondo de papel de la tabla en el celular).

## Lo que cambió y cómo se midió

| Pieza | Medida | Regla |
|---|---|---|
| Casilla de dos pisos | 59 × 56 px a 375 (52 px mínimo de ancho en escritorio, 48 en el celular), radio 12, la placa | con el dedo ≥ 44 px (ADR-0611) |
| Piso de arriba (te quedan) | 16 px, 600, rojo profundo sobre su tinte: contraste 6,99 | escalón de 16 (ADR-0691); ≥ 4,5 |
| Piso de abajo (vendiste) | 14 px, tinta: 16,44; «—» en `tenue`: 5,17 | escalón de 14; ≥ 4,5 |
| Clave («Arriba: te quedan / Abajo: vendiste en 8 semanas») | 14 px, `secundario`; la primera línea en rojo profundo | poco texto: dos líneas de menos de 8 palabras |
| «Arequipa tiene 7» | `<TituloGrupo cuenta>` y un `<Chip versalitas={false}>` por color y talla (13 px) | piezas únicas (ADR-0358) |
| Separaciones | 4 px entre casillas (`border-spacing` de la tabla), 8 px de la clave a la tabla, 16 px al bloque de la otra tienda | múltiplos de 4 |

## Lo que se vio

- Nada se sale de la hoja: la tabla mide lo mismo que su caja (518 px en escritorio, 325 a 375 px), también con tres tallas.
- En oscuro, el piso de arriba toma el rojo del tema oscuro y la placa su versión oscura: se lee igual.
- El globito al pasar el mouse o al enfocar dice la casilla entera («Beige M: te quedan 0, vendiste 1»); es también lo que lee el lector de pantalla.
- Heredado: en el celular la tabla de la ficha (`.m-tabla`) pinta la columna del color en papel para fijarla al deslizar; ya era así en la tabla de lo que se acaba.
