# ADR-0643 — Colores combinados: «Hueso con azul» es un color de la carta

- **Fecha:** 2026-11-10 · **Estado:** construido y probado en local; **la migración está en producción desde el 2026-11-10** (pegada con el OK de Felipe; ver «Lo que pasó al pegar»). La web todavía no está publicada.
- **Rama:** `claude/variantes-multiples-colores-bc0ef0`. Números reservados con `pnpm reservar`.
- **Relacionados:** ADR-0024 (vocabulario cerrado de colores), ADR-0316 (ficha del color: «combina con», que es otra cosa), ADR-0634
  (estampados: un color con nombre propio y su color dominante), ADR-0393 (Recibir contando), ADR-0284 (guía de foco), ADR-0389 (guías).

## El problema

Felipe, 2026-11-10: hay vestidos de base hueso con detalles en azul, rojo y negro, y otros idénticos de base azul con negro. En Recibir
mercadería solo se puede elegir un color por prenda. Elegir «hueso» y «azul» crea **dos variantes** (una hueso, otra azul): ninguna es la
prenda que llegó. La salida a mano era elegir la base y anotar el resto en la descripción, y entonces el stock de «hueso con azul» y el de
«hueso con rojo» se mezclan en una sola posición, la tienda vende una creyendo que hay otra y el conteo no cuadra (principio 2).

## Lo que se decidió

Una mezcla es **un color más del catálogo**, armado con colores que ya existen. «Elegir varios colores» sí es el gesto, pero lo que se guarda
es UN color:

1. **Base:** `colores.componentes text[]` (la base primero y de 1 a 3 acompañantes; nulo en un color de un tono). El disparador
   `colores_valida_componentes` hace imposible un código que no existe, uno repetido, el propio color, una mezcla dentro de otra y cambiarle
   los colores a una mezcla que ya tiene prendas; ordena los acompañantes por código y copia de la base la familia y el hex.
   `colores_componentes_unico` impide la misma mezcla dos veces. `retail.color_combinado(p_componentes)` (security invoker, mismas reglas que
   «Nuevo color») busca la mezcla o la crea con su nombre («Hueso con azul y negro») y un código libre de 3 letras; si dos personas la crean
   a la vez, la segunda recibe la de la primera.
2. **Web:** cada color elegido en Nuevo producto y en Recibir trae **«+ acompañante»** (`ArmarMezcla`): se eligen los acompañantes, se ve el
   nombre armado y si ya existe, y la mezcla queda elegida **en lugar de la base**. En la carta, las mezclas van en su fila «Combinados» (se
   eligen por su nombre, como los estampados) y su punto se parte: la base a la izquierda. Atributos ▸ Colores las muestra aparte, dice su
   base y sus acompañantes, y al editarlas no ofrece tono ni familia.

`variantes`, `stock` y `movimientos` **no cambian**: «Hueso con azul» y «Azul con negro» son dos colores, así que son dos variantes con su
stock aparte, con la misma llave única de siempre (`variantes_producto_talla_color_unico`).

## Lo que doy por hecho (Felipe puede corregirlo)

- **Análisis, Frescura, el plan del piso y la demanda cuentan una mezcla en la familia de su base** (hueso → Neutro). No se programó: la
  mezcla guarda la familia de su base.
- **El orden de los acompañantes no importa** (hueso con azul y negro = hueso con negro y azul); la base sí.
- **Quién la crea:** quien hoy crea un color; el estado lo sigue poniendo `fn_colores_estado_trigger` (aprobado, ADR-0534).
- **Solo Nuevo producto y Recibir** ofrecen «+ acompañante». «Agregar colores» de la ficha, Producción e Insumos eligen una mezcla que ya
  exista desde la carta, pero no la arman.
- **Las demás pantallas** (Vender, Existencias, etiquetas, la tienda web) dibujan el punto con el hex de la base hasta que alguien las toque;
  el nombre completo sí sale en todas.

## Descarté

- **Una segunda columna de color en `variantes`:** cambia la llave única de la variante, el segmento de color del código de la etiqueta y cada
  consulta de ventas y stock. Toca el núcleo (principio 1) para algo que el catálogo resuelve.
- **Una tabla `variante_colores` (N:M):** ¿de qué color es una venta, una devolución, una fila de Frescura? Sin respuesta única.
- **Anotar los acompañantes en la descripción:** es lo que se hacía y es justo el estado inconsistente que se quiere evitar.
- **Que la persona escriba el nombre y el código de la mezcla:** dos personas escribirían «Hueso c/ azul» y «Hueso y azul». Lo arma la base.

## Se rompe si

- **La web se publica antes de pegar la migración:** la carta y Atributos piden `componentes`, que producción no tiene → no cargan los
  colores. Pegar la migración PRIMERO.
- **Cambia el hex de una base:** la mezcla guarda el hex viejo hasta que se toque; la carta igual dibuja bien porque arma el punto con los
  componentes.
- **Una pantalla nueva agrupa colores por tono sin `familiaEnCarta`:** pondría la mezcla junto a su base con el mismo círculo.

## Lo que pasó al pegar (2026-11-10)

- Se pegó con `apply_migration` del MCP de Supabase (proyecto de Dynamic, schema `retail`). Quedó registrada con la versión
  **`20261110224736`** (la hora de aplicación), no `20261110222000` como el archivo.
- El primer pegado llevó las funciones sin sus comentarios internos; se volvieron a crear con el texto exacto del archivo y
  `md5(pg_get_functiondef(...))` de `color_combinado` y `fn_colores_valida_componentes` coincide con el de la base local.
- Prueba en producción dentro de un bloque que termina en error (nada se guardó): `color_combinado(array['CRU','NEG','AZU'])` armó
  «Crudo con azul y negro» (código CAZ, familia neutro); la misma en otro orden devolvió `creado=false`; `ZZZ` se rechazó. Después: 0 mezclas
  guardadas, 109 colores, `authenticated` puede ejecutar la función y `anon` no.

## Verificación

- `pnpm pruebas:colores-combinados` (19 casos, ROLLBACK): crear, pedir la misma en otro orden, nombres con 1, 2 y 3 acompañantes, una
  colaboradora, los rechazos, familia y hex que siguen a la base, la mezcla con prendas, y la migración pegada dos veces.
- `lib/color-combinado.test.ts`: el nombre que arma la pantalla es el mismo que arma la base; el punto partido.
- En el navegador (local, 1440 px): Nuevo producto (Crudo + Azur eligió la mezcla que ya existía; Azur + Negro creó «Azur con negro» una sola
  vez, con doble clic), Recibir (la hoja se abre sobre «Crear la prenda que llegó» y se cancela sin guardar) y Atributos ▸ Colores.

## Actualización 2026-11-12 (ADR-0649)

La mezcla se arma en la misma carta, con un círculo grande, sin abrir otra hoja; las mezclas guardadas no salen en las listas (son de una sola prenda). Ver ADR-0649, decisión 6.

## Actualización 2026-11-13: el punto partido en las grillas y «+ acompañante» al editar la prenda

Felipe pidió que la mezcla se pueda armar también al editar un producto y que el círculo de la mezcla se vea en Catálogo, Existencias y Vender
(«actualmente no sale»). Nuevo producto ya lo tenía desde el 2026-11-10 (la píldora del color elegido trae «+ acompañante»). Cambia dos cosas
de «Lo que doy por hecho»:

- **«Agregar colores» y «Corregir / Cambiar color» de la ficha ahora arman la mezcla.** Agregar colores usa la misma carta que el alta
  (`ElegirColores conMezclas`), y le pasa la carta entera (`todos`) para los acompañantes: «Rojo con azul marino» se arma aunque la prenda ya
  venda Azul marino. Corregir color no tiene carta, sino un buscador (`ElegirUnColor`), así que su «+ acompañante» busca los acompañantes en
  un segundo buscador y usa el mismo panel (`ArmarMezcla desde="buscador"`). Si todavía no se eligió un color, la base es el que ya tiene la
  variante: «Negro» que en verdad es «Negro con crudo». La mezcla nueva entra al vocabulario de la ficha (`onColorCreado`) y se aplica con
  «Revisar y guardar», como cualquier corrección.
- **«+ Color combinado», junto a «+ Nuevo color»** (Felipe lo eligió entre tres, 2026-11-13): primero se toca la BASE en la carta entera
  («¿Qué color se ve más en la prenda?») y después de 1 a 3 acompañantes, en el mismo panel. Resuelve dos cosas: en Agregar colores la base
  puede ser un color que la prenda ya vende («Azul marino con crudo» en una prenda que vende Azul marino; antes no había cómo), y es una
  entrada a la vista —el enlace chico «+ acompañante» de cada píldora, que sigue, no se encontraba—. Va donde se arman mezclas: Nuevo
  producto, Recibir y Agregar colores. La mezcla queda elegida sola; la base no se elige.
- **Catálogo ▸ Productos, Existencias y Vender dibujan el punto partido.** Cada pantalla lee la carta entera con `componentes` (también lo
  desactivado: un color apagado sigue siendo el acompañante de una mezcla) y `tonosDeLasMezclas` arma, por nombre o por código, los tonos de
  cada mezcla. La variante lleva `colorTonos` y el punto se pinta con `fondoDelPunto` (en `background`, no en `background-color`: un degradado
  no es un color). El hex de la base sigue tiñendo la foto que falta (`MosaicoPrenda`). Lo cubren: la tarjeta y la tabla de Productos, su
  vista rápida y su filtro de colores; las tarjetas, las dos tablas, el filtro y el panel de una talla de Existencias; la tarjeta, la hoja de
  opciones y el buscador de Vender; «Ajustar stock» del modelo (la planilla, el talón y las etiquetas de lo que entró, con los tonos que
  Existencias ya tiene); y en Editar producto, la matriz, el panel de fotos por color e «Imprimir lo que entró». Queda con el punto liso
  solo la tienda web (ADR-0616: otra decisión).
- La ficha de Editar producto lee `componentes`: sin eso no reconocía una mezcla que ya existe y la volvía a crear.
