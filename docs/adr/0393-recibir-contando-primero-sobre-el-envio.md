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
    unen después. Si nadie en la tienda sabe, lo elige el líder. **Decisión de negocio que Felipe puede revertir.** *Revertida el
    2026-10-14: ver «Sin proveedor y sin marca», abajo.*
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

### El Plan de campaña lee solo lo que faltó y todavía vale (2026-10-14)

Al traer `main` llegó `20261013213000` (ADR-0372): el Plan de campaña resta de «Comprar» lo que el proveedor debe reponer, leyendo los
faltantes «No vino» de `despacho_diferencias` directamente. Con la reapertura de ADR-0393, un envío reabierto y vuelto a cerrar guarda
su faltante viejo como no vigente: el Plan lo habría contado dos veces y restado de más. La prueba F1 de `pruebas:reabrir-envio`
(ninguna función lee la tabla sin filtrar) lo habría frenado en el CI; con el control negativo, sin el arreglo, cuenta una lectura.

DECIDÍ: el mismo reemplazo anclado que ya leen «Nos debe» y el detalle del envío, en dos lugares: `20261013180000` se lo aplica a
`fn_plan_compra_pedido` si ya existe (producción, donde el Plan se pegó antes) y `20261014144000` (nueva) en una base hecha de cero, donde
el Plan llega después.
DESCARTÉ: reescribir la función del Plan, porque pisaría su trabajo y sus parches; y un `and x.vigente` en su consulta, porque sería la
única lectura distinta de las otras diez.
SE ROMPE SI: alguien re-pega `20261013213000` después: su propio candado («no se pisa sin mirar», por md5) lo rechaza a propósito, como
pasa con `20261013015000` después de `172000`.

Probado: los dos órdenes de pegado en una transacción que se deshace (la función queda leyendo la vista y `144000` se puede pegar dos
veces), la base hecha de cero, las seis suites de la recepción y la del Plan (`plan_compra_historia`, 18/18). **Orden de pegado completo:**
`170000`, `171000`, `172000`, `173000`, `180000`, `183000`, `20261014144000` (y `20261014205000`, abajo).


### El diseño de la maqueta A, aplicado (2026-10-14)

Felipe comparó lo construido con la maqueta (`docs/maquetas/recibir-fardo-2026-10/a-camino.html`) y pidió que se viera como ella. Las
pantallas hacen lo mismo que en la actividad 5 —las mismas funciones, los mismos guardados—; cambió cómo se ven:

- **El riel** de tres paradas con lo que ya pasó en cada una («ENV-000123 · 120 prendas», «118 contadas · 118 para después»): es la misma
  pieza que la línea de pasos de Inventario (`PasosConteo forma="riel"`), más grande. Los pasos hechos se tocan para volver.
- **¿Qué llegó?:** la caja del fardo, lo que dijeron que trae por categoría y **«Abrir el fardo»** (antes «Empezar a recibir»). Al lado,
  «¿Llegó algo que no está aquí?» separa los dos casos que se confundían: dentro de este fardo se suma al contar; otro paquete se recibe
  sin aviso.
- **Contar:** la lista de categorías a la izquierda (cuántas separadas, cuántas sin separar, la diferencia) y el contador grande a la
  derecha (+5, +10, «Llegaron las N»). El buscador de prendas queda siempre a la vista; lo nuevo se puede **describir ahora** (una hoja
  que solo escribe en el borrador de la línea, `describirNuevas`: nunca pasa de las nuevas contadas). Abajo, **la balanza** Dijeron /
  Contaste, que se inclina hacia donde hay más y dice si cuadra (`veredictoDeLaBalanza`).
- **Cerrar:** la tabla suma la columna **«Para después»** con su detalle por categoría (sin separar, sin tallas, por crear).
- **Cerrado:** el sello, las cuatro cifras, «Para después» como caja punteada y «Lo que no cuadró» con lo que pasa con cada causa.
- **Sin aviso:** el proveedor se elige en tarjetas con sus marcas (antes un combo).

DECIDÍ: copiar la maqueta con las piezas del sistema (`Chip`, `TarjetaCifra`, `Buscador`, `Boton`, `TituloSeccion`, `ComboResponsable`) y
dibujar solo lo que no existía (caja, baldosa, balanza, sello: `components/recepcion-conteo/piezas.tsx`, estilos solo con tokens en
`app/estilos/recepcion-conteo.css`).
DESCARTÉ: copiar el HTML de la maqueta tal cual, porque trae sus propios botones, pestañas y colores: rompería «una función, una pieza»
(ADR-0358), el modo oscuro (ADR-0336) y la guía de foco (ADR-0284), y la pantalla dejaría de verse como el resto del ERP.
SE ROMPE SI: la maqueta cambia y nadie lo trae aquí: el riel, la balanza y la caja viven solo en Recibir y nadie más los mira.

**Lo que se aparta de la maqueta, a propósito:**

- **Quién cuenta y quién cierra** es el combo «Responsable» de siempre (ADR-0161/0162: candado de asistencia, firma con
  `fn_actor_persona_id(true)`), no las tarjetas de personas de la maqueta.
- **«Se pueden vender»** y no «Al stock»: lo eligió Felipe en `/formidable` (2026-10-14).
- **El punto del paso de hoy late una vez**, no en bucle (ADR-0136).
- **Los títulos** son `TituloSeccion` (21 px), no los 30 px de la maqueta (ADR-0358).
- **Se dice «Envío ENV-…»**, no «Fardo F-…»: el número es el del envío de Compras (vocabulario de este ADR).
- **No están**, porque piden base o decisión de Felipe: «¿Cuántas dijeron que venían?» en un envío sin aviso, «Avisar a la encargada» y
  el número de guía al cerrar. («Proveedor por confirmar» entró el mismo día: ver abajo.)

De paso: el pie fijo del cierre ya no se sale 8 px a 375 (usaba los márgenes de una hoja estando en la página); el costo dice qué es en el
celular; el texto chico del riel sube a 4,5:1 (`tema:auditar`); «Volver a cero» pasa a «Poner en cero»; el contador ya no dice «las
vestidos». Verificado: suite completa de vitest, `guias:recorrer` con el envío en camino y abierto, `tema:auditar` de siete escenarios
(0 hallazgos en oscuro; uno nuevo: «Describir lo nuevo») y 375 px sin desbordes en la puerta, contar, cerrar y cerrado.

### Sin proveedor y sin marca (Felipe, 2026-10-14)

Felipe, al revisar la puerta: a veces Compras manda mercadería sin decir de quién es, y hay prendas que no tienen marca. Las dos cosas se
pueden dejar así y completar después, pero no del mismo modo, y esa diferencia la eligió él entre dos opciones con su costo:

- **Sin proveedor: «contar ya, proveedor al cerrar».** La puerta ofrece «No sé de quién es» (siempre a la vista, al final de la lista). Se
  abre y se cuenta igual; el conteo avisa «Proveedor por confirmar»; al cerrar, la pantalla pide «¿De quién llegó?» y la base no cierra sin
  él (`envio_sin_proveedor`). `poner_proveedor_envio` lo pone **una sola vez** (el mismo otra vez no hace nada; otro, no: el disparador de
  `despachos_sin_aviso` solo deja pasar de vacío a uno) y se lo pasa a lo contado. Toma el envío en exclusiva: `guardar_conteo_envio` lo
  toma compartido, así ninguna línea queda sin proveedor por una carrera.
- **Sin marca: «prenda libre, paquete con dueño».** Lo que no estaba en la guía se cuenta con «Sin marca» (primera opción del combo), entra
  al stock así y la prenda nueva nace sin marca; se completa después en Editar producto, como ya permitía el catálogo.
  `despacho_recibidos.marca_id` y `despacho_diferencias.marca_id` dejan de ser obligatorios, el CHECK de lo contado fuera de la guía pide
  solo la categoría, y la búsqueda de prendas (`fn_prendas_para_recibir`) encuentra las sin marca. Lo de la guía sigue trayendo la marca de
  su orden.

DECIDÍ: el proveedor puede esperar hasta el cierre, la marca puede no llegar nunca. Las lecturas que unían la marca con JOIN (el cierre,
«Hacer ahora» y el detalle del envío) la unen con LEFT JOIN.
DESCARTÉ: que entre al stock sin proveedor (con el lote «por confirmar»), que vendía el mismo día pero dejaba el lote, el costo, la factura
y «Nos debe» sin dueño hasta que alguien lo completara, en tablas del núcleo (`lotes`); y una marca de mentira «Sin marca» en `marcas`,
que daría dos maneras de decir lo mismo (el catálogo ya usa la marca vacía).
SE ROMPE SI: una lectura nueva une lo recibido con `marcas` usando JOIN: las filas sin marca desaparecen de ella sin aviso. La prueba M1
de `pruebas:envio-sin-aviso` lo vigila para el detalle del envío; una lectura nueva tiene que usar LEFT JOIN (o `fn_envio_conteo_json`).

Construido corrigiendo `20261013183000` en su lugar (no estaba pegada ni fusionada), con su comprobación ampliada: el orden de pegado no
cambia. `pruebas:envio-sin-aviso` 10/10 (P1, P2, M1 y M2 nuevos) y las otras seis suites de la recepción en verde sobre una base hecha de
cero; en el navegador, de la puerta al cierre con el proveedor elegido, y el modo oscuro del estado nuevo (escenario `recepcion.de-quien`).

### Lo que la maqueta pedía a la base (Felipe, 2026-10-14)

| Pieza de la maqueta | Decisión |
|---|---|
| «¿Cuántas dijeron que venían?» en un envío sin aviso | **No.** Lo que dijo el proveedor por WhatsApp cabe en la nota del cierre; la balanza de un envío sin aviso dice que no hay con qué comparar. |
| «Avisar a la encargada» | **Basta el aviso del Inicio** (y el de Recibir y Productos, que cambia de color a la semana). |
| El número de guía al cerrar | **Sí:** `20261014205000`, `corregir_guia_envio`. |

DECIDÍ: corregir la guía con una función propia, con el envío abierto, que la pantalla llama antes de cerrar si el campo cambió, y cerrar con
la versión nueva del envío (el disparador de Compras la sube).
DESCARTÉ: un parámetro nuevo en `cerrar_conteo_envio`, porque cambiaría su firma y `180000` y `183000` la parchan por ancla con la de hoy;
y corregirla en camino (es de Compras) o cerrado (para eso está reabrir).
SE ROMPE SI: alguien corrige la guía mientras otra persona tiene abierta la pantalla de cierre: la versión del envío sube y ese cierre
pide recargar (`version_cambiada`). Es lo esperado: el cierre firma lo que vio.

Rastro en la actividad («corrigió la guía de ENV-000001: T001-000342 → T001-000999»). `pruebas:envio-sin-aviso` 12/12 (G1, G2). **Orden de
pegado completo:** `170000`, `171000`, `172000`, `173000`, `180000`, `183000`, `20261014144000`, `20261014205000`.

### «Recibir mercadería» vive en Inventario (Felipe, 2026-10-14)

Recibir aparecía en dos lugares del menú según quién mirara (ADR-0113): en Compras para quien ve el dinero de Compras y en Inventario para
quien no; el líder parado en el Taller no lo tenía en ninguno. Felipe pidió que esté en Inventario, también en el menú lateral.

DECIDÍ: una sola fila, en Inventario y para todos, después de Conteo (`lib/menu.ts`), y el módulo al grupo «Inventario» con orden 115 en la
base (`20261014210000`; `lib/modulos.ts` lo espeja). Compras vuelve a 6 hijas y pierde la excepción temporal que esperaba esta mudanza
(ADR-0362, decisión 38).
DESCARTÉ: dejarlo en los dos lugares, porque la misma pantalla con dos direcciones según el rol es la que hacía que el líder no la
encontrara; y solo mover la fila del menú sin la base, porque Roles y accesos la habría seguido mostrando en Compras en una base nueva
(producción ya la tenía en «Inventario» desde el 2026-10-07 sin que el repo lo dijera).
SE ROMPE SI: alguien vuelve a poner `soloSinPermiso` o una fila de Recibir en Compras: `lib/menu-hoy.golden.json` y `lib/menu.test.ts` lo
frenan.

### En producción (2026-10-14, con el OK de Felipe)

Pegadas en este orden, cada una en su transacción, sin errores: `170000`, `171000`, `172000`, `173000`, `180000`, `183000`,
`20261014144000` (en producción no hizo nada: `180000` ya le había cambiado la lectura al Plan), `20261014205000` y `20261014210000`.

Cómo se verificó (solo lectura):
- Antes de pegar: las anclas de cada reemplazo contadas en las funciones vivas (las 11 lecturas de las diferencias y las 10 de «sin marca»
  calzaban), y ninguna otra función de producción leía `despacho_diferencias x`.
- Después de cada una: la huella (`md5(prosrc)`) de cada función creada, contra el cuerpo del archivo.
- Al final: las **41 funciones** que toca la cadena tienen la misma huella en producción y en la base hecha de cero con la rama (incluidas
  las que se parchan por ancla: la base de producción era la misma). Las 5 tablas nuevas existen con RLS y sin políticas; las 17 RPC que
  llama la web existen; `retail.modulos`: `recibir` = Inventario · 115. 0 envíos en producción.
- Asesor de seguridad: lo nuevo sale como «RLS sin políticas» (a propósito) y «security definer ejecutable por authenticated» (el patrón del
  ERP); nada más.

La web de `main` sigue funcionando sobre esta base (`recibir_despacho` conserva su firma y su respuesta, con dos datos más). Lo que falta:
fusionar #1056 y, con el volcado nuevo, `pnpm datos:generar:produccion` (`docs/datos/generado/COMO-REFRESCAR.md`).

### Una prenda que la recepción usa no se elimina (2026-10-14, al fusionar)

Al traer `main`, la prueba de deriva de «Eliminar con historia» (ADR-0252) marcó `despacho_pendientes`: cita a `productos` y nadie había
dicho si se borra con la ficha o frena el borrado. Lo recibido ya frenaba por su movimiento con lote (renglón 18), pero un pendiente no
deja movimiento: con «18 Aurora sin tallas» anotadas al cerrar, Catálogo ▸ Productos habría dicho «se puede eliminar» y la llave lo habría
frenado con un «otra parte del sistema todavía lo usa» sin decir qué. Lo mismo, sin llave, con el borrador de un envío abierto
(`despacho_conteos.separado`): eliminar la prenda lo dejaba apuntando a nada.

DECIDÍ: las dos son historia que no se borra (`borrable = false`): renglones 23 («prendas anotadas al recibir un envío») y 24 («prendas
separadas en un envío que se está contando», solo con el envío abierto) de `fn_producto_historia`, con un reemplazo anclado
(`20261014234000`). La prenda se desactiva, no se elimina.
DESCARTÉ: contar solo los pendientes abiertos, porque uno resuelto o anulado igual cita la prenda con su llave; y `on delete cascade`,
porque borraría lo que la tienda contó.
SE ROMPE SI: nace otra tabla de la recepción que cita a `productos` o `variantes`: la prueba de deriva lo marca otra vez.

Probado sobre una base hecha de cero con todo `main`: `pruebas:eliminar-producto` 40/40, `pruebas:eliminar-producto-con-historia` 66/66 y
`pruebas:pendientes-de-envio` 25/25 (E1 y E2 nuevos).
**En producción el 2026-10-14** (con el OK de Felipe): la huella de `fn_producto_historia` coincide con la de la base hecha de cero.

### Una nueva ya descrita se puede crear al contar (Felipe, 2026-10-26)

«Describir ahora» anotaba qué era una prenda nueva, pero esa fila solo decía «Por crear»: para crearla había que cerrar el envío y esperar a
«Para después ▸ + Crear ahora». Quien tiene la prenda en la mano la crea ahí. Ahora la fila descrita lleva «Crear ahora» (en Contar y en
«Hacer ahora ▸ Separar»), con la misma hoja de la prenda y lo descrito como nombre sugerido.

DECIDÍ: al crearse, la fila deja de ser una «nueva» y pasa a ser una prenda separada sin tallas, con la misma cantidad
(`prendaCreadaDeNueva`, `lib/recepcion-conteo-reglas.ts`): de ahí en adelante es lo que ya existía —«Tallas y colores ahora» y, con ellas,
«Entra al stock»—. Se guarda en el momento de crear: si la hoja de tallas se deja «para después», la fila ya dice lo que es. Sin cambio en la
base: la prenda creada es de la categoría y marca de la línea, y `guardar_conteo_envio` ya acepta una prenda conocida sin tallas.
DESCARTÉ: un estado «creada» dentro de `NuevaSeparada`, porque habría dos maneras de decir qué es una fila (una nueva «creada» o una prenda)
y la base solo conoce la segunda; y pasar a la fila el nombre real de la prenda en la descripción, porque la descripción es lo que escribió
quien contó.
SE ROMPE SI: nace otro camino que cree una prenda desde una nueva sin pasar por `prendaCreadaDeNueva` (la nueva y la prenda quedarían las dos
en lo separado y lo contado se duplicaría).

En «Para después», la fila de un pendiente «detalle» dice «Tallas y colores ahora» (`BOTON_DE_PENDIENTE`), como al contar; «crear» sigue en
«+ Crear ahora» y «separar» en «Hacer ahora». Que un «crear» pase a «detalle» cuando se crea su prenda es de la base (`ligar_prenda_a_pendiente`,
migración `20261026163000`, rama `prenda-para-despues-save-613e8c`): no se repite aquí.

De paso, la fila de lo separado baja sus acciones bajo el nombre según el ancho de la LISTA (`.rc-filas-sep`, contenedor de 700 px), no el de la
ventana: junto a «Los papeles de la compra» la lista queda de ~400 px aun en un monitor ancho y el nombre se aplastaba.

### Las categorías se despliegan: lo que se anotó al comprar, de un toque a «¿Qué … son?» (2026-10-26)

Cada categoría de la lista que trae prendas anotadas en la compra (`prendaElegida` o la descripción de la línea, ADR-0480) tiene una flecha que
muestra la prenda exacta con cuántas eran y un «+» redondo. Al tocarlo la prenda pasa a «¿Qué … son?» como si se hubiera elegido desde el
buscador: la del catálogo, como prenda conocida; la que solo tiene nombre, como nueva ya descrita. No hay estado nuevo: lo que queda en la lista
es lo anotado menos lo ya separado (`anotadasSinSeparar`), así que quitarla de «¿Qué … son?» la devuelve sola.

DECIDÍ: la cantidad que entra es siempre la esperada (Felipe, 2026-10-26: con un tope «no más de lo contado» la segunda prenda entraba con 1). Si con eso se
separa más de lo que ya se había contado, lo contado sube y la pantalla lo avisa («el conteo sube de 8 a 15»): quien cuenta lo puede corregir en el número. Con la categoría en 0 no
avisa: no había número de nadie que pisar y el número grande se ve pasar de 0 a lo separado. Una prenda anotada
solo por su nombre sale primero de las «nuevas sin describir» que ya había (quitar una descrita las devuelve ahí), así sacarla y volver a pasarla no duplica.
La cantidad de una prenda separada también se escribe: se guarda al salir de la caja o con Enter, no con cada tecla, porque una prenda con tallas las suelta si su
número cambia.
AGRUPÉ (Felipe, 2026-10-26: «si ambas prendas son vestidos, lo ideal es que se muestren dentro de la misma categoría»): las líneas del mismo proveedor,
categoría y marca —la llave con la que «Nos debe» suma el reclamo— son UNA categoría en la pantalla: un número, una lista de anotadas, un «¿Qué … son?».
La base no cambió: sigue una fila por línea (`despacho_conteos`), y `lib/recepcion-grupos-reglas.ts` reparte lo que se escribe cambiando lo mínimo (sube
llenando las líneas en el orden de la compra, baja desde la última, nunca por debajo de lo separado ni de lo que ya entró al stock). Mientras nada se
separa ese reparto es de trabajo y no dice de cuál prenda faltó; solo lo separado tiene cantidad exacta por prenda.
DESCARTÉ: guardar el reparto como dato exacto: separar después del cierre (7 de Sofía con una fila de 5) chocaría con el tope por fila, y el cierre mostraría
un «faltan 2 de Lima» que nadie dijo. Por eso el cierre por categoría, el reclamo por categoría (sin separar) o por prenda (todo separado) y «Hacer ahora» a
nivel categoría quedan como el paso siguiente, con migración (zona roja: dinero y stock), cuando la sesión de costos por prenda de Recibir fusione.
SE ROMPE SI: una línea del envío empieza a traer varias prendas (hoy trae una): `prendasAnotadasDe` ya devuelve una lista, pero la cantidad por
prenda tendría que salir de la compra y no de `dijeron`.

### La tabla de «Cerrar» también es por categoría (Felipe, 2026-10-27)

Una fila por categoría en el cierre, no por línea de la compra: «Vestidos» con lo que dijeron, lo contado, lo que se puede vender, lo que queda
para después y una sola pregunta «¿Qué pasó?». Al desplegar la fila salen las prendas ya identificadas (y las nuevas ya descritas), cada una con su
costo y su precio de venta; las que nadie ha identificado se cuentan al final en una frase. `lineaDelGrupo` arma la categoría como UNA línea solo
para dibujarla; lo que se guarda y se manda a `cerrar_conteo_envio` sigue siendo por línea.

DECIDÍ: lo que se contesta en una fila vale para todas las líneas a las que toca. La causa de lo que faltó (o de lo que sobró) se elige una vez y se
escribe en cada línea que faltó (`causasDelGrupo`); el costo y el precio de una prenda se guardan en la línea donde vive esa prenda, así parte del costo
de SU orden (Sofía a S/ 30 y Antonella a S/ 45 en la misma categoría). La guía de foco pide una causa por categoría (`camposDelCierrePorGrupo`).
CAMBIÓ: el reparto del total contado entre las líneas ya no arrastra el de antes. Es el mismo para los mismos datos (lo separado en su línea y, sobre eso,
lo sin separar llenando en el orden de la compra): sin separar nada, la categoría solo puede faltar o solo sobrar, nunca una línea de más y otra de menos.
Antes, quitar una separación dejaba un reparto torcido (7 y 3 sobre 5 y 7) que habría pedido reclamar de más.
DESCARTÉ: dejar el cierre por línea con un aviso: mostraría «faltan 2 de Lima» que nadie dijo.
SE ROMPE SI: se separa de más una prenda (Sofía 7 de 5) y quedan unidades sin separar de otra: la fila pide DOS respuestas («Faltan 7» y «Sobran 2») y el
reclamo sale por 7 cuando el neto de la categoría es 5, porque la base hoy cuenta cada línea sin compensar. Eso se arregla en la base (el reclamo por
categoría neto cuando no todo está separado, y por prenda cuando sí): queda para el paso siguiente, con migración y con el OK de Felipe.

### Al contar, toda prenda se identifica: sin eso no se pasa a «Cerrar» (Felipe, 2026-10-27)

**Decisión.** El número grande de «Contar» es el de la categoría completa, y cada prenda contada tiene que saber qué prenda es: una del catálogo, o una nueva
con al menos su nombre corto (la descripción rápida). La suma de lo identificado tiene que ser igual al número grande, y mientras no lo sea «Pasar a cerrar»
queda apagado. Lo que sigue pudiendo esperar son las tallas y los colores de cada prenda («por detallar», «Para después»). Reemplaza lo del 2026-10-13
(«¿Qué … son?» opcional: lo no separado quedaba como pendiente «Separar» y no frenaba nada).

**Qué cambia en la pantalla.** `sinIdentificarDelGrupo` (`lib/recepcion-grupos-reglas.ts`) cuenta lo contado que no es una prenda con nombre: lo no separado y las
nuevas sin describir (lo que ya entró al stock cuenta como identificado). La categoría solo lleva su ✓ con su número Y sus prendas identificadas; su subtítulo
dice «8 identificadas · 7 por identificar»; «¿Qué vestidos son?» deja de decir «opcional» y su insignia pasa de «sin separar» a «Faltan 7 por identificar» (ámbar) o
«Todas identificadas» (verde); la fila de las nuevas pide «descríbelas con un nombre corto» y marca «Falta describirlas». La guía de foco suma, por categoría, un
campo requerido «Qué … son» (`idCampoIdentificar`, el `data-campo` de «¿Qué … son?»); «Falta: …» de otra categoría la abre primero y después lleva a su caja.
«Pasar a cerrar» queda apagado con `gruposSinIdentificar(grupos)` (lo dice su `title` y el pie de la guía). Las categorías sin contar no frenan nada aquí: ya las
frena «Cerrar» con «Contarla» (que vuelve a «Contar»). «Hacer ahora» no cambia (sigue diciendo «sin separar»: es de un envío ya cerrado).

**El aviso del «+»** ya no dice «Pasaste más de las que contaste…»: ahora dice qué se agregó, con el nombre de la prenda («Se agregaron 5 prendas «Vestido Sofía» al
conteo: ahora son 9.»), solo si lo contado ya era mayor que 0 y sube (`avisoDePrendasAgregadas`).

**Lo que esto simplifica en la base.** Con todo identificado, cada línea de la compra (una prenda) termina con lo identificado de esa prenda, así que lo que falta o
sobra es por prenda: justo el reclamo que pidió Felipe («si se hizo separación, sobre la prenda específica»). El caso «una prenda de más y otra sin separar»,
que dejaba «Faltan 7» y «Sobran 2» con un neto de 5, ya no se puede dar al cerrar; tampoco habrá un «Separar» pendiente nuevo que resolver con «Hacer ahora» a nivel
categoría (las filas viejas sí seguirán). **Sin migración**: es una regla de la pantalla (la base sigue aceptando un cierre con prendas sin separar, y los envíos ya
cerrados no cambian). Queda para la base, con su OK: que «Nos debe» guarde QUÉ prenda faltó (hoy suma por proveedor, categoría y marca), y, si se quiere,
que `cerrar_conteo_envio` rechace un cierre con prendas sin identificar para que la regla no dependa de la pantalla.

### Actualización 2026-10-26: «Abrir el fardo» vuelve a ser «Empezar a recibir»

Con varios fardos por envío, que se reciben por partes (hoy uno, mañana otro), «Abrir el fardo» ya no decía qué hace el botón: empieza la recepción del
envío, no abre «el» fardo. Vuelve «Empezar a recibir» (con «Seguir recibiendo» al día siguiente) y la hoja «Detalle» dice cuántos fardos vienen. La
frase al contar pasa a «Abre un fardo y cuenta…». Detalle y por qué: ADR-0480, «Actualización 2026-10-26 (d)».

### «Crear ahora» deja la prenda creada en «Para después» (2026-10-26)

Felipe probó «Crear ahora» sobre «6 prendas nuevas · jean» (ENV-000253): la hoja creó la prenda en el catálogo y le abrió «Tallas y colores».
Como todavía no quería repartir las 6, tocó «Dejar para después»: la prenda aparecía en Catálogo ▸ Productos, pero «Para después» seguía
diciendo «por crear en el catálogo». La lista mentía, volver a «Crear ahora» chocaba con «ya existe esa prenda», y el aviso de Productos
(«N prendas por crear») contaba como por crear algo que ya existía. La causa no era la pantalla: `preparar_prenda_al_recibir` crea la prenda
sin saber de pendientes, y un pendiente «crear» no tenía manera de decir «ya se creó, faltan sus tallas», aunque el «detalle» (la prenda
conocida, sin tallas) existía justo para eso. Tampoco se releía la lista al cerrar la hoja.

DECIDÍ: el pendiente «crear» **pasa a «detalle»** de la prenda cuando esta se crea (o cuando la persona elige la que «ya existe»), con la
función nueva `ligar_prenda_a_pendiente(envío, pendiente, prenda)` (migración `20261026163000`). Misma línea, misma cantidad, mismo estado y
mismo `anotado_por`; la descripción que se anotó al contar se suelta porque la prenda ya tiene nombre. El disparador `despacho_pendientes_fija`
deja pasar **solo** ese cambio y **solo** con la marca de transacción `retail.ligando_pendiente` que enciende esa función (reemplazo anclado, el
patrón de 20261013173000): a mano, o cambiando otra cosa, o al revés, sigue siendo «Un pendiente no cambia». La prenda tiene que ser de la
categoría y marca de la línea, activa y no rechazada (las mismas pistas que `resolver_pendiente_envio`). En la web, `HacerAhora` la llama justo
después de crear o de «Usar esa prenda» y, al cerrar la hoja de tallas sin meter nada, relee la lista (`onCerrar(huboCambio)` en `EnvioCerrado`).
Como `fn_recepcion_pendientes` separa por tipo, el aviso de Productos y el del Inicio pasan solos de «por crear» a «por detallar».
DESCARTÉ: (a) un parámetro `p_pendiente_id` en `preparar_prenda_al_recibir`: es una función larga, ya parchada dos veces, que Compras usa al
contar; ligar es un paso aparte y, si falla entre uno y otro, queda exactamente lo de antes (sin estado imposible) y el siguiente «Usar esa
prenda» lo repara. (b) Anular el «crear» y abrir un «detalle» nuevo: «anulado» significa «se reabrió el envío» y se perdería quién lo anotó y
cuándo. (c) Una columna «prenda creada» en el «crear»: dos maneras de decir lo mismo, y cada lectura (Inicio, Productos, reabrir) tendría que
mirar las dos.
SE ROMPE SI: una función nueva cambia el tipo de un pendiente sin pasar por `ligar_prenda_a_pendiente` (el disparador la rechaza), o si alguien
agrega una tercera clase de pendiente y no decide a qué clase pasa al crearse su prenda.

Probado: `pruebas:pendientes-de-envio` con los casos V1 (la prenda creada queda como «detalle», se termina con tallas y las cifras de la sede se
mueven de «por crear» a «por detallar»), V2 (ajena, descontinuada, inexistente, pendiente ajeno, envío abierto, sin Recibir; un «detalle» no
cambia) y V3 (a mano no, ni cambiando otra cosa, ni al revés; la marca no queda encendida); y la forma (F1). En el navegador contra la base local con
el caso real de Felipe (ENV-000253): «+ Crear ahora» → «Usar esa prenda» → «Dejar para después» → la lista dice «Jean Cuzco · 6 sin tallas ·
faltan tallas y colores», persiste al recargar y «Hacer ahora» abre directo las tallas de esa prenda. Sin la migración en la base (la web se
publica antes), `ligar_prenda_a_pendiente` responde PGRST202 y todo sigue como antes, sin avisos.
**No está en producción**: pegarla es decisión de Felipe (una sola parte, re-pegable, sin políticas ni `alter table`; ver el encabezado de la migración).
Lo que ya quedó creado antes (un «crear» con su prenda hecha) no se arregla solo: al volver a «Crear ahora» y elegir «Usar esa prenda», se liga.

### El precio de venta también se cambia desde «Para después» (2026-10-26)

Al contar «5 blusas» sin decir cuáles, el paso Cerrar no puede ofrecer el precio de nadie (no se sabe qué prenda es): está bien. Pero una vez
cerrado, la prenda se identifica en «Para después» → «Hacer ahora», y ahí no había dónde cambiar su precio: `cambiar_precio_en_recepcion`
(20261024225000) solo aceptaba el envío ABIERTO. Quien identifica la prenda es quien sabe a cuánto se vende, y tenía que ir a Catálogo ▸
Productos, que no todo el que recibe ve.

DECIDÍ: el precio de venta se ofrece **en la misma hoja donde se identifica la prenda**, con la pieza de siempre (`PrecioDePrenda`: el precio de
hoy, el nuevo y «Todas las sedes / Solo esta sede»), bajo el título «Precio de venta · opcional»: en «Tallas y colores» de «Hacer ahora» (una
prenda conocida o recién creada, y sigue a «Cambiar») y en «Separar» (una por cada prenda que se identifica). Al guardar, si algún precio cambió, sale
la misma confirmación del cierre («Vas a cambiar precios», ahora una pieza compartida: `ConfirmarPrecios`) y recién entonces se guarda. El orden es el
del cierre: **el precio primero, las prendas después**, porque el aviso de «costo fuera de lo normal» compara el costo con el precio y tiene que ver
el nuevo (probado en el navegador: con el precio aplicado después, la base avisaba «se vendería con pérdida» usando el precio de antes). Un precio que
la base rechaza (bajo el costo, fuera de rango) frena el guardado ANTES de meter nada («No se guardó nada») y la hoja conserva lo escrito. La prenda
que se acaba de identificar y todavía no es de este envío («ajena») se cambia justo después de meterla; si ahí falla, las prendas ya entraron y se dice
aparte («No se cambió el precio de X… cámbialo en Catálogo ▸ Productos»).
En la base (migración `20261026180000`), `cambiar_precio_en_recepcion` acepta también el envío CERRADO, pero con una puerta **más estrecha** que «cualquier
prenda que llegó por aquí»: la prenda tiene que seguir «para después» (un pendiente «detalle» todavía pendiente) o haber entrado por este envío hace
menos de una hora. Pasado eso, el precio se cambia en Productos como siempre. Todo lo demás de la función no cambió (módulo Recibir, el responsable,
la sede, el que hizo la orden, tope de S/ 5 000, nunca bajo el costo, «todas» o «solo esta sede», rastro en el historial de la prenda).
DESCARTÉ: (a) dejar el precio de cualquier prenda de cualquier envío cerrado: quien tiene Recibir en una sede podría llamar a la función contra una prenda
recibida hace meses, y hoy solo llega a las de los envíos abiertos; ampliarlo es decisión de permisos de Felipe. (b) Poner el precio dentro de
`resolver_pendiente_envio`: mezclaría dinero de venta con movimiento de inventario en la función más delicada de la recepción. (c) Aplicar el precio
siempre después de meter las prendas: el aviso de costo mentiría. (d) Un botón de solo precio en cada fila de «Para después» (sin tallas): hoy el precio
se guarda junto con lo que se identifica; si Felipe lo quiere suelto, es una pantalla más.
SE ROMPE SI: se agrega un camino que identifique prendas sin pasar por `HacerAhora` y quiera ofrecer precio (usa `usePreciosDeVenta` y
`cambiosDeVentaDe`, no reescribe la lógica), o se alarga la hora de la puerta sin decidirlo.

Probado: `pruebas:pendientes-de-envio` con los casos W1 (una prenda que sigue «para después» cambia de precio, para todas las sedes y solo esta, con el
rastro de quien firma), W2 (lo que entró cambia justo después y, pasada la hora, ya no) y W3 (una prenda que no pasó por el envío, el envío en camino,
sin Recibir y un precio bajo el costo siguen rechazados); sin la migración fallan los tres. Las reglas (`cambiosDeVentaDe`, `resultadoDelPrecio`) con prueba.
En el navegador contra la base local con tus envíos ENV-000253 y ENV-000255: 65 (bajo el costo) se rechazó «No se guardó nada» con la base intacta; 99.90 pasó
por la confirmación, entraron 3 prendas y el precio quedó (historial «63.00 → 99.90» por Felipe); en «Separar», al elegir Pantalón Carla apareció el
precio, se confirmó 99.90 → 109.90 y quedó aplicado con el pendiente «Pantalón Carla · 1 sin tallas». **No está en producción**: pegar la migración es
decisión de Felipe. Sin ella, la web avisa «Todavía no se puede cambiar el precio desde aquí» y deja guardar sin cambiar el precio (nada se pierde).

#### El precio de venta nace para la sede que recibe, y se valida antes de confirmar (2026-10-26, b)

Dos pedidos de Felipe sobre lo de arriba. (1) **«La opción por defecto debe ser la sede en la que se recibe, primera y preseleccionada».** `PrecioDePrenda`
(la pieza que comparten «Para después» y la tarjeta «Costos y precios» del cierre) ahora ofrece «Solo Tienda Lima» primero y elegida, y «Todas las sedes»
después (`ALCANCE_DE_FABRICA = "sede"`). Como el precio vale ahora para esa sede, el «hoy» contra el que se compara lo escrito es **el de esa sede** (el
propio de la tienda si lo tiene, si no el general: `fn_precios_en_sede`, la misma regla que la caja), con «en las demás sedes, S/ X» cuando son distintos;
al cambiar de alcance, un campo que nadie tocó pasa al «hoy» del alcance nuevo. Cambia también el cierre (una sola pieza, un solo comportamiento): quien
quiera el precio general lo elige a propósito. (2) **«Aplicar validaciones; dar información de por qué se rechaza un precio».** Antes un precio mal escrito
se ignoraba en silencio y uno bajo el costo se descubría recién después de la confirmación. Ahora, al guardar: un precio mal escrito (no es número, cero, más de
S/ 5 000) se dice y se lleva el cursor al campo; luego la base responde si cada precio se podría guardar y, si no, **por qué**, junto al campo y a todo el
ancho, y la confirmación ni se abre; recién entonces se pide confirmar. Lo mismo al cerrar el envío (su fila se abre y el cursor va al campo).
En la base, `validar_precio_en_recepcion(envío, prenda, precio, alcance)` (en `20261026180000`, aún sin pegar) **corre la función real
`cambiar_precio_en_recepcion` dentro de una subtransacción que siempre se deshace**: las reglas son las mismas porque es el mismo código (piso del costo sin
decir cuánto cuesta —ADR-0183—, tope, tienda abierta, «ya es el precio de la grilla»…), sin duplicarlas ni que un día digan cosas distintas. Una marca de
transacción que solo esa función enciende y apaga salta únicamente la pregunta «¿es de este envío?», porque la prenda que se acaba de identificar todavía no
lo es y su precio igual se puede preguntar. Si no se pudo preguntar (la función todavía no está en la base, un corte), no frena: la base decide al guardar, como antes.
DESCARTÉ: (a) repetir las reglas en la web o en una segunda función de la base (derivan); (b) validar en cada tecla (muchas llamadas que escriben y deshacen); se
valida al guardar; (c) un aviso de abajo repetido con el motivo (queda viejo al corregir el precio); el motivo vive junto al campo, que es donde se corrige.
Probado: casos W4 (dice el motivo y no deja rastro: ni precio, ni historial, ni marca), W5 (también para una prenda que aún no es del envío, sin abrir la puerta
real) y W6 (la validación dice lo mismo que la función real, caso por caso) en `pruebas:pendientes-de-envio`; las reglas (`hoyDelPrecio`, `problemasDePrecio`,
`leerValidacionDePrecio`) con prueba; y en el navegador: «abc» se frena con su motivo, 1 sol dice «Ese precio queda por debajo de lo que cuesta la prenda. Para
liquidar usa una campaña…» antes de la confirmación, 105 pasa y queda **solo para Tienda Lima** (general 99.90, Trujillo sin cambio, motivo «Recepción ENV-000255»).

**Una terminal (ADR-0531, fusionado 2026-10-26):** el precio de venta solo vale en su tienda, así que ni la tarjeta del cierre ni las hojas de «Para después» le ofrecen «Todas las sedes»: dicen «Solo en <su sede>: las otras sedes no cambian» (`soloSede`, que baja de `recibir/envio/[id]/page.tsx` por `RecibirContando` → `CerrarEnvio` y `EnvioCerrado` → `HacerAhora` → `PreciosDeVenta` → `PrecioDePrenda`). El alcance que viaja siempre es `sede`; la base lo respalda con el disparador `variantes_terminal_no_cambia_precio`.

#### El costo de cada prenda también se cambia en «Hacer ahora» (2026-10-27, sobre ADR-0519)

**El problema primero.** ADR-0519 dejó que quien cierra un envío le ponga costo propio a cada prenda que separó. Pero una prenda que al contar solo fue
«5 blusas» no se puede costear al cerrar (no se cambia el costo de algo que no se sabe qué es): se identifica después, en «Para después» ▸ «Hacer ahora», y ahí
entraba al stock con el costo de su LÍNEA. Si había costado otra cosa, solo se corregía desde Catálogo cuando ya había entrado. Felipe (2026-10-26/27): «se debe
poder cambiar tanto el precio de venta (ya está) como el costo (falta)». Esperó a que ADR-0519 estuviera en `main` para no tener dos formas de costo por prenda.

**Qué se hizo** (`20261026210000_costo_por_prenda_en_hacer_ahora.sql`, aún sin pegar en producción; se pega DESPUÉS de `20261026163000` y `20261026180000`).
En la hoja de la prenda (Tallas y colores, y Separar) el bloque «Costo y precio de venta · opcional» trae el costo con el que la prenda entraría (el suyo propio si
ya lo tiene, el que se le puso por su descripción si era una nueva, o el de su línea) y se confirma con la misma ventana del precio («Vas a cambiar costos y
precios»). El costo viaja dentro de lo separado (`p_separado -> 'costos'`, `{producto: costo}`): `resolver_pendiente_envio` mantiene su firma, y la huella del doble clic ya lo
cubre porque incluye todo `p_separado`. La base lo valida con LA MISMA función del cierre (`fn_envio_costos_prendas`: solo prendas de esa hoja, S/ 0 a 99 999.99 con dos
decimales, vacío = no cambia), con el mismo permiso (un envío sin aviso: el costo de una línea de fuera de la guía solo lo escribe quien ve el dinero de Compras) y con
la misma revisión del costo atípico (`fn_recepcion_entrar`), que ahora dice «el costo que escribiste no se parece al que tiene la prenda hoy» cuando lo raro es lo recién escrito.

**Lo que se queda anotado.** El costo se guarda en `despacho_conteos.costos_prendas` (lo de ahora gana sobre lo que había): si esa prenda se detalla por partes, la
segunda parte entra al mismo costo, y la pantalla lo muestra al volver. Sin eso, la segunda mitad entraría en silencio al costo de la línea. Para poder escribirlo
con el envío cerrado, el candado de lo contado (`fn_despacho_conteos_fija`, reemplazo anclado) deja pasar **solo la columna `costos_prendas`**, y solo mientras
`resolver_pendiente_envio` o `ligar_prenda_a_pendiente` tienen encendida su marca de transacción `retail.costo_de_prenda`; lo contado, la línea y el envío siguen sin poder
cambiar. **Es la única rendija nueva en un candado de lo contado y es de Felipe decidir si la acepta** (la alternativa, no guardar el costo en el conteo, deja el
descuadre silencioso de arriba).

**Sin la migración, no se miente.** Una base sin `20261026210000` ignora `costos` sin error; por eso, al guardar, la pantalla compara lo mandado con el costo de cada prenda que la respuesta trae en el conteo (`costosSinGuardar`) y, si falta, no lo da por hecho: avisa «No se cambió el costo de …» y dice que la prenda entró al costo de su línea.

**«Crear ahora» no pierde el costo.** El costo puesto a una prenda nueva por su descripción (`nueva:<descripción>`) vivía en el pendiente «crear»; al ligar la prenda creada
(`ligar_prenda_a_pendiente`) el pendiente deja de tener descripción, así que esa clave pasa al `producto_id` de la prenda (lo que la prenda ya tuviera propio gana; la clave
vieja se quita solo si no queda otro «crear» de la misma línea con esa descripción).

**Compatibilidad con ADR-0519.** La función lee `v_k.costos_prendas`, el mismo nombre que ADR-0519 escribió: el parche le asigna la mezcla a ese campo en vez de reescribir sus
líneas, y así `20261026164000` sigue siendo re-aplicable tal cual (su prueba, `pruebas:costo-por-prenda`, lo comprueba: 10/10 con las dos migraciones puestas).

DESCARTÉ: (a) un parámetro nuevo en `resolver_pendiente_envio` (otra firma = otra función para permisos y llamadas); (b) no guardar el costo en el conteo (segunda parte al costo
de la línea, sin aviso); (c) reescribir las líneas del parche de ADR-0519 (rompía su idempotencia: su migración y su prueba fallaban al re-aplicarse); (d) un campo de costo para las
nuevas descritas de la hoja «Separar»: no tienen precio de venta ahí tampoco; su costo se escribe al crearlas («Crear ahora» trae el que ya tenían).
Probado: casos K1–K9 de `pruebas:pendientes-de-envio` (el costo entra y se queda; lo de ahora gana; vacío, nulo y de otra prenda no cambian nada; mal escrito se rechaza sin escribir;
atípico pide confirmar y no deja rastro al fallar; doble clic; el costo de una nueva pasa a la prenda al ligar; el candado solo deja la columna del costo y solo con la marca; sin
aviso y sin ver el dinero, no) y las reglas (`costoInicialDePrenda`, `costosDeHacerAhora`, `avisoDeConfirmarHacerAhora`) con prueba; y en el navegador con ENV-000254: Blusa
Valentina de S/ 19.80 a S/ 18.50 con «Antes S/ 19.80», «abc» se frena junto al campo con el cursor, la confirmación lista el costo, el aviso de costo atípico se confirma y entran 12 y 8 a
S/ 18.50 con el costo de la línea intacto (S/ 19.80) y la prenda anotada en el conteo.

**Tallas con precios distintos (2026-10-27, c).** El precio de venta vive en cada variante (talla y color), pero cambiarlo desde Recibir pone UN precio: «todas las sedes» iguala todas las tallas y colores activos
(`cambiar_precio_en_recepcion`), y «solo esta sede» pone un precio de tienda que alcanza a todas las tallas activas (`poner_precio_sede`). Antes, la confirmación decía «sin precio → S/ 75.00» para una prenda
que valía de S/ 69.90 a S/ 79.90. Ahora el cambio trae el rango (`CambioDePrecio.rango`): «S/ 69.90 a S/ 79.90 → S/ 75.00 · solo Tienda Lima», con la línea «Hoy las tallas valen distinto: en Tienda Lima
todas pasan a venderse a este precio» (`textoIgualaTallas`). La base no cambia. Además, bajo el campo del precio sale «Antes S/ …» cuando el precio escrito es válido y distinto del de hoy (uno solo), y en la
hoja de una sola prenda no se repite su nombre ni el precio de hoy cuando el campo ya lo trae.

