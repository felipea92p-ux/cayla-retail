## 📐 Las reglas viven por carpeta (2026-11-23, ADR-0692) — solo documentos, sin migración; rama `claude/great-joliot-55e45e`

- [x] `CLAUDE.md` raíz de 239 líneas y 26 KB (antes 1.047 y 145 KB), con «Reglas que cruzan todo el repo» y el índice de las demás.
- [x] 25 archivos en `.claude/rules/` con sus `paths:`; cada sección, movida tal cual (899 de 915 líneas idénticas; las 16 cambiadas, en el ADR).
- [x] `AGENTS.md`, `scripts/flujo-de-negocio/espejo.mjs` y siete líneas de skills (`milimetro`, `color`, `espacio`, `graficos`, `movimiento`, `revision`) apuntan a los archivos nuevos.
- [ ] **Sin medir con `/context`:** la medición es en bytes y por las rutas de cada regla; falta confirmarla en dos sesiones reales (una que solo toque un SQL, otra que toque un modal).
- [ ] **Segundo tiempo, sin apuro:** acortar cada archivo de regla (la historia «aprendido el…» a su ADR, una línea por regla con prueba). Lo hace quien toque esa regla.
- [x] Lo que `main` sumó mientras tanto entró a su archivo: el vidrio que dobla (ADR-0681, PR #1976) a `vidrio.md`; la escala de la letra (ADR-0691) a `letra.md` y sus tres filas a `unificar.md`.
- [ ] **La rama `claude/texto-en-tres-tonos` (ADR-0694, sin PR al 2026-11-23)** cambia «Paleta y orden de pantalla» (commit `49312db4a`) y el punto 4 de «Modo oscuro» (`820064959`): la que se fusione segunda los lleva a `.claude/rules/paleta.md` y `.claude/rules/modo-oscuro.md`, no a la raíz.
- [ ] **La propuesta C** (movimiento por frecuencia, la lista en un registro) ya tiene su lista aparte: `.claude/rules/movimiento-excepciones.md`.
