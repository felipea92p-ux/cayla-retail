# Al milímetro · auditar `/rotulos` (modo «Marcas») — 2026-11-13

Rama `claude/brand-labels-resize-dcafc2` (PR #1802). Medido en local con los medidores de `/milimetro`, `/espacio`, `/tipografia`,
`/color` y `/textos`, sobre el panel izquierdo (`section[aria-labelledby="rotulos-titulo"]`) con dos marcas elegidas
(«CAYLA», «Mia Rose»): 1440 × 900 claro, 375 × 812 claro y oscuro.

**Resumen:** 0 graves · 0 medias · 2 leves. Lo nuevo (selector «Rótulos de», fichas de marca, buscador, rótulo de solo nombre) no
abre hallazgos propios.

## Medido
- **El nombre de la marca entra en el papel:** en la tira y en `#rotulos-print`, `scrollWidth ≤ clientWidth` y el alto del texto ≤ el alto
  del área del nombre, a 1440 y a 375 px. «CAYLA» en una línea, «MIA ROSE» en dos (`medidaNombre` con `ALTO_SOLO_NOMBRE_MM` 34,6 y tope 24 mm).
- Estados: 0 controles sin etiqueta, 0 apagados sin motivo, 0 esperas escritas a mano, 0 bucles.
- Espacio: 0 blancos bajo 24 px que fallen AA (1440 y 375).
- Color: 0 textos que fallen contraste (claro y oscuro).

## Decidido a propósito
- `SegmentoDeslizante forma="modo"` (Prendas / Marcas): el medidor de color marca el borde de sus opciones y tipografía sus versalitas de
  10,5 px. Es la pieza elegida en `/unificar` (la caja arena de «GRILLA / TABLA», familia `pestanas`), la misma de «Cómo salen».
- «Quitar Mia Rose» (textos: ¿Mayúscula De Título?): es el nombre propio de la marca.

## Leves
- La × de cada ficha mide 28 px (igual que la de las prendas): con el dedo la agranda `tacto.css` / `area-dedo` solo si la clase está en la lista; no se tocó.
- «También puedes marcarlas en Productos…» a 12,5 px: es de antes del cambio.

## Sin medir
- `/movimiento` (la pantalla no agrega animaciones) y el foco con `{ foco: true }`.
