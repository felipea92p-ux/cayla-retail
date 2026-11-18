-- ============================================================================
-- 20261118154000_club_avisos_del_club_parte1_clientas.sql — CAYLA V2 · Club · dos permisos de WhatsApp (ADR-0680), PARTE 1 de 3
--
-- EL PROBLEMA PRIMERO. Un solo permiso (`publicidad_whatsapp`) habilitaba los cuatro avisos del Club: el regalo de cumpleaños y los
-- puntos por eliminarse (avisos de servicio) y las novedades y rebajas (publicidad). En la tienda online la casilla se titulaba
-- «Avisos del Club por WhatsApp» pero su texto decía «novedades y promociones», y la política decía «Sin publicidad por WhatsApp»
-- (revisión legal 2026-11-18, H2: un consentimiento para publicidad que no se entiende abre la infracción muy grave del Código del
-- Consumidor, art. 58.1.e). Felipe eligió dos permisos reales: «avisos de mi Club» y «novedades y promociones», cada uno con su
-- casilla, su texto citado y su historia.
--
-- QUÉ HACE ESTA PARTE: solo la foto del permiso nuevo en la ficha, `clientas.avisos_club_desde` (igual que `publicidad_desde`: desde
-- cuándo lo tiene; null = no lo tiene). Va SOLA porque `clientas` la usa la caja todo el día: un `alter` de una tabla en uso no se
-- mezcla con nada más (CLAUDE.md, «Políticas y deadlocks»).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe): esta parte sola, después las partes 2 (20261118155000) y 3 (20261118160000), en
-- ese orden y por separado. Idempotente.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

alter table retail.clientas add column if not exists avisos_club_desde timestamptz;

comment on column retail.clientas.avisos_club_desde is
  'Desde cuándo tiene el permiso «avisos de mi Club por WhatsApp» (regalo de cumpleaños, puntos por eliminarse), o null. Es la foto de club_permisos (finalidad avisos_club_whatsapp): la mantiene el disparador club_permisos_avisos_del_club, nadie la escribe a mano. ADR-0680.';

reset lock_timeout;
