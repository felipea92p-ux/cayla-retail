## ⏱️ El CI cancela de verdad y el job de Postgres levanta solo la base (2026-09-29, ADR-0286) — solo `ci.yml`, sin migración; rama `claude/rpc-postgres-ci-perf-bd1073`

- [x] **Parte 1:** los 135 `if: always()` de `ci.yml` pasan a `!cancelled()`, y el grupo de `concurrency` de un push a `main` es
  por SHA (cada commit de `main` se verifica entero). Verificado en local: YAML válido, 0 `always()` restantes,
  `ci-paridad.test.ts` 8/8 y `scripts/ci/alcance.test.mjs` 7/7.
- [ ] **Sin probar en GitHub:** empujar dos veces seguidas a este PR y ver que la segunda corrida arranca en segundos y la
  primera termina «cancelada» sin correr pruebas. Es la única prueba que cuenta: un `if:` no se ejecuta en local.
- [ ] **Parte 2** (commit aparte, para poder revertirla): `supabase start -x …` con la versión del CLI fijada. Ver ADR-0286.
- [ ] **Siguiente fase, solo si no alcanza:** correr las pruebas en paralelo sobre bases separadas
  (`create database … template`), lo que pide sacar el `psql()` repetido en 123 scripts a un ayudante único.
- [ ] **Deriva diaria:** `deriva-diaria.yml` también hace `npx supabase start` completo y solo usa la base. Si la Parte 2
  funciona en el CI, la misma exclusión le sirve ahí.
