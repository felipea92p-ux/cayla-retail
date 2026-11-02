# Maqueta · Catálogo ▸ Liquidación con vidrio (2026-11-02)

Una página entera de la sección 3 del tablero `docs/vidrio/README.md` (ADR-0596): Catálogo ▸ Liquidación (`app/(app)/productos/liquidacion` →
`components/liquidacion/`, ADR-0379).

Abrir `index.html` (o con la config `maquetas` del navegador integrado). La barra negra elige la cara de lo propio, el tema y el ancho (de 320
a 1920 px). Toca una fila (o «Una prenda con su etiqueta») para abrir su hoja; las cifras filtran.

Está armada **solo con lo ya elegido**: cabecera A, tarjetas de cifra A · Placa (la que filtra, hundida), tabla B · Placa Serena, buscador
A · Pozo con su ícono de barras, filtros A · Gotas con su cuenta, insignia A, la hoja Serena y botones gota (Retirar en rojo).

**La etiqueta no cambia:** es papel térmico (`EtiquetaLiquidacion`, `data-papel`), negro sobre blanco en los dos temas, con su franja
«LIQUIDACIÓN», su precio, su código y su QR. Lo que se elige es cómo se apoya sobre el vidrio de la hoja.

## Lo propio de Liquidación (con caras)

| Pieza | Cara | Cómo es |
|---|---|---|
| La etiqueta en la hoja (`.liq-previa`) | Como ahora | El papel con su sombra, apoyado sobre la hoja. |
| | **A · En su bandeja** (recomendada) | El papel descansa en un pozo de la hoja, como en la bandeja de la impresora; sombra corta. |
| | B · Colgada | Con su ojal y el hilo que la sostiene; sombra larga. |
| Las cifras chicas del celular (`.liq-cifra-chica`) | Como ahora | Tres botones de papel; el puesto, en arena. |
| | **A · Placas chicas** (recomendada) | Tres placas Serena; la puesta, hundida, como la tarjeta de cifra que filtra en escritorio. |
| | B · Ranura de tres | Las tres en un pozo; la puesta, gota clara. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

La etiqueta y su entrada (`liq-entra`, 360 ms), el precio tachado, el buscador que lee la pistola, los filtros con su cuenta, «+ Etiquetar una
prenda», el precio mínimo, Retirar (nunca se borra), Bajar el precio (sale una etiqueta nueva) e Imprimir.

## Reglas que respeta

Solo tokens (la etiqueta, papel fijo: `--crema-fija` y `--tinta-fija`). Claro y oscuro. Sin movimiento nuevo; todo se apaga con
`prefers-reduced-motion`. Datos inventados. Medida de 320 a 1920 px sin que nada se salga.

## Lo que decidió Felipe

Pendiente.
