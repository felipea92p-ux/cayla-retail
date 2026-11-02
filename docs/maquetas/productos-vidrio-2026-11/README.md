# Maqueta · la página Catálogo ▸ Productos con vidrio (2026-11-02)

Página entera del tablero `docs/vidrio/README.md` (ADR-0596): `app/(app)/productos/page.tsx`, `components/ProductosGrilla.tsx`,
`ProductosTabla.tsx`, `FiltrosProductos.tsx` (ADR-0077, ADR-0254). Arma la página con lo ya elegido (cabecera, buscador pozo, filtros en
gota, botones gota; la Tabla con la placa de las tablas y sus estados en lente) y pone a elegir lo propio: **la tarjeta de producto** de la
Grilla y **el modo «Grilla / Tabla»**.

Abrir `index.html` (o con la config `maquetas`). Tocable: «Tabla» y «Grilla» cambian la vista (la gota viaja) y los puntos de color cambian
la foto de cada tarjeta.

## Lo que hay hoy

Tarjetas de papel (`card-cayla`) con la foto 4:5, su categoría y sus insignias encima, nombre en serif, marca · proveedor, una línea arena,
precio y stock, «en tu sede» y los puntos de color; y el modo «GRILLA / TABLA» en la caja arena (`SegmentoDeslizante forma="modo"`).

## Las caras

| Pieza | Caras |
|---|---|
| Tarjeta de producto | **A · Foto al aire** (la misma elegida en el Punto de Venta: una prenda en grilla se ve igual en Vender y en el Catálogo) · B · Placa translúcida (la Vitrina de Existencias) |
| Grilla / Tabla | **A · Pozo y gota** (el pozo con la gota de las pestañas, en chico, con su ícono) · B · Dos gotas de ícono |

En negrita, la recomendada. Lo que gana y lo que cuesta cada una, al pie de `index.html`. La vista rápida es diseño propio y no entra.

## Medido

En Chrome sin ventana: 162 combinaciones (320 a 1920 px, claro y oscuro, todas las caras), nada se desborda; sin errores de JS. La tabla
a 375 px deja la prenda, la casilla y el estado. En el celular el precio y el stock se apilan (en dos columnas de tarjetas, juntos se partían).

## Lo que decidió Felipe

**Tarjeta A · Foto al aire y modo A · Pozo y gota** (2026-11-02). Con una captura pidió que la información de la prenda «no quede
desparramada» y siga las normas de los grandes catálogos (proporciones y peso de cada cosa). Quedó así, en A y en B:

1. La foto es casi todo el peso. Sobre ella solo van las insignias (en gota); la categoría en versalitas se fue.
2. Debajo, un bloque de tres renglones pegado a la foto (12 px), con separaciones de 3 y 7 px:
   - **nombre a la izquierda y precio a la derecha**, mismo tamaño (15 px), el precio sin «.00» como en los catálogos;
   - **qué es y de qué color**, tenue (13 px): «Blusas · Vino», el color que se está viendo;
   - **los colores en puntos de 12 px** (lo que se toca mide 24 px) y, a la derecha, **el stock tenue**: «34 en stock»; solo pesa si es
     poco («Quedan 8», ámbar) o nada («Sin stock», rojo).
3. Marca · proveedor y «en tu sede» salen de la tarjeta (están en la vista rápida); quedan en el `title` del stock.
4. En una tarjeta angosta (celular), el precio baja bajo el nombre y el stock baja bajo los puntos si no caben.

Medido otra vez: 162 combinaciones sin desborde.

## La distribución, con las reglas de proximidad (pedida el 2026-11-02)

Con una ficha de Peloton de ejemplo, Felipe pidió aplicar las reglas de proximidad y ver varias formas de repartir la información. Las
tres siguen las mismas reglas: dentro de un grupo, 2 a 4 px; entre grupos, 12 a 18 px (el doble o el triple); un solo margen para todo;
un peso por grupo (lo principal en tinta y 15–19 px, lo secundario tenue y 12,5–13,5 px); y la acción, sola en su esquina.

La ficha con marco (Peloton) y la leyenda sobre la foto **no lo convencieron**; se reemplazaron por cuatro formas nuevas:

| Distribución | Cómo | Alto a 1440 |
|---|---|---|
| A · Catálogo de moda | La foto y tres renglones apretados debajo | 414 px |
| B · Centrada | Uniqlo, Muji: colores, nombre, precio y stock en el eje de la foto | 437 px |
| **C · Foto y pie en una pieza** (recomendada) | Dawn de Shopify: la foto a los bordes y un pie de vidrio pegado del mismo ancho; colores en la chapa sobre la foto | 393 px |
| D · Precio que cuelga | El precio es una gota que cuelga del borde de la foto | 415 px |
| E · Vitrina mínima | Zara, COS: solo nombre y precio; el stock en la foto si es poco, los colores al pasar el mouse | 376 px |

Medido: 60 combinaciones (320 a 1920, claro y oscuro, las cinco), nada se desborda; los colores siguen cambiando la foto. Lo que va sobre
la foto toma la tinta (en una prenda oscura heredaba el crema y quedaba blanco sobre blanco: corregido).
