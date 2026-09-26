-- ============================================================================
-- Prueba AISLADA del panel comercial — CAYLA V2 (ADR-0110)
--
-- QUÉ PRUEBA. Las tres funciones de `supabase/migrations/20260918191000_panel_comercial.sql`:
-- que los límites de día, semana y mes se calculan en HORA DE LIMA, que un ticket con varias
-- líneas cuenta un solo ticket, y que las ventas anuladas, las tiendas inactivas y el Taller
-- no entran. Cada verificación falla con mensaje si el número no coincide.
--
-- POR QUÉ ES "AISLADA". No usa Supabase, ni Docker, ni el esquema real completo: crea tablas
-- mínimas con los MISMOS nombres y tipos de columna que las migraciones (0002, 0008, 20260916172645)
-- y un stub de `fn_es_lider()`. Sirve para validar la lógica de las funciones en cualquier
-- Postgres ≥ 14 aunque Docker esté caído. LO QUE NO PRUEBA: la integración con el esquema real
-- (RLS, triggers, la `fn_es_lider` verdadera). Eso se cubre corriendo la pantalla contra el stack
-- local, y queda anotado en el ADR-0110 como pendiente mientras no se haga.
--
-- CÓMO SE CORRE (desde la raíz del repo, sobre una base VACÍA y desechable — borra el schema
-- `retail` de esa base, así que NUNCA contra el Postgres compartido del stack local):
--   createdb panel_test && psql -X -v ON_ERROR_STOP=1 -d panel_test -f scripts/pruebas/panel_comercial_aislado.sql
--
-- LA TRAMPA QUE CAZA. Una venta a las 7:30 pm de Lima (19:30 UTC−5) es 00:30 UTC del día
-- SIGUIENTE. Un reporte que agrupe por el día del servidor (Vercel corre en UTC) la pone en el
-- día equivocado, y la tienda "vende menos hoy" justo en su hora fuerte.
-- ============================================================================

drop schema if exists retail cascade;
create schema retail;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;

-- Tablas mínimas: mismos nombres y tipos que las migraciones reales.
create table retail.ubicaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null,
  activo boolean not null default true,
  meta_venta_diaria numeric
);
create table retail.ventas (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  usuario_id uuid,
  estado text not null default 'completada',
  created_at timestamptz not null default now()
);
create table retail.venta_items (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references retail.ventas (id),
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric(12, 2) not null,
  descuento_unitario numeric(12, 2) not null default 0,
  subtotal numeric(12, 2) generated always as ((precio_unitario - descuento_unitario) * cantidad) stored
);
create table retail.devoluciones (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references retail.ventas (id),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  estado text not null,
  aprobado_en timestamptz
);
create table retail.devolucion_items (
  id uuid primary key default gen_random_uuid(),
  devolucion_id uuid not null references retail.devoluciones (id),
  venta_item_id uuid not null references retail.venta_items (id),
  cantidad integer not null
);
-- Stub: la real mira public.personas + retail.colaboradores. Aquí se enciende con `set test.lider`.
create function retail.fn_es_lider() returns boolean language sql stable
as $$ select coalesce(nullif(current_setting('test.lider', true), '')::boolean, false) $$;

\i supabase/migrations/20260918191000_panel_comercial.sql

-- ---------------------------------------------------------------------------
-- Datos. Día pedido: viernes 2026-09-18 (hora de Lima). Su semana empieza el lunes 09-14.
-- ---------------------------------------------------------------------------
create function pg_temp.verifica(condicion boolean, mensaje text) returns void language plpgsql as $$
begin
  if condicion is not true then raise exception 'FALLÓ: %', mensaje; end if;
  raise notice 'ok  %', mensaje;
end $$;

insert into retail.ubicaciones (id, nombre, tipo, activo, meta_venta_diaria) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Tienda A', 'tienda', true, 800),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'Tienda B', 'tienda', true, null),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'Taller',   'taller', true, null),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'Tienda cerrada', 'tienda', false, null);

-- Colaboradoras
-- p1, p2 venden en A; p3 en B.
create function pg_temp.venta(id uuid, ubic uuid, usuario uuid, cuando timestamptz, estado text default 'completada') returns void
language sql as $$ insert into retail.ventas (id, ubicacion_id, usuario_id, created_at, estado) values (id, ubic, usuario, cuando, estado) $$;
create function pg_temp.linea(id uuid, venta uuid, cant int, precio numeric, dcto numeric default 0) returns void
language sql as $$ insert into retail.venta_items (id, venta_id, cantidad, precio_unitario, descuento_unitario) values (id, venta, cant, precio, dcto) $$;

-- Tienda A
select pg_temp.venta('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '2026-09-17 23:59:00-05');   -- s1: 1 min antes de hoy
select pg_temp.linea('21111111-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 1, 100);
select pg_temp.venta('11111111-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '2026-09-18 00:00:00-05');   -- s2: primer segundo de hoy
select pg_temp.linea('21111111-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000002', 1, 50);
select pg_temp.venta('11111111-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', '2026-09-18 19:30:00-05');   -- s3: 19:30 Lima = 00:30 UTC del día 19 (LA TRAMPA)
select pg_temp.linea('21111111-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000003', 2, 30);            -- 60
select pg_temp.linea('21111111-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000003', 1, 40, 10);        -- 30 (descuento 10)  → ticket de 90, 3 unidades
select pg_temp.venta('11111111-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '2026-09-19 00:00:00-05');   -- s4: primer segundo de MAÑANA → fuera
select pg_temp.linea('21111111-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000004', 1, 999);
select pg_temp.venta('11111111-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', '2026-09-13 12:00:00-05');   -- s5: domingo, semana anterior pero MISMO mes
select pg_temp.linea('21111111-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000005', 1, 200);
select pg_temp.venta('11111111-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '2026-08-31 23:59:00-05');   -- s6: mes anterior → fuera
select pg_temp.linea('21111111-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000006', 1, 888);
select pg_temp.venta('11111111-0000-4000-8000-000000000007', 'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '2026-09-18 10:00:00-05', 'anulada'); -- s7: ANULADA → fuera
select pg_temp.linea('21111111-0000-4000-8000-000000000008', '11111111-0000-4000-8000-000000000007', 1, 500);
select pg_temp.venta('11111111-0000-4000-8000-000000000010', 'aaaaaaaa-0000-4000-8000-000000000001', null, '2026-09-18 15:00:00-05');                                       -- s10: sin colaboradora registrada
select pg_temp.linea('21111111-0000-4000-8000-000000000009', '11111111-0000-4000-8000-000000000010', 1, 10);
-- Tienda B
select pg_temp.venta('11111111-0000-4000-8000-000000000008', 'aaaaaaaa-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000003', '2026-09-14 09:00:00-05');   -- s8: lunes = primer día de la semana
select pg_temp.linea('21111111-0000-4000-8000-000000000010', '11111111-0000-4000-8000-000000000008', 1, 300);
select pg_temp.venta('11111111-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000003', '2026-09-18 10:00:00-05');   -- s9: hoy
select pg_temp.linea('21111111-0000-4000-8000-000000000011', '11111111-0000-4000-8000-000000000009', 1, 120);
-- Taller y tienda inactiva: venden pero NO deben aparecer
select pg_temp.venta('11111111-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000003', '2026-09-18 11:00:00-05');
select pg_temp.linea('21111111-0000-4000-8000-000000000012', '11111111-0000-4000-8000-000000000011', 1, 777);
select pg_temp.venta('11111111-0000-4000-8000-000000000012', 'aaaaaaaa-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000003', '2026-09-18 11:00:00-05');
select pg_temp.linea('21111111-0000-4000-8000-000000000013', '11111111-0000-4000-8000-000000000012', 1, 666);

-- Devoluciones de la tienda A: una aprobada hoy (1 unidad de la línea de 30), una aprobada el 16 (la venta de 100),
-- una pendiente (no cuenta) y una aprobada el 31-ago (mes anterior, no cuenta).
insert into retail.devoluciones (id, venta_id, ubicacion_id, estado, aprobado_en) values
  ('31111111-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 'aprobada',  '2026-09-18 11:00:00-05'),
  ('31111111-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'aprobada',  '2026-09-16 12:00:00-05'),
  ('31111111-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 'pendiente', null),
  ('31111111-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-000000000001', 'aprobada',  '2026-08-31 12:00:00-05');
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad) values
  ('31111111-0000-4000-8000-000000000001', '21111111-0000-4000-8000-000000000003', 1),   -- 1 × 30 = 30
  ('31111111-0000-4000-8000-000000000002', '21111111-0000-4000-8000-000000000001', 1),   -- 1 × 100 = 100
  ('31111111-0000-4000-8000-000000000003', '21111111-0000-4000-8000-000000000003', 1),   -- pendiente
  ('31111111-0000-4000-8000-000000000004', '21111111-0000-4000-8000-000000000007', 1);   -- mes anterior

-- ---------------------------------------------------------------------------
-- Verificaciones
-- ---------------------------------------------------------------------------
set test.lider = 'true';

-- 1) Quién aparece
select pg_temp.verifica((select count(*) from retail.fn_comercial_sedes('2026-09-18')) = 2,
  'solo aparecen las 2 tiendas activas (ni el Taller ni la tienda inactiva)');

-- 2) Tienda A: hoy / semana / mes
create temp table a as select * from retail.fn_comercial_sedes('2026-09-18') where nombre = 'Tienda A';
select pg_temp.verifica((select ventas_hoy from a) = 150 and (select tickets_hoy from a) = 3 and (select unidades_hoy from a) = 5,
  'A hoy = S/150 en 3 tickets y 5 unidades (la venta de 7:30 pm cuenta HOY, la de 23:59 de ayer y la de 00:00 de mañana no)');
select pg_temp.verifica((select ventas_semana from a) = 250 and (select tickets_semana from a) = 4 and (select unidades_semana from a) = 6,
  'A semana (lunes 14 a hoy) = S/250 en 4 tickets: NO incluye el domingo 13');
select pg_temp.verifica((select ventas_mes from a) = 450 and (select tickets_mes from a) = 5 and (select unidades_mes from a) = 7,
  'A mes = S/450 en 5 tickets: incluye el domingo 13 y NO el 31-ago ni la anulada');
select pg_temp.verifica((select devuelto_hoy from a) = 30 and (select devuelto_semana from a) = 130 and (select devuelto_mes from a) = 130,
  'A devuelto: hoy 30, semana 130, mes 130 (la pendiente y la de agosto no cuentan)');
select pg_temp.verifica((select meta_venta_diaria from a) = 800, 'A trae su meta diaria');

-- 3) Tienda B: la semana empieza el lunes a la medianoche de Lima, y sin meta la meta es nula
create temp table b as select * from retail.fn_comercial_sedes('2026-09-18') where nombre = 'Tienda B';
select pg_temp.verifica((select ventas_hoy from b) = 120 and (select ventas_semana from b) = 420 and (select ventas_mes from b) = 420
                        and (select devuelto_mes from b) = 0 and (select meta_venta_diaria from b) is null,
  'B: hoy 120, semana 420 (incluye el lunes 09:00), mes 420, sin devoluciones y sin meta (NULL, no 0)');

-- 4) Una tienda sin ventas igual aparece, en cero
select pg_temp.verifica((select ventas_hoy from retail.fn_comercial_sedes('2026-01-10') where nombre = 'Tienda A') = 0
                        and (select count(*) from retail.fn_comercial_sedes('2026-01-10')) = 2,
  'un día sin ventas: las 2 tiendas aparecen en cero, no desaparecen');

-- 5) Por hora (hora de Lima)
select pg_temp.verifica((select ventas from retail.fn_comercial_horas('2026-09-18') where ubicacion_id = 'aaaaaaaa-0000-4000-8000-000000000001' and hora = 19) = 90,
  'la venta de las 19:30 de Lima queda en la hora 19 (no en la hora 0 de UTC)');
select pg_temp.verifica((select ventas from retail.fn_comercial_horas('2026-09-18') where ubicacion_id = 'aaaaaaaa-0000-4000-8000-000000000001' and hora = 0) = 50,
  'la venta de las 00:00 de Lima queda en la hora 0');
select pg_temp.verifica((select count(*) from retail.fn_comercial_horas('2026-09-18') where ubicacion_id = 'aaaaaaaa-0000-4000-8000-000000000001') = 3
                        and (select sum(tickets) from retail.fn_comercial_horas('2026-09-18') where ubicacion_id = 'aaaaaaaa-0000-4000-8000-000000000001') = 3,
  'A tiene 3 horas con ventas y 3 tickets (un ticket de 2 líneas cuenta 1)');
select pg_temp.verifica((select count(*) from retail.fn_comercial_horas('2026-09-18') where ubicacion_id in ('aaaaaaaa-0000-4000-8000-000000000003','aaaaaaaa-0000-4000-8000-000000000004')) = 0,
  'las horas tampoco incluyen al Taller ni a la tienda inactiva');

-- 6) Por colaboradora
create temp table c as select * from retail.fn_comercial_colaboradoras('2026-09-18') where ubicacion_id = 'aaaaaaaa-0000-4000-8000-000000000001';
select pg_temp.verifica((select count(*) from c) = 3, 'A tiene 3 filas: p1, p2 y "sin colaboradora registrada" (persona NULL)');
select pg_temp.verifica((select ventas_mes from c where persona_id = 'bbbbbbbb-0000-4000-8000-000000000002') = 290
                        and (select tickets_mes from c where persona_id = 'bbbbbbbb-0000-4000-8000-000000000002') = 2
                        and (select ventas_hoy from c where persona_id = 'bbbbbbbb-0000-4000-8000-000000000002') = 90,
  'p2: mes 290 en 2 tickets, hoy 90');
select pg_temp.verifica((select descuento_mes from c where persona_id = 'bbbbbbbb-0000-4000-8000-000000000002') = 10
                        and (select bruto_mes from c where persona_id = 'bbbbbbbb-0000-4000-8000-000000000002') = 300,
  'p2: bruto 300 y descuento 10 → se puede saber cuánto regaló para vender');
select pg_temp.verifica((select ventas_mes from c where persona_id is null) = 10, 'la venta sin colaboradora aparece como su propia fila, no se pierde');
select pg_temp.verifica((select persona_id from c order by ventas_mes desc limit 1) = 'bbbbbbbb-0000-4000-8000-000000000002'
                        and (select ventas_mes from retail.fn_comercial_colaboradoras('2026-09-18') where ubicacion_id = 'aaaaaaaa-0000-4000-8000-000000000001' limit 1) = 290,
  'las filas vienen ordenadas por ventas del mes, de mayor a menor');
select pg_temp.verifica((select count(*) from retail.fn_comercial_colaboradoras('2026-09-18') where ubicacion_id in ('aaaaaaaa-0000-4000-8000-000000000003','aaaaaaaa-0000-4000-8000-000000000004')) = 0,
  'las colaboradoras del Taller y de la tienda inactiva no aparecen');

-- 7) Seguridad: solo líder, y anon no puede ni ejecutar
set test.lider = 'false';
do $$ begin
  perform * from retail.fn_comercial_sedes('2026-09-18');
  raise exception 'FALLÓ: un no-líder pudo leer el panel';
exception when others then
  if sqlerrm not like 'Solo un líder%' then raise; end if;
  raise notice 'ok  un no-líder recibe "%" (fn_comercial_sedes)', sqlerrm;
end $$;
do $$ begin
  perform * from retail.fn_comercial_horas('2026-09-18');
  raise exception 'FALLÓ: un no-líder pudo leer las horas';
exception when others then
  if sqlerrm not like 'Solo un líder%' then raise; end if;
  raise notice 'ok  un no-líder también es rechazado en fn_comercial_horas';
end $$;
do $$ begin
  perform * from retail.fn_comercial_colaboradoras('2026-09-18');
  raise exception 'FALLÓ: un no-líder pudo leer las colaboradoras';
exception when others then
  if sqlerrm not like 'Solo un líder%' then raise; end if;
  raise notice 'ok  un no-líder también es rechazado en fn_comercial_colaboradoras';
end $$;
select pg_temp.verifica(not has_function_privilege('anon', 'retail.fn_comercial_sedes(date)', 'execute')
                        and not has_function_privilege('anon', 'retail.fn_comercial_horas(date)', 'execute')
                        and not has_function_privilege('anon', 'retail.fn_comercial_colaboradoras(date)', 'execute')
                        and has_function_privilege('authenticated', 'retail.fn_comercial_sedes(date)', 'execute'),
  'anon NO puede ejecutar las tres funciones y authenticated sí');

\echo
\echo '=== TODAS LAS VERIFICACIONES PASARON ==='
