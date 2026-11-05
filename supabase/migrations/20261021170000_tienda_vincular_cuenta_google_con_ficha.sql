-- ============================================================================
-- 20261021170000_tienda_vincular_cuenta_google_con_ficha.sql
-- Tienda online (ADR-0469, Felipe 2026-10-21): entrar con Google une la cuenta a la ficha que ya tenía ese correo.
--
-- EL PROBLEMA. Quien ya está en CAYLA (una ficha abierta en caja con su correo) entra a la tienda con Google, y la tienda le dice
--   «ese correo ya está registrado con otros datos, acércate a una tienda». `tienda_registrar_cuenta_simple` rechaza todo correo que ya
--   es el de contacto de otra ficha (`cuenta_correo_de_otra_persona`), porque sin documento no sabe si es la misma persona. Con Google
--   ese miedo está resuelto a medias: Google ya demostró que la persona controla el correo.
--
-- QUÉ HACE. Una función nueva, `tienda_vincular_cuenta_google`, que el servidor de la tienda llama ANTES de crear una cuenta simple
--   cuando entra alguien con Google que todavía no tiene cuenta. Si el correo (que Google confirmó) es el de UNA sola ficha, y esa
--   ficha pasa los candados, la cuenta se crea APUNTANDO A ESA FICHA (no a una ficha mínima nueva). Los candados:
--     1. Solo se une si todo cuadra: una sola ficha con ese correo, sin archivar, sin anonimizar, sin fusionar y SIN cuenta web (ni
--        abierta ni cerrada). Si algo falla, queda el mensaje de siempre («acércate a una tienda»).
--     2. El nombre de Google debe parecerse al de la ficha (`fn_nombres_se_parecen`: dos palabras en común, o una si alguno de los
--        dos nombres tiene una sola). Atrapa el correo mal escrito en caja: otra persona con ese Gmail casi nunca se llama igual.
--     3. Se avisa a la dueña de la ficha: el vínculo queda «pendiente de avisar» (`aviso_estado`) y la tienda lo ve en Clientas ▸ Avisos
--        con un botón que abre su WhatsApp con el texto listo (el sistema NO envía WhatsApp por su cuenta: lo manda la persona, como
--        todos los avisos del ERP). Una ficha sin celular queda `sin_celular`: ahí el aviso no se puede mandar y el vínculo se ve igual.
--     4. Todo vínculo queda registrado (tabla `cuentas_web_vinculos_google`, actividad) y un líder lo deshace con
--        `desvincular_cuenta_google`: la cuenta se cierra como al anonimizar (sin correo ni usuario, el usuario de Google se borra en el
--        proyecto de clientes) y la ficha queda intacta. Nada se borra.
--     5. Lo que ve una cuenta vinculada se revisó y no trae documento, celular ni dirección (`tienda_mi_cuenta`: nombre, correo, código
--        del Club, fecha del Club, cumpleaños); cambiar el correo y eliminar la cuenta piden la contraseña, y una cuenta que entra solo
--        con Google no tiene. No hizo falta tocar nada más.
--
-- DECIDÍ: una función NUEVA y no un parche a `tienda_registrar_cuenta_simple`. La de la cuenta simple (20261017175000) puede o no estar
--   ya en producción; una función nueva no depende de su md5 ni la reemplaza, y el servidor de la tienda decide el orden: primero
--   intenta vincular; si la base dice `no_aplica` (ese correo no es de ninguna ficha), sigue como siempre.
-- DECIDÍ: el nombre se compara en la base y no en la web: es el candado de identidad y tiene que valer aunque alguien llame la función
--   con otro servidor. Sin tildes, sin mayúsculas, sin palabras de menos de 3 letras ni «del/los/las…».
-- DECIDÍ: dos palabras en común (o una si algún nombre tiene una sola). Con una sola palabra común bastaría «María» para unir a dos
--   personas distintas; con dos, el apellido también tiene que coincidir. El costo: «Mary» contra «María» no se une y cae al mensaje de
--   siempre (se resuelve en tienda, como hoy).
-- DECIDÍ: el aviso por WhatsApp no depende del consentimiento de publicidad. No es publicidad: es avisarle a la dueña de una ficha que
--   alguien la vinculó. Por eso no pasa por `fn_club_avisos_pendientes` ni por `registrar_aviso_enviado` (que exigen publicidad vigente,
--   el tope de promociones y «responde BAJA»): tiene su propio par de funciones, bajo el mismo módulo «avisos_club».
-- DECIDÍ: desvincular es solo del líder (`fn_es_lider`). Cierra una cuenta, y eso se hace con criterio.
-- DESCARTÉ: mandar el aviso por correo. Si el correo de la ficha estaba mal escrito, el aviso le llegaría justo a quien no debe.
-- DESCARTÉ: un WhatsApp automático. No hay proveedor de envío en el ERP (solo enlaces que una persona toca) y contratarlo es una
--   decisión de dinero y de la Ley 29733 que no es de este cambio.
--
-- SE ROMPE SI: alguien pone a mano un `correo` en una ficha sin que su dueña lo sepa (el vínculo se apoya en que el correo de una ficha
--   es de su dueña), o si el servidor de la tienda llama `tienda_vincular_cuenta_google` sin comprobar antes con el proyecto de clientes
--   que la sesión es de Google y de ese correo confirmado (hoy lo hace `lib/google-servidor.ts`).
--
-- PRODUCCIÓN. Una sola parte, idempotente (se puede pegar dos veces). Tabla nueva y funciones nuevas, y una fila en la lista de acciones
-- sin responsable: no altera tablas en uso ni toca políticas (sin riesgo de 40P01), y no reemplaza ninguna función existente. Sin `select … into` dentro de un texto entre comillas.
-- El orden con la publicación de la web no importa: la web de antes sigue sin llamar la función nueva.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El registro de cada vínculo ----------
create table if not exists retail.cuentas_web_vinculos_google (
  id             uuid primary key default gen_random_uuid(),
  usuario_web_id uuid not null,
  clienta_id     uuid not null references retail.clientas (id),
  correo         text not null,
  nombre_google  text not null,
  nombre_ficha   text not null,
  creado_en      timestamptz not null default now(),
  aviso_estado   text not null default 'pendiente',
  avisado_en     timestamptz,
  avisado_por    uuid references personas (id),
  ubicacion_id   uuid references retail.ubicaciones (id),
  revertido_en   timestamptz,
  revertido_por  uuid references personas (id),
  constraint cuentas_web_vinculos_google_aviso_valido check (aviso_estado in ('pendiente', 'enviado', 'sin_celular')),
  constraint cuentas_web_vinculos_google_aviso_completo check ((aviso_estado = 'enviado') = (avisado_en is not null and avisado_por is not null)),
  constraint cuentas_web_vinculos_google_revertido_completo check ((revertido_en is null) = (revertido_por is null))
);

create index if not exists cuentas_web_vinculos_google_clienta_idx on retail.cuentas_web_vinculos_google (clienta_id, creado_en);
create index if not exists cuentas_web_vinculos_google_usuario_idx on retail.cuentas_web_vinculos_google (usuario_web_id);

comment on table retail.cuentas_web_vinculos_google is
  'Tienda online (ADR-0469): cada vez que alguien entró con Google y su cuenta se unió a la ficha que ya tenía ese correo. Guarda el correo, el nombre que dijo Google y el de la ficha, si ya se le avisó a la dueña por WhatsApp (pendiente / enviado / sin_celular) y si un líder lo deshizo. Solo la escriben tienda_vincular_cuenta_google, registrar_vinculo_google_avisado y desvincular_cuenta_google. RLS sin políticas.';

alter table retail.cuentas_web_vinculos_google enable row level security;
revoke all on retail.cuentas_web_vinculos_google from public, anon, authenticated;

-- ---------- 2. ¿Dos nombres son de la misma persona? ----------
create or replace function retail.fn_nombres_se_parecen(p_a text, p_b text)
returns boolean
language sql
immutable
set search_path = retail, public
as $f$
  with limpio as (
    select
      regexp_split_to_array(btrim(regexp_replace(translate(lower(coalesce(p_a, '')), 'áéíóúüñàèìòù', 'aeiouunaeiou'), '[^a-z]+', ' ', 'g')), ' ') as a,
      regexp_split_to_array(btrim(regexp_replace(translate(lower(coalesce(p_b, '')), 'áéíóúüñàèìòù', 'aeiouunaeiou'), '[^a-z]+', ' ', 'g')), ' ') as b
  ),
  pa as (
    select distinct t from limpio, unnest(limpio.a) as t
     where char_length(t) >= 3 and t not in ('del', 'los', 'las', 'van', 'von', 'san', 'dos')
  ),
  pb as (
    select distinct t from limpio, unnest(limpio.b) as t
     where char_length(t) >= 3 and t not in ('del', 'los', 'las', 'van', 'von', 'san', 'dos')
  ),
  cuenta as (
    select (select count(*) from pa) as na,
           (select count(*) from pb) as nb,
           (select count(*) from pa join pb using (t)) as comunes
  )
  select case
           when na = 0 or nb = 0 then false
           when comunes >= 2 then true
           when comunes >= 1 and least(na, nb) = 1 then true
           else false
         end
    from cuenta;
$f$;

comment on function retail.fn_nombres_se_parecen(text, text) is
  'Tienda online (ADR-0469): ¿estos dos nombres pueden ser de la misma persona? Sin tildes ni mayúsculas, sin palabras de menos de 3 letras ni «del/los/las/van/von/san/dos»: sí con dos palabras en común, o con una si alguno de los dos nombres tiene una sola. Es el candado de identidad del vínculo con Google.';

-- ---------- 3. La unión: la cuenta de Google se apunta a la ficha que ya tenía ese correo ----------
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
  -- Candado 1: la ficha no tiene cuenta web (abierta o cerrada: una ficha es de una sola cuenta).
  if exists (select 1 from retail.cuentas_web w where w.clienta_id = v_id) then
    return jsonb_build_object('estado', 'no_coincide');
  end if;
  -- Candado 2: el nombre de Google se parece al de la ficha.
  if not retail.fn_nombres_se_parecen(v_nombre, v_nombre_ficha) then
    return jsonb_build_object('estado', 'no_coincide');
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
  'Tienda online (ADR-0469): entrar con Google une la cuenta a la ficha que ya tenía ese correo. {estado: vinculada (nombre_corto) | ya_tiene_cuenta | no_aplica (ese correo no es de ninguna ficha, o ya es de una cuenta: sigue el registro de siempre) | no_coincide (hay ficha pero no se puede unir: varias fichas, archivada, ya con cuenta o nombre distinto)}. El servidor de la tienda la llama SOLO después de comprobar con el proyecto de clientes que la sesión es de Google y de ese correo confirmado. Solo la llama tienda_web.';

-- ---------- 4. Clientas ▸ Avisos: los vínculos por avisar ----------
create or replace function retail.fn_vinculos_google_recientes()
returns table (
  id uuid,
  clienta_id uuid,
  nombre text,
  telefono text,
  nombre_google text,
  correo text,
  creado_en timestamptz,
  aviso_estado text,
  avisado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = retail, public
as $f$
begin
  perform retail.fn_exigir_modulo('avisos_club');
  return query
    select v.id, v.clienta_id, c.nombre, c.telefono_whatsapp, v.nombre_google, v.correo, v.creado_en, v.aviso_estado, v.avisado_en
      from retail.cuentas_web_vinculos_google v
      join retail.clientas c on c.id = v.clienta_id
      join retail.cuentas_web w on w.usuario_web_id = v.usuario_web_id and w.cerrada_en is null
     where v.revertido_en is null
       and v.creado_en >= now() - interval '60 days'
     order by (v.aviso_estado = 'pendiente') desc, v.creado_en desc;
end;
$f$;

comment on function retail.fn_vinculos_google_recientes() is
  'Clientas ▸ Avisos (ADR-0469): las cuentas de Google unidas a una ficha en los últimos 60 días y todavía abiertas, las que faltan avisar primero. Módulo «avisos_club».';

create or replace function retail.registrar_vinculo_google_avisado(p_id uuid, p_ubicacion_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = retail, public
as $f$
declare
  v_persona uuid;
  v_estado text;
  v_revertido timestamptz;
begin
  perform retail.fn_exigir_modulo('avisos_club');
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if not retail.fn_puede_operar_ubicacion(p_ubicacion_id)
     or not exists (select 1 from retail.ubicaciones u where u.id = p_ubicacion_id and u.tipo = 'tienda') then
    raise exception 'No puedes mandar avisos desde esa tienda.' using errcode = '42501';
  end if;

  for v_estado, v_revertido in
    select v.aviso_estado, v.revertido_en from retail.cuentas_web_vinculos_google v where v.id = p_id for update
  loop
    exit;
  end loop;
  if v_estado is null then
    raise exception 'Ese aviso ya no está: actualiza la lista.' using errcode = 'P0001', hint = 'vinculo_no_existe';
  end if;
  if v_revertido is not null then
    raise exception 'Ese vínculo ya se deshizo: actualiza la lista.' using errcode = 'P0001', hint = 'vinculo_deshecho';
  end if;
  -- Ya avisado (otra pestaña, otra tienda): no se anota dos veces.
  if v_estado = 'enviado' then
    return;
  end if;

  update retail.cuentas_web_vinculos_google v
     set aviso_estado = 'enviado', avisado_en = now(), avisado_por = v_persona, ubicacion_id = p_ubicacion_id
   where v.id = p_id;
end;
$f$;

comment on function retail.registrar_vinculo_google_avisado(uuid, uuid) is
  'Clientas ▸ Avisos (ADR-0469): «Avisar» — WhatsApp ya se abrió con el texto; queda anotado quién avisó y desde qué tienda. Repetido no hace nada. Módulo «avisos_club»; firma con el responsable del combo.';

-- ---------- 5. Deshacer un vínculo (solo el líder) ----------
create or replace function retail.desvincular_cuenta_google(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = retail, public
as $f$
declare
  v_persona uuid;
  v_ahora timestamptz := now();
  v_usuario uuid;
  v_ficha uuid;
  v_revertido timestamptz;
  v_cuenta uuid;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede deshacer este vínculo.' using errcode = '42501', hint = 'solo_lider';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;

  for v_usuario, v_ficha, v_revertido in
    select v.usuario_web_id, v.clienta_id, v.revertido_en from retail.cuentas_web_vinculos_google v where v.id = p_id for update
  loop
    exit;
  end loop;
  if v_usuario is null then
    raise exception 'Ese vínculo ya no está: actualiza la lista.' using errcode = 'P0001', hint = 'vinculo_no_existe';
  end if;
  if v_revertido is not null then
    return;
  end if;

  -- La cuenta se cierra como cuando se anonimiza la ficha (20261015055000): sin correo ni usuario que entre, el usuario pasa a «por
  -- borrar» en el proyecto de clientes y sus favoritos y esperas vivas se quitan. La ficha no se toca.
  v_cuenta := (select w.id from retail.cuentas_web w where w.usuario_web_id = v_usuario and w.cerrada_en is null for update);
  if v_cuenta is not null then
    update retail.favoritos_web f set quitado_en = greatest(v_ahora, f.guardado_en)
     where f.cuenta_web_id = v_cuenta and f.quitado_en is null;
    update retail.esperas_web e set quitada_en = greatest(v_ahora, e.creada_en)
     where e.cuenta_web_id = v_cuenta and e.quitada_en is null;
    update retail.cuentas_web w set
      cerrada_en = greatest(v_ahora, w.creada_en, coalesce(w.ultima_entrada_en, w.creada_en)),
      usuario_cerrado_id = w.usuario_web_id,
      usuario_web_id = null,
      correo = null
     where w.id = v_cuenta;
  end if;

  update retail.cuentas_web_vinculos_google v set revertido_en = v_ahora, revertido_por = v_persona where v.id = p_id;

  perform retail.fn_actividad_anotar(
    'clientas', 'vinculo_google_deshecho',
    'un líder deshizo la unión de una cuenta de Google con la ficha de una persona',
    v_persona, null, null, null, 'clientas', v_ficha::text, v_ahora,
    '{}'::jsonb,
    'vivo'
  );
end;
$f$;

comment on function retail.desvincular_cuenta_google(uuid) is
  'Clientas ▸ Avisos (ADR-0469): un líder deshace la unión de una cuenta de Google con una ficha. Cierra la cuenta web (sin correo ni usuario; el usuario de Google se borra en el proyecto de clientes) y deja la ficha intacta. Solo el líder; firma con el responsable del combo.';

-- ---------- 6. «Desvincular» se guarda sin elegir responsable (con la cuenta de una persona firma ella) ----------
-- Solo lo hace un líder, y un líder siempre entra con su cuenta de persona (una terminal nunca es líder): no hay a quién elegir.
-- «Avisar» reutiliza `aviso_club_enviar` (20261002170000): es la misma acción, anotar que un aviso salió por WhatsApp.
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('vinculo_google_desvincular', 'Deshacer la unión de una cuenta de Google con un miembro de la tienda online (solo un líder, y firma con su propia cuenta)')
on conflict (clave) do update set descripcion = excluded.descripcion;

-- ---------- 7. La puerta ----------
revoke all on function retail.fn_nombres_se_parecen(text, text) from public, anon, authenticated;
revoke all on function retail.tienda_vincular_cuenta_google(uuid, text, text, text) from public, anon, authenticated;
revoke all on function retail.fn_vinculos_google_recientes() from public, anon;
revoke all on function retail.registrar_vinculo_google_avisado(uuid, uuid) from public, anon;
revoke all on function retail.desvincular_cuenta_google(uuid) from public, anon;

grant execute on function retail.tienda_vincular_cuenta_google(uuid, text, text, text) to tienda_web;
grant execute on function retail.fn_vinculos_google_recientes() to authenticated;
grant execute on function retail.registrar_vinculo_google_avisado(uuid, uuid) to authenticated;
grant execute on function retail.desvincular_cuenta_google(uuid) to authenticated;

reset lock_timeout;
