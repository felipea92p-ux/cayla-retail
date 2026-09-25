-- scripts/carga/02_arnes.sql — piezas de la prueba de carga (solo en la base cayla_carga)
--   · _carga_actores: las 60 colaboradoras sintéticas numeradas 0..59 (pgbench elige una al azar).
--   · _carga_variantes: las 24.000 variantes sintéticas numeradas 0..23999.
--   · _carga_errores + _carga_error(): cada escenario atrapa su error y lo anota, para que la usuaria simulada siga
--     trabajando (pgbench 17 abandona el cliente ante cualquier error que no sea deadlock/serialización).
\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'cayla_carga' then raise exception 'Solo en cayla_carga (estás en %)', current_database(); end if;
end $$;

create table if not exists public._carga_actores as
select p.id as persona_id, p.auth_user_id, c.ubicacion_asignada_id as ubicacion_id,
       row_number() over (order by c.ubicacion_asignada_id, p.id) - 1 as i
from public.personas p join retail.colaboradores c on c.persona_id = p.id where p.nombres like 'Carga %';
create unique index if not exists _carga_actores_i on public._carga_actores (i);

create table if not exists public._carga_variantes as
select v.id, v.precio, row_number() over (order by v.codigo) - 1 as i
from retail.variantes v join retail.productos p on p.id = v.producto_id and p.codigo like 'CG%';
create unique index if not exists _carga_variantes_i on public._carga_variantes (i);

create table if not exists public._carga_errores (
  id bigserial primary key, escenario text, sqlstate text, mensaje text, creado timestamptz default clock_timestamp()
);
create or replace function public._carga_error(p_escenario text, p_sqlstate text, p_mensaje text)
returns void language sql security definer set search_path = public as $$
  insert into public._carga_errores (escenario, sqlstate, mensaje) values (p_escenario, p_sqlstate, left(p_mensaje, 300));
$$;
grant select on public._carga_actores, public._carga_variantes to authenticated;
grant execute on function public._carga_error(text, text, text) to authenticated;
