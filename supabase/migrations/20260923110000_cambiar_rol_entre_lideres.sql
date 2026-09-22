-- ============================================================================
-- 20260923110000_cambiar_rol_entre_lideres.sql — ADR-0161 B (ajuste, Felipe 2026-09-22)
--
-- Hasta hoy `asignar_rol` tenía dos candados: a un líder no se le cambiaba el rol, y el rol «Líder de equipo» no se
-- asignaba desde ningún lado (ser líder era `colaboradores.rol`, que solo se podía tocar con SQL a mano). Felipe pidió
-- que el cambio de rol funcione ENTRE líderes: un líder puede
--   · subir a una persona a «Líder de equipo», y
--   · bajar a otro líder a cualquier rol vigente (Integrante, Cajera, …).
--
-- Lo que se mantiene:
--   · Nadie se cambia el rol a sí mismo. Es el candado que evita quedarse sin líder: quien hace el cambio ya es
--     líder y no puede bajarse, así que siempre queda al menos uno.
--   · Una terminal nunca es líder (lo sigue impidiendo `fn_terminal_rol_coherente`).
--   · Solo un líder administra roles (`fn_exigir_lider_de_roles`).
--
-- Lo nuevo que obliga el esquema: un líder opera todas las sedes y no tiene `ubicacion_asignada_id`; cualquier otro
-- rol sí la necesita (check `rol = 'lider' or ubicacion_asignada_id is not null`). Por eso, al bajar a un líder que no
-- tiene ubicación, se exige `p_ubicacion_id`: queda fijo a esa sede, igual que una persona recién agregada.
--
-- Cómo se escribe: se cambia `colaboradores.rol` y el disparador `fn_colaborador_rol_coherente` deja `rol_id`
-- coherente (Líder ⇔ rol 'lider'). `fn_es_lider()` lee `rol = 'lider'`, así que el cambio vale en su próxima pantalla.
--
-- Firma nueva (se suma `p_ubicacion_id`): `create or replace` con otros parámetros crearía una SOBRECARGA y dejaría la
-- llamada de la pantalla ambigua, así que se suelta la vieja explícitamente. La llamada sin `p_ubicacion_id` sigue
-- valiendo (default null).
-- ============================================================================

drop function if exists retail.asignar_rol(uuid, uuid, uuid);

create or replace function retail.asignar_rol(
  p_rol_id uuid,
  p_persona_id uuid default null,
  p_terminal_id uuid default null,
  p_ubicacion_id uuid default null
)
returns void
language plpgsql security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_rol retail.roles;
  v_antes uuid;
  v_rol_cuenta text;
  v_ubicacion uuid;
  v_cuenta text;
  v_a_lider boolean;
begin
  perform retail.fn_exigir_lider_de_roles();
  if (p_persona_id is null) = (p_terminal_id is null) then
    raise exception 'Elige una sola cuenta: una persona o una terminal';
  end if;
  select * into v_rol from retail.roles where id = p_rol_id;
  if v_rol.id is null then
    raise exception 'Ese rol no existe — actualiza la pantalla';
  end if;
  if v_rol.archivado_at is not null then
    raise exception 'El rol % está archivado', v_rol.nombre;
  end if;
  v_a_lider := v_rol.clave = 'lider';

  if p_persona_id is not null then
    if exists (select 1 from public.personas where id = p_persona_id and auth_user_id = auth.uid()) then
      raise exception 'No puedes cambiar tu propio rol: pídeselo a otro líder' using errcode = '42501';
    end if;

    select c.rol_id, c.rol, c.ubicacion_asignada_id into v_antes, v_rol_cuenta, v_ubicacion
      from retail.colaboradores c where c.persona_id = p_persona_id for update;
    if v_antes is null then
      select c.rol_id, c.rol, c.ubicacion_asignada_id into v_antes, v_rol_cuenta, v_ubicacion
        from retail.colaboradores_suspendidos c where c.persona_id = p_persona_id for update;
    end if;
    if v_antes is null then
      raise exception 'Esa persona no tiene acceso a retail — actualiza la pantalla';
    end if;

    if v_a_lider then
      -- Sube a líder: conserva su ubicación (un líder no la usa; si vuelve a bajar, ya la tiene).
      update retail.colaboradores set rol = 'lider' where persona_id = p_persona_id;
      update retail.colaboradores_suspendidos set rol = 'lider' where persona_id = p_persona_id;
    else
      if v_rol_cuenta = 'lider' then
        v_ubicacion := coalesce(p_ubicacion_id, v_ubicacion);
        if v_ubicacion is null then
          raise exception 'Elige en qué sede queda: un líder opera todas, cualquier otro rol trabaja en una' using errcode = '23514';
        end if;
        if not exists (select 1 from retail.ubicaciones where id = v_ubicacion and activo) then
          raise exception 'Esa ubicación no existe o está inactiva';
        end if;
      end if;
      update retail.colaboradores
         set rol = 'colaborador', rol_id = p_rol_id, ubicacion_asignada_id = coalesce(v_ubicacion, ubicacion_asignada_id)
       where persona_id = p_persona_id;
      update retail.colaboradores_suspendidos
         set rol = 'colaborador', rol_id = p_rol_id, ubicacion_asignada_id = coalesce(v_ubicacion, ubicacion_asignada_id)
       where persona_id = p_persona_id;
    end if;
    select p.nombres || ' ' || p.apellidos into v_cuenta from public.personas p where p.id = p_persona_id;
  else
    if v_a_lider then
      raise exception 'Una terminal no puede tener el rol Líder de equipo' using errcode = '23514';
    end if;
    select t.rol_id, t.nombre into v_antes, v_cuenta from retail.terminales t where t.id = p_terminal_id for update;
    if v_antes is null then
      raise exception 'Esa terminal no existe — actualiza la pantalla';
    end if;
    update retail.terminales set rol_id = p_rol_id where id = p_terminal_id;
  end if;

  if v_antes <> p_rol_id then
    insert into retail.roles_historial (rol_id, accion, detalle, hecho_por)
      values (p_rol_id, 'asignacion', jsonb_build_object(
        'cuenta', v_cuenta, 'persona_id', p_persona_id, 'terminal_id', p_terminal_id,
        'rol_antes', (select nombre from retail.roles where id = v_antes), 'rol_antes_id', v_antes,
        'ubicacion_id', case when v_rol_cuenta = 'lider' and not v_a_lider then v_ubicacion end),
        retail.fn_actor_persona_id(false));
  end if;
end;
$fn$;

revoke all on function retail.asignar_rol(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function retail.asignar_rol(uuid, uuid, uuid, uuid) to authenticated;

comment on function retail.asignar_rol(uuid, uuid, uuid, uuid) is
  'ADR-0161 B: asigna un rol a una persona o terminal. Desde 2026-09-22 también sube a Líder de equipo y baja a un líder (con p_ubicacion_id si no tiene sede). Nunca a uno mismo; nunca Líder a una terminal.';
