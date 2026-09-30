-- ============================================================================
-- 20260930240200_club_paso1d_parte3_regalo_venta_items.sql — CAYLA V2 · Club de clientas · tanda 1d · PARTE 3 de 4
-- ADR-0288 (D-7, «Actualización 2026-09-30 (e)»). «ES PARA REGALO» — EN ESPERA: el spike aprobado sacó la marca del
-- ticket y Felipe decide si se queda (ver la PARTE 2, 20260930240100_club_paso1d_parte2_se_probo.sql, que tiene la
-- cabecera completa y el orden de pegado). Si sale, este archivo y la PARTE 4 se borran antes de pegarlos.
-- SOLO `venta_items`: la columna `es_regalo` (false para todo). Va sola porque toda venta escribe en `venta_items`: con
-- una sola tabla tomada, no puede trabarse en cruz con una venta a medio camino. Se pega sola en el SQL Editor, después
-- de la PARTE 2; se puede pegar dos veces. Sin políticas ni `drop trigger`. Nada la escribe todavía: `registrar_venta`
-- (la de la 1c) no la conoce y cada venta queda con false, exactamente como hasta hoy.
-- ============================================================================

-- ============================== PARTE 3 · venta_items (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- `add column … default false` con un valor constante no reescribe la tabla (Postgres 11+): solo toma el candado un instante.
alter table retail.venta_items add column if not exists es_regalo boolean not null default false;

comment on column retail.venta_items.es_regalo is
  'ADR-0288 D-7 (D-101): esta prenda es para regalar, no para la clienta del ticket. La ficha no deduce su talla de ella (deducirTallas la salta). Se marca por línea solo si hay clienta elegida; la guarda registrar_venta desde p_items.';

reset lock_timeout;
notify pgrst, 'reload schema';
-- ============================== FIN DE LA PARTE 3 ==============================
