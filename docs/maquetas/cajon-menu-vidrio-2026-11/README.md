# Maqueta · el cajón del menú en el celular, con vidrio (2026-11-01)

Pieza de «1. El marco» del tablero `docs/vidrio/README.md` (ADR-0596): el lateral bajo 640 px (`components/AppShell.tsx`, `cajon-lateral`;
`globals.css`; `components/useLateralConElDedo.ts`). En escritorio el lateral ya es el Riel con gota elegido; en el celular faltaba su cara.

Abrir `index.html` (o con la config `maquetas`). Abre con el cajón abierto sobre Existencias, a 375 px (también 320 y 430). Se cierra
tocando lo de atrás, con la ✕ o **arrastrándolo con el mouse hacia la izquierda** (como el dedo); ≡ o «Abrir o cerrar el menú» lo abren.

## Lo que hay hoy

Un cajón de crema maciza de 18 rem con sombra grande, que entra desde la izquierda (420 ms; se va en 260) con su contenido en cascada
(45 ms), sobre un velo de sombra al 25 % con 2 px de desenfoque. Al arrastrarlo, el velo se aclara a la par.

## Las caras

| Pieza | Caras |
|---|---|
| Cajón | **A · Hoja con profundidad** (el Riel hecho hoja: asa, esmerila la pantalla y la aleja, como las hojas del celular de ADR-0479) · B · Panel que flota (isla de vidrio a 10 px de los bordes; lo de atrás quieto) |

En negrita, la recomendada. Lo que gana y lo que cuesta cada una, al pie de `index.html`. En las dos, el vidrio del cajón es más denso que
el del riel de escritorio (vidrio al 90→80 %, desenfoque de 30 px): tapa casi toda la pantalla y el menú tiene que leerse sobre cualquier prenda.

## Lo que no cambia

Lo que lleva adentro (logo, ✕, menú con la gota que viaja, firma, tu nombre con «Salir»), la cascada, los tiempos y las tres formas de
cerrarlo. Un toque en una fila sigue siendo un toque: el arrastre empieza recién pasados 6 px.

## Medido

En Chrome sin ventana: 18 combinaciones (320, 375 y 430; claro y oscuro; las tres caras), el cajón no se sale del aparato; sin errores de
JS. Arrastrar 40 px corre el cajón y aclara el velo al 87 %; pasado un tercio, se cierra; tocar «Producción» sigue abriendo su grupo.

## Lo que decidió Felipe

**A · Hoja con profundidad** (2026-11-01).
