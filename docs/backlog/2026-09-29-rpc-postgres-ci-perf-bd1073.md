## ⏱️ El CI cancela de verdad y el job de Postgres levanta solo la base (2026-09-29, ADR-0286) — solo `ci.yml`, sin migración; rama `claude/rpc-postgres-ci-perf-bd1073`

- [x] **Parte 1:** los 135 `if: always()` de `ci.yml` pasan a `!cancelled()`, y el grupo de `concurrency` de un push a `main` es
  por SHA (cada commit de `main` se verifica entero). Verificado en local: YAML válido, 0 `always()` restantes,
  `ci-paridad.test.ts` 8/8 y `scripts/ci/alcance.test.mjs` 7/7.
- [ ] **Sin probar en GitHub:** empujar dos veces seguidas a este PR y ver que la segunda corrida arranca en segundos y la
  primera termina «cancelada» sin correr pruebas. Es la única prueba que cuenta: un `if:` no se ejecuta en local.
- [x] **Parte 2** (commit aparte, para poder revertirla): `npx supabase@2.118.0 start -x gotrue,kong,mailpit,postgres-meta,postgrest,storage-api,studio`
  en los dos pasos que levantan la base. Verificado en local: los 7 nombres están en la lista válida del CLI y YAML válido.
- [ ] **Sin probar en GitHub (Parte 2):** las 124 pruebas dan lo mismo que en `main` sin gotrue ni storage-api (15 pruebas insertan en
  `auth.users`, una toca `storage.*`) y `supabase start` baja de ~88 s a ~40 s. Si sale rojo por eso: plan B en el ADR-0286.
- [ ] **Siguiente fase, solo si no alcanza:** correr las pruebas en paralelo sobre bases separadas
  (`create database … template`), lo que pide sacar el `psql()` repetido en 123 scripts a un ayudante único.
- [ ] **Deriva diaria:** `deriva-diaria.yml` también hace `npx supabase start` completo y solo usa la base. Si la Parte 2
  funciona en el CI, la misma exclusión le sirve ahí.
