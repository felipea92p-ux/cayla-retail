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
- **A la derecha:** nombre y precio, el color («Arena · 14 colores») con sus insignias, y **la tira de tallas en un pozo de hueso
  hundido**.
- **El pie a todo el ancho, debajo.** Al lado de la foto, «Colgar en el piso · 3 tallas» y «Más» no cabían: se cortaban 22 px a
  1920 px y 47 px a 375 px, medido en local. En la maqueta no apareció porque sus datos no tenían el «· N tallas».
- **Sombra de reposo y filo de luz**, y al pasar el mouse la tarjeta sube 3 px y su sombra se alarga (320 ms, `--ease-cayla`, sin rebote
  ni bucle; nada con `prefers-reduced-motion`). **Es la única superficie pegada al fondo con sombra**: el resto de `card-cayla` sigue
  sin ella.
- **Un filo de 3 px en el canto** (rojo si una talla se acabó, ámbar si falta colgar; `filoDeTarjeta`) dice desde lejos qué tarjetas
  piden algo. Repite lo que ya dicen la tira y el pie.
- **La línea chica se acorta desde 3 tallas** (`lineaGuardadas`: «+2», «0»), no desde 4. La tira ahora mide ~224 px y no 304, y con
  3 tallas «0 en almacén» se cortaba a media palabra.

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

## Qué no se verificó

- **«+N» con datos reales:** la base local no tiene un modelo con más de 5 colores. Lo cubren la prueba de `coloresDeChapa` (6, 14 y
  el color elegido fuera de los tres) y la maqueta. Que el modal muestra todos los colores sí se probó, con un modelo de 3.
- **En oscuro, sobre una prenda negra, la chapa se distingue poco** (papel oscuro sobre negro). Se lee, pero si molesta, la chapa
  puede llevar un filo más claro solo en oscuro.
