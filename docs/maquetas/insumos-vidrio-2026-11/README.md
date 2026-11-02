# Maqueta · Producción ▸ Insumos (telas y avíos) con vidrio (2026-11-02)

Una página entera de la sección 3 del tablero `docs/vidrio/README.md` (ADR-0596): Producción ▸ Insumos (`app/(app)/produccion/insumos` →
`components/InsumosPanel.tsx`, ADR-0133).

Abrir `index.html` (o con la config `maquetas` del navegador integrado). La barra negra elige la cara de lo propio, el tema y el ancho (de 320
a 1920 px). Toca una fila para abrirla con sus lotes; «Nueva tela con Existe también» abre la hoja.

Está armada **solo con lo ya elegido**: cabecera A con sus gotas, tarjetas de cifra A · Placa, títulos de sección y de grupo con su globito,
barra de avance A · Tubo (con la marca del mínimo y el color del estado), insignia A, lápiz en gota, enlaces, la hoja Serena con campos
hundidos y el combo, y botones gota.

**«Existe también» en «Nueva tela»** (ADR-0576): al crear un tejido desde su combo, la pregunta sale **antes** de crearlo, dentro de la hoja, y
«Guardar la tela» espera el «Usar Popelina» o el «No, es otro tejido» (`useTejidosDeLaTela`, `preguntaPendiente`). Su cara es el aviso ya
elegido (B · Lente, en ámbar): no tiene caras propias.

## Lo propio de Insumos (con caras)

| Pieza | Cara | Cómo es |
|---|---|---|
| La fila de un insumo (`FilaInsumo`) | Como ahora | Cada color, una tarjeta de papel suelta bajo el título de su tela; se abre con sus lotes. |
| | **A · Una placa por tela** (elegida) | Los colores de una tela en UNA placa Serena, una fila por color; la que abres se hunde en un pozo con sus lotes. |
| | B · Placas sueltas | Cada color, su placa; los lotes, en un pozo dentro. |
| El libro de movimientos | Como ahora | Tarjeta de papel, una línea por movimiento, lo que entra en verde. |
| | **A · Placa con filas** (elegida) | La placa Serena, una fila por movimiento; lo que entra, en una lente verde. |
| | B · Libro hundido | Un pozo con un riel que une los movimientos. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

Lo que dice cada fila, la barra del saldo con su mínimo y su color por estado, el saldo que cuenta, el acordeón (por `grid-template-rows`) y sus
lotes con «1º», el lápiz de un ingreso, los títulos de cada tela con «+ Agregar colores», el capital que se pide con un toque, el libro que solo
se agrega, y todo «Existe también».

## Reglas que respeta

Solo tokens (el color de una tela es dato, `data-color-dato`). Claro y oscuro. Sin movimiento nuevo; todo se apaga con
`prefers-reduced-motion`. Datos inventados. Medida de 320 a 1920 px sin que nada se salga. En la maqueta, `marco.css` ya usa `.grupo` y
`.entra`, así que aquí se llaman `.in-grupo` e `.in-entra`.

## Lo que decidió Felipe

**2026-11-02: las recomendadas, la fila A · Una placa por tela y el libro A · Placa con filas.** Al implementar:
- `InsumosPanel`: los `FilaInsumo` de una misma tela (y de un mismo avío) van dentro de UNA placa Serena (esquinas de 22 px, `overflow-hidden`)
  bajo su `TituloGrupo`, que queda afuera como hoy. Cada `FilaInsumo` deja de ser `card-cayla`: es una fila, con una raya de tinta al 8 % entre
  filas y, al pasar el mouse, tinta al 3 %. La fila **abierta** se hunde: margen de 6 px, esquinas de 16 px, tinta al 4 % con su sombra adentro
  (en oscuro, sombra al 26 %); la raya sobre sus lotes, tinta al 8 % (no `border-sand`). El acordeón por `grid-template-rows`, la barra del
  saldo, el estado, el saldo que cuenta y los lotes con «1º» no cambian.
- El libro de movimientos: de `card-cayla` a la placa Serena; las rayas entre movimientos, tinta al 8 %; la cantidad de lo que entra, una lente
  verde (el verde al 6→14 % sobre vidrio, filo al 28 %, píldora); la de lo que sale, una píldora de tinta al 6 %.
- «Nueva tela» con «Existe también» no cambia (ya usa el aviso lente elegido).
