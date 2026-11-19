# Ocho mejoras, antes y después — lámina (2026-11-19)

Felipe pidió ver, antes de decidir, las ocho mejoras de estética que le recomendé. Esta carpeta es esa lámina: se elige mirando.

- `index.html`: la lámina. Se abre servida en local (`python3 -m http.server 4877 --directory docs/maquetas` y luego
  `http://127.0.0.1:4877/ocho-mejoras-2026-11/`). Tiene claro y oscuro, un comparador que se desliza y, en cada mejora, «Sí · Después · No».
- `capturas/`: el ERP local antes y después. Cada «después» es el ERP real con una regla inyectada en la página; no cambia el código.
- `capturar.mjs`: el guion que sacó las capturas. Solo local.

## Lo que se midió (ERP local, 1440×900, Chrome de prueba)

| Qué | Dato |
|---|---|
| Fotos con fondo claro, a la vista en Productos | 11 de 18 |
| Fotos con fondo claro, a la vista en Existencias | 7 de 12 |
| Ancho de «1111» y de «0000» en DM Sans a 40 px, con `tabular-nums` | 49,92 px y 109,45 px |
| Archivos de `app` y `components` que piden `tabular-nums` | 445 |
| Tamaños de letra distintos en ocho pantallas | 28 (entre 13 y 19 por pantalla) |
| Radios de esquina distintos, sin contar píldoras | 12 |
| Existencias, llevada a la escala cerrada | de 16 tamaños a 7 y de 12 radios a 4 |
| Piezas que cambió «superficie sólida» | Compras: 4 tarjetas y 1 tabla. Existencias: 1 resumen y 15 tarjetas |

## Lo que cambió al mirar las capturas

- **Fotos.** La primera idea era fundir el blanco de toda foto con un tono neutro (`mix-blend-mode: multiply`). Al capturarla se vio
  que apagaba las prendas blancas y que la mayoría de las fotos ya está recortada. La mejora quedó en recortar las que faltan. El
  «después» simula ese recorte volviendo transparente el tono de fondo de cada foto: es una simulación, con algún filo claro.
- **Superficies sólidas.** Las tarjetas y las tablas ya son casi sólidas (entre 66 y 86 % de blanco). El cambio casi no se ve.
- **Escala cerrada.** En una pantalla suelta casi no se nota.

## Lo que no se verificó

- Las demos de movimiento se probaron en Chrome. En otro navegador, la lámina avisa si no puede animar.
- La de gama amplia depende de la pantalla: en una captura no se puede ver.
- Los conteos son de las pantallas capturadas, no de todo el ERP.
