# ADR-0393 · Recibir contando primero: la cara A sobre la recepción de Órdenes de compra

- **Fecha:** 2026-10-13 · **Estado:** ACEPTADO por Felipe el 2026-10-13 (las tres preguntas, con la opción recomendada) — es el contrato
  con la sesión de Órdenes de compra (ADR-0362), que todavía tiene que leer «La frontera» antes de que se toquen sus tablas. Sin
  construir. Número reservado con `pnpm reservar adr` (ADR-0381).
- **Rama:** `claude/recibir-fardo-2026-10-b45438` (trae la maqueta de `claude/receiving-merchandise-design-8a44ec`, que no tiene PR).
- **Especificación:** `docs/maquetas/recibir-fardo-2026-10/a-camino.html` (cara A, versión 2) y «Las 10 decisiones de Felipe» del README
  de esa carpeta (2026-10-13).
- **Contrato con:** ADR-0362, fases 3, 4 y 5a — PR #1014, #1015 y #1017, en borrador; **su base ya está en producción** (pegada el
  2026-10-13 entre las 11:09 y las 11:15 de Lima, con el OK de Felipe; PR #1025 refresca el volcado).

## El problema: dos recepciones de la misma mercadería

El 12 y el 13 de octubre dos sesiones diseñaron la misma pantalla sin saber una de la otra:

| | Fase 4 de Órdenes de compra (en producción) | Maqueta A (las 10 decisiones del 13-oct) |
|---|---|---|
| Unidad | El envío (`despachos`, `ENV-000061`): una guía, una sede | «El fardo F-0007» = la guía (decisión 2) |
| Contar | Talla × color de cada línea, todo antes de cerrar | Un número por categoría; el detalle es opcional (decisiones 1 y 8) |
| Lo nuevo | Se crea antes de cerrar (nombre, tallas, colores, precio) | Basta la cantidad; crearlo queda como pendiente (decisión 8) |
| Cerrar | Todo lo contado entra al stock | Entra lo que tiene tallas y colores; el resto queda pendiente (decisión 1) |
| Varias personas | Un solo formulario; lo contado vive en el navegador (un F5 lo borra: hallazgo 2 de `/formidable`, `docs/formidable/recibir-envio.md`) | Cada categoría guarda quién la contó; firma quien cierra (decisión 9) |
| Reabrir | No: cerrado es final | Sí, hasta que Compras resuelva la diferencia (decisión 5) |
| Sin aviso | Sigue «Llegó mercadería» (`recibir_lote`, detalle al momento) | La misma puerta y el mismo conteo (decisión 10) |

La maqueta, además, asumía piezas que no existen (`fardos`, `fardo_items_detalle`, `fn_despachos_por_abrir`, `abrir_fardo`,
`recibir_fardo`). Construirla tal como decía el README dejaba dos recepciones de la misma orden de compra, y «Nos debe» (fase 5a) leyendo
los faltantes de una sola.

## Lo que ya existe (producción, medido en solo lectura el 2026-10-13)

- **Tablas:** `despachos` (`en_camino → abierto → cerrado`, o `anulado` desde `en_camino`), `despacho_items` (categoría + marca + cantidad +
  precio por línea de orden), `despacho_recibidos` (lo que entró, por variante, con su movimiento), `despacho_diferencias` (un faltante o un
  sobrante por línea, con su causa: es la deuda de «Nos debe»), `proveedor_deuda_resoluciones` (5a) y `lotes.despacho_id`.
- **Funciones:** `abrir_despacho`, `recibir_orden_sin_envio`, `preparar_prenda_al_recibir`, `recibir_despacho`, `fn_envios_por_recibir`,
  `fn_envio_detalle`, `fn_proveedor_nos_debe`, `resolver_deuda_proveedor`.
- **Filas:** 0 envíos, 0 líneas, 0 recibidos, 0 diferencias, 0 resoluciones, 0 órdenes de compra. Cambiar estas tablas hoy no cuesta datos.

## La decisión

```
DECIDÍ:     Una sola recepción: el envío de producción. ADR-0393 le agrega lo que la cara A necesita y la fase 4 no tiene —el
            conteo guardado por línea, los pendientes y el reabrir— y la pantalla de A reemplaza a la de la fase 4. La recepción de
            la fase 4 queda como el caso «sin pendientes» de A: detallar todo antes de cerrar sigue siendo posible.
DESCARTÉ:   (1) Tablas propias del fardo (`fardos`, `recepcion_conteos`, `fardo_pendientes`), como decía el README: dos verdades
            de lo que llegó y «Nos debe» con dos fuentes de faltantes. (2) Dejar la base de la fase 4 tal cual y pintarle la cara A
            encima, con el conteo en el navegador: contradice las decisiones 1, 8 y 9, y un F5 sigue borrando lo contado.
SE ROMPE SI: los pendientes se vuelven el cajón donde se olvida la mercadería. Una prenda contada y sin detalle está en el almacén
            pero no en el stock: Vender no la ve, Colgar no la ofrece y el comprobante de Compras dice «recibido en parte» aunque
            todo llegó. Si nadie resuelve los pendientes en días, el almacén y el sistema dejan de coincidir sin error visible. El
            aviso en tres lugares (decisión 4) es la única defensa: si a la semana de uso en TRU hay pendientes de más de 7 días,
            el diseño pide un plazo o un candado, no más avisos.
```

## Vocabulario: una sola palabra por cosa

- **Envío** (`despachos` en la base; `ENV-000061` en pantalla) es lo que se cuenta y se cierra: una guía, una sede. Compras ya le dice así.
- **Fardo** es el bulto físico; una guía puede traer varios y se cuentan juntos (decisión 2). En pantalla solo aparece en el verbo
  («Abre el fardo y cuenta por categoría»), nunca como número ni como estado.
- **Pendiente** es lo contado que todavía no está en el stock: *separar* (no se sabe qué prendas son), *detalle* (se sabe la prenda, faltan
  tallas y colores) o *crear* (es nueva).

## La frontera: qué es de quién

| Pieza | Dueña | La otra |
|---|---|---|
| Crear, editar y anular un envío; `despacho_items`; estados `en_camino` y `anulado` | Órdenes de compra | Recibir solo lee |
| Abrir, contar, separar, cerrar y reabrir; estados `abierto` y `cerrado`; abrir un envío sin aviso (`despachos_sin_aviso`); `despacho_recibidos`, `despacho_diferencias` (escritura), `abrir_despacho`, `recibir_despacho`, `preparar_prenda_al_recibir`, la pantalla `/recibir/envio/[id]` | **Recibir (ADR-0393)**, desde este contrato. La fase 4 los escribió «porque Recepción no tenía rama» (ADR-0362) | Órdenes de compra los lee |
| «Nos debe» (`proveedor_deuda_resoluciones`, `fn_proveedor_nos_debe`, `resolver_deuda_proveedor`) | Órdenes de compra (5a, 5b) | Recibir escribe la resolución `repuesta` desde la recepción, como hoy |
| Las causas de faltante y sobrante | Las de producción mandan: `no_vino`, `se_perdio`, `otra_sede`; `regalo`, `cobra_aparte`, `proxima_compra`, `reposicion_faltante` | Una causa nueva se acuerda entre las dos |

Quien cambie la forma de una pieza de la otra avisa en `docs/SESIONES-ACTIVAS.md` antes de escribirla.

## Lo que la maqueta cambia para calzar con producción

- **Las causas** son las de producción, con los textos de la maqueta donde calzan («No vino del proveedor» = `no_vino`, «Lima lo mandó a
  otra sede» = `otra_sede`, «Se perdió en el camino» = `se_perdio`). **Lo de más** pregunta lo que pide la decisión 15 de ADR-0362 (regalo,
  se cobra aparte, se arregla en la próxima compra, es la reposición de lo que faltó), no «Vino de más / Era de otra sede / No se pidió».
- **Una categoría que no venía** es «algo que no estaba en la guía» (`extra_posicion`), con su causa de sobrante: la misma pieza de la fase 4.
- **Dañadas:** se marcan en la matriz de tallas y colores y van a la cuarentena con su fila en `prendas_danadas`, como en la fase 4. Es la
  decisión 7 en un solo paso: es la misma fila que deja «Reportar dañada» de Existencias. Una dañada sin detalle cuenta en el número y se
  marca al detallarla.
- **Quien hizo alguna orden del envío no cuenta ni cierra** (decisión 17 de ADR-0362, sin excepción). Contar es certificar lo que llegó.
- **«Fardo F-0007»** pasa a «Envío ENV-000061».

## Lo que ADR-0393 agrega (propuesta, sin escribir)

### Lo que nunca debe existir

1. En un envío cerrado, una línea donde lo que entró al stock más lo pendiente supera lo contado. Por línea siempre:
   `en stock + pendientes abiertos + sin separar = contadas`, con `sin separar ≥ 0`.
2. Un conteo o un pendiente de un envío que no se abrió, o que se anuló.
3. Un pendiente resuelto sin sus filas en `despacho_recibidos` (y por ellas, sin su movimiento).
4. Dos diferencias vigentes para la misma línea.
5. Un envío reabierto cuya deuda ya empezó a saldarse.

La 1 y la 3 las cuida la función bajo un solo candado (la fila del conteo de esa línea, `for update`); las demás, el esquema.

### Tablas

- **`retail.despacho_conteos`** — una fila por línea del envío (o por algo que no estaba en la guía), escrita al contar, no al cerrar:
  `despacho_id`, `despacho_item_id` o `extra_posicion` (uno de los dos, como en `despacho_recibidos`), para lo de fuera de la guía su
  `proveedor_id`, `categoria_id` y `marca_id`; `contadas` (entero ≥ 0), `separado` (jsonb: el borrador de «¿Qué blusas son?» —prendas
  conocidas con o sin tallas, nuevas con su cantidad y, si se quiere, su descripción—), `costo_unitario` (se fija al cerrar),
  `contado_por`, `contado_en`, `version`. Único por línea.
  *Por qué un borrador jsonb y no filas:* mientras el envío está abierto, lo separado cambia a cada toque y lo reemplaza entero quien guarda
  la línea (decisión 9: gana el último, con aviso); nadie lo consulta salvo la pantalla. Los hechos nacen al cerrar, en filas.
- **`retail.despacho_pendientes`** — nace al cerrar, solo se agregan filas y cambia su estado: `despacho_id`, la línea, `tipo` (`detalle` |
  `crear`), `cantidad` (> 0), `producto_id` (obligatorio si es `detalle`), la descripción de una nueva (opcional), `estado` (`pendiente` |
  `resuelto` | `anulado`), `anotado_por/en`, `resuelto_por/en`. **«Separar» no es fila: se calcula** (contadas − en stock − pendientes), así
  nunca se desfasa.
- **`retail.despacho_cierres`** — el rastro de cada cierre y cada reapertura (quién, cuándo, por qué): «Cerrado a las 10:58 por Mariana ·
  reabierto después».
- **En tablas de la fase 4/5a (necesitan el acuerdo de Órdenes de compra):** `despachos.cierres` (cuántas veces se cerró);
  `despacho_diferencias.cierre`, con el único por línea pasando a `(despacho, línea, cierre)`: solo se agregan filas y la vigente es la del
  último cierre; `despacho_recibidos.pendiente_id` (qué pendiente resolvió esa entrada). `fn_proveedor_nos_debe`, `fn_nos_debe_resumen`,
  `resolver_deuda_proveedor` y la reposición de `recibir_despacho` leen solo las diferencias vigentes.

### Funciones

- **`guardar_conteo_envio`** (contar y separar una línea; también agrega lo que no estaba en la guía): con el envío `abierto`, el módulo Recibir y
  la sede. Si otra persona guardó esa línea después de lo que viste, guarda lo tuyo y te devuelve lo que pisaste («Lucía había puesto 38»).
- **`cerrar_conteo_envio`** (firma quien cierra, combo «Responsable»): costo por línea (decisión 6 y la 18 de ADR-0362), causas de lo que no
  cuadró (contadas contra enviadas), nota. Lo separado con tallas y colores entra al stock como hoy (lote por proveedor, movimientos al
  almacén y a la cuarentena, costo promediado, el papel hasta su cupo); el resto se vuelve pendiente. Idempotente por token y huella.
- **`recibir_despacho` sigue existiendo** con la misma firma y la misma respuesta: escribe los conteos con todo detallado y llama al mismo
  cierre. Un solo camino que escribe stock (el primer commit es el refactor que saca ese camino de `recibir_despacho`; el segundo, los conteos).
- **`resolver_pendiente_envio`** («Hacer ahora»): separar, poner tallas y colores o crear lo nuevo (con `preparar_prenda_al_recibir`). Entra al
  stock con el costo fijado al cerrar y el lote de ese envío y proveedor (lo crea si al cerrar no hubo ninguno), y carga el papel hasta el
  cupo que quede. Pedir más de lo pendiente se rechaza: «Contaste 40 y ya separaste 40: si hay más, reabre el conteo». Cambiar el número
  tiene una sola puerta, reabrir.
- **`reabrir_envio`**: `cerrado → abierto` mientras ninguna diferencia vigente tenga resolución en «Nos debe» (decisión 5: «hasta que
  Compras resuelva»); lo que ya entró al stock no se toca y los pendientes abiertos vuelven al borrador de su línea. La pantalla dice si
  Compras ya tomó la diferencia.
- **Lecturas:** el detalle del envío suma los conteos (quién contó cada línea), los pendientes y el rastro de cierres; una lectura de
  pendientes por sede da el número de la decisión 4 (Inicio, cabecera de Recibir, Catálogo ▸ Productos ▸ Por crear), siempre calculado.
- **El papel de Compras dice la verdad aunque haya pendientes.** Lo recibido de un comprobante (`compras.recibido_cantidad`) sube con los
  movimientos, y un pendiente todavía no tiene movimiento: con 15 blusas sin detallar, la factura del proveedor se vería «recibida en
  parte» aunque todo llegó, y alguien podría reclamarle o retenerle un pago por prendas que están en el almacén. El detalle del envío y del
  comprobante dicen «llegó todo · 15 por detallar» (lo contado manda para Compras; el stock, para la tienda).

### Números

Tres tiendas y Compras: unos 2 a 5 envíos por semana por sede, de 5 a 20 líneas → menos de 5 000 conteos y pendientes al año, y 2 o 3
personas contando el mismo envío a la vez. No hace falta índice más allá de las llaves y los únicos; el candado por línea basta.

## Lo que decidió Felipe (2026-10-13)

| # | Pregunta | Decisión |
|---|---|---|
| 1 | ¿A reemplaza la recepción de la fase 4? | **Sí, A sobre el mismo envío** |
| 2 | ¿Cómo se recibe lo que llega sin aviso? | **Un envío sin orden**, con el mismo conteo y los mismos pendientes |
| 3 | ¿En qué orden con #1014, #1015 y #1017? | **Se fusiona la pila como está y A se construye encima** |

Las preguntas, como se plantearon:


1. **¿A reemplaza la recepción de la fase 4 sobre el mismo envío?** (recomendado; el resto de este contrato depende de eso).
2. **El caso sin aviso.** Recomendado: un **envío sin orden** que la sede abre al llegar (`despachos.origen = 'sin_aviso'`,
   `despacho_items.orden_compra_item_id` deja de ser obligatorio solo ahí, con el proveedor o «por confirmar» y el «dijeron» opcional por
   categoría): mismo conteo, mismos pendientes, y Compras lo ve marcado (decisión 10). El costo sigue la regla de «Llegó mercadería» de hoy
   (ADR-0330: la factura se une después). Alternativa: que el sin aviso siga siendo «Llegó mercadería» tal cual (detalle al momento, sin
   pendientes), que no toca tablas de Compras pero deja dos maneras de recibir y nada nuevo puede quedar «por crear».
3. **El orden con la pila de Órdenes de compra.** Recomendado: fusionar #1014 → #1015 → #1017 como están (la base ya está en producción y hay
   0 órdenes) y construir A encima, reusando sus piezas (matriz talla × color, «Es nueva», «Ya la tengo», el aviso de costo atípico,
   `lib/recepcion-envio-reglas.ts`). Alternativa: frenar la web de #1015 y que A la reemplace antes de fusionar, que evita una pantalla
   intermedia pero detiene 5a y la fase 7, que van encima.

Por defecto, si no dice otra cosa: quien hizo una orden del envío no cuenta ni cierra; reabrir se corta con la primera resolución de
«Nos debe»; un pendiente se anula solo reabriendo.

## Plan de construcción (reemplaza el «Cómo sigue» que no llegó al README de la maqueta)

1. **Contrato** (este ADR) y OK de Felipe; mensaje a la sesión de Órdenes de compra con «La frontera» y los cambios en sus tablas.
2. **Base · contar guardado:** refactor de `recibir_despacho` (un solo camino de cierre) y `despacho_conteos` + `guardar_conteo_envio` + lecturas;
   pruebas en Postgres (permisos, sede, quien compró, gana el último con aviso, envío anulado o cerrado).
3. **Base · cerrar con pendientes:** `cerrar_conteo_envio`, `despacho_pendientes`, `resolver_pendiente_envio`, la lectura del número de
   pendientes; la invariante 1 como prueba y como candado de la base (ver «Construido»).
4. **Base · reabrir y sin aviso:** `despacho_cierres`, `reabrir_envio`, el cierre en `despacho_diferencias` con los lectores de «Nos
   debe»; el envío sin orden (si Felipe elige la opción recomendada).
5. **Web · la cara A:** la puerta de `/recibir` (reemplaza «Llegó mercadería»), ¿Qué llegó? → Contar → Cerrar en `/recibir/envio/[id]`,
   «Para después» con «Hacer ahora», el aviso en Inicio, en la cabecera de Recibir y en Catálogo ▸ Productos ▸ Por crear.
6. **Calidad y cierre:** `/guia`, `/focus`, `/sugerir`, `/unificar`, `tema:auditar`, `/chaos` (guarda stock), `/formidable`, 375 px;
   diccionario, ARQUITECTURA, bitácora y backlog. Cada SQL a producción, con el OK de Felipe.

## Construido

### Actividad 2 · contar guardado (2026-10-13)

- **`20261013170000_recepcion_un_solo_camino_de_cierre.sql` (refactor, sin cambio de comportamiento).** Lo que escribe stock salió de
  `recibir_despacho` a `fn_recepcion_entrar` (interna): candados del papel y las variantes, prendas, costo atípico, lotes, entradas,
  costo promediado, lo recibido y lo que faltó o sobró. `recibir_despacho` se reescribió entera desde su definición VIVA, con los tres
  parches anclados de la fase 5a con su texto exacto: re-pegar `20261013015000` encima no hace nada (probado). Dos ajustes que en el
  formulario de hoy dan lo mismo: el lote es del proveedor que trae entradas, y si el envío ya tiene el suyo se usa ese.
- **`20261013171000_conteo_de_envio.sql`.** `despacho_conteos` (una fila por línea o por algo fuera de la guía; RLS sin políticas; solo
  con el envío abierto; no se borra; CHECK «lo separado no pasa de lo contado»), `guardar_conteo_envio` (gana el último y devuelve lo pisado;
  el envío se toma en modo compartido: varias personas cuentan a la vez y solo esperan por su línea) y `fn_envio_conteos`. Por ancla,
  `recibir_despacho` deja también el conteo de cada línea todo detallado.
- **Lo que cambió del plan:** los conteos se leen con `fn_envio_conteos` y no dentro de `fn_envio_detalle` (ya lleva dos anclas de la 5a;
  la pantalla pide las dos lecturas juntas). Guardar no sube la versión del envío: esa versión es de Compras.
- **Pruebas:** `pruebas:conteo-de-envio` (16 casos; mutaciones «nunca avisa» y «el disparador deja escribir cerrado» detectadas);
  `pruebas:recepcion-de-envio` (28) y `pruebas:nos-debe` (16) cargan las dos migraciones y siguen en verde; una mutación de
  `fn_recepcion_entrar` que no aplica el stock deja 5 casos de la recepción en rojo. Corridas contra una pila propia (`supabase start`,
  puertos 549xx) con todas las migraciones de la rama.
- **Nada de esto está en producción.** Se pega con el OK de Felipe, después de 20261013015000.

### Actividad 3 · cerrar con pendientes (2026-10-13)

- **Nombres.** `cerrar_conteo` y `reabrir_conteo` ya eran del conteo de inventario (ADR-0277): las funciones de este ADR terminan en
  `_envio` (`guardar_conteo_envio`, `cerrar_conteo_envio`, `resolver_pendiente_envio`) y sus internas empiezan con `fn_envio_`. Un
  commit propio, antes de la actividad, renombró lo de la actividad 2 (no estaba en producción ni lo llamaba la web).
- **`20261013172000_cerrar_conteo_con_pendientes.sql`.** `despacho_pendientes` (detalle | crear; nace al cerrar o al separar después;
  solo se agregan filas y su estado avanza), `despacho_recibidos.pendiente_id`, `fn_envio_cuentas` (por línea: contadas, en el stock,
  en pendientes y sin separar) y **el cierre único `fn_recepcion_cerrar`**: la reposición de la 5a con su texto exacto, la puerta al
  stock, los pendientes, el saldo, el envío cerrado y la actividad. `recibir_despacho` (misma firma) arma lo de siempre, deja el conteo
  todo detallado y cierra por ahí; `cerrar_conteo_envio` cierra lo guardado: lo que tiene tallas entra, lo demás queda pendiente, y
  lo que faltó o sobró se mide con lo **contado** («40 contadas de 40» no es «faltan 28» aunque solo 12 tengan tallas).
- **`20261013173000_resolver_pendiente_de_envio.sql`.** `resolver_pendiente_envio` («Hacer ahora», con el envío cerrado), con
  `despacho_separaciones` para el token (un doble clic no entra dos veces); `preparar_prenda_al_recibir` (por ancla) crea o completa
  una prenda con el envío cerrado mientras le quede algo por detallar; `fn_envio_conteo_json` suma por línea lo que está en el stock,
  lo sin separar y sus pendientes; `fn_recepcion_pendientes(sede)` es el número de la decisión 4 (por separar, por detallar, por crear,
  desde cuándo).
- **Lo que cambió del plan:**
  - **La invariante 1 y la 3 las cuida la base, no solo las funciones.** Un candado DIFERIDO por línea (`despacho_recibidos_cuadra`,
    `despacho_pendientes_cuadra`) revisa al confirmar: en el stock + pendientes ≤ contadas, lo que entró por un pendiente no pasa de
    su cantidad y es de su línea, y resuelto = entró todo. Son cuatro las funciones que escriben ahí (y la actividad 4 suma reabrir);
    la próxima se olvidaría de validar. Por eso **no va como invariante de `/chaos`**: su regla es no vigilar lo que la base ya
    impide. En la actividad 4, cuando reabrir deje cambiar lo contado de un envío con stock, el candado se extiende a `despacho_conteos`.
  - **Quien cierra firma lo que vio:** `cerrar_conteo_envio` recibe la versión de cada conteo; si alguien guardó o agregó una línea
    después, PT409 `conteo_cambiado` («Blusas cambió mientras cerrabas, lo guardó Lucía»).
  - **«Hacer ahora» sobre un pendiente solo pone tallas y colores** (cualquier prenda de la categoría y marca de su línea: al detallar se
    descubre a veces que 3 «Aurora» eran «Lina»); separar en prendas sin tallas o nuevas se hace desde lo sin separar. Un pendiente no
    tiene hijos, y lo que queda de él es su cantidad menos lo que entró por él.
  - **La respuesta de `recibir_despacho` suma dos datos:** `contadas` y `por_detallar` (lo que Compras necesita para decir «llegó todo ·
    15 por detallar»). Lo demás, igual.
  - **Re-pegar `20261013015000` (la 5a) después de `172000` falla a propósito:** sus dos bloques sobre `recibir_despacho` viven ahora en
    `fn_recepcion_cerrar`. En producción ya está pegada; `pruebas:nos-debe` dejó de recargarla y recarga esta cadena. **La rama de la
    fase 7 (`claude/purchase-order-phase7-9b0c82`) recarga la 5a en su `nos_debe.mjs`:** al traer `main` con esto, toma la lista nueva
    (aviso en `docs/SESIONES-ACTIVAS.md`).
- **Pruebas:** `pruebas:pendientes-de-envio` (23 casos: cerrar todo detallado y con pendientes, toda línea contada, causas, firmar lo
  que se vio, fuera de la guía, doble clic, permisos; «Hacer ahora» por partes, nunca más de lo que queda, desde lo sin separar, crear
  con el envío cerrado, costo atípico, el papel hasta su cupo; el candado escrito a mano; el número de la sede; y **tres casos de dos
  sesiones reales** con COMMIT, solo en un banco propio o en el CI). Mutaciones detectadas: el cierre sin pendientes (12 rojos), el
  candado ciego (1), lo que faltó medido con lo detallado (13), «Hacer ahora» sin tope (lo frena el candado diferido) y el envío tomado
  en modo compartido (el caso de dos sesiones de fuera de la guía). `conteo-de-envio` 16, `recepcion-de-envio` 28 y `nos-debe` 16
  siguen en verde con las dos migraciones cargadas dos veces.
- **Nada de esto está en producción.** Se pega con el OK de Felipe, en orden: `170000`, `171000`, `172000`, `173000` (y `180000`, abajo).

### Actividad 4, primera parte · reabrir (2026-10-13)

- **`20261013180000_reabrir_envio.sql`.** `reabrir_envio` (cerrado → abierto con su motivo; firma el responsable; token): lo que faltó o
  sobró deja de valer (sale de «Nos debe»), lo pendiente vuelve al borrador de su línea, lo que entró al stock no se toca y queda el
  rastro en `despacho_cierres` (cada cierre con lo que respondió, su nota y su token; cada reapertura con su motivo). No se reabre si
  Compras ya resolvió parte de lo que faltó, ni si lo de más del envío ya saldó otra deuda (`fn_envio_reabrir_bloqueo`, la misma regla
  para la función y la pantalla). `fn_envio_conteos` suma el rastro y `reabrir: {se_puede, por_que_no}`.
- **Lo que cambió del plan:**
  - **Una diferencia deja de valer con una columna, no con un número de cierre.** `despacho_diferencias.vigente` y la vista
    `despacho_diferencias_vigentes`; los únicos pasan a «una vigente por línea» (invariante 4). Las ocho lecturas de Compras («Nos debe»
    y el detalle del envío) y las dos del cierre leen la vista con el MISMO cambio mecánico de su `from`, y la migración se niega a quedar
    aplicada si alguna función sigue leyendo la tabla sin filtrar. `despachos.cierres` y `despacho_diferencias.cierre` no hicieron falta:
    el rastro los reemplaza. Descartado: unir con `despachos` dentro de la vista (bloquear una deuda bloquearía el envío, y reabrir y
    resolver una deuda podrían esperarse en cruz).
  - **Reabrir borra del envío cómo se cerró** (quién, cuándo, la nota, el token): los CHECK de Compras (`despachos_cierre`,
    `despachos_recepcion_solo_al_cerrar`) exigen que un envío abierto no los tenga. No se pierde: el rastro los guarda. Para eso
    `fn_despachos_camino` (por ancla) deja pasar cerrado → abierto y `fn_despachos_recepcion_fija` (reescrita: es la parte de la
    recepción, de 20261013001000) deja borrar exactamente eso, los dos solo desde `reabrir_envio`.
  - **Reabrir rehace el borrador de TODAS las líneas** con lo que todavía no está en el stock. La prueba lo encontró: una línea cerrada
    con todo detallado conservaba su borrador, y el segundo cierre lo habría metido dos veces al stock.
  - **Lo contado no baja de lo que ya entró:** `guardar_conteo_envio` lo dice con palabras (`conteo_menos_que_stock`) y el candado
    diferido de la actividad 3 se extiende a `despacho_conteos`. `recibir_despacho` (el formulario de la fase 4) no cierra un envío
    reabierto (`envio_reabierto`): volvería a meter lo que ya entró.
- **Pruebas:** `pruebas:reabrir-envio` (11 casos: cuadrar un faltante, pendientes que vuelven al borrador, el freno de Compras en sus dos
  formas, lo contado bajo el stock aunque se escriba a mano, permisos y estados, doble clic, «Nos debe» y el detalle leyendo lo que vale,
  el rastro; y **dos casos de dos sesiones reales**: reabrir y resolver la deuda a la vez, en los dos órdenes). Mutaciones detectadas:
  el borrador solo de las líneas con pendientes, reabrir sin mirar a Compras y mirar sin tomar antes las deudas (con dos sesiones,
  reabre un envío cuya deuda ya se resolvió). Las otras cuatro pruebas siguen en verde con `180000` cargada dos veces.
- **Sigue en la actividad 4:** el envío sin aviso (abajo).

### Actividad 4, segunda parte · el envío sin aviso (2026-10-13)

- **`20261013183000_envio_sin_aviso.sql`.** `abrir_envio_sin_aviso(sede, proveedor, guía, nota, token)`: la sede abre al llegar un envío
  **sin guía**, ya abierto, y su proveedor queda en `despachos_sin_aviso` (tabla de Recibir). Todo lo que se cuenta en él es «lo que no
  estaba en la guía» (categoría, marca y el proveedor del envío), y como no hubo guía nada falta ni sobra: no deja diferencias ni deudas.
  El costo sigue ADR-0330: `cerrar_conteo_envio` no lo pide en un envío sin aviso y solo lo acepta de quien ve el dinero de Compras
  (`recepcion_costo_sin_permiso`); `fn_recepcion_entrar` deja entrar sin costo sin promediar el de la prenda
  (`despacho_recibidos.costo_unitario` puede quedar vacío). `guardar_conteo_envio` y `preparar_prenda_al_recibir` aceptan el proveedor
  del envío; `recibir_despacho` no lo cierra (`envio_sin_aviso`); `fn_envio_conteos` dice su `origen` y sus `proveedores`.
- **Lo que cambió de la decisión 2 (recomendada y aceptada), y por qué:**
  - **Sin líneas de envío sin orden:** `despacho_items.orden_compra_item_id` sigue obligatorio. Lo que el ADR proponía tocaba tablas de
    Compras y una docena de lecturas suyas que unen la línea con su orden; «lo que no estaba en la guía» ya es exactamente esto.
  - **Sin «por confirmar» como proveedor:** la puerta de hoy pregunta «¿de quién?» primero, y un lote o una factura sin proveedor no se
    unen después. Si nadie en la tienda sabe, lo elige el líder. **Decisión de negocio que Felipe puede revertir.**
  - **Sin «lo que dijeron» por categoría:** sin orden no hay deuda que anotar; cabe en la nota. **Felipe puede pedirlo** (sería una
    columna en `despacho_conteos` y, si debe volverse deuda, un faltante «no vino» contra un proveedor sin orden).
- **Pruebas:** `pruebas:envio-sin-aviso` (6 casos: abrir con permisos y token, contar y cerrar sin costo, la regla del costo, lo pendiente
  con la prenda nueva del proveedor del envío, el freno al formulario de la fase 4 y reabrir sin freno). Mutaciones detectadas: promediar
  sin costo, aceptar el costo de quien no ve el dinero y medir el envío sin aviso contra una guía vacía. Las otras cinco pruebas cargan
  `183000` y siguen en verde.
- **Nada de esto está en producción.** Orden de pegado completo: `170000`, `171000`, `172000`, `173000`, `180000`, `183000`.


### Actividad 5 · la cara A en la web (2026-10-13)

- **`/recibir/envio/[id]`** se recibe en tres pasos: **¿Qué llegó?** (en camino: «Empezar a recibir»), **Contar** (una categoría a la
  vez, el número es lo esencial; cada cambio se guarda solo a los 700 ms sin abrir el loader y dice quién contó; «¿Qué … son?» es
  opcional) y **Cerrar** (la tabla con lo que dijeron, lo contado, lo que entra al stock y la causa de lo que no cuadró; el costo de lo de
  fuera de la guía). Cerrado: las cifras, lo que ya entró con «Imprimir etiquetas» y «Bajar al piso», **«Para después»** con «Hacer
  ahora» / «Crear ahora», lo que no cuadró, el rastro de cierres y reaperturas, y «Reabrir el conteo».
- **`/recibir`**: «¿Llegó algo sin aviso?» reemplaza a «Llegó mercadería» (si el proveedor tiene una factura por recibir en la sede, ofrece
  recibir contra ella) y arriba sale el aviso de lo recibido por terminar. El Inicio («Recibido por terminar», urgente pasados 7 días) y
  Catálogo ▸ Productos («N prendas recibidas por crear», solo lo por crear) leen el mismo `fn_recepcion_pendientes`.
- **La web se publica antes que el SQL sin romper nada:** si la base no tiene `fn_envio_conteos` / `fn_recepcion_pendientes`, la pantalla
  del envío sigue con la recepción de la fase 4, `/recibir` con «Llegó mercadería», y los avisos no salen.

DECIDÍ: la pantalla elige su cara por lo que la base sabe (`PGRST202` / `42883` = «todavía no está»), no por una bandera.
DESCARTÉ: una bandera en `configuracion` porque obliga a pegar SQL y a acordarse de encenderla; con dos caras vivas, la que no
corresponde a la base fallaría al guardar.
SE ROMPE SI: alguien pega solo una parte de las migraciones (por ejemplo `171000` sin `172000`): la pantalla vería `fn_envio_conteos`
y no podría cerrar. Por eso el orden de pegado es uno solo y completo.

- **Lo que la web agrega a lo que la base ya frena (sin reglas nuevas):** la hoja de «Hacer ahora» no deja meter más de lo que queda del
  pendiente (la base lo rechazaría) y lo dice en palabras; con todas las categorías contadas, el botón principal es «Pasar a cerrar»
  aunque la persona esté en la primera; en un envío sin aviso la tabla de cierre no pregunta qué pasó con lo contado (nada sobra ni
  falta); con la lista vacía, la guía de foco enciende «+ Agregar lo que llegó».
- **Con el envío cerrado, el catálogo (tallas y colores) solo se lee si quedan pendientes** (`necesitaCatalogoAlCerrar`): «Crear ahora»
  lo necesita, un envío terminado no.
- **Un envío sin aviso que alguien dejó abierto** sale en la puerta como «Llegó sin aviso: se sigue contando»: `fn_envios_por_recibir`
  (de Compras) no trae su proveedor y no se tocó. Si Felipe quiere el nombre del proveedor ahí, es una llave más en esa función.
- **Felipe puede revertir:** el aviso de Productos es por sede (la de quien mira), no de todo CAYLA; al reabrir, la causa de lo que no
  cuadró se vuelve a elegir (no se precarga la del cierre anterior: quien reabre suele corregir justamente eso).
- **Verificado en el navegador** contra una base propia con todas las migraciones: contar, separar, tallas y colores, cerrar con causa,
  «Hacer ahora» (separar y crear la prenda, con la base confirmando el movimiento de entrada y el pendiente resuelto), reabrir y volver a
  cerrar (rastro cierre → reapertura → cierre, una sola diferencia vigente), el envío sin aviso de punta a punta, los avisos de Recibir,
  Inicio (cuenta de integrante) y Productos, 375 px sin desbordes y las guías interactivas de `/recibir`, `/recibir/envio/[id]` y
  `/productos` con `guias:recorrer`. 0 errores de consola.
