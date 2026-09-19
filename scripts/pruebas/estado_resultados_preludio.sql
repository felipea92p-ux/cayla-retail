-- Preludio compartido de las pruebas del Estado de Resultados: zona UTC, tablas mínimas con los mismos
-- nombres y columnas que las migraciones reales, stubs de identidad y las tres migraciones (o sus mutantes,
-- según -v m1 / m2 / m3). Lo cargan `estado_resultados_aislado.sql` (reglas) y `estado_resultados_volumen.sql`.
-- BORRA el schema `retail` de la base a la que se conecte: solo contra una base desechable.

-- La base de producción (Supabase) corre en UTC. Se fija aquí para que la prueba demuestre que las
-- fronteras de mes NO dependen de la zona del servidor: una Mac configurada en hora de Lima habría
-- ocultado el error (UTC y Lima darían lo mismo).
set timezone = 'UTC';

drop schema if exists retail cascade;
create schema retail;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;
grant usage on schema retail, public to authenticated, anon;

create table if not exists public.t_cuenta (n integer not null default 0);
delete from public.t_cuenta; insert into public.t_cuenta values (0);
grant select, update on public.t_cuenta to authenticated;

create or replace function public.t_ok(condicion boolean, mensaje text) returns void language plpgsql as $$
begin
  if condicion is not true then raise exception 'FALLÓ: %', mensaje; end if;
  update public.t_cuenta set n = n + 1;
  raise notice 'ok  %', mensaje;
end $$;

create or replace function public.t_falla(sentencia text, esperado text) returns void language plpgsql as $$
declare v_msg text;
begin
  begin
    execute sentencia;
  exception when others then
    v_msg := sqlerrm;
    if position(lower(esperado) in lower(v_msg)) = 0 then
      raise exception 'FALLÓ: [%] falló con otro mensaje. Esperaba «%», llegó «%»', sentencia, esperado, v_msg;
    end if;
    update public.t_cuenta set n = n + 1;
    raise notice 'ok  rechaza: %', esperado;
    return;
  end;
  raise exception 'FALLÓ: se esperaba el error «%» y NO ocurrió: %', esperado, sentencia;
end $$;

-- ---------- Tablas mínimas (mismos nombres y columnas que las migraciones reales) ----------
create table retail.ubicaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  tipo text not null check (tipo in ('tienda', 'almacen', 'taller')),
  activo boolean not null default true
);
create table retail.variantes (id uuid primary key default gen_random_uuid(), costo numeric(12,2) not null default 0);
create table retail.costo_historial (
  id uuid primary key default gen_random_uuid(),
  variante_id uuid not null references retail.variantes (id),
  costo_anterior numeric(12,2) not null,
  costo_resultante numeric(12,2) not null,
  created_at timestamptz not null default now()
);
create table retail.ventas (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  estado text not null default 'completada' check (estado in ('completada', 'anulada')),
  anulado_en timestamptz,
  created_at timestamptz not null default now()
);
create table retail.venta_items (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references retail.ventas (id),
  variante_id uuid not null references retail.variantes (id),
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null,
  descuento_unitario numeric(12,2) not null default 0,
  costo_unitario numeric(12,2) not null check (costo_unitario >= 0),
  subtotal numeric(12,2) generated always as ((precio_unitario - descuento_unitario) * cantidad) stored
);
create table retail.venta_pagos (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references retail.ventas (id),
  metodo text not null check (metodo in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia')),
  monto numeric(12,2) not null check (monto > 0)
);
create table retail.venta_anulacion_items (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references retail.ventas (id),
  venta_item_id uuid not null references retail.venta_items (id),
  condicion text not null check (condicion in ('vendible', 'danada_reparacion', 'danada_donar', 'devolver_proveedor'))
);
create table retail.devoluciones (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references retail.ventas (id),
  estado text not null check (estado in ('pendiente', 'aprobada', 'rechazada')),
  reembolso_monto numeric(12,2),
  reembolso_metodo text,
  aprobado_en timestamptz
);
create table retail.devolucion_items (
  id uuid primary key default gen_random_uuid(),
  devolucion_id uuid not null references retail.devoluciones (id),
  venta_item_id uuid not null references retail.venta_items (id),
  cantidad integer not null
);
create table retail.cambios (
  id uuid primary key default gen_random_uuid(),
  venta_item_id uuid not null references retail.venta_items (id),
  variante_nueva_id uuid not null references retail.variantes (id),
  cantidad integer not null check (cantidad > 0),
  diferencia numeric(12,2) not null default 0,
  metodo_pago_diferencia text,
  created_at timestamptz not null default now()
);
create table retail.movimientos (
  id uuid primary key default gen_random_uuid(),
  variante_id uuid not null references retail.variantes (id),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste', 'traslado')),
  cantidad integer not null,
  motivo text,
  created_at timestamptz not null default now()
);
-- Gastos: solo lo que lee el diario (la tabla real está en 20260918193000_gastos.sql).
create table retail.categorias_gasto (codigo text primary key, nombre text not null, cuenta_pcge text not null);
create table retail.gastos (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid references retail.ubicaciones (id),
  categoria text not null references retail.categorias_gasto (codigo),
  descripcion text not null,
  fecha date not null,
  monto_total numeric(12,2) not null,
  igv numeric(12,2) not null default 0,
  medio_pago text not null,
  estado text not null default 'vigente'
);

create function retail.fn_es_lider() returns boolean language sql stable
as $$ select coalesce(nullif(current_setting('test.lider', true), '')::boolean, false) $$;
create function retail.fn_hoy_lima() returns date language sql stable
as $$ select (now() at time zone 'America/Lima')::date $$;

insert into retail.categorias_gasto values
  ('alquileres', 'Alquileres', '635'), ('servicios_basicos', 'Servicios básicos', '636');

-- Lo que se prueba (o su mutante).
\i :m1
\i :m2
\i :m3

grant select on retail.categorias_gasto to authenticated;
grant execute on function retail.fn_es_lider() to authenticated;
select set_config('test.lider', 'true', false);
