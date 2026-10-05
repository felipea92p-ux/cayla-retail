-- =====================================================================================================================
-- Dar acceso: el alta que da un líder entra directo, y con el rol elegido (ADR-0341, Felipe 2026-10-05)
--
-- PROBLEMA. Toda alta quedaba «pendiente de aprobación» (D-70, ADR-0157) aunque la diera un líder, y el mismo líder podía
-- aprobarla un segundo después: dos clics de la misma persona, sin ningún control real. Además la persona entraba siempre
-- como Integrante y había que ir a otra pantalla a cambiarle el rol.
--
-- DECISIÓN (Felipe 2026-10-05: «que entre directo»):
--   · Si quien da el acceso es LÍDER, la persona entra activa en el acto.
--   · Si lo da alguien con el módulo Colaboradores sin ser líder, queda pendiente hasta que un líder la apruebe (lo de siempre).
--   · Se elige el rol al dar el acceso (`p_rol_id`, opcional: sin él, Integrante como antes). Mismas reglas que `asignar_rol`:
--     no se da un rol archivado, «solo das lo que tienes» (`fn_exigir_rol_dentro_de_lo_mio`) y el rol Líder no se da al entrar
--     (sube después un Admin, desde la ficha).
--
-- Las firmas cambian (un parámetro nuevo, opcional), así que se sueltan las viejas antes de crear las nuevas: un
-- `create or replace` con otra lista de parámetros crearía una SOBRECARGA y la llamada de la web quedaría ambigua (pasó con
-- `registrar_compra`, 2026-09-19). La web de hoy llama `agregar_colaboradores(p_personas, p_ubicacion_id)` por nombre y sigue
-- resolviendo: pegar ESTO ANTES de fusionar la web nueva.
--
-- Partida de la definición REAL de producción (`pg_get_functiondef`, 2026-10-05), no de la del repo.
-- Una sola parte: sin políticas, sin `alter table`, sin `drop trigger` (ADR-0195). Se puede pegar dos veces.
-- =====================================================================================================================
set lock_timeout = '3s';

drop function if exists retail.agregar_colaboradores(uuid[], uuid);
drop function if exists retail.agregar_colaborador(uuid, uuid);

create or replace function retail.agregar_colaborador(p_persona_id uuid, p_ubicacion_id uuid, p_rol_id uuid default null)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_quien uuid;
  v_filas integer;
  v_rol retail.roles;
  v_estado text;
  v_cuenta text;
begin
  if not retail.fn_puede_gestionar_colaboradores() then
    raise exception 'Gestionar colaboradores necesita el módulo Colaboradores en tu rol' using errcode = '42501';
  end if;
  if not exists (select 1 from public.personas where id = p_persona_id and estado = 'activo') then
    raise exception 'Esa persona no existe o no está activa en Dynamic';
  end if;
  if not exists (select 1 from retail.ubicaciones where id = p_ubicacion_id and activo) then
    raise exception 'Esa ubicación no existe o está inactiva';
  end if;
  if exists (select 1 from retail.colaboradores_suspendidos where persona_id = p_persona_id) then
    raise exception 'Esa persona está suspendida — reactívala en vez de agregarla de nuevo';
  end if;

  if p_rol_id is not null then
    select * into v_rol from retail.roles where id = p_rol_id;
    if v_rol.id is null then
      raise exception 'Ese rol no existe — actualiza la pantalla';
    end if;
    if v_rol.archivado_at is not null then
      raise exception 'El rol % está archivado', v_rol.nombre;
    end if;
    if v_rol.clave = 'lider' then
      raise exception 'El rol Líder de equipo no se da al entrar: dale acceso con otro rol y que un Admin lo suba desde su ficha'
        using errcode = '42501';
    end if;
    perform retail.fn_exigir_rol_dentro_de_lo_mio(p_rol_id); -- ADR-0178: solo das lo que tienes
  end if;

  -- D-70 con la decisión del 2026-10-05: lo que da un líder entra directo; lo de quien no es líder espera a un líder.
  v_estado := case when retail.fn_es_lider() then 'activo' else 'pendiente_aprobacion' end;
  v_quien := retail.fn_actor_persona_id(true);
  -- `rol_id` nulo = Integrante: lo pone el disparador `colaboradores_rol_coherente`.
  insert into retail.colaboradores (persona_id, agregado_por, rol, rol_id, ubicacion_asignada_id, estado)
    values (p_persona_id, v_quien, 'integrante', p_rol_id, p_ubicacion_id, v_estado)
    on conflict (persona_id) do nothing;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'Esa persona ya tiene acceso a retail — actualiza la pantalla para verla en la lista';
  end if;
  perform retail.fn_historial_colaborador(p_persona_id, 'alta', 'integrante', null, p_ubicacion_id, null);

  -- El rol con que entró queda en el historial de roles, igual que un cambio de rol (`asignar_rol`).
  if p_rol_id is not null then
    v_cuenta := (select p.nombres || ' ' || p.apellidos from public.personas p where p.id = p_persona_id);
    insert into retail.roles_historial (rol_id, accion, detalle, hecho_por)
      values (p_rol_id, 'asignacion', jsonb_build_object('cuenta', v_cuenta, 'persona_id', p_persona_id, 'al_dar_acceso', true),
              v_quien);
  end if;
end;
$$;

create or replace function retail.agregar_colaboradores(p_personas uuid[], p_ubicacion_id uuid, p_rol_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_id uuid;
  v_ids uuid[];
begin
  if not retail.fn_puede_gestionar_colaboradores() then
    raise exception 'Gestionar colaboradores necesita el módulo Colaboradores en tu rol' using errcode = '42501';
  end if;
  v_ids := coalesce((select array_agg(distinct x) from unnest(p_personas) as x where x is not null), '{}');
  if cardinality(v_ids) = 0 then
    raise exception 'Elige al menos una persona';
  end if;
  if cardinality(v_ids) > 50 then
    raise exception 'Son demasiadas personas de una vez — agrégalas en grupos de 50 o menos';
  end if;
  foreach v_id in array v_ids loop
    perform retail.agregar_colaborador(v_id, p_ubicacion_id, p_rol_id);
  end loop;
  return cardinality(v_ids);
end;
$$;

revoke all on function retail.agregar_colaborador(uuid, uuid, uuid) from public, anon;
revoke all on function retail.agregar_colaboradores(uuid[], uuid, uuid) from public, anon;
grant execute on function retail.agregar_colaborador(uuid, uuid, uuid) to authenticated;
grant execute on function retail.agregar_colaboradores(uuid[], uuid, uuid) to authenticated;
