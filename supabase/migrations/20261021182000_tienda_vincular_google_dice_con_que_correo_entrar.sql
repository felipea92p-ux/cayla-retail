-- ============================================================================
-- 20261021182000_tienda_vincular_google_dice_con_que_correo_entrar.sql
-- Tienda online (ADR-0469, Felipe 2026-10-21): si la ficha ya tiene cuenta con OTRO correo, se le dice con cuál entrar.
--
-- EL PROBLEMA. `tienda_vincular_cuenta_google` (20261021170000) une la cuenta de Google a la ficha que ya tenía ese correo, pero no si la ficha
--   YA tiene una cuenta (candado 1: una ficha es de una sola cuenta). Quien tenía su ficha con un correo (`fel…@gmail.com`) y su cuenta de la
--   tienda con otro (`sub…@gmail.com`) entraba con Google y leía «ese correo ya está registrado con otros datos, acércate a una tienda»: un
--   mensaje que no dice lo único que importa, que ya tiene cuenta y con qué correo entra (el caso real de Felipe, 2026-10-21).
--
-- QUÉ CAMBIA. Solo una cosa, en la misma función: cuando la ficha del correo de Google tiene una cuenta ABIERTA con otro correo y el nombre de
--   Google se parece al de la ficha (el candado 2, que ahora corre ANTES de mirar la cuenta), devuelve
--   `{estado: 'otro_correo', correo_cuenta: 'su••••@gmail.com'}` en vez de `no_coincide`. La tienda lo dice con palabras («ya tienes cuenta:
--   entra con su••••@gmail.com») y no une ni crea nada. Todo lo demás queda igual: ficha archivada, con cuenta cerrada, otro nombre, varias
--   fichas → `no_coincide`, y quien no es la persona no se entera de nada.
--
-- DECIDÍ: el correo de la cuenta sale A MEDIAS (dos letras y el dominio, como en el aviso de WhatsApp) y SOLO si el nombre coincide. Quien
--   llegó hasta aquí demostró dos cosas: controla el correo de la ficha (Google lo confirmó) y se parece a su dueña. Aun así, un correo mal
--   escrito en caja podría poner a un desconocido frente a la ficha de otra persona: por eso no se muestra completo ni sin el candado del nombre.
-- DECIDÍ: no se une nada. La cuenta tiene un solo correo de entrada; sumar otro correo a la misma cuenta es otra decisión (y otro riesgo).
--   Quien quiere entrar con Google entra con su correo de siempre y, en «Mi cuenta», lo cambia por el de Google.
-- DECIDÍ: reemplazo completo de la función (es nuestra, de la migración anterior), con la guarda del md5 que tiene producción desde el 2026-10-21
--   y el de este archivo (para pegarla dos veces). Si alguien la cambió en medio, se detiene sin tocar nada.
-- DESCARTÉ: devolver el correo completo. Y devolver `otro_correo` sin mirar el nombre: dejaría ver, a medias, el correo de la cuenta de
--   cualquiera cuyo correo de ficha alguien más pueda confirmar.
--
-- SE ROMPE SI: la tienda deja de comprobar con el proyecto de clientes que Google confirmó el correo (ver `lib/google-servidor.ts`).
--
-- PRODUCCIÓN. Una sola parte, idempotente. Un `create or replace function` sobre una función propia: no toma tablas en exclusiva ni toca
-- políticas (sin riesgo de 40P01). SIN PEGAR hasta que Felipe lo diga. El orden con la publicación de la web no importa: la web de antes
-- no conoce `otro_correo`, lo trata como «no se pudo» y manda al mensaje de siempre.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare
  v_md5 text := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('retail.tienda_vincular_cuenta_google(uuid, text, text, text)'));
begin
  if v_md5 is null or v_md5 not in ('201de991e9e84e3dae1fb5e2e253836e', '0fbfa5e4ab8cf29ae054a90846392ac5') then
    raise exception 'tienda_vincular_cuenta_google tiene otro cuerpo (md5 %): no es el de producción del 2026-10-21 ni el de este archivo. Reescribe el reemplazo desde su definición real antes de pegar.',
      coalesce(v_md5, 'ninguno');
  end if;
end $$;

create or replace function retail.tienda_vincular_cuenta_google(
  p_usuario_web_id uuid,
  p_correo text,
  p_nombre text,
  p_textos text
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public
as $f$
declare
  v_ahora timestamptz := now();
  v_correo text := retail.fn_cuenta_web_correo(p_correo);
  v_nombre text := nullif(regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), '');
  v_textos text := btrim(coalesce(p_textos, ''));
  v_fichas uuid[];
  v_id uuid;
  v_nombre_ficha text;
  v_celular text;
  v_aviso text;
  v_restriccion text;
  v_correo_cuenta text;
begin
  if p_usuario_web_id is null then
    raise exception 'Falta el usuario de la cuenta.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'usuario';
  end if;
  if v_correo is null then
    raise exception 'Revisa tu correo.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'correo';
  end if;
  if v_nombre is null or char_length(v_nombre) > 120 then
    raise exception 'Revisa tu nombre.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'nombre';
  end if;
  if v_textos !~ '^[a-z0-9-]{1,60}$' then
    raise exception 'Falta la versión de los textos que aceptó.' using errcode = '22023', hint = 'cuenta_datos_invalidos', detail = 'textos';
  end if;

  if exists (select 1 from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id) then
    return jsonb_build_object('estado', 'ya_tiene_cuenta');
  end if;
  -- Ya hay una cuenta con ese correo: no es un caso de vínculo, y `tienda_registrar_cuenta_simple` lo dirá con su mensaje de siempre.
  if exists (select 1 from retail.cuentas_web w where w.correo = v_correo) then
    return jsonb_build_object('estado', 'no_aplica');
  end if;

  v_fichas := array(select c.id from retail.clientas c where lower(btrim(c.correo)) = v_correo order by c.id);
  if cardinality(v_fichas) = 0 then
    return jsonb_build_object('estado', 'no_aplica');
  end if;
  -- Candado 1: una sola ficha con ese correo (dos ya es un dato dudoso: lo resuelve una persona en tienda).
  if cardinality(v_fichas) > 1 then
    return jsonb_build_object('estado', 'no_coincide');
  end if;
  v_id := v_fichas[1];

  for v_nombre_ficha, v_celular in
    select c.nombre, c.telefono_whatsapp
      from retail.clientas c
     where c.id = v_id and not c.anonimizada and c.archivada_en is null and c.fusionada_en_id is null
       for update
  loop
    exit;
  end loop;
  if v_nombre_ficha is null then
    return jsonb_build_object('estado', 'no_coincide');
  end if;
  -- Candado 2 (ahora ANTES de mirar la cuenta de la ficha): el nombre de Google se parece al de la ficha. Sin él no se une ni se dice nada.
  if not retail.fn_nombres_se_parecen(v_nombre, v_nombre_ficha) then
    return jsonb_build_object('estado', 'no_coincide');
  end if;
  -- Candado 1: la ficha no tiene cuenta web. Si la tiene ABIERTA con otro correo, se le dice con cuál entrar (a medias); cerrada, no se une.
  if exists (select 1 from retail.cuentas_web w where w.clienta_id = v_id) then
    v_correo_cuenta := (select w.correo from retail.cuentas_web w where w.clienta_id = v_id and w.cerrada_en is null);
    if v_correo_cuenta is null then
      return jsonb_build_object('estado', 'no_coincide');
    end if;
    return jsonb_build_object(
      'estado', 'otro_correo',
      'correo_cuenta', left(split_part(v_correo_cuenta, '@', 1), 2) || '••••@' || split_part(v_correo_cuenta, '@', 2)
    );
  end if;

  begin
    insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados, aceptados_en, creada_en)
    values (p_usuario_web_id, v_id, v_correo, v_textos, v_ahora, v_ahora);
  exception when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'cuentas_web_usuario_unico' then
      return jsonb_build_object('estado', 'ya_tiene_cuenta');
    end if;
    return jsonb_build_object('estado', 'no_coincide');
  end;

  -- Candado 3: queda por avisarle a la dueña de la ficha (sin celular que se entienda, no hay a quién).
  v_aviso := case when v_celular ~ '^9[0-9]{8}$' then 'pendiente' else 'sin_celular' end;
  insert into retail.cuentas_web_vinculos_google (usuario_web_id, clienta_id, correo, nombre_google, nombre_ficha, creado_en, aviso_estado)
  values (p_usuario_web_id, v_id, v_correo, v_nombre, v_nombre_ficha, v_ahora, v_aviso);

  -- Candado 4: queda en la actividad, sin datos de la persona (el nombre y el correo viven solo en la tabla del vínculo).
  perform retail.fn_actividad_anotar(
    'clientas', 'vinculo_google',
    'una cuenta de Google se unió a la ficha de una persona por su correo (queda avisarle a su dueña)',
    null, null, null, null, 'clientas', v_id::text, v_ahora,
    jsonb_build_object('aviso', v_aviso),
    'vivo'
  );

  return jsonb_build_object('estado', 'vinculada', 'nombre_corto', retail.fn_club_nombre_de_pila(v_nombre_ficha));
end;
$f$;

comment on function retail.tienda_vincular_cuenta_google(uuid, text, text, text) is
  'Tienda online (ADR-0469): entrar con Google une la cuenta a la ficha que ya tenía ese correo. {estado: vinculada (nombre_corto) | ya_tiene_cuenta | no_aplica (ese correo no es de ninguna ficha, o ya es de una cuenta: sigue el registro de siempre) | otro_correo (la ficha ya tiene cuenta abierta con otro correo y el nombre coincide: correo_cuenta, a medias) | no_coincide (hay ficha pero no se puede unir: varias fichas, archivada, cuenta cerrada o nombre distinto)}. El servidor de la tienda la llama SOLO después de comprobar con el proyecto de clientes que la sesión es de Google y de ese correo confirmado. Solo la llama tienda_web.';

-- Los permisos no cambian con `create or replace`, pero se repiten para que esta parte sola deje la función bien puesta.
revoke all on function retail.tienda_vincular_cuenta_google(uuid, text, text, text) from public, anon, authenticated;
grant execute on function retail.tienda_vincular_cuenta_google(uuid, text, text, text) to tienda_web;

reset lock_timeout;
