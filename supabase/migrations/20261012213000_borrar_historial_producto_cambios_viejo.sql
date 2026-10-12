-- ============================================================================
-- 20261012213000_borrar_historial_producto_cambios_viejo.sql — CAYLA V2 (Catálogo)
--
-- EL PROBLEMA PRIMERO. `retail.fn_historial_producto_cambios(p_producto_id)` es la lectura de historial de
-- 20260915204541 (ADR-0059). Quedó sin uso cuando el Historial de la prenda pasó a `fn_historial_prenda` (ADR-0354,
-- 2026-10-06), pero siguió viva y ejecutable. Una lectura que nadie usa no se mantiene al día con las reglas de la que
-- la reemplazó (qué muestra a quién): es una segunda puerta a los mismos datos, con criterios de hace un mes.
--
-- QUÉ HACE. La borra. Nadie la llama (verificado el 2026-10-12: ni `apps/`, ni `scripts/`, ni otra función), así que
-- borrar es más simple que ponerla al día: el código que no existe no se tiene que mantener. El backlog la tenía
-- pendiente desde el 2026-10-06 (docs/backlog/2026-10-06-catalog-modal-history-tab-126842.md).
--
-- QUÉ NO TOCA. Los DATOS: la tabla `retail.historial_producto_cambios` (append-only) sigue igual, la llena el mismo
-- disparador y la lee `fn_historial_prenda`. Tampoco `fn_historial_producto_cambios_inmutable`,
-- que es el disparador que impide editar ese ledger (otro nombre, otra función).
--
-- SE ROMPE SI alguien vuelve a necesitar el historial crudo por producto: se lee con `fn_historial_prenda`.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: un `drop function` (no toma los candados de
-- auth/storage, ADR-0195). Idempotente. Después, refrescar el volcado y `docs/datos/generado`.
-- ============================================================================

set lock_timeout = '3s';

drop function if exists retail.fn_historial_producto_cambios(uuid);

reset lock_timeout;
