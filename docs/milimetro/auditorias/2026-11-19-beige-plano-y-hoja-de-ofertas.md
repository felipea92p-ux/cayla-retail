# Auditoría al milímetro — fuera el beige plano y la hoja de ofertas por variante · 2026-11-19 · claude/ofertas-modales-tama-o-135e3a (ded7a3ffc)

Medido: 1440×900 claro vivo · 375×812 claro · 1440 oscuro · 1440 quieto. Servidor: `http://localhost:3013` (base local con las migraciones de ADR-0682), cuenta de prueba del seed, Chromium por Playwright con los siete `medir.js` pegados enteros.
Pantallas: `/productos/campanas`, la hoja «Nueva oferta» abierta en «¿En qué prendas?» con una prenda leída y su panel de tallas, `/inventario` (Existencias), `/productos` y `/finanzas/resumen`.
Resumen: 0 graves de este PR · 2 graves que ya estaban (fuera de este PR) · 2 medias · 3 leves · 3 decididos a propósito

## Lo que este PR cambió y se midió

- **Contraste de texto:** 0 fallas en las cinco pantallas, en claro y en oscuro (`/color`: 83, 37, 123, 85 y 85 textos medidos). Las superficies que pasaron del beige plano a vidrio (`vd-*`, recetas) no bajaron ningún texto de 4.5:1.
- **Controles de vidrio:** 4 o 5 por pantalla, todos con su borde de lo que se toca; ninguno falla 3:1 (`/color`, controles).
- **Foco:** el anillo de 2 px en tinta con 2 px de separación aparece con el teclado en la flecha y la ✕ de la ficha de la hoja (medido con Tab en el navegador: `outline: solid 2px rgb(26,26,24)`, `outline-offset: 2px`). El `medir.js { foco: true }` las enfoca con código y ahí el navegador no pinta `:focus-visible`: no es hallazgo.
- **Blancos:** 0 bajo 24 px en las cinco pantallas, a 1440 y a 375 (`/espacio`).
- **Quieto:** 0 animaciones con `data-movimiento="quieto"` en las cinco (`/movimiento`).
- **Lo pegado de las matrices** (`vd-pegado`): opaco y neutro, sin beige; en oscuro se invierte solo.

## Graves (ya estaban: este PR no las toca)

1. Lo elegido entre los puntos de color de una prenda solo cambia de color — `button.vg-punto` en Productos (6) y `button.vitrina-punto` en Existencias (5) — medido «solo lo dice ARIA / solo cambia el fondo» y borde 1:1 contra su tarjeta — regla: lo elegido se ve sin depender solo del color (WCAG 1.4.1) y el borde de un control ≥ 3:1 (1.4.11) — `[Norma]` A/AA — va a `/unificar` (familia del punto de color; sus archivos no cambiaron en este PR: `git diff origin/main...HEAD` no los toca).
2. El tramo ámbar de una barra apilada de Finanzas ▸ Resumen contra su pista — `.barra-tramo-color` 1,74:1 sobre `.barra-apilada` — regla: una marca de dato ≥ 3:1 contra lo que la rodea (WCAG 1.4.11) — `[Norma]` AA — va a `/graficos`. La pista sigue en arena a propósito (`beige-fijo: pista del gráfico`), como antes de este PR.

## Medias

1. El chip de las fechas de la campaña («9 nov – 30 nov · 11 días») queda entre 4,12 y 5,02:1 según lo que pasa detrás — `span.chip-cayla` en la cabecera de la campaña — no concluyente — va a `/color`. Su fondo es la lente de color de `vidrio/` que trajo `main` (9bba6e8cf); la clase de este PR (`vd-gota-chica`) no lo cambia porque la pieza de vidrio gana.
2. El nombre que lee un lector de pantalla en las tarjetas «Categorías» e «Insignias» de la hoja se arma con todo su texto («Categorías Ninguna Elegir») — `button.of-grupo` — `/textos` — va a `/textos` (un `aria-label` como «Elegir categorías: ninguna»).

## Leves

1. Las cifras en DM Sans piden tabulares y la letra no los tiene (en las cinco pantallas) — propuesta 1 de `/tipografia`, ya abierta.
2. El globito de cuántas (`span.titulo-cuenta`) mide 10,5 px — pieza decidida (`<Globito>`, ADR-0358).
3. Valores de espacio fuera de la escala de 4 px en piezas que no cambió este PR (Existencias 105, Finanzas 242) — `/espacio`.

## Decidido a propósito

- El ámbar de «falta colgar» en las celdas de talla de Existencias (la lente que pide, 2026-11-02): parece tostado, no es beige.
- Las pistas de gráficos y barras de avance, las líneas, los esqueletos y la muestra de una prenda sin color siguen en arena con su `beige-fijo`: no son superficies.
- Los bucles de la tarjeta de Existencias (la onda lenta, ADR-0344): 5 con las animaciones encendidas, 0 quieto.

## Sin medir

- Las otras ~300 pantallas que tocó el cambio del beige: se midieron cinco, las de más cambios. El candado `lib/beige-plano.test.ts` cubre que no quede beige; el contraste de cada una no.
- Con el dedo (44 px): se midió con puntero fino; `pnpm --filter web tacto:medir` no se corrió.
- Los estados que exigen guardar (cargando, error) de la hoja de ofertas: no se guardó en esta pasada (`/chaos` no corrió).
