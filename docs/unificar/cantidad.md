# El paso de cantidad («− 1 +») — una sola pieza (ADR-0358, ronda 17)

**Decidido:** 2026-10-17, Felipe, **mirando** (página de elegir con fotos de Vender y Bajar al piso con cada propuesta aplicada en vivo, y
demos; fuentes en [rondas/17](rondas/17/README.md)). **Elegida:** P1. **Pieza:** `<PasoCantidad>` (`components/ui/PasoCantidad.tsx`, CSS
`.paso-cantidad` en `app/estilos/campos-y-casillas.css`).

## Qué se comparó

23 controles con siete caras y ninguna pieza compartida: cajas con borde (la más usada, 8 pantallas, con alturas de 32 a 56 px y fondos
papel, crema u hoja), botones sueltos (Bajar al piso, Cuadrar, Llegó mercadería, Pedir a otra sede), la celda hueso de las matrices (la misma
clase `BOTON_PASO` copiada tres veces), la bandeja del pase de Traslados, las teclas grandes de contar, botones fantasma y la píldora del
Taller. En el ticket de Vender los signos «−» y «+» iban escritos.

| Opción | Cómo se ve |
|---|---|
| **P1 · la caja con el número adentro** | la caja de los campos (la que se enciende con su hilo rojo al escribir el número) con − y + de lucide adentro |
| P2 · los botones sueltos | dos botones secundarios cuadrados y la caja del número en medio |
| A · hoy | siete caras |

## Lo que eligió

**P1.** Dos tamaños: «celda» (26 px, dentro de una matriz de tallas × colores) y «fila» (36 px con mouse, que crece sola a 44 px en una
pantalla táctil, el celular del mostrador; el número sube a 16 px para que el iPhone no agrande la pantalla al tocarlo). La pieza no decide
nada: cada pantalla le pasa qué hace cada botón (`menos`, `mas`: `onClick`, `deshabilitado`, `etiqueta`, `title`) y el número (`campo`, las
props de su `<input>`, o `children` si solo se muestra). `tono` (error · exito · atencion) tiñe el borde y el número con lo que el dato dice
(lo que llegó en Recibir); `sinTab` saca los botones del Tab (una matriz); `claseBotones` los ubica (los que se esconden en una tabla ancha
hasta pasar el mouse); el envoltorio acepta `title`, `className` y `data-*` (los estados de una celda de Editar producto).

## El movimiento

El botón se tiñe de arena al pasar el mouse y se encoge un poco al presionar (120 ms); con el cursor en el número la caja se enciende como
un campo (sube a papel y dibuja el hilo). Con «reducir movimiento», sin la transición.

## Migración (2026-10-17)

**Deuda 0.** 19 controles en 18 archivos: Vender (el ticket), Apartados (Apartar y sumar prendas), Bajar al piso, Cuadrar el piso, Llegó
mercadería, Pedir a otra sede, Conteo (lo contado), Ajustar inventario, Recibir (lo que llegó, con su borde por estado y los botones que se
esconden en lo ancho), las matrices de Editar producto, Nuevo producto y las órdenes, la de Recibir un envío y las de Existencias (Subir y
Colgar varias), Separar prendas, Proformas, Etiquetas de precio, Rótulos y el Taller de Editar producto. Las clases que dibujaban las caras
viejas (`BOTON_PASO`, `.etq-paso`, `.taller-stepper`) se fueron.

**Quedan aparte, con su motivo en `familias.mjs`:** las teclas grandes de contar (el escáner, `EscanerConteo`, y Contar el envío,
`ContarEnvio`: 56 px y el número enorme, un teclado de contar), el paso a paso táctil de Existencias (el `Stepper` de `FlujoTalla`, la misma
anatomía de 56 px), el reverso del pase de Traslados (ADR-0355) y el paso de días de Análisis (ADR-0357).

**Un ajuste al verla en la tienda:** dentro de una caja de campo, un control deshabilitado apaga la caja entera; en el paso de cantidad,
el «−» apagado en 1 no apaga el número (solo el número deshabilitado apaga la caja). A 375 px con el dedo mide 44 px y el número sube a
16 px (el iPhone no agranda la pantalla al tocarlo); en el ticket de Vender el nombre de la prenda baja a dos líneas.

**Lo que cambia además del dibujo:** las filas de Conteo crecen de 26 a 36 px (44 con el dedo); una cantidad que no vale en Conteo, o lo
que se pasó en Bajar al piso, tiñe la caja entera de rojo (antes solo el borde o el número); en Recibir, el número de lo que llegó usa los
tonos profundos y al pasar el mouse el botón se tiñe de arena (antes el signo pasaba a rojo).
