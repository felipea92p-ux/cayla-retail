# Auditoría al milímetro — el «+N» de la chapa de Existencias · 2026-11-18 · `claude/recursing-cori-c95115`

Medido: 1440×900 claro con mouse · 375×812 claro con puntero táctil. Servidor: `localhost:3013` contra la base local (Tienda Lima, Blusa Satina:
6 colores, la chapa muestra 3 y «+3»). Medidor: la sección «blancos de puntero» de `.claude/skills/espacio/referencia/medir.js` (WCAG 2.5.8 con el
`::after` y la excepción de separación).
Alcance: solo `button.vitrina-mas-colores`, el heredado de main que anotó `2026-11-18-funcionalidad-sin-cambiar-diseno.md` (22,4×16 px, dentro de
otro blanco: la tarjeta entera abre lo mismo).

Resumen: **0 graves · 0 medias · 0 leves** · el «+N» pasa de 22,4×16 a 24×24 con mouse sin cambiar su dibujo, y con el dedo se dibuja de 44×44 como los puntos de al lado (Felipe 2026-11-18).

## Lo que se midió

| Ancho | Puntero | Antes | Después | Blancos de la pantalla bajo el mínimo |
|---|---|---|---|---|
| 1440 | mouse | 22,4×16 · falla 2.5.8 | 24×24 (área invisible; el dibujo sigue de 22,4×16) | 0 bajo 24 |
| 375 | dedo | 22,4×16 | 44×44 dibujado (los tres puntos también 44×44; la chapa de 96 px se desliza) | 0 bajo 44 en las chapas |

Comprobado a mano: con mouse, un clic 3 px por encima del dibujo del «+3» abre la ficha de la prenda (el área funciona, no solo se mide).

## Lo decidido

- **Con mouse, área invisible de 24 px** (`.vitrina-mas-colores::after` en `app/estilos/existencias-vitrina.css`): cabe en el relleno de 5 px de la
  chapa. Va después del último punto en el DOM, así que donde roza el área de 6 px de ese punto gana el «+N»: lo mismo que ya pasaba entre puntos.
- **Con el dedo, se dibuja de 44** (`app/estilos/tacto.css`): Felipe eligió mirando las dos opciones. Un área invisible de 44 sobre un dibujo de 22 pisaba
  al punto vecino (4 px de hueco): tocar el borde del punto abría la ficha en vez de elegir el color.
