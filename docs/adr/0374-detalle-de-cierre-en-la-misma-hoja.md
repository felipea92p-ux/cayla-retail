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

## Actualización 2026-10-12 — «La línea del día»

Felipe pidió un detalle «mucho más visual» y, de tres propuestas (`docs/maquetas/historial-cierres-visual-2026-10/`), **aprobó la A, «La línea del día»**.
Sigue siendo la misma hoja, el mismo `<Volver>` y los mismos datos; cambia cómo se cuenta el cierre, de arriba abajo:

1. **Veredicto con escala**: «Sobró S/ 2.00» sobre una regla falta ◄ cuadra ► sobra, con un punto donde cae la diferencia (`escalaDiferencia`: el
   rango crece de S/ 20 a S/ 5 000 según la diferencia, y el punto nunca se sale). Lo que se contó, a la derecha.
2. **Cómo fue el día**: una barra por cada hora del turno (`diaDelTurno`; solo las horas entre abrir y cerrar), la hora fuerte en negro, y sobre ellas
   una línea con marcas: ⚑ abre y cierra, ● sale plata (retiro, devolución), ● cambio. Debajo: ventas, prendas, venta promedio y anuladas.
3. **Tres tarjetas con su gráfico**: *Qué se cobró* (dona por medio de pago con los tokens `--color-metodo-*`), *Cómo cuadró el efectivo* (cascada
   apertura + efectivo vendido ± salidas o entradas = esperado, y lo contado) y *A dónde fue el efectivo* (la barra de siempre más una barra contra
   el fondo que pedía el día).
4. **Lo que pasó en el turno** en una línea con puntos del color de cada hecho (verde entra, rojo sale, gris anulada), con quién y con qué se pagó.
5. El subtítulo de la hoja ahora lleva el turno completo («8:02 – 7:50 p. m. (11 h 48 min) · abrió X, cerró Y»), así que desaparece el bloque
   «Cómo abrió y cerró». El aviso de «abrió con otro monto» y la nota del cierre se conservan.

**Sin migración y sin cifras nuevas de dinero.** «Otros movimientos» de la cascada se **deriva** (esperado − apertura − efectivo vendido), igual que antes
`cuadreDelTurno` (que se borró: nadie más la usaba), para que las cinco cifras sumen siempre y el total siga siendo el de `fn_calcular_esperado_caja`;
si un cambio o una venta mixta mueve efectivo sin que `venta_pagos` lo diga, cae ahí y no descuadra. En celular las tarjetas pasan a una columna y
la hora de cada movimiento va sobre su texto. Verificado en escritorio, a 375 px y en modo oscuro.
