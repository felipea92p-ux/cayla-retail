# Maqueta · las pestañas de sección con vidrio (2026-10-31)

Pieza de «3. Las pantallas» del tablero `docs/vidrio/README.md` (ADR-0596): `<Pestanas>` (`components/ui/Pestanas.tsx`,
`app/estilos/pestanas-y-segmentos.css`), la pestaña de vista: lo que se toca para ir a OTRA parte de la misma pantalla.

Abrir `index.html` (o con la config `maquetas` del navegador integrado). Va sobre el marco y las piezas ya elegidas
(`../vidrio-base-2026-10/`). La barra negra elige la cara, la pantalla (Compras, con conteos que piden algo y que avisan un rechazo;
Finanzas, con seis pestañas con ícono, que en el teléfono no caben y se deslizan), el tema y el ancho (de 320 a 1920 px). Las pestañas
se tocan y se recorren con ← → Inicio Fin.

## Lo que hay hoy

- 35 archivos. Un vidrio al 45 % y una píldora de **tinta sólida** que se desliza bajo la elegida (450 ms); la palabra en versalitas de
  12 px; el conteo en su globito (ámbar si pide algo, rojo si avisa un rechazo, con texto para lector).
- Sobre el vidrio, la píldora negra maciza es lo único sólido de la pantalla, y en las hojas ya elegiste otra cosa para lo mismo (la gota
  de Mi perfil).

## Las caras

| Cara | Cómo es |
|---|---|
| Como ahora | Vidrio al 45 %, píldora de tinta sólida. |
| **A · La gota de Mi perfil** (elegida) | La fila es un pozo hundido; la elegida, una gota de vidrio claro que fluye: se estira hasta la nueva y se recoge en ella. |
| B · Vidrio ahumado | La fila es una placa de vidrio; la elegida, la píldora oscura de hoy hecha vidrio ahumado (como el botón primario). |
| C · La gota del menú | Sin caja; la elegida es la gota del menú lateral con su marca roja abajo. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

La vista en la URL o en el estado, las flechas, la elegida centrada si la fila no cabe, el conteo con su tono y su texto para lector, la
palabra en versalitas, el foco hacia adentro. La píldora de filtro y el segmento de modo son otras piezas del tablero.

## Reglas que respeta

Solo tokens, en claro y oscuro. Movimiento una vez por toque y sin rebote (el flujo de A son dos tramos: 220 ms que estiran y 300 ms
que recogen); todo se apaga con `prefers-reduced-motion`.

## Lo que decidió Felipe

**A · La gota de Mi perfil** (2026-10-31): la misma pestaña de las hojas en todo el ERP; la fila es un pozo hundido y la elegida una
gota de vidrio claro que fluye de una a otra.
