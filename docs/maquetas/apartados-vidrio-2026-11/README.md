# Maqueta · Ventas ▸ Apartados con vidrio (2026-11-02)

Una página entera de la sección 3 del tablero `docs/vidrio/README.md` (ADR-0596): Ventas ▸ Apartados (`app/(app)/vender/apartados` →
`components/apartados/ApartadosPanel.tsx`, con sus tres vistas: Apartar, Entregar y Todos).

Abrir `index.html` (o con la config `maquetas` del navegador integrado). La barra negra elige la vista, la cara de lo propio, el tema y el ancho
(de 320 a 1920 px). Todo se toca: las pestañas (arriba en escritorio, abajo en el celular), «Entregar» en una fila y las casillas.

Está armada **solo con lo ya elegido**: tarjetas de cifra A · Placa, aviso B · Lente, filtros A · Gotas, buscador A · Pozo, títulos de sección
con su globito, avatar A · Placa (en lente), insignia A · Lente de color («Vencida» con su punto que late), pestañas A · La gota de Mi perfil,
íconos de fila A · Gota al pasar, casilla A, botones gota. La prenda va en su **miniatura de hoy**: la tarjeta de Productos todavía no tiene
distribución elegida. La barra del plazo (los 9 tramos) queda con lo que falta hundido, lo pasado en taupe, hoy en tinta y la gracia en rojo.

## Lo propio de Apartados (con caras)

| Pieza | Cara | Cómo es |
|---|---|---|
| La hoja que encierra las tres vistas | Como ahora | Una hoja de papel macizo de borde a borde, con su cabecera («Apartados · sede», las pestañas, «Opciones»). |
| | **A · Al aire** (recomendada) | Como la mesa de Vender elegida: sin la hoja; la cabecera es una fila plana y lo de adentro son placas sobre el lienzo. |
| | B · Placa | La hoja pasa a ser una placa Serena grande, con su cabecera separada por una ranura. |
| Las pestañas del celular | Como ahora | Franja de papel fija abajo, de borde a borde. |
| | **A · Isla de pestañas** (recomendada) | Una isla de vidrio que flota a 12 px de los bordes, con la gota clara que viaja a la elegida. |
| | B · Franja de vidrio | Pegada al borde, como hoy, pero de vidrio y con la gota. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Celular (PL-105)

Medida a 375 px en los dos temas, en las tres vistas y con las tres caras de cada pieza, sin que nada se salga. Hay dos capturas en esta
carpeta: `captura-375-todos.png` y `captura-375-entregar.png`.

## Lo que no cambia

Las tres vistas y su orden, los estados de un apartado, la barra del plazo con su gracia, «Escribirle por WhatsApp», reimprimir, aplazar, el
saldo y su cobro, las opciones del líder y, en el celular, las pestañas abajo.

## Reglas que respeta

Solo tokens; los colores de las prendas son dato. Claro y oscuro. Sin movimiento nuevo; todo se apaga con `prefers-reduced-motion`. Datos
inventados.

## Lo que decidió Felipe

Pendiente.
