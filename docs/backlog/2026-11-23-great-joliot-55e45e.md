## 📐 Las reglas viven por carpeta (2026-11-23, ADR-0692) — solo documentos, sin migración; rama `claude/great-joliot-55e45e`

- [x] `CLAUDE.md` raíz de 238 líneas y 26 KB (antes 1.013 y 145 KB), con «Reglas que cruzan todo el repo» y el índice de las demás.
- [x] 24 archivos en `.claude/rules/` con sus `paths:`; cada sección, movida tal cual (871 de 887 líneas idénticas; las 16 cambiadas, en el ADR).
- [x] `AGENTS.md`, `scripts/flujo-de-negocio/espejo.mjs` y siete líneas de skills (`milimetro`, `color`, `espacio`, `graficos`, `movimiento`, `revision`) apuntan a los archivos nuevos.
- [ ] **Sin medir con `/context`:** la medición es en bytes y por las rutas de cada regla; falta confirmarla en dos sesiones reales (una que solo toque un SQL, otra que toque un modal).
- [ ] **Segundo tiempo, sin apuro:** acortar cada archivo de regla (la historia «aprendido el…» a su ADR, una línea por regla con prueba). Lo hace quien toque esa regla.
- [ ] **El PR #1976 (vidrio que dobla, ADR-0681)** agrega un párrafo a la sección del vidrio de `CLAUDE.md`: si entra después que este, ese párrafo va a `.claude/rules/vidrio.md`.
- [ ] **La propuesta C** (movimiento por frecuencia, la lista en un registro) ya tiene su lista aparte: `.claude/rules/movimiento-excepciones.md`.
