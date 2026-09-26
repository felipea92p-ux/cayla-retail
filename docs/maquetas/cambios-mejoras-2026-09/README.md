# Cambios, computadora y celular: demo comparativo (2026-09-26)

`demo.html` es autocontenido (el isotipo va incrustado) y usa datos inventados. **No es el spike final ni una
implementación**: no toca `CambiosPanel.tsx`, `CambiosFlujo.tsx` ni la base. Sirve para elegir, con la barra oscura,
entre las opciones abiertas. La computadora y el celular se dibujan juntos.

Para abrir una combinación directo se usa el hash, por ejemplo `demo.html#escena=falta&tarjeta=B&fijo=B`.
Las claves son `escena` (lista/falta/fin), `tarjeta` (A/B/C), `fijo` (A/B/C), `final` (A/B/C) y `camara` (1/2).

## Lo que eligió Felipe (2026-09-26) → implementado en ADR-0229

| Tema | Elección |
|---|---|
| Tarjeta de actividad | **C · como hoy**, con «Quedan N días» (ámbar los últimos 3) |
| Fijo abajo en el celular | **A · «Escanear prenda o boleta»** |
| Al terminar | **A · ticket + seguir vendiendo** |
| Accesos | Los cuatro: traslado, apartado, pedido no atendido, devolución |
| Apartar «cuando llegue» | Decidido por Claude: sin estado «en espera»; se aparta al llegar y se cambia al volver |

## El pedido (Felipe, 2026-09-26)

Sumar a Cambios las pantallas nuevas que trabajan con ella, para agilizar a la colaboradora, con la pantalla bien en el
celular. Felipe eligió los cuatro accesos: Traslados, Apartados, Pedidos no atendidos y Clientas + Devoluciones.
Además pidió ver en un demo, antes del spike, tres cosas: la tarjeta de «Actividad reciente», qué va fijo abajo en el
celular y qué pasa al terminar. También pidió mirar cómo lo resuelven otras empresas.

## Qué se compara

| Tema | A | B | C |
|---|---|---|---|
| Tarjeta de actividad | Tocable entera, con fotos y «Quedan N días» | Lista compacta, una fila por compra | Como hoy (botón negro por tarjeta) |
| Fijo abajo en el celular | «Escanear prenda o boleta» | Escanear + Buscar | Nada |
| Al terminar | Ticket (WhatsApp/imprimir) + «Seguir vendiendo» | Solo ticket | Como hoy |

Lo que va en todas las opciones: el filtro «Por vencer» (excepto en C), escanear con la cámara de verdad, «Caja abierta»
antes de empezar, el conteo de compras de la lista y, cuando la talla no está, las salidas a Traslados, Apartados,
Pedidos no atendidos y Devoluciones, más la ficha de la clienta.

## Decisiones que el demo deja abiertas

1. **Apartar la prenda que llega:** ¿el cambio queda «en espera» hasta que la clienta la recoja (la prenda devuelta ya
   entró), o solo se aparta y el cambio se hace cuando vuelve? Lo segundo no toca el modelo; lo primero sí (un estado
   nuevo en `cambios`).
2. **Dinero (fuera de este spike):** la diferencia de precio sigue sin comprobante ni líder
   (`docs/pantallas/cambios.md` §2). El ticket del cambio **no es comprobante de SUNAT**. Bsale y Square resuelven la
   diferencia a favor con saldo o nota de crédito usable en otra venta; en CAYLA eso es una decisión de dinero y SUNAT.

## Así lo resuelven otros (investigación 2026-09-26)

Donde se dice «no encontrado», es literal. Las páginas de ayuda de Lightspeed X-Series (403), Bsale Perú (404) y el
anuncio de la app de tienda de Loop (403) no cargaron.

| | Encontrar la compra | Sin talla en la tienda | Diferencia de precio | Qué recibe la clienta |
|---|---|---|---|---|
| Shopify POS | Escanea el ticket con la cámara; busca por clienta, n.º de pedido o tarjeta | Envío desde el almacén u otra tienda (para cambios, solo con AfterShip) | El botón dice «Cobrar S/ X» o «Reembolsar» | Ticket en la app Shop o impreso |
| Lightspeed | Código del ticket o historial; exige clienta | Pedido especial «entregar después» + traslado | Botón verde (cobra) o rojo (devuelve) | Ticket con código escaneable |
| Square for Retail | Tarjeta, n.º de ticket o perfil de clienta | No encontrado | Cobra, par o devuelve; también a tarjeta regalo | No encontrado |
| Bsale | N.º de documento | No encontrado | Nota de crédito: efectivo, pago en venta nueva o saldo a favor | Nota de crédito |
| Loop Returns | Solo tienda online | No encontrado | «Solo mismo precio» y crédito extra si elige cambio | No encontrado |
| Zara | Ticket o QR en la app | Cambio en cualquier tienda | No encontrado | No encontrado |

**Qué se copia:** escanear el ticket o la etiqueta con la cámara; marcar qué se puede cambiar y por qué no; si no hay
la talla, traslado + entrega después a nombre de la clienta; el saldo escrito en el botón principal.
**Qué no se copia:** el cambio en dos transacciones (Lightspeed) ni el cambio que vive en una app aparte (Square).
**Nadie encontrado** muestra «quedan N días» ni anota la demanda perdida dentro del cambio.

Fuentes:
- Shopify: [cambio](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/order-management/exchange),
  [buscar pedidos](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/order-management/search-orders),
  [reglas de devolución](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/order-management/return-rules),
  [envío](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/order-management/add-shipping)
- AfterShip: [cambio en tienda sin stock](https://returns-helpcenter.aftership.com/en/article/exchange-fulfillment-on-returns-pos-l8alj6/)
  (dato solo del buscador; la página no cargó)
- Lightspeed: [cambio en X-Series](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534310552347-Process-an-Exchange),
  [código del ticket](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25533902115227-How-to-use-the-receipt-barcode),
  [pedidos especiales](https://x-series-support.lightspeedhq.com/hc/en-us/articles/47482035275675-Managing-special-orders),
  [R-Series](https://retail-support.lightspeedhq.com/hc/en-us/articles/229130768-Refunding-and-exchanging)
- Square: [ayuda](https://squareup.com/help/us/en/article/6350-process-a-return-or-exchange-with-square-for-retail),
  [anuncio](https://community.squareup.com/t5/Product-Updates/Exchanges-now-available-for-all-sellers-using-Square-for-Retail/ba-p/655220)
- Bsale: [tutorial](https://tutorialbsale.teachable.com/courses/85081/lectures/1231551),
  [nota de crédito como pago](https://ayuda.bsale.com.mx/support/solutions/articles/151000212774--c%C3%B3mo-utilizar-una-nota-de-cr%C3%A9dito-como-forma-de-pago-)
- Loop: [cambio de variante](https://help.loopreturns.com/en/articles/1912833), [crédito extra](https://help.loopreturns.com/en/articles/1912193)
- Zara: [cómo cambiar](https://www.zara.com/cl/es/help-center/HowToExchange)

**Lo que no cambia:** ADR-0206 (en celular el menú es el ☰; lo fijo abajo es una acción de esta pantalla), ADR-0169
(tokens), ADR-0136 (hojas) y ADR-0220 (cabecera de Ventas).
