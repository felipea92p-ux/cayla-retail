-- ============================================================================
-- 20260923210000_ventas_clientas_conteos_lotes_solo_rpc.sql — CAYLA V2
--
-- ESTADO: verificado contra producción en vivo (2026-09-23, solo lectura) y contra el
--   código real de este worktree. Pendiente de pegar — lo hace Felipe o Dany (PL-11).
--
-- CONTEXTO. Rescata y completa ADR-0119 (2026-09-18, `20260918190000_ventas_devoluciones_
-- solo_rpc.sql`, nunca fusionada a main). Esa migración cerró `ventas`, `venta_items`,
-- `devoluciones`, `devolucion_items` y `venta_anulacion_items`, pero dejó `clientas`,
-- `conteos` y `lotes` sin rastrear "a propósito" (mismo patrón, nadie había verificado quién
-- escribe ahí). `devoluciones`/`devolucion_items` ya se cerraron hoy en otra sesión (commit
-- `520915d0`, ADR-0166, rama `claude/pantalla-ventas-module-bf9b1b`) — esta migración NO las
-- vuelve a tocar, solo cubre lo que sigue abierto en producción, verificado ahora mismo:
--
--   select table_name, string_agg(privilege_type, ',')
--   from information_schema.role_table_grants
--   where table_schema = 'retail' and grantee = 'authenticated'
--     and table_name in ('ventas','venta_items','venta_anulacion_items','clientas','conteos','lotes')
--   group by table_name;
--   → las 6 con DELETE,INSERT,SELECT,UPDATE abiertos a `authenticated`.
--
-- POR QUÉ NO ROMPE NADA — verificado, no razonado (2026-09-23):
--
-- 1) Quién escribe en `ventas`/`venta_items`/`venta_anulacion_items`. 6 funciones, todas
--    security definer, todas dueñas `postgres`: registrar_venta, anular_venta,
--    archivar_venta_prueba, entregar_separacion, liquidar_prenda_danada, regularizar_prenda.
--    (3 más que en la auditoría del 18-sep — construidas después, mismo patrón.)
--
-- 2) Quién escribe en `clientas`/`conteos`/`lotes`. 8 funciones, todas security definer,
--    todas dueñas `postgres`: registrar_clienta, abrir_conteo, cerrar_conteo, anular_conteo,
--    archivar_conteo_prueba, recibir_lote, recibir_envio, recibir_compras.
--
-- 3) Escritura directa desde la app: cero. Se revisó `apps/` y `packages/` completos
--    buscando `.from('ventas'|'venta_items'|'venta_anulacion_items'|'clientas'|'conteos'|
--    'lotes')` seguido de `.insert(`/`.update(`/`.delete(` — ninguna coincidencia. Los usos
--    reales de `.from(...)` sobre estas tablas son siempre `.select(...)`.
--
-- 4) Triggers: `conteos` tiene `conteos_es_prueba_solo_lider` (BEFORE INSERT/UPDATE) y
--    `trg_sellar_terminal` (BEFORE INSERT); `ventas` tiene `trg_sellar_terminal` (BEFORE
--    INSERT) y `trg_prendas_por_regularizar_al_anular` (AFTER UPDATE) — ninguno existía el
--    18-sep, construidos después junto con ADR-0161/0178. No importa: un trigger se dispara
--    por la operación DML, no por quién la ejecuta — una función security definer dueña de
--    la tabla los sigue disparando igual después de este REVOKE.
--
-- CAMBIA. Revoca INSERT, UPDATE y DELETE a `authenticated` y `anon` sobre las 6 tablas. Deja
-- SELECT. Mismo mecanismo que ADR-0055 (movimientos) y ADR-0119 (las otras 5): sin el
-- permiso, Postgres rechaza antes de mirar ninguna política de RLS.
--
-- CÓMO SE DESHACE (30 segundos, sin pérdida de datos):
--   grant insert, update, delete on retail.ventas, retail.venta_items,
--     retail.venta_anulacion_items, retail.clientas, retail.conteos, retail.lotes
--     to authenticated;
--
-- SE ROMPE SI: alguien escribe una pantalla o script nuevo que inserte/actualice estas 6
-- tablas sin pasar por una función security definer → verá "permission denied for table
-- ...". La respuesta correcta es agregar o usar la RPC que corresponde, nunca devolver el
-- permiso. También se rompería si en producción existiera hoy una función que escriba aquí
-- y NO sea security definer — las dos consultas de arriba dicen que no.
--
-- LO QUE ESTA MIGRACIÓN NO CIERRA: `0005_grants.sql` (`alter default privileges`) sigue
-- dando escritura por defecto a cualquier tabla NUEVA de `retail` — la raíz del patrón sigue
-- viva (PL-85, tercera opción descartada por alcance: "ir a la raíz"). Transferencias y
-- transferencia_items no están en este alcance; no se verificaron hoy.
--
-- REGISTRO (PL-95 — la tabla `retail.sql_aplicado` todavía no existe, queda pendiente de
-- construir): este comentario y el commit que lo acompaña son el registro por ahora. Quien
-- pegue esto en producción anota aquí mismo la fecha y hora reales:
--   Pegado por: ______  ·  Fecha/hora: ______
-- ============================================================================

revoke insert, update, delete on
  retail.ventas,
  retail.venta_items,
  retail.venta_anulacion_items,
  retail.clientas,
  retail.conteos,
  retail.lotes
from authenticated, anon;
