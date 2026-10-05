# ADR-0333 · La prenda sin foto se dice de una sola manera

- **Fecha:** 2026-10-04 · **Estado:** construido en la rama `claude/isotipo-visual-alignment-458ecd`. **Solo web, sin migración.**
  Verificado en local, en Chrome sin ventana, a 1440 × 900 y 375 × 812.
- **Pedido:** Felipe, 2026-10-04, sobre una captura de Existencias: «se ve feo que en existencia sale el isotipo por todos lados»;
  quería «una misma alineación visual» y mostró también Catálogo ▸ Categorías, donde cada categoría ya tiene su ícono.
- **Decidieron las preguntas de Felipe (2026-10-04):** qué reemplaza al isotipo → el ícono de la categoría sobre el color de la
  prenda (lo que ya hacía Vender); hasta dónde llega → todo el ERP con una sola pieza. Con las dos primeras entregas hechas, Felipe
  pidió unificar también las tres que dibujaban lo suyo («unifícalas todas»): Catálogo ▸ Productos, Apartados e Inicio de Almacén.
- **Complementa:** ADR-0101 (`PrendaCelda`), ADR-0169 (paleta), ADR-0331 (Existencias, de hoy). **Reemplaza** el «isotipo al 30 %»
  del rediseño de Existencias del 2026-09-22.

## El problema

Una prenda sin foto se dibujaba de cinco maneras según la pantalla:

| Dónde | Cómo se dibujaba |
|---|---|
| Existencias, Conteo, cajones, Reponer, Ajustar, alta de producto (`SinFoto`) | el isotipo de CAYLA al 30 % |
| Vender (`MosaicoPrenda`, 2026-10-03) | el ícono de su categoría sobre el color de la prenda |
| Catálogo ▸ Productos (`ProductoPiezas.MiniaturaPrenda`, `ProductosGrilla`) | un tinte del color con una percha |
| Apartados (`apartados/piezas.FotoPrenda`) | el ícono de su categoría sobre el tono de la familia, sin color |
| Inicio de Almacén (`PrendaSinFoto`) | una blusa punteada |

El isotipo es la peor de las cinco para esta tarea: en Existencias, 25 prendas sin foto eran 25 marcas idénticas (la tarjeta de
«Pantalón Carla» y la de «Blusa Emma» se veían igual), y el isotipo ya es la marca de la casa (loader, tickets, etiquetas): usarlo
también como «hueco» le quita fuerza a las dos cosas. Con los 5 productos de la base local se ve poco; con un catálogo cargado y
sin fotos sería una pared de marcas iguales (no medí cuántas prendas de TRU no tienen foto).

## Decisión (las cinco filas quedaron en una)

DECIDÍ: una prenda sin foto es **el ícono de su categoría sobre el color de la prenda** (`MosaicoPrenda`), en toda la web que usa
`SinFoto`/`MiniaturaPrenda`/`FotoDePrenda`. El nombre de la categoría va debajo solo en cajas de 64 px de ancho o más (tarjeta de
Existencias, cajón); una miniatura de tabla es solo ícono. Sin color (Estampado, Multicolor) cae al tono de su familia; sin
categoría conocida dibuja la percha de Existencias, no el círculo de reserva de `IconoFamilia`. El isotipo queda solo como marca:
`lib/sin-foto.test.ts` falla si un archivo fuera de la lista de marca lo dibuja.

DESCARTÉ: el molde de Catálogo ▸ Categorías (ícono grande con dos ecos sobre el tono de la familia), porque no muestra el color de
la prenda, y en Existencias el color es justo lo que cambia al tocar un punto de la tarjeta (verificado: beige → negro). También
descarté la silueta punteada «sin foto», porque repetida en cada tarjeta es el mismo ruido que el isotipo, y dejar que cada pantalla
dibuje lo suyo, que es el estado del que se quería salir.

SE ROMPE SI: una categoría nueva se crea sin prefijo con dibujo y sin familia conocida (un Líder la crea sin deploy): cae a la
percha sobre un tono neutro, que es honesto pero no distingue esa categoría de otra sin dibujo; o si una pantalla nueva dibuja su
propio «sin foto» en vez de `SinFoto` (lo vigila `lib/sin-foto.test.ts` solo para el isotipo, no para dibujos nuevos).

## Cómo quedó

- `components/MosaicoPrenda.tsx` gana la forma `relleno` (llena la caja que le da quien lo pone, de 36 a 260 px; el ícono es casi la
  mitad de la caja entre 20 y 56 px) y el filo `inset` que sustituye al borde de la miniatura anterior.
- `components/ui/PrendaCelda.tsx` (`SinFoto`, `MiniaturaPrenda`) y `components/ui/FotoDePrenda.tsx` usan esa pieza. El punto de color
  aparte desaparece: la miniatura ES de ese color.
- `lib/categoria-de-prenda.ts` (`categoriaDe`): lo de la categoría que lleva una fila, para esparcir `{...categoriaDe(f)}`.
- **Existencias** trae `categorias.prefijo` y `familia` en sus tres selects (`lib/inventario-v2.ts`) y los lleva por `FilaStock` →
  `PrendaAgrupada` → tarjeta, lista por prenda y por talla, cajón, Ajustar, Reponer, Subir y Bajar al piso. **Conteo** lo recibe de
  `getCatalogo()` (que ya los traía) por `PrendaConteo` → `GrupoConteo` → sus cinco pantallas.
- **Catálogo ▸ Productos:** la tarjeta, la vista rápida y la tabla dibujan el mosaico en vez del tinte con percha
  (`ProductoPiezas.MiniaturaPrenda` y `ProductosGrilla`; se borraron su `IconoPercha` propio y `mezclar`). El prefijo y la familia los
  pega `app/(app)/productos/page.tsx` desde la lectura de `categorias` que ya hacía (sin consulta nueva): `fn_productos_listado` no
  los trae y no se tocó. El chip «Muestra — color» de la tarjeta se queda: sigue diciendo que eso no es la foto.
- **Apartados:** `apartados/piezas.FotoPrenda` (también la usa el buscador de Vender cuando una foto no carga) cae al mosaico en vez
  del ícono sobre el tono de la familia; ahora recibe `colorHex` y `categoria`. La página de Apartados no pasaba `colorHex` (Vender
  sí): se le agregó, o el negro salía pálido.
- **Inicio de Almacén:** `SinFoto`/`MosaicoPrenda` reemplazan a la blusa punteada (`PrendaSinFoto`, borrada con su CSS `ia-g`/`ia-sin`).
  «Reponer a piso hoy» lleva color y categoría de su prenda; «Nuevo en el catálogo» lee la categoría (`categoria:categorias(...)` en
  `getNuevosDelCatalogo`). Es una lista de PRODUCTOS, no de colores: solo pinta un color si el producto tiene uno solo
  (`colorUnico`); con varios cae al tono de su familia, porque pintar el primero afirmaría un color que el producto no tiene. La
  insignia «Sin foto» de sus tarjetas se queda: ahí lo que se busca es justo qué falta fotografiar.
- Los campos nuevos son opcionales: una fila armada sin ellos dibuja la percha sobre su color.

## Lo que sigue sin categoría ni color

Movimientos, Traslados, Cambios, Devoluciones, Compras, Resumen, Análisis y la tarjeta de «parecidas» del alta dibujan la percha sobre
un tono neutro (ya no el isotipo): sus cargadores traen la foto y a veces el color, pero no `categorias.prefijo`. Llevarlos es un cable
más por pantalla (Movimientos: cuatro estructuras en `lib/movimientos-cajon.ts`), no una decisión pendiente. La tarjeta de «parecidas»
queda neutra a propósito: es una candidata, no la prenda (ver su contrato).
