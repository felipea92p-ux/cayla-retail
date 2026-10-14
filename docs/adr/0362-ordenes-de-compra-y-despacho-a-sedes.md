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
| 51 | Terminales con la plata de Compras | **Se deja así** (Felipe 2026-10-13): las 6 terminales de tienda tienen Facturas de proveedor (las de Almacén, también Por pagar y Notas de crédito) y, por la decisión 41, leen las de las tres tiendas. Medido en producción ese día: 0 facturas, 0 pagos, 0 órdenes |
| 52 | Dónde viven las órdenes de insumos | **Producción ▸ Abastecimiento, primera** (pedir → factura → recibir → pagar), con ruta propia `/ordenes-insumos` para que quien solo tenga ese módulo no necesite el de Producción (Felipe 2026-10-13, confirma lo provisional de la fase 7) |
| 53 | Precio al recibir en el Taller | **Quien recibe ve y corrige el precio de ESA orden**, como en las tiendas (18), sin ver el resto de la plata del Taller (Felipe 2026-10-13) |
| 54 | Faltante al rendir el fondo | **Queda como deuda de la persona**, a la vista hasta que se salde; se le descuenta del sueldo solo con su autorización escrita (Felipe 2026-10-13) |
| 55 | Gastos del viaje sin comprobante | **Solo taxi y cargador**, con planilla de movilidad y un tope diario que fija el contador; hotel y comida, solo con comprobante (Felipe 2026-10-13) |
| 56 | Efectivo de S/ 2 000 o más | **Se deja pagar, marcado «no deducible»** (no se frena): Felipe eligió esto sobre frenarlo y sugerir transferir (2026-10-13). El sistema avisa que ese gasto no cuenta para impuestos y que su IGV se pierde |
| 57 | Contabilidad del fondo, provisional | **Fondo en la 1413** (entregas a rendir) y **el Yape personal de la compradora no cuenta como pago bancarizado de CAYLA**, hasta que el contador diga otra cosa (Felipe 2026-10-13) |
| 58 | Saldo a favor con factura | **Interno ya, su nota de crédito después:** se registra al toque con un documento interno que baja lo que se le debe al proveedor en el próximo pago, marcado «falta su nota de crédito» con el aviso del IGV (61) hasta que llegue; al llegar, se adjunta (Felipe 2026-10-13). Con boleta, nota de venta o sin comprobante: documento interno sin IGV |
| 59 | «Depositó» | **Lo registra quien tiene Proveedores**, desde la ficha del proveedor (Felipe 2026-10-13; el módulo es la llave, 40) |
| 60 | Devolver una dañada al proveedor | **Queda como deuda «por reponer»** con las mismas salidas que un faltante; **la devuelve quien recibe: todos los que tienen el módulo, no solo el líder** (Felipe 2026-10-13) |
| 61 | Aviso del IGV | **Aviso en Inicio que no se puede ocultar**, para quien ve la plata de Compras, mientras un proveedor deba prendas de una factura (Felipe 2026-10-13) |
| 62 | Lista de compras del Taller | **Después**: primero el comprobante y la recepción de la orden de insumos (Felipe 2026-10-13) |
| 63 | Maquila y flete del Taller | **Siguen como gastos** en Finanzas (los del viaje, en el fondo de la fase 6); la orden de insumos solo lleva insumos (Felipe 2026-10-13) |
| 64 | «Fijar un mínimo» del Plan | **También para quien tiene el módulo Plan de campaña**: el módulo es la llave (40) (Felipe 2026-10-13) |
| 65 | Dónde va «Fondos por rendir» | **Directo en Compras**, como octava entrada (después de Por pagar), subiendo el tope del menú de Compras. Se le preguntó con el subgrupo «Pagos» (Por pagar + Fondos + Notas de crédito) como recomendación y con «Finanzas ▸ Dinero»; dijo que no va en Finanzas y eligió no regrupar (Felipe 2026-10-13) |
| 66 | Recibir mercadería | **Se mudará a Existencias** (Felipe 2026-10-13, al hablar del menú). Ese día Compras baja de 8 a 7 entradas y la excepción del tope queda solo por Fondos por rendir. No es parte de la fase 6 |
| 67 | Gastos del viaje: dónde y a qué | **Desde Órdenes de compra**, por quien tiene ese módulo; la plata sale de «Mi fondo» o de una cuenta de siempre. Un gasto va a **una o varias órdenes**: con varias se reparte según el total de cada una («hay que manejar ambos casos») (Felipe 2026-10-13) |
| 68 | Planilla de movilidad | **Sin tope hasta que el contador lo fije**; cuando exista, lo que pase el tope se deja y se marca «no deducible» (como la 56) (Felipe 2026-10-13) |
| 69 | Rendición | Un faltante **con explicación lo decide quien aprueba** («Lo asume CAYLA» o «Queda como deuda de la persona»; sin explicación, deuda: 54). Al aprobar, **el fondo puede quedar en cero o conservar plata** para las próximas compras (devolver lo que sobra es opcional). **Foto del papel opcional**, y la rendición avisa cuáles no la tienen (Felipe 2026-10-13, noche) |
| 70 | Efectivo de S/ 2 000 o más | Se mira **el total del comprobante** (la regla de la bancarización): todo lo pagado en efectivo o desde un fondo (el Yape personal incluido, 57) queda marcado «no deducible», con aviso (Felipe 2026-10-13, noche) |
| 71 | Saldar la deuda de un faltante | **Solo cuando la persona devuelve la plata.** Nada de descontarla del sueldo por ahora ni de conectarla con la planilla de Dynamic: la deuda queda a la vista hasta que la devuelva (Felipe 2026-10-14; ajusta la 54) |
| 72 | IGV perdido por pago en efectivo | Se resta **en el mes del pago**, nunca en el mes de la factura: un mes ya declarado no cambia solo (Felipe 2026-10-14) |
| 73 | Fase 6, la lista | La actividad de contabilidad se **parte en dos**: 7 · saldar la deuda (y la 1413 y la 1419 por dos caminos en el Balance) y 8 · el IGV (facturas de los gastos del viaje a crédito fiscal y lo no deducible fuera); el cierre pasa a ser la 9 (Felipe 2026-10-14) |

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

**Fase 5a (2026-10-12, rama `claude/purchase-order-phase5-9b0c82`).** Contrato: `docs/compras/ordenes-de-compra-2026-10/contrato-nos-debe.md`.
Lo construido (no mueve plata): **la deuda** es el faltante «No vino» de una recepción (14); se ve en la ficha del proveedor («Prendas
por reponer») y al crear o editar su próxima orden (14); se salda con **la prenda** —en la próxima recepción, «Es la reposición de lo que
faltó», la más antigua primero, o a mano con «Llegó la reposición» y una nota (24)—, nunca más de lo debido. **Fase 5b, sin construir:**
«Pasar a saldo a favor» y «Depositó» (24) y devolver una dañada al proveedor (27) mueven plata y tocan la contabilidad (nota de crédito
tipo 07, IGV de lo que no llegó): esperan a Felipe y al contador; las preguntas están en el contrato.

**Fase 7, parte 1 (2026-10-13, rama `claude/purchase-order-phase7-9b0c82`; construida de noche, provisional).** Contrato:
`docs/compras/ordenes-de-compra-2026-10/contrato-ordenes-de-insumos.md` (con «Cambios al construir»). Lo construido: **la orden de
insumos del Taller** (`OI-000001`, su propio correlativo: 28) con su **módulo propio `ordenes_insumos`** (47; nace solo para el líder y es
delegable: quien lo tiene ve y hace todo en estas órdenes, con sus precios, sin ver el resto de la plata del Taller). Proveedor de
`proveedores_produccion`, destino un taller y líneas de insumo con la cantidad en su unidad (hasta 3 decimales) y el precio con hasta 4
decimales, como los comprobantes y los lotes del Taller. Crear, ver, editar, anular e imprimir o guardar el PDF, con las mismas reglas que
la orden de tienda: versión contra la edición simultánea, firma del responsable (39), número que no se libera. **Sin construir (espera a
Felipe):** el comprobante de la orden y la recepción en el Taller (las preguntas 2 a 4 del contrato).

Por defecto *(provisional, revisar con Felipe)*: la entrada vive en Producción ▸ Abastecimiento (la opción recomendada de la pregunta 1),
pero con ruta propia, `/ordenes-insumos`, porque todo lo que cuelga de `/produccion` exige el módulo de Producción; el destino es
obligatorio y es un taller; la unidad del insumo se copia en la línea y, si después cambia, al editar esa línea pide la cantidad de nuevo;
el insumo no se restringe al proveedor de la orden; una orden lleva hasta 100 líneas.

**Fase 6 · actividad 1 (2026-10-13, rama `claude/purchase-order-phase6-9b0c82`; lista de 8 actividades aprobada por Felipe el
2026-10-13): la base del fondo y Compras ▸ Fondos por rendir.** Migraciones `20261013181000` (esquema) y `20261013182000` (funciones),
prueba `pnpm pruebas:fondos`. Contrato: `contrato-fondo-por-rendir.md`; mapa de lo que se rompe: `mapa-dinero-fase6.md`.

```
DECIDÍ: el fondo de una persona es un TIPO NUEVO de cuenta de dinero, `fondo`, con su dueña en `cuentas_dinero.persona_id` y la
        cuenta contable 1413 (decisión 57). Una sola cuenta de fondo viva por persona, que nace con la primera entrega. Entregar y
        devolver son dos movimientos propios (`entrega_fondo`, `devolucion_fondo`); el saldo sale del mismo libro que «Cuentas y
        dinero». Nadie mueve plata de su propio fondo desde Fondos por rendir (ni con su cuenta ni eligiéndose en el combo).
DESCARTÉ: darle dueña a la cuenta `por_rendir` («Efectivo entregado al líder»), como decía el mapa de módulos: esa cuenta es la caja
        de la empresa que el líder recibe de los cierres (101, no un anticipo a rendir), y seis piezas suponen que hay UNA sola (el
        índice único, el traslado al líder en `fn_dinero_libro` y en `fn_caja_traslados_sellar`, `registrar_ingreso_caja` y tres
        pruebas). Con un tipo propio, nada de eso cambia.
SE ROMPE SI: la actividad 2 (pagar desde «Mi fondo») no le enseña a `fn_cuenta_sirve` y `fn_cuentas_para_elegir` el tipo `fondo`
        solo para su dueña: hoy el fondo no sirve para pagar nada, a propósito. (La actividad 2 lo resolvió por otro camino, sin
        tocar esas dos: ver abajo.)
```

La 1413 entra en la actividad 1 y no en la 7 (contabilidad) porque la cuenta contable de una cuenta de dinero no cambia nunca
(`fn_cuentas_dinero_inmutable`): cambiarla después obligaría a tocar fondos ya usados. La actividad 7 sigue con la 609/631 de los gastos
del viaje y el faltante como cuenta por cobrar. Por defecto *(provisional, revisar con Felipe)*: la plata de un fondo sale de un banco, de
una caja fuerte o de lo que tiene el líder (esto último, solo el líder, como en todo el ERP); lo que se devuelve lo registra quien recibe
la plata, nunca la dueña, y no más de lo que tiene; anular una entrega de la que ya salió plata no se puede; en Actividad todavía no se
anota (el propio tablero dice quién hizo cada movimiento).

**Fase 6 · actividad 2 (2026-10-13): pagar desde «Mi fondo»** en el comprobante de una orden al contado y en Por pagar (pagar un
comprobante y «Pagar juntos»). Migración `20261013212000`; prueba `pnpm pruebas:fondos` (6 casos nuevos, 16 en total).

```
DECIDÍ: el fondo no entra por las reglas generales de cuentas: `fn_cuenta_sirve` y `fn_cuentas_para_elegir` siguen sin conocerlo.
        Los pagos de Compras lo suman en la pantalla (`fn_mi_fondo`, el fondo de QUIEN MIRA, y `conMiFondo`: primero en «Sale de»,
        «Mi fondo · tienes S/ X») y, en la base, el sello de los pagos (`fn_compra_pagos_sellar`) lo deriva a `fn_fondo_para_pagar`:
        solo su dueña, con SU cuenta (nunca desde una terminal, donde el combo elige un nombre que no prueba quién tiene la plata) y
        firmando ella; en efectivo, Yape, Plin, transferencia, depósito u «otro»; sin mirar el saldo (decisión 32: si no alcanza, paga
        de su bolsillo y el negativo es «CAYLA te debe»). El Diario saca ese pago de la 1413, no de la cuenta de su medio.
DESCARTÉ: que `fn_cuenta_sirve` acepte el tipo `fondo` (lo que la actividad 1 había previsto): esa tabla la usan las 13 pantallas de
        «¿De dónde sale la plata?» y los sellos de gastos, activos y Producción, cuyos asientos van por el medio (101 en efectivo): un
        gasto pagado desde el fondo habría restado de la caja en el Diario y el Balance de la 101 no cuadraría. Los gastos del viaje
        (actividad 4) llegan al fondo con su propia regla.
SE ROMPE SI: alguien escribe `compra_pagos` sin pasar por su disparador (hoy las 4 funciones que pagan insertan y el disparador
        sella), o el Diario deja de leer `cuenta_dinero_id` en los pagos: el fondo bajaría en «Cuentas y dinero» y no en el Balance.
```

Por defecto *(provisional, revisar con Felipe)*: «Mi fondo» se **propone** solo para el efectivo y solo si tiene plata; con el fondo vacío
o en negativo, el efectivo sigue proponiendo la caja de siempre y el fondo queda a un toque; nunca se propone «por descarte» (sin banco
cargado, una transferencia queda por elegir, como antes). Quien no tiene fondo no ve «Mi fondo»: un fondo nace con una entrega de otra
persona. En el tablero, un fondo en negativo no resta de «Tienen en la mano»: tiene su cifra, «CAYLA les debe». Con la plata en negativo
ahora posible, anular una entrega dice cuánto salió de ella sin pasar de lo entregado.

**Fase 6 · actividad 3 (2026-10-13, noche): gastos del viaje** (decisiones 20, 26, 55, 57, 67 y 68). Migraciones `20261013221000` (esquema)
y `20261013222000` (funciones); prueba `pnpm pruebas:gastos-viaje` (11 casos).

```
DECIDÍ: un gasto del viaje ES un gasto (`retail.gastos`), con dos categorías nuevas: «Traer la mercadería» (609, la línea de fletes
        del Estado de resultados) y «Viaje de compra» (631). Lo propio del viaje va en una ficha aparte (`gastos_viaje`: concepto y
        papel) y en su reparto (`gastos_viaje_ordenes`: lo que le toca a cada orden, según su total, a céntimos; lo que sobra va a la de
        mayor total). Lo registra `registrar_gasto_viaje` (módulo Órdenes de compra) con la MISMA pieza de pago que Finanzas ▸ Gastos
        (`fn_comprobante_y_pago`): del cajón crea su egreso; de un fondo lo valida el sello de gastos con `fn_fondo_para_pagar`, y el
        Diario lo saca de la 1413. La sede del gasto es la de quien compra (46). Cada orden dice «Traerla costó S/ X».
DESCARTÉ: columnas nuevas en `retail.gastos` (tabla en uso de todo Finanzas; lo del viaje es una ficha aparte) y crear la factura de un
        gasto del viaje como comprobante de compra con su IGV (le pediría a quien está en Gamarra dar de alta al proveedor): se guardan
        el papel, la serie y el RUC para el contador; el IGV de una factura queda para la actividad de contabilidad.
SE ROMPE SI: otra pantalla crea gastos de las categorías del viaje sin su ficha (salen en Gastos y en el Estado de resultados, pero no en
        «Traerla costó»), o el Diario deja de leer la cuenta del gasto: el fondo bajaría en «Cuentas y dinero» y no en el Balance.
```

Por defecto *(provisional, revisar con Felipe)*: la acción `gasto_viaje_registrar` queda **soltada del combo «Responsable»** (con la cuenta
de una persona firma ella; desde una terminal, el combo), aunque es de plata: se anota en Gamarra, lejos de toda tienda, donde nadie puede
marcar su entrada (el mismo motivo de la decisión 39). Las dos pruebas que vigilan «ninguna acción de dinero soltada» la nombran como
excepción. Las órdenes son opcionales (el cargador se paga a veces antes de saber a qué orden va); la hoja las propone si se abre desde una
orden. Un gasto del viaje se anula en Finanzas ▸ Gastos, como cualquier gasto (una anulada no cuenta en «Traerla costó» y le devuelve la
plata al fondo). Con tarjeta de crédito no se anota aquí (va por Finanzas ▸ Gastos). Las fotos del papel llegan con la rendición (69).

**Fase 6 · actividad 4 (2026-10-13, noche): «Tu fondo» en Órdenes de compra y en el Inicio** (decisiones 26 y 32). Migración
`20261013231000`; prueba `pnpm pruebas:gastos-viaje` (un caso nuevo, 12 en total), que junta todo lo que mueve un fondo.

```
DECIDÍ: «Tu fondo» es una cifra, así que es LA pieza de cifra (`TarjetaCifra`, ADR-0358), la misma en los dos lugares
        (`TarjetaTuFondo`): «S/ 200.00 te queda», debajo «Gastaste S/ 300.00 de S/ 500.00» y al pie desde cuándo y para qué. Si
        pagó de su bolsillo, el número es lo que CAYLA le debe, en ámbar, y el contexto empieza con «CAYLA te debe:»; nunca un número
        negativo. En Órdenes de compra es una cifra más de la fila de arriba (con cuatro, en fila desde 56 rem de ancho disponible); en
        el Inicio, después de «Tu día» y antes de «Te toca» (es una cifra suya), y en el de almacén arriba de su columna derecha. Los
        números salen de `fn_mi_fondo_resumen`, en UNA pasada por el mismo libro que el saldo (`fn_dinero_libro`), así que el
        desglose cuadra siempre con él. Una lectura que falla no pinta nada (la mayoría no tiene fondo), pero queda en el registro.
DESCARTÉ: sumar cada cosa desde su tabla (`compra_pagos`, `gastos`, `movimientos_dinero`): serían dos verdades. Y ampliar
        `fn_mi_fondo`: cambiar lo que devuelve obliga a borrarla, y el combo de los pagos solo necesita el saldo.
SE ROMPE SI: otra cosa mueve un fondo sin pasar por el libro (el saldo de la tarjeta dejaría de ser el de «Cuentas y dinero»); el
        resumen lo delataría en «otros», que hoy siempre es 0.
```

Por defecto *(provisional, revisar con Felipe)*: la tarjeta sale mientras el fondo tenga o haya tenido plata en este ciclo (todavía no hay
rendición: el ciclo es desde la primera entrega; la actividad 5 lo hará empezar en la última rendición aprobada, cambiando la función por
dentro y no la pantalla). En el Inicio lleva a Órdenes de compra, o a Por pagar si la persona solo ve esa; si no ve ninguna, informa. En
Órdenes de compra informa (la actividad 5 le suma «Rendir»). **El Observatorio del Admin no la lleva**: su diseño es una decisión
(ADR-0322); un Admin con fondo lo ve en Órdenes de compra. Lo que pagó a proveedores y lo que se fue en gastos del viaje viene separado de
la base, pero la tarjeta los muestra juntos («Gastaste»): el detalle, pago por pago, es de la hoja de la rendición. **No se construyó
«Lo recibí»** (la compradora confirma la entrega en su tarjeta, del mapa de módulos): no está en la lista de 8 actividades aprobada y
pediría guardar algo nuevo; queda anotado en el backlog para que Felipe decida.

**Fase 6 · actividad 5 (2026-10-13, noche): la rendición** (decisiones 32–35, 54 y 69). Migraciones `20261013233000` (fotos de los gastos
del viaje), `20261013234000` (su bucket y sus políticas, SOLAS: ADR-0195) y `20261013235000` (la rendición); prueba `pnpm pruebas:rendicion-fondo`
(11 casos).

```
DECIDÍ: rendir CONGELA lo que dijo el sistema (tenías, te entregaron, devolviste, pagaste, gastos, deberías tener), lo que la persona
        contó en la mano, el faltante y su explicación, y qué filas del libro del fondo entran (`rendicion_fondo_items`, por su clave): el
        ciclo se corta por QUÉ filas se rindieron, no por la hora, así que lo que se anota mientras tanto va al ciclo siguiente. Aprueba otra
        persona con Fondos por rendir; nunca la dueña (33), ni quien le entregó plata en esa rendición (35); la de un líder, un Admin (33).
        Un faltante con explicación lo decide quien aprueba; sin explicación, deuda (54, 69). Al aprobar, el faltante SALE del fondo con un
        movimiento propio sin destino (`faltante_fondo_asumido` → 6599, el mismo «Diferencias de caja» de un faltante de caja;
        `faltante_fondo_deuda` → 1419, cuenta nueva por cobrar al personal) y el fondo queda con lo que la persona de verdad tiene. Lo
        rendido queda congelado: un gasto o una entrega en una rendición vigente no se anula (toma el candado del fondo para no cruzarse).
        Las fotos de los gastos del viaje viven en su bucket propio, con una fila por foto; la rendición cuenta los papeles sin foto (69).
DESCARTÉ: cortar el ciclo por fecha u hora (un pago guardado a la vez quedaría contado dos veces o ninguna); una cuenta de dinero para la
        deuda («Cuentas y dinero» la sumaría como plata de CAYLA); y aceptar un sobrante (plata que el sistema no sabe de dónde salió).
SE ROMPE SI: una migración nueva cambia (en vez de SUMAR) el texto que dejó otra en un reemplazo anclado: volver a pegar la anterior ya no
        encuentra su texto. Le pasó a esta antes de publicarla y se rehízo para que solo sume (la prueba carga todas dos veces y lo vigila).
```

Por defecto *(provisional, revisar con Felipe)*: más plata en la mano de la que dice el fondo **no se rinde** (la hoja pide revisar: falta
anotar algo); las cuentas 1419 y 6599 hasta que el contador diga; la deuda queda **a la vista** en «Tu fondo» y en Fondos por rendir, y
**cobrarla** (que la persona la devuelva, o se le descuente con su autorización escrita) es de la actividad 7; la dueña puede **retirar** su
rendición para corregirla antes de que la revisen; una foto se puede sumar aunque el gasto ya se haya rendido (completa la evidencia); el
tablero de Fondos cuenta un faltante dentro de «Gastó». `fn_mi_fondo_resumen` conserva sus columnas y ahora cuenta solo el ciclo abierto;
lo de la rendición viene en `fn_mi_fondo_rendicion`. Una sola pieza dice quién es la cuenta: `fn_persona_de_la_cuenta`.

**Fase 6 · actividad 6 (2026-10-13, noche): lo «no deducible»** (decisiones 55, 56, 57, 68 y 70). Migración `20261014002000`; prueba
`pnpm pruebas:no-deducible` (5 casos) y `lib/no-deducible-reglas.test.ts`.

```
DECIDÍ: una sola regla en la base, CALCULADA y no guardada. Bancarización (`fn_pago_no_bancarizado`): en un comprobante de S/ 2 000 o
        más —su TOTAL, aunque se pague en partes—, cada pago en efectivo o que sale de un fondo (con cualquier medio: el Yape personal de
        quien compra no es bancarización de CAYLA, 57) es no deducible entero; la transferencia, el depósito, la tarjeta y el Yape de CAYLA,
        no. Cubre los comprobantes de proveedor de cualquier naturaleza (mercadería, gasto, activo), los del Taller y los gastos del viaje
        (cuyo monto es su papel entero). Planilla de movilidad: con tope vigente en la fecha del gasto, se suman las planillas de la misma
        persona en el mismo día, en el orden en que se anotaron; lo que pasa el tope es no deducible (la que lo cruza, en parte). El tope es
        un parámetro tributario más (`parametros_tributarios`, 'tope_planilla_movilidad'), con vigencias desde cualquier fecha como el IGV
        y en Configuración ▸ Impuestos; SIN FILA NO HAY TOPE (68). `fn_no_deducibles(claves del libro)` lo responde a la web;
        `fn_no_deducibles_de` es la pieza interna que usará la actividad 7. La web AVISA al pagar con el espejo de la regla
        (`avisoBancarizacion`) en todas las formas de pagar a un proveedor —registrar un comprobante o el de una orden, Por pagar, Pagar
        juntos, el Taller, el gasto del viaje y los gastos de Finanzas y de Caja con comprobante— y MARCA lo ya pagado donde se ve: la
        rendición (quien rinde y quien revisa), «Traerla costó» y los pagos de un comprobante (su detalle y la vista rápida de Por pagar).
DESCARTÉ: guardar la marca en el pago (se desincroniza cuando el contador fija el tope o se anula una planilla del mismo día); el umbral
        como parámetro (cambió una vez desde 2004; son dos líneas si vuelve a cambiar); frenar el pago (56); marcar los gastos SIN
        comprobante de Finanzas (no tienen papel: la bancarización mira comprobantes); y sacar el IGV del crédito fiscal aquí, que es de la
        actividad 7 para que Impuestos, el Diario y la conciliación cuenten igual.
SE ROMPE SI: alguien pinta «no deducible» con su propia cuenta en vez de preguntar a la base, o el umbral cambia en un lado y no en el
        otro (`fn_pago_no_bancarizado` y `UMBRAL_BANCARIZACION`).
```

Por defecto *(provisional, revisar con Felipe)*: en «Pagar juntos» el aviso dice **«hasta S/ X»** cuando no todos los comprobantes son de
S/ 2 000 o más (cuánto efectivo va a cada uno lo reparte la base en cascada); la persona del tope es **quien registró** la planilla; un
comprobante con nota de crédito se mira por su **total original**; el aviso al pagar no dice nada del tope de la planilla (depende de lo que
ya se anotó ese día: la marca sale al guardar).

**Fase 6 · actividad 7 (2026-10-14): saldar la deuda de un faltante** (decisiones 54, 71 y 73). Migración `20261014145000`; prueba
`pnpm pruebas:deuda-fondo` (4 casos) y `lib/deuda-fondo-reglas.test.ts`.

```
DECIDÍ: la deuda se salda SOLO cuando la persona devuelve la plata (71): un movimiento nuevo, `pago_deuda_fondo`, que ENTRA a un banco,
        a una caja fuerte o al líder y no sale de ninguna cuenta; es de una rendición (`rendicion_id`) y el Diario lo asienta contra la
        1419. Lo registra quien recibe la plata, con Fondos por rendir (nunca la persona que debe, como lo que se devuelve de un fondo); no
        acepta más de lo que debe y, con varias deudas, paga primero la más vieja (por la hora en que se aprobó cada rendición). Un pago
        mal registrado se anula con su motivo, también por otra persona, y la deuda vuelve; «Cuentas y dinero» no lo anula. Lo que se debe
        sale de UNA lectura (`fn_deudas_fondo_de`: el faltante de la rendición menos lo pagado), que usan Fondos por rendir, «Tu fondo»,
        el pago y el Balance. «¿Cuadra?» suma dos filas: la 1413 contra lo que tiene cada fondo y la 1419 contra lo que falta pagar de
        cada rendición con deuda.
DESCARTÉ: descontar la deuda del sueldo (71: por ahora no, ni conectarla con la planilla de Dynamic); un pago suelto, sin rendición (cada
        rendición tiene que decir qué le falta); que el pago entre al fondo de la misma persona (nadie lo recibiría: la decisión 26 pide
        el control); y cambiar las columnas de `fn_rendiciones_fondo` (volver a pegar la 235000 fallaría): lo que se debe va en una
        lectura nueva.
SE ROMPE SI: alguien registra la devolución de una deuda como «Lo que devuelve» de su fondo: la plata entraría a CAYLA y la deuda
        seguiría. La pantalla ofrece «Registrar su pago» solo donde hay deuda.
```

Por defecto *(provisional, revisar con Felipe)*: la deuda se paga a un banco, una caja fuerte o al líder (no a un cajón: no pasa por la
caja); la 1419 sigue siendo provisional hasta el contador (57); «Lo asume CAYLA» después de aprobada no existe (una deuda no se perdona
desde el sistema).

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
