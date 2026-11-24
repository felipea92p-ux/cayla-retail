# Auditoría al milímetro — Análisis ▸ «Qué pedir» en dos partes y tarjetas sin botones · 2026-11-24 · `claude/comprar-word-necessity-321f8a`

Medido: `/gestion/analisis?vista=pedir` y `?vista=acaba` dibujados con `AnalisisPantalla` en una página local de prueba (no se commitea), con las
cifras de Tienda TRU leídas de producción ese día, a 1600 × 1000 y 1440 × 1000 (claro y oscuro) y a 375 × 812. Medición en el navegador con
`getComputedStyle` y el contraste WCAG calculado sobre el vidrio claro de la tarjeta; capturas de página entera con Chrome sin pantalla.

Resumen: **0 graves · 0 medias · 1 leve** (la fecha grande baja a su propio renglón cuando la tarjeta es angosta) · 1 heredado anotado abajo (la unidad en taupe).

## Lo que cambió y cómo se midió

| Pieza | Medida | Regla |
|---|---|---|
| «Se agotó el» / «Hasta el» (antes del número) | 16 px, 400, contraste 5,21 | la misma cara que la unidad de siempre (`.an-tarj-num span`) |
| La fecha («20 nov.», «7 dic.») | serif 28 px, 600, contraste 7,56 (rojo profundo) y 6,37 (ámbar) | exhibición ≥ 22 px (ADR-0691) |
| «Vendiste 23», «en 36 días», «Tienes 72», «Vendes 39 por semana» | 14 px (`texto-detalle`), contraste 8,03, 20 px de alto | escalón de 14 de la escala (ADR-0691) |
| Pie («Lima tiene 2») | 14 px, contraste 8,03 | sin cambio |
| Título de cada parte | `<TituloGrupo cuenta>`: versalitas de 13 px, 600, contraste 5,97, globito con la cuenta | pieza única «Títulos de sección» (ADR-0358) |
| Separaciones | tarjeta 16 px de relleno, 12 × 16 de hueco; 12 px del título a las tarjetas; 8 px del número a la primera línea | múltiplos de 4 |

## Lo que se vio

1. **Sin botones, la tarjeta se lee de arriba abajo:** qué es, cuándo se acaba o se agotó, cuánto hay y cuánto se vende, y quién más lo tiene.
   Toda la tarjeta sigue abriendo la ficha con clic, Enter o espacio; su `aria-label` dice lo mismo que se ve.
2. **Oscuro:** las fechas en rojo profundo y ámbar del tema oscuro, las líneas en crema al 70 %: se leen. Nada claro quedó suelto.
3. **375 px:** una tarjeta por fila, la fecha junto a su «Se agotó el», sin desbordes.
4. **Leve:** a 1440 px, con nombres largos, «Hasta el» queda en un renglón y la fecha en el siguiente (el `flex-wrap` de siempre). Se lee bien; no se forzó en una línea porque desbordaría la tarjeta.

## Heredado

- La unidad y lo que va antes del número usan `var(--color-taupe)` (`app/estilos/analisis-b.css`); la regla de tres tonos (ADR-0694) pide
  `secundario` para texto. No se tocó el archivo para no cambiar también la unidad de «Se acaba»: queda para cuando se toque esa hoja.
