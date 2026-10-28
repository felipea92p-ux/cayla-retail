## 🧱 `main` arma la base desde cero otra vez: ayudantes `pg_temp` sin choque (2026-10-23) — sin SQL nuevo en producción; rama `claude/intelligent-solomon-80c69f`

- [x] Reproducido: las 834 migraciones en UNA sesión (como el CLI) dan `42P13 cannot change name of input parameter "p_viejo"` en `20261023212000`; con el ayudante renombrado, 0 errores. Catálogo de las dos bases idéntico.
- [x] `20261023212000`: `pg_temp.reemplazar_una_vez` → `pg_temp.reemplazar_una_vez_ancla` (definición y llamada). No cambia ningún objeto persistente.
- [x] `pnpm migraciones:pg-temp` (`scripts/migraciones/pg-temp-sin-choque.mjs`) + 13 pruebas, también contra las migraciones reales; paso «Ayudantes pg_temp sin choque» del CI; nota en `scripts/migraciones/README.md`.
- [ ] **Decisión de Felipe:** la 212000 ya está en `main` y en producción, y el check «SQL pegado» (obligatorio) rechaza editarla aunque el cambio no toque la base. Sin su OK, ese check sale rojo en este PR.
- [ ] **Sin probar en el CI:** las tandas de Postgres sobre este PR (solo se probó armando la base en un Postgres desechable).
- [ ] No cubierto por el candado: el tipo de retorno y los valores por defecto de un ayudante (el motor también rechaza cambiarlos), y una función creada con `execute '…'`.
