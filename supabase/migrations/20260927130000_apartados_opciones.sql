-- «Opciones» de Apartados (Apartados v2, paso 5 — ADR-0236; spike `docs/maquetas/apartados-v2-2026-09/`).
--
-- EL PROBLEMA. Apartados sumó funciones (abonos, estante, recordar en lote, editar, actividad, clienta por DNI, cámara)
-- y no toda tienda las quiere a la vista: una tienda chica puede no querer abonos, otra sí.
--
-- LA DECISIÓN (Felipe, 2026-09-26). Cada tienda tiene sus opciones; el punto de partida de fábrica es «Completo» (todo
-- encendido). Se guarda lo que la tienda APAGÓ (`apagadas`): una tienda sin fila, o una función que se sume mañana,
-- nace encendida sin tocar nada. Solo el líder las cambia. Son opciones de PANTALLA: apagar «abonos» esconde el botón,
-- no cambia qué acepta la base (lo que ya se abonó sigue contando en el saldo).
--
-- PRODUCCIÓN. Una tabla y dos funciones nuevas. Sin políticas (se lee y escribe solo por funciones security definer).
-- Una sola parte. Idempotente.

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create table if not exists retail.apartados_opciones (
  ubicacion_id uuid primary key references retail.ubicaciones (id),
  apagadas text[] not null default '{}'
    check (apagadas <@ array['clienta', 'qr', 'abonos', 'estante', 'lote', 'actividad', 'editar', 'otra_sede']::text[]),
  actualizado_por uuid references public.personas (id),
  updated_at timestamptz not null default now()
);
alter table retail.apartados_opciones enable row level security;
revoke all on retail.apartados_opciones from anon, authenticated;

create or replace function retail.fn_opciones_apartados(p_ubicacion_id uuid)
returns text[]
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce((select o.apagadas from apartados_opciones o where o.ubicacion_id = p_ubicacion_id), '{}'::text[])
   where fn_puede_operar_ubicacion(p_ubicacion_id);
$$;

create or replace function retail.guardar_opciones_apartados(p_ubicacion_id uuid, p_apagadas text[])
returns text[]
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_apagadas text[] := coalesce(array(select distinct x from unnest(coalesce(p_apagadas, '{}')) x order by 1), '{}');
begin
  if not fn_es_lider() then
    raise exception 'Solo el líder cambia las opciones de Apartados' using errcode = '42501';
  end if;
  if not exists (select 1 from ubicaciones where id = p_ubicacion_id and tipo = 'tienda') then
    raise exception 'Las opciones de Apartados son de una tienda';
  end if;
  v_persona := fn_actor_persona_id(true);
  insert into apartados_opciones (ubicacion_id, apagadas, actualizado_por, updated_at)
    values (p_ubicacion_id, v_apagadas, v_persona, now())
  on conflict (ubicacion_id) do update set apagadas = excluded.apagadas, actualizado_por = excluded.actualizado_por, updated_at = now();
  return v_apagadas;
end;
$$;

revoke all on function retail.fn_opciones_apartados(uuid) from public, anon;
revoke all on function retail.guardar_opciones_apartados(uuid, text[]) from public, anon;
grant execute on function retail.fn_opciones_apartados(uuid) to authenticated;
grant execute on function retail.guardar_opciones_apartados(uuid, text[]) to authenticated;
