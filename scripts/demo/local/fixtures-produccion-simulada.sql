-- ============================================================================
-- scripts/demo/local/fixtures-produccion-simulada.sql
-- Datos de prueba que imitan la FORMA de producción (retail, cayla-dynamic) para
-- ensayar el generador de 90 días contra la base LOCAL, leyendo el archivo
-- directamente (sin pegarlo en el MCP). Es solo para el Postgres local: nunca en
-- producción. Los datos son inventados; la forma es la verificada el 2026-09-21:
--   · 4 ubicaciones (Tienda TRU/AQP/LIM con piso, almacén y cuarentena; Taller sin
--     sububicaciones), 9 líderes sin sede y 16 colaboradores (TRU 11, AQP 2, Taller 3);
--   · fechas de ingreso repartidas como en producción: al inicio de la ventana solo
--     3 de 9 líderes, 9 de 11 en TRU, 2 de 2 en AQP y 2 de 3 en el Taller;
--   · 72 proveedores (10 sin RUC, 1 inactivo) con 77 marcas (5 proveedores con 2).
-- Los catálogos (categorías, tallas, colores, tejidos) ya vienen del esquema local.
--
-- Uso (desde la raíz del repo; no deja nada: el generador termina en ROLLBACK):
--   cat scripts/demo/local/fixtures-produccion-simulada.sql scripts/demo/sembrar-90-dias.sql \
--     | tr -d '\r' | docker exec -i supabase_db_cayla-retail psql -U postgres -d postgres -v ON_ERROR_STOP=1
-- ============================================================================
begin;
set local search_path to retail, public, extensions;

-- Ubicaciones: el 'Taller' local previo tiene sububicaciones (el de producción no):
-- se aparta y se crea uno limpio.
update retail.ubicaciones set nombre = 'Taller (local previo)' where nombre = 'Taller';
-- ids fijos (como en producción): el generador arma los ids de lotes y movimientos con el de cada ubicación
insert into retail.ubicaciones (id, nombre, tipo)
select overlay(md5('fx:ubic:' || v.nombre) placing 'fe04' from 1 for 4)::uuid, v.nombre, v.tipo
from (values ('Tienda TRU', 'tienda'), ('Tienda AQP', 'tienda'), ('Tienda LIM', 'tienda'), ('Taller', 'taller')) v(nombre, tipo);

insert into retail.sububicaciones (id, ubicacion_id, nombre, tipo)
select overlay(md5('fx:sub:' || u.nombre || x.tipo) placing 'fe05' from 1 for 4)::uuid, u.id, x.nombre, x.tipo
from retail.ubicaciones u
cross join (values ('Piso de venta', 'piso_venta'), ('Almacén de tienda', 'almacen_tienda'), ('Cuarentena', 'cuarentena')) x(nombre, tipo)
where u.nombre in ('Tienda TRU', 'Tienda AQP', 'Tienda LIM');

-- En local `public.personas` es un stub de Dynamic sin `fecha_ingreso` (producción sí la trae).
-- El DDL también se revierte con el ROLLBACK del generador.
alter table public.personas add column if not exists fecha_ingreso date;

-- Personas: 9 líderes + 11 TRU + 2 AQP + 3 Taller
create temp table fx_personas (clave text, nombres text, ubicacion text, rol text, ingreso date) on commit drop;
insert into fx_personas (clave, nombres, ubicacion, rol, ingreso)
select 'L' || g, 'Líder ' || g, null, 'lider',
       (array['2026-01-15','2026-02-10','2026-03-05','2026-07-01','2026-07-20','2026-08-10','2026-09-03','2026-09-12','2026-09-12'])[g]::date
from generate_series(1, 9) g
union all
select 'T' || g, 'Colaboradora TRU ' || g, 'Tienda TRU', 'colaborador',
       case when g <= 9 then date '2026-02-01' + g else (array['2026-08-01','2026-09-03'])[g - 9]::date end
from generate_series(1, 11) g
union all
select 'A' || g, 'Colaboradora AQP ' || g, 'Tienda AQP', 'colaborador', date '2026-04-01' + g from generate_series(1, 2) g
union all
select 'W' || g, 'Colaborador Taller ' || g, 'Taller', 'colaborador',
       (array['2026-03-01','2026-05-01','2026-07-21'])[g]::date from generate_series(1, 3) g;

insert into public.personas (id, auth_user_id, nombres, apellidos, sede_base_id, rol, estado, fecha_ingreso)
select overlay(md5('fx:persona:' || p.clave) placing 'fe00' from 1 for 4)::uuid,
       overlay(md5('fx:auth:' || p.clave) placing 'fe01' from 1 for 4)::uuid,
       p.nombres, 'Demo', (select id from public.sedes order by id limit 1), 'integrante', 'activo', p.ingreso
from fx_personas p;

insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id)
select overlay(md5('fx:persona:' || p.clave) placing 'fe00' from 1 for 4)::uuid, p.rol,
       (select id from retail.ubicaciones where nombre = p.ubicacion)
from fx_personas p;

-- Proveedores 72 (10 sin RUC, el último inactivo), marcas 77, pareja marca-proveedor
insert into retail.proveedores (id, nombre, ruc, activo)
select overlay(md5('fx:prov:' || g) placing 'fe02' from 1 for 4)::uuid, 'Proveedor Demo ' || lpad(g::text, 2, '0'),
       case when g % 7 = 0 then null else '20' || lpad((100000 + g)::text, 9, '0') end,
       g <> 72
from generate_series(1, 72) g;

insert into retail.marcas (id, nombre)
select overlay(md5('fx:marca:' || g) placing 'fe03' from 1 for 4)::uuid, 'Marca Demo ' || lpad(g::text, 2, '0')
from generate_series(1, 77) g;

insert into retail.marca_proveedores (marca_id, proveedor_id)
select overlay(md5('fx:marca:' || g) placing 'fe03' from 1 for 4)::uuid,
       overlay(md5('fx:prov:' || (case when g <= 72 then g else g - 72 end)) placing 'fe02' from 1 for 4)::uuid
from generate_series(1, 77) g;

-- Series de comprobantes: como en producción, TRU y AQP tienen boleta+factura y LIM no tiene ninguna (hueco real, que
-- el generador no debe tapar).
insert into retail.series_comprobantes (ubicacion_id, tipo, serie, siguiente_numero)
select u.id, x.tipo, x.serie, 1
from retail.ubicaciones u
join (values ('Tienda TRU', 'boleta', 'B004'), ('Tienda TRU', 'factura', 'F004'),
             ('Tienda AQP', 'boleta', 'B005'), ('Tienda AQP', 'factura', 'F005')) x(nombre, tipo, serie)
  on x.nombre = u.nombre;

-- (la transacción sigue abierta: el generador que se concatena a continuación la cierra con ROLLBACK)
