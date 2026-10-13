# ADR-0362 · Órdenes de compra, comprobante y despacho a las sedes

- **Fecha:** 2026-10-07 · **Estado:** ACEPTADO por fases — decisiones 1–38 (32–38 el 2026-10-10). **Fase 1 aprobada y en
  construcción desde el 2026-10-10**; las fases 2 a 7 siguen en diseño. **Las 5 migraciones de la fase 1 están EN PRODUCCIÓN desde el
  2026-10-10** (con el OK de Felipe; versiones `20261010224526`–`…224946`; las 16 funciones con la misma huella que el banco donde
  pasaron las pruebas); la web, cuando se fusione el PR.
- **Rama:** diseño en `claude/purchase-order-flow-6207e9` (2026-10-07 → 10); desde el 2026-10-10 sigue en
  `claude/purchase-order-redesign-9b0c82`, al día con `main`. El rango reservado (`20261008100000`–`…109999`) quedó atrás de lo que
  entró a `main` (hasta `20261010150000`): las versiones se eligen el día que se escriba cada migración.
- **Contrato con:** la sesión «Recibir Mercadería» (rama `claude/recepcion-mercaderia-inventario-16e55e`): la recepción en la sede es
  de Inventario y la construye esa sesión; esta construye la orden de compra, el comprobante y el despacho. **Ojo con el número
  (2026-10-12):** esa sesión había reservado el ADR-0361, y en este ADR y en `docs/compras/ordenes-de-compra-2026-10/` «ADR-0361» quiere
  decir ella. Pero su rama ya no existe (ni local ni en GitHub) y en `main` el 0361 lo tomó «Modelo nuevo desde la orden de producción»
  (#937). La recepción todavía no tiene ADR ni quien la construya: se decide al llegar a la fase 3.
- **Reemplaza:** de ADR-0035, «CAYLA no emite pedidos formales» (ya los emite). Vuelve a existir la orden de compra, con tablas nuevas:
  las viejas `ordenes_compra` se borraron el 2026-09-12 y producción tiene 0 compras, 0 envíos y 2 lotes (consultado el 2026-10-07).

## Lo que decidió Felipe (2026-10-07)

| # | Tema | Decisión |
|---|---|---|
| 1 | Para qué sirve la orden de compra | Control de CAYLA; el PDF se puede descargar, si se quiere, para mandarlo al proveedor |
| 2 | Correlativo | **Uno solo para toda la empresa** (no por sede). Anular no libera el número |
| 3 | Proveedor | Obligatorio, uno por orden de compra |
| 4 | Línea | **Categoría y marca obligatorias**, descripción opcional, cantidad, precio unitario, descuento %, monto descontado, subtotal; pie con total |
| 5 | Comprobante | La orden de compra pasa a ser **factura, boleta o nota de venta**. Al precargarlo se corrigen cantidad y precio para que calce con el papel. *(El costo final lo corrige quien recibe: ver 18.)* |
| 6 | IGV y costo | La orden de compra guarda el precio como lo cotiza el proveedor, sin hablar de IGV. En factura, una casilla «precios incluyen IGV» separa base e IGV y la prenda cuesta la base (crédito fiscal); en boleta y nota de venta no hay IGV y la prenda cuesta el precio completo |
| 7 | Contado | Se registra con su pago en el mismo paso (como hoy) |
| 8 | Entregas parciales | Sí: una orden de compra puede terminar en varios comprobantes; queda «recibida en parte» hasta completarse o cerrarse |
| 9 | Sin comprobante | ~~Primero el comprobante, después se despacha~~ → **como el brief: el comprobante no bloquea.** Sin él se despacha y se recibe igual, y la compra queda «sin comprobante» para el contador hasta que se registre |
| 10 | Llegada | La mercadería llega a «Lima» (un lugar que hoy no es una sede en el sistema), **se abre solo para separar** por sede, sin contar talla por talla, y se despacha. **Nada de lo que llega a Lima es stock**: el conteo es el de la sede |
| 11 | Fardo | Un fardo puede traer **varias órdenes de compra y varios proveedores** |
| 12 | Guía | **Una guía, una sede.** Número de guía opcional |
| 13 | Conteo en la sede | **Todo junto por guía.** La sede puede agregar o quitar prendas antes de cerrar, y la recepción muestra cómo se cerró |
| 14 | Faltante | **La causa la elige la sede.** Cada faltante es UNA deuda del proveedor («2 polos · S/ 50») en estado «por reponer», que se cierra con un toque: **«Llegó la reposición»** (se cuenta en la próxima recepción de ese proveedor) o **«Pasar a saldo a favor»** (se descuenta del próximo pago). Sin plazos automáticos. Se ve en la ficha del proveedor y al crear su próxima orden de compra |
| 15 | Sobrante | El motivo (regalo, se cobra aparte, se descuenta o cobra en la próxima compra) lo marca **quien recibe en la sede** |
| 16 | Quién paga | **La encargada de compras**, desde su fondo por rendir, o administración desde la cuenta de la empresa (brief). **Reemplaza ADR-0184** («cada tienda paga su parte»; en producción, sin uso: 0 compras). Toca Compras, Por pagar y Finanzas |
| 17 | Separación de funciones | **Quien crea la orden de compra no puede recibirla, sin excepción** (ni el líder) |
| 18 | Costo | **Lo corrige quien recibe, en la recepción** (brief), y **todo el que recibe ve los precios**. Reemplaza, para la recepción, la regla de ADR-0126 (la sede no ve plata) |
| 19 | Quién compra | Una **encargada de tienda** o la **encargada general**. Lo que compra la de tienda llega **directo a su sede** (sin pasar por Lima); lo que compra la general se compra y **después se envía** desde Lima a las sedes |
| 20 | Gastos adicionales | Se registran como dice el brief (flete, fardos, carretilla, viáticos), pero **aparte: nunca se mezclan con el costo de la prenda**. El costo de traer una compra se ve junto a ella, no dentro de `variantes.costo`. Responde también el flete de Lima a cada sede |
| 21 | Precio sugerido | Lo pone **quien compra, al generar el comprobante**, y precarga el precio de venta de la prenda que se crea al recibir |
| 22 | Envío desde Lima | Sale a **una sede, con una guía** (confirma la 12). Lima no es una sede en el sistema: nada es stock ahí; registra el envío la encargada general |
| 23 | Prenda dañada | Se marca **con solución pendiente** (no suma al stock: cuarentena) o **sin solución**, con tres salidas: **liquidar, regalar o desechar**. Reusa `prendas_danadas` (`en_cuarentena` → `se_arreglo` / `liquidada` / `donada` / `se_boto`, migración `20261005140000`), que hoy solo se alimenta desde devoluciones de clientes |
| 24 | Faltante del proveedor | Se salda con **la prenda en el próximo envío** o con **dinero**, y el dinero se acepta de las dos formas: **el proveedor deposita** (reembolso) o **se descuenta del próximo pago** (saldo a favor) (ajusta la 14; Felipe 2026-10-08) |
| 25 | Insumos | **Sí pasan por orden de compra**, pero **la compra de tienda (ropa) y la del Taller (insumos) no se mezclan**: tienen proveedores distintos y órdenes distintas. La orden de tienda lleva categoría + marca y se reparte a las sedes; la del Taller lleva el insumo con su unidad y va al Taller (Felipe 2026-10-08) |
| 26 | Fondo | Quien compra **paga desde su propio fondo**, y del mismo fondo salen los gastos adicionales (flete, carretilla, comida…). **Al final tiene que verse cuánto le queda**, como control contra el fraude (Felipe 2026-10-08) |
| 27 | Dañada | Además de liquidar, regalar o desechar, **se puede devolver al proveedor** (`devuelta_proveedor`, ya existe) (Felipe 2026-10-08) |
| 28 | Correlativos | Las órdenes de **tienda** y las del **Taller** llevan **correlativos distintos** (ajusta la 2) (Felipe 2026-10-08) |
| 29 | Fondo del Taller | Quien compra para el Taller **también recibe un monto asignado y lo rinde al final** (Felipe 2026-10-08) |
| 30 | Módulo de fondos | Para que alguien tenga fondo **tiene que existir un módulo para pasar plata de la empresa al fondo de la persona**; diseño en curso (Felipe 2026-10-08) |
| 31 | Fases | Felipe **aprobó las 7 fases**, pidiendo que todo sea intuitivo; antes de arrancar pidió el mapa de módulos de punta a punta (2026-10-08) |
| 32 | Fondo que no alcanza | La compradora **paga de su bolsillo** y queda «CAYLA te debe S/ X», que se le devuelve al rendir con comprobante o foto. **Sin tope**: no tendrá mucho dinero para prestar y lo más probable es que pida que le abonen más fondo (Felipe 2026-10-10) |
| 33 | Rendición de un líder | La aprueba **un Admin distinto de él** (escalera de ADR-0178). «Nadie aprueba lo suyo» no tiene excepción. Hoy hay 14 líderes activos y 6 Admin (consultado el 2026-10-10) (Felipe 2026-10-10) |
| 34 | El módulo es la llave | **Quien tiene el módulo ve todo lo que hay dentro, sin restricciones**: no hay permisos «solo tus órdenes». **Toda persona del sistema puede tener un fondo**; si se le da plata o no lo decide quien administra los fondos (Felipe 2026-10-10, al preguntarle por los precios del Taller). Lo que falta precisar, en «Por decidir» |
| 35 | Quién entrega fondos | **Quien tenga el módulo para asignar dinero** (`fondos`, delegable, nace solo para el líder como todo módulo nuevo). Se mantienen los dos candados del diseño: nadie se entrega plata a sí mismo y quien entrega no aprueba esa rendición (Felipe 2026-10-10; los candados, por defecto) |
| 36 | Cabecera | Órdenes de compra usa **`EncabezadoPagina`** (sede y fecha arriba, título de 46 px). El resto de Compras sigue sin cabecera decidida (Felipe 2026-10-10) |
| 37 | Quién ve las órdenes | Quien tiene el módulo ve las órdenes de **todas las sedes** y las «por repartir»; la lista **arranca filtrada en la sede donde está** y puede pasar a «Todas». Es la 34 aplicada: no sigue la regla de Compras por tienda (ADR-0184) (Felipe 2026-10-10) |
| 38 | Menú | «Órdenes de compra» entra como **7.ª entrada de Compras, temporal**, con la excepción de tope que ya prevé `menu.test.ts`; se quita cuando Recibir mercadería pase a Inventario (Felipe 2026-10-10) |
| 39 | Responsable | Crear, editar y anular una orden: **con la cuenta de una persona, firma ella sola, sin combo ni marca de entrada** (la compradora está en Gamarra, lejos del kiosco); **desde una terminal, pide el combo «Responsable»**. Es el mismo trato que «apartar una prenda» y los avisos del club: las claves `orden_compra_*` entran a `acciones_sin_responsable` (Felipe 2026-10-10) |
| 40 | El módulo es la llave en Compras | **Quien tiene el módulo hace todo lo que hay dentro, sea líder o no, en todo Compras** (Plan de campaña, Proveedores, Órdenes, Facturas, Recibir, Por pagar, Notas de crédito): se quitan los «solo el líder». ADR-0387 (Felipe 2026-10-12) |
| 41 | Qué tiendas se ven | Quien tiene el módulo ve **todas las tiendas** y paga a nombre de la empresa; deshace en Compras ADR-0184 y ADR-0187 (13 personas no líder afectadas el 2026-10-12). ADR-0387 (Felipe 2026-10-12) |
| 42 | Comprobante y contado | Registrar el comprobante de una orden y pagarlo al contado (desde una cuenta de la empresa, hasta que existan los fondos de la fase 6) piden **solo el módulo Órdenes de compra** (Felipe 2026-10-12) |
| 43 | Más de lo pedido | Si el papel del proveedor trae más unidades o una línea que no estaba en la orden, **se acepta y se avisa** (Felipe 2026-10-12) |
| 44 | Proveedores ve sus montos | Quien tiene el módulo Proveedores ve, dentro de Proveedores, lo que la empresa le compra y le debe a cada uno y su saldo a favor («Sí, que los vea»); revierte ADR-0161 P3. No abre los tableros de Facturas ni Por pagar. ADR-0387 (Felipe 2026-10-12) |
| 45 | De quién es la deuda | **La deuda de una factura es 100 % de la tienda que hizo el pedido** (la gestora, la que guarda el papel): «Trujillo y Lima, si no hicieron el pedido, no tienen nada que pagar, sino quien realizó el pedido»; si otra tienda recibió parte, se compensan entre ellas, fuera del sistema. El pago de la empresa baja la deuda de esa factura. Finanzas (Por pagar por tienda y Balance por tienda) deja de sumar «partes», y su Por pagar se paga igual que Compras. ADR-0387 (Felipe 2026-10-12) |
| 46 | Quién paga una orden | **La deuda de una orden es de la sede de QUIEN HIZO LA ORDEN** (no de quien registra el papel ni de «Llega a»), y la paga ella desde su fondo por rendir (fase 6); mientras el fondo no exista, se paga desde Por pagar. «Si la encargada compra, ella paga»: la general de Lima compra para repartir y la deuda es de Lima aunque las prendas terminen en Trujillo (Felipe 2026-10-12). En la base: la gestora del comprobante es la sede asignada de quien creó la orden (si no, «Llega a»; si no, la de quien registra) |
| 47 | Órdenes de insumos | **Entrada nueva «Órdenes de insumos»** (módulo propio, nace solo para el líder): quien la tiene ve y hace todo en esas órdenes, sin ver el resto de la plata del Taller (Felipe 2026-10-12; resuelve el «Por decidir» de la fase 7) |
| 48 | Envío de una orden «directo» | **Con guía, pero opcional:** quien compra puede registrar el envío; si no, la tienda recibe directo contra la orden (Felipe 2026-10-12) |
| 49 | La prenda al recibir | **La crea quien recibe, en la tienda**, con las tallas y colores que llegaron y el precio sugerido ya puesto (Felipe 2026-10-12; confirma la 21) |
| 50 | Cuatro tipos de comprobante | **«Debe existir 4 tipos de comprobantes: boleta, nota de venta, factura y sin comprobante»** (Felipe 2026-10-12). Una compra de una orden sin ningún papel se registra igual que las otras: sin serie ni número (la base le pone uno interno, `SC-000001`, único para la empresa), sin IGV, al crédito o al contado; no entra al Registro de Compras de Impuestos. Migración `20261012235000`. Por defecto *(provisional)*: si después llega el papel, se anula la compra sin comprobante y se registra el papel (mientras no tenga pagos); la factura suelta de Facturas de proveedor no cambia |

**Fase 2 (aprobada por Felipe el 2026-10-12, 11 actividades, rama `claude/purchase-order-phase2-9b0c82`):** 1 · las acciones de Compras
dejan de ser «solo del líder» (ADR-0387) · 2 · qué tiendas se ven y a nombre de quién se paga · 3 · las líneas por «categoría + marca»
se ven bien en todo el ERP · 4 · registrar el comprobante de una orden · 5 · factura con IGV · 6 · al contado, con su pago · 7 · precio
de venta sugerido · 8 · entregas parciales · 9 · órdenes «Por repartir» · 10 · revisión de calidad · 11 · cierre. Por defecto: la
factura suelta de hoy sigue igual; la casilla del IGV arranca marcada; corregir un comprobante es anularlo y registrarlo de nuevo; firma
como la decisión 39; el precio sugerido es opcional; la tienda que gestiona el comprobante es la de «Llega a» (o la de quien lo registra
si es «Por repartir»). *(La 46 reemplazó esta última regla y la 50 sumó «Sin comprobante» como cuarto tipo: ver la fase 3.)*

**Fase 3 (2026-10-12, rama `claude/purchase-order-phase3-9b0c82`; Felipe pidió avanzar de corrido y respondió las decisiones 46–49
antes de irse; la 50 la mandó mientras se construía).** Contrato: `docs/compras/ordenes-de-compra-2026-10/contrato-envio-a-sede.md`.
Lo construido:
- **«Enviar a una sede»** desde la orden abierta (`crear_envio`, página `/compras/ordenes/envio/[id]`): una guía, una sede (12 y 22); el
  número de guía es opcional (48); nace «en camino» con un número `ENV-000001` único para toda la empresa; cada línea congela su
  categoría, marca, descripción y el precio neto por unidad (quien recibe lo ve y lo corrige: fase 4, decisión 18). **Un envío no mueve
  stock:** el stock entra cuando la sede recibe (fase 4).
- **Una orden «directo»** solo va a su «Llega a»; **una «Por repartir»** se reparte en varias guías a varias sedes. La base ya acepta una
  guía con líneas de varias órdenes y proveedores; la pantalla arranca desde una orden.
- **Tope (candado de esquema, diferido):** lo enviado de una línea nunca pasa del mayor entre lo pedido y lo facturado; lo de más que
  el papel facturó sí sale, y avisa (43). Dos personas mandando lo mismo a la vez: sale una y la otra lee «quedan 0 por enviar».
- **Anular un envío:** solo mientras va en camino, con motivo (hasta 300) y la versión que se vio; libera lo enviado. Una orden con algún
  envío ya no se edita; con uno vigente, no se anula.
- **La deuda (46):** `fn_orden_compra_gestora` — la sede asignada de quien creó la orden (si no, «Llega a»; si no, la de quien registra);
  con eso, una «Por repartir» ya registra su comprobante, y la hoja dice «la deuda queda en …».
- **«Sin comprobante» (50):** cuarto tipo al registrar el comprobante de una orden (número interno `SC-000001`, sin IGV). En el
  celular, el tipo se elige con un desplegable: los cuatro no caben en el segmento a 375 px.

Por defecto *(provisional, revisar con Felipe)*: al enviar se vuelve a la lista con la orden marcada y el aviso «ENV-… en camino a …»
con «Ver la orden» (como crear y editar); la píldora «Por enviar» cuenta las órdenes generadas con algo que todavía no salió; la guía
impresa (guía de remisión) queda para después; sin guía, la sede recibe directo contra la orden (fase 4).

**Fase 4 (2026-10-12, rama `claude/purchase-order-phase4-9b0c82`; la sesión de Recepción no tenía rama y la tomó esta línea).**
Contrato: `docs/compras/ordenes-de-compra-2026-10/contrato-recepcion-de-envio.md` (con «Cambios al construir»). Lo construido:
- **Recibir un envío en la sede** (`/recibir/envio/[id]`, módulo Recibir): «Empezar a recibir» (`abrir_despacho`: el envío pasa a
  `abierto` y ya no se anula); por línea, el costo que se ve y se corrige (18), la prenda —nueva, creada ahí con las tallas y colores que
  llegaron y el precio sugerido (21, 49), o una que ya existe, con la talla o el color que faltaba— y la matriz talla × color; lo dañado
  va a la cuarentena con su fila en `prendas_danadas` (23); lo que faltó lleva su causa y lo que vino de más su motivo (14, 15); lo que
  no estaba en la guía se agrega (13). Al cerrar (`recibir_despacho`), un lote por proveedor, el costo promediado, lo recibido cargado
  al papel hasta su cupo y la recepción a la vista («cómo se cerró»).
- **Una orden «directo» sin guía** se recibe igual (48): `recibir_orden_sin_envio` crea su envío y lo deja abierto.
- **Quien hizo la orden no la recibe, sin excepción (17):** la base lo frena (`recibir_quien_compro`) y la pantalla lo dice antes.
- **El alta al recibir (49):** `crear_producto_con_variantes` deja crear la prenda a quien tiene Recibir, solo dentro de
  `preparar_prenda_al_recibir`; si no edita el catálogo, la prenda nace «pendiente» y un líder la revisa.

Por defecto *(provisional, revisar con Felipe)*: las causas del faltante son «No vino» (deuda del proveedor, fase 5), «Se perdió en el
camino» y «Llegó a otra sede»; todo lo contado entra al costo de la línea, también un regalo; la pareja marca–proveedor se registra
sola al crear la prenda; un costo de 0 pide confirmar; sin cola sin conexión en esta pantalla.

## Fuente: el brief de Felipe

«CAYLA Retail · Brief de desarrollo: Compras y LIM Taller» (7 oct 2026), https://claude.ai/artifact/2GE1cKibGDhCZFsQaY5XRV. Felipe
lo pegó en la sesión; las decisiones 9, 14, 16, 17 y 18 se tomaron contrastándolo.


## Por decidir (Felipe)

- ~~El mapa de módulos de punta a punta y el módulo de fondos (en diseño).~~ Respondido con las decisiones 31–35.
- **Dos lugares donde la 34 choca con una restricción de hoy** (consultado en producción el 2026-10-10):
  - ~~Compras muestra a cada persona **solo su tienda** (ADR-0184; hoy 12 personas que no son líder ven «Facturas de proveedor»).
    ¿«Órdenes de compra» muestra todas las sedes a quien tiene el módulo, o sigue esa regla?~~ Respondido con la 37: todas.
  - El dinero del Taller (`verDinero`) es **solo del líder** y no se delega. Si la orden de insumos vive dentro de Producción, la 34
    lo abre a quien tenga Producción (hoy 1 persona que no es líder); si es un módulo propio, solo abre sus órdenes. Hace falta para la fase 7.

## Lo que decido por defecto (Felipe puede cambiarlo)

Correlativo `OC-000001`; solo soles; una orden de compra se edita mientras no tenga comprobante ni envío; anular pide motivo y solo
sin comprobante ni envío vivo; un envío se anula mientras la sede no lo abrió; se conserva Por pagar para el crédito; un fondo por
persona con una rendición por viaje; el módulo «Órdenes de compra» nace solo para el líder (regla de módulos) y ~~cada encargada de
tienda ve las órdenes de su sede, la general todas~~ (reemplazado por la 37). Comparar contra el Plan de campaña queda para una fase
posterior.

**Fase 1, aprobada por Felipe el 2026-10-10 junto con sus 8 actividades:** cada orden tiene un campo **«Llega a»** con las tiendas y
«Por repartir (llega a Lima)», que arranca en la sede donde se trabaja: así no hace falta marcar a nadie como «encargada general» (la 19
se cumple por el destino de la orden, no por quién la crea). La fecha de emisión es la de hoy y no se edita. La marca de cada línea
ofrece primero las de ese proveedor pero acepta cualquiera, y la orden no toca el catálogo. El número se ve bloqueado al crear; si dos
personas guardan a la vez, la segunda toma el siguiente y se le avisa. Un doble clic en «Guardar» no crea dos órdenes. El PDF se guarda
desde el diálogo de impresión, como la guía de traslado, y el archivo se llama como la orden (`OC-000001.pdf`).

**Al construir «Nueva orden de compra» (actividad 2, 2026-10-10), por defecto:** la entrega estimada es *sugerida* (la guía la pide,
nunca bloquea: en Gamarra muchas veces no se sabe); si el proveedor trae una sola marca, se pone sola en las líneas sin marca; los
números se leen con la costumbre del ERP (punto decimal, coma de miles: «1,950.50»), con una sola tolerancia —«12,50» sin punto es
doce cincuenta, porque leerlo como 1250 multiplicaría el precio por cien sin que nadie lo note—; y el descuento se escribe en % o en
S/ con un selector. El otro valor, ya calculado, va junto al subtotal de la línea («S/ 399.60» con «−S/ 44.40» debajo; en la
tarjeta angosta, en la misma línea). Antes iba debajo de la caja del descuento, pero se veía mal y descuadraba la fila (Felipe,
2026-10-10).

**Al construir «ver una orden» y los filtros de la lista (actividad 3, 2026-10-10), por defecto:** tocar una fila abre la orden en una
ventana sobre la lista (como el detalle de una factura); recargar o compartir el enlace muestra la misma orden en página completa, en
`/compras/ordenes/ver/<id>` —con «ver» delante porque Next trata una ruta interceptada como una reescritura que va antes que las páginas,
y una `ordenes/<id>` se tragaba «Nueva orden de compra»—. La lista filtra por **a dónde llega** (arranca en la sede donde se trabaja,
decisión 37; «Todas las sedes» y «Por repartir» a un toque, cada píldora con su número) y por **estado** (Generadas / Anuladas; tocar el
puesto lo quita); busca por el número («OC-000012», «oc12» o «12») o por el proveedor, sin tildes ni mayúsculas. Arriba, tres cifras que
no cambian con los filtros, una por cada quien mira: lo pedido en total (generadas, las anuladas no suman), lo que llega a la sede donde
se trabaja y lo que está por repartir. Las columnas las decide el ancho de la tabla y no el de la ventana: con el menú abierto en una
pantalla chica el proveedor se quedaba en cero.

**Al construir «Editar» (actividad 4, 2026-10-10), por defecto:**
- **Qué se edita.** Mientras la orden está «generada» se edita todo: proveedor, a dónde llega, entrega, nota y líneas. El número
  y la fecha de emisión no se editan.
- **Lo que no se tocó no se vuelve a juzgar.** Un proveedor, una sede, una categoría o una marca que se desactivaron después no
  impiden corregir la nota, y tampoco una entrega estimada que ya pasó. Elegir de nuevo algo inactivo sí se rechaza.
- **Si otra persona guardó antes,** el aviso «Otra persona cambió esta orden mientras la editabas» ofrece «Recargar» (ADR-0193).
  Un doble clic no choca consigo mismo, y guardar sin cambios no escribe nada.
- **Lo de antes no se pierde.** Lo que la orden decía antes de cada edición queda archivado, con precios
  (`orden_compra_versiones`, solo se agrega).
- **Actividad.** La Actividad del módulo anota crear y editar sin montos, como el costo en Productos: la lee quien tiene
  Actividad aunque no vea Órdenes de compra. Cada línea se ve en la sede donde se hizo y en la sede a la que llega la orden.
- **Al guardar,** se vuelve a la lista con el aviso «OC-000129 actualizada».

**Al construir «Anular» (actividad 5, 2026-10-10), por defecto:**
- **El botón.** «Anular orden» va en rojo al pie de la ventana de la orden y en la cabecera de su página, como «Anular comprobante»
  en una factura.
- **La hoja.** Pide el motivo (obligatorio, hasta 300 letras) y dice qué pasa antes de confirmar.
- **Lo que queda.** La orden queda a la vista como anulada, con quién, cuándo y por qué. Deja de contar en lo pedido y su número no
  vuelve a usarse.
- **Choques y repeticiones.** Si otra persona la cambió mientras se miraba, el aviso de choque ofrece «Recargar». Un doble clic no da
  error.
- **Lo que falta.** Que la orden no tenga comprobante ni envío vivos todavía no se exige: esas tablas llegan en las fases 2 y 3, y el
  candado se suma con ellas.

**Al construir el PDF (actividad 6, 2026-10-10), por defecto:**
- **El botón.** «Imprimir o guardar PDF» está siempre, también en una anulada.
- **El papel.** Es A4, en tinta sobre blanco como la guía de traslado. Lleva la marca y los datos de la empresa
  (`configuracion_empresa`), el número, la emisión, el proveedor con su RUC, a dónde llega, la entrega, las líneas con su
  descuento, el total, la nota y quién la generó.
- **Una anulada** lo dice arriba, en grande y con su motivo: un papel viejo que circule no se confunde.
- **El archivo** se llama como la orden, por ejemplo `OC-000129.pdf`.

**La revisión Formidable (actividad 7, 2026-10-10; informe `docs/formidable/compras-ordenes.md`).** Dos pruebas ciegas y un escéptico.
Felipe aprobó arreglar primero un error y después los 3 cambios de pantalla, con la lista que muestra la orden marcada:
- **El reintento ya no miente (error, no presentación).** Si la señal se cortaba DESPUÉS de guardar, la pantalla decía «No se guardó
  nada»; y si la persona corregía algo y reintentaba, `crear_orden_compra` devolvía la orden guardada «tal cual» y el aviso decía
  «guardada» con el total nuevo, que la base no tenía. Ahora la base compara lo pedido con lo guardado (las huellas de editar): si es
  lo mismo, devuelve la orden; si cambió, avisa «ya se guardó como OC-… con lo de antes» (`orden_compra_ya_guardada`) y la pantalla
  ofrece «Corregirla». El corte de señal dice «no sabemos si llegó: vuelve a pulsar sin cambiar nada». Y el choque al editar dice qué
  pasó: «se anuló mientras la editabas», «tu cambio anterior sí se guardó» (fue la misma persona) u «otra persona cambió esta orden».
  Va dentro de `20261010235000` (todavía no estaba en producción), con su prueba (CR2b, E2b).
- **«Llega a» se revisa y se entiende.** Viene puesto con la sede donde se trabaja, pero ya no lleva ✓ hasta que la persona lo elige
  (ADR-0284 act. h): la luz de la guía pasa por él. La lista abierta separa «Directo a la tienda» de «Llega a Lima para repartir». La
  tarjeta y las píldoras dicen el nombre completo («Tienda LIM»), que no choca con lo que se reparte desde Lima.
- **Al guardar, la orden se ve.** Crear y editar vuelven a la lista en el destino de ESA orden, con la fila marcada «Recién guardada»
  (barrita y tinte verdes), y el aviso dice a dónde llega.
- **La orden abierta se lee sola.** Sin el subtítulo que repetía proveedor y destino; «Llega a: Tienda TRU» en vez de «Destino: Llega
  a…» (también en el papel); y la nota con su rótulo «Nota:».

## Para el contador (no bloquea programar, dice el brief)

Gastos de llegada fuera del costo (decisión 20: la NIC 2 los pone dentro; que el contador lo confirme); el fondo como anticipo (101 o
1413); compras con nota de venta o sin comprobante; guía de remisión Lima → tiendas; Yape personal como bancarización; IGV de una
deuda por reponer y nota de crédito tipo 07 si se devuelve dinero; tope de la planilla de movilidad; pagos en efectivo ≥ S/ 2 000
(Ley 28194); pérdida en el transporte sin denuncia (art. 22 de la Ley del IGV).

## Consecuencias ya vistas

- Una deuda «por reponer» con factura deja a CAYLA con el IGV de prendas que no llegaron mientras siga abierta. Se controla con un
  aviso que no se puede ocultar. La reposición entra al costo neto de la línea original, ligada a ella. Si pasa a saldo a favor y la
  compra tenía factura, el proveedor tiene que emitir su nota de crédito (tipo 07) para corregir el crédito fiscal.
- Que la sede vea y corrija el costo (decisión 18) cambia el contrato con Recepción: su RPC sí recibe el costo del navegador, y el
  candado de costo atípico debe avisar sin frenar la venta.
- La nota de venta no tiene nota de crédito ante SUNAT: un sobrante «se descuenta en la próxima compra» se salda como línea de la
  próxima orden de compra, no con un documento de SUNAT.
- Hoy un regalo no baja el costo promedio (`recibir_envio`, `20260930124000:251-253`) e infla el inventario: el regalo se promedia con costo 0.
- `compra_items.producto_id` es NOT NULL y lo leen 13 funciones, la vista `compra_items_resumen` y 4 piezas de la web: la línea por
  categoría + marca obliga a revisarlas una por una.
- `fn_gestora_con_parte` exige que la tienda gestora conserve parte de la mercadería: choca con «todo a una sede» si esa sede no es la gestora.

## Contrato provisional con la sesión de Recepción (la que reservó el ADR-0361; ver «Contrato con»)

- Tablas (nacen aquí): `ordenes_compra`, `orden_compra_items` (`categoria_id` y `marca_id` NOT NULL), `despachos` (la guía: una sede,
  `numero_guia` opcional, `despachado_por` = `fn_actor_persona_id(true)`), `despacho_items` (`orden_compra_item_id` NOT NULL,
  `compra_item_id` nulo mientras no haya comprobante —decisión 9—, cantidad, descripción, `categoria_id` y `marca_id` congelados al despachar).
- Estados del despacho: nace `en_camino` (aquí); `abierto` y `cerrado` (Recepción); `anulado` solo desde `en_camino` (aquí).
- La sede lee por funciones `security definer`: `fn_despachos_por_abrir(p_ubicacion_id)`, `fn_despacho_detalle(p_despacho_id)`.
  **Con precio por línea** (decisión 18: quien recibe ve y corrige el costo).
- La recepción la cierra alguien distinto de quien creó cualquiera de las órdenes de compra del despacho (decisión 17), sin excepción.
- Un despacho con dos proveedores da dos lotes: `lotes.despacho_id` con único en `(despacho_id, proveedor_id)`.
- La recepción llena `movimientos.compra_item_id` hasta la cantidad de cada línea; lo que sobra entra sin ella. Si no, se apagan
  `compras_no_sobrerecibida`, el bloqueo de `anular_compra` y `estado_recepcion`.
- Candados aquí: lo despachado de una línea nunca supera lo asignado a esa sede ni lo facturado (trigger diferido con `for update`).
- Las causas de faltante y los motivos de sobrante los escribe la sede (decisiones 14 y 15): la tabla y sus valores se acuerdan entre las dos sesiones.

## Mapa de módulos de punta a punta (propuesta, 2026-10-08; espera el OK de Felipe)

Dos entradas nuevas en el menú y una pantalla nueva dentro de un módulo existente; no se retira ninguno. Envíos, «Nos debe», «Tu
fondo», gastos del viaje y dañadas son acciones dentro de pantallas, no módulos (ADR-0306).

| Menú | Clave | Estado | Quién | Qué se hace |
|---|---|---|---|---|
| Compras ▸ **Órdenes de compra** | `ordenes_compra` | nueva (nace solo para el líder) | encargada de tienda (su sede), encargada general (todas) | crear `OC-`, pasar a comprobante, pagar desde «Tu fondo», pestaña «Por enviar» (envío desde Lima, una guía por sede), «+ Gasto del viaje», «Rendir» |
| Compras ▸ Facturas de compra | `facturas_compra` | existe | encargadas, líder, contador | ver comprobantes; filtro «Sin comprobante» |
| Compras ▸ Proveedores | `proveedores` | existe, gana «Nos debe» | encargadas, líder | faltantes por reponer, saldo a favor, devueltas; se salda con reposición, depósito o descuento |
| Compras ▸ Por pagar | `por_pagar` | existe, cambia | administración, líder | solo crédito; se retira «la parte de mi tienda» (decisión 16) |
| Inventario ▸ Recibir mercadería | `recibir` | existe (sesión de Recepción) | la sede | contar por guía, corregir costo, faltantes, sobrantes, dañadas |
| Inventario ▸ Existencias (Dañadas) | `existencias` | existe | la sede | arreglar, liquidar, regalar, desechar, devolver al proveedor |
| Producción ▸ Abastecimiento ▸ **Órdenes de insumos** | `produccion` | pantalla nueva | quien compra para el Taller | `OI-`, insumo con unidad, proveedores del Taller, «Tu fondo» |
| Finanzas ▸ **Fondos por rendir** | `fondos` | nueva (nace solo para el líder) | líder o a quien él se lo dé | entregar plata, aprobar rendiciones, tablero de control |

Fondo: cada persona tiene su cuenta «por rendir» con su nombre; entrega y devolución son movimientos propios (no gasto); una sola
rendición abierta por persona; el saldo se calcula; nadie se entrega plata a sí mismo ni aprueba su propia rendición; quien gasta
del fondo es solo su dueña (se compara la cuenta que entró y el combo Responsable). La compradora no necesita Finanzas: ve su fondo
como tarjeta donde compra y en Inicio. Órdenes de compra entra a la regla de celular (375 px) porque se usa en Gamarra.
