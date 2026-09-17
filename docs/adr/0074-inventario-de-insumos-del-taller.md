# ADR-0074 — Inventario de insumos del Taller: entra, se descuenta al cortar, avisa cuando falta

**Fecha:** 2026-09-17
**Estado:** Aplicado en local (`20260917124059_materia_prima_taller.sql`), verificado con
9 escenarios en `psql` + rollback. **Producción: NO aplicada, y NO se puede pegar tal
cual** — choca de nombre con tablas huérfanas ya existentes en producción
(`retail.insumos`/`insumo_lotes`/`movimientos_insumo`/`v_insumo_saldos`, 0 filas, del
volcado de unificación de julio). Ver "Addendum 2026-09-17" más abajo — requiere una
decisión de Felipe antes de reescribir y aplicar. Entra al diccionario
(`docs/datos/generado/`) recién cuando se aplique allá.
**Afecta:** tablas nuevas `retail.insumos`, `retail.insumo_stock`,
`retail.insumo_movimientos`, `retail.produccion_insumos`; funciones nuevas
`retail.recibir_insumos`, `retail.registrar_consumo_insumos`,
`retail.fn_aplicar_movimiento_insumo`. **No toca** `abrir_produccion` /
`cerrar_produccion` / `anular_produccion` / `revertir_produccion`
(`20260915130000_produccion_del_taller.sql`), ni el formulario
`NuevaOrdenProduccionForm.tsx` — conectar la pantalla es trabajo de otra sesión. Módulo
10 · Producción del Taller. Decisión de negocio: **D-47**
(`docs/datos/DECISIONES-2026-09-12.md:242-244`).

## El problema

`producciones.costo_tela`/`costo_avios` son montos que alguien teclea en
`abrir_produccion`. Nadie sabe cuánta tela queda en el Taller, ni si el monto tecleado
corresponde a lo que salió del estante — y `producciones.costo_unitario` (columna
generada) hace matemática exacta sobre tres números que pueden ser inventados. Eso se
derrama fuera del Taller: D-31 mide el Taller por costo absorbido y a cada tienda por
margen contra ese costo; si el costo es tecleado, las dos medidas son estimaciones con
cara de dato. Diseño completo (tablas, por qué no reusar `bom_items` ni `variantes`) en
`docs/datos/10-ROADMAP-DATOS.md:274-423`.

## Decisión

**DECIDÍ: las 4 tablas del roadmap, sin recortar el consumo.** `insumos` (catálogo,
hermana de `productos`), `insumo_stock` (snapshot por ubicación, `numeric` con
decimales — 2,35 m de tela es válido, `stock.cantidad` es `integer` y lo trunca),
`insumo_movimientos` (historial append-only, calcado de `movimientos`, mismo candado
D-22), `produccion_insumos` (el puente: qué se cortó, a qué costo, en qué corrida). El
roadmap ya advertía que la mitad que importa es el consumo, no la entrada — construir
solo `insumo_stock` que crece y nunca baja habría dejado el problema real (costo
estimado) intacto.

**DECIDÍ: `recibir_insumos(p_ubicacion_id, p_items, p_compra_id, p_nota)` y
`registrar_consumo_insumos(p_produccion_id, p_items, p_nota)`, con un motor mecánico
compartido `fn_aplicar_movimiento_insumo`** — mismo patrón de tres piezas que
`recibir_lote`/`registrar_venta` + `fn_aplicar_movimiento` (`20260914230000`): la RPC
valida negocio y arma la fila de movimiento, el motor mecánico mueve `insumo_stock`.
Un motor compartido entre las dos RPC evita duplicar la lógica de stock en dos lugares
— la clase exacta de bug que causó ADR-0031 (una reconstrucción de stock que "olvidó"
el almacén).

**DECIDÍ: candado de concurrencia con `for update`, mismo patrón que
`fn_aplicar_movimiento`.** `fn_aplicar_movimiento_insumo` bloquea la fila de
`insumo_stock` ANTES de leer `cantidad` en la rama `salida`: dos corridas del Taller
cortando la misma tela en el mismo milisegundo se serializan ahí — la segunda espera a
que la primera termine su transacción, en vez de que las dos lean "hay 5 m" y las dos
completen sin que ninguna vea lo que la otra sacó. Verificado en el escenario 3 (abajo):
pedir 100 m cuando quedan 6,5 falla limpio, sin tocar el stock.

**DECIDÍ: `registrar_consumo_insumos` recalcula `producciones.costo_tela`/`costo_avios`
sumando `produccion_insumos` real, pero SOLO el balde que el consumo tocó.** Es la
pieza que cumple D-47 de verdad: si nada actualiza `costo_tela` desde el consumo real,
`producciones.costo_unitario` sigue siendo la misma estimación de siempre y esta
migración sería solo un almacén de insumos en paralelo que no habla con el costo — el
error que el roadmap ya nombra como "hecho a medias". Pero pisar SIEMPRE los dos
campos (incluso a 0 cuando no hay filas de ese tipo) habría borrado en silencio un
`costo_avios` tecleado a mano en una corrida que todavía no registra avíos por insumo
— un estado peor que el actual. Por eso cada campo se pisa solo si existe al menos una
fila de `produccion_insumos` de ese tipo para esa corrida; si no, se conserva el valor
tecleado. Verificado en el escenario 6.

**DECIDÍ: `registrar_consumo_insumos` exige `producciones.estado = 'en_proceso'`.** El
consumo se registra ANTES de cerrar, nunca después. Compone así con
`cerrar_produccion` SIN TOCARLA: esa función hace
`costo_tela = coalesce(p_costo_tela, costo_tela)`, así que si el Taller llama
`registrar_consumo_insumos` antes y `cerrar_produccion(..., p_costo_tela => null, ...)`
después, el costo real ya calculado se preserva solo. Permitir el consumo DESPUÉS de
cerrada reescribiría `costo_unitario` (generada) sin que `variantes.costo` —ya fijado
por `cerrar_produccion` en ese momento— se entere: dos números que deberían coincidir y
dejan de hacerlo, exactamente el estado inconsistente que el principio 2 prohíbe.
Verificado en el escenario 5.

**DESCARTÉ: tocar la firma de `cerrar_produccion` para que reciba insumos directo.**
`registrar_produccion`/`cerrar_produccion` ya sufrieron el bug de sobrecarga viva que
describe `docs/datos/modulos/10-produccion-del-taller.md` (16 argumentos en producción,
15 en local, sin migración gemela — hueco 1 del módulo): un `create or replace` con un
parámetro nuevo NO reemplaza la función si el tipo de la lista cambia, crea una
segunda. Agregar un parámetro a `cerrar_produccion` habría reproducido ese patrón. Una
función nueva y composable es más segura y no exige tocar el formulario existente.

**DESCARTÉ: idempotencia por `p_token`,** como tienen `abrir_produccion`/
`registrar_venta`. Exigiría una tabla cabecera para la recepción (`p_token` vive en una
fila única; acá no hay una fila por recepción, son N filas de `insumo_movimientos`) que
el roadmap no pide. Se agrega el día que un reintento de red duplicado sea un problema
real medido, no antes (principio 5: diseñar para el volumen que viene).

**DECIDÍ: revocar `EXECUTE` de `fn_aplicar_movimiento_insumo` a `public`/`authenticated`,
más allá de lo que pedía "mismo patrón que `fn_aplicar_movimiento`".** Verificado
directo contra el Postgres local: `fn_aplicar_movimiento` (el original, sin tocar) es
ejecutable hoy por `anon` — sin sesión — porque Postgres otorga `EXECUTE` a `PUBLIC`
automáticamente al crear una función y nadie lo revocó ahí. Como el motor no valida
permiso ni dueño del movimiento (confía en que quien lo llama ya validó), cualquiera
con un `movimiento_id` de entrada observado (ej. en una respuesta previa de la API)
podría reproducirlo directo y duplicar stock, sin autenticarse. Es el mismo hallazgo,
en la misma clase de función, que ya llevó a revocar `fn_recalcular_costo_variante`
(`20260916090000`). Reproducir el patrón de locking sin reproducir también el agujero
no tenía sentido, y cerrarlo en mi función nueva no toca ni arriesga nada existente:
verificado que `recibir_insumos`/`registrar_consumo_insumos` la siguen llamando sin
problema (son `security definer`, corren con el privilegio del dueño). **No toqué
`fn_aplicar_movimiento` original** — mismo hallazgo, pero cerrarlo ahí es una migración
aparte que audita todos sus call sites, fuera del alcance de esta tarea. Queda
flagged para revisión.

**DESCARTÉ: una RPC de ajuste/conteo de insumos en este cambio.** El check
`insumo_movimientos_cantidad_valida` ya deja `tipo = 'ajuste'` con cantidad con signo
(copiado de `movimientos_cantidad_valida`) y `fn_aplicar_movimiento_insumo` ya sabe
aplicarlo — el motor queda listo, pero ninguna RPC de esta migración lo emite. Fuera
del alcance pedido (solo entrada + consumo).

## Decisiones de diseño distintas al roadmap, y por qué

El roadmap (`docs/datos/10-ROADMAP-DATOS.md:274-423`) diseña estas tablas contra
`sede_id → sedes(id)` y liga el puente de compra a `compras_comprobantes`. **Ninguna de
las dos existe en este repo.** Verificado contra el Postgres local antes de escribir una
sola línea: `sedes` nunca se creó como tabla en `supabase/migrations/` (búsqueda vacía);
el esquema real usa `retail.ubicaciones`/`ubicacion_id` desde `0001`/`0002`, y
`fn_puede_operar_ubicacion` (no `fn_puede_operar_sede`) es la función de permiso vigente
— confirmado también en el propio Postgres local vía `\d retail.producciones`. La tabla
de facturas de compra real es `retail.compras` (`20260912231956_compras_desde_factura.sql`),
no `compras_comprobantes`. Esa sección del roadmap describe el diseño de las tablas
correctamente, pero con nombres de columna de un estado del esquema anterior a la
migración de Producción del Taller a `ubicaciones` (2026-09-15) — **no es una decisión
mía, es una corrección de nombre para que el archivo corra contra el Postgres real**:

- `insumo_stock`/`insumo_movimientos.ubicacion_id → ubicaciones(id)` en vez de
  `sede_id → sedes(id)`.
- `insumo_movimientos.compra_id → compras(id)` en vez de
  `compra_comprobante_id → compras_comprobantes(id)`. Además, el vínculo queda a nivel
  de la FACTURA (`compras`), no de la línea (`compra_items`): `compra_items` modela
  prendas (`producto_id`/`variante_id`), no insumos — ligar al nivel de línea exigiría
  agregarle una columna `insumo_id` a `compra_items`, fuera del alcance de "tablas +
  RPC de insumos" que pidió esta tarea.
- El mapeo `insumos.tipo = 'empaque'` no tiene columna propia en `producciones` (solo
  hay `costo_tela`/`costo_avios`/`costo_maquila`): se cuenta junto a `costo_avios`. Si
  el Taller necesita ver el empaque separado, es una columna nueva en `producciones` —
  cambio de núcleo, no de esta migración.

Este hallazgo (esa sección del roadmap describe un esquema de antes del corte a
`ubicaciones`) es más amplio que esta tarea — alcanza también a la sección de
Prioridad 1 (compras/gastos) del mismo documento, que también usa `p_sede_id`. Lo dejo
marcado en el propio roadmap (ver abajo) y aparte, para que se revise entero.

## Cómo se verificó

8 escenarios en una transacción `psql` con `request.jwt.claim.sub` simulado (mismo
patrón que ADR-0066), terminada siempre en `ROLLBACK` — nada quedó escrito en el
Postgres compartido (confirmado: `select count(*) from insumos where codigo =
'TEST-POP-001'` devuelve 0 después):

1. `recibir_insumos` 10 m de una tela nueva al Taller → `insumo_stock.cantidad = 10.000`.
2. `registrar_consumo_insumos` 3,5 m a S/8.50 → stock baja a 6.500; `producciones.costo_tela`
   pasa de 0 a 29.75; `costo_avios` sigue en 0 (no tocado, no hay filas de avío);
   `produccion_insumos` tiene 1 fila con `costo_total = 29.75` (generada); `insumo_movimientos`
   tiene la entrada y la salida.
3. Pedir 100 m cuando quedan 6,5 → `Stock insuficiente del insumo: hay 6.500 y se pide
   sacar 100.000`; el stock queda intacto tras el rollback al savepoint.
4. `cerrar_produccion` (sin tocar) con `p_costo_tela => null` → `costo_unitario` generado
   = 5.95 = round(29.75 / 5, 2): el costo real calculado por `registrar_consumo_insumos`
   sobrevivió el cierre sin que `cerrar_produccion` supiera nada de insumos.
5. `registrar_consumo_insumos` sobre esa misma orden ya `terminada` → `El consumo de
   insumos se registra antes de cerrar la orden — esta ya está terminada`.
6. Una segunda orden abierta con `p_costo_avios => 15.00` tecleado, consumo de solo
   tela → `costo_tela` pasa a 8.50 (derivado), `costo_avios` se queda en 15.00 (el
   guard no lo pisa a 0).
7. Micaela (colaboradora de Tienda Trujillo) llamando `recibir_insumos` contra el
   Taller → `No tienes permiso para recibir insumos en esa ubicación` (RLS +
   `fn_puede_operar_ubicacion` funcionando igual que en el resto del módulo).
8. Cantidad 0 → `La cantidad recibida de cada insumo debe ser mayor a cero`.
9. Tras el `revoke` a `fn_aplicar_movimiento_insumo`: `recibir_insumos` (rol
   `authenticated`, vía `set local request.jwt.claim.sub`) lo sigue llamando sin
   problema; una llamada DIRECTA a `fn_aplicar_movimiento_insumo(...)` con
   `set local role authenticated` → `permission denied for function
   fn_aplicar_movimiento_insumo`.

## Addendum 2026-09-17 (mismo día, tras el cierre) — colisión de nombres con producción, sin verificar antes de escribir esto

**No se verificó contra producción antes de nombrar estas tablas — se verificó solo
contra el Postgres LOCAL (ver arriba), y el local no tiene lo que sigue.** Al cerrar el
trabajo del día se encontró, consultando producción en vivo
(`information_schema.tables`, proyecto `vovjyyiafkxteijimpuy`), que **`retail.insumos`,
`retail.insumo_lotes`, `retail.movimientos_insumo` (tablas) y `retail.v_insumo_saldos`
(vista) YA EXISTEN en producción — 0 filas cada una, huérfanas del volcado de la
unificación con Dynamic de julio (`supabase/unificacion/06_contabilidad_produccion.sql` y
`11_produccion_material_etapas.sql`), sin ninguna ruta de `apps/web` que las toque.** Ya
estaba anotado en `docs/BACKLOG.md` (🧨 ARREGLAR, "Insumos/materia prima del Taller:
dominio fantasma") — no se leyó ese ítem antes de diseñar esta migración.

**No es solo un choque de nombre.** El esquema huérfano es un diseño completo y
razonable, alineado con el principio 4 de este mismo repo (movimientos = fuente de
verdad, saldo = derivado): `insumos` (catálogo, con `merma_pct`/`stock_minimo`),
`insumo_lotes` (entrada por LOTE — `proveedor_id`, `costo_unitario`, `fecha_ingreso`,
`documento` — algo que esta migración no modela: acá el costo vive en cada fila de
`insumo_movimientos`, no por lote), `movimientos_insumo` (liga a un lote vía
`insumo_lote_id`), y `v_insumo_saldos` (vista que suma `movimientos_insumo` por
insumo+ubicación con signo según `tipo`, exactamente el patrón "stock derivado" ya
usado en el núcleo). Es, en varios sentidos, un diseño más maduro que el de esta
migración (seguimiento por lote es justo lo que un Taller que compra tela a distintos
proveedores y precios necesitaría para costear bien).

**Por qué esto no se resolvió acá, en vez de solo documentarlo:** es exactamente el
tipo de decisión de arquitectura — adoptar el esquema huérfano (y reconciliar sus
nombres/columnas con `ubicaciones`, `compras`, y el resto de este módulo) vs. quedarse
con el de esta migración y formalmente dar de baja el huérfano (mismo tratamiento que
ya tuvo `bom_items`: marcado LEGADO, nunca borrado) — que este repo pide frenar y
consultar, no decidir sola dentro de una tanda de 6 tareas en paralelo (principio 2,
"cero estados inconsistentes"; ver también CLAUDE.md, "decisiones que afecten más de un
módulo a la vez"). Rehacer esta migración para adoptar el esquema huérfano sin ese ok
habría sido la misma clase de error que evitar un choque de nombres a ciegas.

**Por qué esto no bloquea nada HOY:** el Postgres local no tiene las tablas huérfanas
(solo existen en producción, fuera del riel de `supabase/migrations/`), así que
`create table retail.insumos` corrió limpio en local y los 9 escenarios de abajo siguen
siendo válidos tal cual están. El riesgo es 100% al momento de pegar esto en
producción: `create table retail.insumos` fallaría de entrada contra la tabla huérfana
existente (incluso vacía, ya está ahí) — así que este archivo **no se puede pegar en
producción tal cual está**, pase lo que pase con la decisión de fondo.

## Lo que falta

0. **DECISIÓN DE FELIPE, antes que nada — ver el addendum arriba:** ¿adoptar el
   esquema huérfano (`insumos`/`insumo_lotes`/`movimientos_insumo`/`v_insumo_saldos`,
   ya en producción, con seguimiento por lote) reescribiendo esta migración sobre esa
   base, o quedarse con el diseño de esta ADR y dar de baja formalmente el huérfano
   (mismo tratamiento que `bom_items`)? Cualquiera de las dos implica reescribir esta
   migración antes de aplicarla en producción — no es seguro pegarla tal cual.
1. **Conectar `NuevaOrdenProduccionForm.tsx`** a `recibir_insumos`/
   `registrar_consumo_insumos` — a propósito fuera de esta tarea.
2. **Aplicar en producción** — bloqueado por el punto 0. Hoy la migración corre SOLO
   en local.
3. **Una RPC de ajuste/conteo de insumos** — el motor (`fn_aplicar_movimiento_insumo`)
   ya soporta `tipo = 'ajuste'`, pero nada la emite todavía.
4. **La pantalla de alerta "avisa cuando falta"** (`insumo_stock.cantidad <
   insumos.stock_minimo`) — la columna existe, la lectura no se construyó (fuera del
   alcance: esta tarea es solo tablas + RPC).
5. **La sección de Prioridad 1 del roadmap (compras/gastos) también describe `p_sede_id`
   contra un esquema que ya no existe** — mismo hallazgo que el de esta ADR, sin
   auditar todavía.
6. **`fn_aplicar_movimiento` (el original, `20260914230000`, sin tocar en esta tarea)
   tiene el mismo agujero de permisos que se cerró acá para
   `fn_aplicar_movimiento_insumo`**: ejecutable por `anon` sin sesión. Cerrarlo exige
   auditar todos sus call sites (`recibir_lote`, `recibir_compras`, `registrar_venta`,
   `transferir`, `mover_interno`, `cerrar_produccion`…) y confirmar que todos son
   `security definer` (probablemente sí, pero no verificado uno por uno acá) — fuera
   del alcance de esta tarea.
