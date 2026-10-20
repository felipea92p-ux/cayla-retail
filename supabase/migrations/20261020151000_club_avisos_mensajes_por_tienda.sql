-- ============================================================================
-- 20261020151000_club_avisos_mensajes_por_tienda.sql — CAYLA V2 · Club · Avisos: cada tienda edita sus mensajes, y lo hace quien tiene el módulo
-- Sigue a `20261020144000_club_avisos_mensajes_editables.sql` (en producción desde el 2026-10-20).
--
-- EL PROBLEMA. La migración anterior dejó editar los mensajes de los avisos SOLO al líder y para las 3 tiendas a la vez. Felipe
-- (2026-10-20): «quien tiene el módulo lo puede hacer y cada tienda (sede) personaliza sus propios mensajes predeterminados». Es la regla
-- del ERP (ADR-0161/ADR-0306: quien ve un módulo hace todo lo que hay en él); «solo el líder» fue una decisión mía que no correspondía.
--
-- QUÉ HACE
--   1. `club_avisos_textos_sede`: los mensajes propios de cada tienda (cumpleaños, puntos, novedades, rebaja y el cierre), con versión
--      (nunca se editan ni se borran: quedan como historia). Igual que `club_textos`, el mensaje se guarda COMPLETO (cuerpo + cierre + BAJA).
--   2. `fn_club_aviso_texto_de(tienda, tipo)` y `fn_club_aviso_cierre_de(tienda)`: el mensaje que rige en una tienda = el suyo si lo
--      personalizó; si no, el de CAYLA (`club_textos`, el que dejó la migración anterior). Una tienda nueva arranca con los de CAYLA.
--   3. `fn_club_avisos_pendientes` arma cada aviso con el mensaje de SU tienda: un reemplazo anclado de las cuatro líneas que leían
--      `club_textos` (aborta sin tocar nada si la función cambió).
--   4. `fn_club_avisos_textos(tienda)` y `guardar_mensajes_avisos(tienda, mensajes, cierre)` reemplazan a sus versiones sin tienda: con
--      el módulo «Avisos del club» y una tienda donde la persona puede operar (`fn_puede_operar_ubicacion`, como «Enviar»). Sin candado de líder.
--
-- DECIDÍ: los mensajes de CAYLA (`club_textos.aviso_*`) quedan como el punto de partida de toda tienda y ya no se editan desde la pantalla.
-- DECIDÍ: lo que una tienda no cambió sigue al de CAYLA; lo que cambió (o todo, si cambió el cierre, que va dentro de los cuatro) queda suyo.
-- DESCARTÉ: guardar solo el cuerpo y armar el texto al leer: obligaba a reescribir `fn_club_avisos_pendientes` entera, para el mismo resultado.
-- SE ROMPE SI: alguien recrea `fn_club_avisos_pendientes` desde un archivo anterior a esta migración: volvería a leer solo los de CAYLA
--   (se arregla volviendo a pegar esta).
--
-- CÓMO SE PEGA: SOLO en el SQL Editor de producción, de una vez, después de `20261020144000`. Idempotente. `lock_timeout` 3 s. Sin
--   políticas ni `drop trigger` (la tabla nueva solo se lee y escribe por funciones `security definer`: RLS encendido, sin políticas).
-- CAÍDA EXTERNA. Nada llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Los mensajes propios de cada tienda ----------
create table if not exists retail.club_avisos_textos_sede (
  ubicacion_id  uuid not null references retail.ubicaciones (id),
  tipo          text not null,
  version       integer not null,
  texto         text not null,
  vigente_desde timestamptz not null default now(),
  creado_por    uuid references public.personas (id),
  constraint club_avisos_textos_sede_pkey primary key (ubicacion_id, tipo, version),
  constraint club_avisos_textos_sede_tipo check (tipo in ('cumpleanos', 'puntos', 'novedades', 'rebaja', 'cierre')),
  constraint club_avisos_textos_sede_version check (version >= 1),
  -- Como `club_textos_aviso_con_baja`: todo mensaje saluda por el nombre y termina con la BAJA (Ley 29733). El cierre, no.
  constraint club_avisos_textos_sede_con_baja check (
    tipo = 'cierre' or (position('{nombre}' in texto) > 0 and right(texto, 50) = 'Si no quieres recibir más mensajes, responde BAJA.'))
);
comment on table retail.club_avisos_textos_sede is
  'Clientes ▸ Avisos: los mensajes que cada tienda personalizó (cumpleanos, puntos, novedades, rebaja: el texto completo con cierre y BAJA; cierre: la línea común, «-» = sin cierre). El vigente de cada tipo es su versión más alta; sin versión propia rige el de CAYLA (club_textos.aviso_*). Nunca se editan ni se borran. Solo por funciones security definer.';
alter table retail.club_avisos_textos_sede enable row level security;
revoke all on table retail.club_avisos_textos_sede from public, anon, authenticated;

-- ---------- 2. El mensaje que rige en una tienda ----------
create or replace function retail.fn_club_aviso_texto_de(p_ubicacion_id uuid, p_tipo text)
returns text
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(
    (select s.texto from retail.club_avisos_textos_sede s
      where s.ubicacion_id = p_ubicacion_id and s.tipo = p_tipo order by s.version desc limit 1),
    (select t.texto from retail.club_textos t where t.tipo = 'aviso_' || p_tipo order by t.version desc limit 1));
$$;
comment on function retail.fn_club_aviso_texto_de(uuid, text) is
  'El mensaje completo de un aviso (cumpleanos, puntos, novedades, rebaja) que rige en una tienda: el que personalizó (club_avisos_textos_sede) o, si no, el de CAYLA (club_textos).';
revoke all on function retail.fn_club_aviso_texto_de(uuid, text) from public, anon, authenticated;

create or replace function retail.fn_club_aviso_cierre_de(p_ubicacion_id uuid)
returns text
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select nullif(coalesce(
    (select s.texto from retail.club_avisos_textos_sede s
      where s.ubicacion_id = p_ubicacion_id and s.tipo = 'cierre' order by s.version desc limit 1),
    (select t.texto from retail.club_textos t where t.tipo = 'aviso_cierre' order by t.version desc limit 1)), '-');
$$;
comment on function retail.fn_club_aviso_cierre_de(uuid) is
  'La línea de cierre de los avisos que rige en una tienda (la suya o la de CAYLA), o null si no lleva cierre.';
revoke all on function retail.fn_club_aviso_cierre_de(uuid) from public, anon, authenticated;

-- ---------- 3. Cada aviso sale con el mensaje de su tienda ----------
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
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

select pg_temp.reemplazar(
  'retail.fn_club_avisos_pendientes(uuid)',
  $v$  v_t_cumple := (select t.texto from retail.club_textos t where t.tipo = 'aviso_cumpleanos' order by t.version desc limit 1);
  v_t_puntos := (select t.texto from retail.club_textos t where t.tipo = 'aviso_puntos' order by t.version desc limit 1);
  v_t_novedades := (select t.texto from retail.club_textos t where t.tipo = 'aviso_novedades' order by t.version desc limit 1);
  v_t_rebaja := (select t.texto from retail.club_textos t where t.tipo = 'aviso_rebaja' order by t.version desc limit 1);$v$,
  $v$  -- Cada tienda manda sus propios mensajes (20261020151000): el que personalizó, o el de CAYLA si no lo cambió.
  v_t_cumple := retail.fn_club_aviso_texto_de(p_ubicacion_id, 'cumpleanos');
  v_t_puntos := retail.fn_club_aviso_texto_de(p_ubicacion_id, 'puntos');
  v_t_novedades := retail.fn_club_aviso_texto_de(p_ubicacion_id, 'novedades');
  v_t_rebaja := retail.fn_club_aviso_texto_de(p_ubicacion_id, 'rebaja');$v$,
  1);

-- ---------- 4. Leer y guardar, por tienda ----------
drop function if exists retail.fn_club_avisos_textos();
drop function if exists retail.guardar_mensajes_avisos(jsonb, text);

create or replace function retail.fn_club_avisos_textos(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  perform retail.fn_exigir_modulo('avisos_club');
  if not retail.fn_puede_operar_ubicacion(p_ubicacion_id)
     or not exists (select 1 from retail.ubicaciones u where u.id = p_ubicacion_id and u.tipo = 'tienda') then
    raise exception 'No puedes ver los mensajes de esa tienda.' using errcode = '42501', hint = 'avisos_otra_tienda';
  end if;
  return jsonb_build_object(
    'personalizada', exists (select 1 from retail.club_avisos_textos_sede s where s.ubicacion_id = p_ubicacion_id),
    'cierre', retail.fn_club_aviso_cierre_de(p_ubicacion_id),
    'mensajes', (select jsonb_agg(jsonb_build_object('tipo', x.tipo, 'texto', retail.fn_club_aviso_texto_de(p_ubicacion_id, x.tipo)) order by x.n)
                   from unnest(array['cumpleanos', 'puntos', 'novedades', 'rebaja']) with ordinality as x(tipo, n)));
end;
$$;
comment on function retail.fn_club_avisos_textos(uuid) is
  'Clientes ▸ Avisos, hoja «Editar mensajes»: el mensaje que rige en esa tienda para cada aviso (completo, con cierre y BAJA), su cierre y si ya personalizó alguno. Con el módulo «Avisos del club» y una tienda donde se puede operar. Lectura (prefijo fn_).';
revoke all on function retail.fn_club_avisos_textos(uuid) from public, anon;
grant execute on function retail.fn_club_avisos_textos(uuid) to authenticated;

create or replace function retail.guardar_mensajes_avisos(p_ubicacion_id uuid, p_mensajes jsonb, p_cierre text)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_cierre text := btrim(coalesce(p_cierre, ''), E' \t\r\n');
  v_tipo text;
  v_cuerpo text;
  v_problema text;
  v_texto text;
  v_cambiados text[] := array[]::text[];
begin
  -- Quien tiene el módulo hace todo lo que hay en él (ADR-0161/ADR-0306), en una tienda donde puede operar, como «Enviar».
  perform retail.fn_exigir_modulo('avisos_club');
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if not retail.fn_puede_operar_ubicacion(p_ubicacion_id)
     or not exists (select 1 from retail.ubicaciones u where u.id = p_ubicacion_id and u.tipo = 'tienda') then
    raise exception 'No puedes cambiar los mensajes de esa tienda.' using errcode = '42501', hint = 'avisos_otra_tienda';
  end if;

  if jsonb_typeof(p_mensajes) is distinct from 'object' then
    raise exception 'Faltan los mensajes.' using errcode = '22023', hint = 'mensaje_aviso_invalido';
  end if;
  if char_length(v_cierre) > 300 then
    raise exception 'El cierre es muy largo: máximo 300 letras.' using errcode = '22023', hint = 'mensaje_aviso_invalido', detail = 'cierre';
  end if;
  if v_cierre ~ '\{[a-z_]+\}' then
    raise exception 'El cierre va igual para todos: no lleva datos entre llaves.' using errcode = '22023', hint = 'mensaje_aviso_invalido', detail = 'cierre';
  end if;
  if v_cierre ~* 'responde\s+baja' then
    raise exception 'La línea de la BAJA va sola al final: no la escribas en el cierre.' using errcode = '22023', hint = 'mensaje_aviso_invalido', detail = 'cierre';
  end if;

  -- Dos personas guardando a la vez en la misma tienda no chocan con la misma versión: una espera a la otra.
  perform pg_advisory_xact_lock(hashtext('retail.club_avisos_textos_sede:' || p_ubicacion_id::text));

  if v_cierre is distinct from coalesce(retail.fn_club_aviso_cierre_de(p_ubicacion_id), '') then
    -- Un cierre vacío también es una versión: se guarda «-», que se lee como «sin cierre».
    insert into retail.club_avisos_textos_sede (ubicacion_id, tipo, version, texto, creado_por)
    select p_ubicacion_id, 'cierre', coalesce(max(s.version), 0) + 1, coalesce(nullif(v_cierre, ''), '-'), v_persona
      from retail.club_avisos_textos_sede s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'cierre';
    v_cambiados := array_append(v_cambiados, 'cierre');
  end if;

  foreach v_tipo in array array['cumpleanos', 'puntos', 'novedades', 'rebaja'] loop
    v_cuerpo := p_mensajes ->> v_tipo;
    if v_cuerpo is null then
      raise exception 'Falta el mensaje de %.', v_tipo using errcode = '22023', hint = 'mensaje_aviso_invalido', detail = v_tipo;
    end if;
    v_problema := retail.fn_club_aviso_problema(v_tipo, v_cuerpo);
    if v_problema is not null then
      raise exception '%', v_problema using errcode = '22023', hint = 'mensaje_aviso_invalido', detail = v_tipo;
    end if;
    v_texto := retail.fn_club_aviso_componer(v_cuerpo, v_cierre);
    if v_texto is distinct from retail.fn_club_aviso_texto_de(p_ubicacion_id, v_tipo) then
      insert into retail.club_avisos_textos_sede (ubicacion_id, tipo, version, texto, creado_por)
      select p_ubicacion_id, v_tipo, coalesce(max(s.version), 0) + 1, v_texto, v_persona
        from retail.club_avisos_textos_sede s where s.ubicacion_id = p_ubicacion_id and s.tipo = v_tipo;
      v_cambiados := array_append(v_cambiados, v_tipo);
    end if;
  end loop;

  if cardinality(v_cambiados) > 0 then
    insert into retail.configuracion_historial (que, detalle, hecho_por)
    values ('mensajes_avisos_club', jsonb_build_object('ubicacion_id', p_ubicacion_id, 'cambiados', to_jsonb(v_cambiados)), v_persona);
  end if;
  return cardinality(v_cambiados);
end;
$$;
comment on function retail.guardar_mensajes_avisos(uuid, jsonb, text) is
  'Clientes ▸ Avisos, «Editar mensajes»: guarda los mensajes propios de UNA tienda (cumpleanos, puntos, novedades, rebaja y el cierre) SOLO si cambiaron respecto de lo que rige ahí. p_mensajes = {tipo: cuerpo} (sin cierre ni BAJA: los pone fn_club_aviso_componer). Con el módulo «Avisos del club» y una tienda donde se puede operar (hint avisos_otra_tienda), firmado con el responsable; queda en configuracion_historial. Devuelve cuántos textos cambió. Lo ya enviado no cambia.';
revoke all on function retail.guardar_mensajes_avisos(uuid, jsonb, text) from public, anon;
grant execute on function retail.guardar_mensajes_avisos(uuid, jsonb, text) to authenticated;

reset lock_timeout;
