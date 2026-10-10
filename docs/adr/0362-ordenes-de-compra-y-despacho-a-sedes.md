# ADR-0362 · Órdenes de compra, comprobante y despacho a las sedes

- **Fecha:** 2026-10-07 · **Estado:** ACEPTADO por fases — decisiones 1–38 (32–38 el 2026-10-10). **Fase 1 aprobada y en
  construcción desde el 2026-10-10**; las fases 2 a 7 siguen en diseño. Nada en producción todavía.
- **Rama:** diseño en `claude/purchase-order-flow-6207e9` (2026-10-07 → 10); desde el 2026-10-10 sigue en
  `claude/purchase-order-redesign-9b0c82`, al día con `main`. El rango reservado (`20261008100000`–`…109999`) quedó atrás de lo que
  entró a `main` (hasta `20261010150000`): las versiones se eligen el día que se escriba cada migración.
- **Contrato con:** ADR-0361 (sesión «Recibir Mercadería», rama `claude/recepcion-mercaderia-inventario-16e55e`): la recepción en
  la sede es de Inventario y la construye esa sesión; esta construye la orden de compra, el comprobante y el despacho.
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
S/ con un selector y se muestra el otro valor calculado al lado.

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

## Contrato provisional con la sesión de Recepción (ADR-0361)

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
| Inventario ▸ Recibir mercadería | `recibir` | existe (ADR-0361) | la sede | contar por guía, corregir costo, faltantes, sobrantes, dañadas |
| Inventario ▸ Existencias (Dañadas) | `existencias` | existe | la sede | arreglar, liquidar, regalar, desechar, devolver al proveedor |
| Producción ▸ Abastecimiento ▸ **Órdenes de insumos** | `produccion` | pantalla nueva | quien compra para el Taller | `OI-`, insumo con unidad, proveedores del Taller, «Tu fondo» |
| Finanzas ▸ **Fondos por rendir** | `fondos` | nueva (nace solo para el líder) | líder o a quien él se lo dé | entregar plata, aprobar rendiciones, tablero de control |

Fondo: cada persona tiene su cuenta «por rendir» con su nombre; entrega y devolución son movimientos propios (no gasto); una sola
rendición abierta por persona; el saldo se calcula; nadie se entrega plata a sí mismo ni aprueba su propia rendición; quien gasta
del fondo es solo su dueña (se compara la cuenta que entró y el combo Responsable). La compradora no necesita Finanzas: ve su fondo
como tarjeta donde compra y en Inicio. Órdenes de compra entra a la regla de celular (375 px) porque se usa en Gamarra.
