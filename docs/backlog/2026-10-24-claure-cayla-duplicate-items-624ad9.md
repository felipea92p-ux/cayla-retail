# Backlog · CLAURE solo existe en Lima (2026-10-24, ADR-0505)

- [ ] Felipe: OK para pegar `20261024232000_empresa_solo_mueve_stock_en_sus_sedes.sql` en producción (una sola parte; la última línea dice «QUEDÓ BIEN»). La sonda del principio aborta si hubiera stock de CLAURE fuera de Lima (el 2026-10-24 había 0).
- [ ] Después de pegarla: refrescar el volcado (`pnpm datos:generar:produccion`) y abrir el PR con `/abrir-pr`.
- [ ] Felipe: avisar en Lima que una prenda de CLAURE se devuelve o se cambia solo en Lima (en Trujillo la base lo rechaza).
- [ ] Felipe: decidir si las 5 prendas de CLAURE que repiten una de CAYLA (Broana y Triana, de Marisol / Ivanana) se quedan como prendas aparte o se corrigen. Hoy no se tocan.
- [ ] «Editar la empresa» de una prenda (pendiente de ADR-0463): ya no puede dejar stock fuera (lo rechaza la base al cerrar); la pantalla tiene que decirlo antes.
- [ ] Por regularizar, Traslados y Proformas siguen leyendo el catálogo entero: no ofrecen CLAURE para mover, pero si alguien elige una fuera de Lima, el aviso viene de la base. Revisar si conviene filtrarlas.
