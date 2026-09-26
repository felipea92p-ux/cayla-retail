-- ============================================================================
-- 20260927180200_existencias_puertas_internas.sql — CAYLA V2 · ADR-0240 · PARTE 2 de 2
-- `mover_interno` y `apartar_stock` dejan de llamarse desde el navegador.
--
-- POR QUÉ. La parte 1 (20260927180000) creó las puertas de la pantalla con el candado del módulo
-- (`mover_entre_piso_y_almacen` → «Bajada al piso», `apartar_prenda` → «Apartados»). Mientras las dos funciones de
-- siempre sigan abiertas a `authenticated`, el candado se esquiva llamándolas directo por la API. Aquí se cierran.
-- Quienes las usan por dentro (`bajar_al_piso`, `separar_pedido_para_apartar`, recibir un traslado con pedido,
-- separaciones) son `security definer`: corren como su dueño y no pierden nada.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: DESPUÉS de publicar la web que llama a las puertas nuevas (si no, «Reponer», «Retirar del
-- piso» y «Apartar» de Existencias fallarían con «permission denied» hasta publicarla). Solo cambia permisos de dos
-- funciones: no toma candados de tablas ni lleva políticas. Idempotente.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

revoke execute on function retail.mover_interno(uuid, uuid, integer, uuid, uuid, text, uuid) from authenticated;
revoke execute on function retail.apartar_stock(uuid, uuid, integer, text, text, date, text, uuid, uuid) from authenticated;

comment on function retail.mover_interno(uuid, uuid, integer, uuid, uuid, text, uuid) is
  'Mueve una prenda entre dos sububicaciones de la MISMA ubicación. Pieza interna desde ADR-0240: la llaman mover_entre_piso_y_almacen («Reponer», «Retirar del piso», con el módulo «Bajada al piso»), bajar_al_piso y separar_pedido_para_apartar. Con p_token, el reintento con los mismos datos devuelve el mismo movimiento (ADR-0208).';
comment on function retail.apartar_stock(uuid, uuid, integer, text, text, date, text, uuid, uuid) is
  'Aparta unidades para una clienta (ADR-0141). Pieza interna desde ADR-0240: la llaman apartar_prenda («Apartar» de Existencias, con el módulo «Apartados»), las separaciones y recibir un traslado con pedido.';

notify pgrst, 'reload schema';
