# 2026-10-29 · Tráfico, más igual a la maqueta (rama trafico-como-la-maqueta)

- **Qué:** Felipe miró Tráfico ya publicado y pidió que se parezca a la maqueta. La primera parte pasó a una sola tarjeta (franja de cifras con su
  raya, gráfico con la leyenda junto al título, lectura sobre hueso); la línea chica de cada cifra salía cortada en tres pedazos (el truco de trazo
  de `Sparkline` se rompía al estirarla) y ahora es una sola línea con su área; se quitó «Gráfico / Tabla»; «Ver más» abre una hoja en prendas y
  en tallas; las tallas muestran 8 categorías con celdas más chicas; y el paso donde más gente se pierde se marca siempre, también con pocas personas.
  ADR-0568, actualización del 2026-10-29. Sin cambio en la base.
- **Verificado:** vitest de reglas 93/93, guías (huella aceptada, dos anclas sin paso quitadas), unificar, guía de foco, tokens, movimiento, hojas,
  tsc, eslint y knip; en el navegador (página temporal de datos inventados, ya borrada) a 1440 y 375 px: la franja, las dos hojas y el paso marcado
  con pocas personas. **Falta:** verlo con visitas reales en producción.
