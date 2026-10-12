# ADR-0374 — El detalle de un cierre vive en la misma hoja del historial, y la hoja crece

- **Fecha:** 2026-10-10
- **Estado:** construido y verificado en local (escritorio, 375 px y modo oscuro). Solo web: **sin migración**.
- **Pedido y decisiones de Felipe (2026-10-10):** el «Historial de cierres» no tenía ✕; el detalle de cada cierre se veía amontonado, no
  mostraba cuánto se cobró por cada medio de pago y, al abrirse ENCIMA de la lista, no se entendía que se podía volver. De tres propuestas
  (maqueta `docs/maquetas/historial-cierres-detalle-2026-10/`) eligió la **A, «una sola hoja que avanza»**, y pidió **ampliarla para que los
  movimientos queden a la derecha**; y que la hoja **crezca suave**.
- **Complementa:** ADR-0136 (modales), ADR-0358 (`<Volver>`), ADR-0186 (cierre de caja con traslado).

## Decisión

1. **Una sola hoja.** `HistorialCierresModal` ya no abre un segundo `<Modal>` encima: al tocar un cierre, la MISMA hoja cambia de vista. La lista
   queda montada y escondida (`hidden`), así que al volver siguen el filtro «Con diferencia» y el lugar del desplazamiento. La hoja pasa de
   `max-w-xl` a `max-w-5xl` con `transition-[max-width] duration-300 ease-cayla` (sin rebote; se apaga con `prefers-reduced-motion`).
2. **La vuelta.** Arriba del título, `<Volver onClick a="Historial de cierres">` y, al lado, el nombre en versalitas taupe (también tocable). Es
   una **excepción a «la flecha sola»** del ADR-0358, a propósito: lo que no se entendía era justo adónde se volvía. Vale solo para una hoja que
   cambia de vista dentro de sí misma; las demás vueltas siguen siendo la flecha sola. El `<Modal>` ganó la prop `arriba` (algo encima del
   título, dentro de la cascada) para poder colocarla.
3. **La ✕** del historial (`conCerrar`), como el detalle y el resto de hojas.
4. **Detalle en el orden en que se lee**, sin recuadros dentro de recuadros: veredicto → cómo abrió y cerró → **qué se cobró** → cómo cuadró el
   efectivo (apertura + lo que movió = esperado; contado; diferencia) → a dónde fue el efectivo. Los **movimientos** del turno van en su propia
   columna a la derecha (contenedor `@container`: dos columnas desde 56 rem de ancho; debajo, una sola, con los movimientos al final), con su
   desplazamiento y fijos a la vista mientras se baja por el resumen. Cada movimiento dice ahora **quién** lo registró (el dato ya viajaba).
5. **Qué se cobró** (`cobrosPorMedio`, `lib/historial-cierres-reglas.ts`): lo cobrado por medio de pago, con su barra, su número de ventas y su
   porcentaje. Sale de `venta_pagos` de las ventas **no anuladas** de esa caja (lo que `getDetalleCierre` ya leía) y **reusa `cobradoDelTurno`**
   (Yape y Plin juntos; el anticipo de una separación y el redondeo no son un medio), así que suma igual que el tablero de Caja. Colores: los
   tokens `--color-metodo-*` de siempre. Una nota dice que solo el efectivo pasa por el cajón.
   `getDetalleCierre` ahora devuelve `{ eventos, cobros }` (antes, solo la lista de eventos).

## Lo que NO cambia

El cuadre (`cuadreDelTurno`), la ruta del efectivo (`rutaDelEfectivo`), los avisos de apertura y de fondo, el filtro de movimientos y la página
`/caja/historial` (su botón de ojo sigue abriendo el detalle suelto, sin lista atrás, con la misma hoja ancha). Ninguna cifra de dinero se
calcula de otra forma: `fn_calcular_esperado_caja` sigue siendo la dueña del esperado.

## Qué se rompería sin esto

Sin la hoja única, quien abría un cierre veía dos hojas apiladas y sin pista de que la de atrás seguía ahí; sin el desglose por medio, el
cuadre del cajón no se podía comparar con lo que entró por Yape, tarjeta o transferencia.
