# ADR-0252 — Un Admin elimina un producto con su historia de stock (con respaldo), nunca con ventas ni documentos

**Fecha:** 2026-09-28
**Estado:** Construido y verificado contra un Postgres 17 desechable (52/52, 9 mutaciones detectadas, dos carreras con `COMMIT`) y en
navegador (seis casos, 375 px). **Migración `20260928230000` EN PRODUCCIÓN desde el 2026-09-28** (Felipe dio el «dale»; aplicada por MCP como
`eliminar_producto_con_historia`, versión `20260928170424`, después de un ensayo revertido; ver «Producción»). La web va en el PR.
**Número:** el archivo nació como `20260928220000` y chocó con `20260928220000_finanzas_modulos_delegables.sql` (ADR-0253, fusionado
el mismo día); se renombró a `20260928230000` sin cambiar su contenido. Producción no se entera: guarda la versión de la hora en que se aplicó.
**Decide:** Felipe, 2026-09-28: «me gustaría borrar todo mi inventario y productos que he creado porque eran de prueba pero también
tener el permiso de eliminarlo directo» → «mejor dame la opción para yo eliminar directo, que las cuentas de Admin tengan este permiso».
Alcance elegido entre tres opciones: **«Stock sí, ventas no»**. Sobre lo que cargó el equipo de TRU: **«Todo era práctica»**.
**Sobre:** [ADR-0218](0218-eliminar-un-producto-solo-si-nunca-se-movio.md) (eliminar sin historia) y [ADR-0224](0224-purgar-un-producto-de-prueba-con-su-venta.md)
(purga por script, que descartó un botón). Esta decisión **cambia parte de lo que ADR-0224 descartó**: ahora sí hay botón, pero solo
para la historia que no tiene a nadie del otro lado.
**Afecta:** `supabase/migrations/20260928230000_eliminar_producto_con_historia.sql`, `apps/web/components/EliminarProductoModal.tsx`,
`apps/web/lib/eliminar-producto-reglas.ts` (+ prueba), `packages/database/src/types.ts`, `scripts/purga/restaurar-purga.sql`,
`scripts/pruebas/eliminar_producto_con_historia.mjs` (nueva, sumada al CI), `scripts/pruebas/purgar_producto_de_prueba.mjs` (un caso ajustado).

## Contexto

Producción, consultada en solo lectura el 2026-09-28: **33 productos, 722 prendas (662 en TRU, 60 en LIM), 182 movimientos, 7 ventas**.
- **6 sin ninguna historia**: ya se podían eliminar desde ADR-0218.
- **22 cuya única historia es de stock**: la carga inicial (el alta con stock de ADR-0212 ya escribe una entrada), ajustes, bajadas al
  piso. Ninguno se vendió, se compró ni se trasladó. El botón de ADR-0218 no los alcanzaba y el único camino era el script de ADR-0224.
- **4 con documentos**: Polo Básico (4 líneas de venta), Blusa Carlita (2), Test de Produto 2 (2 ventas, 3 separaciones), Blusa Xd
  (1 compra, 3 costos, 3 ingresos por lote).
- La pieza «Monto manual» (ADR-0218).

**Lo que Felipe no había visto:** 21 de los 26 productos con historia **no los cargó él** sino el equipo de TRU (Danixa 10, Chiara 6,
Nicole, Janis, Diana, Melany, Pamela), entre el 22 y el 28 de septiembre. Felipe confirmó que todo era práctica. La ventana nueva
igual muestra **quién lo cargó y cuándo** antes de confirmar, porque dentro de un mes eso será inventario real.

## Decisión

**DECIDÍ:** partir la historia de un producto en dos clases, con una sola línea: **¿hay otra persona o dinero del otro lado?**

| Clase | Qué incluye | Quién lo elimina |
|---|---|---|
| **Stock** (la tienda contándose a sí misma) | movimientos de stock, unidades en stock, líneas de conteo, bajadas al piso, pedidos que no se pudieron atender, apartados ya cerrados sin dinero | **Solo un Admin**, con respaldo |
| **Documento** (del otro lado hay una clienta, un proveedor, otra sede o una caja) | líneas de venta, compras, producción, traslados, separaciones, cambios, prendas dañadas, prendas por regularizar, pedidos a otra sede, apartados abiertos o con adelanto, ingresos recibidos de un proveedor (lote o envío), costos registrados | **Nadie desde la web**: se desactiva, o el script de ADR-0224 con ensayo y «dale» |

Las piezas:
1. `fn_producto_historia` — la **única** definición de historia; cada renglón trae `borrable`. `fn_producto_se_puede_eliminar` (el Líder,
   ADR-0218) la lee y responde exactamente lo mismo que antes (primer commit, refactor puro: 35/35 sin cambios).
2. `fn_producto_como_eliminar` — lo que pregunta la ventana: `nivel` (libre / con_historia / con_documentos / sistema), si **esta cuenta**
   puede, la razón, cuántas prendas y movimientos se van y quién hizo el primer movimiento.
3. `eliminar_producto_con_historia` — solo `fn_es_admin()`. Todo o nada: candados de tabla primero; producto y variantes `for update`;
   vuelve a contar; respalda cada fila en `respaldo_purgas.filas`; apaga **solo dentro de su transacción** los tres candados de historial
   (`movimientos_inmutables`, `movimientos_internos_intentos_inmutables`, `bajada_piso_items_inmutables`); borra de hijos a padres (la
   línea de conteo y su ajuste, que se citan entre sí, en una sola sentencia); devuelve cada candado **al modo en que estaba** y lo
   comprueba; deja rastro en `historial_producto_cambios` y una línea en Actividad (módulo Productos).
4. `respaldo_purgas` entra a las migraciones (`if not exists`: en producción ya existe con las 87 filas de la purga de Top Aurora) y
   `restaurar-purga.sql` sabe devolver también lo nuevo. Un respaldo que no se puede restaurar es un respaldo falso (lección de ADR-0224):
   la prueba borra, restaura y compara **fila por fila**.

**DESCARTÉ:**
- *Botón para todo, ventas incluidas (la purga de ADR-0224 en la web).* Ganas: el botón nunca se niega. Pagas: cuando TRU venda de verdad,
  un clic de cualquiera de las **5 cuentas Admin** borra una venta cobrada y cambia lo que la caja espera; el historial deja de probar nada.
- *Todo, pero solo mientras la sede esté «en pruebas».* Ganas: poder total durante el piloto y cero riesgo después. Pagas: el doble de obra
  (un interruptor por sede y la purga de ventas como función) y, si nadie marca «en vivo», el mismo riesgo de la anterior.
- *Una puerta en el candado (`fn_historial_es_inmutable` que acepte un permiso de sesión).* Ganas: no hay DDL, no hay candado de tabla. Pagas:
  el núcleo aprende una excepción que cualquier sesión con SQL podría abrir; hoy solo el dueño de la tabla puede apagarlo, dentro de una
  transacción que o termina entera o vuelve sola. Es el mismo mecanismo de la purga y de `deshacer-90-dias.sql`: una sola manera de romper
  la promesa (Brooks).
- *Tratar los costos registrados como stock.* La base solo acepta costos con origen `compra` o `produccion`: siempre traen un documento
  detrás. Clasificarlos como documento dejó a la función sin un cuarto candado que apagar.
- *Reutilizar `fn_es_lider()` como en ADR-0218.* Felipe pidió «las cuentas de Admin»; un Líder que no es Admin ve por qué no puede.

**SE ROMPE SI:**
- **Una prenda se vende en el mismo segundo en que un Admin la borra:** no se rompe. La venta de OTRA prenda espera unos milisegundos y
  sigue (carrera 1, con `COMMIT` reales); una venta larga en curso hace que el borrado se rinda a los 3 s con «vuelve a intentar», sin
  tocar nada (carrera 2). Un movimiento de la prenda borrada que llega detrás no deja nada huérfano (su lectura ya no la encuentra).
- **Nace una tabla que cita `movimientos`, o un candado nuevo de DELETE en una tabla que la función borra:** la prueba de deriva falla en
  el CI hasta que alguien decide si esa tabla se borra con el producto o frena el borrado. En producción, sin esa decisión, la llave foránea
  frena el borrado entero con «otra parte del sistema todavía lo usa».
- **Un Admin borra de verdad lo que no era de prueba:** la función lo permite (es su permiso). Lo mitigan el nombre de quien lo cargó en
  rojo antes de confirmar, la línea en Actividad con su nombre y el respaldo, que se devuelve con `restaurar-purga.sql` (lo corre Felipe).

## Estimación (Jeff Dean)

Hoy 33 productos, 182 movimientos. A 3 años: ~200 productos, ~200 mil movimientos. El borrado toca solo las filas de UN producto
(decenas o cientos), por índice de `variante_id`; el candado de `movimientos` dura lo que dura la transacción (milisegundos). Es una
acción rara y deliberada de un Admin. No justifica ni una cola ni un índice nuevo.

## Lo que NO resuelve (dicho, no escondido)

- **Los 4 productos con documentos** (Polo Básico, Blusa Carlita, Test de Produto 2, Blusa Xd) no salen con el botón. Van por el script de
  ADR-0224, un producto a la vez, con ensayo y «dale». Hay que ampliarlo: hoy rechaza movimientos que no sean ajustes simples, boletas
  (aunque sean de *sandbox*), compras y separaciones.
- **El botón vive en Catálogo ▸ Productos** (vista rápida y menú «···»), no en Existencias. Se borra uno por uno.
- Quedan en su lugar (inertes): los archivos de foto en Storage, las filas viejas de `historial_producto_cambios` del producto, y la
  cabecera de un conteo o una bajada al piso que se quede sin líneas.
- Un conteo **abierto** pierde la línea del producto borrado. No se frena, porque un conteo no tiene a nadie del otro lado.

## Hallazgos del camino

- `movimientos_internos_intentos` (las marcas de reintento de «Reponer» y «Retirar», ADR-0208) tiene su **propio** candado de solo lectura.
  No aparecía en la primera lista de candados; lo encontró la prueba. Por eso existe la prueba de deriva de candados.
- `restaurar-purga.sql` respaldaba `producto_color_temporadas` pero no la devolvía. Se corrigió de paso: Top Aurora no tenía filas ahí.

## Verificación

- `pnpm pruebas:eliminar-producto-con-historia` **52/52** en Postgres 17 desechable (340 migraciones + seed + esta).
- **Mutación**, 9 de 9 detectadas: ventas borrables, apartado abierto borrable, lote borrable, costos borrables, Líder en vez de Admin,
  respaldo sin movimientos, candado devuelto en modo normal, apartado sin mirar el estado, y la ventana diciendo «puedes» a cualquiera.
- **Carreras con `COMMIT`** (dos y tres `psql` en paralelo): sin abrazo mortal (`deadlocks` 0), candados en su modo, nada huérfano.
- `pnpm pruebas:eliminar-producto` 35/35 (el Líder, sin cambios), `pnpm pruebas:purgar-producto` 36/36 (un caso ajustado: ahora el
  esquema de respaldo existe siempre; lo que no puede quedar tras un ensayo es una FILA), `pnpm pruebas:eliminar-marca` 21/21.
- Web: `vitest` 206 archivos en verde, `tsc` y `eslint` limpios. **Navegador** (andamio temporal, ya borrado): los seis casos (libre,
  con historia y Admin, con historia y Líder, con documentos, sistema, sin respuesta), el clic real llama a
  `eliminar_producto_con_historia` con el producto correcto y sale «eliminado»; a 375 px sube como hoja y se lee entero.

## Producción

UNA parte: funciones y un esquema de respaldo que ninguna pantalla usa; sin `alter` de tablas en uso ni políticas (ADR-0195). Orden:
**SQL primero, después la web** (lección del #444). Si la web llega antes, la ventana dice «No se pudo comprobar» y no ofrece borrar.
Plan: (1) ensayo en un solo lote que termina en excepción, con la sesión de un Admin: borrar un producto de práctica, comprobar que no
quedó nada, que el respaldo tiene sus filas y que los candados siguen en su modo; (2) comprobar que el lote no dejó nada; (3)
`apply_migration` con el «dale» de Felipe; (4) comprobar por efectos: funciones, `security definer`, permisos y md5 del cuerpo.

**Hecho el 2026-09-28 (Lima, tarde).** Ensayo en la base real, un solo lote que termina en excepción a propósito, con la sesión de
Felipe (Admin) y la de una líder que no es Admin: «Fdhh» (`CMS-0004`, 12 movimientos, 6 variantes) → `con_historia|true`, eliminado,
sin resto, movimientos 188 → 176, respaldo con sus filas (productos 1, variantes 6, códigos 6, stock 6, movimientos 12), candados en su
modo, libro 0 descuadres, 1 línea de Actividad; «Polo Básico» → `con_documentos`, rechazado por sus 4 líneas de venta; «Fhfh» con la
líder → `con_historia|false` y 42501. Después del lote: «Fdhh» intacto, 188 movimientos, respaldo en 87, sin funciones nuevas.
Recién entonces `apply_migration` (`20260928170424`). Verificado por efectos: las seis funciones con **md5 idéntico** a la copia local
probada (`eliminar_producto_con_historia` `f24ff965…`, `fn_producto_como_eliminar` `f6b42ef9…`, `fn_producto_historia` `9c76ec08…`,
`fn_producto_se_puede_eliminar` `3f9fbbe5…`, `fn_producto_es_pieza_del_sistema` `797465df…`, `eliminar_producto` sin tocar `331ad3b5…`),
una sola versión de cada una, `authenticated` sí y `anon` no en las tres públicas, las dos internas sin permiso para la API;
`respaldo_purgas.filas` con sus 87 filas, RLS encendido y sin lectura para `authenticated`. La ventana, sobre los 33 productos reales:
**6 libres + 22 con historia (Admin puede) = 28**, 4 con documentos, 1 pieza del sistema.

## Actualización 2026-09-28 (noche): «Eliminar» también desde Existencias

**Pedido:** Felipe abrió Inventario ▸ Existencias, tocó «Ajustar inventario» en «Body Amir» y preguntó «¿ya puedo eliminar de
existencias?». El botón vivía solo en Catálogo ▸ Productos. Buscarlo donde se mira el inventario es lo natural: el error era de
dónde estaba el botón, no suyo (Norman). Felipe: «sí, agrégalo en Existencias».

**DECIDÍ:** el detalle de una prenda (`DetallePrendaExistencias`, la flecha › de cada fila) termina con «Eliminar el producto», en
rojo profundo, **solo para un Admin** y solo mirando la sede activa, como todo lo que escribe desde ahí. No para todo Líder como en
Catálogo: toda fila de Existencias sale de `stock`, que solo escribe un movimiento, así que todo lo que se ve ya tiene historia, y
con historia la base solo deja borrar a un Admin; un Líder vería un botón que nunca funciona. El permiso se suma a `permisosDelDetalle` (`lib/existencias-permisos.ts`, con su prueba), no a la pantalla. Al tocarlo se cierra
el detalle y se abre la MISMA `EliminarProductoModal` (ADR-0136: nada de modal sobre modal): pregunta a `fn_producto_como_eliminar`,
y la base decide igual que desde Productos. Ninguna migración.
**DESCARTÉ:** un «Eliminar» por talla o por color: la base borra el producto entero y un botón por color mentiría sobre lo que hace. Y
leer en Existencias cuántas variantes tiene el producto para los textos: su lectura de catálogo pide a propósito una sola variante
por producto (`existencias-catalogo.ts`, la trampa de la columna `costo`). En su lugar, la ventana acepta no saberlo
(`numVariantes` en `null`) y dice «todas sus tallas y colores». El estado sí se lee de esa misma lectura: la página lo pega a cada
fila (`conEstadoProducto`), porque descontinuar no apaga las variantes y un producto descontinuado sigue saliendo en Existencias; si
la lectura falla, llega `null` y la ventana ofrece descontinuar como a uno activo.
**SE ROMPE SI:** una líder abre «Pantalon Jean · azul» y cree que borra solo el azul. Lo cubre el texto del botón («Todas sus tallas y
colores, en todas las sedes») y el de la ventana; y la base igual no deja borrar nada con ventas, compras ni traslados.

Desde Catálogo ▸ Productos el texto ahora dice «sus 6 variantes (todas sus tallas y colores)»: lo mismo con el número.
Verificado en navegador con un andamio temporal (ya borrado): el botón aparece al final del detalle, abre la ventana sin apilar
modales, el clic llama a `eliminar_producto_con_historia` y sale «eliminado»; sin permiso no se ve; a 375 px sin desplazamiento
lateral. `vitest` en verde, `tsc` y `eslint` limpios.

**Revisión adversarial** (tres lentes y un escéptico por hallazgo; 10 agentes). Confirmó tres defectos, arreglados antes de publicar:
(1, media) el botón se ofrecía a todo Líder y desde Existencias solo un Admin puede completarlo → solo Admin; (2) el estado iba en
`null` aunque la página lo lee, y a un producto ya descontinuado se le sugería descontinuarlo → `conEstadoProducto`; (3) borrar una
prenda marcada dejaba la barra de marcadas en «0 prendas · 0 tallas» y escondía «Escanear prenda» en el celular → la barra y el botón
se deciden por lo marcado que sigue en la lista (`filasMarcadas`), no por el conjunto crudo. Refutó uno: mirando otra sede el botón
no aparece, por la misma regla que el resto de lo que escribe.

