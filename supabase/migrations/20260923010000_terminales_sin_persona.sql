-- ============================================================================
-- 20260923010000_terminales_sin_persona.sql — CAYLA V2 · ADR-0162, fase F2
--
-- EL PROBLEMA PRIMERO. El ADR-0160 hizo de cada terminal una PERSONA de Dynamic, porque retail
-- averigua quién opera buscando su persona (`personas.auth_user_id = auth.uid()`). Eso obligaba a
-- crear 6 personas falsas en Dynamic (su directorio, su kiosco, su planilla) y dejaba a un aparato
-- firmando ventas. Dynamic lo resuelve distinto (`public.terminales`): el aparato tiene su propia
-- cuenta de Auth, SIN persona, y cada registro guarda las dos cosas — quién (una persona real) y
-- desde qué aparato. Esta migración copia ese modelo para las terminales de retail.
--
-- QUÉ HACE
--   1. `retail.terminales`: un aparato por fila (tienda, tipo, cuenta de Auth propia). Nunca se
--      borra: se desactiva. Candado de Dynamic `activo ⇒ auth_user_id not null`.
--   2. `fn_terminal_actual()`: la terminal activa de la sesión (o nada). Equivale a
--      `fn_sede_actual_terminal()` de Dynamic.
--   3. `fn_persona_presente(persona, ubicación, momento)`: ¿estaba «presente» en esa tienda a esa
--      hora? Misma lectura de asistencia que `fn_asesoras_de_turno` (marcajes y, si no hay, jornada),
--      para que la lista del combo y el candado nunca discrepen. En pausa NO cuenta (Felipe, 2026-09-22).
--   4. `fn_actor_persona_id(p_de_tienda)`: QUIÉN FIRMA. Con sesión de terminal: la persona del
--      encabezado `x-responsable`, que debe estar presente en la tienda de la terminal — si no, error.
--      Con sesión de persona: ella misma, salvo en operaciones de tienda donde llega un responsable
--      (ADR-0161). La fase F3 reemplaza con esta función las ~65 búsquedas `select id into v_persona
--      from personas where auth_user_id = auth.uid()`.
--   5. `fn_exige_responsable()`: interruptor. Hoy FALSO: una persona que no manda responsable sigue
--      firmando a su nombre (la web todavía no lo manda en todas las pantallas). Se pasa a VERDADERO
--      con un `create or replace` cuando la web publicada ya lo mande (fase F4). Las terminales lo
--      exigen SIEMPRE, sin importar el interruptor.
--   6. Los ayudantes del ADR-0160 cambian de FUENTE, no de firma: `fn_es_terminal`, `fn_mi_terminal`,
--      `fn_ubicacion_actual_persona` y `fn_persona_actual_resumen` leen `retail.terminales`. Las 5
--      capacidades `fn_puede_*` y las 23 funciones que las llaman no se tocan.
--   7. `terminal_id` en 10 tablas, sellado por un disparador al insertar (desde qué aparato).
--   8. `fn_terminales()`, `desactivar_terminal()`, `reactivar_terminal()`: la pantalla
--      Colaboradores ▸ Terminales. Crear una terminal NO es una RPC: exige la llave de servicio
--      (crear el usuario de Auth) y lo hace `pnpm terminales:crear` (ADR-0162, «por qué un script»).
--   9. Retiro de la terminal-persona del ADR-0160: `colaboradores.terminal` queda vacía para siempre
--      (tenía 0 filas en producción, verificado 2026-09-22) y `agregar_terminal` explica el camino nuevo.
--
-- LOS PERMISOS SON DE LA CUENTA, NO DE QUIEN FIRMA. `fn_es_lider()` sigue mirando `auth.uid()`: para
-- una terminal es falso aunque la responsable elegida sea líder. Si mirara al responsable, elegir a
-- una líder en el combo (sin PIN, ADR-0161 A2) le daría a cualquiera los poderes de líder.
--
-- SE ROMPE SI
--   · Alguien cambia `fn_es_lider()` para que lea `fn_actor_persona_id()`: la terminal hereda
--     poderes de líder. `pnpm pruebas:terminales-sin-persona` lo detecta.
--   · Dynamic cambia los nombres de `marcajes`/`jornadas` o sus tipos de marca: `fn_persona_presente`
--     devuelve falso (falla CERRADO: bloquea, nunca abre) — igual que `fn_asesoras_de_turno`.
--
-- Re-ejecutable. En el repo SIN prefijo `retail.` en lo que el search_path resuelve; al pegar en el
-- SQL Editor de producción, empezar con `set search_path to retail, public, extensions;`.
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. La tabla ====================
create table if not exists retail.terminales (
  id              uuid primary key default gen_random_uuid(),
  ubicacion_id    uuid not null references retail.ubicaciones (id),
  nombre          text not null check (length(trim(nombre)) > 0),
  tipo            text not null check (tipo in ('ventas', 'administrativa')),
  auth_user_id    uuid unique references auth.users (id) on delete set null,
  activo          boolean not null default true,
  creada_at       timestamptz not null default now(),
  creada_por      uuid references public.personas (id),
  desactivada_at  timestamptz,
  desactivada_por uuid references public.personas (id),
  -- Lección de Dynamic (su migración 0202): una terminal activa sin cuenta dejaría abierto el candado.
  constraint terminales_activa_con_cuenta check (not activo or auth_user_id is not null)
);

comment on table retail.terminales is
  'Aparatos compartidos de cada tienda, con cuenta de Auth propia y SIN persona (ADR-0162). Lo que hacen lo firma el responsable elegido; el aparato queda en terminal_id. Nunca se borran: se desactivan.';

-- Una terminal ACTIVA de cada tipo por tienda. Una desactivada no ocupa el lugar.
create unique index if not exists terminales_una_activa_por_tipo_y_tienda
  on retail.terminales (ubicacion_id, tipo) where activo;

alter table retail.terminales enable row level security;

-- Leer: el líder ve todas; una terminal ve solo la suya (como `terminales_select_propio` de Dynamic).
-- Escribir: nadie por la API — solo las RPC de abajo y el script con la llave de servicio.
drop policy if exists terminales_select on retail.terminales;
create policy terminales_select on retail.terminales for select to authenticated
  using (retail.fn_es_lider() or auth_user_id = auth.uid());

revoke all on retail.terminales from anon;
revoke insert, update, delete on retail.terminales from authenticated;
grant select on retail.terminales to authenticated;

-- ==================== 2. Quién es la terminal de esta sesión ====================
create or replace function retail.fn_terminal_actual()
returns table (id uuid, ubicacion_id uuid, tipo text, nombre text)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select t.id, t.ubicacion_id, t.tipo, t.nombre
  from retail.terminales t
  join retail.ubicaciones u on u.id = t.ubicacion_id and u.activo
  where t.auth_user_id = auth.uid() and t.activo;
$$;

-- ==================== 3. ¿Estaba presente? ====================
-- Misma lectura que `fn_asesoras_de_turno` (ADR-0153/0163), sin su candado de «quién consulta»: esta
-- la llaman otras funciones security definer, nunca la pantalla. SQL dinámico para que la base local
-- (donde `marcajes`/`jornadas` no existen) compile y devuelva falso en vez de romper.
create or replace function retail.fn_persona_presente(p_persona_id uuid, p_ubicacion_id uuid, p_momento timestamptz default now())
returns boolean
language plpgsql stable security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_sede uuid;
  v_fecha date := (p_momento at time zone 'America/Lima')::date;
  v_tipo text;
  v_jornada text;
begin
  if p_persona_id is null or p_ubicacion_id is null then
    return false;
  end if;
  select u.sede_dynamic_id into v_sede from retail.ubicaciones u where u.id = p_ubicacion_id;
  if v_sede is null then
    return false; -- tienda sin vínculo con Dynamic: nadie puede estar presente (falla cerrado)
  end if;
  begin
    execute $q$
      select m.tipo::text from public.marcajes m
      where m.persona_id = $1 and m.sede_id = $2 and m.anulada_at is null
        and coalesce(m.fecha_jornada, (m.timestamp_marca at time zone 'America/Lima')::date) = $3
        and m.timestamp_marca <= $4
      order by m.timestamp_marca desc limit 1
    $q$ into v_tipo using p_persona_id, v_sede, v_fecha, p_momento;
    if v_tipo is not null then
      return v_tipo in ('entrada', 'retorno_almuerzo', 'retorno_personal', 'retorno_tramite', 'retorno_medico', 'retorno_otro');
    end if;
    -- Sin marcas: la jornada abierta cuenta (misma regla que la lista del combo).
    execute $q$ select j.estado::text from public.jornadas j where j.persona_id = $1 and j.sede_id = $2 and j.fecha = $3 limit 1 $q$
      into v_jornada using p_persona_id, v_sede, v_fecha;
    -- coalesce: sin jornada, `null = 'abierta'` es NULL y un `if not NULL` no bloquea — el candado quedaría abierto.
    return coalesce(v_jornada = 'abierta', false);
  exception when undefined_table or undefined_column then
    return false;
  end;
end;
$fn$;

-- ==================== 4. El interruptor para las personas ====================
create or replace function retail.fn_exige_responsable() returns boolean
language sql stable as $$ select false $$;
comment on function retail.fn_exige_responsable() is
  'ADR-0161/0162: ¿una PERSONA debe mandar x-responsable en las operaciones de tienda? Falso hasta que la web publicada lo mande en todas las pantallas; entonces se cambia a true con create or replace. Las terminales lo exigen siempre.';

-- ==================== 5. Quién firma ====================
create or replace function retail.fn_actor_persona_id(p_de_tienda boolean default true)
returns uuid
language plpgsql stable security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_headers json;
  v_texto text;
  v_responsable uuid;
  v_momento timestamptz := now();
  v_ubicacion uuid;
  v_terminal record;
  v_yo uuid;
begin
  -- Sin sesión (SQL Editor, scripts con la llave de servicio): igual que antes, nadie.
  if auth.uid() is null then
    return null;
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  v_texto := nullif(trim(v_headers ->> 'x-responsable'), '');
  if v_texto is not null then
    begin
      v_responsable := v_texto::uuid;
    exception when invalid_text_representation then
      raise exception 'El responsable enviado no es válido' using errcode = '22P02';
    end;
  end if;
  -- Venta sin conexión: vale la hora de la venta (Felipe, 2026-09-22), acotada a 7 días atrás.
  v_texto := nullif(trim(v_headers ->> 'x-momento'), '');
  if v_texto is not null then
    begin
      v_momento := v_texto::timestamptz;
    exception when others then
      raise exception 'La hora de la operación no es válida' using errcode = '22007';
    end;
    if v_momento > now() + interval '5 minutes' or v_momento < now() - interval '7 days' then
      raise exception 'La hora de la operación está fuera de rango' using errcode = '22007';
    end if;
  end if;

  select * into v_terminal from retail.fn_terminal_actual() limit 1;

  -- Sesión de TERMINAL: siempre firma una persona presente en SU tienda.
  if v_terminal.id is not null then
    if v_responsable is null then
      raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
    end if;
    if not exists (select 1 from public.personas p join retail.colaboradores c on c.persona_id = p.id
                   where p.id = v_responsable and p.estado = 'activo') then
      raise exception 'Esa persona no tiene acceso a retail' using errcode = '42501', hint = 'responsable_sin_acceso';
    end if;
    if not retail.fn_persona_presente(v_responsable, v_terminal.ubicacion_id, v_momento) then
      raise exception 'Esa persona no está de turno en esta tienda: tiene que marcar su entrada' using errcode = '42501', hint = 'responsable_no_presente';
    end if;
    return v_responsable;
  end if;

  -- Sesión de PERSONA.
  select p.id into v_yo from public.personas p where p.auth_user_id = auth.uid();
  if not p_de_tienda or (v_responsable is null and not retail.fn_exige_responsable()) then
    return v_yo; -- idéntico a la búsqueda que reemplaza
  end if;
  if v_responsable is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  begin
    v_ubicacion := nullif(trim(v_headers ->> 'x-ubicacion'), '')::uuid;
  exception when invalid_text_representation then
    v_ubicacion := null;
  end;
  if v_ubicacion is null or not retail.fn_puede_operar_ubicacion(v_ubicacion) then
    raise exception 'Falta la tienda de la operación' using errcode = '42501', hint = 'ubicacion_requerida';
  end if;
  if not exists (select 1 from public.personas p join retail.colaboradores c on c.persona_id = p.id
                 where p.id = v_responsable and p.estado = 'activo') then
    raise exception 'Esa persona no tiene acceso a retail' using errcode = '42501', hint = 'responsable_sin_acceso';
  end if;
  if not retail.fn_persona_presente(v_responsable, v_ubicacion, v_momento) then
    raise exception 'Esa persona no está de turno en esta tienda: tiene que marcar su entrada' using errcode = '42501', hint = 'responsable_no_presente';
  end if;
  return v_responsable;
end;
$fn$;

comment on function retail.fn_actor_persona_id(boolean) is
  'ADR-0162: quién FIRMA la operación (usuario_id). Terminal: el x-responsable presente en su tienda, siempre. Persona: ella misma, o el responsable enviado en operaciones de tienda. NO decide permisos: eso sigue siendo de la cuenta (fn_es_lider, fn_puede_*).';

-- ==================== 6. Los ayudantes del ADR-0160 cambian de fuente ====================
create or replace function retail.fn_es_terminal(p_tipo text default null)
returns boolean
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select exists (select 1 from retail.fn_terminal_actual() t where p_tipo is null or t.tipo = p_tipo);
$$;

create or replace function retail.fn_mi_terminal()
returns text
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select t.tipo from retail.fn_terminal_actual() t limit 1;
$$;

-- La tienda de la sesión: la de la terminal, o la de la persona (definición de producción del
-- 2026-09-22, sin cambios en su rama de persona). Así `fn_puede_operar_ubicacion` no cambia.
create or replace function retail.fn_ubicacion_actual_persona()
returns uuid
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select coalesce(
    (select t.ubicacion_id from retail.fn_terminal_actual() t limit 1),
    (select u.id
       from public.personas p
       join retail.colaboradores c on c.persona_id = p.id
       left join ubicaciones u on
         (c.rol = 'lider' and u.sede_dynamic_id = p.sede_base_id)
         or (c.rol = 'colaborador' and u.id = c.ubicacion_asignada_id)
      where p.auth_user_id = auth.uid() and p.estado = 'activo' and c.estado = 'activo'
      limit 1)
  );
$$;

-- El resumen de la cabecera: la rama de persona es la de producción del 2026-09-22; se suma la de
-- terminal (nombre del aparato, nunca líder, su tienda). Mismo tipo de retorno: `create or replace`.
create or replace function retail.fn_persona_actual_resumen()
returns table (nombre text, es_lider boolean, ubicacion_id uuid, ubicacion_nombre text, ubicacion_tipo text)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select t.nombre, false, u.id, u.nombre, u.tipo
  from retail.fn_terminal_actual() t
  join ubicaciones u on u.id = t.ubicacion_id
  union all
  select
    p.nombres || ' ' || p.apellidos,
    c.rol = 'lider',
    case when u.id is null and c.rol = 'lider'
      then (select id from ubicaciones order by (tipo = 'tienda') desc, created_at asc limit 1)
      else u.id end,
    case when u.id is null and c.rol = 'lider'
      then (select nombre from ubicaciones order by (tipo = 'tienda') desc, created_at asc limit 1)
      else u.nombre end,
    case when u.id is null and c.rol = 'lider'
      then (select tipo from ubicaciones order by (tipo = 'tienda') desc, created_at asc limit 1)
      else u.tipo end
  from public.personas p
  join retail.colaboradores c on c.persona_id = p.id and c.estado = 'activo'
  left join ubicaciones u on
    (c.rol = 'lider' and u.sede_dynamic_id = p.sede_base_id)
    or (c.rol = 'colaborador' and u.id = c.ubicacion_asignada_id)
  where p.auth_user_id = auth.uid() and p.estado = 'activo';
$$;

-- ==================== 7. terminal_id: desde qué aparato ====================
-- Un disparador lo sella al insertar, así ninguna de las funciones que insertan en estas tablas
-- tiene que cambiar. En tablas que se cierran después (cajas, conteos, transferencias) queda el
-- aparato que las ABRIÓ; quién las cerró sigue en su columna `*_por`.
create or replace function retail.fn_sellar_terminal() returns trigger
language plpgsql security definer
set search_path = retail, public, extensions
as $$
begin
  if new.terminal_id is null then
    select t.id into new.terminal_id from retail.fn_terminal_actual() t limit 1;
  end if;
  return new;
end;
$$;

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array['ventas', 'movimientos', 'caja_movimientos', 'cajas', 'cambios', 'devoluciones',
                                 'comprobantes', 'conteos', 'transferencias', 'transferencia_recepciones'] loop
    if to_regclass('retail.' || v_tabla) is null then
      raise notice 'retail.% no existe en esta base: se omite', v_tabla;
      continue;
    end if;
    execute format('alter table retail.%I add column if not exists terminal_id uuid references retail.terminales (id)', v_tabla);
    execute format('drop trigger if exists trg_sellar_terminal on retail.%I', v_tabla);
    execute format('create trigger trg_sellar_terminal before insert on retail.%I for each row execute function retail.fn_sellar_terminal()', v_tabla);
  end loop;
end $$;

-- ==================== 8. La pantalla Colaboradores ▸ Terminales ====================
create or replace function retail.fn_terminales()
returns table (id uuid, nombre text, tipo text, ubicacion_id uuid, ubicacion_nombre text, activo boolean,
               creada_at timestamptz, desactivada_at timestamptz, ultimo_acceso timestamptz)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $fn$
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede ver las terminales' using errcode = '42501';
  end if;
  return query
    select t.id, t.nombre, t.tipo, t.ubicacion_id, u.nombre, t.activo, t.creada_at, t.desactivada_at, au.last_sign_in_at
    from retail.terminales t
    join retail.ubicaciones u on u.id = t.ubicacion_id
    left join auth.users au on au.id = t.auth_user_id
    order by u.nombre, t.tipo;
end;
$fn$;

create or replace function retail.desactivar_terminal(p_terminal_id uuid)
returns void
language plpgsql security definer
set search_path = retail, public, extensions
as $fn$
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede desactivar una terminal' using errcode = '42501';
  end if;
  update retail.terminales
     set activo = false, desactivada_at = now(),
         desactivada_por = (select p.id from public.personas p where p.auth_user_id = auth.uid())
   where id = p_terminal_id and activo;
  if not found then
    raise exception 'Esa terminal no existe o ya está desactivada';
  end if;
end;
$fn$;

create or replace function retail.reactivar_terminal(p_terminal_id uuid)
returns void
language plpgsql security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_t retail.terminales;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede reactivar una terminal' using errcode = '42501';
  end if;
  select * into v_t from retail.terminales where id = p_terminal_id;
  if v_t.id is null or v_t.activo then
    raise exception 'Esa terminal no existe o ya está activa';
  end if;
  if v_t.auth_user_id is null then
    raise exception 'Esa terminal ya no tiene cuenta: créala de nuevo con pnpm terminales:crear';
  end if;
  if exists (select 1 from retail.terminales where ubicacion_id = v_t.ubicacion_id and tipo = v_t.tipo and activo) then
    raise exception 'Esa tienda ya tiene una terminal de % activa', v_t.tipo;
  end if;
  update retail.terminales set activo = true, desactivada_at = null, desactivada_por = null where id = p_terminal_id;
end;
$fn$;

-- ==================== 9. Retiro de la terminal-persona del ADR-0160 ====================
-- 0 filas en producción (verificado 2026-09-22). Si alguna base tuviera una, esto aborta: no se
-- pierde nada en silencio.
do $$
begin
  if exists (select 1 from retail.colaboradores where terminal is not null)
     or exists (select 1 from retail.colaboradores_suspendidos where terminal is not null) then
    raise exception 'Hay terminales-persona del ADR-0160: migrarlas a mano a retail.terminales antes de seguir';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'colaboradores_terminal_retirada') then
    alter table retail.colaboradores add constraint colaboradores_terminal_retirada check (terminal is null);
  end if;
end $$;
comment on column retail.colaboradores.terminal is 'RETIRADA por el ADR-0162: siempre null. Las terminales viven en retail.terminales, sin persona.';

create or replace function retail.agregar_terminal(p_persona_id uuid, p_ubicacion_id uuid, p_terminal text)
returns void
language plpgsql security definer
set search_path = retail, public, extensions
as $fn$
begin
  raise exception 'Las terminales ya no son personas (ADR-0162): se crean con pnpm terminales:crear' using errcode = '0A000';
end;
$fn$;

-- ==================== 10. Grants ====================
do $$
declare
  v_firma text;
begin
  foreach v_firma in array array[
    'retail.fn_terminal_actual()', 'retail.fn_persona_presente(uuid, uuid, timestamptz)', 'retail.fn_exige_responsable()',
    'retail.fn_actor_persona_id(boolean)', 'retail.fn_es_terminal(text)', 'retail.fn_mi_terminal()',
    'retail.fn_ubicacion_actual_persona()', 'retail.fn_persona_actual_resumen()', 'retail.fn_terminales()',
    'retail.desactivar_terminal(uuid)', 'retail.reactivar_terminal(uuid)', 'retail.agregar_terminal(uuid, uuid, text)'] loop
    execute format('revoke all on function %s from public, anon', v_firma);
    execute format('grant execute on function %s to authenticated', v_firma);
  end loop;
  -- El disparador corre como dueño; nadie lo llama directo.
  revoke all on function retail.fn_sellar_terminal() from public, anon, authenticated;
end $$;
