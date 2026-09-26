# Frescura del piso: documento para el equipo (2026-09-24)

`frescura-del-piso.html` se abre directo en el navegador. Está publicado como artifact privado en
https://claude.ai/artifact/4WVzFBpN6HBARyRKhCx9Bn: para que otros lo abran, Felipe tiene que compartirlo.

Es la propuesta que Felipe pidió para explicarles la idea del «mapa de calor del piso» a las encargadas de sede, a
dirección, a Benja (análisis) y a los programadores. Incluye perchero por sede, los tres relojes, la carrera de la
categoría con percentiles, un tablero simulado de un lunes, la matriz de Trujillo con su reporte, la escalera antes
de rebajar, espacio por temporada, tallas y tarjeta de marcas, un veredicto de si «da en el clavo» y un anexo técnico.

**Todas las cifras, prendas y marcas son simuladas.** Las decisiones están en `docs/adr/0208-frescura-del-piso.md`.
Los datos de la industria que cita pasaron por un verificador adversarial; lo que no se pudo confirmar quedó fuera.

**El anexo técnico quedó atrás en dos cosas (2026-09-25).** Sus 12 pasos ahora se construyen en siete bloques, uno a la
vez (ADR-0208, «Orden de construcción»). Y la lectura SQL propia que propone (`fn_frescura_piso`) ya no va: la pantalla
de Frescura se construirá encima del libro común de Inventario (`fn_ledger_puntos`, ADR-0202) y de sus cohortes FIFO
(ADR-0208, punto (d)). El documento no se reescribió: sirve para explicar la idea, no como plano.
