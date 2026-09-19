-- ============================================================================
-- 20260916214600_registrar_movimiento_una_sola_firma.sql — CAYLA V2
--
-- RECONSTRUCCIÓN, NO EL ORIGINAL. En producción quedó registrada como
-- `registrar_movimiento_una_sola_firma` (versión 20260916214600), aplicada el
-- 2026-09-16, y nunca se subió al repo. Se detectó el 2026-09-18 al comparar `retail`
-- por huella md5 (BACKLOG, "Comparación completa `retail`").
--
-- EL PROBLEMA. `0003_funciones.sql` creó `registrar_movimiento` con 6 parámetros.
-- `20260914230000_inventario_piso_almacen.sql` la "extendió" con `p_sububicacion_id` usando
-- `create or replace` con OTRA lista de tipos: Postgres no reemplaza, crea una segunda
-- sobrecarga (el hueco de ADR-0009/0004). Quedaron las dos. Una llamada con solo los
-- parámetros obligatorios —la de `AjustarInventarioModal` en una ubicación sin
-- piso/almacén, que no manda `p_sububicacion_id`— coincide con las dos, y Postgres
-- responde "is not unique". Producción la había arreglado; el repo y el Postgres local no.
--
-- QUÉ HACE. Borra la de 6 parámetros. Queda la de 7, que tiene defaults en `p_motivo`,
-- `p_nota` y `p_sububicacion_id`, y cubre las mismas llamadas. La lógica de la de 7 es
-- idéntica a la de producción (huella md5 sin comentarios).
--
-- IDEMPOTENTE: `drop function if exists`. Pegarla en producción no cambia nada (allá la
-- de 6 ya no existe).
--
-- SE ROMPE SI: algo llama `registrar_movimiento` por posición con exactamente 6
-- argumentos y espera la versión vieja — resuelve a la de 7 con el default, sin
-- diferencia de comportamiento salvo que ahora exige decidir piso/almacén en un ajuste.
-- ============================================================================

set search_path = retail, public, extensions;

drop function if exists retail.registrar_movimiento(uuid, uuid, text, integer, text, text);
