# Candado de partes sin deadlock (ADR-0195, act. 2026-11-23): lo que falta

- [x] **Paso 1: ¿lo reproduce el Postgres local?** Sí. En la imagen del CI (`17.6.1.171`), `create policy`, `alter policy`, `drop
      policy if exists` y `drop trigger if exists` toman las mismas 21 tablas de `auth`/`storage` que producción (`supautils.policy_grants`).
- [x] **Paso 2: el candado.** `scripts/migraciones/partes-sin-deadlock.mjs`, con 19 pruebas puras y `pnpm pruebas:partes-sin-deadlock`
      contra Postgres. En el CI: tanda 1 («Partes de migración sin deadlock») y «Tipos y candados».
- [ ] **El primer PR con una migración nueva es la primera corrida real del paso del CI.** Este PR no agrega migraciones, así que su CI
      dirá «el PR no agrega migraciones». `aplicar --partes` se probó de punta a punta en local, con dos migraciones de juguete sobre la
      base desechable. Mirar el registro de ese primer PR.
- [ ] **Lo que el candado no ve (declarado en su encabezado):** un `do` que hace el `alter` y crea la política en una sola sentencia, y una
      tabla que una parte anterior del mismo archivo ya tomó. Para cerrar lo segundo habría que medir cada parte en su propia transacción
      con las anteriores ya confirmadas: una base aparte o una copia. Solo si un día pasa.
- [ ] **Los `pegar-en-produccion-*.sql` no se miden:** el CI no los aplica. Antes de pegar uno con políticas, medirlo a mano:
      `pnpm migraciones:partes-sin-deadlock <archivo>`, contra una base que no esté usando nadie.
