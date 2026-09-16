# Invariantes — lo que la base hace imposible

> **Qué es esto:** la lista corta de estados que la base de CAYLA **rechaza**, con el
> nombre exacto de cada candado para que puedas buscarlo, y en qué base está puesto.
> Después, la lista igual de importante de lo que **todos creen que está prohibido y
> no lo está**.
>
> **Cuándo se lee:** antes de tocar una tabla, no después. La mitad de lo que ibas a
> validar en el formulario ya está resuelto abajo; la otra mitad no está resuelta en
> ninguna parte, y ahí es donde se rompe el negocio.
>
> **Qué NO es:** el detalle campo por campo (eso es `generado/DICCIONARIO-RETAIL.md`)
> ni el porqué de cada módulo (eso son los 14 archivos de `modulos/`). Aquí solo va el
> candado, su nombre y qué pasa sin él.
>
> Todo verificado el **2026-09-12 contra la base de producción real**, no contra la
> documentación previa.

---

## El problema que resuelve esta página

Una tienda no se rompe porque a un `if` le falte un caso. Se rompe porque un sábado a
las 7 de la tarde alguien vendió la última blusa Aurora M vino dos veces y el sistema
dijo que sí. Desde ese momento el stock miente, el conteo del lunes "encuentra" un
faltante que nunca existió, y nadie puede decir en qué minuto empezó la mentira.

Lo único que sobrevive a un cambio de framework, a una pantalla nueva o a un agente de
IA escribiendo código es que **la base se niegue**. Un `if` en React protege una
pantalla. Un `check` en Postgres protege el negocio.

Es el principio 2 de `CLAUDE.md`: *si el inventario puede quedar en un estado
imposible, el diseño está mal, no el código.*

---

## Cómo leer las tablas

**"Quién lo impide" tiene tres niveles y no valen lo mismo:**

| Nivel | Qué es | Qué tan fuerte |
|---|---|---|
| **Regla de tabla** (`check`, `unique`, llave primaria) | La base se niega venga el dato de donde venga | Máximo. Ni el editor SQL lo esquiva sin tirarlo abajo primero, y eso queda escrito |
| **Índice único parcial** | Igual de fuerte, pero solo sobre las filas que cumplen una condición (solo las cajas abiertas, solo el contenedor de tipo almacén) | Máximo, dentro de su condición |
| **Guardia dentro de una función** (`security definer`) | La función se niega y explica por qué, en idioma CAYLA (ADR-0022) | Fuerte **solo si entras por la función**. Quien escriba directo en la tabla la esquiva |

**"Dónde"** dice en qué base está puesto: **las dos** (tu máquina y las tiendas),
**producción** (solo las tiendas) o **local** (solo tu máquina — y entonces lo que
pruebas no es lo que corre en Trujillo).

Los nombres de la columna "Nombre exacto" se buscan tal cual:
`grep -rn "<nombre>" supabase/`.

---

## 1 · Candados que existen de verdad

### Inventario — el núcleo

| Qué no puede pasar | Quién lo impide | Nombre exacto | Dónde | Qué pasaría sin esto |
|---|---|---|---|---|
| Que el piso de venta quede en negativo | Regla de tabla **+** guardia que bloquea la fila antes de restar (`for update`) y avisa en castellano, incluido el ajuste negativo | `stock_cantidad_no_negativa` · `fn_aplicar_movimiento` (`unificacion/27_ajuste_con_signo.sql:182` y `:208`; local `0045_ajuste_con_signo.sql:185` y `:214`) | **Las dos** | Vender dos veces la última prenda. El stock deja de ser un número y pasa a ser una opinión; el conteo del mes ya no cierra nunca |
| Que el libro de movimientos cambie o desaparezca, o que el stock cambie sin una fila en el libro | Disparadores que se activan para todo rol y también en modo réplica (`enable always`), uno por fila contra UPDATE/DELETE y otro por sentencia contra TRUNCATE, directo o en cascada; más el retiro de INSERT/UPDATE/DELETE/TRUNCATE sobre `movimientos` y `stock` a `authenticated`, `anon` y `service_role`, y de EXECUTE sobre `fn_aplicar_movimiento`/`recalcular_stock` | `movimientos_inmutables` · `movimientos_sin_truncate` (`20260914165703`, `20260916200000_historial_candado_completo.sql`, ADR-0070). Pruebas: `pnpm pruebas:candado-historial` | **Local**; producción al pegar `SQL-PENDIENTE-PRODUCCION-2026-09-16-halcon.sql` | `movimientos` es la única fuente desde la que se reconstruye `stock`. Sin esto, un `truncate ... cascade` deja a TRU, AQP y el Taller sin historia, y una sesión cualquiera vuelve a aplicar cinco veces una entrada de 12 blusas: 60 prendas que no existen, sin fila que lo explique |
| Que el almacén de la sede quede en negativo | Regla de tabla + la misma guardia, rama almacén | `stock_almacen_cantidad_no_negativa` · `unificacion/27_ajuste_con_signo.sql:147` | **Las dos** | Lo mismo, pero peor: nadie mira el almacén hasta el censo, así que el error vive meses |
| Dos filas de stock para la misma prenda en la misma sede | Llave primaria compuesta | `stock_pkey (variante_id, sede_id)` · `stock_almacen_pkey` | **Las dos** | Dos verdades sobre la misma blusa en la misma tienda. Cada pantalla mostraría la que le tocó |
| Un movimiento de **cero** unidades, o una entrada/salida negativa | Regla de tabla | `movimientos_cantidad_coherente` | **Las dos** | El historial se llena de ruido y una entrada negativa disfrazada de ajuste rompe la reconstrucción del stock. Solo el `ajuste` lleva signo — **ADR-0023** |
| Inventar un tipo de movimiento (por ejemplo `venta`) | Regla de tabla | `movimientos_tipo_check` (`entrada`, `salida`, `ajuste`, `traslado`) | **Las dos** | Una salida de stock "por venta" sin pasar por caja. Lo vendido y lo descontado dejarían de cuadrar — por eso la venta tiene tabla y función propias |
| Dos almacenes en una misma sede | Índice único parcial | `contenedores_un_almacen_por_sede` (sobre `sede_id`, solo `tipo='almacen'`) | **Las dos** | "Lo guardado" dejaría de ser un número y pasaría a ser una búsqueda — **D-38** |
| Meter mercadería en un contenedor de otra sede | Guardia en la función | `fn_aplicar_movimiento` → *"El contenedor % no pertenece a la sede %"* (`unificacion/27:137`) | **Las dos** | Stock de Arequipa guardado en una caja de Trujillo. El almacén contaría prendas que no están ahí |

> El porqué de cada uno —los dos bolsillos, el ruteo al almacén, cómo se reconstruye
> todo desde el historial— está en `modulos/05-inventario-y-movimientos.md`.

### Caja, venta y conteo

| Qué no puede pasar | Quién lo impide | Nombre exacto | Dónde | Qué pasaría sin esto |
|---|---|---|---|---|
| Dos cajas abiertas a la vez en una sede | Índice único parcial | `cajas_sede_abierta_unique` (sobre `sede_id`, solo `estado='abierta'`) | **Las dos** | El cierre del día no cuadra contra nada: las ventas caen repartidas entre dos cajas y el efectivo contado no tiene con qué compararse |
| Vender en una caja ya cerrada | Guardia en la función | `registrar_venta` → *"Esta caja ya esta cerrada"* (`unificacion/37_registrar_venta_p_nota.sql:72`) | **Las dos** | Ventas cayendo en el día de ayer, después de que alguien ya contó la plata y la depositó |
| Cobrar dos veces el mismo carrito cuando se corta la red y la cajera reintenta | Índice único **+** rama de token dentro de la función | `ventas_token_cliente_key` · `registrar_venta(..., p_token)` | **Las dos** | El reintento cobra de nuevo y descuenta el stock de nuevo. Es el escenario diario de una tienda con internet malo — **ADR-0032** y **ADR-0033** |
| Dos conteos abiertos sobre el mismo sitio | Índice único parcial sobre **(sede, ubicación)** | `conteos_un_abierto_por_sede` | **Las dos** | Dos personas contando la misma tienda y cerrando con números distintos. ⚠️ La unicidad incluye `ubicacion`: una sede sí puede tener a la vez un conteo de piso y uno de almacén, a propósito |
| Contar dos veces la misma prenda dentro de un conteo | Regla de tabla | `conteo_lineas_conteo_id_variante_id_key` | **Las dos** | El censo infla el inventario con el doble de lo que hay |
| Un conteo "cerrado" sin fecha de cierre, o uno abierto con ella | Regla de tabla | `conteos_cierre_coherente` | **Las dos** | Un conteo que no es ni abierto ni cerrado. Nadie sabe si ya se aplicó al stock — **ADR-0027** |
| Un conteo ambiguo (alcance por categoría **y** por contenedor a la vez) | Regla de tabla | `conteos_alcance_coherente` | **Las dos** | "¿Qué estamos contando?" respondido de dos formas. El cierre ajustaría prendas que nadie miró |

### Comprobantes y libro contable

| Qué no puede pasar | Quién lo impide | Nombre exacto | Dónde | Qué pasaría sin esto |
|---|---|---|---|---|
| Emitir una **factura sin RUC** | Regla de tabla | `comprobantes_factura_requiere_ruc` | **Las dos** | SUNAT la rechaza y la clienta empresa se queda sin crédito fiscal. Se descubre días después, con el correlativo ya quemado |
| Dos comprobantes con el mismo tipo, serie y número | Regla de tabla **+** reserva del correlativo bloqueando la fila de la serie | `comprobantes_tipo_serie_numero_key` · `fn_reservar_numero_serie` (usa `for update`, `unificacion/17_facturacion_completa.sql:108`) | **Las dos** | Dos boletas 0001-000123. Es observación directa de SUNAT y no hay forma elegante de arreglarlo después |
| Una nota sobre un comprobante que SUNAT todavía no aceptó | Disparador de tabla | `comprobantes_valida_nota_referencia` → `fn_valida_nota_referencia_aceptada` (`unificacion/17:223`) | **Las dos** | Anular contra la nada: una nota que refiere a una boleta que SUNAT terminó rechazando |
| Anular un comprobante sin decir por qué | Regla de tabla | `comprobantes_anulado_tiene_motivo` | **Las dos** | Anulaciones mudas. Al mes nadie recuerda si fue error de la cajera o devolución — **ADR-0016** |
| Un comprobante transmitido sin saber si fue a pruebas o a SUNAT de verdad | Regla de tabla | `comprobantes_transmitido_tiene_entorno` | **Las dos** | Creer que una boleta de prueba es real — **ADR-0015** |
| Un asiento contable **descuadrado** (Σdebe ≠ Σhaber) | Disparador de restricción, diferido al final de la transacción | `asiento_lineas_cuadra` → `fn_asiento_cuadra` (`unificacion/08_funciones_finanzas.sql:23`) | **Las dos** | Un libro diario que no cuadra es un libro que el contador tira entero. ⚠️ Este cuadra el **total**; la línea individual está desprotegida en producción — ver §2 |

### Identidad y catálogo

| Qué no puede pasar | Quién lo impide | Nombre exacto | Dónde | Qué pasaría sin esto |
|---|---|---|---|---|
| Una cuenta de acceso que apunte a dos personas | Regla de tabla, del lado de Dynamic | `personas_auth_user_id_key` en `public.personas` (en local la misma regla se llama `personas_auth_user_id_unique`, `0006_...sql`) | **Las dos, con dos nombres** | Ya pasó: un `insert` corrido cuatro veces dejó una cuenta inutilizable, y la pantalla no falla con "no existe" sino con "hay más de una", que es peor de diagnosticar — **ADR-0002**. Recuerda que `retail.personas` es una **vista** sobre Dynamic: el candado vive allá |
| Un rol inventado | Tipo enumerado de Postgres | `rol_usuario` (`admin`, `supervisor_sede`, `integrante`), en `public.personas.rol` | **Producción**. En local es otra cosa: `rol text check (rol in ('lider','integrante'))`, `0001_init.sql:30` | Roles escritos a mano que ninguna política reconoce. ⚠️ Ojo al detalle: **los dos vocabularios ni siquiera coinciden** — lo que local llama `lider`, producción lo llama `admin`. Ver §2 |
| Inventar un código o un tipo de sede | Reglas de tabla, **distintas a cada lado** | Local: `sedes_codigo_check` con lista fija · `sedes_tipo_check` (`0020_contabilidad_cimientos.sql:17-23`). Producción: `retail.sedes` es una **vista**, así que manda Dynamic — `sedes_codigo_formato` (`^[A-Z0-9]{2,8}$`), `sedes_codigo_key`, `chk_sede_tipo` — más `sede_meta_tipo_check` del lado de retail | **Las dos, con reglas que no coinciden** | ⚠️ El candado local hace cumplir el vocabulario **equivocado**: su lista fija incluye `CORP` y las tres sedes `-ALM`, y **D-20 dice que la corporativa se llama `CCO`**. Los tipos tampoco calzan: Dynamic acepta `central/taller/tienda` y `sede_meta` acepta `tienda/fabrica/corporativo/almacen` |
| Dos variantes iguales del mismo producto (misma talla, mismo color) | Índice único sobre la identidad: la talla normalizada igual que en el código impreso ("M" = "m ", "Única" = "U"), color por código, y "sin color" cuenta como un color más | `variantes_identidad_unica` — `(producto_id, fn_token_talla(talla), color_codigo) nulls not distinct` (V2: `20260916190000_variantes_identidad_unica.sql`, ADR-0069; reemplaza `variantes_producto_id_talla_color_codigo_key`, que comparaba la talla como texto exacto) | **Local**; producción al pegar `SQL-PENDIENTE-PRODUCCION-2026-09-16-loro.sql` | "Blusa Aurora M vino" existiendo dos veces, con el stock repartido. La clienta la ve agotada mientras hay 4 en la otra fila |
| Dos colores que son el mismo escrito distinto (`Vino`, `vino `, `VINO`) | Índice único sobre la **clave normalizada** del nombre | `colores_clave_unica` sobre `fn_clave_texto(nombre)` · más `colores_nombre_key` | **Las dos** | El vocabulario de color se ensucia solo y "ventas por familia de color" deja de significar algo — **ADR-0024** |
| Una familia de color, o un prefijo de categoría, fuera de norma | Reglas de tabla | `colores_familia_color_check` (9 familias) · `categorias_prefijo_formato` (`^[A-Z]{3}$`) · `categorias_prefijo_unico` | **Las dos** | Los códigos cortos nacerían con dos formas distintas conviviendo, y los reportes de tendencia agruparían por un texto libre |
| Un código de barras apuntando a dos prendas | Regla de tabla | `codigos_barras_codigo_key` | **Las dos** | La pistola de la caja cobra una prenda por otra |
| Dos productos o dos variantes con el mismo código corto | Índices únicos | `productos_codigo_unico` · `variantes_codigo_unico` · `variantes_sku_key` | **Las dos** | El código corto deja de servir para lo único que sirve: nombrar una prenda en voz alta por teléfono entre sedes — **ADR-0025** |
| Correr dos veces la misma importación de catálogo | Índice único parcial | `importaciones_token_unico` (solo cuando `token` no es nulo) | **Las dos** | 900 prendas duplicadas de una sola pasada, y cada una con su stock propio |
| Dos versiones de la taxonomía activas | Índice único parcial | `taxonomia_una_sola_activa` | **Las dos** | Dos traducciones distintas del mismo catálogo conviviendo — **ADR-0030** |

---

## 2 · Invariantes que solo sostiene la costumbre

Esto es lo que **todos creen que la base impide y la base no impide**. Ninguna fila de
aquí es una queja: son huecos con nombre, para que nadie construya encima creyendo que
hay piso.

| Qué SÍ puede pasar hoy | Quién debería impedirlo | Lo único que hay en su lugar | Dónde | Qué se rompe cuando pasa |
|---|---|---|---|---|
| ~~**Borrar o editar un movimiento pasado**~~ | — | **Cerrado 2026-09-16, pasó a la §1** (ADR-0070). V2 ya frenaba UPDATE/DELETE desde la tienda (`20260914165703`); `20260916200000` cerró TRUNCATE, el modo réplica, los permisos de `service_role` y la posibilidad de aplicar stock sin movimiento. `force row level security` NO se usa: en producción el dueño (`postgres`) y `service_role` tienen BYPASSRLS | **Local**; producción al pegar `SQL-PENDIENTE-PRODUCCION-2026-09-16-halcon.sql` | — |
| **Una línea de asiento con `debe` y `haber` a la vez, o en negativo** | `linea_debe_xor_haber`, `check (debe >= 0)`, `check (haber >= 0)` | Existen en **local** (`0020_contabilidad_cimientos.sql:115-119`) y **no existen en producción**: allá `retail.asiento_lineas` tiene solo su llave primaria y dos llaves foráneas (`unificacion/06_contabilidad_produccion.sql:105-112`) | ⚠️ **Solo local** | El cuadre total se cumple sobre basura: una línea con `debe = -100` y `haber = -100` **cuadra perfecto**. El libro pasa el control y no significa nada. `docs/ARQUITECTURA.md:318` promete ese `check` como si estuviera puesto en todas partes — **no lo está**. Hoy sale barato cerrarlo: `asiento_lineas` tiene **0 filas** en producción |
| **Un movimiento que dice pertenecer a una venta que no existe** | La llave foránea `movimientos.venta_id → ventas.id` | Existe en local (`0010_stock_concurrencia.sql:19-20`); en producción la columna se declaró suelta, `venta_id uuid,` sin `references` (`unificacion/05_operacion.sql:216`) | ⚠️ **Solo local** | Lo vendido y lo descontado dejan de poder cruzarse fila por fila, que es justo lo que hace falta para devoluciones (**D-34**) |
| **`movimientos.motivo` con cualquier texto** | Un `check` con vocabulario cerrado, o una tabla de motivos | Nada. En producción `movimientos` solo tiene `movimientos_tipo_check`, `movimientos_canal_check`, `movimientos_cantidad_coherente` y su llave primaria — **ningún candado sobre `motivo`**. El catálogo de motivos vive únicamente en TypeScript (`packages/shared/src/enums.ts:29`) y el formulario ofrece además un campo de **texto libre** (`MovimientoModal.tsx:210`) | **Las dos** | Dos cosas. Una: agrupar el historial por motivo deja de ser confiable — "venta", "Venta" y "venta online" son tres motivos distintos. Dos: rompe la fila de abajo |
| **`stock.ultima_venta` que se queda congelada** | Que "esto fue una venta" salga de un dato estructurado (el `venta_id`, el tipo), no de comparar un texto | `fn_aplicar_movimiento` lo decide con una **comparación exacta de texto**: `ultima_venta = case when m.motivo = 'venta' then m.created_at else ultima_venta end` (`unificacion/27_ajuste_con_signo.sql:197`, local `0045:200`). Una `V` mayúscula, un espacio de más o un motivo más descriptivo y la fecha **no se toca, en silencio** | **Las dos** | Se cae **"qué se está quedando"**, uno de los tres números que Felipe mira primero (**D-52**). Una prenda que se vende todos los días puede aparecer como muerta hace seis meses, y la rebaja se decide sobre una mentira |
| **Recalcular o reescribir el `codigo` de un producto** | Algo que niegue el `update` sobre esa columna | Nada. **ADR-0025 dice textualmente que el código "se asigna una vez y nunca se recalcula"** — y eso lo sostiene solo la disciplina de quien escribe el SQL: `productos_update_lider` permite editar cualquier columna, incluida `codigo`, y no hay disparador que lo impida. Lo único puesto es la unicidad (`productos_codigo_unico`), que no dice nada sobre cambiarlo | **Las dos** | El código corto es lo que se dice por teléfono entre sedes y lo que va impreso en la etiqueta. Si se recalcula al reclasificar, la etiqueta pegada en la prenda deja de existir en el sistema |
| **Cerrar un mes y seguir escribiendo en él** | Un candado de período contable | No existe ninguna tabla ni función: `periodos_contables`, `cerrar_periodo`, `cerrar_mes` no aparecen ni en `supabase/migrations/` ni en `supabase/unificacion/` | **Las dos** | El contador cuadra marzo y en abril alguien registra un gasto con fecha de marzo. Lo cuadrado se descuadra solo — **D-23**. Las cinco puertas abiertas están en `modulos/11-finanzas-operativas.md` |
| **Editar una caja ya cerrada** | Que la política de `update` mire el estado | `cajas_update` en producción (`cajas_update_propia_sede` en local, `0007_finanzas.sql:66`) permite editar cualquier caja de tu sede, cerrada o no — incluidos `monto_cierre_contado` y `diferencia` | **Las dos** | El cierre de caja es el tercero de los tres números de **D-52**, y hoy se puede reescribir después de contado |
| **Que el candado de permisos deje pasar a quien no tiene sede** | Que un candado devuelva `false` cuando no sabe, nunca `NULL` | Producción está **cerrada**: `retail.puede_operar_sede` usa `coalesce(...)` (`unificacion/03_candados.sql:76-79`). **Local está abierto**: `fn_puede_operar_sede` (`0012_rpc_valida_sede.sql:15-26`) devuelve `NULL` si la persona no tiene sede, y **las 35 llamadas** que hay en `supabase/migrations/` usan el patrón `if not fn_puede_operar_sede(...) then raise` — y **`not NULL` no es true**: la excepción no se dispara y el permiso pasa solo | ⚠️ **Solo local** | Al revés de lo que se suponía: **el hueco está en tu máquina, no en las tiendas**. Una prueba local puede pasar un candado que producción sí frena, y al revés |
| **Cuatro niveles de permiso que en realidad son dos** | Que los candados lean los cuatro niveles del acta (Admin · Líder de equipo · Integrante · Solo lectura, **D-12**) | Producción distingue dos: `retail.es_lider()` es `coalesce(public.fn_rol_actual() = 'admin', false)` — **el rol `supervisor_sede` no pasa ningún candado de `retail`**. `retail.es_supervisor()` existe y **no la usa ni una política, ni una RPC, ni una pantalla**. *Solo lectura* no existe en ninguna parte | **Las dos** (local con otro vocabulario: `lider` / `integrante`) | Hoy **solo Felipe puede dar de alta catálogo en las tiendas**: `productos_insert_lider`, `variantes_insert_lider`, `categorias_insert_lider` y `colores_insert_lider` exigen `es_lider()` = `admin`. El contador externo no puede recibir acceso sin darle poder de escritura, y el permiso temporal para cubrir otra sede (**D-14**) no tiene dónde apoyarse |

### El caso grave: lo que la documentación promete y producción no tiene

De todo lo anterior, uno solo es de la familia "lo escrito miente": el
**`linea_debe_xor_haber` de `asiento_lineas`**. `docs/ARQUITECTURA.md:318` lo da por
puesto. Está en tu máquina y **no está en las tiendas**. Cualquiera que lea la
documentación, pruebe en local y vea que la base rechaza la línea torcida, va a
concluir —razonablemente y en falso— que producción también la rechaza.

Es además el ejemplo perfecto de la brecha real entre las dos bases, que **no es "local
va adelante"**: producción tiene tablas y funciones vivas que ningún archivo del repo
crea, y al mismo tiempo le faltan candados que el repo sí escribe. Reconstruir
producción desde el repo daría una base **distinta** de la real. Eso está medido en
`modulos/14-plataforma-y-esquema.md` y `generado/DRIFT.md`.

### Por qué nada de esto se arregla "validando en la pantalla"

Porque la pantalla no es la única puerta. Hoy escriben en producción: la aplicación
web, las 56 funciones del esquema `retail`, el editor SQL (**D-11**) y, de aquí en
adelante, cualquier agente de IA que trabaje en este repo. Una validación en React
protege a la persona que usa esa pantalla. No protege al inventario.

Y hay un detalle que lo empeora: **no existe ni una sola prueba automática sobre el
núcleo de stock** (**D-25**). Los cuatro errores de esa familia que se encontraron este
año se encontraron leyendo SQL a mano.

---

## La regla de oro

> **Si un estado imposible se puede alcanzar, el diseño está mal — no el código.**

No se parcha con una validación más arriba. No se parcha con "acordémonos de no
hacerlo". Se corrige donde vive el problema: el esquema, la política de fila o la
función.

La prueba para saber de qué lado estás es una sola pregunta:

> *Si mañana alguien pega un `insert` a mano en el editor SQL de producción, ¿el estado
> malo entra?*

Si la respuesta es **sí**, no tienes un invariante: tienes una costumbre. Y las
costumbres se pierden cuando entra gente nueva, cuando alguien tiene prisa un sábado, o
cuando un agente de IA escribe código correcto contra un modelo permisivo.

El orden importa: **un candado se pone antes de que la tabla tenga datos sucios.**
Poner `check (cantidad >= 0)` sobre una tabla que ya tiene filas en negativo falla, y
entonces hay que limpiar a mano con el negocio corriendo. Por eso hoy cerrar el hueco
de `asiento_lineas` cuesta un `alter table` (0 filas) y cerrar el de `movimientos`
cuesta pensarlo bien (28 filas y contando).

---

## Cómo se corrige un error sin borrar historia (D-22)

**No se borra: se escribe lo contrario.**

Alguien registra la recepción de un lote y anota **10 blusas que nunca llegaron** —
venían en la guía, la caja llegó incompleta y nadie lo notó hasta el día siguiente. La
tentación es entrar a la base y borrar esa fila.

| Paso | Qué se escribe |
|---|---|
| El error, que **se queda** | `tipo='entrada'`, `cantidad=10`, del 12-09, con su `usuario_id` |
| La corrección, que **se agrega** | `tipo='ajuste'`, `cantidad=-10`, `motivo='corrige la entrada del 12-09, el lote llegó incompleto'` |
| Resultado en `stock` | 10 − 10 = **el número queda correcto** |
| Resultado en el historial | Se ven **las dos filas**, cada una con quién y cuándo |

Borrar la fila mala haría lo contrario: número bien, historia mentirosa. Nadie podría
explicar después por qué el conteo de esa noche no cuadró, ni por qué el proveedor
factura 10 unidades que el sistema dice que nunca entraron. Es la lógica del libro
contable: un asiento equivocado se corrige con un contra-asiento, **no con corrector
líquido**.

**Dos avisos para no equivocarse de herramienta:**

- **No uses una `salida` con `motivo='merma'` para "arreglar" el número.** Eso afirma
  que la mercadería se perdió, cuando lo que pasó es que el sistema estaba equivocado —
  y ensucia para siempre el cálculo de merma. La merma es una pérdida real; la
  corrección es un error de captura.
- **La base ya permite el ajuste negativo** (`movimientos_cantidad_coherente`,
  ADR-0023), pero **la pantalla todavía no**: `MovimientoModal.tsx:149` tiene `min={1}`
  y `packages/shared/src/schemas.ts:20` exige `positive()`. Hasta que se cambien esas
  dos líneas, la corrección solo se puede escribir desde el editor SQL.

**Lo que falta para que D-22 esté cumplido son cuatro piezas, no una:**

1. Un disparador `before update or delete on movimientos` que siempre rechace, con un
   mensaje que diga qué hacer en su lugar.
2. `alter table movimientos force row level security`, para que tampoco las funciones
   que corren como dueño lo esquiven.
3. Quitarle `update` y `delete` sobre `movimientos` al rol `authenticated`
   (`0004_grants.sql:11` y `seed.sql:49` en local) — y **primero mirar qué tiene
   concedido de verdad en producción**, que no está escrito en ningún archivo del repo.
4. El gemelo de producción, con el prefijo `retail.` en cada tabla (`CLAUDE.md`, *Cómo
   aplicar SQL a producción*).

Y la salida de emergencia queda abierta a propósito: el candado **frena a la aplicación,
no a Felipe**. Desde el editor SQL de producción se puede desactivar un minuto, corregir
y volver a activar — y esa mano deja rastro (**D-11**). Dicho con las palabras de la
decisión: **imposible por accidente, posible a propósito y con rastro.**

---

## Antes de tocar una tabla: la lista de cuatro

1. **¿Qué estado imposible estoy habilitando?** Escríbelo en una frase. Si no puedes,
   todavía no entiendes el cambio.
2. **¿Ese estado lo impide la base o lo impide la costumbre?** Busca el nombre en la
   §1. Si no está ahí, está en la §2 — o en ninguna parte.
3. **¿Lo estoy poniendo en el nivel más fuerte posible, y en las dos bases?** Regla de
   tabla antes que guardia de función; guardia antes que validación de pantalla. Y un
   candado que solo está en local no es un candado: es una diferencia.
4. **¿Queda escrito?** Un candado nuevo necesita su ADR el mismo día (**D-10**), su
   línea en este archivo y su fila en el diccionario generado (`pnpm datos:generar`).
   Un candado que nadie sabe que existe se termina borrando porque "estaba estorbando".

---

*Este archivo lo gobiernan **D-21** (el pasado se reconstruye), **D-22** (el historial
se vuelve inmutable de verdad, y el error se corrige escribiendo lo contrario), **D-23**
(el mes se cierra con llave), **D-25** (pruebas sobre el núcleo de stock antes del
censo), **D-34** (venta y comprobante se unen), **D-38** (un almacén por sede),
**D-12** y **D-14** (los cuatro niveles de permiso y el permiso temporal), **D-11** (la
salida de emergencia con rastro) y **D-16** (las dos bases se describen lado a lado).
Verificado el 2026-09-12 contra el esquema `retail` del proyecto de producción. Si
alguna decisión cambia, se corrige primero en `DECISIONES-2026-09-12.md`.*
