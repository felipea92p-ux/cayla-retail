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
| Abrir, contar, separar, cerrar y reabrir; estados `abierto` y `cerrado`; `despacho_recibidos`, `despacho_diferencias` (escritura), `abrir_despacho`, `recibir_despacho`, `preparar_prenda_al_recibir`, la pantalla `/recibir/envio/[id]` | **Recibir (ADR-0393)**, desde este contrato. La fase 4 los escribió «porque Recepción no tenía rama» (ADR-0362) | Órdenes de compra los lee |
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

- **`guardar_conteo`** (contar y separar una línea; también agrega lo que no estaba en la guía): con el envío `abierto`, el módulo Recibir y
  la sede. Si otra persona guardó esa línea después de lo que viste, guarda lo tuyo y te devuelve lo que pisaste («Lucía había puesto 38»).
- **`cerrar_conteo`** (firma quien cierra, combo «Responsable»): costo por línea (decisión 6 y la 18 de ADR-0362), causas de lo que no
  cuadró (contadas contra enviadas), nota. Lo separado con tallas y colores entra al stock como hoy (lote por proveedor, movimientos al
  almacén y a la cuarentena, costo promediado, el papel hasta su cupo); el resto se vuelve pendiente. Idempotente por token y huella.
- **`recibir_despacho` sigue existiendo** con la misma firma y la misma respuesta: escribe los conteos con todo detallado y llama al mismo
  cierre. Un solo camino que escribe stock (el primer commit es el refactor que saca ese camino de `recibir_despacho`; el segundo, los conteos).
- **`resolver_pendiente`** («Hacer ahora»): separar, poner tallas y colores o crear lo nuevo (con `preparar_prenda_al_recibir`). Entra al
  stock con el costo fijado al cerrar y el lote de ese envío y proveedor (lo crea si al cerrar no hubo ninguno), y carga el papel hasta el
  cupo que quede. Pedir más de lo pendiente se rechaza: «Contaste 40 y ya separaste 40: si hay más, reabre el conteo». Cambiar el número
  tiene una sola puerta, reabrir.
- **`reabrir_despacho`**: `cerrado → abierto` mientras ninguna diferencia vigente tenga resolución en «Nos debe» (decisión 5: «hasta que
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
2. **Base · contar guardado:** refactor de `recibir_despacho` (un solo camino de cierre) y `despacho_conteos` + `guardar_conteo` + lecturas;
   pruebas en Postgres (permisos, sede, quien compró, gana el último con aviso, envío anulado o cerrado).
3. **Base · cerrar con pendientes:** `cerrar_conteo`, `despacho_pendientes`, `resolver_pendiente`, la lectura del número de pendientes;
   la invariante 1 como prueba y como invariante de `/chaos`.
4. **Base · reabrir y sin aviso:** `despacho_cierres`, `reabrir_despacho`, el cierre en `despacho_diferencias` con los lectores de «Nos
   debe»; el envío sin orden (si Felipe elige la opción recomendada).
5. **Web · la cara A:** la puerta de `/recibir` (reemplaza «Llegó mercadería»), ¿Qué llegó? → Contar → Cerrar en `/recibir/envio/[id]`,
   «Para después» con «Hacer ahora», el aviso en Inicio, en la cabecera de Recibir y en Catálogo ▸ Productos ▸ Por crear.
6. **Calidad y cierre:** `/guia`, `/focus`, `/sugerir`, `/unificar`, `tema:auditar`, `/chaos` (guarda stock), `/formidable`, 375 px;
   diccionario, ARQUITECTURA, bitácora y backlog. Cada SQL a producción, con el OK de Felipe.
