# Tarjeta/POS y canal online: investigación (PL-127)

**Fecha:** 2026-09-23 · **Alcance:** solo investigación, no se construye nada (decisión de Felipe, PL-127).
**Commit analizado:** `9cc46d02` (main, 2026-09-23). **Contexto:** PL-35 dice que Interbank y BCP son las dos
cuentas reales, y que ahí cae todo cobro electrónico (POS, Yape, Plin, transferencias).

---

## 1. Cómo funciona hoy en el código

**Resumen:** «tarjeta» es solo una etiqueta sobre el monto. El ERP no guarda qué POS se usó, qué n.º de
operación tiene el cobro, qué comisión se pagó ni a qué banco llegó el dinero. No hay conciliación de tarjeta,
ni en Caja ni contra el banco. Tampoco hay integración con ningún adquirente ni canal online.

| Qué | Dónde | Detalle |
|---|---|---|
| Tabla de pagos de una venta | `supabase/migrations/0008_caja_y_pagos.sql:62-68` | `venta_pagos (venta_id, metodo, monto)`. Admite pago mixto (varias filas por venta). |
| Medios permitidos | `supabase/migrations/20260923090000_separaciones.sql:178-180` | `check (metodo in ('efectivo','tarjeta','yape','plin','transferencia','anticipo'))`. |
| Vuelto | `supabase/migrations/20260919210000_venta_pagos_recibido.sql:31,36-38` | `recibido` solo existe en efectivo. Ningún medio electrónico tiene una columna propia. |
| Qué graba `registrar_venta` | `supabase/migrations/20260922150000_venta_asesora_emisor_descuento_lider.sql:590-597` | Inserta `(venta_id, metodo, monto, recibido)`. No hay referencia, voucher, lote ni banco. |
| Lista de la web | `packages/shared/src/enums.ts:54` | `METODOS_PAGO = efectivo, tarjeta, yape, plin, transferencia`. |
| Cobro en Vender | `apps/web/components/PuntoDeVenta.tsx:776` · `apps/web/lib/vender-reglas.ts:54-61` | Se toca el medio (o F2 para tarjeta) y se escribe el monto. No se pide n.º de operación. |
| Lo que cuenta Caja | `supabase/migrations/20260923200000_caja_cierre_con_traslado_y_apertura_verificada.sql:99-100` | El esperado del cierre solo suma `metodo = 'efectivo'`. La tarjeta no se cuadra con nada. |
| Donut de Caja | `apps/web/lib/caja.ts` (`porMetodo`) · `apps/web/lib/caja-panel-reglas.ts:39` | Muestra cuánto se vendió por medio. Solo informa, no controla nada. |
| Depósito al banco | `…20260923200000…sql:48` · `apps/web/lib/caja-cierre-reglas.ts:16` · `20260923233000_caja_deposito_sin_numero_de_operacion.sql` | Es un traslado de **efectivo** con destino `banco` y un voucher opcional. No indica a qué banco va. |
| Cuentas bancarias | `supabase/migrations/20260915202040_caja_deposito_y_ajuste.sql:31-33` | El comentario dice textualmente: «no existe (ni hace falta) una tabla de cuentas bancarias». |
| Registro contable | `apps/web/lib/registro-contable.ts:96-105` | Hay una sola cuenta «104 Banco / Yape». No se separa Interbank de BCP ni existe cuenta de comisiones. |
| N.º de operación | `apps/web/components/MediosDePago.tsx:56` | Existe, pero solo en Compras (pagos a proveedores). En ventas no hay. |
| Integraciones externas | `apps/web/app/api/lucode/*` · `apps/web/.env.example` | La única es SUNAT vía Lucode. No hay rastro de Culqi, Izipay, Niubiz, Mercado Pago ni webhooks. Shopify solo aparece en comentarios de diseño. |
| Canal online | `docs/BACKLOG.md:1874-1875` · `docs/datos/DECISIONES-2026-09-12.md:266` (D-46) | «No hay canal online en el modelo»; «la tienda online queda para después». |

**Consecuencias concretas hoy:**
- Si una colaboradora marca «tarjeta» pero cobró por Yape, o al revés, nadie lo detecta. El arqueo solo mira
  efectivo, y el total de «tarjeta» del ERP no se compara con el cierre de lote del POS.
- La comisión del adquirente no aparece en ningún lado. El margen de una venta con tarjeta sale igual al de
  una venta en efectivo.
- `anular_venta` y las devoluciones con `reembolso_metodo = 'tarjeta'` no saben si hay que anular en el POS
  (mismo día, antes del cierre de lote) o hacer un extorno. Eso queda en manos de la colaboradora.
- No se pudo medir cuánto se vende hoy con tarjeta. Las ventas de producción son de prueba o del sembrado de
  90 días (ADR-0150), así que un conteo de `venta_pagos` daría una cifra falsa. Ese dato tiene que venir del
  estado de cuenta real.

---

## 2. Tarjeta y POS en Perú: tres niveles

### 2.1 Proveedores vigentes (consultado 2026-09-23)

| Proveedor | Grupo | Comisión POS publicada | Equipo | Abono |
|---|---|---|---|---|
| **Izipay** | Intercorp/Interbank (100 % desde abr-2022 [8]) | 3,44 % + IGV nacional; 3,95 % + IGV extranjera; + S/ 0,69 + IGV por operación (fuentes secundarias [3][4]). La web oficial no publica el % del POS físico [1]. App Izipay (NFC en Android): 1,99 % solo para clientes nuevos [1]. | Compra única: POS Android desde S/ 108–158 con IGV [1] | **Inmediato a Interbank**; 24 h a otros bancos [1] |
| **Culqi** (POS CulqiFull) | Credicorp (BCP) [7] | 3,44 % nacional; 3,99 % internacional. La web dice «Comisiones inafectas a IGV y varían de acuerdo al nivel de ventas» [2] | Desde S/ 199 (RUC 20 con cuenta BCP) o S/ 219 (otros bancos). Sin cargo mensual [2] | **Mismo día a BCP**, fines de semana y feriados incluidos (ventas hasta las 4 p. m.); otros bancos: mismo día de lunes a viernes [2] |
| **Niubiz** | Consorcio bancario + Visa (no confirmado en fuente primaria) | No se pudo leer el tarifario oficial (la web no carga sin JavaScript). Las fuentes secundarias hablan de tarifa según rubro, entre ~1,4 % y 4,5 % [4][5] | Alquiler: S/ 23/mes fijo, S/ 64/mes inalámbrico (secundaria, may-2026 [5]) | 24–48 h hábiles (secundaria [5]) |
| **Mercado Pago Point** | Mercado Libre | Las cifras no concuerdan: 3,99 % + S/ 1 (dinero al instante) o 3,79 % + S/ 1 (a 14 días), sin IGV, según su página de ayuda en el buscador [6]; otra guía dice 3,49 % / 3,29 % + S/ 1 + IGV [3]. **No confirmado.** | Point Mini desde S/ 79 (secundaria [3]) | Queda en la cuenta Mercado Pago y de ahí se retira al banco |
| **Openpay (BBVA)** | BBVA | Smart POS: «hasta 3,44 % + IGV» según giro (secundaria [3]; la web oficial respondió 403) | — | Pide cuenta BBVA. CAYLA no tiene: **no calza** con PL-35 |

**Lectura para CAYLA:** con cuentas en Interbank y BCP, los candidatos naturales son **Izipay → Interbank**
y **Culqi → BCP**. Ambos abonan el mismo día a su banco y ninguno cobra alquiler. Las comisiones cambian
seguido y se negocian según volumen; hay que pedir una cotización por escrito antes de decidir.

**Cuánto cuesta en una prenda de S/ 150** (cálculo ilustrativo con las tarifas publicadas):
Izipay: 3,44 % + IGV = S/ 6,09, más S/ 0,69 + IGV = S/ 0,81, total **S/ 6,90 (4,6 %)**.
Culqi: 3,44 % inafecta = **S/ 5,16 (3,4 %)**. Efectivo: S/ 0.
Esa diferencia sale del margen, y hoy el ERP no la ve.

### 2.2 Nivel (a): POS independiente, registro manual (lo más probable hoy)

- **Cómo funciona:** la colaboradora cobra en el POS y en Vender marca «tarjeta» con el mismo monto. El
  adquirente abona el neto (venta − comisión) a la cuenta.
- **Qué falla:** que el monto del ERP y el del POS coincidan depende de que la colaboradora no se equivoque.
  Hoy nada lo controla (ver §1).
- **Cambio mínimo al ERP, sin integración:** un **cuadre de tarjeta al cierre de caja**. La colaboradora anota
  el total del cierre de lote que imprime el POS y el ERP lo compara con la suma de `venta_pagos` en
  `tarjeta` de esa caja. Es el mismo patrón que el arqueo de efectivo (ADR-0186) y no agrega ninguna
  dependencia externa. Opcional: un campo `referencia` en `venta_pagos` para el n.º del voucher. Agrega un
  paso a cada cobro, así que Felipe tiene que aceptar esa fricción.

### 2.3 Nivel (b): conciliación con el reporte del adquirente

- **Cómo funciona:** los portales de comercio (Izipay [1][9], Niubiz [10], Culqi [2]) dejan descargar el
  reporte de transacciones y abonos. Cada transacción trae fecha, hora, monto, terminal y referencia, y cada
  abono diario viene neto de comisión. **No se verificó** el formato exacto (CSV o Excel, columnas) porque
  esos portales piden sesión. Hay que pedir un archivo de muestra al proveedor.
- **Qué tendría que cambiar el ERP:**
  1. Saber qué terminal está en qué sede: una tabla chica `terminales_pos (ubicacion_id, proveedor,
     codigo_terminal, cuenta_destino)`.
  2. Guardar el archivo importado como documento propio: `liquidaciones_tarjeta` (una fila por abono, con
     bruto, comisión, IGV de la comisión y neto) y sus líneas por transacción. Solo se agregan filas, igual que
     `movimientos` (principio 4).
  3. Emparejar cada transacción con su `venta_pagos` por sede, día y monto (y por referencia si se guarda).
     Una pantalla muestra lo que no calza: «en el POS y no en el ERP» y «en el ERP y no en el POS».
  4. Registrar la comisión como gasto financiero y el neto contra la cuenta real, Interbank o BCP. Esto
     desmiente el comentario de `20260915202040…sql:32` («no hace falta una tabla de cuentas bancarias»):
     con dos cuentas y cobros electrónicos, sí hace falta, aunque sea muy chica.
- **Cuándo conviene:** cuando el volumen con tarjeta sea tal que revisar el estado de cuenta a mano cueste
  más que construir esto. Antes, el cuadre del nivel (a) cubre el 80 % del riesgo.

### 2.4 Nivel (c): POS o pasarela integrados al Punto de Venta por API

- **Opciones reales:**
  - Izipay «PinPad integrado a caja» [11]: la página no publica ni la conexión ni los costos.
  - Niubiz «PinPAD + integración a caja»: según su centro de ayuda, «el desarrollo de la integración debe ser
    realizado por el comercio» [12]. Bsale, un POS comercial, ya lo integra [13].
  - Mercado Pago Point con *payment intents* por API y webhooks [14]: está documentado para Argentina y
    México. **No se confirmó que funcione en Perú.**
- **Qué exigiría:** Vender manda el monto al terminal, espera la respuesta y guarda la autorización. Pero el
  POS de CAYLA es web (Next.js en Vercel). Un pinpad por USB necesita un agente local en cada PC de sede.
  La única vía limpia es una integración en la nube, con webhook y reintento.
- **Por qué no ahora:** choca con la cola offline (ADR-0063), porque sin red no hay cobro integrado. Mete una
  dependencia externa en el camino crítico de cada venta (principio 9). Y el costo de construirla y
  certificarla no se justifica con 3 tiendas (principio 5).

---

## 3. Canal online (alto nivel, sin diseñar)

### 3.1 Opciones

| Opción | Qué es | Costo | Esfuerzo en el ERP |
|---|---|---|---|
| **0. Venta asistida con link de pago** | La clienta escribe por WhatsApp o Instagram, la colaboradora le manda un link de Izipay o Culqi y registra la venta en una sede. Casi existe hoy: apartados (ADR-0141) y separaciones con adelanto. | Comisión del link (~3,4–4 %) [2][4] | Mínimo: un medio `link` o `tarjeta` con referencia |
| **1. Shopify conectado al stock del ERP** | La tienda vive en Shopify y el ERP es la fuente de verdad del stock. | Basic USD 19/mes (anual) o 25 (mensual). **+2 % por venta con pasarela de terceros**, porque Shopify Payments no existe en Perú [15][16]. App Izipay gratis [17] | Medio: sincronizar stock por *location* con la Admin API, recibir pedidos por webhook y reintentar [18] |
| **2. Tienda propia en este mismo Next.js** | Catálogo público y checkout con Culqi o Izipay. | Solo la comisión de la pasarela | Alto: catálogo, carrito, checkout, envíos y seguridad pública; todo se construye |

### 3.2 Qué le exige al núcleo (vale para las opciones 1 y 2)

- **Una sede «online» o salir de una existente.** `ubicaciones.tipo` hoy solo admite `tienda | almacen`
  (`supabase/migrations/0002_esquema.sql:81`). Se decide entre un tipo nuevo o despachar desde el almacén o
  desde una tienda.
- **Stock reservado.** La base ya existe: `stock.cantidad_apartada` y disponible = cantidad − apartada
  (`supabase/migrations/20260920160000_apartar_stock.sql:79`). Un pedido pagado y aún no despachado sería un
  apartado. Se publica online solo lo disponible, menos un colchón para no vender dos veces la misma prenda.
- **La venta sin cajera.** `registrar_venta` exige caja abierta y permiso sobre la ubicación
  (`0008_caja_y_pagos.sql:77+`). Un pedido online necesita otra puerta: una RPC propia o una «caja online»
  permanente. La base sigue siendo la que valida.
- **Pago y conciliación.** Un medio `pasarela`, o `tarjeta` con canal, más la conciliación del nivel (b). Los
  contracargos online son un riesgo que la tienda física casi no tiene.
- **Comprobante SUNAT.** Ya se emite por Lucode (`apps/web/app/api/lucode/emitir`). Falta decidir cuándo:
  al confirmarse el pago o al despachar. Los datos de la clienta llegan del checkout.
- **Devoluciones.** Reembolso a la tarjeta por la pasarela (no en efectivo desde una caja), prenda que vuelve
  a una sede y política escrita para la web.

---

## 4. Recomendación

**Por dónde empezar (en orden, cada paso verificable):**
1. **Confirmar la realidad:** qué POS hay hoy en cada sede, de qué proveedor, a qué cuenta abona y cuánto
   se vendió con tarjeta el último mes según el estado de cuenta. Sin esto, cualquier cifra es supuesta.
2. **Elegir el POS según el banco:** Izipay si el dinero de tarjeta va a Interbank, Culqi si va a BCP.
   Pedir cotización escrita a los dos: comisión, IGV, equipo, abono y formato del reporte.
3. **Primera construcción, cuando Felipe la apruebe: el cuadre de tarjeta al cierre de caja** (nivel a+).
   Es chico, no depende de nada externo y cierra el agujero más grande: que «tarjeta» en el ERP no se compara
   con nada.
4. **Nivel (b)** solo cuando el volumen lo pida, empezando por un archivo de muestra real del adquirente.
5. **Nivel (c): no**, mientras el POS sea web con cola offline y haya 3 sedes.
6. **Online:** empezar por la opción 0 (link de pago en una venta normal) y medir. Pasar a Shopify
   (opción 1) solo si la venta online justifica el 2 % adicional y la sincronización. Es el momento de sumar
   a Tucán.

**Riesgos:**
- La comisión efectiva (~3,4–4,6 %) come margen y hoy no se ve. Conviene decidir si se muestra por venta.
- Las tarifas cambian y las fuentes secundarias se contradicen (sobre todo en Mercado Pago y Niubiz). Decidir
  solo con cotización escrita.
- Una venta anulada que se cobró con tarjeta se anula en el POS, no en el ERP. Si nadie lo hace, la clienta
  queda cobrada. Hay que escribir el procedimiento por proveedor.
- Online: vender dos veces la misma prenda si se publica stock sin reservar, contracargos, y el orden entre
  pago, comprobante SUNAT y despacho.
- Integración por API (nivel c): una caída del adquirente frena las ventas (principio 9).

---

## 5. Decisiones que necesita Felipe

1. **Dato:** qué POS hay hoy en TRU, AQP y LIM, de qué proveedor, a qué cuenta abona y cuánto se cobró con
   tarjeta el último mes.
2. **Cuenta de destino de la tarjeta:** Interbank (Izipay) o BCP (Culqi). ¿Una sola para todas las sedes?
3. **¿Cuadre de tarjeta al cierre de caja?** La colaboradora anota el total del lote del POS y el ERP lo
   compara con lo registrado.
4. **¿N.º de operación obligatorio en cada cobro con tarjeta, opcional o ninguno?** Más control a cambio de
   un paso más por venta.
5. **La comisión:** ¿se ve por venta (margen real) o solo como gasto mensual desde el estado de cuenta?
6. **Online, la meta:** ¿venta asistida con link (opción 0), Shopify (1) o tienda propia (2)? ¿Con qué volumen
   se pasaría de un escalón al siguiente?
7. **Online, la operación:** ¿de qué sede sale el stock?, ¿mismo precio que en tienda?, ¿política de cambios
   y devoluciones para la web?

---

## Fuentes (todas consultadas el 2026-09-23)

1. Izipay, página principal: equipos, App 1,99 %, abono a Interbank. https://www.izipay.pe/
2. Culqi, precios del POS CulqiFull y comisiones («Comisiones inafectas a IGV»). https://culqi.com/precios/
3. Riqra, «Pasarelas de pago en Perú 2026», actualizado 2026-07-07 (secundaria). https://blog.riqra.com/posts/pasarelas-pago-online-peru
4. Adra Tech, «Izipay vs Niubiz vs Culqi 2026» (secundaria). https://adratechsystems.com/recursos/izipay-vs-niubiz-vs-culqi-comparativa-peru
5. Adra Tech, «Niubiz 2026: guía completa», 2026-05-11 (secundaria). https://adratechsystems.com/recursos/niubiz-peru-guia-completa-costos-integracion
6. Mercado Pago Perú, ayuda «¿Cuánto cuesta recibir pagos?» (403 al abrirla; cifra tomada del buscador). https://www.mercadopago.com.pe/ayuda/33403
7. BCP, «Soluciones de cobro con Culqi para PyMEs». https://www.viabcp.com/pymes/cobros/soluciones-cobro/culqi
8. La República, «Intercorp adquirió el 100 % de las acciones de Scotiabank en Izipay», 2022-04-18. https://larepublica.pe/economia/2022/04/18/intercorp-adquirio-el-100-de-las-acciones-de-scotiabank-en-izipay
9. Izipay, acceso al portal de comercios. https://www.izipay.pe/login-iniciar-sesion/
10. Niubiz, manual «Reporte de ventas» (PDF, 2020). https://www.niubiz.com.pe/wp-content/uploads/2020/12/Manual-reporte-de-Ventas.pdf
11. Izipay, «PinPad integrado a caja». https://www.izipay.pe/pinpad-integrado-a-caja/
12. Niubiz, centro de ayuda «PinPAD». https://www.niubiz.com.pe/soluciones/pin-pad
13. Bsale Perú, «POS Niubiz». https://ayuda.bsale.com.pe/support/solutions/articles/151000222190-pos-niubiz
14. Mercado Pago Developers, Point Integration API (payment intents). https://www.mercadopago.com.mx/developers/en/docs/mp-point/payment-processing
15. Shopify, precios (USD; pueden variar por país). https://www.shopify.com/pricing
16. Corsopay, «Shopify Payments no disponible en tu país» (secundaria). https://corsopay.com/es/blog/shopify-payments-no-disponible
17. Shopify App Store, Izipay (gratis, lanzada 2022-08-09). https://apps.shopify.com/izipay
18. Prediko, «Shopify Inventory API explained» (2026, secundaria). https://www.prediko.io/blog/shopify-inventory-api
