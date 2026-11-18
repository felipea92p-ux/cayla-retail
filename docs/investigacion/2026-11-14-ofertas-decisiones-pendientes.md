# Las seis decisiones que dejó la auditoría de Campañas y ofertas (2026-11-14, ADR-0655)

Felipe pidió investigar qué es lo correcto en cada una y por qué. Este archivo reúne los datos de producción, lo que hacen los sistemas líderes
y la norma peruana. Las cifras son de producción, consultadas en solo lectura el 2026-11-14. Las páginas de ayuda de los POS no traen fecha:
vale la fecha de consulta. Lo marcado «sin fuente» no se pudo confirmar.

## Lo que se decidió

| # | Qué | Decisión (Felipe, 2026-11-14) | Migración |
|---|---|---|---|
| 1 | Cambio de talla de una prenda con descuento | El mismo modelo no paga nada; solo lo que la talla nueva cuesta de más | `20261114125000` |
| 2 | Una prenda con dos ofertas | Avisar a quien configura para que elija; mientras tanto, la que más ahorra (como Shopify) | `20261114155000` y el aviso, `20261114170000` |
| 3 | Oferta sobre una insignia desactivada | Deja de rebajar | `20261114130000` |
| 4 | «Prenda sin registrar» en un monto de toda la compra | Se queda como está: cuenta | — |
| 5 | Venta sin conexión que sube después de que empezó una oferta | Vale la hora de la venta | `20261114132000` |
| 6 | Frescura cuenta el 3x2 como liquidación | Error contra una regla que ya existía: corregido | `20261114131000` |

## 1. Cambio de talla de una prenda comprada con descuento

**Antes:** `registrar_cambio` cobraba el precio de lista de la prenda nueva menos lo pagado por la devuelta (ADR-0380). Cambiar la talla de un
polo de S/ 49.90 que entró a un 3x2 a S/ 38.17 cobraba S/ 11.73. El ADR-0380 lo aceptó como consecuencia; la maqueta de Campañas y ofertas
(decisión 7) dijo «diferencia S/ 0». Las dos decisiones chocaban.

**Datos:** 23 cambios en 90 días, 9 del mismo modelo y 1 con descuento. Solo 2 de 631 modelos tienen tallas de distinto precio. Con el 3x2,
cada prenda del grupo lleva su parte del descuento, así que el caso deja de ser raro.

**Los líderes:**
- **Target** reparte el ahorro de un BOGO entre las prendas según su precio y, al devolver una, la vale lo pagado (help/article/000063251).
- **Uniqlo** (Indonesia, leído en el buscador): una prenda en oferta que se cambia por la misma no paga diferencia.
- **Shopify POS**: los descuentos automáticos no se aplican en un cambio; para mantener la rebaja, el cajero pone un descuento a mano
  (manual/sell-in-person/shopify-pos/order-management/exchange-item).
- No se encontró a nadie que cobre la diferencia por la misma prenda en otra talla.

**La norma:** INDECOPI no deja negar cambios ni devoluciones en ofertas (El Peruano, 16-06-2026). El art. 14.2 de la Ley 29571 obliga a
informar las condiciones y restricciones de una promoción. Sobre cobrar una diferencia en un cambio de talla: sin fuente.

**Qué quedó:** el mismo modelo vale lo pagado más lo que la talla nueva cuesta de más hoy en la tienda de la compra, y nunca devuelve. Otro
modelo sigue a lista contra lo pagado, que cierra el hueco de comprar barato y cambiar por algo caro. Lo mismo en el cambio de una prenda por
varias, en las unidades del mismo modelo hasta las que se devuelven.

## 2. Una prenda con dos ofertas

**Antes:** el candado revisa una oferta solo al guardarla o activarla. Después, cinco puertas pueden dejar una prenda en dos ofertas:
- marcarla con una insignia;
- sumarle una categoría a una insignia;
- mover el modelo de categoría;
- crear un modelo en una categoría con oferta;
- reactivar una campaña.

La caja ya elige una sola en casi todo:
- dos rebajas: la mayor;
- dos 3x2: el más antiguo;
- un monto y una rebaja: gana la rebaja.

El único cruce que suma las dos es **rebaja + 3x2**.

**Shopify** (segunda vuelta, a fondo):
- **Al configurar o al etiquetar:** no avisa nada. No hay un indicador de «este producto tiene N descuentos», y los conflictos no se listan.
  Solo existe la columna «Combinations» (manual/discounts/discount-combinations).
- **Al cobrar**, en la tienda y en el POS: «the best discount for the customer's cart is always applied». Si empatan, elige uno sin decir cómo.
- **Buy X get Y contra un %:** fuera de Plus, lo que entra a un Buy X get Y no recibe otro descuento de producto
  (manual/discounts/discount-types/buy-x-get-y).
- **En el POS:** el cajero ve el descuento que ganó. Elegir otro desde la caja: sin fuente.
- **La app «Price Rules» (Bevy Commerce):** al publicar una regla que toca una variante ya cubierta, abre «Conflict Detected» y la persona
  elige variante por variante cuál queda. La regla no sale hasta resolverlo. Es lo más parecido a lo que pidió Felipe.

**Otros:**
- Square: la mejor para el cliente, una sola por artículo.
- Salesforce B2C: por exclusividad y rango, y al final la mejor para el comprador.
- Oracle RPM: bloquea al aprobar la promoción, como CAYLA.

**Decisión de Felipe:** avisarle a quien configura qué prendas tienen varias ofertas, para que elija con cuál se queda. Mientras nadie
elige, «Como Shopify: la mejor»: la caja cobra la que más le ahorra al cliente en esa compra, nunca las dos. Construido en `20261114155000`
(la base) y en la caja, Apartar y la bolsa web.

**¿Se elige prenda por prenda o por par de ofertas?** (tercera vuelta a Shopify, 2026-11-14):
- La combinación se decide por descuento, en su sección «Combinations», y vale para todo lo que el descuento cubre. No hay un ajuste por
  producto ni por variante.
- No hay forma de elegir, para un producto, cuál de dos descuentos le toca. Lo que la página da a entender es separar las colecciones: «Ensure
  that your Buy X get Y discount and other product discounts apply to different products or collections».
- En el administrador no avisa nada: solo un filtro «Combines with» en la lista de descuentos.

Felipe eligió por par de ofertas («Dale»). Se construyó en `20261114170000`: el aviso y la hoja de Campañas.

## 3. Una oferta sobre una insignia desactivada

**Antes:** seguía rebajando las prendas marcadas. 4 de las 10 insignias están desactivadas. Hoy no hay ofertas por insignia.

**Shopify** (respuesta de su equipo, 2026-03-09): si se borra la colección de un descuento, el descuento sigue activo pero no alcanza a
ningún producto, y lo llaman «expected behaviour» (community.shopify.dev, t/32044).

**Qué quedó:** la oferta sigue a la insignia. Desactivada o sin aprobar, no llega a sus prendas; reactivada, vuelve. Una oferta que eligió solo
insignias no pasa a rebajar las prendas de su campaña. Al desactivar una insignia, la confirmación nombra las ofertas que dejan de rebajar.

## 4. «Prenda sin registrar» en un monto de toda la compra

**Datos:** en 90 días, 1.334 de 3.833 líneas vendidas (35 %) fueron «Prenda sin registrar», por S/ 59.485.

**Shopify:** en un descuento por monto, solo lo que entra a la oferta cuenta para el mínimo. Un descuento para todos los productos se reparte
en proporción al precio (manual/discounts/discount-types/percentage-fixed-amount). Si una venta libre cuenta: sin fuente.

**Qué quedó:** sin cambios. Para el cliente es una prenda más, y «toda la compra» es lo que paga. Excluirla dejaría sin el ahorro a uno de
cada tres clientes que la llevan, con el cartel diciendo «desde S/ 200». Las campañas la dejan fuera porque se arman por categoría o por prenda,
y esta no tiene ninguna. No hay riesgo de dinero: su precio, escrito a mano, se cobra igual.

## 5. Una venta sin conexión que sube después de que empezó una oferta

**Antes:** la base miraba las ofertas del día en que la venta subía. Una que empezó entre la venta y la subida se exigía y la venta se
rechazaba. La cola la apartaba hasta un «Descartar» a mano, así que la venta se perdía:
- la plata estaba en el cajón y la prenda se había ido;
- no quedaba venta, ni movimiento de stock, ni comprobante.

Ya les pasaba a las campañas de siempre.

**Los líderes:**
- **Shopify POS:** sin conexión no aplica descuentos automáticos. El pedido sube con lo cobrado, y no está documentado que se recalcule ni
  que se rechace, salvo una tarjeta declinada (manual/sell-in-person/shopify-pos/selling-offline/offline-features y offline-payments).
- **Lightspeed X-Series:** «Amounts entered in offline mode are the final amounts charged to the cardholder».

**La norma:** la Ley 29571 pide exhibir el precio total (arts. 4.1 y 5.1) e informar la duración de una promoción (art. 14). Que una oferta
que empezó después de la venta no obligue a nada es una deducción, sin fuente.

**Qué quedó:** `registrar_venta` exige y acepta las ofertas del día de la hora declarada de la venta (`x-momento`, la misma con que ya firma
el responsable: «vale la hora de la venta», Felipe 2026-09-22), con tope de 3 días. En línea, hoy, como siempre.

## 6. Frescura cuenta el 3x2 como liquidación

**Antes:** `fn_frescura_decisiones` ponía «otro» a toda línea con descuento sin motivo, y la web lo cuenta como liquidación. La parte de una
oferta de grupo y la del Club nunca llevan motivo (`venta_items_motivo_coherente_con_descuento`).

**Los líderes:** Oracle Retail separa la rebaja promocional (P, temporal) de la permanente (R) y la de liquidación (C), y las cuenta distinto
(docs.oracle.com, retail-analytics-planning 24.1, markdown-data-req). Frescura ya lo tenía decidido: «una campaña no es una liquidación».

**Qué quedó:** con solo la parte de una oferta o del Club, la línea cuenta como campaña.
