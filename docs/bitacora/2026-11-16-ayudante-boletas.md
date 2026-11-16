# 2026-11-16 · Boletas por el ayudante de la Mac y el Chrome de siempre (ADR-0670, act. b)

- **Qué:** el ayudante de la Mac (v3) también imprime la boleta en la ticketera, a su largo exacto y sin cuadro, desde el Chrome de
  siempre; todo ticket del ERP pasa por `imprimirBoleta`. En Windows, el Chrome de siempre lleva `--kiosk-printing`. Guía «Impresión en
  Trujillo» reescrita: sin íconos nuevos. El instalador dice qué impresora encontró.
- **Por qué:** Felipe: los íconos aparte confunden y cada computadora tiene una sola impresora.
- **Verificado:** pruebas del ayudante (13/13, con la boleta de 80 × 150 mm), vitest completo, Knip; en el navegador, una boleta real a
  una copia del ayudante con `lp` falsa → una hoja de 80 × 186 mm, centrada; con el ayudante caído, aviso y cuadro. Sin papel real.
