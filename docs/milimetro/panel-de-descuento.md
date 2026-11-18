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

## 2026-11-17 · actividad 3: agregar

| Parte | Pieza | Rama del árbol |
|---|---|---|
| El buscador | `<Buscador icono="barras" atajo guia="rebaja.agregar">` (busca mientras se escribe; la pistola termina en Enter y busca al instante) | decidida (2026-10-08) |
| Lo que sugiere por nombre | `<ListaSugerencias>` con `<MiniaturaPrenda>`: un modelo en su color, el precio con el % a la derecha o «Ya está» | decidida (2026-10-13) |
| La prenda escaneada | una placa (`--placa-*`, «lo que explica es plano», ADR-0596) con su miniatura, los dos precios, `<Chip>` de lo que tiene hoy («Hoy: −10 %»), «La caja cobra −X %» si otra campaña le da más, «Bajo costo» | piezas decididas en una receta |
| La pregunta | `<Boton>` «Solo esta» y «Todo el modelo · N colores»; la última respuesta va en `primario` y es la que repite Enter | decidida (2026-10-07) |

- **Medido** (375 × 812, 2026-11-17): la tarjeta mide 339 px; los botones se apilan (305 px cada uno) bajo 26 rem de tarjeta y van lado a lado desde ahí
  (`@container`), sin cortar «Todo el modelo · 2 colores».
- **Estados:** loading → «Agregando…» en el botón elegido (`<Boton cargando>`), el buscador sigue escribiendo y el Enter espera; tras agregar, el foco vuelve
  al buscador (escanear seguido). error → `avisar.error` con lo que dijo la base. Escape borra lo escrito o cierra la pregunta (y no sube).
- **Deshacer:** antes de agregar se lee dónde estaba cada talla (`campanas_rebaja_de_variantes`); «Deshacer» la devuelve a ese lugar o la deja sin %.

## 2026-11-17 · actividad 4: nuevo, cambiar el % y desactivar

| Parte | Pieza | Rama del árbol |
|---|---|---|
| «Nuevo descuento» | la fila de la lista punteada (`.lc-fila-nuevo`, maqueta `.it.nuevo`): borde de tinta al 25 %, sin relleno, 60 px | la fila de esta ficha |
| La hoja | `<Modal>` (Serena; en el celular, la hoja de abajo con asa) con `<PasoCantidad sufijo="%">`, `pildora-cayla[aria-pressed]` para los % a un toque, `<Interruptor>` «En todas las tiendas» (solo líder), `<Aviso tono="info" chico>` «Ya existe», `<ComboResponsable>`, `<PieGuia>` y `<Boton confirma={guia}>` en `pie-hoja-fijo` + `pie-acciones` | decididas |
| El menú | `<MenuAcciones texto="Más">` en la cabecera del panel: «Cambiar el %», «Imprimir etiquetas», «Desactivar −X %» (`peligro`) | decidida (2026-10-15) |

- **Texto del botón** según lo que pasará (`textoDeLaHojaDeDescuento`): «Crear −25 %», «Abrir −10 %», «Cambiar a −12 %», «Juntar en −20 %».
- **Enter:** la hoja lleva `enterNoGuarda` (un Enter en la caja del % no crea ni cambia nada).
- **Avisos y refresco:** lo que cambia la lista (crear, cambiar, desactivar y sus «Deshacer») refresca dentro de una transición y el aviso sale al terminar; si
  saliera antes, el refresco lo retiraría por visto con su «Deshacer» (medido el 2026-11-17).
- **Medido** (375 × 812): la hoja cabe sin desplazamiento lateral; a 1440, centrada en 448 px.
