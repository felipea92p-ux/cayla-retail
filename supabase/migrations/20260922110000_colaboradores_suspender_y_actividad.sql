-- ============================================================================
-- 20260922110000_colaboradores_suspender_y_actividad.sql — CAYLA V2
--
-- Rediseño de /colaboradores (ADR-0148): Suspender / Reactivar, Cambiar ubicación,
-- alta de varias personas a la vez, pestaña «Inactivas en Dynamic» y pestaña
-- «Actividad» (historial de accesos que solo se agrega — tarea #3 de la auditoría
-- `docs/pantallas/colaboradores.md`).
--
-- DECISIÓN CENTRAL: suspender MUEVE la fila, no le pone una bandera.
--   `retail.colaboradores` sigue siendo exactamente «quién tiene la puerta abierta hoy».
--   Una persona suspendida sale de esa tabla y vive en `retail.colaboradores_suspendidos`
--   con todo lo que se necesita para devolverla igual que estaba (rol, ubicación, quién
--   la agregó, cuándo). Así NO se toca ninguna función de acceso —`fn_tiene_acceso_retail`,
--   `fn_es_lider`, `fn_ubicacion_actual_persona`, `fn_persona_actual_resumen`, las políticas
--   RLS de todo el sistema— y un suspendido no puede entrar por ningún camino, incluidos
--   los que leen `colaboradores` a mano (stock por sede, registrar_venta, perfil).
--   La alternativa (columna `suspendido_en` + reescribir esas funciones) obligaba a acertar
--   ocho lugares a la vez; olvidar uno dejaba a un suspendido operando.
--
-- LO QUE HACE
--   1) Tabla `colaboradores_suspendidos` (solo se escribe por RPC; lee solo un líder) y un
--      candado cruzado: nadie puede estar a la vez en las dos tablas.
--   2) Tabla `colaboradores_historial`: cada alta, baja, suspensión, reactivación y cambio
--      de ubicación queda escrito una vez y no se puede editar ni borrar (ni por error desde
--      el SQL Editor: un trigger lo impide). Se siembra con las altas que ya existen.
--   3) RPC nuevas, solo líder, SECURITY DEFINER con search_path fijo:
--      `suspender_colaborador`, `reactivar_colaborador`, `cambiar_ubicacion_colaborador`,
--      `agregar_colaboradores` (varias personas, todo o nada). `agregar_colaborador` y
--      `quitar_colaborador` (ADR-0145) siguen con la misma firma y ahora también escriben
--      el historial; `quitar_colaborador` alcanza también a los suspendidos.
--   4) Lecturas: `fn_colaboradores` cambia de forma (suma `ubicacion_id`, `es_yo`,
--      `ultimo_acceso`: hay que dropear la firma vieja, `create or replace` no puede cambiar
--      las columnas que devuelve), y nacen `fn_colaboradores_suspendidos`,
--      `fn_colaboradores_inactivos` y `fn_colaboradores_actividad`. Cada persona aparece en
--      UNA sola lista: activos, suspendidos (activos en Dynamic) o inactivos en Dynamic.
--      `fn_dynamic_disponibles` deja de ofrecer a un suspendido como «sin acceso».
--
-- SE ROMPE SI
--   · Se despliega la web antes de pegar esto: la pantalla nueva llama funciones que no
--     existen. Orden: pegar la migración en producción primero, después fusionar la web.
--     (La web VIEJA sigue funcionando con la base nueva.)
--   · Alguien inserta a mano en `colaboradores` a una persona que sigue suspendida: el
--     trigger `colaboradores_no_suspendido` lo rechaza — reactivarla es por RPC.
--
-- Re-ejecutable. Producción: se pega entera en el SQL Editor de cayla-dynamic (trae `retail.`).
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1) suspendidos: la fila se mueve aquí, no se marca ----------
create table if not exists retail.colaboradores_suspendidos (
  persona_id            uuid primary key references public.personas (id),
  rol                   text not null check (rol in ('lider', 'colaborador')),
  ubicacion_asignada_id uuid references retail.ubicaciones (id),
  agregado_por          uuid references public.personas (id),
  agregado_en           timestamptz not null,
  suspendido_por        uuid not null references public.personas (id),
  suspendido_en         timestamptz not null default now(),
  motivo                text,
  constraint colaboradores_suspendidos_colaborador_con_ubicacion
    check (rol = 'lider' or ubicacion_asignada_id is not null),
  constraint colaboradores_suspendidos_motivo_largo
    check (motivo is null or char_length(motivo) between 1 and 300)
);

alter table retail.colaboradores_suspendidos enable row level security;

drop policy if exists colaboradores_suspendidos_select on retail.colaboradores_suspendidos;
create policy colaboradores_suspendidos_select on retail.colaboradores_suspendidos
  for select using (retail.fn_es_lider());

revoke all on retail.colaboradores_suspendidos from authenticated, anon;
grant select on retail.colaboradores_suspendidos to authenticated;

-- Candado cruzado: una persona no puede tener la puerta abierta Y estar suspendida.
create or replace function retail.fn_colaboradores_no_suspendido() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if exists (select 1 from retail.colaboradores_suspendidos where persona_id = new.persona_id) then
    raise exception 'Esa persona está suspendida — reactívala en vez de agregarla de nuevo'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists colaboradores_no_suspendido on retail.colaboradores;
create trigger colaboradores_no_suspendido
  before insert on retail.colaboradores
  for each row execute function retail.fn_colaboradores_no_suspendido();

create or replace function retail.fn_suspendidos_no_colaborador() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if exists (select 1 from retail.colaboradores where persona_id = new.persona_id) then
    raise exception 'Esa persona todavía tiene acceso — primero hay que sacarla de colaboradores'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists suspendidos_no_colaborador on retail.colaboradores_suspendidos;
create trigger suspendidos_no_colaborador
  before insert on retail.colaboradores_suspendidos
  for each row execute function retail.fn_suspendidos_no_colaborador();

-- ---------- 2) historial: se escribe una vez y no se toca ----------
create table if not exists retail.colaboradores_historial (
  id                    bigint generated always as identity primary key,
  persona_id            uuid not null,   -- sin FK a propósito: el historial sobrevive a lo que pase con la persona
  accion                text not null check (accion in ('alta', 'baja', 'suspension', 'reactivacion', 'ubicacion')),
  por                   uuid,            -- quién lo hizo; nulo = alta inicial sembrada por esta migración
  rol                   text,
  ubicacion_anterior_id uuid,
  ubicacion_nueva_id    uuid,
  motivo                text,
  created_at            timestamptz not null default now()
);

create index if not exists colaboradores_historial_reciente_idx
  on retail.colaboradores_historial (created_at desc, id desc);

alter table retail.colaboradores_historial enable row level security;

drop policy if exists colaboradores_historial_select on retail.colaboradores_historial;
create policy colaboradores_historial_select on retail.colaboradores_historial
  for select using (retail.fn_es_lider());

revoke all on retail.colaboradores_historial from authenticated, anon;
grant select on retail.colaboradores_historial to authenticated;

create or replace function retail.fn_historial_colaboradores_inmutable() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  raise exception 'El historial de accesos solo se agrega: no se edita ni se borra'
    using errcode = '42501';
end;
$$;

drop trigger if exists colaboradores_historial_inmutable on retail.colaboradores_historial;
create trigger colaboradores_historial_inmutable
  before update or delete on retail.colaboradores_historial
  for each row execute function retail.fn_historial_colaboradores_inmutable();

-- Único escritor del historial. Solo lo llaman las RPC de abajo (corren como el dueño).
create or replace function retail.fn_historial_colaborador(
  p_persona_id uuid, p_accion text, p_rol text,
  p_ubicacion_anterior uuid, p_ubicacion_nueva uuid, p_motivo text
) returns void
language sql
security definer
set search_path = retail, public, extensions
as $$
  insert into retail.colaboradores_historial (persona_id, accion, por, rol, ubicacion_anterior_id, ubicacion_nueva_id, motivo)
  values (
    p_persona_id, p_accion,
    (select id from public.personas where auth_user_id = auth.uid()),
    p_rol, p_ubicacion_anterior, p_ubicacion_nueva, p_motivo
  );
$$;

revoke all on function retail.fn_historial_colaborador(uuid, text, text, uuid, uuid, text) from public, anon, authenticated;

-- Siembra: las altas que ya existen (quién las agregó y cuándo). Una sola vez.
insert into retail.colaboradores_historial (persona_id, accion, por, rol, ubicacion_nueva_id, created_at)
select c.persona_id, 'alta', c.agregado_por, c.rol, c.ubicacion_asignada_id, c.created_at
from retail.colaboradores c
where not exists (select 1 from retail.colaboradores_historial);

-- ---------- 3) RPC ----------
-- Agregar (una persona): misma firma que antes; ahora también rechaza a una suspendida y anota el historial.
create or replace function retail.agregar_colaborador(p_persona_id uuid, p_ubicacion_id uuid) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_quien uuid;
  v_filas integer;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede gestionar colaboradores';
  end if;
  if not exists (select 1 from public.personas where id = p_persona_id and estado = 'activo') then
    raise exception 'Esa persona no existe o no está activa en Dynamic';
  end if;
  if not exists (select 1 from ubicaciones where id = p_ubicacion_id and activo) then
    raise exception 'Esa ubicación no existe o está inactiva';
  end if;
  if exists (select 1 from colaboradores_suspendidos where persona_id = p_persona_id) then
    raise exception 'Esa persona está suspendida — reactívala en vez de agregarla de nuevo';
  end if;
  select id into v_quien from public.personas where auth_user_id = auth.uid();
  -- Todo lo que entra por acá es Colaborador — Líder es un nivel que hoy
  -- no se asigna desde esta pantalla, solo lo tienen los ya registrados.
  insert into colaboradores (persona_id, agregado_por, rol, ubicacion_asignada_id)
    values (p_persona_id, v_quien, 'colaborador', p_ubicacion_id)
    on conflict (persona_id) do nothing;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'Esa persona ya tiene acceso a retail — actualiza la pantalla para verla en la lista';
  end if;
  perform retail.fn_historial_colaborador(p_persona_id, 'alta', 'colaborador', null, p_ubicacion_id, null);
end;
$$;

-- Agregar varias a la vez, a la misma ubicación. Todo o nada: si una falla, ninguna entra.
create or replace function retail.agregar_colaboradores(p_personas uuid[], p_ubicacion_id uuid) returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_id uuid;
  v_ids uuid[];
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede gestionar colaboradores';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_personas) as x where x is not null;
  if cardinality(v_ids) = 0 then
    raise exception 'Elige al menos una persona';
  end if;
  if cardinality(v_ids) > 50 then
    raise exception 'Son demasiadas personas de una vez — agrégalas en grupos de 50 o menos';
  end if;
  foreach v_id in array v_ids loop
    perform retail.agregar_colaborador(v_id, p_ubicacion_id);
  end loop;
  return cardinality(v_ids);
end;
$$;

-- Suspender: la persona pierde el acceso de inmediato y se puede reactivar igual que estaba.
create or replace function retail.suspender_colaborador(p_persona_id uuid, p_motivo text default null) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_quien uuid;
  v_fila retail.colaboradores%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede gestionar colaboradores';
  end if;
  select id into v_quien from public.personas where auth_user_id = auth.uid();
  if p_persona_id = v_quien then
    raise exception 'No puedes suspenderte a ti mismo — pide a otro líder que lo haga';
  end if;
  if v_motivo is not null and char_length(v_motivo) > 300 then
    raise exception 'El motivo es muy largo — máximo 300 caracteres';
  end if;
  select * into v_fila from colaboradores where persona_id = p_persona_id for update;
  if not found then
    if exists (select 1 from colaboradores_suspendidos where persona_id = p_persona_id) then
      raise exception 'Esa persona ya está suspendida — actualiza la pantalla';
    end if;
    raise exception 'Esa persona no tiene acceso a retail — actualiza la pantalla';
  end if;
  delete from colaboradores where persona_id = p_persona_id;
  insert into colaboradores_suspendidos (persona_id, rol, ubicacion_asignada_id, agregado_por, agregado_en, suspendido_por, motivo)
    values (v_fila.persona_id, v_fila.rol, v_fila.ubicacion_asignada_id, v_fila.agregado_por, v_fila.created_at, v_quien, v_motivo);
  perform retail.fn_historial_colaborador(p_persona_id, 'suspension', v_fila.rol, v_fila.ubicacion_asignada_id, null, v_motivo);
end;
$$;

-- Reactivar: vuelve con el mismo rol, la misma ubicación y la fecha de alta original.
create or replace function retail.reactivar_colaborador(p_persona_id uuid) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_fila retail.colaboradores_suspendidos%rowtype;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede gestionar colaboradores';
  end if;
  select * into v_fila from colaboradores_suspendidos where persona_id = p_persona_id for update;
  if not found then
    raise exception 'Esa persona no está suspendida — actualiza la pantalla';
  end if;
  if not exists (select 1 from public.personas where id = p_persona_id and estado = 'activo') then
    raise exception 'Esa persona sigue inactiva en Dynamic — se reactiva desde Dynamic';
  end if;
  if v_fila.rol = 'colaborador'
     and not exists (select 1 from ubicaciones where id = v_fila.ubicacion_asignada_id and activo) then
    raise exception 'Su ubicación ya no está activa — quítala y vuelve a agregarla en otra ubicación';
  end if;
  delete from colaboradores_suspendidos where persona_id = p_persona_id;
  insert into colaboradores (persona_id, agregado_por, created_at, rol, ubicacion_asignada_id)
    values (v_fila.persona_id, v_fila.agregado_por, v_fila.agregado_en, v_fila.rol, v_fila.ubicacion_asignada_id);
  perform retail.fn_historial_colaborador(p_persona_id, 'reactivacion', v_fila.rol, null, v_fila.ubicacion_asignada_id, null);
end;
$$;

-- Cambiar la ubicación fija de un colaborador (un líder no tiene: opera cualquier sede).
create or replace function retail.cambiar_ubicacion_colaborador(p_persona_id uuid, p_ubicacion_id uuid) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_fila retail.colaboradores%rowtype;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede gestionar colaboradores';
  end if;
  select * into v_fila from colaboradores where persona_id = p_persona_id for update;
  if not found then
    raise exception 'Esa persona no tiene acceso activo — actualiza la pantalla';
  end if;
  if v_fila.rol = 'lider' then
    raise exception 'Un líder no tiene ubicación fija: opera en cualquier sede';
  end if;
  if not exists (select 1 from ubicaciones where id = p_ubicacion_id and activo) then
    raise exception 'Esa ubicación no existe o está inactiva';
  end if;
  if v_fila.ubicacion_asignada_id is not distinct from p_ubicacion_id then
    raise exception 'Ya está asignada a esa ubicación';
  end if;
  update colaboradores set ubicacion_asignada_id = p_ubicacion_id where persona_id = p_persona_id;
  perform retail.fn_historial_colaborador(p_persona_id, 'ubicacion', v_fila.rol, v_fila.ubicacion_asignada_id, p_ubicacion_id, null);
end;
$$;

-- Quitar (baja definitiva): ahora también alcanza a un suspendido, y deja constancia.
create or replace function retail.quitar_colaborador(p_persona_id uuid) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_quien uuid;
  v_rol text;
  v_ubicacion uuid;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede gestionar colaboradores';
  end if;
  select id into v_quien from public.personas where auth_user_id = auth.uid();
  if p_persona_id = v_quien then
    raise exception 'No puedes quitarte tu propio acceso — pide a otro líder que lo haga';
  end if;
  delete from colaboradores where persona_id = p_persona_id returning rol, ubicacion_asignada_id into v_rol, v_ubicacion;
  if not found then
    delete from colaboradores_suspendidos where persona_id = p_persona_id returning rol, ubicacion_asignada_id into v_rol, v_ubicacion;
  end if;
  if not found then
    raise exception 'Esa persona ya no tiene acceso — actualiza la pantalla para ver la lista al día';
  end if;
  perform retail.fn_historial_colaborador(p_persona_id, 'baja', v_rol, v_ubicacion, null, null);
end;
$$;

-- ---------- 4) lecturas ----------
-- `fn_colaboradores` cambia de forma: se dropea la firma vieja (no se puede cambiar lo que devuelve con create or replace).
drop function if exists retail.fn_colaboradores();
create function retail.fn_colaboradores()
returns table (
  persona_id uuid, nombre text, correo text, sede text, rol text, ubicacion_asignada text, agregado_en timestamptz,
  ubicacion_id uuid, es_yo boolean, ultimo_acceso timestamptz
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select p.id, p.nombres || ' ' || p.apellidos, u.email, s.nombre, c.rol, ubi.nombre, c.created_at,
         c.ubicacion_asignada_id, (p.auth_user_id = auth.uid()), u.last_sign_in_at
  from retail.colaboradores c
  join public.personas p on p.id = c.persona_id
  join auth.users u on u.id = p.auth_user_id
  left join public.sedes s on s.id = p.sede_base_id
  left join retail.ubicaciones ubi on ubi.id = c.ubicacion_asignada_id
  where fn_es_lider() and p.estado = 'activo'
  order by p.nombres;
$$;
grant execute on function retail.fn_colaboradores() to authenticated;

create or replace function retail.fn_colaboradores_suspendidos()
returns table (
  persona_id uuid, nombre text, correo text, sede text, rol text, ubicacion_asignada text,
  suspendido_en timestamptz, suspendido_por_nombre text, motivo text
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select p.id, p.nombres || ' ' || p.apellidos, u.email, s.nombre, sp.rol, ubi.nombre,
         sp.suspendido_en, por.nombres || ' ' || por.apellidos, sp.motivo
  from retail.colaboradores_suspendidos sp
  join public.personas p on p.id = sp.persona_id
  join auth.users u on u.id = p.auth_user_id
  left join public.sedes s on s.id = p.sede_base_id
  left join retail.ubicaciones ubi on ubi.id = sp.ubicacion_asignada_id
  left join public.personas por on por.id = sp.suspendido_por
  where fn_es_lider() and p.estado = 'activo'
  order by sp.suspendido_en desc;
$$;
grant execute on function retail.fn_colaboradores_suspendidos() to authenticated;

-- Con acceso concedido (activos o suspendidos) pero dados de baja en Dynamic: solo lectura.
create or replace function retail.fn_colaboradores_inactivos()
returns table (
  persona_id uuid, nombre text, correo text, sede text, estado_dynamic text, rol text, suspendida boolean
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select p.id, p.nombres || ' ' || p.apellidos, u.email, s.nombre, p.estado, x.rol, x.suspendida
  from (
    select c.persona_id, c.rol, false as suspendida from retail.colaboradores c
    union all
    select sp.persona_id, sp.rol, true from retail.colaboradores_suspendidos sp
  ) x
  join public.personas p on p.id = x.persona_id
  join auth.users u on u.id = p.auth_user_id
  left join public.sedes s on s.id = p.sede_base_id
  where fn_es_lider() and p.estado <> 'activo'
  order by p.nombres;
$$;
grant execute on function retail.fn_colaboradores_inactivos() to authenticated;

create or replace function retail.fn_colaboradores_actividad(p_limite integer default 100)
returns table (
  id bigint, accion text, persona_nombre text, por_nombre text, rol text,
  ubicacion_anterior text, ubicacion_nueva text, motivo text, created_at timestamptz, total bigint
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select h.id, h.accion, p.nombres || ' ' || p.apellidos, por.nombres || ' ' || por.apellidos, h.rol,
         ua.nombre, un.nombre, h.motivo, h.created_at, count(*) over ()
  from retail.colaboradores_historial h
  left join public.personas p on p.id = h.persona_id
  left join public.personas por on por.id = h.por
  left join retail.ubicaciones ua on ua.id = h.ubicacion_anterior_id
  left join retail.ubicaciones un on un.id = h.ubicacion_nueva_id
  where fn_es_lider()
  order by h.created_at desc, h.id desc
  limit least(greatest(coalesce(p_limite, 100), 1), 500);
$$;
grant execute on function retail.fn_colaboradores_actividad(integer) to authenticated;

-- Quien está suspendido no aparece como «cuenta sin acceso»: ya tiene fila, en otra tabla.
create or replace function retail.fn_dynamic_disponibles()
returns table (persona_id uuid, nombre text, correo text, sede text)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select p.id, p.nombres || ' ' || p.apellidos, u.email, s.nombre
  from public.personas p
  join auth.users u on u.id = p.auth_user_id
  left join public.sedes s on s.id = p.sede_base_id
  where p.estado = 'activo'
    and fn_es_lider()
    and not exists (select 1 from retail.colaboradores c where c.persona_id = p.id)
    and not exists (select 1 from retail.colaboradores_suspendidos sp where sp.persona_id = p.id)
  order by p.nombres;
$$;

-- Permisos de ejecución de las nuevas: solo `authenticated` (dentro, cada una exige ser líder).
revoke execute on function
  retail.agregar_colaboradores(uuid[], uuid),
  retail.suspender_colaborador(uuid, text),
  retail.reactivar_colaborador(uuid),
  retail.cambiar_ubicacion_colaborador(uuid, uuid),
  retail.fn_colaboradores_suspendidos(),
  retail.fn_colaboradores_inactivos(),
  retail.fn_colaboradores_actividad(integer)
from public, anon;

grant execute on function
  retail.agregar_colaborador(uuid, uuid),
  retail.agregar_colaboradores(uuid[], uuid),
  retail.suspender_colaborador(uuid, text),
  retail.reactivar_colaborador(uuid),
  retail.cambiar_ubicacion_colaborador(uuid, uuid),
  retail.quitar_colaborador(uuid),
  retail.fn_dynamic_disponibles()
to authenticated;
