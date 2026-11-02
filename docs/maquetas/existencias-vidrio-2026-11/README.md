# Maqueta · la página Existencias con vidrio (2026-11-02)

Página entera del tablero `docs/vidrio/README.md` (ADR-0596): Inventario ▸ Existencias (`components/ExistenciasTarjetas.tsx`,
`existencias/ParaHoy.tsx`, `FiltrosRapidos.tsx`, `PieTarjeta.tsx`). Arma la página con lo ya elegido (cabecera con sus cifras en placa,
«Para hoy» en placa, buscador pozo, filtros en gota con la puesta ahumada, botones gota) y pone a elegir solo el **material de la
tarjeta Vitrina** y su **tira de tallas** sobre el fondo de vidrio.

Abrir `index.html` (o con la config `maquetas`). Anchos de 320 a 1920.

## Lo que hay hoy, y lo que ya se decidió

La tarjeta **Vitrina** (ADR-0589, Felipe 2026-10-31): foto de 104 px con la chapa de colores, nombre y precio, el color, la tira de tallas
en un pozo de hueso y el pie a todo el ancho; de papel con sombra de reposo, filo de luz y un filo de 3 px rojo o ámbar en el canto. En esa
decisión se **descartó «C · Vidrio»** (desenfoque y luz que sigue al mouse) porque cuesta en una lista de cientos de tarjetas. Esta maqueta
no cambia la forma de la Vitrina: solo su material.

## Las caras

| Pieza | Caras |
|---|---|
| Vitrina | **A · Translúcida, sin desenfoque** (vidrio claro con su luz y su filo, sin `backdrop-filter`: cuesta lo mismo que el papel) · B · Placa con desenfoque (la placa de las cifras; es la «C · Vidrio» descartada) |
| Tira de tallas | **A · Pozo de vidrio** (el pozo de todo el ERP en vez del hueso) · B · Celdas en gota |

En negrita, la recomendada. Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

La forma de la Vitrina (foto, chapa con hasta 5 colores o 3 y «+N», filo de estado, pie con «Más ▾»), lo que dice cada talla, qué abre
cada toque, la rejilla de 20 rem y la alzada de 3 px. El modal de la prenda y «Ajustar stock» son diseño propio y no entran.

## Medido

En Chrome sin ventana: 162 combinaciones (320 a 1920 px, claro y oscuro, todas las caras), nada se desborda; sin errores de JS. Dos cosas
que aparecieron al medir: las celdas de talla usaban `.tc`, el mismo nombre que la tarjeta de cifra de la base (y heredaban su relleno:
a 320 px se salían), renombradas; y a 768 px con el lateral abierto las tres cifras de la cabecera se salían 14 px porque la base las
achicaba mirando el ancho del aparato y no el de la cabecera: la base ahora mira la cabecera (`@container ep`), lo que además achica los
desbordes que ya traían las maquetas de cifras, del Inicio y de tablas.
