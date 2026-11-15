# Fusionar: cada sede conserva su precio

- [x] Ensayar `20261115153000` (2026-11-15, Postgres local con las 1208 migraciones: se aplica y se repega sin efecto). El ensayo encontró que una sede
  con conflicto quedaba con dos precios para la misma prenda; corregido en la misma migración.
- [x] `20261115153000` pegada en producción (2026-11-15) y verificada en vivo.
- [ ] Mirar la hoja «Fusionar» en el navegador (escritorio, 375 px, claro y oscuro) y `/chaos` (guarda).
- [x] Prueba `pruebas:fusionar-productos`: casos 29-35 de precios por sede (35/35 en verde).
- [ ] Reservar el número de migración (`pnpm reservar migracion` dio 403 desde la nube).
