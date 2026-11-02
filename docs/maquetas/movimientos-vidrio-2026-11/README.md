# Maqueta · Inventario ▸ Movimientos con vidrio (2026-11-02)

Una página entera de la sección 3 del tablero `docs/vidrio/README.md` (ADR-0596): Inventario ▸ Movimientos (`app/(app)/inventario/movimientos`
→ `MovimientosLista`, `FilaMovimiento`, `components/movimientos/`; ADR-0353, la opción A · Ruta).

Los sellos de cada tipo son **diseño propio, con su movimiento**: la bolsa que sube, el perchero que se mece una vez, la tapa del almacén, el
paquete que cae, el camión que llega… El 2026-11-02 Felipe pidió tocar esta página. Como en Traslados, **el movimiento no cambia**: está
copiado tal cual de `estilos/movimientos-sellos.css` y solo cambia el material.

Abrir `index.html` (o con la config `maquetas` del navegador integrado). La barra negra elige la cara de lo propio, el tema y el ancho (de 320 a
1920 px). Pasa el mouse por una fila o por un tipo, o usa «Repetir los sellos», para ver el movimiento. Al tocar un tipo, la lista se filtra.

Lo ya elegido que usa: cabecera A, pestañas A · La gota de Mi perfil, buscador A · Pozo, filtros A · Gotas, placas Serena y botones gota.

## Lo propio de Movimientos (con caras)

| Pieza | Cara | Cómo es |
|---|---|---|
| El sello y su fila | Como ahora | Sello: cuadrado de papel teñido del tipo, con su aro. Lugares: píldoras de hueso. Riel: una raya arena. |
| | **A · Lente del tono** (recomendada) | El sello, una lente teñida del tipo con su luz (como la insignia elegida); los lugares, gotas claras; el riel, una ranura. |
| | B · Pozo del tono | El sello, tallado en el vidrio: un pozo teñido del tipo. |
| Las tarjetas de los tipos | Como ahora | Papel con borde arena; la elegida se tiñe del tipo. |
| | **A · Placas con su tono** (recomendada) | Placas claras; la elegida, teñida de su tipo con su filo. |
| | B · Lentes del tono | Todas teñidas de su tipo, como un muestrario. |

El día pasa en las dos caras de una franja hueso a una ranura fina, con su franja de colores igual. Lo que gana y lo que cuesta cada cara, al
pie de `index.html`.

## Lo que no cambia

Todo el movimiento de ADR-0353, los colores de cada tipo, el borde punteado de lo hecho a mano (ajuste, conteo), el orden de la pantalla, los
filtros y la columna de los tipos que acompaña al bajar (en el celular, una fila que se desliza arriba de la lista).

## Reglas que respeta

Solo tokens. Claro y oscuro. Ningún movimiento nuevo; todo se apaga con `prefers-reduced-motion`. Datos inventados. Medida de 320 a 1920 px
sin que nada se salga. En la maqueta, `marco.css` ya usa `.uni`, así que aquí se llama `.mv-uni`.

## Lo que decidió Felipe

**2026-11-02: tocar Movimientos con el mismo movimiento de los sellos.** Las caras, pendientes.
