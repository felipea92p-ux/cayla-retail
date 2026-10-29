# 2026-10-29 · Tráfico, un color por camino (rama trafico-colores-de-camino)

- **Qué:** Felipe preguntó por qué «De dónde vienen ▸ Por camino» no era igual a la maqueta: al construirlo había dejado los caminos sin color
  (decisión abierta del backlog del Observatorio, que no se le preguntó). Ahora cada camino tiene su color de DATO, con nombre propio
  (`--color-camino-instagram`, `-directo`, `-whatsapp`, `-tiktok`, `-google`, `-qr`, `-otros`) en `globals.css`, el oscuro de `tema.css` y
  `.papel-fijo`, con los tonos de la maqueta; el punto y la barra de cada fila lo usan (`colorDeCamino`, la barra es `BarraApilada` de un tramo
  contra el mayor), y la píldora de «separan» lleva su puntito (el `Chip` de siempre). Sin cambio en la base.
- **Verificado:** `tema-tokens` 138/138 (los tres bloques coinciden), `tema-colores`, `unificar`, `guias`, vitest de reglas, tsc, eslint y knip; en
  el navegador (página temporal, ya borrada) en claro y en oscuro.
