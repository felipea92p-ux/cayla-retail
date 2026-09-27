-- Recordar en lote (Apartados v2, paso 1 — ADR-0227; spike `docs/maquetas/apartados-v2-2026-09/`).
--
-- EL PROBLEMA. Dos días antes de que venza un apartado hay que escribirle a la clienta, y otra vez si ya venció.
-- Hoy el botón de WhatsApp de «Todos» abre el chat y no deja rastro: la vendedora de la tarde no sabe si la de la
-- mañana ya le escribió, y a veces nadie lo hace hasta que el apartado se libera solo (y hay que devolver el adelanto).
--
-- LA DECISIÓN. Cada aviso es una fila que nunca se edita ni se borra (`separacion_avisos`, append-only como
-- `movimientos`): quién avisó, a qué apartado y cuándo. «¿Ya se le avisó hoy?» es un derivado de esa lista, no una
-- columna que alguien pisa. No se toca `separaciones` ni `buscar_separaciones` (núcleo estable): la lectura va en una
-- función propia. Es la base que después usa «Actividad» (ADR-0207) para contar la historia del apartado.
--
-- POR QUÉ ASÍ Y NO UNA COLUMNA `ultimo_aviso_en`. Una columna pierde quién avisó antes, y un segundo aviso la pisa.
--
-- QUIÉN PUEDE. El mismo candado que el resto de Apartados: operar esa tienda (`fn_puede_operar_ubicacion`) y, además,
-- ver el módulo (`fn_ve_modulo('apartados')`), que las funciones viejas todavía no preguntan (BACKLOG). Firma el
-- responsable del combo (`fn_actor_persona_id(true)`, ADR-0161/0162).
--
-- PRODUCCIÓN. Solo objetos nuevos: ninguna tabla en uso se altera y no hay políticas (la tabla se lee solo por
-- funciones `security definer`: RLS encendido y sin políticas, regla de CLAUDE.md «Políticas y deadlocks»). Se pega
-- en una sola parte. Idempotente.

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create table if not exists retail.separacion_avisos (
  id uuid primary key default gen_random_uuid(),
  separacion_id uuid not null references retail.separaciones (id),
  -- Hoy solo WhatsApp (se abre wa.me y lo envía la persona, no el sistema). El check deja sumar otro canal después.
  canal text not null default 'whatsapp' check (canal in ('whatsapp')),
  avisado_por uuid references public.personas (id),
  created_at timestamptz not null default now()
);
create index if not exists separacion_avisos_separacion_idx on retail.separacion_avisos (separacion_id, created_at desc);

alter table retail.separacion_avisos enable row level security;
revoke all on retail.separacion_avisos from anon, authenticated;

-- ---------------------------------------------------------------------------
-- registrar_aviso_separacion — deja constancia de que se le escribió a la clienta.
-- ---------------------------------------------------------------------------
create or replace function retail.registrar_aviso_separacion(p_separacion_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  s record;
  v_persona uuid;
  v_en timestamptz;
begin
  if not fn_ve_modulo('apartados') then
    raise exception 'Tu rol no tiene el módulo Apartados' using errcode = '42501';
  end if;
  select id, ubicacion_id, estado, codigo into s from separaciones where id = p_separacion_id;
  if not found then
    raise exception 'Ese apartado no existe';
  end if;
  if not fn_puede_operar_ubicacion(s.ubicacion_id) then
    raise exception 'No tienes permiso sobre los apartados de esa tienda' using errcode = '42501';
  end if;
  if s.estado <> 'abierta' then
    raise exception 'Solo se avisa un apartado abierto (el % está %)', s.codigo, s.estado;
  end if;
  v_persona := fn_actor_persona_id(true);
  insert into separacion_avisos (separacion_id, avisado_por) values (s.id, v_persona) returning created_at into v_en;
  return v_en;
end;
$$;

-- ---------------------------------------------------------------------------
-- fn_avisos_separaciones — por cada apartado abierto de la tienda: cuántos avisos, el último y quién lo dio.
-- ---------------------------------------------------------------------------
create or replace function retail.fn_avisos_separaciones(p_ubicacion_id uuid)
returns table (separacion_id uuid, avisos integer, ultimo_aviso_en timestamptz, ultimo_por text)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select a.separacion_id,
         count(*)::integer,
         max(a.created_at),
         (select nullif(btrim(coalesce(p.nombres, '') || ' ' || coalesce(p.apellidos, '')), '')
            from separacion_avisos x
            left join public.personas p on p.id = x.avisado_por
           where x.separacion_id = a.separacion_id
           order by x.created_at desc
           limit 1)
    from separacion_avisos a
    join separaciones s on s.id = a.separacion_id
   where s.ubicacion_id = p_ubicacion_id
     and s.estado = 'abierta'
     and fn_puede_operar_ubicacion(p_ubicacion_id)
     and fn_ve_modulo('apartados')
   group by a.separacion_id;
$$;

revoke all on function retail.registrar_aviso_separacion(uuid) from public, anon;
revoke all on function retail.fn_avisos_separaciones(uuid) from public, anon;
grant execute on function retail.registrar_aviso_separacion(uuid) to authenticated;
grant execute on function retail.fn_avisos_separaciones(uuid) to authenticated;
