-- ============================================================================
-- «Pregúntale a CAYLA»: el interruptor de cada sede (ADR-0536, actividad 8; Felipe 2026-10-27)
--
-- QUÉ. El asistente de la cabecera se lanza en UNA sede primero (decisión 10 del ADR: 2-3 semanas de piloto antes de abrirlo a
-- todas). Esta tabla dice en qué sedes está encendido y desde cuándo; el botón «Preguntar» solo sale en esas sedes, y `/api/asistente`
-- no le contesta a una sede apagada (nadie gasta el tope del mes desde una sede que no está en el piloto).
--
-- QUIÉN LO CAMBIA (Felipe 2026-10-27): quien ve Configuración (`fn_puede_configurar()`: el líder o el módulo «configuracion» en su
-- rol), NO solo un líder como proponía el ADR. «Los líderes solo supervisan visualmente»: no se suma un candado de líder nuevo, y
-- quién ve Configuración se decide en Roles y accesos (ADR-0161). El gasto ya lo protege el tope de US$30 al mes.
--
-- POR QUÉ UNA TABLA Y NO UNA COLUMNA EN `ubicaciones`: la tienda usa `ubicaciones` en cada venta; un `alter` ahí es la receta del
-- deadlock de ADR-0195. Una sede sin fila está APAGADA: el asistente nace apagado en todas, y la sede del piloto la enciende alguien.
--
-- CÓMO SE PEGA. Una sola parte: tabla nueva (RLS encendido SIN políticas: solo la tocan estas funciones `security definer`) y tres
-- funciones; no hace `alter` de tablas en uso ni crea políticas (ADR-0195). Re-ejecutable. Apagar no borra la fila: queda en
-- `encendido = false`, y cada cambio va a `configuracion_historial`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.fn_actor_persona_id(boolean)') is null then
    raise exception 'Falta retail.fn_actor_persona_id: pega antes 20260929230000_acciones_sin_responsable.sql.';
  end if;
  if to_regprocedure('retail.fn_puede_configurar()') is null then
    raise exception 'Falta retail.fn_puede_configurar: pega antes 20260928220000_finanzas_modulos_delegables.sql.';
  end if;
  if to_regclass('retail.configuracion_historial') is null then
    raise exception 'Falta retail.configuracion_historial: pega antes 20260924210000_configuracion_meta_y_fondo_por_campana.sql.';
  end if;
end $$;

create table if not exists retail.asistente_sedes (
  ubicacion_id uuid primary key references retail.ubicaciones (id),
  encendido boolean not null default false,
  -- La última vez que se encendió (se queda al apagar: dice desde cuándo corrió el piloto).
  desde timestamptz,
  cambiado_por uuid references public.personas (id),
  cambiado_en timestamptz not null default now()
);
comment on table retail.asistente_sedes is
  'ADR-0536: en qué sedes está encendido «Pregúntale a CAYLA». Sin fila = apagado. Solo la tocan guardar_asistente_sede, fn_asistente_encendido y fn_asistente_sedes.';

alter table retail.asistente_sedes enable row level security;
revoke all on table retail.asistente_sedes from anon, authenticated;

-- ¿Sale el botón «Preguntar»? Con una sede, si esa sede está encendida. Sin sede (CAYLA Global), si alguna lo está: quien supervisa
-- el piloto desde la vista global también lo ve. La lee el layout de la app y `/api/asistente`.
create or replace function retail.fn_asistente_encendido(p_ubicacion_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if auth.uid() is null or not retail.fn_tiene_acceso_retail() then
    return false;
  end if;
  if p_ubicacion_id is null then
    return exists (select 1 from retail.asistente_sedes s join retail.ubicaciones u on u.id = s.ubicacion_id where s.encendido and u.activo);
  end if;
  return exists (select 1 from retail.asistente_sedes s where s.ubicacion_id = p_ubicacion_id and s.encendido);
end;
$$;

comment on function retail.fn_asistente_encendido(uuid) is
  'ADR-0536: si «Pregúntale a CAYLA» está encendido en la sede (sin sede: en alguna). Sin sesión, false.';
revoke all on function retail.fn_asistente_encendido(uuid) from public, anon;
grant execute on function retail.fn_asistente_encendido(uuid) to authenticated, service_role;

-- Las sedes activas con su interruptor, para Configuración ▸ Tiendas y caja. Solo quien puede cambiarlo.
create or replace function retail.fn_asistente_sedes()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_puede_configurar() then
    raise exception 'Ver el asistente de cada sede necesita el módulo «Configuración» en tu rol.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', u.id,
             'nombre', u.nombre,
             'tipo', u.tipo,
             'encendido', coalesce(s.encendido, false),
             -- El día de Lima (no la hora en UTC: pasadas las 19:00 de Lima, UTC ya es mañana).
             'desde', (s.desde at time zone 'America/Lima')::date
           ) order by case u.tipo when 'tienda' then 0 when 'almacen' then 1 else 2 end, u.nombre)
      from retail.ubicaciones u
      left join retail.asistente_sedes s on s.ubicacion_id = u.id
     where u.activo
  ), '[]'::jsonb);
end;
$$;

comment on function retail.fn_asistente_sedes() is
  'ADR-0536: las sedes activas con su interruptor de «Pregúntale a CAYLA», para Configuración. Exige fn_puede_configurar().';
revoke all on function retail.fn_asistente_sedes() from public, anon;
grant execute on function retail.fn_asistente_sedes() to authenticated, service_role;

-- Enciende o apaga el asistente de una sede. Firmado con el responsable (`fn_actor_persona_id(true)`), como todo lo que guarda.
-- Guardar lo mismo que ya está no hace nada (un doble clic no deja dos filas en la historia).
create or replace function retail.guardar_asistente_sede(p_ubicacion_id uuid, p_encendido boolean)
returns void
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_activa boolean;
  v_antes boolean;
begin
  if not retail.fn_puede_configurar() then
    raise exception 'Encender el asistente de una sede necesita el módulo «Configuración» en tu rol.' using errcode = 'P0001';
  end if;
  if p_encendido is null then
    raise exception 'Falta decir si queda encendido o apagado.' using errcode = '22023';
  end if;
  v_actor := retail.fn_actor_persona_id(true);

  for v_activa in select u.activo from retail.ubicaciones u where u.id = p_ubicacion_id loop
    exit;
  end loop;
  if v_activa is null then
    raise exception 'Esa sede no existe.' using errcode = 'P0001';
  end if;
  if not v_activa and p_encendido then
    raise exception 'Esa sede está cerrada: no se le enciende el asistente.' using errcode = 'P0001';
  end if;

  -- `for update`: dos personas cambiando la misma sede a la vez no se pisan la historia.
  perform 1 from retail.asistente_sedes where ubicacion_id = p_ubicacion_id for update;
  v_antes := coalesce((select s.encendido from retail.asistente_sedes s where s.ubicacion_id = p_ubicacion_id), false);
  if v_antes = p_encendido then
    return;
  end if;

  insert into retail.asistente_sedes (ubicacion_id, encendido, desde, cambiado_por, cambiado_en)
  values (p_ubicacion_id, p_encendido, case when p_encendido then now() end, v_actor, now())
  on conflict (ubicacion_id) do update
     set encendido = excluded.encendido,
         desde = case when excluded.encendido then now() else retail.asistente_sedes.desde end,
         cambiado_por = excluded.cambiado_por,
         cambiado_en = excluded.cambiado_en;

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('asistente_sede', jsonb_build_object('ubicacion_id', p_ubicacion_id, 'antes', v_antes, 'despues', p_encendido), v_actor);
end;
$$;

comment on function retail.guardar_asistente_sede(uuid, boolean) is
  'ADR-0536: enciende o apaga «Pregúntale a CAYLA» en una sede. Exige fn_puede_configurar() (Felipe 2026-10-27), firma con el responsable y anota en configuracion_historial.';
revoke all on function retail.guardar_asistente_sede(uuid, boolean) from public, anon;
grant execute on function retail.guardar_asistente_sede(uuid, boolean) to authenticated, service_role;
