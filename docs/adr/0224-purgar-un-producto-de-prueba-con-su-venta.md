# ADR-0224 — Purgar por completo un producto de prueba y la venta de prueba que lo tocó

**Fecha:** 2026-09-26
**Estado:** **Corrida real HECHA en producción el 2026-09-26 a las 10:06 (Lima)**, con el «dale» de Felipe. Verificada por consulta directa (abajo). Respaldo: `respaldo_purgas.filas`, purga «purga TOP-0011 2026-09-26 10:06» (87 filas).
**Decide:** Felipe, 2026-09-26: «quiero eliminarlo por completo» (Top Aurora, `TOP-0011`) y confirmó que la venta `NV01-000007` «toda fue de prueba».
**Afecta:** `scripts/purga/purgar-producto-de-prueba.sql`, `scripts/purga/restaurar-purga.sql`, `scripts/pruebas/purgar_producto_de_prueba.mjs`
(sumada al CI), y un esquema nuevo `respaldo_purgas` (una tabla, creada por el propio script). **No toca ninguna función, tabla ni política de `retail`,
ni la web.** Convive con el botón «Eliminar producto» de [ADR-0218](0218-eliminar-un-producto-solo-si-nunca-se-movio.md) (PR #469, ya en `main`), que solo borra productos SIN historia: son casos distintos, y este es el que sirve cuando SÍ la hay.

## Contexto

«Top Aurora» se dio de alta el 24-sep como prueba (con la marca «Cayla 2», tecleada por error) y desde entonces estorba: 8 variantes, 65 prendas en
Tienda TRU, 15 movimientos y 7 líneas de venta. **No se puede borrar por los caminos normales**: `movimientos` es inmutable por trigger, y todas las llaves
que apuntan a `variantes` son `NO ACTION`. El botón «Eliminar producto» solo borra un producto que nunca se movió; este se movió.

Consultado en producción (solo lectura, 2026-09-26): nada más cita a Top Aurora que `movimientos`, `venta_items`, `stock`, `codigos_barras` y `variantes`.
Pero **sus 7 líneas de venta están dentro de una venta con 19 líneas**: la nota interna `NV01-000007` (S/ 2,007.10 en efectivo, 25-sep, caja de TRU
**abierta**, sin transmitir a SUNAT) también vendió 13 prendas de otros productos (Blusa Carlita, Jean Baggy, Polo Básico, Blusa Xd). Borrar «solo Top Aurora»
obliga a reescribir una venta y su pago; borrar lo que sacó de las otras prendas descuadra su stock (un snapshot derivado de los movimientos).

El precedente es `scripts/demo/deshacer-90-dias.sql` (2026-09-24): un script de un solo uso que apaga el candado de historial dentro de una transacción,
borra de hijos a padres, devuelve contadores y vuelve a encender el candado.

## Decisión

**DECIDÍ:** un script de un solo uso, **parametrizado** (`cayla_purga.producto`, `cayla_purga.ventas`) y **ensayo por defecto**, que en UNA transacción:
(1) se niega a tocar nada que no entienda; (2) respalda cada fila en `respaldo_purgas.filas` (jsonb); (3) devuelve a stock lo que la venta sacó de OTRAS
prendas; (4) borra de hijos a padres apagando `movimientos_inmutables` solo dentro de la transacción y dejándolo en ALWAYS; (5) devuelve la serie de
comprobantes solo si la nota purgada era la última; (6) deja una línea en Actividad; (7) **demuestra el resultado antes de cerrar**: nada de lo borrado sigue
vivo, el stock devuelto es exacto, y **el libro de movimientos cuadra con el stock en TODA la base (0 filas descuadradas antes y 0 después)**. Si cualquiera
falla, todo se deshace. Un segundo script, `restaurar-purga.sql`, devuelve el respaldo fila por fila.

La venta «nunca ocurrió» (se borra entera y sus otras prendas vuelven a su fila de stock —la misma sububicación de la salida—), en vez de quedar como
una venta anulada: una anulada sigue citando las variantes de Top Aurora y no libera nada.

**DESCARTÉ:**
- *Una función permanente (`purgar_producto_de_prueba`) llamable desde la web.* Ganas: un clic. Pagas: `movimientos_inmutables` es la promesa del sistema («el
  historial no se borra»); un botón que la rompe la vuelve opcional para cualquiera con permiso. Un script que corre una persona, con ensayo y «dale», deja la
  fricción donde debe estar. Si algún día hace falta a menudo, se decide entonces.
- *Reescribir la venta quitando solo las 7 líneas de Top Aurora* (S/ 2,007.10 → S/ 1,032.10, con su pago y su nota). Ganas: las otras 12 líneas siguen
  vendidas. Pagas: se falsifica una nota de venta y un pago; el documento diría algo que nunca se cobró tal cual.
- *`anular_venta` y dejar Top Aurora.* Ganas: es el camino normal, con su rastro. Pagas: no elimina nada; el producto sigue existiendo con sus 15 movimientos.
- *No devolver el stock de las 12 prendas ajenas.* Ganas: menos código. Pagas: su stock quedaría 13 prendas por debajo de lo real y el libro contaría una venta
  que se borró.
- *Devolver el contador de códigos de producto (`TOP` a 10).* Ganas: no queda un hueco. Pagas: el próximo producto `TOP` se llamaría `TOP-0011` otra vez, y
  una etiqueta o un mensaje viejo apuntaría a otra prenda. **Un código que existió no se reutiliza.** La serie de notas sí retrocede (solo si era la última):
  un documento numerado no debe tener huecos por una prueba.
- *Borrar la línea de Actividad de la venta.* Imposible y correcto: `trg_actividad_inmutable`. Se deja UNA línea nueva que cuenta qué pasó.

**SE ROMPE SI:**
- Alguien vende una de las 12 prendas entre el ensayo y la corrida real: no se rompe (el stock a devolver se lee dentro de la corrida real, y el libro se
  vuelve a comprobar), pero el resumen del ensayo ya no describe lo que va a pasar. Por eso se corre a las 3 de la mañana y se mira el resumen de la corrida.
- Se apaga el candado y la conexión se cae a medias: DDL transaccional; sin `commit`, vuelve solo. El script comprueba al final que quedó en ALWAYS.
- Otra tabla llega a citar `variantes` sin llave foránea (un uuid suelto): el script busca el id en todas las tablas restantes y aborta si lo encuentra.
- Se corre sobre una venta con boleta o factura: aborta. Una nota con validez ante SUNAT, o ya transmitida, no se borra jamás con un script.

## Lo que descubrió la prueba (y por qué existe `restaurar-purga.sql`)

Mi primera receta de restauración, `insert into … select * from jsonb_populate_recordset(…)`, **falló**: `venta_items.subtotal` es una columna generada y la base
no deja reinsertarla (`cannot insert a non-DEFAULT value into column "subtotal"`). Un respaldo que no se puede restaurar es un respaldo falso. Por eso hay un
script de restauración que arma la lista de columnas sin las generadas, con `session_replication_role = replica` (como `pg_restore --disable-triggers`) para que
los disparadores no reescriban las filas, y que comprueba el libro al final. La prueba lo ejercita y compara **fila por fila** lo restaurado contra lo
respaldado.

## Qué se ve, y qué no, después

- Top Aurora, su venta, su pago y su nota desaparecen; las 12 líneas ajenas vuelven a su stock; la caja de TRU deja de esperar los S/ 2,007.10.
- En Actividad quedan **dos** líneas: la original («vendió 28 prendas por S/ 2,007.10 · NV01-000007») y la nueva («se deshizo la venta de prueba…»). Es
  inmutable a propósito.
- **«Cayla 2» ya se pudo eliminar** (mientras Top Aurora existía, la citaba): Felipe la eliminó desde Marcas justo después de la purga (ADR-0217), sin
  necesidad de re-marcar nada. Comprobado en producción: 79 marcas, 79 vínculos, 0 huérfanos.
- No se borran los archivos de foto en Storage (Top Aurora no tenía).

## Verificación

- `pnpm pruebas:purgar-producto` **36/36** en Postgres 17 desechable (303 migraciones + seed): ensayo, definitivo, respaldo restaurado idéntico fila por fila,
  6 rechazos (otra venta, boleta, venta anulada, traslado, libro descuadrado, parámetros), serie que no retrocede si la nota no era la última, repetir.
- **Mutación:** sin devolver el stock → 16/36 (lo frena el propio script); `enable trigger` a secas en vez de ALWAYS → 16/36 (idem); sin el chequeo de «otra
  venta» → 35/36; serie que retrocede siempre → 35/36; sin el chequeo de nota interna → 35/36; sin respaldo → 29/36. Las seis se detectan.
- **Ensayo en producción** (2026-09-26 03:13 Lima, sin ventas desde el 25-sep; excepción a propósito): 1 producto · 8 variantes · 27 movimientos · 1 venta ·
  19 líneas · 1 pago · 1 comprobante · **13 prendas devueltas a stock en 12 filas** · libro 0 descuadres antes y después · 87 filas respaldadas. Comprobado
  después: producto, variantes, movimientos (112), venta y líneas (19) intactos, NV01 en 8, sin esquema de respaldo, candados en ALWAYS.
- Antes de la corrida real el libro ya cuadraba en producción: 79 filas de stock, 0 descuadres (fórmula: entrada +, salida −, ajuste ±, traslado −origen +destino).

## Corrida real (2026-09-26 10:06 Lima)

Se corrió con `cayla_purga.modo = definitivo`, después del ensayo del mismo día (03:13) y antes de nada más. A las 10:04 se volvió a comprobar que producción
no había cambiado desde el ensayo (mismos 112 movimientos, 7 ventas, stock 363, NV01 en 8; `actividad` sí había crecido en 2 líneas por otras causas).
Verificado después con una consulta aparte, sin fiarse del resumen del propio script:

| | Antes | Después |
|---|---|---|
| Producto `TOP-0011`, sus 8 variantes, la venta, sus 19 líneas y la nota NV01-000007 | existen | **no existen** |
| Ventas | 7 | 6 |
| Movimientos | 112 | 85 |
| Stock total (prendas) | 363 | 311 (−65 de Top Aurora, +13 devueltas a otras prendas) |
| Serie NV01, siguiente número | 8 | 7 |
| Actividad | 43 | 44 (una línea `prueba_deshecha`; la original se queda) |
| Libro de movimientos vs stock | 0 descuadres | **0 descuadres** |
| `movimientos_inmutables` / `movimientos_sin_truncate` | ALWAYS | ALWAYS |
| `respaldo_purgas.filas` | no existía | 87 filas, RLS encendido, sin permisos para `anon`/`authenticated` |
| Productos con la marca «Cayla 2» | 1 | **0** (ya se puede eliminar desde Marcas, ADR-0217) |

## Cómo se corre otra vez (solo con el «dale» de Felipe)

1. Parámetros y modo en la misma llamada, antes del script: `select set_config('cayla_purga.producto','<CÓDIGO>',false)`,
   `select set_config('cayla_purga.ventas','<ids de venta, coma; - si no hay>',false)`; primero SIN `cayla_purga.modo` (ensayo, termina en excepción con el resumen), y
   con `select set_config('cayla_purga.modo','definitivo',false)` solo después.
2. Volver atrás: `scripts/purga/restaurar-purga.sql` con `cayla_purga.nombre` = el nombre de la purga que trae el resumen («purga TOP-0011 2026-09-26 10:06»).
   Probado en la base desechable; en producción solo se comprobó que este rol puede poner `session_replication_role = replica`.
3. `respaldo_purgas.filas` se conserva. Cuando Felipe confirme que no hace falta volver atrás, se borra a mano (es un respaldo, no historia del negocio).
