# ESTÁNDAR — Varios almacenes y transferencias

> Apartado **C. Comparativa funcional** del documento *CAYLA Retail — el estándar, los doce y el
> camino*, columna 3 de 7. Escrito el **2026-09-12**, con el método de las columnas 1 y 2:
> puntajes transcritos del documento, lo que cada sistema hace verificado en su documentación
> oficial, lo que CAYLA tiene verificado en el repo (archivo:línea). **Si pasaron semanas,
> verificá cada archivo:línea contra el repo antes de creerle a esto.**

---

## 0. De dónde sale y cómo se lee

Es la segunda mitad de la prioridad 2 del documento (§B): *«Matriz real, varios almacenes y
transferencias entre Trujillo, Arequipa y el taller de Lima.»* Y es el eje del plan del propio
documento (§J, Fase 1): *«Integrar Lima al sistema elegido y formalizar las transferencias entre
las tres unidades.»* Lo que §G y §H piden encima —«reposición y reparto entre tiendas según la
demanda real», «transferencia entre sedes… Bsale y Alegra no lo hablan»— es la columna 6; ésta
es el **mecanismo**: cómo se mueve una prenda de una sede a otra sin que el sistema mienta en el
camino.

| Almacenes y transferencias | Sistema | Lo que el documento ya dijo |
|:-:|---|---|
| **5** | Lightspeed Retail | §E «las transferencias entre tiendas como nadie» · §K «hay que igualarlo» |
| **5** | NetSuite | Blueprint (05-sep): *landed cost*, *Smart Count* |
| **5** | Dynamics 365 BC | Blueprint: trazabilidad de lote «recepción → transferencia → picking → envío» |
| 4 | Shopify POS · Odoo · Zoho Inventory · Katana · ApparelMagic · Uphance · Doss · Bsale · Defontana | Blueprint sobre Odoo: «ubicaciones jerárquicas en árbol», «reglas push/pull declarativas»; sobre Katana: «disponible / comprometido / esperado» |
| 3 | Square · Loyverse · INVY | — |
| 2 | Alegra | §B «nacieron de la contabilidad, no del mostrador» |

**La lectura, antes de las fichas.** Es la columna más comoditizada de las siete: **doce de
dieciséis sacan 4 o más**. Tener varias sedes con su stock y mover prendas entre ellas no
distingue a nadie; lo que separa a los tres 5 es **cómo modelan el viaje**: el traslado es un
documento con estados (enviado → en tránsito → recibido), la recepción se confirma en destino
con lo que de verdad llegó, y mientras la caja está en el camión el stock no está en ninguna
tienda. Y hay un detalle peruano que ninguna ficha global mide y que Bsale sí resuelve: mover
mercadería entre establecimientos exige **Guía de Remisión Electrónica** ante SUNAT.

CAYLA arranca con buena base —almacén interno por sede, contenedores, stock por sede,
`movimientos` como única fuente de verdad, conteos por ubicación, sugerencia de traslado— y con
**un traslado que es atómico e instantáneo**: el mismo movimiento resta en el origen y suma en el
destino (`0045_ajuste_con_signo.sql:220-227`). Trujillo → Arequipa son unas 20 horas de bus en
las que Arequipa ya «tiene» en pantalla lo que no puede vender.

---

## 1. Fichas

### Lightspeed Retail (X-Series) — 5 · el estándar del sector

**Lo más resaltante**

1. **El traslado es un documento con estados: `OPEN → SENT → RECEIVED`** (cancelable). Se crea
   en el origen, se marca enviado, y **se recibe en el destino** confirmando que «lo físicamente
   recibido coincide con lo enviado»; si no, **recepción parcial** con la cantidad real por
   producto. Sirve almacén → tienda y tienda → tienda.
2. **Puntos de reorden por producto y por local**, y la orden de compra que se arma sola desde
   «productos en o bajo su punto de reorden», eligiendo si se pide para todos los locales o para
   uno («*Ordering for: all outlets / each outlet*») — las «órdenes de compra automáticas» de §E.
3. Órdenes de compra para varios locales a la vez, con recepción por local.
4. Conteos de inventario completos o parciales, por local.

**Lo que NO copiar.** El vocabulario de *consignment* (así llama la API a órdenes y traslados);
el precio por local.

**Qué se lleva CAYLA**

- **El traslado con estados y recepción en destino** → hoy no existe: `registrar_movimiento`
  con `tipo='traslado'` mueve las unidades en el acto (`fn_aplicar_movimiento`, `0045:220-227`),
  sin «enviado», sin «recibido», sin diferencia. Mecanismo 1.
- **Reorden por sede que se convierte en orden** → `stock.stock_minimo` por sede,
  `reorderPoint` y `sedesBajoMinimo` ya están (`lib/inteligencia.ts:119-137`); `ordenes_compra`
  con `sede_destino_id` existe (`0017`); falta el botón que una la alerta con la orden (Radar
  del 08-sep, propuesta 3). Mecanismo 4.

### NetSuite — 5 · corporativo

**Lo más resaltante**

1. **Dos formas de mover stock, a propósito.** *Inventory transfer*: inmediato, para mover entre
   ubicaciones sin viaje. *Transfer order*: con seguimiento — «you can track each stage of the
   transfer process and know when items are in transit». Al cumplir el envío, el valor sale del
   activo de inventario del origen y entra a **Inventory in Transit**; el estado queda *Pending
   Receipt* hasta que el destino registra el *item receipt*, que recién ahí sube su *On Hand*.
2. **Bins** dentro de la ubicación (estantes, cajas) con transferencias entre bins.
3. *Smart Count* (Blueprint): conteo cíclico por zona sin cerrar la tienda.
4. *Landed cost* prorrateado (Blueprint): el flete del traslado entra al costo.

**Lo que NO copiar.** El *Inventory in Transit* como cuenta contable separada es de la columna
5, no de esta; el WMS móvil y el *pick, pack and ship* son para volumen que CAYLA no tiene.

**Qué se lleva CAYLA**

- **Los dos verbos:** «mover» (dentro de la sede: piso ↔ almacén, ya existe con `bajar_a_piso` y
  `devolver_a_almacen`) y «trasladar» (entre sedes, con viaje). Hoy los dos son instantáneos;
  solo el segundo necesita el estado en tránsito. Mecanismo 1.
- **Stock en tránsito que no es de nadie** mientras viaja: ni del origen ni del destino.
  Mecanismo 3.

### Dynamics 365 Business Central — 5 · Microsoft

**Lo más resaltante**

1. **Transfer order con ubicación en tránsito.** Se crea con *from-location* y *to-location*;
   **el envío se registra en el origen y la recepción en el destino, por separado**; entre uno y
   otro las unidades viven en una *location* marcada «Use as In-Transit». Con *Direct Transfer*
   se salta el tránsito cuando no hay viaje.
2. **Rutas de transferencia** (*transfer routes*): origen → destino con su tránsito y su
   transportista, configuradas una vez.
3. **Stockkeeping units por ubicación**: el mismo artículo con política de reposición, punto de
   reorden y costo **distintos en cada local**.
4. Trazabilidad de lote/serie de punta a punta (Blueprint) y diarios de inventario físico.

**Lo que NO copiar.** El diario de reclasificación y los *put-aways* de almacén; para tres
tiendas y un taller es una capa que nadie va a operar.

**Qué se lleva CAYLA**

- **Envío y recepción como dos actos, con dos personas** → hoy `movimientos` guarda
  `usuario_id` (quien envía) y no hay «quien recibe» — solo `lotes.recibido_por` para
  recepciones de proveedor (`0008_almacen.sql:26`). Mecanismo 10.
- **La ruta como configuración**: TRU ↔ AQP ↔ LIM son tres rutas fijas; el transportista y el
  tiempo esperado se escriben una vez. Va dentro del mecanismo 1, no aparte.

### Los nueve con 4 — un mecanismo cada uno

- **Shopify (4)** — **Estados del inventario**: *on hand* = *available* + *committed* +
  *unavailable* (dañado, control de calidad, *safety stock*); ***incoming*** = lo que viene en
  transferencias, «isn't available to sell until it's been received». Y en el POS (v10.20):
  transferencias que se cumplen y **se reciben escaneando**. *Se lleva:* el vocabulario de
  estados (mecanismo 3) y el escaneo al recibir (mecanismo 11).
- **Odoo (4)** — Ubicaciones en árbol (Blueprint), **ubicación de tránsito** entre almacenes,
  rutas *push/pull* declarativas. *Se lleva:* nada nuevo — CAYLA ya modela el almacén como
  contenedor dentro de la sede (`0044`), que es el mismo espíritu; el tránsito es el mecanismo 1.
- **Zoho Inventory (4)** — *Transfer order* con «*Initiate Transfer* → **In Transit** → *Mark as
  Received*»; la recepción es manual a propósito: «even when the stock is delivered, you will
  have to manually record a receive». *Se lleva:* la confirmación explícita en destino
  (mecanismo 1).
- **Katana (4)** — movimientos de stock entre ubicaciones y las tres cantidades disponible /
  comprometido / esperado (Blueprint). *Se lleva:* «esperado» como número visible (mecanismo 3).
- **ApparelMagic (4)** — multi-almacén con *available to sell* por almacén. *Se lleva:* nada
  fuera de lo anterior.
- **Uphance (4)** — traslados **conscientes de la curva de tallas** (columna 2, mecanismo 5),
  3PL, bitácora de cambios de inventario. *Se lleva:* el traslado leído por modelo (columna 2).
- **Doss (4)** — multi-almacén y 3PL sobre tablas componibles. *Se lleva:* nada concreto.
- **Bsale (4)** — **«Despachar stock de una sucursal o bodega a otra»** en dos pasos: se despacha
  en el origen y **se recibe en el destino cambiando de sucursal**; y la **Guía de Remisión
  Electrónica de traslado interno**: la propia empresa como cliente, tipo «traslado entre
  establecimientos», dirección de origen y **ubigeo** de destino, enviada a SUNAT. *Se lleva:*
  la GRE como parte del traslado, no como trámite aparte (mecanismo 2).
- **Defontana (4)** — bodegas por sucursal y traslados, con guías de despacho; corporativo.
  *Se lleva:* nada fuera de lo anterior.

### Los cuatro restantes, en una línea

- **Square (3):** traslados entre locales en Retail Plus, devoluciones entre locales; sin
  tránsito ni recepción parcial documentada.
- **Loyverse (3):** órdenes de compra, traslados y conteos físicos (el complemento de inventario
  avanzado, de pago); traslado simple.
- **INVY (3):** «transferencias entre sucursales» en el plan Enterprise; sin más detalle público.
- **Alegra (2):** el inventario por bodega existe, pero es un sistema contable — §B y §E: código
  plano, «nacieron de la contabilidad, no del mostrador».

---

## 2. El estándar combinado de almacenes y traslados

| # | Mecanismo | De quién | Por qué importa | Dónde aterriza | Hoy |
|:-:|---|---|---|---|:-:|
| 1 | **El traslado es un documento con estados: enviado → en tránsito → recibido, con recepción parcial y diferencia** | Lightspeed (OPEN/SENT/RECEIVED), BC (in-transit location), NetSuite (Pending Receipt), Zoho (In Transit), Bsale (despacho + recepción en destino) | TRU→AQP son ~20 h de bus. Hoy AQP «tiene» la blusa en pantalla desde que TRU aprieta el botón: la puede vender, la cuenta la inteligencia, y si llegan 9 de 10 nadie lo sabe | `fn_aplicar_movimiento` resta y suma en el acto (`0045:220-227`); `MovimientoModal.tsx:76-90` manda `p_sede_destino_id` y listo; sin `recibido_por` en `movimientos` (solo en `lotes`, `0008:26`). Nace `traslados` (cabecera con estado, enviado_por, recibido_por, ruta) + líneas (enviada / recibida); al enviar sale del origen, al recibir entra al destino; la diferencia es un ajuste con motivo, nunca un borrado | ❌ · esquema · decisión de negocio |
| 2 | **Guía de Remisión Electrónica al trasladar** | Bsale (GRE de traslado interno con ubigeo), SUNAT (obligatoria desde 2023) | Sin GRE, SUNAT puede retener la mercadería en carretera. Hoy cada caja TRU→AQP o Taller→tienda viaja sin documento del sistema | grep `remisi[oó]n` en `apps/web`, `supabase`, `docs` → 0. La GRE se emite **al enviar** (mecanismo 1) por el PSE; **verificar en `docs.apisunat.com` si Lucode emite GRE remitente**; si no, SUNAT SOL. Cruza con la columna 4 (fiscal) | ❌ · fiscal · decisión de Felipe |
| 3 | **Estados del stock: disponible · comprometido · en tránsito · por llegar · no vendible** | Shopify (on hand / available / committed / incoming / unavailable), Katana (3 cantidades), NetSuite (in transit) | Una sola cifra por sede miente en cuatro direcciones: lo que viaja, lo que ya se vendió sin subir, lo que viene del Taller o del proveedor, y lo dañado | Piso `stock` ✅ y almacén `stock_almacen` ✅ (0044); **comprometido** solo como overlay en pantalla de la cola sin internet (ADR-0036); **por llegar** existe como filas (`ordenes_compra` pendientes, `producciones` en curso) pero no como cantidad; **en tránsito** no existe; **no vendible** (dañado/devolución) no existe — columna 1, mecanismo 5 | 🟡 |
| 4 | **Reorden por sede con mínimo y máximo, y la orden que nace de la alerta** | Lightspeed (reorder point por outlet → PO), BC (SKU por ubicación), NetSuite | La alerta que no abre una orden se traduce a mano en una conversación aparte (Radar, propuesta 3) | `stock.stock_minimo` por sede ✅, `reorderPoint` y `sedesBajoMinimo` ✅ (`inteligencia.ts:119-137`); `ordenes_compra` con `sede_destino_id` ✅ (`0017`); sin máximo; sin «crear orden desde la alerta»; para el Taller, sin «producir esto» desde la alerta | 🟡 · columna 6 |
| 5 | **Traslado sugerido → traslado hecho** | Lightspeed, Uphance (por curva), H&M (Radar) | El botón ya existe; lo que falta es que el traslado que abre sea el del mecanismo 1 | `sugerenciaTraslado` (`inteligencia.ts:137-160`) con botón «Trasladar» (`InventarioAgrupado.tsx:226`) que abre `MovimientoModal` ✅; leído por modelo/curva → columna 2, mecanismo 5 | ✅ / 🟡 |
| 6 | **Ubicaciones dentro de la sede: almacén, estante, caja** | Odoo (árbol), NetSuite (bins), BC (bins) | «¿En qué caja está la XL?» es la pregunta del censo y de la reposición al piso | `contenedores` tipo estante / caja / almacen (`0008:37`, `0044:72`), `stock_almacen` por contenedor, `bajar_a_piso` con `BajarATiendaModal` ✅; `devolver_a_almacen` existe como RPC **sin botón** (BACKLOG); estante/caja apenas usados | ✅ / 🟡 |
| 7 | **Recepción contra orden (compra o producción) con lo pedido y lo recibido** | Lightspeed (PO por local, recepción parcial), BC, Zoho | Recibir 46 de 50 sin registrar los 4 que faltan es la merma que nadie ve | `recibir_lote` liga `p_orden_compra_id` y marca `recibida` **sin comparar cantidades** (`0059_alta_con_vocabulario.sql:210`); producción → tienda: `produccionesPendientes = []` está **cableado en duro** (`inventario/recibir/page.tsx:70`) y `p_orden_produccion_id` no tiene soporte en la RPC (ADR-0004: reconciliar `ordenes_produccion` vs `producciones`, pendiente desde el 03-sep) | 🟡 · deuda ya anotada |
| 8 | **Conteo cíclico por zona, sin cerrar la tienda** | NetSuite (Smart Count), BC (inventario físico), Lightspeed (parcial), Loyverse | El conteo que exige cerrar la tienda no se hace; el que se hace por categoría un martes sí | `abrir_conteo` con alcance todo / familia / categoría / contenedor y ubicación piso / almacén (`0048:65,173`), cierre por Líder con varianza valorizada (ADR-0027) | ✅ |
| 9 | **¿Dónde está esta prenda?** (stock por sede a la vista) | Lightspeed, Shopify, Square (cross-location) | La Encargada que no encuentra la talla llama a la otra tienda o pierde la venta | `stockPorSede` en catálogo (`InventarioAgrupado.tsx:200-215`), en la ficha y en el buscador | ✅ |
| 10 | **Historial del traslado: quién envió, quién recibió, cuándo, con qué guía** | BC (envíos y recepciones registrados), NetSuite (item receipt), Lightspeed | Una diferencia sin historia es una discusión entre dos Encargadas | `movimientos.usuario_id / nota / created_at` ✅; sin «recibido por», sin documento; `lotes.recibido_por` solo para proveedor | 🟡 · va con el 1 |
| 11 | **Enviar y recibir escaneando** | Shopify POS (v10.20: «scan items to confirm inventory movement») | La pistola ya resuelve en el conteo y en la caja; el traslado elige de una lista | `MovimientoModal` sin escaneo; `lib/buscar-prenda.ts` ya resuelve código corto, de fábrica y SKU | 🟡 · barato |
| 12 | **Valor del stock por sede y en tránsito** | NetSuite (Inventory in Transit), BC | El balance por sede se descuadra mientras una caja viaja | `finanzas-nucleo` valoriza con el costo vigente × stock por sede (BACKLOG: «costo VIGENTE, no del día»); sin tránsito | 🟡 · columna 5 |

**Lo que ya está y ninguno de los 5 trae igual:** `movimientos` como única fuente de verdad
con `recalcular_stock` como red (principio 4); el almacén como **contenedor dentro de la sede**
y no como sede hermana (decisión del 03-sep, ADR-0031) — más simple que el árbol de Odoo para
tres tiendas; la RLS que deja a la sede destino ver el traslado que le llega (ADR-0001); el
**conteo que es censo** por zona (ADR-0027); y el overlay de lo vendido sin red (ADR-0036), que
es «comprometido» de verdad, no un número más.

---

## 3. Lo que deliberadamente no se copia

- **Rutas multi-paso dentro del almacén** (Odoo *pick → pack → ship*, BC *put-away*, NetSuite
  WMS). Tres tiendas y un taller: bajar a piso y devolver a almacén son los únicos pasos.
- **Bins granulares como obligación.** `estante` y `caja` ya existen; se usan cuando el censo
  los pida, no antes.
- **La cuenta contable «inventario en tránsito»** (NetSuite, BC). Primero el estado en el
  traslado (mecanismo 1); la contabilidad lo lee después (columna 5).
- **3PL e integraciones logísticas** (Uphance, Doss, Katana). CAYLA mueve sus cajas en bus y
  courier; lo que necesita es la GRE, no un conector.
- **El precio por bodega** (Bsale). Es la nota al pie de §D.

---

## 4. Orden sugerido para recolectar

De menor a mayor superficie. Nada se construye en esta sesión.

1. **Enviar y recibir escaneando, y «Devolver a almacén» con botón** (mecanismos 11 y 6). Solo
   `apps/web`: el buscador de `MovimientoModal` usa `lib/buscar-prenda.ts` (ya probado en la
   caja), y `devolver_a_almacen` gana su botón donde vive `bajar_a_piso`.
   *Cómo verificas tú:* en Inventario, «Trasladar» → escaneas la etiqueta → la prenda queda
   elegida; en Almacén, «Devolver» manda una prenda del piso al almacén.

2. **Recepción contra orden con lo pedido y lo recibido** (mecanismo 7). `recibir_lote` compara
   líneas de la orden con lo recibido y deja la diferencia escrita en el lote; y se reconcilia
   de una vez `produccionesPendientes = []` (la deuda de ADR-0004): una producción del Taller
   cerrada aparece en Recibir de la tienda destino. SQL chico + UI.
   *Cómo verificas tú:* recibes 46 de una orden de 50 → el lote dice «faltan 4» y la orden no
   queda como recibida completa.

3. **El traslado con estados** (mecanismos 1, 3 y 10). Esquema: `traslados` (origen, destino,
   estado `enviado / recibido / cancelado`, `enviado_por`, `recibido_por`, nota, guía) +
   `traslado_lineas` (variante, `cantidad_enviada`, `cantidad_recibida`). Al enviar: un
   movimiento de salida en el origen por línea, y las unidades pasan a **en tránsito** (una vista
   sobre las líneas enviadas y no recibidas — `movimientos` sigue siendo la única fuente, no se
   duplica el stock). Al recibir: un movimiento de entrada en el destino por lo que llegó; la
   diferencia queda como ajuste con motivo, nunca borrada. La ficha y el catálogo muestran «en
   tránsito hacia AQP: 3». **Decisiones de negocio antes:** ¿confirma la Encargada de destino, o
   la Líder? ¿Qué pasa con una diferencia (merma en tránsito, reclamo al transportista)? ¿Cuántos
   días antes de que un traslado sin recibir avise?
   *Cómo verificas tú:* TRU envía 3 blusas a AQP → TRU baja 3, AQP no sube, la ficha dice «3 en
   tránsito»; AQP recibe 2 → AQP sube 2 y el traslado queda con 1 de diferencia y su motivo.

4. **La Guía de Remisión Electrónica al enviar** (mecanismo 2). Depende del 3 y de una
   verificación previa: **¿Lucode emite GRE remitente?** (`docs.apisunat.com`). Si sí, «Enviar»
   emite la guía con motivo «traslado entre establecimientos de la misma empresa», dirección de
   origen y ubigeo de destino, y el número queda en `traslados.guia`. Si no, SUNAT SOL y el
   número se pega a mano. Es la columna 4 tocando a la 3; **decisión de Felipe** porque es SUNAT.
   *Cómo verificas tú:* un envío TRU→AQP deja una GRE aceptada y su número en el traslado.

5. **Máximo por sede y la orden que nace de la alerta** (mecanismo 4). Columna 6; aquí queda
   dicho que las piezas (`stock_minimo`, `reorderPoint`, `ordenes_compra`) ya existen.

6. **Los estados del stock en la ficha** (mecanismo 3, completo). Después del 3 y del 2 de la
   columna 1: piso · almacén · en tránsito · por llegar · vendido sin subir · no vendible.

---

## 5. Fuentes leídas el 2026-09-12

- Lightspeed X-Series — *Transferring stock*:
  https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534254620955 ·
  *Sending and receiving purchase orders for multiple locations*:
  https://x-series-support.lightspeedhq.com/hc/en-us/articles/28035899819163 ·
  API *Creating stock orders* (estados OPEN → SENT → RECEIVED):
  https://x-series-api.lightspeedhq.com/docs/inventory_creating_stock_orders
- NetSuite — *Transfer Order*: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N3692380.html ·
  *Inventory Transfer Orders* / *Receiving Transfer Orders*:
  https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N2308766.html ·
  *Bin Transfers*: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N2278346.html
- Dynamics 365 Business Central — *Transfer inventory between locations*:
  https://github.com/MicrosoftDocs/dynamics365smb-docs/blob/live/business-central/inventory-how-transfer-between-locations.md
- Shopify — *Understanding inventory states*:
  https://help.shopify.com/en/manual/products/inventory/fundamentals/inventory-states ·
  *Retail Roundup feb-2026* (transferencias en POS con escaneo): https://www.shopify.com/blog/retail-roundup-february-2026
- Zoho Inventory — *Transfer Orders*: https://www.zoho.com/us/inventory/help/warehouses/transfer-orders.html
- Bsale Perú — *¿Cómo despachar stock de una sucursal o bodega a otra?*:
  https://ayuda.bsale.com.pe/support/solutions/articles/151000212311 ·
  *Cómo hacer guías de remisión para traslado interno*:
  https://ayuda.bsale.com.pe/support/solutions/articles/151000212744
- SUNAT — *Guía de Remisión Electrónica*: https://cpe.sunat.gob.pe/landing/guia-de-remision-electronica-gre ·
  *Tipos de guía de remisión*: https://cpe.sunat.gob.pe/node/114
- Blueprint ERP CAYLA (05-sep) para Odoo, Katana, Infor y la trazabilidad de BC; Radar
  Back-Office (08-sep) para H&M.
