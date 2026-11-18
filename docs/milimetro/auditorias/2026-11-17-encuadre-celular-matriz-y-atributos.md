# Auditoría al milímetro — Encuadre en el celular: matriz de Editar producto y barra de Atributos · 2026-11-17 · `claude/design-overflow-fix-6e1bfe`

Piezas: el selector de pestañas, la columna de la talla y la celda de Costos de la matriz (`components/ficha-producto/MatrizStockFicha.tsx`);
la barra del celular de las seis listas de Atributos y el grupo de lo desactivado (`components/atributos/kit.tsx`: `BarraAtributos`,
`GrupoDesactivado`). Sin piezas nuevas: `<Buscador>`, `<BotonFiltros soloIcono>`, `<Boton peso="primario">`, `<PaginacionLocal>`, `TituloGrupo`.

Medido: `/productos/categorias`, `/productos/atributos` (las seis pestañas) y `/productos/[id]/editar` ▸ «Variantes y precios», con el ERP
local contra Supabase local. 375×812 táctil en claro (estados, foco, espacio, tipografía); 350 px y tarjetas de 286 a 341 px para el
selector; 1440×900 en claro y oscuro (color, textos, movimiento vivo); 375 oscuro a ojo con una prenda de cuatro tallas. Los medidores se
corrieron enteros desde la propia web local (`fetch` + `eval`), el equivalente a pegarlos en `javascript_tool`.

Resumen: **0 graves · 0 medias · 0 leves abiertas** en lo que cambió. **2 medias propias corregidas** durante la auditoría.

## Graves
Ninguno.

## Medias
1. **Corregida — el selector cabía «justo» a 350 px.** Con 4 px de aire fijo por opción, las cuatro palabras ocupaban los 272 px del pozo
   exactos: 0 px de holgura si la letra tarda en cargar. Ahora el aire mínimo es 2 px y lo que sobra se reparte (`flex-auto`). Medido:
   tarjeta de 286 px → 7,1 px de aire por opción (versalitas a 0,06 em); 300 px → 5,1; 341 px → 15,3; desborde 0 en todas.
2. **Corregida — la fila de Costos crecía 3 px en escritorio** (55 contra 53 de las otras pestañas): cambiar de pestaña movía las filas.
   El crecimiento quedó solo para la tarjeta angosta. Medido a 1440: 53/53/53/53. A 375 táctil: 60 px y nada se monta sobre la fila de abajo.

## Leves
Ninguna.

## Lo medido en lo que cambió
- **Desborde:** 0 px en el selector, en la cabecera de la talla y en la página, en las cuatro pestañas, a 350 y 375 px. Con cuatro tallas la
  tabla se desliza de lado con el color fijo (a propósito: `minWidth` de la tabla).
- **Barra de Atributos a 375:** una fila de 44 px; buscador de 245 px; «+» de 44×44; 0 blancos bajo 44 px con el dedo; foco con anillo en
  3/3 controles; 0 valores fuera de la escala de 4 px.
- **Color:** 0 textos que fallen en claro y en oscuro (69 medidos en Editar producto).
- **Movimiento:** nada nuevo se anima salvo `anim-revelar` al abrir las píldoras (pieza del sistema); 0 bucles.
- **Guías:** `guias:recorrer` de `productos.categorias` (16 pasos) y `productos.atributos` (29) en verde a 375 y a 1440; el paso de filtros
  señala el ícono y el de agregar, el «+».

## Heredado (ya estaba; no se tocó)
- En la matriz, con el dedo: el lápiz y el tacho de un color miden 28 px, el tacho de una talla 24 px y la caja de costo 58×38. Pasan
  WCAG 2.5.8 (24 px), no los 44 px de `tacto.css`. Es una matriz densa.
- Las cajas de precio y de costo marcan el foco solo con el cambio de borde (`outline-none focus:border-taupe`): el medidor las da «sin anillo».
- «Aplicar» de «Cambiar en bloque» se apaga sin decir qué falta; la `caja-cayla` del stock con candado da 1,06:1 de borde (pieza decidida).
- Cifras sin tabulares de DM Sans y prefijos de 10,5 px (propuesta de `/tipografia`).

## Sin medir
- La paginación de 8 en la pantalla real: la base local tiene 2 categorías desactivadas. Se midió en un banco con 19 (3 páginas, la vista no
  salta al cambiar de página).
- Una talla de nombre largo («Estándar») en la pantalla real: la base local solo tiene «Única». Se midió en el banco (columna de 96 px, 0 desborde).
- `tema:auditar` y el estado de error.
