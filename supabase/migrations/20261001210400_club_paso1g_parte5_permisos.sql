-- ============================================================================
-- 20261001210400_club_paso1g_parte5_permisos.sql — CAYLA V2 · Club de clientas · tanda 1g · PARTE 5 de 8
-- ADR-0288 (G-1, G-3, G-12, G-15 y «Contrato de la tanda 1g»). SOLO `club_permisos`: el medio `pagina_cartel` (ella se
-- une sola en la página del cartel) y la anonimización automática por conservación. Va sola porque cambiarle los candados
-- toma `club_permisos` en exclusiva, y la caja escribe ahí (cabecera completa en la PARTE 8,
-- 20261001210700_club_paso1g_parte8_funciones.sql). Se pega QUINTA, sola en el SQL Editor; se puede pegar dos veces. Sin
-- políticas ni `drop trigger`. Los candados se rehacen con `drop … if exists` + `add`: la tabla es de solo agregar y todas
-- sus filas de antes cumplen los nuevos (cada uno solo AGREGA un caso).
--
-- QUÉ PUEDE `pagina_cartel`:
--   · otorga `club` citando el texto `terminos` que ella aceptó (la `nota` dice también la versión de `privacidad`);
--   · otorga `publicidad_whatsapp` citando la `casilla_publicidad` que marcó (la ley: nace de algo que hizo ELLA, Ley 32323
--     art. 58.1.e: escanear el cartel por iniciativa propia y marcar una casilla que viene sin marcar);
--   · revoca `publicidad_whatsapp` cuando ella se vuelve a registrar con OTRO celular: la publicidad era del número de antes
--     (ADR-0288 D-4, ajuste d), y el nuevo solo la recupera si en esa misma página marca la casilla.
--   Siempre SIN `registrado_por`: lo hizo ella, no una persona de la tienda (como `qr_web`).
-- QUÉ CAMBIA DE `anonimizar`: puede ir sin `registrado_por` si lleva `nota` (la anonimización automática a los 3 años sin
--   compras, G-15: la hace el sistema y la nota dice por qué). La de una persona sigue llevando quién.
-- ============================================================================

-- ============================== PARTE 5 · club_permisos (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.club_permisos drop constraint if exists club_permisos_medio_valido;
alter table retail.club_permisos add constraint club_permisos_medio_valido
  check (medio in ('caja_palabra', 'ficha', 'whatsapp_propio', 'qr_web', 'pagina_cartel', 'baja_whatsapp', 'cambio_celular',
                   'anonimizar', 'legado'));

alter table retail.club_permisos drop constraint if exists club_permisos_medio_coherente;
alter table retail.club_permisos add constraint club_permisos_medio_coherente check (
     (medio in ('caja_palabra', 'ficha') and finalidad = 'club' and accion = 'otorga')
  or (medio = 'whatsapp_propio' and accion = 'otorga')
  or (medio = 'qr_web' and finalidad = 'publicidad_whatsapp' and accion = 'otorga')
  or (medio = 'pagina_cartel' and accion = 'otorga')
  or (medio = 'pagina_cartel' and finalidad = 'publicidad_whatsapp' and accion = 'revoca')
  or (medio in ('baja_whatsapp', 'cambio_celular') and finalidad = 'publicidad_whatsapp' and accion = 'revoca')
  or (medio = 'anonimizar' and accion = 'revoca')
  or (medio = 'legado' and finalidad = 'club' and accion = 'otorga')
);

-- La ley (Ley 32323, art. 58.1.e): la publicidad SOLO nace de algo que hizo ELLA: un mensaje que escribió a la tienda, la
-- casilla de la página de su QR (camino B, retirado) o la casilla de la página del cartel.
alter table retail.club_permisos drop constraint if exists club_permisos_publicidad_solo_por_su_mensaje;
alter table retail.club_permisos add constraint club_permisos_publicidad_solo_por_su_mensaje
  check (not (finalidad = 'publicidad_whatsapp' and accion = 'otorga') or medio in ('whatsapp_propio', 'qr_web', 'pagina_cartel'));

alter table retail.club_permisos drop constraint if exists club_permisos_texto_del_medio;
alter table retail.club_permisos add constraint club_permisos_texto_del_medio check (
     texto_tipo is null
  or (medio in ('caja_palabra', 'ficha') and texto_tipo = 'club')
  or (medio = 'whatsapp_propio' and texto_tipo in ('mensaje_personal', 'mensaje_generico'))
  or (medio = 'qr_web' and texto_tipo = 'pagina_publicidad')
  or (medio = 'pagina_cartel' and finalidad = 'club' and texto_tipo = 'terminos')
  or (medio = 'pagina_cartel' and finalidad = 'publicidad_whatsapp' and texto_tipo = 'casilla_publicidad')
);

-- Quién registra: una persona de la tienda, salvo el legado (nadie sabe quién lo marcó), lo que hizo ELLA en una página
-- (qr_web, pagina_cartel: ahí NO puede haber una persona) y la anonimización automática (el sistema; con su nota).
alter table retail.club_permisos drop constraint if exists club_permisos_con_quien_registra;
alter table retail.club_permisos add constraint club_permisos_con_quien_registra
  check (medio in ('legado', 'qr_web', 'pagina_cartel') or registrado_por is not null
         or (medio = 'anonimizar' and nullif(btrim(nota), '') is not null));
alter table retail.club_permisos drop constraint if exists club_permisos_pagina_cartel_lo_registra_ella;
alter table retail.club_permisos add constraint club_permisos_pagina_cartel_lo_registra_ella
  check (medio <> 'pagina_cartel' or registrado_por is null);

comment on table retail.club_permisos is
  'La historia de los dos permisos del club (ADR-0288 D-4): club (su «sí») y publicidad por WhatsApp (solo si lo hizo ella: un mensaje suyo, medio whatsapp_propio; la casilla de la página de su QR, qr_web, retirado en la 1g; o la página del cartel, pagina_cartel, que da el club citando los términos y la publicidad citando la casilla, y quita la publicidad del número de antes si ella se registra con otro). Sin registrado_por: legado, qr_web y pagina_cartel (lo hizo ella) y la anonimización automática por conservación (medio anonimizar con nota). De solo agregar, como movimientos: un disparador rechaza update, delete y truncate. Sin teléfono. clientas.club_desde y publicidad_desde son su foto. Los eventos de una ficha unida se quedan con ella (clientas_fusiones lleva a la que quedó).';

reset lock_timeout;
notify pgrst, 'reload schema';
-- ============================== FIN DE LA PARTE 5 ==============================
