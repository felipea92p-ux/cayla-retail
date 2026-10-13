# Contrato · recibir un envío de orden de compra en la sede (ADR-0362, fase 4)

Felipe pidió la noche del 2026-10-12 «desarrollar de corrido» hasta la mañana siguiente. La fase 4 se construye sobre ADR-0362
(decisiones 9, 13–15, 17, 18, 21, 23, 24, 27, 34, 40, 48 y 49 y el «Contrato provisional con la sesión de Recepción», que hoy no tiene
rama: esta línea la toma). Lo que el ADR no decide lo decido aquí por defecto, marcado **[provisional]**: Felipe lo revisa al volver.
**Nada de esta fase se aplica en producción sin él.** El mapa de lo que existe (con archivo:línea) lo hizo un agente el 2026-10-12;
lo esencial está resumido abajo en «Lo que ya existe y se reutiliza».

## Qué pasa en la tienda

Llega un envío `ENV-000061` (o una orden «directo» llega sin guía, decisión 48). Quien recibe, en la sede de destino:
1. **Abre el envío** («Empezar a recibir»): pasa de `en_camino` a `abierto` y la compradora ya no lo puede anular.
2. **Por cada línea** («Chompas · CAYLA · Chompa cuello alto — vienen 20»): dice **qué prenda es** —una que ya existe en el catálogo
   (de esa categoría y marca) o una **nueva que crea ahí mismo** con las tallas y los colores que llegaron y el precio de venta sugerido
   ya puesto (decisiones 21 y 49)— y **cuenta talla por talla y color por color**. Ve y corrige el **costo** (decisión 18).
3. Si contó **menos** de lo que venía: elige **qué pasó** (decisión 14). Si contó **más**: elige **qué pasa con lo de más** (decisión 15).
   Si algo llegó **dañado**: lo marca en su talla y color, y dice si **tiene arreglo** (decisiones 23 y 27).
4. Si llegó algo que **no estaba en la guía**: lo agrega con su categoría y marca (decisión 13: «la sede puede agregar o quitar prendas
   antes de cerrar»).
5. **Cierra** («Recibir N prendas»): el stock entra (lo bueno al almacén, lo dañado a la cuarentena), el costo se promedia, el envío
   queda `cerrado` y la recepción **muestra cómo se cerró** (decisión 13). Después: etiquetas y bajar al piso, como «Llegó mercadería».

**Quien hizo la orden no la recibe, sin excepción, ni el líder (decisión 17).**

## Lo que ya existe y se reutiliza (no se reescribe)

- Costo: `fn_recalcular_costo_variante` (promedio ponderado; antes de `fn_aplicar_movimiento`). Stock: `fn_aplicar_movimiento` con la
  sububicación `fn_sububicacion_por_defecto(sede, 'entrada')` (almacén). Costo atípico: `fn_costo_fuera_de_banda` + `confirma_costo`
  por línea, como `recibir_lote` (`20260930122000`, con los reemplazos de `20261012202000`); lo confirma quien tiene Recibir
  (`fn_ve_costos_al_recibir`).
- Candados en orden (ADR-0190): `fn_bloquear_en_orden`. Firma: `fn_actor_persona_id(true)` y el combo «Responsable» en la pantalla.
- `lotes` (una llegada por proveedor), `movimientos` de entrada con motivo `recepcion` y `lote_id`; `compra_item_id` mueve
  `compras.recibido_cantidad` por el disparador `movimientos_compra_foto`.
- Cuarentena: la sububicación `cuarentena` y `prendas_danadas` (estado `en_cuarentena`; origen por `motivo_reporte`, como
  `reportar_danada`, `20261005140000`). Las salidas (liquidar, regalar, desechar, devolver al proveedor) ya existen en Existencias.
- Crear la prenda: `crear_producto_con_variantes` (nombre único por marca, tejido y patrón si la familia los pide, talla habilitada en la
  categoría, color activo, precio > 0, la pareja marca–proveedor registrada). Hoy pide `fn_puede_editar_catalogo()`.
- Las lecturas de la fase 3: `fn_envios_por_abrir`, `fn_envio_detalle` (las abre Órdenes de compra o Recibir).

**No se reutilizan** `recibir_envio`, `recibir_compras` ni `cerrar_linea_compra`: topan por tienda contra `compra_item_destinos` (que en
un comprobante de orden está todo en la gestora, decisión 46) y rechazan las líneas sin prenda.

## La base (dos migraciones, reservadas por la rama `claude/purchase-order-phase4-9b0c82`)

- `20261013001000_recepcion_de_envio_esquema.sql`: las columnas y tablas de abajo y el reemplazo anclado del alta al recibir.
- `20261013002000_recepcion_de_envio.sql`: las funciones y las lecturas.

Cada una se pega en producción en UNA parte (sin políticas, sin `drop trigger`, sin `select … into` dentro de textos entre comillas),
con `set lock_timeout = '3s'`, re-ejecutable y con un bloque final que comprueba que quedó todo.

### Esquema (RLS encendido y SIN políticas en las tablas nuevas: se leen y escriben solo por funciones `security definer`)

- `lotes.despacho_id uuid references retail.despachos(id)` (nulo), con único `(despacho_id, proveedor_id)` donde no sea nulo: un envío
  con dos proveedores da dos lotes (contrato del ADR).
- `despachos` suma `nota_recepcion text` (hasta 500), `recepcion_token uuid` (único) y `recepcion_huella text`. `abierto_por/en` y
  `cerrado_por/en` ya existen.
- `retail.despacho_recibidos` (solo se agrega): `id`, `despacho_id`, `despacho_item_id` (nulo = algo que no estaba en la guía),
  `proveedor_id`, `categoria_id`, `marca_id`, `variante_id`, `cantidad` (entero > 0, lo contado de esa variante), `danadas` (entero ≥ 0,
  ≤ `cantidad`), `danada_solucion` (`pendiente` | `sin_solucion` | nulo si no hay dañadas), `costo_unitario` (≥ 0, 2 decimales: el que
  se aplicó), `movimiento_id` (la entrada de lo bueno, nulo si todo vino dañado), `movimiento_danada_id` (la entrada a cuarentena),
  `compra_item_id` (la línea del papel a la que se cargó, si se cargó), `creado_por`, `creado_en`.
- `retail.despacho_diferencias` (solo se agrega): `id`, `despacho_id`, `despacho_item_id` (nulo = algo que no estaba en la guía),
  `proveedor_id`, `categoria_id`, `marca_id`, `tipo` (`faltante` | `sobrante`), `causa` (ver abajo), `cantidad` (entero > 0),
  `costo_unitario` (el de la línea), `nota`, `creado_por`, `creado_en`. **Es la deuda que la fase 5 resuelve** («Nos debe»).
  - Faltante (`causa`): `no_vino` (el proveedor no lo mandó: **deuda del proveedor «por reponer»**, decisiones 14 y 24),
    `se_perdio` (se perdió en el camino: lo asume CAYLA), `otra_sede` (llegó a otra sede: se cruza en el papel, no es deuda)
    **[provisional: la lista de causas]**.
  - Sobrante (`causa`): `regalo`, `cobra_aparte`, `proxima_compra` (decisión 15). En la guía y fuera de ella.
- **Crear la prenda al recibir (decisión 49):** reemplazo anclado en `crear_producto_con_variantes` sobre su chequeo de permiso
  (`if not fn_puede_editar_catalogo() then`): también pasa si la variable de transacción `retail.alta_al_recibir` vale `'si'`, que SOLO
  pone (y quita) la función `preparar_prenda_al_recibir` después de comprobar el módulo Recibir y la sede. Ninguna llamada desde la web
  puede ponerla (PostgREST no expone `set_config`).

### Funciones (todas `security definer`, `search_path` fijo, `revoke` a PUBLIC y anon, `grant` a authenticated)

Permiso común: **el módulo Recibir** (`fn_ve_modulo('recibir')`, decisión 40: el módulo es la llave) y **la sede del envío**
(`fn_puede_operar_ubicacion(despacho.ubicacion_destino_id)`); y la **decisión 17**: si la persona que firma (`fn_actor_persona_id(true)`)
creó alguna de las órdenes del envío → «Hiciste esta orden: la tiene que recibir otra persona de la tienda» (hint `recibir_quien_compro`).
Firman con `fn_actor_persona_id(true)` (el combo «Responsable»; SIN clave en `acciones_sin_responsable`: en la tienda se elige quién
recibe). Errores en tres líneas de tienda, con su `hint`.

1. `retail.abrir_despacho(p_despacho_id uuid, p_version integer) returns jsonb` → `{ "despacho_id", "estado": "abierto", "version" }`.
   `en_camino` → `abierto` (llena `abierto_por/en`, sube `version`); si ya está `abierto`, devuelve lo mismo sin tocar nada; `cerrado`
   → «Este envío ya se recibió»; `anulado` → «Este envío se anuló: ya no llega». Choque de versión → «Alguien cambió este envío: recarga».
2. `retail.recibir_orden_sin_envio(p_orden_id uuid, p_token uuid) returns jsonb` → `{ "despacho_id", "numero" }` (decisión 48). Solo una
   orden `generada`, «directo» (con «Llega a» = una sede que la persona opera) y con algo por enviar: crea un envío con TODO lo que le
   queda por enviar, sin número de guía, nota «Llegó directo a la tienda, sin guía», `despachado_por` = quien recibe, y lo deja `abierto`.
   Idempotente por token. Usa las mismas reglas de líneas de `crear_envio` (el tope diferido sigue mandando).
3. `retail.preparar_prenda_al_recibir(p_despacho_id uuid, p_despacho_item_id uuid, p_categoria_id uuid, p_marca_id uuid,
   p_producto_id uuid, p_referencia text, p_variantes jsonb, p_precio numeric, p_descripcion text, p_tejido_id uuid, p_patron_id uuid,
   p_confirmo_distinto boolean, p_token uuid) returns jsonb` → `{ "producto_id", "nombre", "variantes": [{ "id", "talla_id", "talla",
   "color_codigo", "color" }] }`.
   - Con `p_despacho_item_id`: la categoría y la marca salen de esa línea (se ignoran las mandadas). Sin él (algo que no estaba en la
     guía): `p_categoria_id` y `p_marca_id` obligatorias y activas. El envío tiene que estar `en_camino` o `abierto` y ser de la sede.
   - `p_producto_id` nulo → **prenda nueva**: llama a `crear_producto_con_variantes` con la variable `retail.alta_al_recibir`, la
     categoría y la marca de la línea, el proveedor de la orden (si la pareja marca–proveedor no está registrada, se registra: la compra
     prueba que ese proveedor trae esa marca **[provisional]**), el costo de la línea en cada variante y `p_precio` (el de venta; la
     pantalla lo precarga con `compra_items.precio_venta_sugerido`, decisión 21). Sus candados mandan (nombre por marca, tejido y patrón,
     talla, color, precio) y sus mensajes llegan tal cual.
   - `p_producto_id` dado → **una prenda que ya existe**: activa, de la misma categoría y marca de la línea; devuelve sus variantes y
     CREA las combinaciones talla × color de `p_variantes` que le falten (mismas reglas: talla habilitada, color activo, precio > 0 —el de
     la prenda si no viene—, combinación única; el código lo pone `variantes_asignar_codigo`).
   - `p_variantes`: `[{ "talla_id": uuid|null, "color_codigo": text|null }]` (la matriz que llegó).
   - Idempotente por token (el de `crear_producto_con_variantes`).
4. `retail.recibir_despacho(p_despacho_id uuid, p_version integer, p_lineas jsonb, p_extras jsonb default '[]', p_nota text default
   null, p_token uuid default null) returns jsonb`.
   - `p_lineas`: **una entrada por cada línea del envío, todas, una sola vez**:
     `{ "despacho_item_id": uuid, "costo_unitario": numérico ≥ 0 con 2 decimales | null (null = el de la línea), "confirma_costo":
     bool, "variantes": [{ "variante_id": uuid, "cantidad": entero ≥ 0, "danadas": entero ≥ 0 (≤ cantidad), "danada_solucion":
     "pendiente" | "sin_solucion" | null }], "faltante_causa": "no_vino" | "se_perdio" | "otra_sede" | null, "sobrante_causa":
     "regalo" | "cobra_aparte" | "proxima_compra" | null }`. Las variantes son de una prenda activa de la categoría y marca de la línea;
     una variante repetida en la misma línea se rechaza. Contado = Σ cantidad (bueno + dañado). Si contado < enviado,
     `faltante_causa` es obligatoria (y prohibida si no); si contado > enviado, `sobrante_causa` es obligatoria (y prohibida si no).
   - `p_extras`: lo que no estaba en la guía: `{ "proveedor_id": uuid | null (null = el único proveedor del envío; con dos o más,
     obligatorio y uno de los del envío), "categoria_id", "marca_id", "costo_unitario" (obligatorio), "confirma_costo", "variantes":
     [igual], "sobrante_causa": obligatoria }`.
   - Orden de candados: el envío (`for update`) → sus órdenes → sus líneas pedidas → las líneas del papel → variantes → stock
     (`fn_bloquear_en_orden`).
   - **Idempotencia:** `recepcion_token` + huella: el mismo token con la misma huella devuelve el mismo resultado; con otra huella,
     «Esa recepción ya se guardó con otros datos: recarga la pantalla». Un envío `cerrado` con otro token → «Este envío ya se recibió».
   - **Versión:** la que vio la pantalla (tras abrirlo); si cambió, «Alguien cambió este envío: recarga».
   - **Qué escribe:** un lote por proveedor (`lotes.despacho_id`, `numero_guia` del envío, `recibido_por`); por variante, una entrada
     `recepcion` de lo bueno al almacén y una de lo dañado a la `cuarentena` + su fila en `prendas_danadas` (`en_cuarentena`,
     `motivo_reporte` «Llegó dañada en ENV-000061», `proveedor_id`, la nota dice «tiene arreglo» o «sin arreglo»); el costo
     (`fn_recalcular_costo_variante` con TODAS las unidades que entran, a `costo_unitario`) **[provisional: todo lo contado entra al costo
     de la línea, también un regalo; lo que se debe lo define el papel y la fase 5]**; `despacho_recibidos`; `despacho_diferencias` (un
     faltante o un sobrante por línea y por extra); y el envío `cerrado` (`cerrado_por/en`, `nota_recepcion`, `version` + 1).
   - **El papel (decisión 9):** si la línea del envío trae `compra_item_id`, o si su línea pedida tiene líneas de comprobantes VIGENTES
     con cupo (facturado − recibido − cerrado), las entradas llevan `compra_item_id` hasta ese cupo (las más antiguas primero) y lo que
     pase entra sin él. Así el comprobante pasa a «recibido» y `compras_no_sobrerecibida` (que mide todo el comprobante) nunca salta.
   - **Costo atípico:** por variante, `fn_costo_fuera_de_banda(costo, costo_vigente, precio)`; si alguna está fuera y su línea no trae
     `confirma_costo`, error con hint `recepcion_costo_atipico` y el detalle (JSON en `detail`: `[{ despacho_item_id, variante_id,
     motivo, costo, vigente }]`) para que la pantalla lo muestre como `AvisoCostoAtipico`.
   - **Actividad:** módulo `recibir`, sin montos: «recibió ENV-000061 (32 prendas: 30 buenas, 2 dañadas; faltan 2)».
   - **Devuelve:** `{ "despacho_id", "numero", "lotes": [uuid], "unidades", "buenas", "danadas", "faltan", "sobran" }`.
5. **Lecturas** (Recibir u Órdenes de compra, como las de la fase 3):
   - `fn_envios_por_abrir(p_ubicacion_id)` incluye también los `abierto` (con su estado) y suma, por envío, `proveedores` (nombres) y
     `creado_por_mi` (si quien mira hizo alguna de sus órdenes: la pantalla avisa antes de que la base lo frene).
   - `retail.fn_ordenes_directas_por_recibir(p_ubicacion_id uuid) returns jsonb` → las órdenes `generada` «directo» a esa sede con algo
     por enviar: `[{ orden_id, numero, proveedor, unidades_por_enviar, creada_por_mi }]` (decisión 48).
   - `fn_envio_detalle(p_despacho_id)` suma: `version`; por línea `categoria` `{id, nombre, prefijo, familia}`, `marca` `{id, nombre}`,
     `proveedor` `{id, nombre}`, `precio_venta_sugerido` (del papel, si hay), `orden` `{id, numero}`; y, si está `cerrado`, `recibidos`
     (por línea y extras: prenda, talla, color, cantidad, dañadas, costo) y `diferencias` (tipo, causa, cantidad) — «cómo se cerró».
   - `retail.fn_prendas_para_recibir(p_categoria_id uuid, p_marca_id uuid, p_busqueda text) returns jsonb` → las prendas activas de esa
     categoría y marca (nombre, código, foto principal si la hay, `variantes` con talla, color, código, costo y precio): para «Ya la tengo».
     Hasta 30, las que coinciden con la búsqueda primero.
6. **Pruebas** (`scripts/pruebas/recepcion_de_envio.mjs`, en `PRUEBAS` del CI y en `package.json` como `pruebas:recepcion-de-envio`):
   permisos (sin Recibir 42501; otra sede no; quien hizo la orden no, ni el líder), abrir (idempotente, versión, anulado/cerrado), prenda
   nueva con solo Recibir (sin Productos) y prenda existente con una variante que faltaba, recibir completo (stock al almacén, costo
   promediado, lote por proveedor, movimientos con `compra_item_id` hasta el cupo), faltante con causa (y sin causa, error), sobrante con
   causa, dañadas a cuarentena con `prendas_danadas`, algo que no estaba en la guía, token y huella, costo atípico sin y con confirmar,
   orden directa sin envío, y la forma (security definer, anon no, RLS sin políticas, la variable de alta no se puede poner desde fuera).

## La pantalla (módulo Recibir; cabecera `EncabezadoPagina`, como Inventario)

- **`/recibir` (la puerta «Llegó mercadería»)** suma ARRIBA una tarjeta «Envíos de órdenes de compra para esta sede» cuando hay algo:
  cada envío (`ENV-000061 · Textiles Andina · 32 prendas · En camino/Abierto`) con «Recibir», y cada orden «directo» sin envío
  (`OC-000465 · llega sin guía · 12 prendas`) con «Recibir sin guía» (llama a `recibir_orden_sin_envio` y abre la recepción). Si quien
  mira hizo esa orden, el botón no sale y dice «La recibe otra persona: tú hiciste la orden».
- **`/recibir/envio/[id]`** (página nueva, dentro de `app/(app)/recibir/`, que ya exige el módulo): al entrar con el envío `en_camino`,
  un solo botón «Empezar a recibir» (abre); `abierto`, el formulario; `cerrado`, «cómo se cerró» (solo lectura).
  - Por línea, una tarjeta: «Chompas · CAYLA · Chompa cuello alto — vienen 20 · OC-000129», el **costo** por unidad (editable;
    decisión 18: quien recibe ve los precios), y **la prenda**: «Es nueva» (hoja con nombre, tallas, colores, precio de venta precargado
    con el sugerido, descripción, y tejido y patrón si la familia los pide → `preparar_prenda_al_recibir`) o «Ya la tengo» (buscador con
    `fn_prendas_para_recibir`; si falta una talla o un color, «+ talla o color» los crea con la misma función). Con la prenda puesta, la
    **matriz talla × color** con la cantidad de cada una (y «dañadas» por celda, plegado bajo «¿Llegó algo dañado?»).
  - Debajo de cada tarjeta, solo si hace falta: «Faltan 2: ¿qué pasó?» (No vino · Se perdió en el camino · Llegó a otra sede) o «Vinieron
    2 de más: ¿qué pasa con ellas?» (Regalo · Se cobra aparte · Se arregla en la próxima compra). Si hay dañadas: «¿Tienen arreglo?»
    (Sí, quedan en cuarentena · No).
  - «+ Algo que no estaba en la guía» (categoría, marca, proveedor si el envío trae varios, costo, prenda y matriz, y qué pasa con eso).
  - Pie: nota opcional, `ComboResponsable`, «Recibir N prendas» (`pie-hoja-fijo` no aplica: es página; botón principal fijo abajo en
    celular). Costo atípico → `AvisoCostoAtipico` (el mismo de «Llegó mercadería») y reintento con `confirma_costo`.
  - Al cerrar: «ENV-000061 recibido · 30 prendas al almacén, 2 a cuarentena · faltan 2» con «Imprimir etiquetas» (`urlEtiquetasDePrecio`
    con los lotes) y «Bajar al piso» (`despuesDeRecibir`).
- Lógica pura en `lib/recepcion-envio-reglas.ts` con su prueba: matriz, sumas, qué falta decidir (espejo de la base), armado de
  `p_lineas`/`p_extras`, lectura de la respuesta y del error de costo atípico. Guía de foco (ADR-0284) en la página y en la hoja de la
  prenda, declaradas en `lib/guia-de-foco-pantallas.ts`; sugerencias (ADR-0290) en el nombre y la descripción de la prenda nueva
  (`lib/sugerencias-alta-producto.ts` por categoría); solo tokens; loader único; `<Modal>` para las hojas; 375 px.
- **Sin cola sin conexión en esta pantalla [provisional]**: si se corta la señal, el aviso de siempre («no sabemos si llegó: vuelve a
  pulsar sin cambiar nada»), y el token hace seguro el reintento.

## Lo que NO es de esta fase

Resolver los faltantes y sobrantes con el proveedor («Nos debe», reposición, saldo a favor, devolver): fase 5. Liquidar, regalar,
desechar o devolver una dañada: ya existe en Existencias. El fondo y los gastos del viaje: fase 6. La guía impresa: después.
