## 📐 El set «Al milímetro» (2026-11-12) — solo skills y documentación, sin código de la app ni migración; rama `claude/skills-al-milimetro`

- [x] Siete skills en `.claude/skills/` (`milimetro`, `movimiento`, `tipografia`, `espacio`, `color`, `graficos`, `textos`), con su `referencia/fuentes.md` y su `referencia/medir.js`. Cada `medir.js` pasa `node --check`; los de `espacio`, `tipografia`, `color` y `graficos` se probaron en Chrome sin ventana sobre páginas de prueba con fallas conocidas.
- [x] `perl .claude/skills/textos/referencia/auditar.pl` corre sobre todo `apps/web` en menos de 5 s (tablero del día: R01 2 · R07 14 · R10 12 · R18 13…).
- [x] `python3 .claude/skills/color/referencia/contrastes.py --verificar` coincide con los valores publicados de WCAG y APCA.
- [x] Investigación en `docs/investigacion/2026-11-12-fundamentos-de-diseno/`; sección «Al milímetro» en `CLAUDE.md`; tablero en `docs/milimetro/propuestas.md`.
- [ ] **Sin probar contra el ERP real:** ningún `medir.js` se corrió todavía en local contra una pantalla del ERP. La primera auditoría (`/milimetro auditar <ruta>`) tiene que leer cada «revisar» por si es un falso positivo.
- [ ] **Sin ADR:** el número no se pudo reservar desde la sesión en la nube. Reservarlo con `pnpm reservar adr` si Felipe quiere el ADR.
- [x] **Obligatorias para todos (Felipe 2026-11-12):** regla en `CLAUDE.md` «Al milímetro», casillas en `.github/pull_request_template.md`, check «Al milímetro» (`.github/workflows/al-milimetro.yml` + `scripts/milimetro/casilla.mjs`, 5 pruebas en verde con `node --test scripts/milimetro/casilla.test.mjs`, sumadas al CI) y tablero `docs/milimetro/README.md`.
- [ ] **Al fusionar:** los PR abiertos que toquen un archivo visual verán el check en rojo hasta marcar su casilla; si Felipe quiere que bloquee la fusión, hay que agregarlo a los checks obligatorios de `main` en GitHub (no se puede desde el repo).
- [ ] Las 10 propuestas de `docs/milimetro/propuestas.md` esperan a Felipe; ninguna se aplicó.
