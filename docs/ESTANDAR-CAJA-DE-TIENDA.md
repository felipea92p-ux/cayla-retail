# ESTÁNDAR — Caja de tienda

> Apartado **C. Comparativa funcional** del documento *CAYLA Retail — el estándar, los doce y el
> camino*, columna 1 de 7. Escrito el **2026-09-11**. Los puntajes son los del documento (leído
> entero por el navegador, no de la imagen); lo que cada sistema hace se verificó ese día en su
> documentación oficial; lo que CAYLA tiene se verificó archivo por archivo en el repo.
> **Si pasaron semanas, verificá cada archivo:línea contra el repo antes de creerle a esto** — la
> caja cambia rápido (la pistola entró el 09-09, el token el 10-09).

Es el mismo método que ya se aplicó al apartado D: tomar la celda de puntaje máximo —*el estándar
que alguien ya alcanzó, y por tanto alcanzable*—, contrastarla contra lo que existe hoy, y dejar a
Felipe el menú de qué construir. Con una diferencia deliberada: aquí también entran los 4, porque
Bsale e INVY son los únicos que resuelven SUNAT dentro de la venta, y son contra quienes CAYLA se
compara de verdad (el documento llama a INVY «nuestro competidor»).

---

## 0. De dónde sale y cómo se lee

Escala de cero a cinco, «evaluada contra las necesidades de una marca de indumentaria con tres
unidades y taller propio — no contra el mercado general». La columna es la primera porque es la
prioridad 1 de 6 del propio documento (§B): *«La caja de la tienda. Rápida, física. Si la venta
tarda, todo lo demás es irrelevante.»*

| Caja de tienda | Sistema | Origen | ¿Sirve a CAYLA hoy? (§D) |
|:-:|---|---|---|
| **5** | Shopify POS | Canadá · plataforma | Sí — opción por defecto |
| **5** | Lightspeed Retail | Canadá · retail | Sí — si pesa el inventario |
| **5** | Square for Retail | EE. UU. · caja | Parcial — no cobra en Perú |
| **4** | Loyverse | Global · caja gratis | Sí — solo para Arequipa |
| **4** | Bsale | Chile · retail regional | Sí — alternativa local madura |
| **4** | INVY | Perú · caja con IA | Sí — y es nuestro competidor |
| 3 | Odoo | Bélgica · abierto | Parcial — aprendizaje brutal |
| 3 | Defontana | Chile · corporativo | Parcial — pesado para tres tiendas |
| 2 | NetSuite · Dynamics 365 BC · Zoho Inventory · ApparelMagic · Alegra | — | No / trastienda / capa fiscal |
| 1 | Katana · Uphance | — | Solo taller / sin caja |
| 0 | Doss | — | Otro segmento |

**La lectura de la columna, antes de las fichas.** Los tres 5 nacieron del mostrador: Shopify llegó
al POS desde su tienda en línea y lo rediseñó alrededor de la hora pico; Lightspeed nació en el
retail especializado; Square nació cobrando. Los 4 son cajas que además resuelven algo de la
región (INVY y Bsale: SUNAT; Loyverse: gratis y sin internet). Los 0–2 no son «cajas malas»: son
sistemas que **no nacieron de la caja** — contabilidad (Alegra), ERP corporativo (NetSuite, BC),
suite de inventario (Zoho), mayorista de moda (ApparelMagic, Uphance), manufactura (Katana), ERP
con IA (Doss). Es exactamente la tesis de §B del documento («nacieron de la contabilidad, no del
mostrador»), y la columna la confirma número por número. Consecuencia para CAYLA: en esta columna
**no hay nada que aprender de los ERP grandes**; todo lo que vale está en seis cajas chicas.

---

## 1. Fichas — los siete con caja real

Cada ficha: lo más resaltante de su caja (verificado, con fuente al pie), lo que **no** hay que
copiar, y qué se lleva CAYLA con el archivo del repo donde aterriza.

### Shopify POS — 5 · Canadá · plataforma

**Lo más resaltante de su caja**

1. **El flujo de venta rediseñado para hora pico (v11.0, feb-2026).** El carrito nunca se tapa:
   las acciones abren *al lado*, «not on top of it», así que la Encargada corrige sin retroceder.
   Multi-selección de líneas para aplicar un cambio a varias prendas a la vez; acciones sobre la
   propia línea; cliente y pago en paneles laterales; **teclado numérico inline para efectivo y
   pago dividido** (ya no el teclado del sistema); animaciones en lugar de pantallas nuevas,
   «removing hundreds of milliseconds per step». Es el «flujo rediseñado para hora pico» que §K
   del documento manda copiar.
2. **La búsqueda dice por qué encontró (v11.1).** El resultado muestra el SKU o el código de
   barras exacto que coincidió — nadie abre la prenda para confirmar que es la correcta.
3. **Offline con reglas escritas, no con promesas.** Checkout sin red activable **por dispositivo**
   (v10.20). Tarjeta sin red solo si se activó antes, con **tope por pedido y tope diario
   configurables** (los ejemplos de la ayuda: US$100 por pedido, US$5 000 por día). Y una lista
   explícita de lo que **no** funciona sin red: devoluciones, cambios, anulaciones, descuentos
   automáticos (los manuales sí), buscar o crear clientes, gift cards, guardar carritos. Más la
   advertencia: no apagar ni cerrar sesión con ventas sin subir.
4. **Cambio y devolución desde la orden original**, también entre locales (*cross-location
   returns*, POS Pro); y **transferencias entre locales que se confirman escaneando** (v10.20).
5. **Permisos por persona sobre datos de la clienta** («View Customer Details», v11.1): quién ve
   nombre, teléfono y dirección.

**Lo que NO copiar.** La tarjeta sin red: si el banco rechaza al reconectar, «use the email or
phone number that you collected for the order to contact the customer» — la pérdida es del
comerciante, tal como advierte §E del documento. Y el modelo comercial: US$89 por local (§D); es
la fila «opción por defecto» para *comprar*, no un modelo de licencia para imitar.

**Qué se lleva CAYLA**

- El carrito que no se tapa → hoy `RegistrarVentaModal` es un modal Radix (`components/ui/Modal.tsx`)
  donde todo ocurre adentro. Cuando se migre a `ui/campos.tsx` (pendiente ya anotado,
  `BACKLOG.md:1233-1239`), el rediseño es «carrito a la izquierda, acciones a la derecha» — no
  «otro modal encima».
- La búsqueda que muestra qué coincidió → el combobox ya existe (`RegistrarVentaModal.tsx:266-281`);
  falta que la coincidencia sea por código corto y código de fábrica (ver §2, mecanismo 1) y que la
  fila diga qué coincidió.
- La lista de lo que no funciona sin red, **en pantalla** → el paso 3 del brief ya escribe la
  regla de la última unidad; conviene decir también «sin señal no se emite comprobante ni se cierra
  caja», en la propia pantalla y no solo en el ADR.
- Permisos sobre datos de clienta → el día que exista clienta en la venta (§5, punto 5), el DNI y
  el teléfono los ve la Líder; la Encargada, el nombre.

### Lightspeed Retail (X-Series) — 5 · Canadá · retail

El documento ya lo sentenció en §E y §K: maneja «la matriz de talla y color, las órdenes de compra
automáticas y las transferencias entre tiendas como nadie», y «es el estándar del sector: no hay
que superarlo, hay que igualarlo». Eso es la columna 2 y 3. En la caja, lo suyo es el **dinero**:

**Lo más resaltante de su caja**

1. **El efectivo es un objeto de primera clase.** Apertura con fondo; *Cash Management* para
   **agregar y retirar efectivo con motivo** (caja chica, un pago al gasfitero); y el *register
   closure report*, que contrasta lo contado contra lo registrado **en efectivo y en tarjeta**, no
   solo en efectivo.
2. **El historial de ventas es el centro de operaciones.** Desde ahí se ve el detalle, se
   **devuelve una venta completada**, se reimprime o reenvía el recibo, y se administran las ventas
   a cuenta, aparcadas y en *layby*.
3. **La venta puede esperar.** *Parked sale* (la clienta fue por su billetera) y *layby*
   (apartado con seña, la prenda reservada).
4. **Offline explícito**: sin red solo existe la pantalla Sell — efectivo, aparcar, layby, a cuenta,
   crear cliente o producto. No: editar clientes, gift cards, lealtad, ni **ver inventario**.
5. **Training Mode**: ventas de práctica que no tocan datos; si se imprime un recibo, dice
   «Training Mode».

**Lo que NO copiar.** El modo entrenamiento: el repo ya lo decidió (`supabase/seed-demo.sql:17`:
«sin inventar un modo "demo" dentro de la app»), porque es una segunda verdad en la misma pantalla.
La potencia con manual: aprendizaje 2/5 en §D. Y el precio (US$89–289 al mes).

**Qué se lleva CAYLA**

- **Retiros e ingresos de efectivo con motivo** → hoy `cajas` solo tiene apertura y cierre
  (`0007_finanzas.sql:6-18`). Un retiro para pagar algo descuadra el cierre y queda como
  «diferencia», que es exactamente el número que nadie puede explicar después.
- **Cierre que muestra efectivo y los otros medios** → `cerrar_caja` solo suma efectivo
  (`0012_rpc_valida_sede.sql:187-189`, y está bien: solo el efectivo mueve el cajón). Pero el
  desglose Yape / POS / transferencia del día ya está calculado en `lib/finanzas.ts:65-117`
  (`getDiarioCaja`, `totalPorMetodo`) **y ninguna pantalla lo consume**. Mostrarlo en
  `CerrarCajaModal` deja que la Encargada cruce contra su celular antes de cerrar.
- **Historial con acción** → «Ventas de hoy» (`app/(app)/vender/page.tsx:155-161`) lista hora,
  método y monto, y no se puede abrir una venta. El historial es el lugar natural del cambio, la
  reimpresión y la boleta a posteriori (§2, mecanismos 5 y 7).
- **Aparcar / apartar** → no existe; `proformas` no reserva stock (`0034_facturacion_completa.sql:245-282`).
  Es decisión de negocio (§5, punto 9).

### Square for Retail — 5 · EE. UU. · caja

**Lo más resaltante de su caja**

1. **Vender es escanear.** Cuadrícula de checkout con lector, o con la cámara del teléfono;
   búsqueda por nombre, SKU o categoría; un GTIN crea la ficha si no existe; Square genera el SKU
   que falta.
2. **Cambios y devoluciones «en pocos toques»**, multi-ítem, entre locales; descuentos; pago
   dividido entre varios medios.
3. **Offline con reglas duras y con números.** Tope por transacción configurable (US$1 a
   US$50 000); 24 horas (Reader) o 72 (Register) para subir; «you're responsible for any expired,
   declined, or disputed payments»; sin reembolsos mientras haya pagos sin subir; y **«pending
   offline payments will be permanently lost»** si se cierra sesión, se borra la app o se
   restablece el equipo.
4. **Quince minutos para vender sola, sin manual** — el estándar que §E le atribuye junto con
   Loyverse. Plan gratis que funciona.
5. La caja alimenta la reposición: *smart stock forecasts*, órdenes de compra y proveedores
   (Plus). No es caja, pero muestra que la venta es el dato de entrada de todo lo demás.

**Lo que NO copiar.** Ser procesador de pagos y cobrar comisión por transacción (§H: «no somos
procesadores de pago… un negocio regulado que no entendemos»). No opera en Perú (§D). Y la
responsabilidad del comerciante por cobros rechazados sin red.

**Qué se lleva CAYLA**

- **El cambio en pocos toques** desde la venta → no existe (§2, mecanismo 5).
- **La cola que sobrevive al cierre de sesión.** Square avisa que cerrar sesión pierde los pagos
  pendientes. En CAYLA `LogoutButton.tsx:19` manda `cayla:limpiar` al service worker — hoy solo
  borra la caché del conteo, pero cuando exista la cola de ventas del paso 3, **cerrar sesión no
  puede borrarla**, o hay que bloquear el cierre mientras haya ventas sin subir.
- La cámara como lector de respaldo → la Zebra ya está y la razón para no depender de la cámara
  ya está medida (ADR-0025: 1.2 puntos por módulo a 300 dpi era lo que hacía fallar la pistola).
  Queda como opcional para la sede que un día no tenga pistola (`BarcodeDetector` del navegador).

### Loyverse — 4 · Global · caja gratis

**Lo más resaltante de su caja**

1. **Gratis y funciona con señal mala**: «Realizar ventas con señal de internet baja o inestable.
   Todos los datos se sincronizarán». §K lo señala como el motor de captación que INVY copia.
2. **Tickets abiertos**: crear, guardar y editar órdenes; la clienta paga cuando quiere.
3. **Descuentos al recibo o a artículos específicos**; reembolso del artículo elegido o de todo el
   recibo; **pago combinado** (efectivo + tarjeta).
4. **Turnos con responsable**: «dar seguimiento al flujo de efectivo para minimizar errores y
   manipulación» e «identificar faltantes de caja al final de cada turno»; PIN y permisos por
   empleado; ventas por persona.
5. Recibo impreso o por correo; variantes; escaneo con cámara; tema oscuro para poca luz.

**Lo que NO copiar.** Fiscal Perú 0 (no emite boleta), apertura 2, belleza 3 (§D). Y nació para
restaurantes — modificadores, pantalla de cocina — vocabulario de comida, no de ropa (§H, Toast:
«un sistema que sirve para todo nunca modela bien un oficio»).

**Qué se lleva CAYLA**

- **El turno como unidad de cuadre con responsable** → `cajas` ya guarda `abierta_por` y
  `cerrada_por` (`0007:6-18`) y `ventas.usuario_id` se llena (`0054_venta_idempotente.sql:146-147`),
  pero nada lo muestra, y la caja es una por sede y por día (`cajas_sede_abierta_unique`). Dos
  turnos en Trujillo un sábado son dos personas y un solo número de diferencia.
- Descuento por artículo o por venta, con permiso → §2, mecanismo 3.
- Ticket abierto → §2, mecanismo 8. Reembolso por artículo → mecanismo 5.

### Bsale — 4 · Chile · retail regional

**Lo más resaltante de su caja**

1. **El flujo de venta está documentado en siete pasos y cabe en una pantalla:** buscar por nombre,
   SKU o código de barras → más/menos cantidad → descuento por producto «si autorizado» →
   **elegir el documento en la venta** (boleta, factura, nota de venta o comprobante interno) →
   clienta por nombre o DNI/RUC («en el caso de generar una factura, es obligatorio asociarla a un
   cliente… con RUC registrado en SUNAT»; la boleta no lo exige) → **Pagar con uno o varios medios,
   y «si el monto de pago es mayor al total de la venta, el sistema mostrará el vuelto»** →
   Confirmar pago → diálogo de impresión.
2. El lector funciona si «los productos están creados con el código de barras asociado» — la
   etiqueta y el catálogo hablan el mismo código.
3. Stock por sucursal, bodega y canal, actualizado por cada venta y cada ingreso.
4. Autorizado por SUNAT; boleta y factura desde el punto de venta o desde Documentos.

**Lo que NO copiar.** El servidor como verdad: §F lo pone en la lista de los «construidos al revés
por diseño» y no documenta ningún modo sin red. El precio por unidad (S/141 por sucursal, S/70 por
almacén… nota al pie de §D). Y la rigidez del descuento «si autorizado» — copiar el permiso, no el
candado.

**Qué se lleva CAYLA**

- **Documento y clienta se eligen EN la venta.** Hoy Facturación es otra pestaña
  (`/vender/facturacion`), **solo para la Líder** (`app/(app)/vender/facturacion/page.tsx:24`), y
  `emitir_comprobante` se llama sin `p_venta_id` ni `p_items` (`ComprobantesPanel.tsx:230-258`)
  aunque el esquema ya los admite (`0032_comprobantes.sql:26`, `0037_comprobantes_items.sql:40-51`)
  y genera un ítem genérico «Venta de mercadería» (`0037:77-84`). Es el pendiente más viejo de este
  módulo (`BACKLOG.md:447`). § 2, mecanismo 4.
- **Vuelto automático** → no existe (`grep vuelto` en `apps/web` → 0). §2, mecanismo 2.
- **Nota de venta** como documento interno → `comprobantes.tipo` no lo admite (`0037:67`): hoy la
  venta sin boleta no deja papel. Recordar lo que la investigación de Fase 0 dejó escrito
  (BITÁCORA 2026-09-05): la nota de venta **no es comprobante de pago** (Art. 2, RS 007-99) — sirve
  como recibo interno, no como sustituto de la boleta.

### INVY — 4 · Perú · caja con IA

§I del documento: «se posiciona exactamente igual que nosotros… caja de nueva generación para
tienda física, inteligencia que vigila el inventario, sin hardware caro, en español, con una
cajera operando en quince minutos». Es la vara local.

**Lo más resaltante de su caja**

1. **Boleta y factura SUNAT desde la pantalla de venta**, con planes por cantidad de documentos
   (Pyme S/169: 500 documentos al mes; Negocio S/229: 1 500; Corporativo S/289: 2 000).
2. **Multicaja y multiusuario**: cada cajera con su propia sesión y permisos configurables, ventas
   y cierres por caja en tiempo real, corte de caja.
3. **Yape, Plin y transferencias** como medios de primera clase.
4. Variantes por talla y color con códigos de barras, alertas de stock mínimo, transferencias entre
   sucursales.
5. Sigue operando sin conexión y sincroniza al volver.
6. Catálogo digital para compartir por WhatsApp e Instagram, con stock sincronizado.
7. «Agente IA»: conversacional («¿qué productos tengo que reponer esta semana?»), predice
   quiebres, detecta productos estrella y clientas dormidas.

**Lo que NO copiar.** La IA conversacional como bandera: §G del documento la clasifica como humo
cuando es «un asistente de chat sobre el panel de administración» — lo que sirve es la alerta, no
la conversación. Apertura 2/5. Y **la boleta como peaje**: planes por número de documentos.

**Qué se lleva CAYLA**

- **Sesión por cajera** → §2, mecanismo 12.
- **Plin como método de pago** → `METODOS_PAGO` tiene `yape` pero no `plin`
  (`packages/shared/src/enums.ts:51`; `ventas.metodo_pago check`, `0007:30`). Trivial de agregar,
  pero es un `check` en el esquema: decisión de Felipe junto con el pago dividido.
- Catálogo por WhatsApp → columna Omnicanal, no ésta. Alerta de quiebre → columna IA accionable;
  CAYLA ya tiene `inteligencia.ts` («reponer ya», «estancado»).

### Odoo POS — 3 · Bélgica · abierto

§E del documento corrige la intuición: «Odoo es mejor de lo que creíamos… su caja funciona con y
sin internet sin instalar nada». Verificado: la caja es una app de navegador; al abrir la sesión
precarga productos, clientes y precios en IndexedDB; las órdenes hechas sin red se sincronizan
solas; y **«your POS session can be closed offline without any loss of data»**. La sesión tiene
control de caja de apertura y de cierre — la misma forma que `abrir_caja` / `cerrar_caja`.

**Lo que NO copiar.** Aprendizaje 1/5 («brutal») y puesta en marcha pesada (§D). La superficie
genérica (restaurantes, bares) que hay que desactivar antes de vender una blusa.

**Qué se lleva CAYLA.** La vara de «cerrar la sesión sin red y sin perder nada»: el paso 3 del
brief deja fuera el cierre de caja sin señal a propósito; Odoo marca cuál es el escalón siguiente.

### Los otros nueve, en una línea

- **Defontana (3):** POS «Tivendo», 100 % web, «online y offline para que nunca dejes de
  facturar», boleta, factura y nota de venta SUNAT, cierre diario, promociones. Corporativo y
  pesado para tres tiendas (§D). Lo único que enseña: la nota de venta interna como documento de
  primera clase.
- **NetSuite (2):** la caja es SuiteCommerce InStore, un módulo corporativo aparte. «Desproporcionado» (§D).
- **Dynamics 365 BC (2):** no trae caja — LS Central es una extensión con licencia aparte (LS Retail).
- **Zoho Inventory (2):** no es una caja. Zoho POS es un producto nuevo (EE. UU., junio 2026,
  desde US$15 al mes) que el documento no evaluó. «Sí — como trastienda» (§D).
- **ApparelMagic (2):** tiene POS, pero el producto es mayorista: órdenes de venta, asignación,
  pick-and-pack, B2B. «Es para US$5–100 M» (§D).
- **Alegra (2), «el nuestro hoy»:** sí tiene turnos, cierre de turno, descuento y precio por línea
  y boleta por venta. Su 2 no es por funciones: es §E — «depende de la conexión para lo bueno» y
  trata la prenda como un código plano.
- **Katana (1):** fabricación; la caja la delega a Shopify POS.
- **Uphance (1):** B2B de moda, «sin caja de tienda» (§D).
- **Doss (0):** ERP nuevo con IA, sin caja.

---

## 2. El estándar combinado de la caja

Un solo cuadro. «Hoy» sale del mapa del repo hecho el 2026-09-11 (archivo:línea o el `grep` que
demuestra que no existe). **Esquema** marca lo que toca el modelo de datos y por tanto es decisión
de Felipe.

| # | Mecanismo | De quién | Por qué importa un sábado a las 7 pm | Dónde aterriza | Hoy |
|:-:|---|---|---|---|:-:|
| 1 | **La caja lee la etiqueta que ella misma imprime** (código corto y código de fábrica) | Shopify (muestra el código que coincidió), Square (GTIN), Bsale («productos creados con el código asociado») | Escanear es el gesto que el equipo ya aprendió. Si la etiqueta nueva no entra, la Encargada teclea el SKU largo o desiste | `vender/page.tsx:78-86` no pasa `codigo` (aunque `VarianteConStock.codigo` existe, `lib/catalogo.ts:12`); `RegistrarVentaModal.tsx:83,160` compara solo `sku`. El conteo sí resuelve por `codigos_barras` (`lib/conteo.ts:194-206`) y la etiqueta imprime `codigo ?? sku` (`EtiquetasGenerator.tsx:24-25`) | ❌ **defecto** |
| 2 | **Vuelto automático + pago dividido** | Shopify (teclado inline), Square, Loyverse (pago combinado), Bsale (vuelto) | «S/150: 100 por Yape y 50 en efectivo» es la venta más común con clienta joven. Hoy se registra como un solo método y el cierre descuadra | `ventas.metodo_pago` único (`0007:30`); `<select>` único (`RegistrarVentaModal.tsx:360-371`); `grep vuelto` → 0. Pago dividido → `venta_pagos` (o `ventas.pagos jsonb` con `check` suma = total), `registrar_venta`, `cerrar_caja` | ❌ · esquema |
| 3 | **Descuento con motivo y permiso** | Loyverse (recibo o artículo), Bsale («si autorizado»), Alegra | Hoy el precio unitario se edita a mano (`:328-336`) sin rastro: el margen se pierde en silencio y nadie sabe si fue promoción, error o favor | `ventas` sin columna de descuento (`0007:26-35`); `grep descuento` en `supabase/` → solo «descuento de stock». Descuento + motivo en la línea (`movimientos`) o en la venta; permiso: Encargada hasta X %, Líder sin tope | ❌ · esquema + decisión de negocio |
| 4 | **Clienta y tipo de comprobante EN la venta** | Bsale, INVY, Alegra | La clienta pide boleta al pagar, no en otra pestaña que solo abre la Líder | `ConsultaDocumento.tsx` solo en `ComprobantesPanel`/`ProformasPanel`; `emitir_comprobante` ya admite `p_venta_id` y `p_items` (`0037:40-51`); `comprobantes.venta_id` nunca se llena desde la app | ❌ (esquema listo) · decisión de UX (`BACKLOG.md:447`) |
| 5 | **Cambio y devolución desde la venta original** | Shopify, Square, Lightspeed, Loyverse (por artículo) | El cambio de talla es la segunda operación más frecuente de una tienda de ropa. Hoy se hace «de palabra» y el stock no se entera | `grep registrar_devolucion\|anular_venta\|devolucion_clienta` → 0; `ventas` solo `select`/`insert` (`0007:69-72`, append-only: bien); `MOTIVOS_SALIDA` sin devolución (`enums.ts:29`). RPC nueva: movimiento de entrada con motivo `devolucion_clienta` y referencia a la venta; nota de crédito si hubo boleta (`emitir_nota`, `0037:105-173`) | ❌ · esquema + decisión de negocio |
| 6 | **Turno con responsable, retiros de efectivo y cierre por método** | Lightspeed (cash management, closure report), Loyverse (turnos), INVY (multicaja) | Un faltante sin turno ni retiro registrado es una discusión, no un dato | `cajas.abierta_por/cerrada_por` existen (`0007:6-18`) y no se muestran; sin tabla de movimientos de caja; `cerrar_caja` devuelve 3 números (`0012:164`); `getDiarioCaja`/`totalPorMetodo` (`lib/finanzas.ts:65-117`) sin consumidor | 🟡 |
| 7 | **Recibo para la clienta** (impreso o por WhatsApp) | Loyverse, Bsale, Shopify | Sin papel ni mensaje, el cambio del mecanismo 5 no tiene con qué probarse | `window.print` solo en `EtiquetasGenerator.tsx:151`; Lucode ya devuelve `pdf.ticket` (`lib/lucode.ts:238`) y la UI no lo muestra | ❌ |
| 8 | **Venta en espera / apartado con seña** | Lightspeed (parked, layby), Loyverse (tickets abiertos), Shopify (saved carts) | «Me la guardas hasta el lunes» hoy vive en un papelito | `proformas` existe pero no reserva stock (`0034:245-282`); `grep apartado\|anticipo` → 0 | ❌ · decisión de negocio |
| 9 | **Carrito visible, acciones al lado** | Shopify v11 | Cada modal encima del carrito es un paso más con cola | Modal Radix (`ui/Modal.tsx`); migración pendiente a `ui/campos.tsx` (`BACKLOG.md:1233-1239`) | 🟡 |
| 10 | **Sin red con reglas en pantalla y una cola que sobrevive al cierre de sesión** | Shopify (lista de lo que no funciona), Square («permanently lost» si cierras sesión), Loyverse, Odoo (cerrar sesión sin pérdida) | La regla de CAYLA (umbral 2, bloquea y explica) ya es más estricta que la de todos: protege stock, no tarjeta. Falta construirla | Paso 3 del brief (ADR-0013 §C); `sw.js:51` cachea solo `/inventario/conteo`; `LogoutButton.tsx:19` manda `cayla:limpiar` | 🟡 decidido |
| 11 | **Nota en la venta** | todos | «Se lleva la M, vuelve por la L el martes» | `p_nota` y `ventas.nota` existen (`0054:91`, `0007:33`); el modal no la manda (`:203-208`); `ventaInputSchema.nota` (`schemas.ts:54`) sin uso | 🟡 trivial |
| 12 | **Sesión por cajera y permisos sobre datos de clienta** | Loyverse (PIN), INVY, Shopify («View Customer Details») | Quién vendió, y quién ve el teléfono de la clienta | `ventas.usuario_id` se guarda (`0054:146-147`) y no se muestra; la caja es por sede, no por persona; no hay tabla de clientas (`grep create table clientas` → 0) | 🟡 |

Lo que ya está, para no medirse solo hacia arriba: pistola con Enter que no vende sola, estado
vacío accionable y acuse (`RegistrarVentaModal.tsx:155-185, 305, 232-247`, hecho el 09-09); tope
de cantidad contra `stockAqui` antes de llamar al RPC (`:111-115`); conteo ciego al cerrar
(`CerrarCajaModal.tsx:60-73`, `0012:187-200`); idempotencia por token (ADR-0032/0033); errores en
idioma CAYLA en los tres modales (`lib/error-escritura.ts`).

---

## 3. Lo que CAYLA ya tiene y ninguno de los tres 5 tiene

- **El reintento no cobra dos veces** (ADR-0032/0033). Shopify y Square resuelven el cobro
  rechazado diciéndole al comerciante que llame a la clienta; en CAYLA el token del cliente hace
  que `registrar_venta` reconozca la venta que sí entró y no la duplique.
- **La venta sin red que bloquea la última unidad** (ADR-0013 §C). Los tres 5 protegen la tarjeta
  (topes en dólares, 24 horas); ninguno protege el stock de que dos sedes vendan la misma última
  blusa. La regla de CAYLA es más estricta porque el riesgo de CAYLA es otro: no cobra tarjeta, la
  cobra el POS del banco.
- **Talla y color en el núcleo** (`variantes_identidad_unica`, ADR-0025). Shopify lo tiene; BC lo
  resuelve con un tercero; Alegra no lo tiene. Ninguno lo trae con código corto legible en la
  etiqueta.
- **Errores que hablan en idioma CAYLA** (ADR-0022) — el 5/5 de «facilidad de aprendizaje» de §D,
  ya construido en la caja.
- **SUNAT integrado sin peaje por documento** (Lucode, ADR-0005/0009/0016), con anulación y
  consulta dentro del sistema. INVY y Bsale cobran por tramo de documentos.
- **Conteo ciego al cerrar**: Lightspeed lo hace; Loyverse y Bsale muestran el esperado antes de
  contar.

---

## 4. Lo que deliberadamente no se copia

- **Modo entrenamiento** (Lightspeed). `seed-demo.sql:17` ya lo decidió: sin modo demo dentro de
  la app. Con la pistola, el tope de stock y los errores en castellano, la venta real es lo
  bastante segura como para aprender sobre ella.
- **Tarjeta sin red con pérdida para el comerciante** (Shopify, Square). CAYLA no procesa
  tarjetas: las cobra el POS del banco y CAYLA las registra. La regla sin red es sobre stock.
- **Comisión por transacción y ser procesador de pagos** (Square). §H: «un negocio regulado que
  no entendemos y que nos distrae del nuestro».
- **IA conversacional en la caja** (INVY, el asistente de Shopify). §G: lo útil es la alerta que
  propone y queda registrada; el chat es humo.
- **La boleta como peaje** (INVY, Bsale): planes por número de documentos.
- **Vocabulario de restaurante** (Loyverse: modificadores, cocina). §H, Toast: profundidad en un
  oficio, no amplitud en muchos.
- **La cámara del celular como lector principal** (Square, Loyverse). La Zebra ya está y la razón
  de sus fallas ya se midió y se corrigió (ADR-0025). La cámara, solo como respaldo.

---

## 5. Orden sugerido para recolectar

De menor a mayor superficie tocada, y el defecto primero. Ninguno se construye en esta sesión:
es el menú para que Felipe elija. Cada uno dice qué se gana, qué se paga y cómo se verifica.

1. **La caja lee la etiqueta** (mecanismo 1). Solo `apps/web`: pasar `codigo` en
   `vender/page.tsx:78-86`, cargar `codigos_barras` como hace `lib/conteo.ts:194-206`, y que
   `alTeclado` (`RegistrarVentaModal.tsx:155-165`) resuelva por código corto, código de fábrica y
   SKU, en ese orden. Sin SQL.
   *Ganas:* el censo etiquetado vende desde el primer día; la Zebra sirve en la caja igual que en
   el conteo. *Pagas:* nada. ~1 hora.
   *Cómo verificas tú:* imprimes una etiqueta desde Inventario, la escaneas en Vender → entra al
   carrito. Escaneas el código de fábrica de una prenda adoptada en el censo → también.

2. **Nota, vuelto y desglose por método en el cierre** (mecanismos 11, 2-a, 6-a). Solo `apps/web`:
   `p_nota` ya existe; el vuelto es «monto recibido − total», en pantalla, sin guardarlo; el
   desglose es conectar `getDiarioCaja` a `CerrarCajaModal`.
   *Ganas:* tres cosas que la Encargada hoy calcula a mano o anota en un papel. *Pagas:* nada de
   esquema.
   *Cómo verificas tú:* vendes S/150 con S/200 recibidos → «Vuelto S/50». Cierras la caja → ves
   Yape, POS y transferencia del día al lado del efectivo.

3. **Pago dividido** (mecanismo 2-b). Esquema: `venta_pagos (venta_id, metodo, monto)` con
   `check` de suma = `monto_total`, o `ventas.pagos jsonb`; `registrar_venta` con firma nueva
   (`drop` de la vieja con tipos explícitos, ADR-0026; y el token tiene que seguir cubriendo el
   caso — hoy compara caja + método + monto, `0054:131-141`); `cerrar_caja` suma solo la parte en
   efectivo. Agregar `plin` en la misma migración.
   *Ganas:* el cierre cuadra con la realidad. *Pagas:* migración local + `unificacion/`, y se
   prueba por HTTP contra PostgREST (es donde murió el arreglo del 10-sep). **Decisión de Felipe**
   (modelo de datos).
   *Cómo verificas tú:* S/150 = 100 Yape + 50 efectivo → una venta, dos pagos; el cierre espera
   solo los 50.

4. **Descuento con motivo y permiso** (mecanismo 3). Esquema: descuento y motivo en la línea
   (`movimientos`, para que el margen por prenda salga bien en Finanzas) o en la venta; permiso por
   rol. **Decisión de negocio**: hasta cuánto descuenta una Encargada sin la Líder, y qué motivos
   existen (promoción, falla, clienta frecuente).
   *Cómo verificas tú:* una Encargada intenta 30 % → la pantalla le pide a la Líder; 10 % pasa con
   motivo, y Finanzas lo ve como descuento, no como precio menor.

5. **Clienta y comprobante en la venta** (mecanismos 4 y 12). Casi todo `apps/web`:
   `ConsultaDocumento` dentro del modal, y `emitir_comprobante` llamada con `p_venta_id` y los
   `p_items` reales del carrito (cierra `BACKLOG.md:447`). **Decisión de UX de Felipe** ya anotada
   ahí, más una de negocio: ¿la Encargada emite boletas, o sigue siendo solo la Líder
   (`facturacion/page.tsx:24`)? Y una de alcance: ¿nace la tabla de clientas ahora, o basta el
   DNI en la boleta como hoy?
   *Cómo verificas tú:* vendes, tecleas un DNI, sale el nombre desde RENIEC, «Emitir boleta» →
   aparece en Facturación con las prendas reales, no «Venta de mercadería».

6. **Cambio y devolución** (mecanismo 5). La más grande: RPC `registrar_devolucion` (entrada con
   motivo `devolucion_clienta`, referencia a la venta original, salida de la prenda nueva si es
   cambio), historial de ventas con acción, nota de crédito si hubo boleta. El Radar del 08-09 la
   daba «diseñándose»; no hay nada en el repo. **Decisiones de negocio**: a qué sede reingresa una
   prenda devuelta en otra tienda, si se devuelve dinero o vale, cuántos días.
   *Cómo verificas tú:* cambias una M por una L desde la venta de ayer → el stock de la M sube, el
   de la L baja, la caja no se mueve, y la clienta se lleva su recibo.

7. **Turnos y retiros de efectivo** (mecanismo 6-b). Esquema: `movimientos_caja (caja_id, tipo,
   monto, motivo, persona)`; `cerrar_caja` los resta; permitir dos cajas al día en la misma sede
   (hoy lo impide `cajas_sede_abierta_unique` solo para *abiertas*, así que dos turnos seguidos ya
   son posibles cerrando entre medio — falta mostrarlos con nombre). **Decisión de Felipe**.
   *Cómo verificas tú:* retiras S/40 con motivo → el cierre espera S/40 menos y el retiro aparece
   con nombre.

8. **Recibo para la clienta** (mecanismo 7). Después del 5: cuando hay boleta, el `pdf.ticket` de
   Lucode es el recibo; cuando no, un ticket interno con `window.print` (patrón de
   `EtiquetasGenerator.tsx:151`) o un enlace de WhatsApp con el resumen.
   *Cómo verificas tú:* terminas una venta → «Imprimir» o «Enviar por WhatsApp» funcionan desde el
   acuse.

9. **Apartados** (mecanismo 8). **Decisión de negocio** primero: ¿CAYLA aparta con seña, cuántos
   días, qué pasa con la prenda mientras tanto? Si la respuesta es sí, `proformas` es el punto de
   partida, pero tiene que reservar stock (hoy no lo toca).

10. **Carrito visible** (mecanismo 9) — con la migración de los modales a `ui/campos.tsx`, ya en
    el BACKLOG, no antes.

11. **Sin red, paso 3** (mecanismo 10) — ya diseñado en el brief, sesión propia. Suma de esta
    lectura: la cola de ventas debe sobrevivir a `LogoutButton`, o el cierre de sesión se bloquea
    mientras haya ventas sin subir.

---

## 6. Fuentes leídas el 2026-09-11

- Shopify — *Using Shopify POS offline* y *Offline features*:
  https://help.shopify.com/en/manual/sell-in-person/shopify-pos/selling-offline ·
  https://help.shopify.com/en/manual/sell-in-person/shopify-pos/selling-offline/offline-features ·
  *Accepting card payments offline*:
  https://help.shopify.com/en/manual/sell-in-person/shopify-pos/selling-offline/offline-payments ·
  *Retail Roundup, febrero 2026 (v10.20, v11.0, v11.1)*:
  https://www.shopify.com/blog/retail-roundup-february-2026
- Square — *Process offline payments*:
  https://squareup.com/help/us/en/article/7777-process-card-payments-with-offline-mode ·
  capacidades y funciones de Square for Retail: https://squareup.com/us/en/retail/capabilities ·
  https://squareup.com/ca/en/point-of-sale/retail/features
- Lightspeed Retail (X-Series) — *Selling in offline mode*, *Opening and closing a register*,
  *Using the register closure report*, *Using Training Mode*, *cashiers quick guide*:
  https://x-series-support.lightspeedhq.com/hc/en-us (los artículos responden 403 a lectores
  automáticos; se leyeron por los extractos del buscador).
- Loyverse — https://loyverse.com/es/features
- Bsale Perú — *¿Cómo generar una boleta o factura en el Punto de Venta POS?*:
  https://ayuda.bsale.com.pe/support/solutions/articles/151000212322 · https://www.bsale.com.pe/
- INVY — https://www.invyperu.com/
- Odoo 18 — https://www.odoo.com/documentation/18.0/applications/sales/point_of_sale.html
- Defontana Perú — https://www.defontana.com/pe/precios/pos-tivendo
- Dynamics 365 BC / LS Central — https://www.lsretail.com/products/microsoft-dynamics-erp
- Zoho POS — https://www.zoho.com/en-us/pos/
- Alegra POS — https://ayuda.alegra.com/col/turnos-de-caja-pos · https://alegra.com/peru/punto-venta/
- ApparelMagic — https://apparelmagic.com/erp-software/
