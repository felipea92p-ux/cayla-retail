# ADR-0224 — Purgar por completo un producto de prueba y la venta de prueba que lo tocó

**Fecha:** 2026-09-26
**Estado:** **Corrida real HECHA en producción el 2026-09-26 a las 10:06 (Lima)**, con el «dale» de Felipe. Verificada por consulta directa (abajo). Respaldo: `respaldo_purgas.filas`, purga «purga TOP-0011 2026-09-26 10:06» (87 filas).
**Actualización 2026-09-28 (abajo):** el script alcanza productos con documentos (ventas con boleta de pruebas o nunca enviada, separaciones,
compras). **Blusa Xd y Test de Produto 2 purgados en producción** con ensayo y «dale»; Polo Básico frenado por 2 proformas (Felipe lo deja
para después) y Blusa Carlita con ensayo OK, esperando a Polo Básico.
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

## Actualización 2026-09-28 — productos con documentos

**Decide:** Felipe, 2026-09-28: todo el catálogo de producción era práctica. [ADR-0252](0252-eliminar-producto-con-historia-de-stock-solo-admin.md)
dejó que un Admin borre desde la web lo que solo tiene historia de stock; cuatro productos tenían **documentos** (alguien del otro lado) y quedaban
fuera del botón y de este script, que rechazaba todo lo que no fuera un ajuste simple y una nota interna: Polo Básico (`POL-0002`), Blusa
Carlita (`CMS-0001`), Test de Produto 2 (`POL-0005`) y Blusa Xd (`BLZ-0006`).

**Lo que había en producción (consultado en solo lectura el 2026-09-28):** 7 ventas de TRU, todas de un solo producto (ninguna mezclaba estos
cuatro con otros); 9 comprobantes: 4 notas internas (NV01-3 a 6), 2 boletas del entorno de pruebas de SUNAT (B004-28 y 29, aceptadas en *sandbox*)
y 3 boletas que nunca salieron de la base (B004-30 y 32, anticipos de separación; B004-31, la entrega que descuenta el anticipo); 2 separaciones
(APT-TRU-0004 entregada, APT-TRU-0005 **abierta** con S/ 15 por Yape); 1 compra (F001-000022, S/ 10,620 a crédito, sin pagar, repartida entre TRU y
AQP, con una reasignación, un lote, un envío y 3 costos); un conteo cerrado (#5) con líneas de Blusa Xd y Polo Básico; una bajada al piso con
líneas solo de Test de Produto 2; 3 cajas de TRU ya cerradas; ningún mes cerrado. **B004-2 y B004-3 llegaron a SUNAT en producción y no tienen
venta: no los cita ningún documento de estos productos.**

**DECIDÍ:** ampliar el mismo script, no escribir otro (una sola manera de romper la promesa de «no se borra», Brooks), con estas reglas:
1. **Una sola lista de lo que se borra** (`zz_borrar`: tabla + id; y las «hojas» sin id propio —stock, reparto de la compra, líneas de bajada,
   marcas de reintento, anticipos— que se van con su padre). De esa lista salen el candado, el respaldo, el borrado y la demostración. El
   candado por llave foránea deja de tener una lista de tablas «conocidas»: pregunta a **todas** las tablas de `retail` si alguna cita algo de la
   lista (sin contar las que también se borran). Una tabla que nazca mañana y cite una venta frena la purga sola, sin tocar el script.
2. **Nada se borra por omisión.** Dos parámetros nuevos, opcionales: `cayla_purga.separaciones` y `cayla_purga.compras` (ids, `-` si no hay).
   Si el producto está en un documento que no se nombró, el ensayo lo rechaza **con su id**; si un documento nombrado no tiene el producto
   (un id mal copiado), también.
3. **La línea roja de SUNAT, en tres capas.** Un comprobante con `entorno_transmision = 'produccion'` aborta en el acto (error, no aviso). Solo
   se borran tres clases: nota interna; lo que fue al entorno de pruebas (`sandbox`); y lo que nunca salió (pendiente, sin envío, sin respuesta,
   sin intentos, sin anulación pedida). Y al final se comparan las huellas md5 de TODOS los comprobantes de producción de la base: si uno cambió
   o faltó, no se guarda nada. Uno pendiente que el envío automático acaba de tomar (`proximo_reintento_at` en el futuro) espera 5 minutos.
4. **Separaciones y compras, enteras o nada.** Una separación no puede traer prendas de otros productos (liberar sus apartados reescribiría otra
   prenda) ni efectivo que entró a la caja con su propio movimiento; una compra no puede traer otras líneas, pagos, notas de crédito ni un lote
   con prendas de otra compra. El envío se va solo si se queda vacío. Una venta sí puede traer otras prendas: vuelven a su stock, como con Top Aurora.
5. **Candados de historial:** además de `movimientos` se apagan, solo dentro de la transacción, los de bajadas, marcas de reintento, costos,
   reasignaciones y cierres de compra; cada uno vuelve **al modo en que estaba** y se comprueba (el mismo patrón de ADR-0252).
6. **Series:** la de notas de venta vuelve si lo borrado era el final (y se identifica por su sede: dos sedes pueden llamar igual a su serie);
   **la de boletas y facturas no retrocede nunca**, aunque lo borrado sea el final: SUNAT o el PSE pudieron ver ese número y reusarlo sería un
   duplicado (la migración `20260924113817` cuenta que B004-4 y 5 existieron y ya no están).
7. `set constraints all immediate` antes de la demostración: las revisiones diferidas (el reparto de una compra entre tiendas) corren dentro del
   ensayo, que nunca confirma.
8. **Rastro:** una línea de Actividad por documento, en su módulo (`vender`, `apartados`, `facturas_compra`), y otra por el producto
   (`productos`); y la misma fila «eliminado» en `historial_producto_cambios` que deja ADR-0252.

`restaurar-purga.sql` devuelve también separaciones, pagos de separación, compras con su reparto, reasignaciones y cierres, lotes, envíos,
costos y anticipos; **se niega** si el respaldo trae una tabla que no sabe devolver (una restauración a medias es peor que ninguna) o si el
número de una nota ya lo tiene otra; identifica la serie por su id y **nunca la hace retroceder**; y a las otras prendas les **resta** lo que la
purga les devolvió en vez de pisar su stock con el número viejo (si la tienda siguió vendiendo, esa venta sigue contando).

**DESCARTÉ:**
- *Un segundo script para documentos.* Ganas: el de Top Aurora queda intacto. Pagas: dos maneras de borrar historia, con dos candados que
  envejecen distinto; la próxima tabla que cite ventas la conocería uno y el otro no.
- *Inferir solos los documentos a borrar* (toda venta, separación o compra que toque el producto). Ganas: un parámetro en vez de cuatro. Pagas:
  un producto que alguna vez se vendió de verdad se llevaría esa venta sin que nadie la nombre. Nombrarlos es el «dale» por escrito.
- *Borrar también B004-2 y B004-3.* No se tocan: llegaron a SUNAT en producción. No son de estos productos, y aunque lo fueran el script aborta.
- *Hacer retroceder B004 al 28 (o al 4).* Ganas: la serie sin hueco. Pagas: si alguno de esos números llegó al PSE, el próximo sería un duplicado.
  B004 sigue en 33: la próxima boleta real será B004-33.
- *Reescribir las cajas cerradas.* Su cierre guardado (lo contado ese día) se queda; la caja pierde la venta, no su arqueo. Igual que con Top Aurora.

**SE ROMPE SI:**
- **El envío automático toma una boleta pendiente en el mismo segundo de la purga.** No se rompe: la purga la bloquea `for update` al empezar
  y la toma usa `skip locked`; una que ya estaba tomada (reserva en el futuro) frena el ensayo con «espera 5 minutos».
- **Aparece una tabla nueva que menciona una venta en un jsonb, sin llave.** La búsqueda por id en todas las tablas la encuentra y frena. Así
  frenó a Polo Básico: 2 proformas (cotizaciones) guardan sus prendas en su detalle, sin llave.
- **Una purga borra una nota que era el final y después se emite otra con ese número.** Restaurar esa purga se niega con un mensaje claro; hay
  que decidir a mano (la nota nueva ya es de otra venta).

## Verificación (2026-09-28)

- `pnpm pruebas:purgar-producto` **89/89** (antes 36) en Postgres 17 desechable (344 migraciones + seed). Un segundo escenario reproduce a los
  cuatro productos en uno —carga inicial, bajada, movimiento interno con su marca, conteo, pedido no atendido, nota interna mezclada con otra
  prenda, boleta *sandbox*, separación entregada (anticipo + entrega) y otra abierta, compra repartida entre dos tiendas, reasignada, recibida en
  parte y con un faltante cerrado— y al lado una boleta de otra prenda **transmitida a producción**. El ensayo deja la base **entera** idéntica
  tabla por tabla, y purgar + restaurar la devuelve idéntica salvo Actividad, el historial del producto y la versión del catálogo (solo avanzan).
  Rechazos nuevos: la línea roja, un comprobante que intentó salir sin entorno, uno que se está enviando, separación o compra no nombrada,
  venta nombrada sin el producto, separación con otra prenda o con efectivo, compra con pago o con otra prenda, lote con otra prenda, aviso a la
  clienta, cambio de prenda, proforma sin llave. Restaurar tras una venta nueva (la serie de boletas y el stock siguen bien) y con el número de
  la nota reutilizado (se niega).
- `pnpm pruebas:eliminar-producto-con-historia` 52/52 y `pnpm pruebas:eliminar-producto` 35/35 con el restaurador nuevo.
- **Mutación:** 21 mutaciones, **20 detectadas**. Sobrevive `set constraints all immediate`: ninguna purga correcta deja una revisión diferida en
  falso, así que no hay escenario que la dispare; queda como cinturón. Apagando las dos primeras capas de la línea roja, la huella final (tercera
  capa) frena sola y la base queda intacta.
- **Lo que cazó la prueba:** (1) un `NULL`: sin entorno, `entorno = 'sandbox'` daba NULL y `not (… or NULL or …)` también, así que una boleta
  que ya había intentado salir se colaba sin contarse; (2) la serie se identificaba por (tipo, serie) y en local Lima y Trujillo comparten B001:
  el restaurador subía la serie de la otra sede.

## Producción (2026-09-28, Lima)

- **Sonda** (solo lectura, 12:47): 33 productos, 188 movimientos, 7 ventas, 11 comprobantes, 602 prendas, 87 filas de respaldo, libro 0
  descuadres, candados en su modo, huellas de B004-2 y B004-3 anotadas.
- **Ensayos** (con permiso de Felipe; cada lote termina en excepción): BLZ-0006, POL-0005 y CMS-0001 **OK**; POL-0002 **frenado** por 2 proformas
  vigentes de TRU (#2 del 22-sep, S/ 12,373.20, Polo Básico ×47 y 6 líneas de prendas que ya no existen; #3 del 23-sep, S/ 39.90). Después:
  la base idéntica a la sonda.
- **Corrida real** con el «dale» de Felipe, un producto por lote, verificando cada uno por fuera antes del siguiente:

| | Antes | Tras BLZ-0006 (14:11) | Tras POL-0005 (14:13) |
|---|---|---|---|
| Productos | 33 | 32 | 31 |
| Movimientos | 188 | 181 | 150 |
| Prendas en stock | 602 | 552 | 474 |
| Ventas | 7 | 7 | 6 |
| Separaciones · compras | 2 · 1 | 2 · 0 | 0 · 0 |
| Libro de movimientos vs stock | 0 descuadres | 0 | 0 |
| B004-2 y B004-3 (huella md5) | `0725b7f8…`, `680f21ae…` | iguales | iguales |
| Series B004 · NV01 | 33 · 7 | 33 · 7 | 33 · 7 |
| Respaldo | 87 filas | +36 («purga BLZ-0006 2026-09-28 14:11») | +111 («purga POL-0005 2026-09-28 14:13») |

  El conteo #5 conserva su cabecera y las 4 líneas de Polo Básico; la bajada de Test de Produto 2 conserva su cabecera sin líneas; las 3 cajas,
  su cierre guardado. La compra F001-000022 salió de Por pagar; la separación abierta APT-TRU-0005 (S/ 15 por Yape) ya no espera a nadie.

**Pendiente:** Polo Básico, cuando Felipe decida qué hacer con las 2 proformas (ampliar el script con `cayla_purga.proformas` o anularlas), y
justo después Blusa Carlita (si va antes, NV01-4 y 5 de Polo Básico impiden que la serie vuelva al 3 y queda un hueco).
