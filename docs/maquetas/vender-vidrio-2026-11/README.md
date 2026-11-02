# Maqueta · la página Punto de Venta (`/vender`) con vidrio (2026-11-01)

Primera página entera del tablero `docs/vidrio/README.md` (ADR-0596). Arma el Punto de Venta con las piezas ya elegidas (botones gota,
buscador pozo, filtros gotas con la puesta ahumada, globito gota, vacío pozo, el paso de cantidad hundido, la barra de abajo ahumada) y
pone a elegir solo lo PROPIO de la página: **la mesa** (cómo se reparten catálogo y ticket) y **la tarjeta de prenda**.

Abrir `index.html` (o con la config `maquetas`). Es tocable: una talla suma al ticket (y su globito en la tarjeta), − + y ✕ en cada
línea, las categorías filtran, «Vaciar el ticket» muestra el vacío. A 375 px el ticket pasa a la isla de abajo.

## Lo que hay hoy

`components/PuntoDeVenta.tsx`, `PuntoDeVentaCatalogo.tsx`, `PuntoDeVentaTicket.tsx`, `punto-de-venta/TarjetaPrenda.tsx`: una tarjeta de
crema maciza encierra catálogo y ticket (separados por una línea arena); cada prenda es una tarjeta de papel con tallas en píldoras de
crema. Sobre el vidrio, la pantalla más usada del ERP tapa todo el fondo.

## Las caras

| Pieza | Caras |
|---|---|
| La mesa | **A · Catálogo al aire, ticket en placa** (sin tarjeta grande; el ticket es la placa Serena que flota a la derecha) · B · Ticket ahumado (lo que llevas elegido es oscuro; «Cobrar» en gota clara) |
| Tarjeta de prenda | **A · Placa** (la placa de las cifras; tallas en gota, agotada en hueco punteado, almacén en ámbar punteado) · B · Foto al aire (sin tarjeta; la foto es la pieza) |

En negrita, la recomendada. Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

Todo lo que hace la pantalla (buscar o escanear, color y talla, «solo en el almacén», el máximo, quién atendió, cliente, bolsa,
descuentos, dejar en espera, cobrar; en el celular, la barra con su hoja). La persiana de «Caja cerrada» es diseño propio: no entra.

## Medido

En Chrome sin ventana: 90 combinaciones (320 a 1440 px, claro y oscuro, todas las caras), nada se desborda; sin errores de JS; tocar una
talla suma una línea. Al mirar apareció que en oscuro el «Cobrar» que vive sobre el ahumado (la isla del celular y el ticket B) quedaba
sin letra: el ahumado se invierte y la gota clara también tenía que invertirse; corregido (crema con letra tinta).
