-- ============================================================================
-- 20260930200000_club_paso1b_parte1_whatsapp_tienda.sql — CAYLA V2 · Club de clientas · tanda 1b · PARTE 1 de 2
-- ADR-0288 («Contrato de la tanda 1b»). SOLO `ubicaciones.whatsapp_numero`: el celular de WhatsApp de cada tienda, para
-- el QR del club. Va sola porque toda venta lee `ubicaciones` (ver la cabecera completa, el porqué y la verificación en la
-- PARTE 2: 20260930200100_club_paso1b_parte2_permisos_y_qr.sql). Se pega PRIMERO, sola en el SQL Editor; se puede pegar
-- dos veces. Sin políticas ni `drop trigger`.
-- ============================================================================

-- ============================== PARTE 1 · ubicaciones (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.ubicaciones add column if not exists whatsapp_numero text;
alter table retail.ubicaciones drop constraint if exists ubicaciones_whatsapp_numero_formato;
alter table retail.ubicaciones add constraint ubicaciones_whatsapp_numero_formato
  check (whatsapp_numero is null or whatsapp_numero ~ '^9[0-9]{8}$');
comment on column retail.ubicaciones.whatsapp_numero is
  'El celular de WhatsApp de la tienda (9 dígitos que empiezan en 9), para el QR del club (wa.me/51...). Null = sin QR: el club sigue funcionando sin publicidad (ADR-0288). Lo guarda guardar_whatsapp_tienda.';

reset lock_timeout;
notify pgrst, 'reload schema';
-- ============================== FIN DE LA PARTE 1 ==============================
