-- ============================================================================
-- 20260923234700_ventas_clientas_conteos_lotes_solo_rpc.sql — CAYLA V2 (ADR-0119)
--
-- ESTADO: en PRODUCCIÓN esta migración NO cambia nada. Verificado en solo lectura el
--   2026-09-23: `authenticated` ya tiene solo SELECT (`relacl` = `authenticated=r`) y `anon`
--   nada sobre las 8 tablas. Alguien las cerró allá sin dejar archivo ni registro. Esta
--   migración lleva ese estado al repo para que la base local, el CI y cualquier base
--   armada desde las migraciones dejen de tener el hueco. `transferencias` y
--   `transferencia_items` son la deriva que el BACKLOG anotó el 2026-09-18 (su
--   `transferencias_update` dejaba marcar un traslado cerrado sin crear movimientos); sus 4
--   escritoras (`iniciar_traslado`, `confirmar_traslado`, `registrar_recepcion_traslado`,
--   `cerrar_traslado_con_diferencia`) también son `security definer` con dueña `postgres`.
--
-- EL HUECO. `0005_grants.sql` (y en producción la `0217` de Dynamic, al unificar) le dieron
-- INSERT/UPDATE/DELETE a `authenticated` sobre TODAS las tablas de `retail`. En 5 de estas 6
-- además hay una política de escritura que lo deja pasar (`ventas_insert`,
-- `venta_items_insert`, `venta_anulacion_items_write`, `conteos_write`, `lotes_insert`), así
-- que una colaboradora con la consola del navegador abierta podía fabricar una venta sin
-- precio, sin stock ni caja, o escribir la condición de una prenda anulada sin pasar por
-- `anular_venta` (PL-84/PL-85). `clientas` no tiene política de escritura (hoy la frena solo
-- RLS); se cierra igual para que no dependa de que nadie le agregue una.
--
-- CAMBIA. Revoca INSERT, UPDATE, DELETE y TRUNCATE a `authenticated` y `anon`. Deja SELECT.
-- Sin el permiso, Postgres rechaza («permission denied for table …») ANTES de mirar ninguna
-- política: las políticas quedan como documentación, no como protección (ADR-0055, ADR-0177).
--
-- POR QUÉ NO ROMPE NADA (verificado en la base local, 2026-09-23):
--   · Las 14 funciones que escriben en estas tablas son `security definer` con dueña
--     `postgres`: abrir_conteo, anular_conteo, anular_venta, archivar_conteo_prueba,
--     archivar_venta_prueba, cerrar_conteo, entregar_separacion, liquidar_prenda_danada,
--     recibir_compras, recibir_envio, recibir_lote, registrar_clienta, registrar_venta,
--     regularizar_prenda. Corren con los permisos de su dueña, no del que llama.
--   · La web no escribe directo en ninguna de las 6 (cero `.from('<tabla>').insert/update/
--     upsert/delete` en apps/ y packages/).
--   · Producción ya opera así.
--   Prueba: `pnpm pruebas:candado-ventas` (control sin la migración + ataques + regresión).
--
-- CÓMO SE DESHACE (sin pérdida de datos, no toca filas):
--   grant insert, update, delete on retail.ventas, retail.venta_items,
--     retail.venta_anulacion_items, retail.clientas, retail.conteos, retail.lotes,
--     retail.transferencias, retail.transferencia_items to authenticated;
--
-- SE ROMPE SI alguien escribe una pantalla o script que inserte o actualice estas tablas sin
-- pasar por una función `security definer`: verá `permission denied for table …`. La
-- respuesta no es devolver el permiso, es usar o crear la RPC.
-- ============================================================================

revoke insert, update, delete, truncate on
  retail.ventas,
  retail.venta_items,
  retail.venta_anulacion_items,
  retail.clientas,
  retail.conteos,
  retail.lotes,
  retail.transferencias,
  retail.transferencia_items
from authenticated, anon;
