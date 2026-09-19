-- ============================================================================
-- Prueba AISLADA del panel de calidad — CAYLA V2 (ADR-0113)
--
-- QUÉ PRUEBA. `fn_calidad` y `fn_calidad_danadas` de `supabase/migrations/20260918192000_panel_calidad.sql`:
--   · la COHORTE MADURA: solo ventas que ya cumplieron su plazo de cambio (una venta de hace 3 días no cuenta);
--   · la ATRIBUCIÓN: el origen más reciente ANTERIOR a la venta, ignorando compras anuladas, producciones de
--     muestra y producciones anuladas, y sin dejarse engañar por una compra POSTERIOR a la venta;
--   · (la atribución vive en `fn_origen_producto`, migración aparte que esta prueba carga primero);
--   · que solo cuentan devoluciones APROBADAS, que un cambio se cuenta aparte y que "dañada" no es "vendible";
--   · que las cuatro vistas (producto, talla, origen, categoría) suman exactamente lo mismo.
-- Cada verificación falla con mensaje si el número no coincide.
--
-- POR QUÉ ES "AISLADA". No usa Supabase ni Docker: crea tablas mínimas con los MISMOS nombres y tipos de
-- columna que las migraciones y un stub de `fn_es_lider()`. Valida la lógica en cualquier Postgres ≥ 14.
-- LO QUE NO PRUEBA: la integración con el esquema real (RLS, la `fn_es_lider` verdadera, triggers).
--
-- CÓMO SE CORRE (desde la raíz del repo, sobre una base VACÍA y desechable — borra el schema `retail` de esa
-- base, así que NUNCA contra el Postgres compartido del stack local):
--   createdb calidad_test && psql -X -v ON_ERROR_STOP=1 -d calidad_test -f scripts/pruebas/panel_calidad_aislado.sql
-- ============================================================================

drop schema if exists retail cascade;
create schema retail;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;

-- Igual que `0005_grants.sql` en producción: toda función NUEVA nace ejecutable por `authenticated`.
-- Sin esto, la prueba de "la auxiliar no es ejecutable" pasaría sin probar nada.
alter default privileges in schema retail grant execute on functions to authenticated;

create table retail.ubicaciones (id uuid primary key, nombre text not null, tipo text not null, activo boolean not null default true);
create table retail.categorias (id uuid primary key, nombre text not null);
create table retail.productos (id uuid primary key, categoria_id uuid references retail.categorias (id), referencia text not null);
create table retail.tallas (id uuid primary key, valor text not null);
create table retail.variantes (id uuid primary key, producto_id uuid not null references retail.productos (id), talla_id uuid references retail.tallas (id));
create table retail.ventas (id uuid primary key, ubicacion_id uuid not null references retail.ubicaciones (id), estado text not null default 'completada', created_at timestamptz not null);
create table retail.venta_items (id uuid primary key, venta_id uuid not null references retail.ventas (id), variante_id uuid not null references retail.variantes (id), cantidad integer not null check (cantidad > 0));
create table retail.proveedores (id uuid primary key, nombre text not null);
create table retail.compras (id uuid primary key, proveedor_id uuid not null references retail.proveedores (id), fecha_emision date not null, estado text not null default 'vigente');
create table retail.compra_items (id uuid primary key default gen_random_uuid(), compra_id uuid not null references retail.compras (id), producto_id uuid not null references retail.productos (id));
create table retail.producciones (id uuid primary key, producto_id uuid not null references retail.productos (id), estado text not null, es_muestra boolean not null default false, inventariado_at timestamptz);
create table retail.devoluciones (id uuid primary key, venta_id uuid not null references retail.ventas (id), ubicacion_id uuid not null references retail.ubicaciones (id), estado text not null, aprobado_en timestamptz);
create table retail.devolucion_items (id uuid primary key default gen_random_uuid(), devolucion_id uuid not null references retail.devoluciones (id), venta_item_id uuid not null references retail.venta_items (id), cantidad integer not null, condicion text not null);
create table retail.cambios (id uuid primary key default gen_random_uuid(), venta_item_id uuid not null references retail.venta_items (id), cantidad integer not null);
create table retail.venta_anulacion_items (id uuid primary key default gen_random_uuid(), venta_id uuid not null references retail.ventas (id), venta_item_id uuid not null references retail.venta_items (id), condicion text not null, created_at timestamptz not null);
create function retail.fn_es_lider() returns boolean language sql stable
as $$ select coalesce(nullif(current_setting('test.lider', true), '')::boolean, false) $$;

\i supabase/migrations/20260918191500_fn_origen_producto.sql
\i supabase/migrations/20260918192000_panel_calidad.sql

create function pg_temp.verifica(condicion boolean, mensaje text) returns void language plpgsql as $$
begin
  if condicion is not true then raise exception 'FALLÓ: %', mensaje; end if;
  raise notice 'ok  %', mensaje;
end $$;

-- ---------------------------------------------------------------------------
-- Datos. Día pedido: 2026-09-18. Plazo 15 días, ventana 90 días:
--   cohorte = ventas del 2026-06-05 al 2026-09-02 (el 3-sep y después NO han cumplido su plazo).
-- ---------------------------------------------------------------------------
insert into retail.ubicaciones values
  ('a0000000-0000-4000-8000-000000000001', 'Tienda A', 'tienda', true),
  ('a0000000-0000-4000-8000-000000000002', 'Taller', 'taller', true);
insert into retail.categorias values
  ('c0000000-0000-4000-8000-000000000001', 'Blusas'), ('c0000000-0000-4000-8000-000000000002', 'Polos'), ('c0000000-0000-4000-8000-000000000003', 'Faldas');
insert into retail.tallas values
  ('d0000000-0000-4000-8000-000000000001', 'S'), ('d0000000-0000-4000-8000-000000000002', 'M'), ('d0000000-0000-4000-8000-000000000003', 'L');
insert into retail.productos values
  ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'BL-01'),   -- P1 blusa: compras a A y luego a B
  ('e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', 'PO-01'),   -- P2 polo: compra a A + producción del Taller + trampas
  ('e0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003', 'FA-01'),   -- P3 falda: sin origen
  ('e0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000002', 'PO-02');   -- P4 polo: solo Taller
insert into retail.variantes values
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001'),  -- P1 S
  ('f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002'),  -- P1 M
  ('f0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001'),  -- P2 S
  ('f0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003'),  -- P3 L
  ('f0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001');  -- P4 S
insert into retail.proveedores values
  ('b0000000-0000-4000-8000-000000000001', 'Proveedor A'), ('b0000000-0000-4000-8000-000000000002', 'Proveedor B');

-- Compras
insert into retail.compras values
  ('90000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', '2026-06-01', 'vigente'),   -- P1 a A
  ('90000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', '2026-08-01', 'vigente'),   -- P1 a B, DESPUÉS de la venta 1
  ('90000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', '2026-07-10', 'anulada'),   -- P2 a B, ANULADA: no cuenta
  ('90000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', '2026-06-20', 'vigente');   -- P2 a A
insert into retail.compra_items (compra_id, producto_id) values
  ('90000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000002'),
  ('90000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000002');
-- Producciones (todas a mediodía de Lima)
insert into retail.producciones values
  ('80000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'terminada', false, '2026-06-10 12:00:00-05'),  -- P2 Taller real, ANTES de la compra a A del 20-jun
  ('80000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 'terminada', true,  '2026-07-01 12:00:00-05'),  -- P2 MUESTRA: no cuenta
  ('80000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000002', 'anulada',   false, '2026-07-05 12:00:00-05'),  -- P2 ANULADA: no cuenta
  ('80000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000004', 'terminada', false, '2026-06-10 12:00:00-05');  -- P4 solo Taller

-- Ventas (mediodía de Lima). Cada una con UNA línea.
insert into retail.ventas values
  ('10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'completada', '2026-07-01 12:00:00-05'),  -- s1 → A (la compra a B es del 1-ago, posterior)
  ('10000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'completada', '2026-08-10 12:00:00-05'),  -- s2 → B
  ('10000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'completada', '2026-09-10 12:00:00-05'),  -- s3: 8 días atrás: NO cumplió su plazo → fuera
  ('10000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'completada', '2026-06-01 12:00:00-05'),  -- s4: antes de la ventana → fuera
  ('10000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'completada', '2026-07-15 12:00:00-05'),  -- s5 → A (compra 20-jun gana al Taller del 10-jun)
  ('10000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'completada', '2026-07-20 12:00:00-05'),  -- s6 → sin origen
  ('10000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'anulada',    '2026-07-02 12:00:00-05'),  -- s7 ANULADA → fuera
  ('10000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'anulada',    '2026-08-20 12:00:00-05'),  -- s8 ANULADA → fuera
  ('10000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'completada', '2026-07-16 12:00:00-05');  -- s9 → Taller
insert into retail.venta_items values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 2),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', 3),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000002', 5),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000001', 7),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000003', 4),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-000000000004', 1),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000007', 'f0000000-0000-4000-8000-000000000001', 9),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000008', 'f0000000-0000-4000-8000-000000000001', 2),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000009', 'f0000000-0000-4000-8000-000000000005', 2);

-- Devoluciones
insert into retail.devoluciones values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'aprobada',  '2026-07-05 12:00:00-05'),   -- d1 vendible
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'aprobada',  '2026-08-12 12:00:00-05'),   -- d2a dañada
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'aprobada',  '2026-08-13 12:00:00-05'),   -- d2b a proveedor
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'pendiente', null),                        -- d3 pendiente: NO cuenta
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'rechazada', '2026-07-25 12:00:00-05'),   -- d4 rechazada: NO cuenta
  ('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'aprobada',  '2026-06-20 12:00:00-05');   -- d5 dañada en junio (fuera de la ventana de meses)
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1, 'vendible'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 1, 'danada_reparacion'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 1, 'devolver_proveedor'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000005', 4, 'vendible'),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000006', 1, 'vendible'),
  ('30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000004', 1, 'danada_reparacion');
-- Cambios
insert into retail.cambios (venta_item_id, cantidad) values
  ('20000000-0000-4000-8000-000000000001', 1), ('20000000-0000-4000-8000-000000000005', 1);
-- Anulaciones: una dañada (9 unidades, sept) y una vendible (se ignora)
insert into retail.venta_anulacion_items (venta_id, venta_item_id, condicion, created_at) values
  ('10000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000007', 'danada_donar', '2026-09-05 12:00:00-05'),
  ('10000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000008', 'vendible',     '2026-09-06 12:00:00-05');

-- ---------------------------------------------------------------------------
-- Verificaciones de fn_calidad
-- ---------------------------------------------------------------------------
set test.lider = 'true';
create temp table r as select * from retail.fn_calidad('2026-09-18');

select pg_temp.verifica((select count(*) from r) = 15, '15 filas: 4 productos + 3 tallas + 4 orígenes + 3 categorías + 1 total');

-- Total
select pg_temp.verifica((select unidades_vendidas from r where nivel = 'total') = 12,
  'total: 12 unidades vendidas (la venta de hace 8 días, la anterior a la ventana y las anuladas NO entran)');
select pg_temp.verifica((select unidades_devueltas from r where nivel = 'total') = 3
                        and (select devueltas_vendibles from r where nivel = 'total') = 1
                        and (select devueltas_danadas from r where nivel = 'total') = 1
                        and (select devueltas_a_proveedor from r where nivel = 'total') = 1,
  'total: 3 devueltas = 1 vendible + 1 dañada + 1 a proveedor (la pendiente y la rechazada NO cuentan)');
select pg_temp.verifica((select unidades_cambiadas from r where nivel = 'total') = 2, 'total: 2 cambios');
select pg_temp.verifica((select cohorte_desde from r limit 1) = '2026-06-05' and (select cohorte_hasta from r limit 1) = '2026-09-02',
  'la cohorte va del 5-jun al 2-sep (incluido): las ventas del 3-sep en adelante aún no cumplieron su plazo de 15 días');

-- Las cuatro vistas suman lo mismo (cada línea vendida cae en exactamente un grupo de cada vista)
select pg_temp.verifica((select count(distinct s) from (select sum(unidades_vendidas) s from r where nivel <> 'total' group by nivel) x) = 1
                        and (select sum(unidades_vendidas) from r where nivel = 'talla') = 12,
  'las cuatro vistas (producto, talla, origen, categoría) suman las mismas 12 unidades');
select pg_temp.verifica((select count(distinct s) from (select sum(unidades_devueltas) s from r where nivel <> 'total' group by nivel) x) = 1,
  'las cuatro vistas suman las mismas 3 devoluciones');

-- Por talla
select pg_temp.verifica((select unidades_vendidas from r where nivel = 'talla' and etiqueta = 'S') = 8
                        and (select unidades_devueltas from r where nivel = 'talla' and etiqueta = 'S') = 1
                        and (select unidades_cambiadas from r where nivel = 'talla' and etiqueta = 'S') = 2,
  'talla S: 8 vendidas, 1 devuelta, 2 cambiadas');
select pg_temp.verifica((select unidades_vendidas from r where nivel = 'talla' and etiqueta = 'M') = 3
                        and (select unidades_devueltas from r where nivel = 'talla' and etiqueta = 'M') = 2
                        and (select devueltas_danadas from r where nivel = 'talla' and etiqueta = 'M') = 1,
  'talla M: 3 vendidas, 2 devueltas (1 dañada)');

-- Atribución: ESTA es la parte delicada
select pg_temp.verifica((select unidades_vendidas from r where nivel = 'origen' and etiqueta = 'Proveedor A') = 6
                        and (select unidades_devueltas from r where nivel = 'origen' and etiqueta = 'Proveedor A') = 1,
  'Proveedor A: 6 vendidas = las 2 de la blusa (la compra a B es POSTERIOR a esa venta) + las 4 del polo (su compra del 20-jun gana al Taller del 10-jun)');
select pg_temp.verifica((select unidades_vendidas from r where nivel = 'origen' and etiqueta = 'Proveedor B') = 3
                        and (select unidades_devueltas from r where nivel = 'origen' and etiqueta = 'Proveedor B') = 2,
  'Proveedor B: solo las 3 de la venta posterior a su compra del 1-ago; su compra ANULADA del polo no le atribuye nada');
select pg_temp.verifica((select unidades_vendidas from r where nivel = 'origen' and etiqueta = 'Taller') = 2,
  'Taller: solo el polo que fabricó él (la producción de MUESTRA y la ANULADA del otro polo no cuentan)');
select pg_temp.verifica((select unidades_vendidas from r where nivel = 'origen' and etiqueta = 'Sin origen registrado') = 1,
  'una prenda sin compra ni producción sale como "Sin origen registrado", visible y no perdida');

-- Por producto y categoría
select pg_temp.verifica((select unidades_devueltas from r where nivel = 'producto' and etiqueta = 'BL-01') = 3
                        and (select unidades_vendidas from r where nivel = 'producto' and etiqueta = 'BL-01') = 5,
  'producto BL-01: 5 vendidas, 3 devueltas');
select pg_temp.verifica((select unidades_vendidas from r where nivel = 'categoria' and etiqueta = 'Polos') = 6,
  'categoría Polos = PO-01 (4) + PO-02 (2)');

-- Un día en que nadie vendió en la ventana: devuelve el total en cero, no falla
select pg_temp.verifica((select unidades_vendidas from retail.fn_calidad('2026-01-10') where nivel = 'total') = 0,
  'una ventana sin ventas devuelve el total en 0, no falla ni devuelve nada');

-- ---------------------------------------------------------------------------
-- fn_calidad_danadas
-- ---------------------------------------------------------------------------
create temp table dn as select * from retail.fn_calidad_danadas('2026-09-18', 3);
select pg_temp.verifica((select count(*) from dn) = 3, 'dañadas: 3 filas en los últimos 3 meses (jul, ago, sep)');
select pg_temp.verifica((select unidades from dn where mes = '2026-08-01' and condicion = 'danada_reparacion' and origen = 'devolucion') = 1
                        and (select unidades from dn where mes = '2026-08-01' and condicion = 'devolver_proveedor') = 1,
  'agosto: 1 dañada a reparar y 1 devuelta al proveedor, ambas por devolución');
select pg_temp.verifica((select unidades from dn where mes = '2026-09-01' and condicion = 'danada_donar' and origen = 'anulacion') = 9,
  'septiembre: 9 unidades dañadas por una venta anulada (con las unidades de esa línea)');
select pg_temp.verifica((select count(*) from dn where mes = '2026-06-01') = 0,
  'la devolución dañada de junio queda fuera de una ventana de 3 meses');
select pg_temp.verifica((select count(*) from dn where condicion = 'vendible') = 0,
  'una prenda que volvió vendible (o anulación vendible) no es "dañada"');
select pg_temp.verifica((select count(*) from retail.fn_calidad_danadas('2026-09-18', 4) where mes = '2026-06-01') = 1,
  'con una ventana de 4 meses la devolución de junio SÍ entra');

-- ---------------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------------
set test.lider = 'false';
do $$ begin
  perform * from retail.fn_calidad('2026-09-18');
  raise exception 'FALLÓ: un no-líder pudo leer la calidad';
exception when others then
  if sqlerrm not like 'Solo un líder%' then raise; end if;
  raise notice 'ok  un no-líder recibe "%" (fn_calidad)', sqlerrm;
end $$;
do $$ begin
  perform * from retail.fn_calidad_danadas('2026-09-18');
  raise exception 'FALLÓ: un no-líder pudo leer las dañadas';
exception when others then
  if sqlerrm not like 'Solo un líder%' then raise; end if;
  raise notice 'ok  un no-líder también es rechazado en fn_calidad_danadas';
end $$;
set test.lider = 'true';
do $$ begin
  perform * from retail.fn_calidad('2026-09-18', 0);
  raise exception 'FALLÓ: aceptó p_dias = 0';
exception when others then
  if sqlerrm not like 'Parámetros fuera de rango%' then raise; end if;
  raise notice 'ok  rechaza una ventana de 0 días';
end $$;
select pg_temp.verifica(not has_function_privilege('authenticated', 'retail.fn_origen_producto(uuid,date)', 'execute')
                        and not has_function_privilege('anon', 'retail.fn_origen_producto(uuid,date)', 'execute'),
  'la función auxiliar de origen NO es ejecutable por authenticated ni anon (aunque los permisos por defecto se lo darían)');
select pg_temp.verifica(not has_function_privilege('anon', 'retail.fn_calidad(date,integer,integer)', 'execute')
                        and not has_function_privilege('anon', 'retail.fn_calidad_danadas(date,integer)', 'execute')
                        and has_function_privilege('authenticated', 'retail.fn_calidad(date,integer,integer)', 'execute'),
  'anon NO puede ejecutar las dos funciones y authenticated sí');

\echo
\echo '=== TODAS LAS VERIFICACIONES PASARON ==='
