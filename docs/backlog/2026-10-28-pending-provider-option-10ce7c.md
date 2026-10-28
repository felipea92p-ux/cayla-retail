# Backlog · 2026-10-28 · Fase afuera «por definir» — DESCARTADA (rama `claude/pending-provider-option-10ce7c`, PR #1422 cerrado)

Otra sesión hizo lo mismo con otro diseño (`claude/registrar-producto-trujillo-67e787`, ADR-0537 act. b, migración `20261027220000`, «Pendiente de registrar»). Se queda esa.

- [ ] **Pegar en producción `pegar-en-produccion-deshacer-fase-por-definir-2026-10-28.sql`** (una parte): quita mi bloqueo `fase_por_definir`, el candado y los reemplazos que sí se pegaron el 2026-10-28. **Antes** de pegar `20261027220000` de la otra rama: si no, sus fases pendientes quedarían bloqueadas.
- [ ] Verificar después: `fn_produccion_operar_fase` sin `fase_por_definir` y `fn_produccion_fases_normalizar` sin `por_definir`.
- [ ] El tablero de choques entre ramas: `pnpm abrir-pr:choques` solo mira PR abiertos; una rama local sin PR que ya pegó SQL en producción no se ve. Mirar `docs/SESIONES-ACTIVAS.md` y `git branch -a` antes de empezar algo en Producción.
