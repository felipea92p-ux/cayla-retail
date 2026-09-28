-- ADR-0253, parte B (Felipe, 2026-09-28): el rol «Líder de equipo» deja de estar bloqueado en Roles y accesos.
--
-- Hasta hoy el Líder era un rol `fijo`: veía todo, siempre, y la base rechazaba editarlo. Felipe decidió que se edite
-- como cualquier rol. Cómo se hizo sin romper lo que ya descansa en «ser líder»:
--
--   · El Líder sigue viendo TODO LO QUE NO SE LE QUITE. No se guarda la lista de lo que ve (como en los demás roles)
--     sino la de lo que se le QUITÓ (`lider_modulos_ocultos`): así un módulo nuevo sigue naciendo visible para el líder
--     sin que su migración escriba en ningún rol (regla «Módulos y roles» de CLAUDE.md, vigilada por `modulos.test.ts`).
--   · Quitarle un módulo lo saca de su menú, de su URL (`exigirModulo`) y de lo que la base responde a
--     `fn_ve_modulo`/`fn_mis_modulos`. NO le quita los poderes que la base le da por ser líder (`fn_es_lider()`, que
--     sale de `colaboradores.rol`, no de este rol): anular ventas, aprobar devoluciones, subir a alguien a líder y el
--     resto de la lista «siempre solo del líder» siguen siendo suyos. Es «ve / no ve», como en cualquier rol
--     (ADR-0161), no un candado entre líderes.
--   · Lo edita solo un ADMIN (admin en Dynamic y Líder aquí, ADR-0178): tocar el Líder es tocar a todos los líderes.
--   · «Roles y accesos» NO se le quita (check en la tabla + mensaje en la función): sin él, nadie podría devolverle
--     al Líder lo que se le quitó desde el ERP; habría que entrar a la base.
--
-- Producción: una tabla NUEVA (nadie la usa todavía) y funciones con `create or replace`. Sin `alter` de tablas en uso
-- ni políticas: se pega entera, después de la parte A (`20260928220000`).

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. Lo que se le quitó al Líder ---------------------------------------------------------------------------------------

create table if not exists retail.lider_modulos_ocultos (
  modulo text primary key references retail.modulos (clave),
  ocultado_en timestamptz not null default now(),
  constraint lider_modulos_ocultos_roles_no check (modulo <> 'roles')
);

comment on table retail.lider_modulos_ocultos is
  'ADR-0253: los módulos que se le QUITARON al rol Líder de equipo (lo demás lo ve, también los módulos nuevos). '
  'Se escribe solo por guardar_modulos_rol (un Admin); quién y cuándo, en roles_historial. «roles» nunca se le quita.';

-- Se lee y se escribe solo por funciones `security definer`: RLS encendido y sin políticas (ADR-0195).
alter table retail.lider_modulos_ocultos enable row level security;
revoke all on table retail.lider_modulos_ocultos from public, anon, authenticated;

-- 2. Qué ve la cuenta ---------------------------------------------------------------------------------------------------

create or replace function retail.fn_mis_modulos()
returns table(clave text, completo boolean)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select m.clave, true from retail.modulos m
   where retail.fn_es_lider()
     and not exists (select 1 from retail.lider_modulos_ocultos o where o.modulo = m.clave)
  union all
  select m.clave, not r.limitado_como_hoy
    from retail.rol_modulos rm
    join retail.roles r on r.id = rm.rol_id and r.archivado_at is null and not r.fijo
    join retail.modulos m on m.clave = rm.modulo and m.delegable and not m.solo_lider
   where not retail.fn_es_lider() and rm.rol_id = retail.fn_mi_rol_id();
$$;

create or replace function retail.fn_ve_modulo(p_clave text)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select (retail.fn_es_lider() and not exists (select 1 from retail.lider_modulos_ocultos o where o.modulo = p_clave))
      or exists (
    select 1 from retail.rol_modulos rm
    join retail.roles r on r.id = rm.rol_id and r.archivado_at is null and not r.fijo
    join retail.modulos m on m.clave = rm.modulo and m.delegable and not m.solo_lider
    where rm.rol_id = retail.fn_mi_rol_id() and rm.modulo = p_clave
  );
$$;

-- Para la pantalla Roles y accesos: lo que se le quitó al Líder (quien administra roles lo lee).
create or replace function retail.fn_lider_modulos_ocultos()
returns setof text
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select o.modulo from retail.lider_modulos_ocultos o where retail.fn_puede_administrar_roles() order by o.modulo;
$$;

revoke all on function retail.fn_lider_modulos_ocultos() from public, anon;
grant execute on function retail.fn_lider_modulos_ocultos() to authenticated, service_role;

-- 3. Guardar los módulos de un rol, ahora también los del Líder ----------------------------------------------------------
-- Parte de la definición de producción (huella 0a901893421240bf9a728caadb8d54b0, igual a la del repo el 2026-09-28).
-- Cambia: la rama `if v_rol.fijo` (antes rechazaba; ahora guarda lo que se le quita al Líder) y, para que las dos ramas
-- compartan el historial y firmen UNA vez con el responsable, la validación de módulos y de pantalla principal va antes
-- de «solo das lo que tienes» (mismo resultado para un rol a medida, otro orden de mensajes si fallan dos cosas).

create or replace function retail.guardar_modulos_rol(p_rol_id uuid, p_modulos text[], p_version_esperada integer default null::integer, p_pantalla_principal text default null::text)
returns integer
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_rol retail.roles;
  v_antes jsonb;
  v_despues jsonb;
  v_malo text;
begin
  perform retail.fn_exigir_lider_de_roles();
  select * into v_rol from retail.roles where id = p_rol_id for update;
  if v_rol.id is null then
    raise exception 'Ese rol no existe — actualiza la pantalla';
  end if;
  -- ADR-0193: la fila ya está bloqueada (`for update` arriba), así que comparar aquí no tiene carrera.
  if p_version_esperada is not null and v_rol.version <> p_version_esperada then
    raise exception 'Otra persona cambió este rol mientras lo editabas. Recarga para ver sus cambios.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;
  if v_rol.archivado_at is not null then
    raise exception 'El rol % está archivado: restáuralo antes de editarlo', v_rol.nombre;
  end if;
  select x into v_malo from unnest(coalesce(p_modulos, '{}')) x
   where not exists (select 1 from retail.modulos m where m.clave = x) limit 1;
  if v_malo is not null then
    raise exception 'No existe el módulo «%»', v_malo;
  end if;
  -- 20260925220000: la pantalla principal tiene que ser uno de los módulos que se están guardando AHORA.
  if p_pantalla_principal is not null and not (p_pantalla_principal = any(coalesce(p_modulos, '{}'))) then
    raise exception 'La pantalla principal tiene que ser uno de los módulos que se están guardando' using errcode = '23514';
  end if;

  if v_rol.fijo then
    -- ADR-0253: el Líder de equipo. `p_modulos` es lo que VE; se guarda lo que se le QUITA (lo demás, y lo que nazca
    -- después, lo sigue viendo).
    if not retail.fn_es_admin() then
      raise exception 'Los módulos del Líder de equipo los cambia un Admin (admin en Dynamic): tocarlos es tocar a todos los líderes.'
        using errcode = '42501', hint = 'solo_admin';
    end if;
    if not ('roles' = any (coalesce(p_modulos, '{}'))) then
      raise exception '«Roles y accesos» no se le quita al Líder de equipo: sin él, nadie podría devolverle lo que le quites.'
        using errcode = '23514', hint = 'lider_sin_roles';
    end if;
    select coalesce(jsonb_agg(m.clave order by m.clave), '[]'::jsonb) into v_antes
      from retail.modulos m where not exists (select 1 from retail.lider_modulos_ocultos o where o.modulo = m.clave);
    delete from retail.lider_modulos_ocultos where modulo = any (coalesce(p_modulos, '{}'));
    insert into retail.lider_modulos_ocultos (modulo)
      select m.clave from retail.modulos m where not (m.clave = any (coalesce(p_modulos, '{}')))
      on conflict (modulo) do nothing;
    select coalesce(jsonb_agg(m.clave order by m.clave), '[]'::jsonb) into v_despues
      from retail.modulos m where not exists (select 1 from retail.lider_modulos_ocultos o where o.modulo = m.clave);
  else
    perform retail.fn_exigir_modulos_dentro_de_lo_mio(p_rol_id, p_modulos); -- ADR-0178
    select coalesce(jsonb_agg(modulo order by modulo), '[]'::jsonb) into v_antes from retail.rol_modulos where rol_id = p_rol_id;
    -- Se quitan los apagados y se suman los encendidos. Es configuración, no un dato del negocio: el antes y el
    -- después quedan en roles_historial, que no se borra nunca.
    delete from retail.rol_modulos where rol_id = p_rol_id and not (modulo = any (coalesce(p_modulos, '{}')));
    insert into retail.rol_modulos (rol_id, modulo)
      select distinct p_rol_id, x from unnest(coalesce(p_modulos, '{}')) x
      on conflict do nothing; -- el disparador rechaza lo que no se delega
    select coalesce(jsonb_agg(modulo order by modulo), '[]'::jsonb) into v_despues from retail.rol_modulos where rol_id = p_rol_id;
  end if;
  if v_antes <> v_despues or v_rol.pantalla_principal is distinct from p_pantalla_principal then
    insert into retail.roles_historial (rol_id, accion, detalle, hecho_por)
      values (p_rol_id, 'modulos', jsonb_build_object('antes', v_antes, 'despues', v_despues,
        'pantalla_principal_antes', v_rol.pantalla_principal, 'pantalla_principal_despues', p_pantalla_principal), retail.fn_actor_persona_id(true));
  end if;
  -- El Líder no tiene filas en `rol_modulos` que suban su versión: la sube el disparador de `roles` con este update.
  if v_rol.pantalla_principal is distinct from p_pantalla_principal or (v_rol.fijo and v_antes <> v_despues) then
    update retail.roles set pantalla_principal = p_pantalla_principal where id = p_rol_id;
  end if;
  -- ADR-0193: la versión nueva (la subió el disparador de rol_modulos o el de roles si hubo cambios).
  return (select version from retail.roles where id = p_rol_id);
end;
$function$;

-- 4. Duplicar el Líder copia lo que el Líder VE (antes: todo lo delegable, porque el Líder lo veía todo) -----------------
-- Se reescribe desde la definición real (huella 825708b6f94925f07671109c966ddcb1, igual en el repo y en producción el
-- 2026-09-28), cambiando solo esa condición; si no aparece exactamente una vez, la migración aborta.
do $$
declare
  v_def text := pg_get_functiondef('retail.crear_rol(text, text, uuid)'::regprocedure);
  v_viejo text := '(v_origen.fijo or exists';
  v_nuevo text := '((v_origen.fijo and not exists (select 1 from retail.lider_modulos_ocultos h where h.modulo = m.clave)) or exists';
  v_veces int;
begin
  v_veces := (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo);
  if v_veces = 0 and position(v_nuevo in v_def) > 0 then
    return; -- ya reescrita
  end if;
  if v_veces <> 1 then
    raise exception 'ADR-0253: retail.crear_rol trae % veces «%» (se esperaba 1): no se toca nada', v_veces, v_viejo;
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end;
$$;
