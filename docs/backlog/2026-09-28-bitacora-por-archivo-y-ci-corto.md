## 🚦 Bitácora y backlog por archivo, y el CI según lo que toca el PR (2026-09-28, ADR-0259) — CI + documentos, sin migración ni web; rama `claude/bitacora-por-archivo-y-ci-corto`

- [x] `docs/bitacora/` y `docs/backlog/` con su README; CLAUDE.md, las skills (`/backlog`, `/decide`, `/examen`, `/pantalla`, `/revision`, también en `.agents/`), la plantilla de PR y SESIONES-ACTIVAS apuntan ahí.
- [x] Candado `scripts/docs/entradas-por-archivo.mjs` en «Tipos, lint y pruebas»: rechaza un `## ` fechado después del 2026-09-28 en `BITACORA.md`/`BACKLOG.md`. Probado contra los diffs de los PR abiertos #550, #568, #571 y #572: pasan todos.
- [x] Job «Qué toca el PR» (`scripts/ci/alcance.mjs`) y modo «solo web» (`scripts/ci/pruebas-web.mjs`, que deduce las pruebas que leen `apps/web`: hoy 3). Pruebas con `node --test`; `ci-paridad.test.ts` en verde.
- [ ] **Sin probar en GitHub:** que un PR de solo documentos quede con el check «Pruebas de RPC contra Postgres» saltado y **aprobado** por la protección de `main`. Mirarlo en el primer PR así; si queda «esperando», cambiar el `if` del job por pasos saltados (ADR-0259, «Cómo falla»).
- [ ] **Sin medir:** el tiempo real del modo «solo web» en el primer PR de pantallas (estimado ~2 min).
- [ ] **Decisión de Felipe:** pasar el repo a una organización de GitHub para usar la merge queue (cierra el hueco de dos PR que pasan solos y rompen juntos).
- [ ] **Siguientes candidatos a chocar:** `docs/ARQUITECTURA.md` (100 commits en la semana) y `docs/SESIONES-ACTIVAS.md` (74). Mismo arreglo si empiezan a molestar.
