# Auditoría al milímetro — Vender: la cámara del celular dice qué pasó con cada lectura · 2026-11-25 · `ccr-ec1276e8-vcf6ru`

Medido: la bandeja y el visor de `components/EscanerCamara.tsx` en `/vender`, con una cámara simulada de Chromium (`--use-file-for-fake-video-capture`,
un video con las etiquetas QR reales del seed), a 375 × 812 con dedo, claro y oscuro, animaciones apagadas (lo de fábrica). Medidores del repo
(`milimetro`, `espacio`, `tipografia`, `color`, `textos`) cargados enteros en la página, con la bandeja como raíz. Base local con el seed, cuenta
de integrante en Tienda Trujillo.

Resumen: **0 graves · 0 medias · 0 leves de esta rama** (la segunda línea de la fila subió de 13 a 14 px durante la auditoría) · 1 heredado.

## Lo que cambió y cómo se midió

1. **Una lectura, una prenda.** Antes, una etiqueta sostenida 2,5 s entraba dos veces (S/ 319.80 por una casaca). Después, quieta 12 s: una vez.
2. **Se ve que se leyó:** esquinas del visor en verde o ámbar 1,6 s (color, no movimiento) y la fila más nueva con fondo de su tono y su ✓ (24 px).
3. **«van 2»** en la fila de la segunda de una prenda, y su sonido: 660 + 660 Hz (medido con un espía sobre `OscillatorNode.start`), contra 1760 Hz
   de la primera y 330 Hz de lo que no entró.
4. **«Agregar»** en la fila del almacén: 90 × 44 px; abre la hoja de la bajada encima de la cámara (2 hojas), que no lee mientras tanto.

## Lo que dijeron los medidores (375, bandeja con una lectura del almacén y una que entró)

| Medidor | Claro | Oscuro |
|---|---|---|
| Espacio | 0 blancos bajo 24 ni bajo 44 con dedo, 0 fuera de escala | — |
| Tipografía | 0 lectura bajo 14 px (era 1: la segunda línea en 13 px; pasó a `text-detalle`) | — |
| Color | 1 falla: el interruptor «Existencias» sobre el video (heredado: el medidor lo compara contra la imagen) | 2, las dos del mismo interruptor |
| Estados | 0 apagados, 0 errores, 0 sin etiqueta | — |
| Textos | lo que marca es de la pantalla de atrás (montos, «Prenda sin registrar»), no de la bandeja | — |

## Caos (a mano, local)

Cancelar la hoja de la bajada: la cámara sigue, la fila sigue con «Agregar», la etiqueta quieta no se relee, 0 filas. Red caída: aviso «Se cortó la
conexión…», la fila sigue con «Agregar», ticket en 0, 0 filas en `movimientos`. La bajada que entra: 1 fila, firmada por quien atiende.

## Capturas (375 × 812)

[antes: la misma etiqueta, dos veces](2026-11-25-vender-camara-lecturas/1-antes-dos-veces.jpg) ·
[«van 2»](2026-11-25-vender-camara-lecturas/2-despues-van-2.jpg) ·
[el almacén con «Agregar»](2026-11-25-vender-camara-lecturas/3-despues-almacen-agregar.jpg) ·
[la hoja encima de la cámara](2026-11-25-vender-camara-lecturas/4-despues-hoja-encima.jpg) ·
[entró](2026-11-25-vender-camara-lecturas/5-despues-entro.jpg) ·
[oscuro](2026-11-25-vender-camara-lecturas/6-despues-oscuro.jpg)
