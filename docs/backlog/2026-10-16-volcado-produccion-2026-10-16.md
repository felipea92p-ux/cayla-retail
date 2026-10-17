## 🗂️ El volcado de producción al día (2026-10-16) — rama `claude/volcado-produccion-2026-10-16`

- [x] **Volcado refrescado por diferencia:** 256 grupos nuevos o cambiados y 1 quitado (`unir_clientas`, que borró `20261015054000`). Las 1532 huellas coinciden con producción.
- [x] **Pájaro para las 21 tablas nuevas:** Pelícano 3, Colibrí 15 y Loro 3. El reparto de la tienda online quedó escrito en GOBIERNO §1, «Repartos que no son obvios».
- [x] **Comprobado:** `datos:comparar` sin llamadas sin respaldo ni sobrecargas; `diccionario-datos` y `menu` en verde; `aviario --verificar` al día. Toda tabla, columna, candado y función nueva de producción tiene su migración en el repo.
- [x] **Las reglas de 30 tablas que ya piden ser del equipo** (`20261015221000` y `20261015222000`): llegaron a `main` el mismo 2026-10-16, así que el volcado y `main` ya dicen lo mismo.
- [ ] **Tres migraciones de Finanzas se pegaron en producción 4 a 6 minutos después de la foto** (17:14–17:16 UTC): `20261015233000`, `20261015235000` y `20261016002000`, del PR #1127, todavía abierto. Las trae el próximo refresco.
- [ ] **¿Un pájaro propio para la tienda online?** Hoy sus 16 tablas van con Colibrí (13) y Loro (3), por la pantalla que las maneja. Si Felipe lo prefiere, es una fila nueva en la tabla de GOBIERNO §1 y mover esas tablas en `scripts/datos/aviario.mjs`.
