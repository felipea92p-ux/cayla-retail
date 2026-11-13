# Maqueta · los íconos con vidrio (2026-11-01)

Dos filas del tablero `docs/vidrio/README.md` (ADR-0596): «Íconos del marco» (`lib/menu-iconos.ts`) e «Íconos del contenido (lucide)»
(`lib/iconos.ts`).

Abrir `index.html` (o con la config `maquetas` del navegador integrado). Va sobre el marco y las piezas ya elegidas
(`../vidrio-base-2026-10/`), en una pantalla de Configuración, «Cómo cobra la sede», que usa los cuatro tamaños de ícono y un dibujo grande.
La barra negra elige la cara de cada uno, el tema y el ancho (de 320 a 1920 px). «Plegar o abrir el menú» deja solo los íconos del lateral.
Las tarjetas de los medios de pago se marcan y desmarcan.

## Lo que hay hoy

- **Íconos del marco:** 85 dibujos propios, en línea a 1,5, uno por pantalla (polera, percha, etiqueta, caja registradora…): el mismo en el
  lateral, en Roles y accesos y en el Inicio. En el lateral van a 20, 18 y 16 px según el nivel, en tinta al 65 %, y la fila elegida en
  tinta; en la cabecera, a 18 px.
- **Íconos del contenido:** lucide en 477 archivos, con el grosor de fábrica y cuatro tamaños según el lugar (12, 14, 16 y 20); un dibujo
  grande a 1,5 y la marca sobre un punto lleno a 3 (ADR-0358, ronda 15).
- Todos son **solo línea**: no hay nada sólido que pasar a vidrio. La pregunta es si el trazo queda igual sobre el vidrio o gana cuerpo.

## Las caras

| Pieza | Cara | Cómo es |
|---|---|---|
| Marco | Como ahora | Línea; la elegida, en tinta. |
| | **A · Se llena al elegir** (elegida) | Como la barra de un iPhone: la pantalla en que estás lleva su dibujo lleno de vidrio tintado (34 %), y las demás quedan en línea. |
| | B · Duotono siempre | Todos llevan un velo adentro (15 %), y la elegida, más (34 %). |
| Contenido | Como ahora | Línea, con la regla de tamaños de hoy. |
| | **A · Duotono en los de 20** (elegida) | Solo el ícono de un título o de una tarjeta de opción lleva un velo adentro (12 %). |
| | B · Lente para los de 20 | El ícono de 20 px vive en una lente redonda de 40 px, como la de los avisos y el loader. |

En ninguna cara cambian los íconos de 12, 14 y 16 px: rellenar un dibujo de 14 px lo vuelve una mancha. Lo que gana y lo que cuesta cada
una, al pie de `index.html`.

## Lo que no cambia

Qué dibujo lleva cada pantalla (el refresco retail del 2026-10-13), los 85 trazos del marco y sus tres tamaños, los cuatro tamaños del
contenido, el grosor de 1,5 del marco y de los dibujos grandes, y la marca a 3 sobre un punto lleno.

## Para implementar

Con A en el marco, el relleno va en `path` (`fill: color-mix(in srgb, currentColor 34%, transparent)`), solo en la fila elegida y en el grupo
cerrado que la contiene, nunca en la flecha del grupo. Algunos dibujos abiertos (flechas, el reloj del historial) se llenan con una forma
rara: hay que revisar los 85 al implementar y, al que no sirva, darle un trazo de relleno aparte.

## Reglas que respeta

Solo tokens, en claro y oscuro. Sin movimiento nuevo: el relleno entra con la transición de color de la fila (200 ms); con
`prefers-reduced-motion`, sin transición. Datos inventados. Medida de 320 a 1920 px sin que nada se salga.

## Lo que decidió Felipe

**2026-11-01: marco A · Se llena al elegir y contenido A · Duotono en los de 20.** En el contenido no tomó la recomendada («como ahora»). Al
implementar: en `lib/iconos.ts`, un ícono de 20 px (`h-5 w-5`, el de un título o una tarjeta de opción) y un dibujo grande de 24 px o más llevan
`fill: color-mix(in srgb, currentColor 12%, transparent)` en sus trazos; los de 12, 14 y 16, solo línea. Igual que en el marco, hay que mirar
los dibujos abiertos de lucide que se usen a 20 px y, al que se rellene raro, dejarlo en línea con su motivo.
