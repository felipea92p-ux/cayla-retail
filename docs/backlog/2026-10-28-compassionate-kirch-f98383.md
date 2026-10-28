## 🧾 Token deshecho en registrar_movimiento_dinero (2026-10-28, ADR-0548) — migración 20261028012000 por pegar; rama `claude/compassionate-kirch-f98383`

- [x] Reemplazos anclados en las dos ramas (inicio y `unique_violation`); prueba `pnpm pruebas:cuentas-dinero -- --con-migracion …` falla sin ella (2 casos) y pasa con ella (94); idempotente.
- [ ] **Sin pegar en producción:** una sola parte, solo funciones. Huella viva verificada el 2026-10-27: `ea93db7bdf64ba3408cccc49ebe38431`.
