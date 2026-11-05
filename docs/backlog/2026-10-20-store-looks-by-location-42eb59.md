## 🧥 Looks de la tienda por tienda (2026-10-20, ADR-0468) — migración PEGADA en producción; rama `claude/store-looks-by-location-42eb59`

- [x] `fn_tienda_looks_json`: un look sale en una tienda solo si cada prenda, en su color, tiene algo libre ahí; sin tienda elegida = completo en alguna; sin tiendas en la web no se esconde nada.
- [x] `pnpm pruebas:vitrina-looks` 75/75 (sección «Por tienda» + mutante) y `pnpm pruebas:tienda-ficha` 48/48 contra el Postgres local; escenarios viejos ajustados con stock en las dos tiendas.
- [x] Web: «Arma tu look» dice «Por ahora no hay looks completos en Lima» y lleva a las tiendas que sí tienen.
- [x] **Migración `20261021010000` pegada en producción el 2026-10-20** (a pedido de Felipe); la función viva tiene el cuerpo nuevo y sigue siendo interna.
- [ ] **Los 2 looks encendidos hoy no se ven en ninguna tienda** (mezclan prendas de Trujillo y de Arequipa). El equipo los rearma por tienda o repone; decidir si los looks se crean «para una tienda» en el ERP.
- [ ] **Sin correr aquí:** `pruebas:tienda-probador` (el Postgres local no tiene las tablas de recortes); se ajustó su escenario del look y lo corre el CI. Ver la página en el navegador con datos reales de producción tampoco.
