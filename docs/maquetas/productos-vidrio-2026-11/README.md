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
