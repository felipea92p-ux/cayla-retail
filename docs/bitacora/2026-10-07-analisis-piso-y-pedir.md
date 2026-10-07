## 2026-10-07 (Análisis: el mouse sobre una cinta ya no corre la otra etiqueta en Safari — ADR-0357)
Qué hice: en «Qué hacer hoy», la marca de prendas de cada etiqueta (`data-ps`) pasó del `div` de adentro del `foreignObject` a un `<g>` que
lo envuelve (`PestanaHoy.tsx`, `Etiqueta`). Así el atenuado de los otros caminos lo pinta el SVG y no una capa de HTML.
Por qué así: Felipe vio que con el mouse sobre «Compra» la etiqueta de «Liquidar» saltaba encima de «Tu tienda», y al revés. Safari dibuja
sin la escala del dibujo una capa de HTML (la opacidad crea una) dentro de un `foreignObject`: solo se nota cuando el flujo se agranda en una
pantalla ancha. Reproducido con el motor de Safari a 1800 px. Con la opacidad en el `foreignObject` mismo, Safari no la dibujaba; en el `<g>`,
sí y en su sitio. Verificado también en Chrome con el mouse real.
Qué sigue: el diseño de «¿Qué no ha salido al piso?» y de un «¿Qué pedir?» que diga sus 30 días (artifact aparte, espera la elección de Felipe).
