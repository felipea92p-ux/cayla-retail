## 🧭 El tablero de sesiones se arma solo (2026-11-23, ADR-0697) — solo scripts y documentos, sin migración; rama `claude/tablero-sesiones-6b1386`

- [x] `pnpm sesiones` (`scripts/sesiones/`): worktrees, ramas `claude/*` de 48 h, PR abiertos y reservas, juntados por rama; activas,
  quietas y vacías; choques con `detectarChoques` de `scripts/abrir-pr/choques.mjs`. Prueba pura en el CI («Tablero de sesiones»).
- [x] Hook `SessionStart` (`scripts/sesiones/al-abrir.mjs`): resumen para Claude y una línea para la persona solo con un choque seguro o
  uno con esta sesión. Medido: ~3 s con red, 1,5 s sin red ni `gh`, siempre sale con 0.
- [x] Ritual de CLAUDE.md y las skills `formidable`, `innovar`, `focus`, `pantalla`, `milimetro`, `unificar`, `revision` y `sugerir`
  apuntan a `pnpm sesiones`; `docs/SESIONES-ACTIVAS.md` lleva el aviso de historia y no recibe filas.
- [ ] **Decisión de Felipe:** borrar `docs/SESIONES-ACTIVAS.md` o dejarlo como historia para siempre (hoy: historia, con aviso).
- [ ] **Sin probar en una sesión nueva de verdad:** el hook se probó corriéndolo como lo corre Claude Code (`CLAUDE_PROJECT_DIR` de esta
  worktree); falta verlo en el arranque de una sesión real, cuando esta rama esté en `main`.
- [ ] **Aparte:** `pnpm abrir-pr:choques` lee los archivos de cada PR con `gh pr list --json files`, que corta en 100
  (`scripts/abrir-pr/choques.mjs`, `leerOtros`): con un PR grande se pierden choques probables.
- [ ] **Otras máquinas:** las ramas que no empiezan con `claude/` (OpenCode, `ccr-` de la nube) solo se ven con worktree aquí o PR abierto.
  Sumar sus prefijos si Felipe lo pide.
