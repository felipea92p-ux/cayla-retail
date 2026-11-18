# 2026-11-05 — Lo que dejó la prueba en Safari de iPhone

- **El pie de una hoja corta en un teléfono chico.** En Safari a 375 × 667, con un campo enfocado, «Anular venta» termina en 564 px y Safari deja ver 547: el botón queda 17 px bajo su barra (se puede tocar). La hoja termina en la altura de la página, no en lo visible (`visualViewport`). Las hojas con `pie-hoja-fijo` no lo sufren: «Registrar cliente» se ve entero. No se tocó. Falta medir cuántas hojas lo tienen.
- **Probar en un iPhone en la mano.** Se probó en el simulador, con gestos por software: el motor es el de Safari, pero no el dedo ni la barra real al desplazarse.
- El teclado del simulador escribe mal la «@» con la distribución en español. Para una prueba local hizo falta una entrada temporal, que no se versionó.
- Al `@import`-ar un CSS nuevo o tocar `@theme` en `globals.css`, Turbopack puede seguir sirviendo lo viejo aunque se reinicie: hay que borrar `apps/web/.next`. Costó una medición falsa.
