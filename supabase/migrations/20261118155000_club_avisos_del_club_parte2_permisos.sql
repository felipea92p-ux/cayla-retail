-- ============================================================================
-- 20261118155000_club_avisos_del_club_parte2_permisos.sql — CAYLA V2 · Club · dos permisos de WhatsApp (ADR-0680), PARTE 2 de 3
-- Sigue a la parte 1 (20261118154000, `clientas.avisos_club_desde`). El problema, en la parte 1.
--
-- QUÉ HACE ESTA PARTE
--   1. `club_textos`: el tipo nuevo `casilla_avisos_club` y su texto v1, el que Felipe eligió (2026-11-18): «Quiero recibir por
--      WhatsApp los avisos de mi Club: mis puntos, mis cupones, mi regalo de cumpleaños y antes de que se venzan mis puntos.»
--      La casilla de publicidad (`casilla_publicidad` v2, «novedades y promociones») sigue igual: ahora solo da la publicidad.
--   2. `club_permisos`: la finalidad nueva `avisos_club_whatsapp`. Tiene filas propias SOLO cuando su consentimiento es propio:
--      · la OTORGA la casilla de la tienda online (`tienda_web`, citando `casilla_avisos_club`), y nada más: nadie la marca de
--        palabra. Los canales de UN solo consentimiento (su mensaje, `whatsapp_propio`; la página del QR, `qr_web`; el cartel,
--        `pagina_cartel`) no escriben fila de avisos: la prueba es la fila de la publicidad, cuyo texto o política nombra los dos
--        (la parte 3 solo mueve la foto). Las dos casillas en el cartel y el QR son otra obra (Felipe 2026-11-18);
--      · la QUITAN la BAJA, el cambio de celular, el cartel (al registrarse con otro número) y anonimizar, como la publicidad
--        (Felipe 2026-11-18: «BAJA quita todo»). El cambio de celular lo detecta un disparador, sin persona: va con su nota.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe): después de la parte 1, sola. Sin políticas ni disparadores: solo `alter` de
-- candados y un `insert` del texto. Idempotente.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. El texto de la casilla nueva ----------
alter table retail.club_textos drop constraint if exists club_textos_tipo_valido;
alter table retail.club_textos add constraint club_textos_tipo_valido check (tipo = any (array[
  'club', 'mensaje_personal', 'mensaje_generico', 'pagina_publicidad', 'terminos', 'privacidad', 'casilla_publicidad', 'saludo',
  'aviso_cumpleanos', 'aviso_aniversario', 'aviso_novedades', 'aviso_rebaja', 'aviso_puntos', 'aviso_cierre',
  'casilla_avisos_club']));

insert into retail.club_textos (tipo, version, texto, creado_por) values
  ('casilla_avisos_club', 1,
   $texto$Quiero recibir por WhatsApp los avisos de mi Club: mis puntos, mis cupones, mi regalo de cumpleaños y antes de que se venzan mis puntos.$texto$,
   null)
on conflict (tipo, version) do nothing;

-- ---------- 2. La finalidad nueva y lo que puede cada medio ----------
alter table retail.club_permisos drop constraint if exists club_permisos_finalidad_valida;
alter table retail.club_permisos add constraint club_permisos_finalidad_valida
  check (finalidad in ('club', 'publicidad_whatsapp', 'avisos_club_whatsapp'));

alter table retail.club_permisos drop constraint if exists club_permisos_medio_coherente;
alter table retail.club_permisos add constraint club_permisos_medio_coherente
  check ((medio in ('caja_palabra', 'ficha') and finalidad = 'club' and accion = 'otorga')
      or (medio = 'whatsapp_propio' and finalidad in ('club', 'publicidad_whatsapp') and accion = 'otorga')
      or (medio = 'qr_web' and finalidad = 'publicidad_whatsapp' and accion = 'otorga')
      or (medio = 'pagina_cartel' and finalidad in ('club', 'publicidad_whatsapp') and accion = 'otorga')
      or (medio = 'pagina_cartel' and finalidad in ('publicidad_whatsapp', 'avisos_club_whatsapp') and accion = 'revoca')
      or (medio in ('baja_whatsapp', 'cambio_celular') and finalidad in ('publicidad_whatsapp', 'avisos_club_whatsapp') and accion = 'revoca')
      or (medio = 'anonimizar' and accion = 'revoca')
      or (medio = 'legado' and finalidad = 'club' and accion = 'otorga')
      or (medio = 'tienda_web' and finalidad in ('publicidad_whatsapp', 'avisos_club_whatsapp') and accion = 'otorga'));

-- Un evento de avisos que escribe el sistema solo (el cambio de celular que detecta el disparador de `clientas`) va sin persona, con su
-- nota que dice por qué.
alter table retail.club_permisos drop constraint if exists club_permisos_con_quien_registra;
alter table retail.club_permisos add constraint club_permisos_con_quien_registra
  check (medio in ('legado', 'qr_web', 'pagina_cartel', 'tienda_web')
      or registrado_por is not null
      or (medio = 'anonimizar' and nullif(btrim(nota), '') is not null)
      or (finalidad = 'avisos_club_whatsapp' and nullif(btrim(nota), '') is not null));

alter table retail.club_permisos drop constraint if exists club_permisos_texto_del_medio;
alter table retail.club_permisos add constraint club_permisos_texto_del_medio
  check (texto_tipo is null
      or (medio in ('caja_palabra', 'ficha') and texto_tipo = 'club')
      or (medio = 'whatsapp_propio' and texto_tipo in ('mensaje_personal', 'mensaje_generico'))
      or (medio = 'qr_web' and texto_tipo = 'pagina_publicidad')
      or (medio = 'pagina_cartel' and finalidad = 'club' and texto_tipo = 'terminos')
      or (medio = 'pagina_cartel' and finalidad = 'publicidad_whatsapp' and texto_tipo = 'casilla_publicidad')
      or (medio = 'tienda_web' and finalidad = 'publicidad_whatsapp' and texto_tipo = 'casilla_publicidad')
      or (medio = 'tienda_web' and finalidad = 'avisos_club_whatsapp' and texto_tipo = 'casilla_avisos_club'));

-- Como la publicidad (Ley 32323): los avisos del Club los otorga ella, marcando su casilla. Nadie los marca de palabra.
alter table retail.club_permisos drop constraint if exists club_permisos_avisos_club_solo_de_ella;
alter table retail.club_permisos add constraint club_permisos_avisos_club_solo_de_ella
  check (not (finalidad = 'avisos_club_whatsapp' and accion = 'otorga') or medio = 'tienda_web');

comment on table retail.club_permisos is
  'La historia de los permisos del club (ADR-0288 D-4, ADR-0680): club (su «sí»), publicidad por WhatsApp (novedades y rebajas) y avisos del Club por WhatsApp (regalo de cumpleaños, puntos por eliminarse). La publicidad y los avisos solo los da ella: un mensaje suyo (whatsapp_propio), la página de su QR (qr_web, retirada en la 1g), la página del cartel (pagina_cartel) o una casilla de su cuenta en la tienda online (tienda_web, cada permiso con la suya). Los avisos tienen filas propias solo cuando su consentimiento es propio (la casilla de la tienda online); los canales de un solo consentimiento (su mensaje, el QR, el cartel) dan los dos con UNA fila de publicidad, que es la prueba, y la foto avisos_club_desde la mueve el disparador club_permisos_avisos_del_club. La BAJA, el cambio de celular y anonimizar quitan los dos (ADR-0680). Sin registrado_por: legado, qr_web, pagina_cartel y tienda_web (lo hizo ella), la anonimización automática (con nota) y el cambio de celular que detecta el disparador (avisos, con nota). De solo agregar, como movimientos: un disparador rechaza update, delete y truncate. Sin teléfono. clientas.club_desde, publicidad_desde y avisos_club_desde son su foto.';

reset lock_timeout;
