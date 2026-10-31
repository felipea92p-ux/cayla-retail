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

En el celular cada fila es una tarjeta y los filtros son píldoras arriba; el filtro abre como la hoja del celular, a media altura
(ADR-0479). Con la pantalla angosta se van las columnas que sobran, y bajo el proveedor aparecen sus artículos y su sede.

## Cómo se filtra desde la cabecera

| Cara | Cómo es |
|---|---|
| Como ahora | La B elegida sin superpoderes: tocar la cabecera solo ordena. |
| **A · Globo desde la cabecera** (recomendada) | Tocas el nombre de la columna y se abre ahí un globo de vidrio con «Ordenar» y «Mostrar solo», que dice cuántas filas hay de cada opción. |
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

Pendiente.
