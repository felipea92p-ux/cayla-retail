# Ficha al milímetro — El panel de un descuento

## 2026-11-17 · diseñar (rama `claude/ofertas-pending-branch-11c351`, actividad 2 de la maqueta `docs/maquetas/campanas-simple-2026-11/`)

Propósito: ver qué prendas tiene un descuento, a qué precio quedan y quitar las que ya no van.

Pieza del repo: **una composición**, casi toda de piezas que ya existen. Lo único nuevo es la cabecera (`.lc-panel-*`), copiada de la maqueta
elegida (`.pan-cab`, líneas 90–96), que la actividad 6 reusa para la campaña abierta.

| Parte | Pieza | Rama del árbol |
|---|---|---|
| El lugar | `aside.sl-detalle` (a la derecha) o `.sl-detalle-en-linea` bajo la fila (una columna) | la del pase abierto (ADR-0481) |
| La vuelta (una columna) | `<Volver onClick a="la lista">` | decidida (2026-10-06) |
| Quién lo hace | `<ComboResponsable enLinea>` | decidida (ADR-0161) |
| La grilla | `.lc-grilla` con la tarjeta `.sl-prenda` de la campaña (foto, nombre, dato) | la del pase abierto (ADR-0481) |
| La foto | `<FotoDePrenda>` (la prenda sin foto: su categoría sobre su color) | decidida (ADR-0333) |
| Quitar | `BotonQuitarFoto grande` + `area-dedo` (se dibuja de 28 px y se toca en 44) | la de las fotos de producto (perdonar antes que preguntar) |
| Bajo costo | `<Chip tono="ambar">` | decidida (2026-10-07) |
| Deshacer | `avisar.exito(…, { accion: { texto: "Deshacer" } })` | la del aviso (ADR-0146) |
| Vacío | `<Vacio tamano="chico">` | decidida (2026-10-08) |

## Espacio
- Cabecera: `flex-wrap`, alineada abajo, gap 16 × 24 px (maqueta). La grilla: columnas de 148 px como mínimo, gap 24 × 16, 32 px bajo la cabecera.
- A 375 px: dos columnas de 161 px; sin desplazamiento horizontal (medido).

## Tipografía
- Antetítulo: versalitas de 11 px, peso 600, `0.16em`, taupe. El %: serif 500, `clamp(48px, 5vw, 72px)`, interlineado 0,95, cifras tabulares.
- Cuántas: 15 px; la cifra, serif 600 de 26 px. Precio con descuento: 15 px peso 600; el de antes, 14 px tachado al 65 %.

## Color
- Solo tokens y las recetas de las piezas reusadas. Medido el 2026-11-17 con `color/medir.js`, 1440 × 900, panel abierto: **73 textos, 0 fallas, 0
  controles que fallan, en claro y en oscuro**.

## Estados
| Estado | Qué se ve | Cómo se mide |
|---|---|---|
| default | la grilla con sus prendas | captura 1440 y 375 |
| hover | la foto sube 4 px (la de `.sl-prenda`, en `@media (hover: hover)`) | `lib/hover-con-mouse.test.ts` |
| focus-visible | el anillo único en la × y en el combo | Tab en vivo |
| active | la × de `BotonQuitarFoto` | a ojo |
| selected | la fila abierta en la lista (`aria-current`); el panel no elige nada | — |
| disabled | la × se apaga mientras otra se quita o si falta quién lo hace (el combo lo dice) | en vivo |
| loading | «Leyendo sus prendas…» (`role="status"`); la que se quita sale corta (`lc-sale`, `--t-hoja`) | en vivo |
| error | `<Aviso tono="error">` si no se leen; `avisar.error` si no se quita | apagando la base |
| read-only | un descuento de todas las tiendas para quien no es líder: sin ×, con la nota «Sus prendas las cambia un líder» | cuenta integrante |
| vacío | «Todavía no hay prendas con −X %» | quitando la última |
| quieto | la cascada y la salida en 0,01 ms (ADR-0625); con menos movimiento pedido, la que sale queda al 40 % hasta irse | `data-movimiento="quieto"` |

## Movimiento
- Las prendas entran en cascada (`cayla-cascada`, `--t-momento`, 26 ms entre una y otra, tope en la 12). La que se quita sale con `lc-sale`
  (opacidad y escala 0,96, `--t-hoja`, `--ease-salida`). Sin rebote ni bucle.

## Texto
- «Descuento · Tienda Lima» (o «Todas las tiendas»), el %, «N prendas», y en cada prenda su nombre, su color (y sus tallas si no van todas) y los dos precios.
- Aviso: «Falda Renata sin −10 %» con «Deshacer»; al deshacer, «Falda Renata otra vez con −10 %».

## Accesibilidad
- 1.4.3 → medido (arriba). 2.5.8 → la × se toca en 44 px con el dedo. 4.1.2 → la × dice qué quita y de qué («Quitar Falda Renata Negro del −10 %»).

## Propuestas
Ninguna.
