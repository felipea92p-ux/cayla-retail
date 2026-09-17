-- ============================================================================
-- 20260917150000_revocar_execute_fn_aplicar_movimiento.sql — CAYLA V2
--
-- retail.fn_aplicar_movimiento(uuid) tenía EXECUTE otorgado a `anon` Y a
-- `authenticated` (verificado 2026-09-17 contra este mismo Postgres local con
-- has_function_privilege). Es security definer y no valida nada por su
-- cuenta: solo hace `select * into m from movimientos where id =
-- p_movimiento_id` y aplica el delta a `stock` según `m.tipo`. Confía en que
-- quien la llama ya insertó la fila de movimiento después de validar el
-- negocio (ubicación, permiso, stock disponible, etc.).
--
-- El riesgo concreto: cualquier llamada anónima a
-- POST /rest/v1/rpc/fn_aplicar_movimiento con un movimiento_id de tipo
-- 'entrada' que ya existe (expuesto en cualquier respuesta previa de la API
-- que liste movimientos) reaplica esa entrada y duplica stock, sin sesión ni
-- permiso. Mismo patrón de riesgo que fn_recalcular_costo_variante
-- (20260916090000_costo_promedio_ponderado.sql), con una variante: acá no
-- hace falta inventar un costo arbitrario, alcanza con repetir un id real.
--
-- Confirmado 2026-09-17 contra pg_proc (no contra los archivos de
-- migración — varios de estos llamadores están redefinidos varias veces y
-- lo que importa es la definición vigente, no la más vieja): TODOS los
-- llamadores actuales de fn_aplicar_movimiento son security definer —
-- aprobar_devolucion, cerrar_conteo, cerrar_produccion, mover_interno,
-- recibir_compras, recibir_lote, registrar_cambio, registrar_movimiento
-- (las dos sobrecargas), registrar_venta, revertir_produccion, transferir
-- (más recibir_insumos/registrar_consumo_insumos, que llegaron a este
-- Postgres compartido vía una migración de otra worktree que todavía no
-- está en este árbol — ver BITACORA). Corren con el privilegio del owner;
-- el revoke no los afecta.
--
-- Dos fuentes de permiso distintas, hay que cerrar las dos (mismo hallazgo
-- que costo_promedio_ponderado):
--   1. Postgres otorga EXECUTE a PUBLIC automáticamente al crear una función.
--   2. 0005_grants.sql: `alter default privileges in schema retail grant
--      execute on functions to authenticated`.
--
-- Solo local por ahora. Producción probablemente tiene el mismo grant
-- abierto (misma migración base 0003_funciones.sql) — pendiente que Felipe
-- lo confirme y autorice antes de pegar este mismo revoke en el SQL Editor
-- de producción con el prefijo `retail.` (ver CLAUDE.md).
-- ============================================================================

set search_path = retail, public, extensions;

revoke all on function retail.fn_aplicar_movimiento(uuid) from public;
revoke execute on function retail.fn_aplicar_movimiento(uuid) from authenticated;
