# Al milímetro · `<LineaMargen>` con la cuenta única (ADR-0668) — 2026-11-15

**Pieza:** `apps/web/components/ui/LineaMargen.tsx`. Es la línea «Te quedan S/ … · … %» de Recibir (hoja de la prenda, combinaciones, cierre) y de Nuevo producto (`soloSoles`).
**Rama:** `claude/logic-examples-review-ff76bf` (PR #1881). **Qué cambió:** el texto («Ganas» → «Te quedan»); el ámbar ahora significa «bajo el piso que aguanta la
rebaja» y no «menos de 30 %»; y una segunda línea, «Aguanta poca rebaja: sube a S/ …» (en Nuevo producto, «Sube a S/ …»), en su propio renglón y con sangría. Los tokens,
el tamaño de letra y los colores no cambian (`text-verde` / `text-ambar` / `text-rojo-profundo`).

**Cómo se midió:** un andamio temporal bajo `/login/zz-harness` (ya borrado) con 4 casos sobre `bg-papel`: bajo el piso (36/70), en el piso (36/81.90), pierdes (36/40) y
reposición (44/82.90), cada uno en las dos caras. `window.__milimetro = { raiz: "#zz-raiz" }`. Se corrieron los seis medidores enteros: estados, espacio, tipografía,
color, movimiento y textos. No hay gráficos.

## Números

**0 graves · 0 medias · 0 leves.**

| Medidor | 1440 claro | 375 claro | 1440 oscuro | quieto |
|---|---|---|---|---|
| estados | sin fallas (2 hover globales de otras piezas, ver abajo) | igual | igual | 0 bucles |
| espacio | 0 blancos < 24, 0 fuera de escala, proximidad bien | 0 (también < 44 con dedo) | — | — |
| tipografía | 0 lectura < 14 (todo a 15 px, DM Sans 400/600), cifras tabulares, 0 montos partibles | 0 | — | — |
| color | 16 textos, 0 fallan (WCAG y APCA) | — | 16 textos, 0 fallan | — |
| movimiento | 0 animaciones (la pieza no se mueve) | — | — | 0 |
| textos | sin fallas | — | — | — |

- **Hover (2, no son de esta pieza):** `.barra-t:hover` y `.parecidas-punto:hover::after` son reglas globales del CSS cargado y las vigila `lib/hover-con-mouse.test.ts`.
- **Rojo:** el estado «Pierdes» usa `rojo-profundo` (texto y su ícono); no gasta el presupuesto de rojo de marca.
- **375 px:** la segunda línea pasó a su propio renglón con `basis-full pl-5`, porque al partirse dejaba un «·» al inicio. Se vio en la captura antes y después.

## Estados

Pieza: `<LineaMargen>` · rama del árbol: la pieza del repo que ya existía (tarea 8 de Recibir); solo cambian su texto y su regla.

| Estado | Qué se ve | Qué se anuncia | Cómo se mide | Nivel · fuente |
|---|---|---|---|---|
| default | verde / ámbar con ícono / rojo profundo con ícono | `aria-live="polite"`: el cambio se lee | color/medir.js: 0 fallas en claro y oscuro | [Norma] WCAG 1.4.3 |
| hover · focus-visible · active · selected · disabled · loading · read-only | no aplica: es una línea de estado, no un control | — | estados/medir.js: 0 controles | — |
| error | «Pierdes» en rojo profundo, con ícono y texto (no depende solo del color) | `title` con el porqué | color/medir.js | [Norma] WCAG 1.4.1 |
| vacío | sin costo o sin precio no se dibuja | — | `margen-a-la-vista.test.ts` | regla del repo |
| quieto | no tiene movimiento | — | movimiento/medir.js: 0 | [Norma] WCAG 2.3.3 |

Accesibilidad: 1.4.1 (el ámbar y el rojo llevan ícono además del color), 1.4.3 (contraste medido) y 4.1.3 (`aria-live` anuncia el cambio sin mover el foco).

## Sin medir

- **Dentro de las pantallas reales** (Recibir, Nuevo producto) con datos: la base local no tenía un envío a mano. La pieza es la misma y se midió aislada sobre `bg-papel`.
- **El vidrio Serena de la hoja como fondo:** lo cubre `lib/vidrio-contraste.test.ts`, en verde en el CI.
