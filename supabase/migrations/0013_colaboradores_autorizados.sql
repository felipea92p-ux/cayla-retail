-- ============================================================================
-- 0013_colaboradores_autorizados.sql — CAYLA V2
--
-- Pedido de Felipe (2026-09-13): "control total temporal" (0012) abrió
-- retail a CUALQUIER cuenta activa de Dynamic — funcionó para destrabar
-- logins mientras se armaba el resto, pero ahora quiere una lista real:
-- solo un grupo elegido de personas puede entrar a retail, "nadie más".
--
-- DECISIÓN: retail nunca copia identidad de Dynamic (eso ya se resolvió en
-- 0009 — Dynamic es dueño de quién es cada persona). Lo que retail SÍ
-- necesita es su propio concepto, nuevo: "a cuáles personas de Dynamic les
-- doy entrada a retail". Es una tabla chica, propia de retail, que solo
-- guarda un id — nunca nombre/correo/rol, eso se sigue leyendo en vivo de
-- `public.personas` (una sola fuente de verdad, no una copia que se
-- desincroniza).
--
-- `fn_es_lider()` y `fn_ubicacion_actual_persona()` ahora exigen estar en
-- esta tabla, ADEMÁS de estar activo en Dynamic — es la única puerta real
-- (RPC), no la pantalla. `fn_persona_actual_resumen()` lo exige también en
-- su propio WHERE, para que alguien sin acceso no reciba ni siquiera una
-- fila (así el login lo manda directo a "pide a un líder que te dé de
-- alta" — el mensaje ya existía y ya dice exactamente esto).
--
-- "Control total temporal" (0012) sigue vigente para quien SÍ está en esta
-- lista — Felipe no pidió graduar roles, pidió filtrar quién entra. Ver
-- 0012_control_total_temporal.sql si más adelante se quiere distinguir
-- admin/supervisor_sede/integrante otra vez.
-- ============================================================================

set search_path = retail, public, extensions;

create table retail.colaboradores (
  persona_id uuid primary key references public.personas(id),
  agregado_por uuid references public.personas(id),
  created_at timestamptz not null default now()
);

-- ---------- único punto de verdad: ¿esta persona puede estar en retail? ----------
-- Va ANTES de la policy de la tabla: la policy la usa, y Postgres no
-- permite referenciar una función que todavía no existe.
create function retail.fn_tiene_acceso_retail() returns boolean
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select exists (
    select 1 from public.personas p
    join retail.colaboradores c on c.persona_id = p.id
    where p.auth_user_id = auth.uid() and p.estado = 'activo'
  );
$$;

alter table retail.colaboradores enable row level security;
-- Cualquier colaborador ve la lista completa (la pantalla de gestión la
-- necesita entera, no solo su propia fila). Sin policy de escritura
-- directa: agregar/quitar pasa por las RPC de abajo, mismo patrón que
-- conteo_items/venta_pagos/etc. en todo el esquema.
create policy colaboradores_select on retail.colaboradores for select
  using (fn_tiene_acceso_retail());

create or replace function retail.fn_es_lider() returns boolean
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select fn_tiene_acceso_retail();
$$;

create or replace function retail.fn_ubicacion_actual_persona() returns uuid
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select u.id from ubicaciones u
  join public.personas p on p.sede_base_id = u.sede_dynamic_id
  where p.auth_user_id = auth.uid() and p.estado = 'activo' and fn_tiene_acceso_retail();
$$;

create or replace function retail.fn_persona_actual_resumen()
returns table (nombre text, es_lider boolean, ubicacion_id uuid, ubicacion_nombre text, ubicacion_tipo text)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select
    p.nombres || ' ' || p.apellidos,
    fn_es_lider(),
    case when u.id is null and fn_es_lider()
      then (select id from ubicaciones order by (tipo = 'tienda') desc, created_at asc limit 1)
      else u.id end,
    case when u.id is null and fn_es_lider()
      then (select nombre from ubicaciones order by (tipo = 'tienda') desc, created_at asc limit 1)
      else u.nombre end,
    case when u.id is null and fn_es_lider()
      then (select tipo from ubicaciones order by (tipo = 'tienda') desc, created_at asc limit 1)
      else u.tipo end
  from public.personas p
  left join ubicaciones u on u.sede_dynamic_id = p.sede_base_id
  where p.auth_user_id = auth.uid() and p.estado = 'activo'
    and exists (select 1 from retail.colaboradores c where c.persona_id = p.id);
$$;

-- ---------- gestión (pantalla Colaboradores) ----------

-- Quiénes tienen acceso hoy, con lo mínimo de Dynamic para mostrar en
-- pantalla (nombre, correo, sede) — nunca las 37 columnas de RRHH. El
-- correo sale de auth.users: una función security definer sí puede leerla
-- (verificado), aunque `authenticated` no tenga permiso directo sobre ese
-- schema — es exactamente el mismo principio que ya usa toda la app.
create function retail.fn_colaboradores()
returns table (persona_id uuid, nombre text, correo text, sede text, agregado_en timestamptz)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select p.id, p.nombres || ' ' || p.apellidos, u.email, s.nombre, c.created_at
  from retail.colaboradores c
  join public.personas p on p.id = c.persona_id
  join auth.users u on u.id = p.auth_user_id
  left join public.sedes s on s.id = p.sede_base_id
  where fn_tiene_acceso_retail()
  order by p.nombres;
$$;
grant execute on function retail.fn_colaboradores to authenticated;

-- Personas activas de Dynamic que TODAVÍA no tienen acceso — la lista para
-- elegir en "Agregar colaborador". Nunca crea gente nueva, solo filtra la
-- que ya existe en Dynamic (ver nota de cabecera).
create function retail.fn_dynamic_disponibles()
returns table (persona_id uuid, nombre text, correo text, sede text)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select p.id, p.nombres || ' ' || p.apellidos, u.email, s.nombre
  from public.personas p
  join auth.users u on u.id = p.auth_user_id
  left join public.sedes s on s.id = p.sede_base_id
  where p.estado = 'activo'
    and fn_tiene_acceso_retail()
    and not exists (select 1 from retail.colaboradores c where c.persona_id = p.id)
  order by p.nombres;
$$;
grant execute on function retail.fn_dynamic_disponibles to authenticated;

create function retail.agregar_colaborador(p_persona_id uuid) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_quien uuid;
begin
  if not fn_tiene_acceso_retail() then
    raise exception 'No tienes permiso para gestionar colaboradores';
  end if;
  if not exists (select 1 from public.personas where id = p_persona_id and estado = 'activo') then
    raise exception 'Esa persona no existe o no está activa en Dynamic';
  end if;
  select id into v_quien from public.personas where auth_user_id = auth.uid();
  insert into colaboradores (persona_id, agregado_por) values (p_persona_id, v_quien)
    on conflict (persona_id) do nothing;
end;
$$;
grant execute on function retail.agregar_colaborador to authenticated;

-- Estado imposible evitado a propósito: nadie puede quitarse su propio
-- acceso desde acá — un clic equivocado no debe poder dejar a todo el
-- equipo sin nadie que pueda volver a entrar a Colaboradores.
create function retail.quitar_colaborador(p_persona_id uuid) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_quien uuid;
begin
  if not fn_tiene_acceso_retail() then
    raise exception 'No tienes permiso para gestionar colaboradores';
  end if;
  select id into v_quien from public.personas where auth_user_id = auth.uid();
  if p_persona_id = v_quien then
    raise exception 'No puedes quitarte tu propio acceso — pide a otro colaborador que lo haga';
  end if;
  delete from colaboradores where persona_id = p_persona_id;
end;
$$;
grant execute on function retail.quitar_colaborador to authenticated;
