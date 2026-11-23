## 2026-11-23 (El CI ya ve la mezcla de una política con el alter de una tabla en uso)

Qué hice: medí en un Postgres de Supabase desechable (la imagen `17.6.1.171` del CLI 2.118.0, la misma del CI) si se reproduce el
bloqueo de ADR-0195. Sí: `create policy`, `alter policy`, `drop policy if exists` y `drop trigger if exists` toman en exclusiva
las mismas 21 tablas de `auth` y `storage`, y la causa es `supautils.policy_grants`. Con eso armé el candado que faltaba:
`scripts/migraciones/partes-sin-deadlock.mjs` corre cada migración nueva del PR en `begin … rollback` y lee `pg_locks` después de
cada sentencia. Corre en la tanda 1 del CI, paso «Partes de migración sin deadlock». Tiene 19 pruebas puras y una contra Postgres
(`pnpm pruebas:partes-sin-deadlock`).

Por qué así: el paso que decidía todo era el orden de los candados, no su lista. Un `create policy` SOLO también toma su propia tabla
de retail en exclusiva, y la toma antes que las 21. Un candado que solo mirara «retail y auth en exclusiva en la misma parte» habría
salido rojo en toda política, también en la forma correcta. Por eso mide sentencia por sentencia: sale rojo cuando, ANTES de la
política, otra sentencia de la misma parte tomó una tabla que ya existía. Ese es el ciclo de F1. Reproduje las 1 259 migraciones del
repo midiendo cada una antes de aplicarla, para buscar falsos rojos sobre SQL real. Desde F1, de 41 con políticas, sale roja una sola, y
es un rojo verdadero: `20260928140000` altera `clientas` y crea políticas en la misma pegada. Antes de publicar corregí dos rojos falsos
de la primera versión.

Felipe se lleva: una migración con política y `alter` de una tabla en uso en la misma parte ya no llega a `main`. Cada parte se marca
con `-- ===== PARTE N · … =====`. El candado no ve lo que pasa dentro de un solo bloque `do`, ni una tabla que una parte anterior del
mismo archivo ya tomó. Detalle: ADR-0195, «Actualización 2026-11-23».
