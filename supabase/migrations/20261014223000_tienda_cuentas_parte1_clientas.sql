-- ============================================================================
-- 20261014223000_tienda_cuentas_parte1_clientas.sql — CAYLA V2 · Tienda online (ADR-0408), actividades 2 y 2b · PARTE 1 de 2
--
-- QUÉ HACE. Solo candados de dos tablas que ya están en uso:
--   1. `clientas.registro_origen` acepta 'web', la ficha que nace cuando alguien crea su cuenta en la tienda online
--      (`retail.tienda_registrar_cuenta`, PARTE 2). Hasta hoy aceptaba 'caja' (la registró una persona de CAYLA) y 'cartel' (se
--      registró sola escaneando el QR del cartel, ADR-0288 G-10).
--   2. (Actividad 2b, Felipe 2026-10-14) `club_permisos` conoce un medio más, 'tienda_web': la casilla opcional «Avisos del
--      Club por WhatsApp» que la persona marca ella misma al crear su cuenta. Como la del cartel: solo OTORGA la publicidad, cita
--      el texto aprobado de la casilla (`casilla_publicidad`, el mismo del cartel) y no lleva quién lo registró (lo hizo ella).
--      Es la puerta que la ley del club pide (`club_permisos_publicidad_solo_por_su_mensaje`: la publicidad la da ella, nunca de
--      palabra ni desde la ficha), y `clientas.publicidad_desde` es lo que miran los avisos (`fn_club_avisos_pendientes`).
--
-- POR QUÉ VA SOLA. Toda venta con cliente lee `clientas`, y cambiar un candado toma la tabla en exclusiva hasta el final de la
-- transacción (el SQL Editor corre todo lo pegado en una sola): así el bloqueo dura lo que dura este cambio y nada más, como la
-- PARTE 1 del club (20261001210000). Sin políticas ni `drop trigger` (CLAUDE.md, «Políticas y deadlocks»). Los candados de
-- `club_permisos` se rehacen con todo lo que ya aceptaban, más 'tienda_web' (los de antes, copiados de su definición viva).
--
-- PRODUCCIÓN. NO está aplicada (nadie toca producción en esta actividad). Se pega PRIMERO, sola en el SQL Editor, y después la
-- PARTE 2 (20261014224000_tienda_cuentas_parte2_cuentas_web.sql). Se puede pegar dos veces.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. clientas: la ficha que nace en la tienda online ----------
alter table retail.clientas drop constraint if exists clientas_registro_origen_valido;
alter table retail.clientas add constraint clientas_registro_origen_valido
  check (registro_origen in ('caja', 'cartel', 'web'));

comment on column retail.clientas.registro_origen is
  'De dónde salió la ficha (ADR-0288 G-10, ADR-0408): caja = la registró una persona de CAYLA (caja, la ficha o una importación; toda ficha anterior a la tanda 1g); cartel = se registró ella sola escaneando el QR del cartel (registrarse_en_el_club); web = creó su cuenta en la tienda online (tienda_registrar_cuenta). No cambia después.';

-- ---------- 2. club_permisos: la casilla de WhatsApp de la tienda online ----------
alter table retail.club_permisos drop constraint if exists club_permisos_medio_valido;
alter table retail.club_permisos add constraint club_permisos_medio_valido
  check (medio in ('caja_palabra', 'ficha', 'whatsapp_propio', 'qr_web', 'pagina_cartel', 'baja_whatsapp', 'cambio_celular',
                   'anonimizar', 'legado', 'tienda_web'));

alter table retail.club_permisos drop constraint if exists club_permisos_medio_coherente;
alter table retail.club_permisos add constraint club_permisos_medio_coherente
  check ((medio in ('caja_palabra', 'ficha') and finalidad = 'club' and accion = 'otorga')
      or (medio = 'whatsapp_propio' and accion = 'otorga')
      or (medio = 'qr_web' and finalidad = 'publicidad_whatsapp' and accion = 'otorga')
      or (medio = 'pagina_cartel' and accion = 'otorga')
      or (medio = 'pagina_cartel' and finalidad = 'publicidad_whatsapp' and accion = 'revoca')
      or (medio in ('baja_whatsapp', 'cambio_celular') and finalidad = 'publicidad_whatsapp' and accion = 'revoca')
      or (medio = 'anonimizar' and accion = 'revoca')
      or (medio = 'legado' and finalidad = 'club' and accion = 'otorga')
      or (medio = 'tienda_web' and finalidad = 'publicidad_whatsapp' and accion = 'otorga'));

alter table retail.club_permisos drop constraint if exists club_permisos_con_quien_registra;
alter table retail.club_permisos add constraint club_permisos_con_quien_registra
  check (medio in ('legado', 'qr_web', 'pagina_cartel', 'tienda_web')
      or registrado_por is not null
      or (medio = 'anonimizar' and nullif(btrim(nota), '') is not null));

alter table retail.club_permisos drop constraint if exists club_permisos_texto_del_medio;
alter table retail.club_permisos add constraint club_permisos_texto_del_medio
  check (texto_tipo is null
      or (medio in ('caja_palabra', 'ficha') and texto_tipo = 'club')
      or (medio = 'whatsapp_propio' and texto_tipo in ('mensaje_personal', 'mensaje_generico'))
      or (medio = 'qr_web' and texto_tipo = 'pagina_publicidad')
      or (medio = 'pagina_cartel' and finalidad = 'club' and texto_tipo = 'terminos')
      or (medio = 'pagina_cartel' and finalidad = 'publicidad_whatsapp' and texto_tipo = 'casilla_publicidad')
      or (medio = 'tienda_web' and finalidad = 'publicidad_whatsapp' and texto_tipo = 'casilla_publicidad'));

-- La ley (Ley 32323): la publicidad la otorga ella, por un mensaje suyo o marcando una casilla. Ahora también la de la tienda.
alter table retail.club_permisos drop constraint if exists club_permisos_publicidad_solo_por_su_mensaje;
alter table retail.club_permisos add constraint club_permisos_publicidad_solo_por_su_mensaje
  check (not (finalidad = 'publicidad_whatsapp' and accion = 'otorga')
      or medio in ('whatsapp_propio', 'qr_web', 'pagina_cartel', 'tienda_web'));

alter table retail.club_permisos drop constraint if exists club_permisos_tienda_web_lo_registra_ella;
alter table retail.club_permisos add constraint club_permisos_tienda_web_lo_registra_ella
  check (medio <> 'tienda_web' or registrado_por is null);

comment on table retail.club_permisos is
  'La historia de los dos permisos del club (ADR-0288 D-4): club (su «sí») y publicidad por WhatsApp (solo si lo hizo ella: un mensaje suyo, medio whatsapp_propio; la casilla de la página de su QR, qr_web, retirado en la 1g; la página del cartel, pagina_cartel, que da el club citando los términos y la publicidad citando la casilla, y quita la publicidad del número de antes si ella se registra con otro; o la casilla «Avisos del Club por WhatsApp» de su cuenta en la tienda online, tienda_web, que solo da la publicidad citando la misma casilla, ADR-0408). Sin registrado_por: legado, qr_web, pagina_cartel y tienda_web (lo hizo ella) y la anonimización automática por conservación (medio anonimizar con nota). De solo agregar, como movimientos: un disparador rechaza update, delete y truncate. Sin teléfono. clientas.club_desde y publicidad_desde son su foto. Los eventos de una ficha unida se quedan con ella (clientas_fusiones lleva a la que quedó).';

reset lock_timeout;
