-- ============================================================================
-- 20261118152000_libro_reclamaciones_respuesta.sql — CAYLA V2 · Tienda web ▸ Libro de Reclamaciones · PARTE 4: la respuesta
-- (ADR-0679, Felipe 2026-11-18)
--
-- EL PROBLEMA PRIMERO. La PARTE 3 le muestra al ERP cada hoja con su plazo de 15 días hábiles, pero no hay cómo responderla: la encargada
-- tendría que escribirle al cliente desde su correo personal, sin constancia en CAYLA de qué le dijo ni cuándo. La ley pide responder por
-- escrito dentro del plazo; si mañana Indecopi pregunta, CAYLA tiene que poder mostrar la respuesta y su fecha.
--
-- ANALOGÍA CAYLA. La parte de abajo de la hoja del libro físico, «Observaciones y acciones adoptadas por el proveedor»: se llena una vez,
-- con la fecha y la firma de quien atendió, y no se corrige.
--
-- QUÉ HACE
--   1. `hojas_reclamacion` suma la respuesta (`respuesta`, `respondida_en`, `respondida_por`) y su correo (`respuesta_enviada_en`,
--      `respuesta_intentos`, `respuesta_tomada_en`).
--   2. El candado suma: la respuesta se escribe UNA vez y no cambia (ni quién ni cuándo); su correo se marca una vez; los intentos suben.
--   3. `responder_hoja_reclamacion(id, respuesta)` (ERP): pide el módulo, firma con el responsable del combo (`fn_actor_persona_id(true)`,
--      ADR-0162), guarda la respuesta limpia (de 10 a 3000 letras) y lo anota en la Actividad (sin datos del cliente). Dos toques con el
--      mismo texto: {estado: ya_estaba}; otro texto sobre una ya respondida: P0001 `libro_ya_respondida`.
--   4. `fn_libro_reclamaciones` (ERP) trae la respuesta, cuándo y si su correo ya salió.
--   5. La tienda manda la respuesta por correo con la MISMA tarea que la copia (`/api/libro-copias`): `tienda_libro_respuestas_reclamar`
--      y `tienda_libro_respuesta_enviada`, con la misma regla (skip locked, 2 minutos, hasta 5 intentos). La constancia del cliente
--      (`tienda_ver_hoja_reclamacion`) también la muestra.
--
-- DECIDÍ: la respuesta la manda la tienda, no el ERP: la llave del correo vive en un solo lugar (la tienda, ADR-0679 PARTE 2) y la base
--   la deja en cola. El ERP solo escribe la respuesta; si el correo falla, se reintenta solo y la respuesta ya quedó con su fecha.
-- DECIDÍ: la fecha que cuenta para el plazo es `respondida_en` (cuando CAYLA la escribió y firmó), no cuando el correo llegó.
-- DESCARTÉ: dejar corregir la respuesta (es la constancia de lo que CAYLA respondió: una segunda versión sería otra hoja de papel); un
--   botón para «marcar respondida» sin texto (la ley pide la respuesta, no una casilla).
--
-- SE ROMPE SI: alguien llama `tienda_libro_respuesta_enviada` sin que el proveedor de correo haya recibido el correo.
--
-- PRODUCCIÓN. APLICADA el 2026-11-18 con el OK de Felipe (CLI `supabase db query --linked`, en una transacción, registrada con
-- esta misma versión en schema_migrations; las 18 funciones del Libro, idénticas a la base local probada). Antes: NO estaba aplicada: va DESPUÉS de las PARTES 1, 2 y 3, y espera el OK de Felipe. Una sola parte, idempotente. Agrega
-- columnas a `hojas_reclamacion` (tabla nueva, aún sin uso en producción), funciones nuevas o reemplazadas. Sin políticas, sin `drop
-- trigger`, sin `select … into` dentro de un texto entre comillas.
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select has_function_privilege('authenticated', 'retail.responder_hoja_reclamacion(uuid, text)', 'execute');      → t
--   select has_function_privilege('tienda_web', 'retail.tienda_libro_respuestas_reclamar(integer)', 'execute');     → t
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $guarda$
begin
  if to_regprocedure('retail.fn_libro_reclamaciones()') is null or to_regprocedure('retail.tienda_libro_copias_reclamar(integer, uuid)') is null then
    raise exception 'Faltan las partes anteriores: pega antes 20261118145000, 20261118150000 y 20261118151000.';
  end if;
  if to_regprocedure('retail.fn_actor_persona_id(boolean)') is null then
    raise exception 'Falta fn_actor_persona_id (ADR-0162).';
  end if;
end
$guarda$;

-- ---------- 1. Las columnas ----------
alter table retail.hojas_reclamacion
  add column if not exists respuesta            text,
  add column if not exists respondida_en        timestamptz,
  add column if not exists respondida_por       uuid references public.personas (id),
  add column if not exists respuesta_enviada_en timestamptz,
  add column if not exists respuesta_intentos   smallint not null default 0,
  add column if not exists respuesta_tomada_en  timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hojas_reclamacion_respuesta') then
    alter table retail.hojas_reclamacion add constraint hojas_reclamacion_respuesta check (
      (respuesta is null) = (respondida_en is null)
      and (respuesta is null or char_length(respuesta) between 10 and 3000)
      and (respondida_en is null or respondida_en >= creada_en)
      and (respuesta_enviada_en is null or respuesta is not null)
      and respuesta_intentos between 0 and 100);
  end if;
end
$$;

comment on column retail.hojas_reclamacion.respuesta is 'La respuesta de CAYLA (de 10 a 3000 letras, limpia), que le llega al cliente por correo. Se escribe una vez y no cambia.';
comment on column retail.hojas_reclamacion.respondida_en is 'Cuándo CAYLA la respondió: la fecha que cuenta para el plazo de 15 días hábiles.';
comment on column retail.hojas_reclamacion.respondida_por is 'Quién la respondió (el responsable del combo, ADR-0162).';
comment on column retail.hojas_reclamacion.respuesta_enviada_en is 'Cuándo salió la respuesta al correo del cliente. Null con respuesta: en cola (la tienda la reintenta).';

create index if not exists hojas_reclamacion_respuesta_pendiente_idx on retail.hojas_reclamacion (respondida_en)
  where respuesta is not null and respuesta_enviada_en is null;

-- ---------- 2. El candado, con la respuesta ----------
create or replace function retail.fn_hojas_reclamacion_reglas()
returns trigger
language plpgsql
set search_path = retail, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Una hoja del Libro de Reclamaciones no se borra.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    -- Lo que escribió el cliente y lo que decía la hoja ese día no cambia nunca.
    if (new.id, new.anio, new.numero, new.creada_en, new.marca, new.cuenta_web_id, new.proveedor_razon_social, new.proveedor_ruc,
        new.proveedor_domicilio, new.ubicacion_id, new.ubicacion_nombre, new.ubicacion_direccion, new.consumidor_nombre,
        new.consumidor_tipo_documento, new.consumidor_documento, new.consumidor_domicilio, new.consumidor_telefono,
        new.consumidor_correo, new.menor_de_edad, new.apoderado_nombre, new.bien_tipo, new.bien_monto, new.bien_descripcion,
        new.tipo, new.detalle, new.pedido)
       is distinct from
       (old.id, old.anio, old.numero, old.creada_en, old.marca, old.cuenta_web_id, old.proveedor_razon_social, old.proveedor_ruc,
        old.proveedor_domicilio, old.ubicacion_id, old.ubicacion_nombre, old.ubicacion_direccion, old.consumidor_nombre,
        old.consumidor_tipo_documento, old.consumidor_documento, old.consumidor_domicilio, old.consumidor_telefono,
        old.consumidor_correo, old.menor_de_edad, old.apoderado_nombre, old.bien_tipo, old.bien_monto, old.bien_descripcion,
        old.tipo, old.detalle, old.pedido) then
      raise exception 'Lo escrito en una hoja del Libro de Reclamaciones no cambia.' using errcode = '42501';
    end if;
    -- La copia (PARTE 2): enviada una vez, y los intentos solo suben.
    if old.copia_enviada_en is not null and new.copia_enviada_en is distinct from old.copia_enviada_en then
      raise exception 'La copia de la hoja ya salió: no se desmarca.' using errcode = '42501';
    end if;
    if new.copia_intentos < old.copia_intentos then
      raise exception 'Los intentos de la copia no bajan.' using errcode = '42501';
    end if;
    -- La respuesta (PARTE 4): se escribe una vez, con quién y cuándo, y no cambia; su correo se marca una vez.
    if old.respuesta is not null
       and (new.respuesta, new.respondida_en, new.respondida_por) is distinct from (old.respuesta, old.respondida_en, old.respondida_por) then
      raise exception 'La respuesta de una hoja no se corrige.' using errcode = '42501';
    end if;
    if old.respuesta_enviada_en is not null and new.respuesta_enviada_en is distinct from old.respuesta_enviada_en then
      raise exception 'La respuesta ya salió por correo: no se desmarca.' using errcode = '42501';
    end if;
    if new.respuesta_intentos < old.respuesta_intentos then
      raise exception 'Los intentos de la respuesta no bajan.' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function retail.fn_hojas_reclamacion_reglas() from public, anon, authenticated;

-- ---------- 3. Responder (ERP) ----------
create or replace function retail.responder_hoja_reclamacion(p_id uuid, p_respuesta text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_texto text;
  v_hay boolean := false;
  v_respuesta text;
  v_codigo text;
begin
  perform retail.fn_exigir_modulo('libro_reclamaciones');
  v_actor := retail.fn_actor_persona_id(true);
  v_texto := retail.fn_recomendacion_texto(p_respuesta);
  if v_texto is null or char_length(v_texto) < 10 then
    raise exception 'Escribe la respuesta (10 letras como mínimo) antes de enviarla.' using errcode = 'P0001', hint = 'libro_respuesta_corta';
  end if;
  if char_length(v_texto) > 3000 then
    raise exception 'La respuesta va en 3000 letras como mucho: acórtala un poco.' using errcode = 'P0001', hint = 'libro_respuesta_larga';
  end if;
  for v_respuesta, v_codigo in
    select h.respuesta, h.codigo from retail.hojas_reclamacion h where h.id = p_id for update
  loop
    v_hay := true;
    exit;
  end loop;
  if not v_hay then
    raise exception 'Esa hoja ya no está: recarga la pantalla.' using errcode = 'P0001', hint = 'libro_no_existe';
  end if;
  if v_respuesta is not null then
    -- La misma respuesta otra vez (dos toques, dos pestañas): ya está. Otra distinta no pisa la que el cliente ya recibió.
    if v_respuesta = v_texto then
      return jsonb_build_object('estado', 'ya_estaba');
    end if;
    raise exception 'Esta hoja ya tiene respuesta: recarga la pantalla para verla.' using errcode = 'P0001', hint = 'libro_ya_respondida';
  end if;
  update retail.hojas_reclamacion set respuesta = v_texto, respondida_en = now(), respondida_por = v_actor where id = p_id;
  begin
    perform retail.fn_actividad_anotar(
      'libro_reclamaciones', 'responder', 'respondió la hoja ' || v_codigo || ' del Libro de Reclamaciones', v_actor,
      retail.fn_actividad_terminal_ahora(), retail.fn_actividad_sede_de(v_actor, 'vivo'), null, 'hojas_reclamacion', p_id::text, now(),
      '{}'::jsonb, 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la respuesta de la hoja (%)', sqlerrm;
  end;
  return jsonb_build_object('estado', 'respondida');
end;
$fn$;
comment on function retail.responder_hoja_reclamacion(uuid, text) is
  'Tienda web ▸ Libro de Reclamaciones (ADR-0679): responde una hoja (de 10 a 3000 letras, ya limpias), firmada con el responsable del combo; la tienda se la manda al cliente por correo. Una sola vez: la misma respuesta otra vez es {estado: ya_estaba}; otra distinta, P0001 libro_ya_respondida. Pide el módulo «libro_reclamaciones».';

-- ---------- 4. La lista del ERP, con la respuesta ----------
create or replace function retail.fn_libro_reclamaciones()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  perform retail.fn_exigir_modulo('libro_reclamaciones');
  return jsonb_build_object(
    'hoy', v_hoy,
    'hojas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'codigo', x.codigo, 'creada_en', x.creada_en, 'tipo', x.tipo,
               'tienda', x.ubicacion_nombre,
               'consumidor', jsonb_build_object(
                 'nombre', x.consumidor_nombre, 'tipo_documento', x.consumidor_tipo_documento, 'documento', x.consumidor_documento,
                 'domicilio', x.consumidor_domicilio, 'telefono', x.consumidor_telefono, 'correo', x.consumidor_correo,
                 'menor_de_edad', x.menor_de_edad, 'apoderado', x.apoderado_nombre),
               'bien', jsonb_build_object('tipo', x.bien_tipo, 'monto', x.bien_monto, 'descripcion', x.bien_descripcion),
               'detalle', x.detalle, 'pedido', x.pedido,
               'copia_enviada', x.copia_enviada_en is not null,
               'vence_el', x.vence,
               'dias_restantes', retail.fn_libro_dias_habiles_restantes(v_hoy, x.vence),
               'respuesta', x.respuesta,
               'respondida_en', x.respondida_en,
               'respuesta_enviada', x.respuesta_enviada_en is not null)
             order by x.creada_en desc, x.id)
        from (select h.*, retail.fn_libro_vence_el((h.creada_en at time zone 'America/Lima')::date) as vence
                from retail.hojas_reclamacion h
               order by h.creada_en desc, h.id
               limit 1000) x), '[]'::jsonb),
    'hay_mas', (select count(*) > 1000 from retail.hojas_reclamacion));
end;
$$;

-- ---------- 5. La constancia del cliente, con la respuesta ----------
create or replace function retail.tienda_ver_hoja_reclamacion(p_id uuid, p_marca uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'id', h.id, 'codigo', h.codigo, 'creada_en', h.creada_en,
    'proveedor', jsonb_build_object('razon_social', h.proveedor_razon_social, 'ruc', h.proveedor_ruc, 'domicilio', h.proveedor_domicilio),
    'tienda', case when h.ubicacion_id is null then null
                   else jsonb_build_object('nombre', h.ubicacion_nombre, 'direccion', h.ubicacion_direccion) end,
    'consumidor', jsonb_build_object(
      'nombre', h.consumidor_nombre, 'tipo_documento', h.consumidor_tipo_documento, 'documento', h.consumidor_documento,
      'domicilio', h.consumidor_domicilio, 'telefono', h.consumidor_telefono, 'correo', h.consumidor_correo,
      'menor_de_edad', h.menor_de_edad, 'apoderado', h.apoderado_nombre),
    'bien', jsonb_build_object('tipo', h.bien_tipo, 'monto', h.bien_monto, 'descripcion', h.bien_descripcion),
    'tipo', h.tipo, 'detalle', h.detalle, 'pedido', h.pedido,
    'copia_enviada', h.copia_enviada_en is not null,
    'respuesta', h.respuesta,
    'respondida_en', h.respondida_en)
    from retail.hojas_reclamacion h
   where p_id is not null and p_marca is not null and h.id = p_id and h.marca = p_marca
$$;

-- ---------- 6. La respuesta por correo (tienda) ----------
create or replace function retail.tienda_libro_respuestas_reclamar(p_limite integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 20), 1), 100);
  v_respuestas jsonb;
begin
  with tomadas as (
    select h.id from retail.hojas_reclamacion h
     where h.respuesta is not null and h.respuesta_enviada_en is null and h.respuesta_intentos < 5
       and (h.respuesta_tomada_en is null or h.respuesta_tomada_en < now() - interval '2 minutes')
     order by h.respondida_en, h.id
     limit v_limite
     for update skip locked
  ),
  sumadas as (
    update retail.hojas_reclamacion h set respuesta_intentos = h.respuesta_intentos + 1, respuesta_tomada_en = now()
      from tomadas t where h.id = t.id
    returning h.id, h.marca, h.respondida_en, h.respuesta_intentos
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'marca', s.marca, 'intentos', s.respuesta_intentos,
           'hoja', retail.tienda_ver_hoja_reclamacion(s.id, s.marca))
         order by s.respondida_en, s.id), '[]'::jsonb)
    into v_respuestas
    from sumadas s;
  return jsonb_build_object('estado', 'ok', 'respuestas', v_respuestas);
end;
$$;
comment on function retail.tienda_libro_respuestas_reclamar(integer) is
  'Tienda online, Libro de Reclamaciones (ADR-0679): toma hasta `limite` hojas respondidas cuya respuesta no salió por correo (skip locked; no las tomadas hace menos de 2 minutos; hasta 5 intentos), les suma un intento y devuelve {estado, respuestas: [{marca, intentos, hoja}]}. Solo la llama tienda_web.';

create or replace function retail.tienda_libro_respuesta_enviada(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
begin
  update retail.hojas_reclamacion set respuesta_enviada_en = now()
   where id = p_id and respuesta is not null and respuesta_enviada_en is null;
  return jsonb_build_object('estado', 'ok');
end;
$$;
comment on function retail.tienda_libro_respuesta_enviada(uuid) is
  'Tienda online, Libro de Reclamaciones (ADR-0679): marca que la respuesta de una hoja salió por correo. Una vez. Solo la llama tienda_web.';

-- ---------- 7. Permisos ----------
revoke all on function retail.responder_hoja_reclamacion(uuid, text) from public, anon;
grant execute on function retail.responder_hoja_reclamacion(uuid, text) to authenticated;
revoke all on function retail.fn_libro_reclamaciones() from public, anon, authenticated;
grant execute on function retail.fn_libro_reclamaciones() to authenticated;
revoke all on function retail.tienda_ver_hoja_reclamacion(uuid, uuid) from public, anon, authenticated;
grant execute on function retail.tienda_ver_hoja_reclamacion(uuid, uuid) to tienda_web;
revoke all on function retail.tienda_libro_respuestas_reclamar(integer) from public, anon, authenticated;
revoke all on function retail.tienda_libro_respuesta_enviada(uuid) from public, anon, authenticated;
grant execute on function retail.tienda_libro_respuestas_reclamar(integer) to tienda_web;
grant execute on function retail.tienda_libro_respuesta_enviada(uuid) to tienda_web;
