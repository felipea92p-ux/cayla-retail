# Auditoría al milímetro — `/vender/apartados` ▸ la hoja de Apartar («A · Pasos como Cobrar») · 2026-11-16 · `claude/compactar-seccion-pov-bcd51d` (PR #1891)

Medido: 1440×900 claro vivo · 375×812 claro · 1440 oscuro · quieto. Servidor del worktree en local, con una página temporal que dibuja
`ApartarVista` con datos inventados y **sin base** (la local estaba apagada; las acciones de servidor y la base se cortaron en Playwright).
Estado medido: cliente lleno, Yape con un billete y la devolución pendiente. Raíz de `/milimetro`: `[data-guia="apartados.ticket"]`.

Resumen: **1 grave · 2 medias · 1 leve, todas corregidas** · 3 heredadas, que quedan · varias decididas a propósito.

## Graves (corregidas)
1. El nombre del billete («Mitad», «Todo»…) se leía a 4,01:1 en claro y 4,06:1 en oscuro, contra 4,5:1. Estaba a 10 px y con el 70 % de su color.
   Dónde: `.hoja-cobro-billete-nombre` (`app/globals.css`). Ahora lleva el color pleno del billete y ya no aparece en el medidor.
   Regla: [Norma] WCAG 1.4.3. Le toca a `/color`.

## Medias (corregidas)
1. Los nombres de las fichas de pago salían a 9 px: la ficha calcula su letra por su ancho, y a 5 por fila queda en el piso. Ahora van fijos a
   11 px (`.ap-medios .hoja-cobro-nombre`). En el celular van 3 por fila, para que «EFECTIVO» quepa.
   Regla: el piso de una versalita (11 px). Le toca a `/tipografia`.
2. La palabra del billete (10 px) y los segmentos «Boleta / Factura» y «Yape / Plin / Transf.» (10,5 px) estaban bajo 11 px. Ahora todo va a
   11 px. Le toca a `/tipografia`.

## Leves (corregidas)
1. El hueco entre la palabra y la cifra del billete medía 2,4 px, fuera de la escala de 4. Ahora mide 4 px. Le toca a `/espacio`.

## Heredadas (quedan, no son de esta hoja)
- **Los montos se escriben «S/30.50», sin espacio** (`money` de `components/PuntoDeVenta.tsx`; el medidor de `/textos` pide «S/ 30.50», ADR-0413).
  Es el formato de todo Vender (ticket, Cobrar, Apartar). Cambiarlo solo en esta hoja la dejaría distinta del ticket: va como tarea de Vender entera.
- La etiqueta de la barra de abajo del celular («Adelanto hoy · saldo…») va a 10 px (`BarraMovil`, `components/apartados/piezas.tsx`).
- Las cifras en DM Sans no tienen tabulares (propuesta 1 de `/tipografia`, de todo el ERP).

## Decidido a propósito (piezas de Cobrar o del sistema)
- El relleno de 10,6 × 13 px de `.hoja-cobro-paso` y el margen de su estado son de `CabezaPaso`, la cabeza de los pasos de Cobrar.
- El borde de `Buscador` y de `SegmentoDeslizante` mide 1,1:1 contra el fondo. Son piezas decididas (ADR-0358) que se reconocen por su relleno.
- El «Otro» del billete no tiene anillo de foco propio: el billete pasa de borde punteado a sólido (`.es-otro:focus-within`). Es igual que el
  «Otro» de Cobrar. Hay que revisarlo a ojo con el teclado, junto con Cobrar.
- Las animaciones de 520 ms son el trazo de los íconos de `<Aviso>`, una pieza del sistema. Con las animaciones apagadas, 0 animaciones.

## Sin medir
- 44 px con el dedo (`pnpm --filter web tacto:medir`).
- Los estados que piden la base: buscar la ficha, «Guardando…» y el error al guardar.
- El foco con Tab en las 20 piezas: el medidor solo pudo enfocar 2.
- `/chaos`.
