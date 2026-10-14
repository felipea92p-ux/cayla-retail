-- ============================================================================
-- 20261014223000_tienda_cuentas_parte1_clientas.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 2 · PARTE 1 de 2
--
-- QUÉ HACE. SOLO `clientas`: `registro_origen` acepta 'web', la ficha que nace cuando alguien crea su cuenta en la tienda
-- online (`retail.tienda_registrar_cuenta`, PARTE 2). Hasta hoy aceptaba 'caja' (la registró una persona de CAYLA) y 'cartel'
-- (se registró sola escaneando el QR del cartel, ADR-0288 G-10).
--
-- POR QUÉ VA SOLA. Toda venta con cliente lee `clientas`, y cambiar un candado toma la tabla en exclusiva hasta el final de la
-- transacción (el SQL Editor corre todo lo pegado en una sola): así el bloqueo dura lo que dura este cambio y nada más, como la
-- PARTE 1 del club (20261001210000). Sin políticas ni `drop trigger` (CLAUDE.md, «Políticas y deadlocks»).
--
-- PRODUCCIÓN. NO está aplicada (nadie toca producción en esta actividad). Se pega PRIMERO, sola en el SQL Editor, y después la
-- PARTE 2 (20261014224000_tienda_cuentas_parte2_cuentas_web.sql). Se puede pegar dos veces.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.clientas drop constraint if exists clientas_registro_origen_valido;
alter table retail.clientas add constraint clientas_registro_origen_valido
  check (registro_origen in ('caja', 'cartel', 'web'));

comment on column retail.clientas.registro_origen is
  'De dónde salió la ficha (ADR-0288 G-10, ADR-0408): caja = la registró una persona de CAYLA (caja, la ficha o una importación; toda ficha anterior a la tanda 1g); cartel = se registró ella sola escaneando el QR del cartel (registrarse_en_el_club); web = creó su cuenta en la tienda online (tienda_registrar_cuenta). No cambia después.';

reset lock_timeout;
