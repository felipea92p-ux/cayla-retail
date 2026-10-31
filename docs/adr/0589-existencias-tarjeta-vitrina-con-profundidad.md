# ADR-0589 · Existencias: la tarjeta Vitrina, con profundidad

- **Fecha:** 2026-10-31 · **Estado:** construido y probado en local (1024, 1280, 1440, 1920 y 375 px, claro y oscuro). Solo web, sin
  migración.
- **Decide:** Felipe, 2026-10-31. Con una captura de Existencias dijo que las tarjetas «se ven muy planas, simplemente un recuadro y ya»
  y que «desde una vista general se ve todo muy desordenado». Eligió la opción **B · Vitrina** mirando la maqueta
  `docs/maquetas/existencias-tarjetas-profundidad-2026-10/` (cuatro vistas: Hoy, A · Relieve, B · Vitrina, C · Vidrio). Sobre los
  colores dijo: «con que salga así está bien; si tienen que ver más colores, que entren al modal».
- **Toca:** ADR-0012 (sombras solo en lo que flota), ADR-0169 (paleta y «sin sombras en superficies pegadas al fondo»), ADR-0344 y
  ADR-0391 (la tarjeta de Existencias), ADR-0136 (movimiento), ADR-0358 (`accion.menu`).

## El problema (medido en la captura, no supuesto)

1. **No había profundidad.** El papel de la tarjeta (`#fbf8f2`) y la crema del fondo (`#f5f0e8`) tienen casi la misma luz. Lo único que
   separaba una tarjeta de otra era una línea de 1 px, y eso no era un descuido: ADR-0012 prohíbe la sombra en lo pegado al fondo.
2. **La prenda era una estampilla.** La foto medía 40 × 46 px. En una tienda de ropa la prenda se reconoce por la foto, y el espacio se
   lo llevaba un número suelto en el centro.
3. **La rejilla no hacía filas.** La tarjeta de un modelo con muchos colores bajaba las tallas porque los puntos se apilaban.

## La decisión

Cada tarjeta de Existencias pasa a ser una **vitrina**:

- **La foto grande** a la izquierda (104 px de ancho por el alto de la tarjeta). El optimizador pide 104 px
  (`SIZES_MINIATURA_EXISTENCIAS`).
- **Los colores en una chapa de vidrio sobre la foto, en una sola línea** (`coloresDeChapa`). Hasta 5 colores se ven todos. Con 6 o más
  se ven 3 y «+N»; si el color que se ve quedó fuera, toma el tercer lugar. **«+N» abre el modal de la prenda**, que ya muestra todos
  los colores del modelo. La chapa nunca se abre ni crece.
- **A la derecha:** nombre y precio, el color que se ve («Arena»; los demás están en los puntos de la foto) con sus insignias, y **la
  tira de tallas en un pozo de hueso hundido**, con el nombre de la talla y la línea del almacén a 12 px.
- **El pie a todo el ancho, debajo.** Al lado de la foto, «Colgar en el piso · 3 tallas» y «Más» no cabían: se cortaban 22 px a
  1920 px y 47 px a 375 px, medido en local. En la maqueta no apareció porque sus datos no tenían el «· N tallas».
- **Sombra de reposo y filo de luz**, y al pasar el mouse la tarjeta sube 3 px y su sombra se alarga (320 ms, `--ease-cayla`, sin rebote
  ni bucle; nada con `prefers-reduced-motion`). **Es la única superficie pegada al fondo con sombra**: el resto de `card-cayla` sigue
  sin ella.
- **Un filo de 3 px en el canto** (rojo si una talla se acabó, ámbar si falta colgar; `filoDeTarjeta`) dice desde lejos qué tarjetas
  piden algo. Repite lo que ya dicen la tira y el pie.
- **La línea chica se acorta desde 2 tallas** (`lineaGuardadas`: «+2», «0»), no desde 4. La tira mide 176 px por dentro en la tarjeta
  más angosta (320 px), no 304, y con 2 tallas «+10 en almacén» a 12 px pide ~90 px en una celda de 83 (medido). Con 1 talla la palabra
  cabe siempre.

La rejilla pide 20 rem por tarjeta: dos columnas en un laptop de 1024 px, tres a 1440 px, cuatro a 1920 px y una en el celular.

Lo de adentro no cambió: qué dice cada talla, el pie, qué abre cada toque y el menú «Más».

## Lo que se apartó de la maqueta, a propósito

- **«Más ▾» se queda; no pasa a «⋯».** La maqueta dibujaba «⋯», pero la pieza decidida (`accion.menu`, 2026-10-15) dice que donde
  cabe la palabra, «una tarjeta» incluida, va el secundario «Más ▾».
- **El pie va a todo el ancho** (ver arriba).

## Alternativas descartadas

- **A · Relieve (la sombra en `card-cayla`, para todo el ERP).** Era el cambio más barato: una clase que heredan 276 archivos. Daba
  profundidad pero dejaba el desorden, que venía de la foto chica y de las alturas distintas. Además habría cambiado de un golpe todas
  las tarjetas del ERP, una decisión de varios módulos que Felipe no pidió.
- **C · Vidrio (desenfoque y una luz que sigue al mouse).** Es la más de moda, pero el desenfoque cuesta en una lista de cientos de
  tarjetas, necesita manchas de color en el fondo para notarse y en oscuro se ensuciaba.
- **Que «+N» abra la chapa sobre la foto.** Se construyó en la maqueta y funcionaba, pero Felipe eligió el modal: la tarjeta no cambia
  de forma y el modal ya tiene los colores.

## Dónde vive

- `apps/web/app/estilos/existencias-vitrina.css`: la tarjeta, la foto, la chapa, la tira y el filo, solo con tokens. La sombra es
  `--color-sombra` y el filo de luz es `--color-vidrio`, así que el oscuro sale solo. Todo `:hover` va dentro de `@media (hover: hover)`.
- `apps/web/components/ExistenciasTarjetas.tsx`: el dibujo de la tarjeta.
- `apps/web/lib/existencias-tarjeta-compacta.ts`: `coloresDeChapa`, `filoDeTarjeta` y `lineaGuardadas`, con sus pruebas.
- La guía interactiva de Existencias ganó el paso «Los demás colores» (`existencias.mas-colores`, opcional).

## Actualización 2026-10-31 (b): Formidable

`/formidable` sobre la tarjeta (`docs/formidable/inventario-existencias.md`, re-análisis del 2026-10-31) encontró dos cosas que Felipe mandó
corregir («Haz 1 y 2»):

1. **El rediseño había achicado el texto del almacén**: el nombre de la talla a 10,5 px y «+N en almacén» a 10 px. El informe del 12-oct ya
   pedía 12 px. Ahora miden 12 px exactos (`text-[12px]`: en este ERP `text-xs` mide 13 px), y por eso la palabra se abrevia desde 2 tallas.
2. **«Beige · 2 colores» confundía**: la prueba ciega no supo si el 20 de la talla M era del Beige o de los dos colores. La línea dice solo el
   color que se ve; los demás están en los puntos de la foto.

Medido después: 26 anchos (375, 414 y de 1000 a 1920 px, de 40 en 40) sin un texto cortado en ninguna tarjeta, y ningún texto de la tarjeta
bajo 12 px. El tercer cambio (una sola regla de «falta colgar» en la tarjeta) espera la decisión de Felipe.

## Actualización 2026-10-31 (c): una sola respuesta a «¿falta colgar?» en la tarjeta (opción A, «manda lo físico»)

**El problema (visto por la prueba ciega).** Ninguna de las tres tiendas ha cuadrado su piso, así que el motor del piso está en pausa
(ADR-0328) y no manda colgar nada. El botón contaba lo físico («Colgar en el piso · 3 tallas»), pero las celdas en ámbar y el filo seguían
al motor y no se pintaban. En Pantalón Carla se veían cuatro tallas en 0 con +6 y el botón decía 3: la talla 34, de las puntas y sin ventas,
el motor la deja en «mantener» y el botón la descuenta, pero la tira la dibujaba igual que las otras.

**Felipe eligió la opción A (2026-10-31), entre tres:** A, manda lo físico; B, manda el motor (en pausa, el botón diría «cuadra el piso
primero»); C, dejarlo así. **La regla única es `faltaColgar`** (`lib/existencias-tarjeta-compacta.ts`): falta colgar la talla que el motor
manda colgar, o la que tiene 0 colgadas y algo en almacén, salvo que el motor diga «mantener». La leen la celda en ámbar (`celdaTarjeta`),
el filo (`filoDeTarjeta`), el botón (`tallasSinColgar`) y la talla con la que abre el modal (`tallaDeEntrada`). La grilla «Todas» del modal
usa `celdaTarjeta` y dice lo mismo. La talla «mantener» vacía lleva el visto verde del modal («No hace falta colgarla»), también en la
leyenda del pie.

**Lo que se acepta a cambio.** Con el piso sin cuadrar, el número del almacén no está verificado: una talla en ámbar puede estar ya colgada.
Lo cubre el aviso «El piso de esta tienda nunca se ha cuadrado» de arriba. El consejo del modal («En pausa: mira si ya cuelga antes de
colgar más») sigue siendo el del motor, y los filtros «Hoy» y «Por colgar» también siguen al motor (fuera de esta decisión).

**Medido.** Las 15 tarjetas de la base local: cada botón dice tantas tallas como celdas en ámbar, y el filo sale en las 9 que piden algo.
Pantalón Carla: 3 en ámbar y la 34 con su visto. Al aparecer el ámbar, `tema:auditar` encontró el nombre de la talla en taupe sobre él a
3,8:1; ahora toma el color de su celda y la tarjeta queda sin hallazgos en claro y oscuro, a 1440 y a 375 px.

## Qué no se verificó

- **«+N» con datos reales:** la base local no tiene un modelo con más de 5 colores. Lo cubren la prueba de `coloresDeChapa` (6, 14 y
  el color elegido fuera de los tres) y la maqueta. Que el modal muestra todos los colores sí se probó, con un modelo de 3.
- **En oscuro, sobre una prenda negra, la chapa se distingue poco** (papel oscuro sobre negro). Se lee, pero si molesta, la chapa
  puede llevar un filo más claro solo en oscuro.
