# ADR-0011 — Los helpers RLS de `0003_rls.sql` no existen en producción con esos nombres

**Fecha:** 2026-09-05
**Estado:** Documentado, sin acción pendiente — el comportamiento en producción es correcto, solo diverge del nombre local

## Contexto

Felipe estaba redactando una función nueva (`registrar_gasto`-like, con
`insert into gastos`) y al probarla en el SQL Editor de producción salió
`ERROR: 42883: function fn_es_lider() does not exist`. Se auditó
`retail` en producción (proyecto `cayla-dynamic`) con consultas de solo
lectura sobre `pg_class`, `pg_policies` y `pg_proc`, y se confirmó:

- `fn_es_lider()`, `fn_sede_actual_persona()` y `fn_persona_actual()` (los
  nombres de `supabase/migrations/0003_rls.sql` y `0023_rls_helpers_security_definer.sql`)
  **no existen en ningún schema** de la base de producción.
- Las políticas reales sobre `productos`, `variantes`, `stock`,
  `movimientos`, `ordenes_produccion`, `ordenes_compra`, `ordenes_compra_items`
  y `bom_items` sí existen, tienen RLS habilitado, y llaman a funciones
  equivalentes pero con otro nombre:
  - `fn_es_lider()` → `retail.es_lider()`
  - `fn_sede_actual_persona()` → `retail.mi_sede()`
  - (nueva, sin equivalente local 1:1) `retail.puede_operar_sede(sede_id)`
    — combina "es líder" y "es su sede" en una sola función; explica por
    qué producción tiene menos políticas por tabla que las migraciones
    locales (una policy consolidada en vez de dos, ej. `stock_select`).
- `personas` y `sedes` son **vistas** en producción (no tablas), por eso
  `relrowsecurity = false` en ambas — es esperado, las vistas no soportan
  `ALTER TABLE ... ENABLE ROW SECURITY` directamente, y no es indicio de
  hueco de seguridad.

Mismo patrón que ADR-0004 (`recibir_lote`) y ADR-0006 (`patrimonio_items.categoria`):
el script de unificación con Dynamic (jul-2026) no fue una copia literal de
las migraciones locales — alguien reescribió/renombró estas funciones y
consolidó políticas directamente contra producción, y ese cambio nunca se
volcó a un archivo versionado en `supabase/migrations/` ni a `docs/ARQUITECTURA.md`.

## Decisión

No se toca nada en producción — el modelo de seguridad ahí es correcto y
equivalente (o mejor, por la consolidación) al de las migraciones locales.
Se documenta el mapeo real de nombres en `docs/ARQUITECTURA.md` §4.3 para
que la próxima vez que alguien pegue SQL en el editor de producción use
`retail.es_lider()` / `retail.mi_sede()` / `retail.puede_operar_sede(sede_id)`
directamente, en vez de perder un round-trip de error como esta vez.

## Alternativas descartadas

- **Re-ejecutar `0003_rls.sql` en producción para "restaurar" `fn_es_lider`.**
  Se descartó de inmediato al ver el primer error real (`ALTER action ENABLE
  ROW SECURITY cannot be performed on relation "sedes"` — `sedes` es vista).
  Habría fallado además con `policy already exists` en las tablas reales, y
  habría dejado **dos** sistemas de funciones RLS conviviendo (`fn_es_lider`
  y `retail.es_lider`) sin que ninguna policy real usara la vieja — puro
  riesgo, cero beneficio.
- **Renombrar las funciones de producción para que calcen con el repo
  local.** Descartado: el repo es el que está desactualizado aquí, no
  producción. Cambiar producción para "obedecer" al repo habría sido
  exactamente el error inverso al de ADR-0004.

## Consecuencias

Ninguna acción pendiente sobre el schema. Queda como referencia obligatoria
para cualquier SQL nuevo pegado en el editor de producción: usar los nombres
reales (`retail.es_lider()`, `retail.mi_sede()`, `retail.puede_operar_sede(sede_id)`),
no los de `0003_rls.sql`. Si en el futuro se decide sincronizar el repo local
para que las migraciones reflejen los nombres reales de producción, es un
cambio de esquema completo (renombrar funciones + actualizar toda policy que
las referencia) que merece su propia sesión y confirmación explícita — no
algo para hacer de paso.
