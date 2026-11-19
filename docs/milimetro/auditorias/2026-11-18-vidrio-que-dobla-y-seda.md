# Auditoría al milímetro — el vidrio que dobla y el fondo Seda · 2026-11-18 · `claude/system-aesthetics-analysis-96733d`

Medido: 1440×900, claro y oscuro, en un Chrome de prueba con la sesión del seed. Servidor: `localhost:3011` contra la base local (Tienda
Lima). Medidor: `.claude/skills/color/referencia/medir.js`, entero.
Alcance: lo que cambió con ADR-0681. La cabecera con prendas pasando por debajo (Existencias, desplazada 790 px) y la hoja «Ajustar stock»
abierta. Cada estado se midió dos veces: con la lente y con el vidrio de siempre (quitando `data-dobla-activa`), para ver si la lente agrega
algún hallazgo.

Resumen: **0 graves · 0 medias · 0 leves** nuevas · la lente no agrega ni quita ningún hallazgo: 0 fallas de texto en los ocho estados, y las fallas de borde de control (20 en claro, 14 en oscuro) son las mismas con ella y sin ella.

## Lo que se midió

| Estado | Textos medidos | Texto que falla | Controles que fallan |
|---|---|---|---|
| Claro · cabecera sobre prendas · con lente | 86 | 0 | 20 |
| Claro · cabecera sobre prendas · vidrio de siempre | 87 | 0 | 20 |
| Claro · hoja abierta · con lente | 3 | 0 | 0 |
| Claro · hoja abierta · vidrio de siempre | 3 | 0 | 0 |
| Oscuro · cabecera sobre prendas · con lente | 86 | 0 | 14 |
| Oscuro · cabecera sobre prendas · vidrio de siempre | 87 | 0 | 14 |
| Oscuro · hoja abierta · con lente | 3 | 0 | 0 |
| Oscuro · hoja abierta · vidrio de siempre | 3 | 0 | 0 |

Con la hoja abierta el medidor mide 3 textos: el resto queda tapado por el velo, que es lo esperado.

## Heredado, no de este cambio

Los bordes de control que no llegan a 3:1 en Existencias (20 en claro, 14 en oscuro) salen igual con la lente y sin ella. Son de las
tarjetas de la lista, no del marco. Los está corrigiendo la rama `claude/graves-heredados-milimetro`.

## Lo que el medidor no ve

- **El vidrio.** El medidor de color no mide lo que hay detrás de un `backdrop-filter`. El contraste de la letra sobre el relleno claro lo
  mide `lib/vidrio-dobla.test.ts` (peor caso: 4,86:1 en claro, 4,83:1 en oscuro).
- **El fondo.** El texto que va directo sobre Seda lo mide `lib/tema-tokens.test.ts` (el más justo, el rojo: 4,54:1).

## Sin medir

- 375×812 con este medidor. A ese ancho solo se comprobó que la cabecera dobla y que la hoja y el cajón no llevan lente.
- Los medidores de espacio, tipografía, movimiento y textos: el cambio no toca medidas, letra ni palabras. El movimiento nuevo (el vidrio
  que se asienta) se midió aparte: con las animaciones encendidas la fuerza del filtro va de 96 a 59 en 480 ms; apagadas, 59 desde el
  primer cuadro.

## Actualización 2026-11-19: lo de afuera de la hoja y el menú sobre Seda

Medido: 1440×900, claro y oscuro, Chrome de prueba, `localhost:3010`, Existencias sin desplazar. Dos cambios pedidos por Felipe al verlo.

| Estado | Textos medidos | Texto que falla | Sin poder medir | Controles que fallan |
|---|---|---|---|---|
| Claro · el menú sobre Seda | 109 | 0 | 0 | 6 |
| Oscuro · el menú sobre Seda | 109 | 0 | 0 | 9 |

Ninguna de las fallas de control es del menú: son los puntos de color de las prendas de Existencias, heredados.

El relevo entre el velo y el marco de afuera, con la hoja de una talla abierta: se comparó la pantalla con la lente contra la del vidrio de
siempre, píxel por píxel, fuera de la hoja.

| Zona | Claro (media · máxima) | Oscuro (media · máxima) |
|---|---|---|
| Lejos de la hoja | 0,76 · 3 | 0,81 · 2 |
| Los 26 px del borde de la pantalla | 0,79 · 2 | 0,77 · 2 |
| Los 14 px pegados a la hoja | 0,71 · 2 | 0,70 · 2 |

Diferencias sobre 255. No se distinguen a la vista. La caja de relleno del marco coincide con la de la hoja al píxel, la hoja sigue sin
filtro propio y el clic afuera sigue cerrando.

Sin medir: 375 px (ahí la hoja no lleva lente y el menú es el cajón: nada de esto cambia) y la fluidez con la hoja abierta.
