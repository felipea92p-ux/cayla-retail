## Probador: la unión por pretina, más rápida y con aviso (ADR-0449, actualización 2026-10-18)

- La medida baja una copia de 256 px (3–27 kB) en vez del PNG entero, se recuerda en el navegador y se adelanta para las prendas vecinas; si tarda más de 180 ms, la prenda de abajo se atenúa y dice «Ajustando la prenda…».
- Verificado: `tsc`, `eslint` y las 605 pruebas de la tienda; medidas de la copia AVIF/WebP iguales a las del PNG en 8 prendas reales. No probado con sesión real ni en celular.
