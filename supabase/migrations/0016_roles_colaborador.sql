-- ============================================================================
-- 0016_roles_colaborador.sql — CAYLA V2
--
-- "Control total temporal" (0012) deja de ser el único nivel. Felipe pidió
-- (2026-09-14): las 9 personas ya registradas quedan como Líder, sin
-- cambios — acceso a todo. Nuevo rol "Colaborador": entra a Vender, Caja,
-- Productos, Inventario, Conteo, Movimientos, Devoluciones — pero NO a
-- Compras, Facturación ni Colaboradores.
--
-- Lo que sorprendió al revisar: el frontend YA gatea esas tres pantallas
-- con `esLider` (`AppShell.tsx`, `...(esLider ? [compras] : [])` y lo mismo
-- para facturación/colaboradores) — eso se escribió bien desde el principio.
-- El hueco real era uno solo: `fn_es_lider()` decía que sí a cualquiera con
-- acceso a retail, líder o no. Arreglando esa única función, las tres
-- pantallas quedan correctamente cerradas sin tocar ni una línea de React.
--
-- Y un Colaborador queda fijo a la sede que se le asigna al darlo de alta
-- — nunca a la que Dynamic le puso de base (eso es RRHH: "dónde trabaja
-- en planilla", no "qué tienda opera en retail" — son preguntas distintas,
-- y confundirlas fue justo lo que se evitó al integrar con Dynamic en 0009).
--
-- SE ROMPE SI: se pega en producción sin decidir antes, persona por
-- persona, si alguna de las 9 debería bajar a Colaborador — acá se
-- backfillean TODAS a 'lider' porque así lo pidió Felipe explícitamente.
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.colaboradores
  add column rol text not null default 'colaborador' check (rol in ('lider', 'colaborador')),
  add column ubicacion_asignada_id uuid references retail.ubicaciones (id);

-- Las 9 personas ya registradas: Líder, sin excepción (pedido explícito,
-- "eso no cambia"). No necesitan ubicacion_asignada_id — un líder nunca la
-- usa, opera cualquier sede.
update retail.colaboradores set rol = 'lider';

-- ---------- el candado real: quién es líder, de verdad ----------
create or replace function retail.fn_es_lider() returns boolean
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select exists (
    select 1 from public.personas p
    join retail.colaboradores c on c.persona_id = p.id
    where p.auth_user_id = auth.uid() and p.estado = 'activo' and c.rol = 'lider'
  );
$$;

-- ---------- ubicación: líder sigue derivando de Dynamic (igual que
-- siempre); colaborador SIEMPRE usa lo que retail le asignó ----------
create or replace function retail.fn_ubicacion_actual_persona() returns uuid
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select u.id
  from public.personas p
  join retail.colaboradores c on c.persona_id = p.id
  left join ubicaciones u on
    (c.rol = 'lider' and u.sede_dynamic_id = p.sede_base_id)
    or (c.rol = 'colaborador' and u.id = c.ubicacion_asignada_id)
  where p.auth_user_id = auth.uid() and p.estado = 'activo';
$$;

create or replace function retail.fn_persona_actual_resumen()
returns table (nombre text, es_lider boolean, ubicacion_id uuid, ubicacion_nombre text, ubicacion_tipo text)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select
    p.nombres || ' ' || p.apellidos,
    c.rol = 'lider',
    -- Un líder sin sede real enlazada (Central, Oficina) cae al mismo
    -- default de siempre — no es un permiso nuevo, ya podía operar
    -- cualquier ubicación. Un colaborador nunca tiene este default: si no
    -- tiene ubicacion_asignada_id, es NULL de verdad (permiso real, no
    -- adorno) y el gate de login lo manda a "pide a un líder que te asigne
    -- una sede" — mismo criterio que ya usaba 0009 para el caso análogo.
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
  join retail.colaboradores c on c.persona_id = p.id
  left join ubicaciones u on
    (c.rol = 'lider' and u.sede_dynamic_id = p.sede_base_id)
    or (c.rol = 'colaborador' and u.id = c.ubicacion_asignada_id)
  where p.auth_user_id = auth.uid() and p.estado = 'activo';
$$;

-- ---------- gestión de colaboradores: ahora sí, solo un líder ----------
-- Antes exigía fn_tiene_acceso_retail() (cualquiera con acceso a retail) —
-- ese era exactamente el hueco por el que un Colaborador habría podido
-- gestionar Colaboradores llamando la RPC directo, aunque el botón esté
-- escondido en su pantalla.

drop function if exists retail.fn_colaboradores();
create function retail.fn_colaboradores()
returns table (
  persona_id uuid, nombre text, correo text, sede text,
  rol text, ubicacion_asignada text, agregado_en timestamptz
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select p.id, p.nombres || ' ' || p.apellidos, u.email, s.nombre, c.rol, ubi.nombre, c.created_at
  from retail.colaboradores c
  join public.personas p on p.id = c.persona_id
  join auth.users u on u.id = p.auth_user_id
  left join public.sedes s on s.id = p.sede_base_id
  left join retail.ubicaciones ubi on ubi.id = c.ubicacion_asignada_id
  where fn_es_lider()
  order by p.nombres;
$$;
grant execute on function retail.fn_colaboradores to authenticated;

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
  order by p.nombres;
$$;

-- Cambia de forma (nuevo parámetro obligatorio: a qué sede queda fijo el
-- colaborador nuevo) — hay que dropear la firma vieja de un solo uuid antes
-- de crear la de dos, si no Postgres deja las dos firmas vivas a la vez.
drop function if exists retail.agregar_colaborador(uuid);
create function retail.agregar_colaborador(p_persona_id uuid, p_ubicacion_id uuid) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_quien uuid;
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
  select id into v_quien from public.personas where auth_user_id = auth.uid();
  -- Todo lo que entra por acá es Colaborador — Líder es un nivel que hoy
  -- no se asigna desde esta pantalla, solo lo tienen los 9 ya registrados.
  insert into colaboradores (persona_id, agregado_por, rol, ubicacion_asignada_id)
    values (p_persona_id, v_quien, 'colaborador', p_ubicacion_id)
    on conflict (persona_id) do nothing;
end;
$$;
grant execute on function retail.agregar_colaborador to authenticated;

create or replace function retail.quitar_colaborador(p_persona_id uuid) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_quien uuid;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede gestionar colaboradores';
  end if;
  select id into v_quien from public.personas where auth_user_id = auth.uid();
  if p_persona_id = v_quien then
    raise exception 'No puedes quitarte tu propio acceso — pide a otro colaborador que lo haga';
  end if;
  delete from colaboradores where persona_id = p_persona_id;
end;
$$;

-- ---------- el candado de la propia tabla, apretado al mismo nivel ----------
drop policy if exists colaboradores_select on retail.colaboradores;
create policy colaboradores_select on retail.colaboradores for select
  using (fn_es_lider());
