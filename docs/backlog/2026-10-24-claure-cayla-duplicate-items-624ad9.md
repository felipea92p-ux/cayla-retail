# Backlog · CLAURE solo existe en Lima (2026-10-24, ADR-0505)

- [x] `20261024232000` pegada en producción el 2026-10-24 con el OK de Felipe (versión `20261024233234`), verificada con una prueba que se deshace sola.
- [ ] Refrescar el volcado (`pnpm datos:generar:produccion`): la migración no suma tablas, solo dos funciones y dos disparadores.
- [ ] Fusionar la web (PR abierto con `/abrir-pr`): hasta entonces Trujillo sigue VIENDO las prendas de CLAURE, aunque ya no puede moverlas.
- [ ] Felipe: avisar en Lima que una prenda de CLAURE se devuelve o se cambia solo en Lima (en Trujillo la base lo rechaza).
- [ ] Felipe: decidir si las 5 prendas de CLAURE que repiten una de CAYLA (Broana y Triana, de Marisol / Ivanana) se quedan como prendas aparte o se corrigen. Hoy no se tocan.
- [ ] «Editar la empresa» de una prenda (pendiente de ADR-0463): ya no puede dejar stock fuera (lo rechaza la base al cerrar); la pantalla tiene que decirlo antes.
- [ ] Por regularizar, Traslados y Proformas siguen leyendo el catálogo entero: no ofrecen CLAURE para mover, pero si alguien elige una fuera de Lima, el aviso viene de la base. Revisar si conviene filtrarlas.
