# ADR-0575 · Recibir mercadería «B»: siete piezas vivas, la misma función

- **Fecha:** 2026-10-29 · **Estado:** construido y probado en local con datos inventados (375, 1280, 1440 y 1920 px; claro y oscuro). Sin migración. Sin tocar ninguna RPC.
- **Decide:** Felipe, 2026-10-29: eligió la dirección B de `docs/maquetas/recibir-fiel-2026-10/` y, pieza por pieza, las de la ronda 3 de
  `docs/maquetas/recibir-b-2026-10/` («más visual, menos letra chica, full animaciones, sin cambiar qué hace nada ni sumar clics»).
- **Toca:** ADR-0393 (Recibir contando primero), ADR-0136 (movimiento), ADR-0358 (una función, una pieza).

## El problema primero

Las colaboradoras dijeron que Recibir tenía mucho texto chico que nadie lee y tablas que no transmiten nada. Contar un envío era leer números
sueltos: «1/2», una barra delgada, «Dijeron 2 | Contadas 1», cuatro tarjetas de cifra al cerrar. Todo funcionaba; lo que fallaba era la forma.

## Qué se decidió

Siete piezas nuevas que dicen lo mismo de una forma que se ve antes de leerla. Ninguna cambia qué guarda un botón, cuándo se guarda ni qué valida la base.

| Pieza | Dónde | Reemplaza a | Archivo |
|---|---|---|---|
| **Trayecto** | Cabecera del envío (completa) y tabla «Envíos por recibir» (compacta) | El chip de estado | `components/recepcion-envio/Trayecto.tsx`, `lib/trayecto-envio-reglas.ts` |
| **Acordeón de categorías** | Contar: a la izquierda con la tarjeta ancha (≥ 940 px), encima del Dial si no | Las píldoras de la opción A (2026-10-28) | `components/recepcion-conteo/CategoriasAcordeon.tsx`, `lib/recepcion-acordeon-reglas.ts` |
| **Dial** | Contar: el número de la categoría | El número suelto con − y +, y la barra de «cuadra» | `components/recepcion-conteo/Dial.tsx`, `lib/recepcion-dial-reglas.ts` |
| **Totales que ruedan** | La barra de abajo de Contar | «Dijeron · Contadas» quietos | `ContarEnvio.tsx` (`CifrasDelEnvio`), `Odometro.tsx` |
| **Podio** | Cerrar: una por categoría | Las cuatro cifras sueltas de la fila | `components/recepcion-conteo/PodioCategoria.tsx`, `lib/recepcion-podio-reglas.ts` |
| **Vitrina** | Cerrar: la cara de cada prenda | La fila «Costo · Precio de venta» que se abría | `PrendaConCombinaciones.tsx` (`Vitrina`), `lib/recepcion-vitrina-reglas.ts` |
| **Sello de lacre** | El envío cerrado | El sello verde y las cuatro `TarjetaCifra` | `components/recepcion-conteo/Lacre.tsx`, `EnvioCerrado.tsx` |

Decisiones de detalle, todas de Felipe:

1. **El aro del Dial solo muestra.** En la maqueta se podía arrastrar y girar con la rueda del mouse; Felipe lo quitó: «si hace clic en el número
   pueda cambiarlo manualmente o borrarlo». Tocar el número lo vuelve una caja: Enter o salir la deja, Escape la devuelve, vacía no cambia nada.
   Antes cada letra se guardaba al escribirla; ahora se guarda al dejar la caja (mismos toques: uno para entrar al número).
2. **El acordeón solo desglosa.** «Las categorías despliegan todas las prendas especificadas en compras, no agregas una unidad a toda la
   categoría.» Abrir otra categoría es elegirla para contar, como la píldora.
3. **La Vitrina escribe para todas las combinaciones.** El precio (o el costo) que se escribe en la cara va a todas las tallas y colores de la
   prenda, lo mismo que «Mismo precio para las N» de la matriz, que sigue detrás de «Distinto por talla o color». Una terminal solo pone el
   precio de su tienda (ADR-0531). Nada se guarda hasta cerrar, y el cierre confirma los precios como siempre (`ConfirmarPrecios`).
4. **Imprimir etiquetas y Bajar al piso** pasan a la tarjeta del lacre; «Para después», «Lo que no cuadró» y «Reabrir» quedan debajo, igual.

## Responsive

Cada pieza decide por el ancho de SU tarjeta (`@container`), no por el de la ventana: junto al papel de la compra la columna es angosta aunque la
pantalla sea de 1440 px. El acordeón va al lado del Dial desde 940 px de tarjeta; los totales de la barra van en su propia fila bajo 760 px; la
Vitrina pone la tarjeta al lado de la información desde 620 px; el lacre pasa sus cifras de 2 a 4 columnas desde 600 px. Revisado a 375, 1280,
1440 y 1920 px sin desborde de Recibir (queda un desborde de 2 px de la cabecera general del ERP en el celular, que no es de esta pantalla).

## Movimiento

Una vez, sin rebote ni bucle, con `--ease-cayla`, y todo quieto con `prefers-reduced-motion`; el detalle está en ADR-0136, actualización
2026-10-29 (b). Vive en `app/estilos/recepcion-viva.css`.

## Lo que se rompería sin esto / al tocarlo

- **Las piezas no se unificaron todavía.** El Dial queda como excepción de la familia `cantidad` («teclado de contar», como las teclas grandes de
  Contar). Si otra pantalla quiere el Trayecto, el Dial o el Odómetro, pasa por `/unificar`: no se copian a mano.
- **La lógica de cada pieza es pura y probada** (`lib/recepcion-*-reglas.ts`, `lib/trayecto-envio-reglas.ts`). Si cambia una regla de Recibir
  (qué es «identificada», qué cuenta como «para después»), las piezas la leen de `recepcion-grupos-reglas.ts` y `recepcion-conteo-reglas.ts`.
- **Las guías interactivas** de `/recibir` y `/recibir/envio/[id]` se pusieron al día y se recorrieron en escritorio y a 375 px en oscuro.
