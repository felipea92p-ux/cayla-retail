-- ============================================================================
-- 20261118160000_club_avisos_del_club_parte3_funciones.sql — CAYLA V2 · Club · dos permisos de WhatsApp (ADR-0680), PARTE 3 de 3
-- Sigue a las partes 1 (20261118154000, `clientas.avisos_club_desde`) y 2 (20261118155000, la finalidad y su texto). El problema,
-- en la parte 1.
--
-- QUÉ HACE ESTA PARTE
--   1. `fn_club_avisos_del_club` + disparador `club_permisos_avisos_del_club` (después de cada evento de `club_permisos`). Regla: el
--      historial prueba lo que pasó, sin filas de más.
--      · un evento propio de avisos (la casilla de la tienda online, su BAJA, su cambio de celular) mueve la foto
--        `clientas.avisos_club_desde`;
--      · la publicidad de un canal de UN solo consentimiento (su mensaje, `whatsapp_propio`, cuyo texto dice «mi saludo de
--        cumpleaños»; la página del QR, `qr_web`, igual; el cartel, `pagina_cartel`, cuya política v2 dice «novedades, promociones y
--        avisos de tus cupones») enciende también la foto de los avisos, SIN fila propia: su prueba es esa fila de publicidad. La
--        casilla de publicidad de la tienda online (`tienda_web`) no: allí cada permiso tiene su casilla. Las dos casillas en el cartel
--        y el QR son otra obra (Felipe 2026-11-18);
--      · quitar la publicidad o salir del club (BAJA, cambio de celular, el cartel con otro número, anonimizar) apaga también los
--        avisos (Felipe 2026-11-18: «BAJA quita todo»). Si los avisos tenían su propia fila (vinieron de su casilla), se escribe su
--        `revoca` con el mismo medio y la misma persona; si venían con la publicidad, la fila de la publicidad ya lo prueba.
--   2. `fn_club_avisos_al_cambiar_celular` + disparador `clientas_celular_con_avisos` (después de cambiar el celular de una ficha que
--      tiene los avisos): los avisos eran para el número de antes, se quitan. Si en la misma operación ella escribió desde el número
--      nuevo (`whatsapp_propio`, como el disparador de la publicidad), se quedan.
--   3. `registrar_baja_whatsapp` (reemplazo anclado): a una ficha que solo tenía los avisos (sin publicidad), la BAJA también se los
--      quita. Con publicidad, ya lo hace el disparador.
--   4. `tienda_unirse_al_club` (reemplazo anclado, firma nueva): dos parámetros al final, `p_avisos_club` y
--      `p_casilla_avisos_version`, con valor de fábrica (la web de antes, que llama con 14, sigue funcionando). La casilla de avisos
--      cita `casilla_avisos_club` y tiene el mismo candado del celular que la de publicidad. Devuelve `avisos_club`.
--      Y `tienda_casilla_avisos_club()`: el texto vigente de esa casilla y su versión, como `tienda_casilla_whatsapp()` el de publicidad.
--   5. `fn_club_avisos_pendientes` (reemplazos anclados): el regalo de cumpleaños y los puntos por eliminarse se mandan a quien tiene
--      los AVISOS; las novedades y las rebajas, a quien tiene la PUBLICIDAD.
--   6. El legado (Felipe 2026-11-18: «se conservan»): quien hoy tiene la publicidad tiene los avisos desde la misma fecha (solo la
--      foto: la prueba es su fila de publicidad, que los incluía). Nadie deja de recibir lo que ya recibía.
--
-- DECIDÍ: un disparador en `club_permisos`, y no tocar cada función que da o quita la publicidad (el cartel, «Llegó su mensaje»,
--   anonimizar, quitar por celular): la regla «van juntos» vive en un solo lugar, la historia sigue siendo de solo agregar y no se
--   duplica (una fila de avisos solo existe cuando el consentimiento de avisos fue propio). Solo se tocan las tres funciones que no se
--   pueden cubrir así (la BAJA de quien solo tiene los avisos, la casilla nueva y el selector de avisos).
-- DESCARTÉ: una fila de avisos «espejo» por cada fila de publicidad: duplicaba la prueba (dos filas para un solo toque de ella) y
--   cambiaba lo que ya registraban el cartel, la BAJA y anonimizar. Y calcular los avisos al vuelo desde la historia, sin foto:
--   `fn_club_avisos_pendientes` filtra miles de fichas por la foto, como con la publicidad.
--
-- SE ROMPE SI una función nueva da la publicidad por un canal de un solo consentimiento que no está en la lista del disparador (sus
-- avisos no se encenderían), o cambia el celular sin pasar por `clientas` (no existe otro lugar).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe): después de las partes 1 y 2, sola. ANTES de publicar la web nueva (la tienda
-- nueva llama a `tienda_unirse_al_club` con 16 parámetros y el ERP lee `avisos_club_desde`). Sin políticas. Usa
-- `create or replace trigger`, nunca `drop trigger` (ADR-0195). Sin `select … into` dentro de un texto entre comillas (ADR-0288).
-- Los reemplazos anclados van en el formato que las pruebas del club leen para deshacerlos (`pg_temp.reemplazar`, `$v$`/`$n$`).
-- Idempotente: cada reemplazo mira primero si ya está aplicado.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'clientas' and column_name = 'avisos_club_desde') then
    raise exception 'Falta la PARTE 1 (clientas.avisos_club_desde): pega antes 20261118154000.';
  end if;
  if not exists (select 1 from retail.club_textos where tipo = 'casilla_avisos_club') then
    raise exception 'Falta la PARTE 2 (el texto casilla_avisos_club y la finalidad nueva): pega antes 20261118155000.';
  end if;
end;
$$;

-- ---------- 1. Los avisos van con la publicidad donde el consentimiento fue uno solo ----------
create or replace function retail.fn_club_avisos_del_club()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
declare
  v_con_avisos boolean;
  v_propios integer;
begin
  -- Un evento propio de los avisos: su foto.
  if new.finalidad = 'avisos_club_whatsapp' then
    if new.accion = 'otorga' then
      update retail.clientas c set avisos_club_desde = new.created_at where c.id = new.clienta_id and c.avisos_club_desde is null;
    else
      update retail.clientas c set avisos_club_desde = null where c.id = new.clienta_id and c.avisos_club_desde is not null;
    end if;
    return null;
  end if;

  v_con_avisos := coalesce((select c.avisos_club_desde is not null from retail.clientas c where c.id = new.clienta_id), false);

  -- Quitar la publicidad o salir del club apaga también los avisos (BAJA, cambio de celular, el cartel con otro número, anonimizar).
  if new.accion = 'revoca' then
    if v_con_avisos then
      -- ¿Vinieron de su propia casilla (su historia de avisos está abierta)? Entonces su `revoca`, con el mismo medio y la misma persona.
      v_propios := (select count(*) filter (where p.accion = 'otorga') - count(*) filter (where p.accion = 'revoca')
                      from retail.club_permisos p where p.clienta_id = new.clienta_id and p.finalidad = 'avisos_club_whatsapp');
      if v_propios > 0 then
        insert into retail.club_permisos (clienta_id, finalidad, accion, medio, ubicacion_id, registrado_por, nota)
        values (new.clienta_id, 'avisos_club_whatsapp', 'revoca', new.medio, new.ubicacion_id, new.registrado_por,
                case when new.finalidad = 'club' then 'junto con su salida del club' else 'junto con la publicidad por WhatsApp' end);
      else
        update retail.clientas c set avisos_club_desde = null where c.id = new.clienta_id;
      end if;
    end if;
    return null;
  end if;

  -- La publicidad de un canal de un solo consentimiento (su texto o su política nombran los dos) enciende también los avisos.
  if new.finalidad = 'publicidad_whatsapp' and new.medio in ('whatsapp_propio', 'qr_web', 'pagina_cartel') and not v_con_avisos then
    update retail.clientas c set avisos_club_desde = new.created_at where c.id = new.clienta_id and c.avisos_club_desde is null;
  end if;
  return null;
end;
$$;

comment on function retail.fn_club_avisos_del_club() is
  'Disparador de club_permisos (ADR-0680): mueve la foto clientas.avisos_club_desde. Un evento propio de avisos (la casilla de la tienda online, su BAJA, su cambio de celular) la mueve; la publicidad de un canal de un solo consentimiento (whatsapp_propio, qr_web, pagina_cartel) la enciende sin fila propia (su fila de publicidad es la prueba); quitar la publicidad o salir del club la apaga, con su revoca propio si los avisos tenían fila propia. La casilla de publicidad de la tienda online (tienda_web) no enciende los avisos.';

create or replace trigger club_permisos_avisos_del_club after insert on retail.club_permisos
  for each row execute function retail.fn_club_avisos_del_club();

-- ---------- 2. Cambiar el celular quita los avisos (si no escribió desde el número nuevo) ----------
create or replace function retail.fn_club_avisos_al_cambiar_celular()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  -- Escribió desde el número nuevo en esta misma operación («Llegó su mensaje»): el permiso es de ese número, se queda.
  if exists (select 1 from retail.club_permisos p
              where p.clienta_id = new.id and p.accion = 'otorga' and p.medio = 'whatsapp_propio' and p.created_at = now()) then
    return null;
  end if;
  -- Con su historia de avisos abierta (su casilla), su `revoca`; si venían con la publicidad, se apagan con ella (el camino de la
  -- publicidad, `fn_club_quitar_publicidad_por_celular`, ya escribe su fila).
  if (select count(*) filter (where p.accion = 'otorga') - count(*) filter (where p.accion = 'revoca')
        from retail.club_permisos p where p.clienta_id = new.id and p.finalidad = 'avisos_club_whatsapp') > 0 then
    insert into retail.club_permisos (clienta_id, finalidad, accion, medio, registrado_por, nota)
    values (new.id, 'avisos_club_whatsapp', 'revoca', 'cambio_celular', null,
            'cambió su celular: los avisos del Club eran para el número de antes');
  else
    update retail.clientas c set avisos_club_desde = null where c.id = new.id;
  end if;
  return null;
end;
$$;

comment on function retail.fn_club_avisos_al_cambiar_celular() is
  'Disparador de clientas (ADR-0680): si una ficha con los avisos del Club cambia de celular, se los quita (eran para el número de antes), salvo que en la misma operación ella haya escrito desde el número nuevo (whatsapp_propio). Con publicidad, el camino de siempre (fn_club_quitar_publicidad_por_celular) ya los quita por el disparador de club_permisos.';

create or replace trigger clientas_celular_con_avisos after update on retail.clientas
  for each row
  when (old.avisos_club_desde is not null and new.avisos_club_desde is not null and not new.anonimizada
        and new.telefono_whatsapp is distinct from old.telefono_whatsapp)
  execute function retail.fn_club_avisos_al_cambiar_celular();

revoke all on function retail.fn_club_avisos_del_club(), retail.fn_club_avisos_al_cambiar_celular() from public, anon, authenticated;

-- ---------- 3-5. Reemplazos anclados sobre la definición viva (el formato que leen las pruebas para deshacerlos) ----------
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está. Se mira primero porque, una vez aplicado, el ancla vieja ya no aparece.
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 3. La BAJA de quien solo tenía los avisos.
select pg_temp.reemplazar('retail.registrar_baja_whatsapp(text, uuid)',
$v$    select c.id, c.publicidad_desde
      from retail.clientas c$v$,
$n$    select c.id, c.publicidad_desde, c.avisos_club_desde
      from retail.clientas c$n$,
1);
select pg_temp.reemplazar('retail.registrar_baja_whatsapp(text, uuid)',
$v$    end if;
  end loop;$v$,
$n$    end if;
    -- ADR-0680: la BAJA quita todo. Con la publicidad, el disparador de club_permisos ya apagó los avisos; sin ella, aquí.
    if r.publicidad_desde is null and r.avisos_club_desde is not null then
      insert into retail.club_permisos (clienta_id, finalidad, accion, medio, ubicacion_id, registrado_por)
      values (r.id, 'avisos_club_whatsapp', 'revoca', 'baja_whatsapp', p_ubicacion_id, v_persona);
    end if;
  end loop;$n$,
1);

comment on function retail.registrar_baja_whatsapp(text, uuid) is
  'Escribió BAJA: quita la publicidad y los avisos del Club (medio baja_whatsapp, ADR-0680) de toda ficha con ese celular, desde hoy y en todas las tiendas; su club sigue. Devuelve cuántas fichas tienen ese número. Módulo «Clientas» o «Avisos del club» (ADR-0288 G-7); firma con el responsable del combo.';

-- 4. Unirse al Club desde la tienda online, con la casilla de avisos aparte. La firma cambia (dos parámetros al final, con valor de
--    fábrica): se crea la nueva desde la definición viva y se borra la de antes.
do $do$
declare
  v_vieja constant text := 'retail.tienda_unirse_al_club(uuid, text, text, boolean, text, integer, integer, integer, boolean, boolean, boolean, integer, text, text)';
  v_nueva constant text := 'retail.tienda_unirse_al_club(uuid, text, text, boolean, text, integer, integer, integer, boolean, boolean, boolean, integer, text, text, boolean, integer)';
  v_def text;
  v_cambios text[][] := array[
    -- la cabecera: los dos parámetros nuevos
    array[$a$p_documento_tipo text DEFAULT 'dni'::text)$a$,
          $a$p_documento_tipo text DEFAULT 'dni'::text, p_avisos_club boolean DEFAULT false, p_casilla_avisos_version integer DEFAULT NULL::integer)$a$],
    -- sus variables
    array[$a$  v_avisos boolean := coalesce(p_avisos_whatsapp, false);
$a$,
          $a$  v_avisos boolean := coalesce(p_avisos_whatsapp, false);
  v_avisos_club boolean := coalesce(p_avisos_club, false);
  v_casilla_club integer;
  v_estado_avisos_club text := 'no';
$a$],
    -- el texto que leyó tiene que ser el vigente, como con la publicidad
    array[$a$
  -- 2. Su cuenta y su ficha, tomadas en el orden de siempre$a$,
          $a$
  if v_avisos_club then
    v_casilla_club := (select max(t.version) from retail.club_textos t where t.tipo = 'casilla_avisos_club');
    if v_casilla_club is null then
      raise exception 'Todavía no está publicado el texto de los avisos del Club.' using errcode = 'P0001', hint = 'cuenta_sin_texto', detail = 'avisos_club';
    end if;
    if p_casilla_avisos_version is distinct from v_casilla_club then
      raise exception 'El texto de los avisos del Club cambió mientras te unías: vuelve a leerlo.'
        using errcode = 'P0001', hint = 'cuenta_texto_cambio', detail = 'avisos_club';
    end if;
  end if;

  -- 2. Su cuenta y su ficha, tomadas en el orden de siempre$a$],
    -- el permiso de avisos, con su casilla, su texto y el mismo candado del celular
    array[$a$  perform retail.fn_actividad_anotar(
    'clientas', 'registro_web',$a$,
          $a$  -- 4b. ADR-0680: los avisos de su Club, con su propia casilla y su propio texto citado, solo para el celular que escribió.
  if v_avisos_club then
    v_telefono_ficha := (select c.telefono_whatsapp from retail.clientas c where c.id = v_id);
    if v_telefono_ficha is distinct from v_celular then
      v_estado_avisos_club := 'celular_distinto';
    elsif (select c.avisos_club_desde from retail.clientas c where c.id = v_id) is not null then
      v_estado_avisos_club := 'ya_estaban';
    else
      insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version, ubicacion_id, nota)
      values (v_id, 'avisos_club_whatsapp', 'otorga', 'tienda_web', 'casilla_avisos_club', v_casilla_club, null,
              'desde su cuenta en la tienda online');
      v_estado_avisos_club := 'activados';
    end if;
  end if;

  perform retail.fn_actividad_anotar(
    'clientas', 'registro_web',$a$],
    -- y lo devuelve
    array[$a$    'avisos_whatsapp', v_estado_avisos
  );$a$,
          $a$    'avisos_whatsapp', v_estado_avisos,
    'avisos_club', v_estado_avisos_club
  );$a$]
  ];
  v_n integer;
  i integer;
begin
  if to_regprocedure(v_nueva) is not null then
    -- Ya aplicada: solo falta, quizá, borrar la de antes.
    execute 'drop function if exists ' || v_vieja;
    return;
  end if;
  v_def := pg_get_functiondef(v_vieja::regprocedure);
  for i in 1 .. array_length(v_cambios, 1) loop
    v_n := (length(v_def) - length(replace(v_def, v_cambios[i][1], ''))) / length(v_cambios[i][1]);
    if v_n <> 1 then
      raise exception 'tienda_unirse_al_club cambió desde que se escribió esta migración: el ancla % aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.', i, v_n;
    end if;
    v_def := replace(v_def, v_cambios[i][1], v_cambios[i][2]);
  end loop;
  execute v_def;
  execute 'drop function ' || v_vieja;
end;
$do$;

revoke all on function retail.tienda_unirse_al_club(uuid, text, text, boolean, text, integer, integer, integer, boolean, boolean, boolean, integer, text, text, boolean, integer)
  from public, anon, authenticated;
grant execute on function retail.tienda_unirse_al_club(uuid, text, text, boolean, text, integer, integer, integer, boolean, boolean, boolean, integer, text, text, boolean, integer)
  to tienda_web;
comment on function retail.tienda_unirse_al_club(uuid, text, text, boolean, text, integer, integer, integer, boolean, boolean, boolean, integer, text, text, boolean, integer) is
  'Tienda online (ADR-0438, ADR-0680): une al Club a la persona de una cuenta web, todo o nada, con su documento, su celular y las dos casillas opcionales de WhatsApp, cada una con su texto citado: la publicidad (casilla_publicidad, p_avisos_whatsapp) y los avisos de su Club (casilla_avisos_club, p_avisos_club), las dos solo para el celular que escribió. Devuelve {estado, codigo_club, era_del_club, se_unio_a_su_ficha, nombre_corto, avisos_whatsapp, avisos_club}. Solo la llama tienda_web.';

-- 4c. El texto de la casilla de avisos, para la tienda online (como `tienda_casilla_whatsapp`, la de publicidad): el vigente y su versión.
create or replace function retail.tienda_casilla_avisos_club()
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object('version', t.version, 'texto', t.texto)
    from retail.club_textos t
   where t.tipo = 'casilla_avisos_club'
   order by t.version desc
   limit 1;
$$;
comment on function retail.tienda_casilla_avisos_club() is
  'Tienda online (ADR-0680): el texto aprobado de la casilla «avisos de mi Club por WhatsApp» (club_textos casilla_avisos_club) y su versión {version, texto}, o null. La tienda lo muestra tal cual y manda la versión que leyó. Solo la llama tienda_web.';
revoke all on function retail.tienda_casilla_avisos_club() from public, anon, authenticated;
grant execute on function retail.tienda_casilla_avisos_club() to tienda_web;

-- 5. Cada aviso con su permiso: cumpleaños y puntos con los avisos; novedades y rebajas con la publicidad.
select pg_temp.reemplazar('retail.fn_club_avisos_pendientes(uuid)',
$v$retail.fn_club_nombre_de_pila(c.nombre) as pila, retail.fn_club_es_testigo(c.id) as testigo$v$,
$n$retail.fn_club_nombre_de_pila(c.nombre) as pila, retail.fn_club_es_testigo(c.id) as testigo,
           c.publicidad_desde is not null as con_publicidad, c.avisos_club_desde is not null as con_avisos$n$,
1);
select pg_temp.reemplazar('retail.fn_club_avisos_pendientes(uuid)',
$v$     where c.club_desde is not null and c.publicidad_desde is not null$v$,
$n$     where c.club_desde is not null and (c.publicidad_desde is not null or c.avisos_club_desde is not null)$n$,
1);
select pg_temp.reemplazar('retail.fn_club_avisos_pendientes(uuid)',
$v$     where v_t_cumple is not null and v_regalo > 0$v$,
$n$     where v_t_cumple is not null and v_regalo > 0 and s.con_avisos$n$,
1);
select pg_temp.reemplazar('retail.fn_club_avisos_pendientes(uuid)',
$v$     where v_t_puntos is not null and h.hasta between v_hoy and v_hoy + 30$v$,
$n$     where v_t_puntos is not null and s.con_avisos and h.hasta between v_hoy and v_hoy + 30$n$,
1);
select pg_temp.reemplazar('retail.fn_club_avisos_pendientes(uuid)',
$v$     where v_t_rebaja is not null and not s.testigo$v$,
$n$     where v_t_rebaja is not null and not s.testigo and s.con_publicidad$n$,
1);
select pg_temp.reemplazar('retail.fn_club_avisos_pendientes(uuid)',
$v$     where v_t_novedades is not null and v_llegadas is not null and not s.testigo$v$,
$n$     where v_t_novedades is not null and v_llegadas is not null and not s.testigo and s.con_publicidad$n$,
1);

-- ---------- 6. El legado: quien hoy tiene la publicidad tiene los avisos, desde la misma fecha ----------
-- Solo la foto: la prueba es su fila de publicidad (su texto, o la política v2, nombraba los avisos). Sin fila nueva.
update retail.clientas c
   set avisos_club_desde = c.publicidad_desde
 where c.publicidad_desde is not null and c.avisos_club_desde is null and not c.anonimizada;

reset lock_timeout;
