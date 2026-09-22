-- ============================================================================
-- 20260922231700_registrar_venta_sin_execute_publico.sql — CAYLA V2
--
-- QUÉ HACE. Deja `registrar_venta` y las dos funciones que nacieron en 20260922150000
-- (`fn_asesoras_de_turno`, `fn_es_lider_persona`) ejecutables solo por `authenticated`, sin `PUBLIC` ni `anon`.
--
-- POR QUÉ. 20260922150000 hizo `drop` + `create` de `registrar_venta` (cambió de firma) y después
-- solo `grant execute ... to authenticated`. Pero Postgres le da EXECUTE a PUBLIC a toda función
-- nueva (mismo hallazgo que 20260917193651_revocar_execute_fn_aplicar_movimiento.sql). Producción
-- y el Postgres local no lo muestran porque tienen, fuera de las migraciones, un
-- `alter default privileges ... revoke execute on functions from public`; una base armada desde
-- cero con las migraciones (el CI, un proyecto nuevo) sí queda con `=X/postgres`: cualquiera, sin
-- sesión, podía llamar a la RPC que registra ventas. La función igual exige permiso sobre la
-- ubicación, pero el candado de acceso debe estar en los permisos, no solo adentro.
-- Lo destapó `pnpm pruebas:vendedora-en-venta` en el CI del PR #286 (permisos ≠ los de producción).
--
-- PRODUCCIÓN. No hace falta pegarla: las tres ya tienen `{postgres=X/postgres,authenticated=X/postgres}`
-- (verificado 2026-09-22). Si se pega, no cambia nada. Re-ejecutable.
-- ============================================================================

set search_path = retail, public, extensions;

revoke all on function retail.registrar_venta(
  uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text
) from public, anon;
grant execute on function retail.registrar_venta(
  uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text
) to authenticated;

revoke all on function retail.fn_asesoras_de_turno(uuid) from public, anon;
grant execute on function retail.fn_asesoras_de_turno(uuid) to authenticated;

revoke all on function retail.fn_es_lider_persona(uuid) from public, anon;
grant execute on function retail.fn_es_lider_persona(uuid) to authenticated;
