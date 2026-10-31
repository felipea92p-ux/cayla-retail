## 🧪 Pruebas de Claurè que fallaban de madrugada (2026-10-31)

- **Qué pasó:** `claure-cierre`, `claure-igv` y `claure-proyeccion` sembraban la venta de «hoy» con `now() - interval '2 hours'`. Entre las 00:00 y las 02:00 de Lima esa venta
  cae en el día anterior y todo lo que suma «hoy» sale mal. El CI de las 05:00 UTC las ponía en rojo en cualquier PR (#1511, 2026-10-31), sin que nada estuviera roto.
- **Qué se hizo:** la siembra parte del mediodía de hoy en Lima (`scripts/pruebas/_hora_de_lima.mjs`). No cambia la base ni lo que se comprueba.
- **Cómo se probó:** con un reloj falso solo para la siembra (un `now()` de mentira delante en el `search_path`): a las 00:30 la versión vieja da 11 fallas y la nueva
  0; a las 00:00:01, 01:45, 02:59 y 23:59 la nueva pasa entera. Sin reloj falso, a las 08:25, las tres pasan.
