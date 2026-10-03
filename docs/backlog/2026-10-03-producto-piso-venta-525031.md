# Backlog — Nuevo producto al piso sin Existencias (2026-10-03)

- [ ] Pegar `20261004000000_carga_inicial_al_piso_sin_existencias.sql` en producción, DESPUÉS de `20261002120000` y ANTES de fusionar (pide OK de Felipe).
- [x] Recibir mercadería con ese módulo solo: el lateral decía «Inventario» (la hija sola toma el nombre del grupo); ahora dice «Recibir mercadería» (`conservaNombre` en `lib/menu.ts`). No había dependencia con Facturas de compra en la base ni en el layout.
