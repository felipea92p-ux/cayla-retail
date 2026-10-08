# 2026-10-08 · Frescura del piso: la fórmula verificada, cuatro decisiones y el arranque de la construcción

- **Qué hice:** antes de tocar nada, `/explica` de la fórmula (Kaplan-Meier por categoría × tienda, reloj de novedad,
  rapidez contra la categoría sin ella) y una verificación **ejecutando las reglas reales**: con 3 ventas rápidas en una
  categoría, una capa de 4 días colgada sale «Se está quedando» y «Por decidir» (la captura de TRU del 2026-10-07,
  exacta); juzgada contra una vara de 30 ventas, «Recién llegada». Felipe decidió en 4 preguntas: medida relativa como
  hoy, vara CAYLA de respaldo con menos de 10 ventas, pantalla de dos niveles, y el mix en su propio submódulo (Plan del
  piso, PR #831). Actividad 0: rama al día con `origin/main` (`4613b0d53`) y actualización 2026-10-07 del ADR-0208.
- **Por qué así:** la fórmula es la correcta; lo inadecuado es que juzga con la misma firmeza con 3 ventas que con 30, y
  el único freno que existe (`RAPIDEZ_MIN_EVIDENCIA = 1`) deja pasar 1 de cada 3 «lentas» falsas por azar. Verificar
  ejecutando costó 7 pruebas; inferirlo me había dado una hipótesis equivocada en el detalle (creí que bastaban 2 ventas;
  hacen falta 3 para que la rapidez tenga dato).
- **Felipe se lleva:** el estado de Frescura no mide días: mide la posición de la prenda contra una curva que con 3
  ventas es un acantilado (P50 = 1 día, P75 = 2). La pregunta que ya puede hacer: «¿cuántas vendió el resto de la
  categoría y en cuántos días, para que el P75 quede en 2?».
