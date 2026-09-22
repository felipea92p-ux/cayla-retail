-- ============================================================================
-- 20260923120000_ubicacion_de_lideres.sql — ADR-0161 (actualización, Felipe 2026-09-22)
--
-- Felipe pidió que, igual que el rol, la ubicación también se pueda cambiar entre líderes.
--
-- Qué es la ubicación de un líder: un líder opera TODAS las sedes (cambia de tienda en la cabecera), así que su
-- ubicación no lo limita: es la TIENDA DONDE ARRANCA su sesión. Hasta hoy salía de su sede de planilla en Dynamic
-- (`personas.sede_base_id`), pero ninguna de las sedes de los 9 líderes de producción («Central», «Oficina TRU») está
-- enlazada a una tienda de retail, así que todos arrancaban en la misma: la primera tienda creada. Ahora:
--
--   tienda donde arranca un líder = su ubicación asignada en retail
--                                 → si no tiene, la de su sede de Dynamic (como antes)
--                                 → si tampoco, la primera tienda (como antes).
--
-- Cambia:
--   · `cambiar_ubicacion_colaborador` ya no rechaza a un líder.
--   · `fn_persona_actual_resumen` y `fn_ubicacion_actual_persona` leen la ubicación asignada del líder primero.
-- No cambia: el check `rol = 'lider' or ubicacion_asignada_id is not null` (un líder puede tener o no tener una), ni
-- quién puede operar qué sede. La cookie de la cabecera sigue mandando mientras exista: la ubicación asignada es solo
-- el punto de partida.
--
-- Partí de `pg_get_functiondef` de producción (2026-09-22), no de las migraciones viejas del repo.
-- ============================================================================

create or replace function retail.cambiar_ubicacion_colaborador(p_persona_id uuid, p_ubicacion_id uuid)
returns void
language plpgsql security definer
set search_path = retail, public, extensions
as $function$
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
  -- Un líder también: para él es la tienda donde arranca, no un límite (20260923120000).
  if not exists (select 1 from ubicaciones where id = p_ubicacion_id and activo) then
    raise exception 'Esa ubicación no existe o está inactiva';
  end if;
  if v_fila.ubicacion_asignada_id is not distinct from p_ubicacion_id then
    raise exception 'Ya está asignada a esa ubicación';
  end if;
  update colaboradores set ubicacion_asignada_id = p_ubicacion_id where persona_id = p_persona_id;
  perform retail.fn_historial_colaborador(p_persona_id, 'ubicacion', v_fila.rol, v_fila.ubicacion_asignada_id, p_ubicacion_id, null);
end;
$function$;

-- La ubicación «de partida» de una persona: la asignada; un líder sin asignada, la tienda de su sede de Dynamic (si hay
-- varias ubicaciones en esa sede, la tienda primero: antes salían todas y la sesión no entraba).
create or replace function retail.fn_ubicacion_de_partida(p_persona_id uuid)
returns uuid
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select coalesce(
    c.ubicacion_asignada_id,
    case when c.rol = 'lider' then (
      select u.id from retail.ubicaciones u
       where u.sede_dynamic_id = p.sede_base_id
       order by (u.tipo = 'tienda') desc, u.created_at asc
       limit 1)
    end)
  from retail.colaboradores c
  join public.personas p on p.id = c.persona_id
  where c.persona_id = p_persona_id;
$$;

create or replace function retail.fn_persona_actual_resumen()
returns table(nombre text, es_lider boolean, ubicacion_id uuid, ubicacion_nombre text, ubicacion_tipo text)
language sql stable security definer
set search_path = retail, public, extensions
as $function$
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
  left join ubicaciones u on u.id = retail.fn_ubicacion_de_partida(p.id)
  where p.auth_user_id = auth.uid() and p.estado = 'activo';
$function$;

create or replace function retail.fn_ubicacion_actual_persona()
returns uuid
language sql stable security definer
set search_path = retail, public, extensions
as $function$
  select coalesce(
    (select t.ubicacion_id from retail.fn_terminal_actual() t limit 1),
    (select retail.fn_ubicacion_de_partida(p.id)
       from public.personas p
       join retail.colaboradores c on c.persona_id = p.id
      where p.auth_user_id = auth.uid() and p.estado = 'activo' and c.estado = 'activo'
      limit 1)
  );
$function$;

revoke all on function retail.fn_ubicacion_de_partida(uuid) from public, anon, authenticated;
