# 2026-11-15 · Fusionar: cada sede conserva su precio (ADR-0650, act. 2026-11-15)

- **Qué:** al fusionar, el precio propio de cada sede viaja a la ficha que queda (de fábrica) o se junta en uno; una terminal también elige. Migración
  `20261115153000`, `PreciosPorSede.tsx`, `preciosSedeParaLaBase` y su guía.
- **Verificado:** `tsc` limpio y 269 pruebas de la web (reglas, guías, unificar). La migración, en un Postgres local con todas las
  migraciones: `pruebas:fusionar-productos` 35/35, con 7 casos nuevos de precios por sede. El ensayo halló que, con dos precios propios distintos en una
  sede, la talla que se mudaba conservaba el suyo y la sede quedaba con dos precios para la misma prenda: ahora la prenda entera cobra lo de la ficha
  elegida (o la que queda). **No verificado:** la hoja en el navegador.
- **Riesgo:** ninguno en producción hasta pegar la migración; la web nueva funciona con la base de antes (no manda las claves si no hay sedes).
