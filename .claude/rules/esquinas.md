---
paths:
  - "apps/web/components/**/*.tsx"
  - "apps/web/app/**/*.tsx"
  - "apps/web/app/**/*.css"
  - "apps/web/tema/esquina-suelta.mjs"
  - "apps/web/lib/esquina-*"
---

## Las esquinas salen de una escala, y lo de adentro es concéntrico (regla — ADR-0698, Felipe 2026-11-19)

**Felipe, al ver la lámina de las ocho mejoras: «cuatro radios, y concéntricas».** En una pantalla hay cuatro esquinas, que viven en el
`@theme` de `apps/web/app/globals.css`:

| px | Utilidad | En una hoja de estilos | Para qué |
|---|---|---|---|
| 6 | `rounded-sm` | `var(--radius-sm)` | lo chico: una casilla, una tecla, una celda |
| 10 | `rounded-md` | `var(--radius-md)` | lo que vive dentro de otra pieza: la miniatura, la fila que se toca, la opción de una lista |
| 14 | `rounded-campo` | `var(--radius-campo)` | un control: el campo, el combo, una opción grande, una nota |
| 22 | `rounded-tarjeta` | `var(--radius-tarjeta)` | una tarjeta, una tabla, un bloque |

Lo que flota trae la suya y una pantalla no la escribe: el cajón (28, `rounded-cajon`) y la hoja (32, `rounded-hoja`); en el celular, lo que
flota va a 26. La píldora y el círculo (`rounded-full`) no son un radio. Los cuatro grandes (14 · 22 · 28 · 32) son los del contrato de
familia con CAYLA Dynamic (`docs/familia/contrato.json`): no se cambian aquí. `rounded-lg`, `rounded-xl` y `rounded-2xl` apuntan a la
escala (valen lo que `rounded-md`, `rounded-campo` y `rounded-tarjeta`): en código nuevo escribe el nombre del escalón.

**Concéntricas:** una pieza pegada al borde de otra (a 12 px o menos) lleva **el radio de afuera menos la separación**, y **nunca es más
redonda que su contenedor**. Cada escalón es otro menos 4 u 8 px (22 → 14 → 6, 22 → 10, 14 → 10) y el espacio del ERP va en múltiplos de 4,
así que casi siempre la cuenta cae sola en un escalón: una foto a 8 px del borde de una tarjeta es `rounded-campo`; a 12, `rounded-md`. Si
no cae, se escribe la cuenta: `calc(var(--radius-tarjeta) - 9px)` en una hoja de estilos, `rounded-[calc(var(--radius-tarjeta)-9px)]` en
una clase. Ejemplos hechos: la foto de la tarjeta Vitrina de Existencias y la placa de quien entró, dentro del menú.

**Nunca una esquina a mano** (`rounded-[9px]`, `border-radius: 9px`, `borderRadius: 9`), **ni `rounded` a secas** (son 4 px fijos de
Tailwind: va `rounded-sm`): un archivo nuevo no puede nacer con una y la deuda de antes solo baja (`lib/esquina-suelta.test.ts`; definición
única: `tema/esquina-suelta.mjs`; `pnpm --filter web tema:esquinas` lista lo que queda y `--lineas` dice a qué escalón iría cada una). Lo
que de verdad no es una esquina de la interfaz —un papel, un dibujo, una forma que no es un rectángulo— lleva `esquina-fija: <por qué>` en
un comentario de su línea. Por debajo de 4 px no hay esquina: es el remate de un trazo (la punta de una barra, el cuadrito de una leyenda)
y no se vigila.

**Lo que queda fuera es de diseño propio:** las piezas que Felipe eligió mirando (Estados financieros, los pases de Traslados, el
Observatorio, Análisis, Rendimiento, El telar, Recibir…) y el cobro de Vender conservan sus esquinas, declaradas en
`lib/esquina-suelta-archivos.ts`. Felipe dice si entran a la escala (ver «Una función, una pieza», `unificar.md`); mientras tanto, su
cuenta no puede subir.
