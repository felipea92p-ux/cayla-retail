-- ============================================================================
-- Prueba AISLADA del panel de rentabilidad — CAYLA V2 (ADR-0118)
--
-- QUÉ PRUEBA. `fn_origen_producto` y `fn_rentabilidad` de `supabase/migrations/20260918194000_panel_rentabilidad.sql`:
--   · EL MARGEN SE CALCULA SIN IGV: la venta neta es lo pagado ÷ 1,18, no lo pagado;
--   · UN COSTO EN CERO NO ES UN COSTO: esas líneas quedan fuera del margen y se cuentan aparte;
--   · la ventana de fechas (hoy incluido, con borde de medianoche de Lima), y que las anuladas no entran;
--   · el stock vendible EXCLUYE la cuarentena, se suma por producto sin multiplicarse por las ventas (sin "fan-out")
--     y un producto con stock y sin ventas aparece igual;
--   · que las cuatro vistas (producto, categoría, temporada, origen) suman lo mismo, y que el stock no se atribuye a un origen;
--   · que la atribución de origen ignora compras anuladas, muestras y compras posteriores a la venta;
--   · que la función auxiliar NO es ejecutable por `authenticated` aunque los permisos por defecto de `0005_grants.sql` se lo darían.
-- Cada verificación falla con mensaje si el número no coincide.
--
-- POR QUÉ ES "AISLADA". No usa Supabase ni Docker: crea tablas mínimas con los MISMOS nombres y tipos de columna que las
-- migraciones y un stub de `fn_es_lider()`. Valida la lógica en cualquier Postgres ≥ 14. LO QUE NO PRUEBA: la integración con
-- el esquema real (RLS, la `fn_es_lider` verdadera, triggers).
--
-- CÓMO SE CORRE (desde la raíz del repo, sobre una base VACÍA y desechable — borra el schema `retail` de esa base, así que
-- NUNCA contra el Postgres compartido del stack local):
--   createdb rentabilidad_test && psql -X -v ON_ERROR_STOP=1 -d rentabilidad_test -f scripts/pruebas/panel_rentabilidad_aislado.sql
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

create table retail.categorias (id uuid primary key, nombre text not null);
create table retail.productos (id uuid primary key, categoria_id uuid references retail.categorias (id), referencia text not null, temporada text);
create table retail.variantes (id uuid primary key, producto_id uuid not null references retail.productos (id));
create table retail.sububicaciones (id uuid primary key, tipo text not null);
create table retail.stock (variante_id uuid not null references retail.variantes (id), sububicacion_id uuid references retail.sububicaciones (id), cantidad integer not null);
create table retail.ventas (id uuid primary key, estado text not null default 'completada', created_at timestamptz not null);
create table retail.venta_items (
  id uuid primary key, venta_id uuid not null references retail.ventas (id), variante_id uuid not null references retail.variantes (id),
  cantidad integer not null, precio_unitario numeric(12, 2) not null, descuento_unitario numeric(12, 2) not null default 0, costo_unitario numeric(12, 2) not null
);
create table retail.proveedores (id uuid primary key, nombre text not null);
create table retail.compras (id uuid primary key, proveedor_id uuid not null references retail.proveedores (id), fecha_emision date not null, estado text not null default 'vigente');
create table retail.compra_items (id uuid primary key default gen_random_uuid(), compra_id uuid not null references retail.compras (id), producto_id uuid not null references retail.productos (id));
create table retail.producciones (id uuid primary key, producto_id uuid not null references retail.productos (id), estado text not null, es_muestra boolean not null default false, inventariado_at timestamptz);
create table retail.devoluciones (id uuid primary key, estado text not null);
create table retail.devolucion_items (id uuid primary key default gen_random_uuid(), devolucion_id uuid not null references retail.devoluciones (id), venta_item_id uuid not null references retail.venta_items (id), cantidad integer not null);
create function retail.fn_es_lider() returns boolean language sql stable
as $$ select coalesce(nullif(current_setting('test.lider', true), '')::boolean, false) $$;

\i supabase/migrations/20260918194000_panel_rentabilidad.sql

create function pg_temp.verifica(condicion boolean, mensaje text) returns void language plpgsql as $$
begin
  if condicion is not true then raise exception 'FALLÓ: %', mensaje; end if;
  raise notice 'ok  %', mensaje;
end $$;

-- ---------------------------------------------------------------------------
-- Datos. Día pedido: 2026-09-18, ventana de 90 días → del 2026-06-21 al 2026-09-18 (hoy incluido).
-- ---------------------------------------------------------------------------
insert into retail.categorias values
  ('c0000000-0000-4000-8000-000000000001', 'Blusas'), ('c0000000-0000-4000-8000-000000000002', 'Polos'), ('c0000000-0000-4000-8000-000000000003', 'Faldas');
insert into retail.productos values
  ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'BL-01', 'Invierno'),   -- P1: vende con costo
  ('e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', 'PO-01', 'Verano'),     -- P2: del Taller
  ('e0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003', 'FA-01', null),         -- P3: SIN costo cargado
  ('e0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'BL-02', 'Invierno'),   -- P4: stock y CERO ventas (inventario parado)
  ('e0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000002', 'PO-02', 'Verano');     -- P5: solo cuarentena
insert into retail.variantes values
  ('f0000000-0000-4000-8000-00000000001a', 'e0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-00000000001b', 'e0000000-0000-4000-8000-000000000001'),   -- P1 tiene DOS variantes: el stock no debe multiplicarse
  ('f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002'),
  ('f0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000003'),
  ('f0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000004'),
  ('f0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000005');
insert into retail.sububicaciones values ('a1000000-0000-4000-8000-000000000001', 'piso_venta'), ('a1000000-0000-4000-8000-000000000002', 'cuarentena');
insert into retail.stock values
  ('f0000000-0000-4000-8000-00000000001a', 'a1000000-0000-4000-8000-000000000001', 6),
  ('f0000000-0000-4000-8000-00000000001b', 'a1000000-0000-4000-8000-000000000001', 4),
  ('f0000000-0000-4000-8000-00000000001a', 'a1000000-0000-4000-8000-000000000002', 2),   -- cuarentena: NO cuenta como vendible
  ('f0000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 5),
  ('f0000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 7),
  ('f0000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000002', 3);   -- P5: solo cuarentena → no aparece
insert into retail.proveedores values ('b0000000-0000-4000-8000-000000000001', 'Proveedor A'), ('b0000000-0000-4000-8000-000000000002', 'Proveedor B');
insert into retail.compras values
  ('90000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', '2026-06-01', 'vigente'),
  ('90000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', '2026-06-05', 'vigente');
insert into retail.compra_items (compra_id, producto_id) values
  ('90000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001'),   -- P1 a A
  ('90000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000004');   -- P4 a B
insert into retail.producciones values
  ('80000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'terminada', false, '2026-06-10 12:00:00-05');   -- P2 del Taller

insert into retail.ventas values
  ('10000000-0000-4000-8000-000000000001', 'completada', '2026-08-01 12:00:00-05'),
  ('10000000-0000-4000-8000-000000000002', 'completada', '2026-08-10 12:00:00-05'),
  ('10000000-0000-4000-8000-000000000003', 'completada', '2026-07-15 12:00:00-05'),
  ('10000000-0000-4000-8000-000000000004', 'completada', '2026-09-01 12:00:00-05'),
  ('10000000-0000-4000-8000-000000000005', 'anulada',    '2026-08-05 12:00:00-05'),   -- ANULADA → fuera
  ('10000000-0000-4000-8000-000000000006', 'completada', '2026-06-20 12:00:00-05'),   -- antes de la ventana → fuera
  ('10000000-0000-4000-8000-000000000007', 'completada', '2026-09-18 23:59:00-05'),   -- último minuto de HOY → dentro
  ('10000000-0000-4000-8000-000000000008', 'completada', '2026-09-19 00:00:00-05');   -- primer segundo de MAÑANA → fuera
insert into retail.venta_items values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000001a', 2, 118.00,  0.00, 40.00),   -- P1: pagó 236 → neta 200
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-00000000001b', 1, 118.00, 18.00, 40.00),   -- P1: pagó 100 (con descuento de 18)
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000002', 3,  59.00,  0.00, 20.00),   -- P2: pagó 177 → neta 150
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000003', 4, 100.00,  0.00,  0.00),   -- P3: COSTO 0
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-00000000001a', 5, 118.00,  0.00, 40.00),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-00000000001a', 7, 118.00,  0.00, 40.00),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000007', 'f0000000-0000-4000-8000-000000000002', 1,  59.00,  0.00, 20.00),   -- P2: pagó 59 → neta 50
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000008', 'f0000000-0000-4000-8000-000000000002', 9,  59.00,  0.00, 20.00);
insert into retail.devoluciones values ('30000000-0000-4000-8000-000000000001', 'aprobada'), ('30000000-0000-4000-8000-000000000002', 'pendiente');
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1),   -- aprobada: cuenta
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003', 1);   -- pendiente: NO cuenta

-- ---------------------------------------------------------------------------
-- Verificaciones
-- ---------------------------------------------------------------------------
set test.lider = 'true';
create temp table r as select * from retail.fn_rentabilidad('2026-09-18');

select pg_temp.verifica((select count(*) from r) = 14, '14 filas: 4 productos + 3 categorías + 3 temporadas + 3 orígenes + 1 total (P5, solo cuarentena, NO aparece)');
select pg_temp.verifica((select desde from r limit 1) = '2026-06-21' and (select hasta from r limit 1) = '2026-09-18' and (select dias_ventana from r limit 1) = 90,
  'la ventana va del 21-jun al 18-sep (hoy incluido) y son 90 días');

-- 1) EL MARGEN SE CALCULA SIN IGV
select pg_temp.verifica((select round(venta_neta, 2) from r where nivel = 'producto' and etiqueta = 'BL-01') = 284.75,
  'BL-01: venta neta 284,75 = (236 + 100) ÷ 1,18 — NO 336: el precio ya trae el IGV adentro');
select pg_temp.verifica((select round(venta_neta, 2) from r where nivel = 'producto' and etiqueta = 'PO-01') = 200.00,
  'PO-01: venta neta 200 = (177 + 59) ÷ 1,18');
select pg_temp.verifica((select round(venta_neta, 2) from retail.fn_rentabilidad('2026-09-18', 90, 0) where nivel = 'producto' and etiqueta = 'BL-01') = 336.00,
  'con IGV = 0 la venta neta es lo pagado (336): el IGV es un PARÁMETRO, no un número escrito adentro');

-- 2) UN COSTO EN CERO NO ES UN COSTO
select pg_temp.verifica((select unidades_sin_costo from r where nivel = 'producto' and etiqueta = 'FA-01') = 4
                        and (select venta_neta_con_costo from r where nivel = 'producto' and etiqueta = 'FA-01') = 0
                        and (select costo from r where nivel = 'producto' and etiqueta = 'FA-01') = 0,
  'FA-01 (costo 0): 4 unidades sin costo y CERO venta con costo: su margen no puede calcularse, no sale "100%"');
select pg_temp.verifica((select round(venta_neta, 2) from r where nivel = 'producto' and etiqueta = 'FA-01') = 338.98,
  'FA-01: su venta neta (338,98) sí cuenta como venta, aunque no como margen');
select pg_temp.verifica((select unidades_sin_costo from r where nivel = 'producto' and etiqueta = 'BL-01') = 0
                        and (select round(venta_neta_con_costo, 2) from r where nivel = 'producto' and etiqueta = 'BL-01') = 284.75
                        and (select costo from r where nivel = 'producto' and etiqueta = 'BL-01') = 120,
  'BL-01: todo con costo: venta con costo 284,75 y costo 120 (margen 164,75)');

-- 3) Unidades, descuento y devoluciones
select pg_temp.verifica((select unidades from r where nivel = 'producto' and etiqueta = 'BL-01') = 3
                        and (select unidades from r where nivel = 'producto' and etiqueta = 'PO-01') = 4,
  'unidades: BL-01 = 3; PO-01 = 4 (el último minuto de hoy entra, la venta de mañana a las 00:00 y la anulada NO)');
select pg_temp.verifica((select descuento from r where nivel = 'producto' and etiqueta = 'BL-01') = 18,
  'BL-01: 18 de descuento regalado (con IGV, sobre el precio de lista)');
select pg_temp.verifica((select unidades_devueltas from r where nivel = 'producto' and etiqueta = 'BL-01') = 1
                        and (select unidades_devueltas from r where nivel = 'producto' and etiqueta = 'PO-01') = 0,
  'devueltas: BL-01 = 1 (aprobada); PO-01 = 0 (la devolución pendiente NO cuenta)');
select pg_temp.verifica((select unidades from r where nivel = 'total') = 11, 'total: 11 unidades (la venta anterior a la ventana no entra)');

-- 4) STOCK: sin cuarentena, sin multiplicarse, y el inventario parado aparece
select pg_temp.verifica((select stock from r where nivel = 'producto' and etiqueta = 'BL-01') = 10,
  'BL-01: stock vendible 10 = 6 + 4 (las 2 en cuarentena NO cuentan; y no se multiplica por sus 3 ventas ni por sus 2 variantes)');
select pg_temp.verifica((select unidades from r where nivel = 'producto' and etiqueta = 'BL-02') = 0
                        and (select stock from r where nivel = 'producto' and etiqueta = 'BL-02') = 7,
  'BL-02: 7 en stock y 0 ventas aparece igual (inventario parado: justo lo que se busca)');
select pg_temp.verifica((select count(*) from r where etiqueta = 'PO-02') = 0, 'PO-02 (solo cuarentena y sin ventas) no aparece');
select pg_temp.verifica((select stock from r where nivel = 'producto' and etiqueta = 'FA-01') = 0, 'FA-01 sin stock: 0, no NULL');
select pg_temp.verifica((select stock from r where nivel = 'total') = 22, 'total: 22 unidades de stock vendible (10 + 5 + 7)');

-- 5) Las cuatro vistas suman lo mismo; el stock no se atribuye a un origen
select pg_temp.verifica((select count(distinct s) from (select sum(unidades) s from r where nivel <> 'total' group by nivel) x) = 1,
  'las cuatro vistas (producto, categoría, temporada, origen) suman las mismas 11 unidades');
select pg_temp.verifica((select count(*) from r where nivel = 'origen' and stock is not null) = 0,
  'en el nivel origen el stock viene NULL: un producto pudo surtirse de dos, no se inventa una atribución');
select pg_temp.verifica((select stock from r where nivel = 'categoria' and etiqueta = 'Blusas') = 17
                        and (select unidades from r where nivel = 'categoria' and etiqueta = 'Blusas') = 3,
  'categoría Blusas = BL-01 + BL-02: 3 unidades y 17 de stock');
select pg_temp.verifica((select stock from r where nivel = 'temporada' and etiqueta = 'Invierno') = 17
                        and (select unidades from r where nivel = 'temporada' and etiqueta = 'Sin temporada') = 4,
  'temporada Invierno = 17 de stock; el producto sin temporada aparece como "Sin temporada"');

-- 6) Origen
select pg_temp.verifica((select unidades from r where nivel = 'origen' and etiqueta = 'Proveedor A') = 3
                        and (select unidades from r where nivel = 'origen' and etiqueta = 'Taller') = 4
                        and (select unidades from r where nivel = 'origen' and etiqueta = 'Sin origen registrado') = 4,
  'origen: Proveedor A = 3 (BL-01), Taller = 4 (PO-01), Sin origen registrado = 4 (FA-01)');

-- 7) Total
select pg_temp.verifica((select round(venta_neta, 2) from r where nivel = 'total') = 823.73
                        and (select round(venta_neta_con_costo, 2) from r where nivel = 'total') = 484.75
                        and (select costo from r where nivel = 'total') = 200
                        and (select unidades_sin_costo from r where nivel = 'total') = 4,
  'total: venta neta 823,73; con costo 484,75; costo 200; 4 unidades sin costo');
select pg_temp.verifica((select unidades from retail.fn_rentabilidad('2026-01-10') where nivel = 'total') = 0
                        and (select venta_neta from retail.fn_rentabilidad('2026-01-10') where nivel = 'total') = 0,
  'una ventana sin ventas devuelve el total en 0, no NULL');

-- 8) Seguridad
select pg_temp.verifica(not has_function_privilege('authenticated', 'retail.fn_origen_producto(uuid,date)', 'execute')
                        and not has_function_privilege('anon', 'retail.fn_origen_producto(uuid,date)', 'execute'),
  'la función auxiliar NO es ejecutable por authenticated ni anon (aunque los permisos por defecto se lo darían)');
select pg_temp.verifica(has_function_privilege('authenticated', 'retail.fn_rentabilidad(date,integer,numeric)', 'execute')
                        and not has_function_privilege('anon', 'retail.fn_rentabilidad(date,integer,numeric)', 'execute'),
  'fn_rentabilidad: authenticated sí puede ejecutarla, anon no');
set test.lider = 'false';
do $$ begin
  perform * from retail.fn_rentabilidad('2026-09-18');
  raise exception 'FALLÓ: un no-líder pudo leer la rentabilidad';
exception when others then
  if sqlerrm not like 'Solo un líder%' then raise; end if;
  raise notice 'ok  un no-líder recibe "%"', sqlerrm;
end $$;
set test.lider = 'true';
do $$ begin
  perform * from retail.fn_rentabilidad('2026-09-18', 0);
  raise exception 'FALLÓ: aceptó p_dias = 0';
exception when others then
  if sqlerrm not like 'Parámetros fuera de rango%' then raise; end if;
  raise notice 'ok  rechaza una ventana de 0 días';
end $$;
do $$ begin
  perform * from retail.fn_rentabilidad('2026-09-18', 90, 1.5);
  raise exception 'FALLÓ: aceptó un IGV de 150%%';
exception when others then
  if sqlerrm not like 'Parámetros fuera de rango%' then raise; end if;
  raise notice 'ok  rechaza un IGV fuera de 0 a 1';
end $$;

\echo
\echo '=== TODAS LAS VERIFICACIONES PASARON ==='
