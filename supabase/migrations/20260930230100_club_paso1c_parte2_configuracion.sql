-- ============================================================================
-- 20260930230100_club_paso1c_parte2_configuracion.sql — CAYLA V2 · Club de clientas · tanda 1c · PARTE 2 de 3
-- ADR-0288 (D-5 y «Contrato de la tanda 1c»). SOLO `configuracion_empresa.club_cumple_pct`: el % del cumpleaños (10 por
-- defecto, entre 1 y 50), para que Felipe lo ajuste con datos sin migrar (pendiente 5 de CL-G). Va sola porque toda venta
-- lee `configuracion_empresa` (`fn_exige_responsable`, desde `fn_actor_persona_id`) antes de escribir: tomada en la misma
-- transacción que `venta_items` o que las llaves de `club_canjes`, una venta a medio camino las esperaría en el orden
-- contrario (deadlock). La cabecera completa está en la PARTE 3, 20260930230200_club_paso1c_parte3_cumpleanos.sql. Se pega
-- SEGUNDA, sola en el SQL Editor; se puede pegar dos veces. Sin políticas ni `drop trigger`.
--
-- Para cambiar el % (solo lo decide Felipe, CL-G):
--   update retail.configuracion_empresa set club_cumple_pct = 12;
-- ============================================================================

-- ============================== PARTE 2 · configuracion_empresa (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.configuracion_empresa add column if not exists club_cumple_pct numeric(5,2) not null default 10;
alter table retail.configuracion_empresa drop constraint if exists configuracion_empresa_club_cumple_pct_valido;
alter table retail.configuracion_empresa add constraint configuracion_empresa_club_cumple_pct_valido
  check (club_cumple_pct >= 1 and club_cumple_pct <= 50);
comment on column retail.configuracion_empresa.club_cumple_pct is
  'El % de descuento del cumpleaños de una socia del club (ADR-0288 D-5): un canje por año, en su mes, sobre toda la compra y en cascada. Entre 1 y 50; 10 por defecto. Lo leen registrar_venta (que lo calcula) y resumen_clienta_caja (que lo muestra). Sin fila de configuración (una base recién armada) vale 10.';

reset lock_timeout;
notify pgrst, 'reload schema';
-- ============================== FIN DE LA PARTE 2 ==============================
