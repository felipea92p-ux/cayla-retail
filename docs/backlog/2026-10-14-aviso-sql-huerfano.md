## 🔔 SQL huérfano: un PR cerrado con su SQL en producción avisa (2026-10-14, ADR-0251 act. 2026-10-14) — sin migración; rama `claude/aviso-sql-huerfano`

- [x] `scripts/migraciones/sql-huerfano.mjs` + `.github/workflows/sql-huerfano.yml`: abre «SQL en producción que main no tiene: PR #N» (y comenta el PR) por cada PR de este repo cerrado sin fusionar con «SQL pegado en producción» marcada y migraciones que `main` no tiene; lo cierra solo cuando llegan. Un aviso por PR. Lee la casilla con `revisarSqlPegado` (la misma regla del check «SQL pegado»).
- [x] Prueba `scripts/migraciones/sql-huerfano.test.mjs` (14 casos, con mutaciones comprobadas), en el paso «Pruebas del check SQL pegado y de la deriva» del CI.
- [x] Simulacro contra GitHub real, solo lectura (`--simular`): de 29 PR cerrados sin fusionar, abriría solo el de #978; #788 no (sus migraciones ya están en `main`).
- [ ] **Sin correr en GitHub todavía:** `pull_request_target`, `schedule` y «Run workflow» usan el workflow de `main`, así que su primera corrida real es después de fusionar. Probarlo: Actions ▸ «SQL huérfano» ▸ Run workflow, sin número, y mirar la corrida.
- [ ] Cinco PR de septiembre cerrados sin fusionar (#56, #58, #123, #131, #170) tienen migraciones que `main` no tiene con ese nombre. Son de antes de la casilla: este aviso no los ve. Si se quiere cerrar la duda, mirarlo en privado con la deriva.
