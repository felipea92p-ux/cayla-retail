# Maqueta · la tabla con superpoderes (2026-10-31)

Felipe eligió las tablas en **B · Placa Serena** (`../tablas-vidrio-2026-10/`) y pidió ir más allá del diseño: «que sea lo más
entendible posible y mejorar la tabla en todo aspecto: los filtros desde las cabeceras, que todo esté alineado al centro, cabeceras y
datos, que se vean claramente los datos y no con fuentes muy pequeñas, para que cualquiera pueda verla».

Abrir `index.html` (o con la config `maquetas` del navegador integrado). Va sobre el marco y las piezas ya elegidas
(`../vidrio-base-2026-10/`). La tabla es Órdenes de compra, con datos inventados. Todo se toca: los filtros, el orden, las píldoras,
«Limpiar todo», «Letra grande» y las filas.

## Los superpoderes (en A y en B)

1. **Letra que cualquiera lee:** el dato a 15 px (hoy 13,5), lo de debajo a 13 (hoy 12), la cabecera a 12,5 en tinta; filas de 60 px.
   Y «Letra grande» (17 px), que se recuerda en el aparato.
2. **Todo al centro**, cabecera y dato. Un monto va centrado en su columna, pero con sus cifras una bajo la otra: la caja del monto mide
   lo del más largo y adentro va a la derecha. Así se puede seguir comparando montos.
3. **Filtrar y ordenar desde la cabecera**, y se aplica al tocar: no hay botón «Aplicar». La cabecera filtrada lleva un punto rojo.
4. **Lo que ves, en una frase:** «Ves 2 de 14 órdenes: de Telas Mistral, en camino. Suman S/ 9,120.» Además, lo puesto va en píldoras
   que se quitan con su ✕, y hay «Limpiar todo».
5. **La cabecera te acompaña al bajar**: queda pegada bajo las islas, en vidrio.
6. **La fecha dice cuánto falta** («en 4 días»; si ya pasó y no llegó, «hace 2 días» en ámbar).
7. **Al pie, el total de lo que ves**, no el de todo.
8. **Cuando los filtros no dejan nada**, se dice qué pasó y cómo volver.

## Responsive (Felipe 2026-10-31: «que siempre sea super responsive, en todas las resoluciones posibles y en teléfono»)

La tabla no mira el ancho de la pantalla: **mira el suyo** (consulta de contenedor). Así responde igual con el menú abierto o plegado, en
una hoja, en un cajón o a media pantalla. Cuatro escalones, y lo que se esconde nunca se pierde, porque pasa a la línea de debajo del
proveedor:

| Ancho de la tabla | Qué se ve |
|---|---|
| 1060 px o más | Las siete columnas. |
| 840 a 1060 | Se van Sede y Artículos; bajo el proveedor, «6 artículos · Trujillo». |
| 660 a 840 | Se va también Llega; el proveedor suma «llega en 4 días» o «debía llegar hace 2 días». |
| menos de 660 | Cada fila es una tarjeta (número y total arriba, proveedor, estado). Los filtros pasan a ser píldoras arriba. |

En el teléfono, el filtro abre como la hoja del celular, a media altura y con su asa (ADR-0479), con opciones de 44 px.

La barra de la maqueta tiene **todos los anchos**: 320, 375 y 430 (teléfonos), 768 (tableta), 1024, 1280, 1440, 1920 y «Tu ventana».
Un aparato más ancho que la ventana se achica para verse entero, pero sigue midiendo su ancho real. Se midieron 216 combinaciones: los
nueve anchos, con el menú abierto y plegado, las tres caras, letra normal y grande, claro y oscuro. Nada se desborda, y el globo cabe
dentro del aparato en los nueve anchos. Quedó así, con el menú abierto: 1024 → 4 columnas, 1280 → 5, 1440 y 1920 → 7; tableta y
teléfonos → tarjetas.

## Cómo se filtra desde la cabecera

| Cara | Cómo es |
|---|---|
| Como ahora | La B elegida sin superpoderes: tocar la cabecera solo ordena. |
| **A · Globo desde la cabecera** (elegida) | Tocas el nombre de la columna y se abre ahí un globo de vidrio con «Ordenar» y «Mostrar solo», que dice cuántas filas hay de cada opción. |
| B · Fila de filtros | Bajo cada cabecera, su filtro siempre a la vista; el proveedor y el número de orden se buscan escribiendo. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que hay que decidir aparte

Llevar esto al código cambia qué hace la tabla, no solo cómo se ve. `<Tabla>` tendría que saber filtrar, y hoy cada pantalla filtra por
su cuenta, a veces en la base con `?q=`. Conviene empezar por las tablas que ya cargan todo en el navegador.

## Reglas que respeta

Solo tokens, en claro y oscuro; los colores de las prendas son dato. Movimiento una vez y sin rebote (el globo brota, la hoja sube, el ✓
se dibuja); todo se apaga con `prefers-reduced-motion`. Escape cierra el globo y devuelve el foco a su cabecera. Se midió en las tres
caras, con letra normal y grande, en los dos temas, a 1500 y a 375 px: nada se desborda.

## Lo que decidió Felipe

**A · Globo desde la cabecera**, con los ocho superpoderes (2026-10-31), y que **siempre sea super responsive, en todas las resoluciones
y en el teléfono** (ver «Responsive» arriba).
