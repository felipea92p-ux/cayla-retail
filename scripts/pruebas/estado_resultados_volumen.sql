-- ============================================================================
-- MEDICIÓN de volumen del Estado de Resultados (ADR-0109 lo dejó pendiente: "se mide en la tarea 4 con
-- datos simulados antes de dar el estado por bueno"). NO es una prueba de corrección (eso es
-- estado_resultados_aislado.sql): mide cuánto tarda leer un mes cuando hay TRES AÑOS de historia.
--
-- Volumen simulado (las proporciones del propio ADR-0109, no datos reales):
--   ≈ 51 mil tickets · 1,8 líneas por ticket · 1 pago por ticket · 5 % anulados · 3 % con devolución ·
--   1 % con cambio · ≈ 100 mil movimientos de inventario (2 % mermas) · ≈ 150 gastos al mes.
--
-- Se corre con `node scripts/pruebas/estado_resultados_volumen.mjs` (Postgres efímero).
-- ============================================================================
\i scripts/pruebas/estado_resultados_preludio.sql
select setseed(0.42);

insert into retail.ubicaciones (id, nombre, tipo) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'TRU', 'tienda'), ('aaaaaaaa-0000-4000-8000-000000000002', 'AQP', 'tienda'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'LIM', 'tienda'), ('aaaaaaaa-0000-4000-8000-000000000004', 'Taller', 'taller');

-- 200 variantes, 60 % con costo, con una subida de costo a mitad del período en un tercio de ellas
insert into retail.variantes (id, costo)
  select gen_random_uuid(), case when random() < 0.6 then round((20 + random() * 60)::numeric, 2) else 0 end from generate_series(1, 200);
insert into retail.costo_historial (variante_id, costo_anterior, costo_resultante, created_at)
  select id, costo * 0.9, costo, timestamptz '2025-06-01 12:00:00-05' + (random() * interval '200 days') from retail.variantes where costo > 0 and random() < 0.33;
create temp table vs as select id, row_number() over () as n from retail.variantes;
create temp table ub as select id, row_number() over (order by nombre) as n from retail.ubicaciones where tipo = 'tienda';

-- 51 000 tickets repartidos en 3 años (2023-10-01 → 2026-09-30) entre las 3 tiendas
insert into retail.ventas (id, ubicacion_id, estado, anulado_en, created_at)
  select gen_random_uuid(), (select id from ub where n = 1 + (g % 3)),
         case when random() < 0.05 then 'anulada' else 'completada' end, null,
         timestamptz '2023-10-01 09:00:00-05' + (random() * interval '1095 days')
    from generate_series(1, 51000) g;
update retail.ventas set anulado_en = created_at + interval '2 days' where estado = 'anulada';

-- 1 a 3 líneas por ticket (media ≈ 1,8)
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
  select x.id, (select vs.id from vs where vs.n = x.k), 1 + floor(random() * 2)::int,
         round((60 + random() * 140)::numeric, 2), 0,
         case when random() < 0.7 then round((20 + random() * 60)::numeric, 2) else 0 end
    from (select v.id, 1 + floor(random() * 200)::int as k, case when random() < 0.45 then 1 when random() < 0.8 then 2 else 3 end as nl from retail.ventas v) x,
         lateral generate_series(1, x.nl) l;
insert into retail.venta_pagos (venta_id, metodo, monto)
  select vt.venta_id, (array['efectivo', 'tarjeta', 'yape', 'plin', 'transferencia'])[1 + floor(random() * 5)::int], vt.tot
    from (select venta_id, sum(subtotal) as tot from retail.venta_items group by venta_id) vt;
insert into retail.venta_anulacion_items (venta_id, venta_item_id, condicion)
  select vi.venta_id, vi.id, (array['vendible', 'vendible', 'danada_donar'])[1 + floor(random() * 3)::int]
    from retail.venta_items vi join retail.ventas v on v.id = vi.venta_id where v.estado = 'anulada';

-- 3 % de tickets con devolución aprobada; 1 % con cambio
insert into retail.devoluciones (venta_id, estado, reembolso_metodo, aprobado_en)
  select id, 'aprobada', 'efectivo', created_at + interval '3 days' from retail.ventas where estado = 'completada' and random() < 0.03;
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad)
  select d.id, (select vi.id from retail.venta_items vi where vi.venta_id = d.venta_id limit 1), 1 from retail.devoluciones d;
insert into retail.cambios (venta_item_id, variante_nueva_id, cantidad, diferencia, metodo_pago_diferencia, created_at)
  select x.id, (select vs.id from vs where vs.n = x.k), 1, 10, 'efectivo', x.created_at + interval '1 day'
    from (select vi.id, v.created_at, 1 + floor(random() * 200)::int as k
            from retail.venta_items vi join retail.ventas v on v.id = vi.venta_id
           where v.estado = 'completada' and random() < 0.01) x;

-- ≈ 100 000 movimientos de inventario; 2 % son mermas
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
  select (select vs.id from vs where vs.n = x.k), (select ub.id from ub where ub.n = 1 + (x.g % 3)),
         case when r < 0.02 then 'ajuste' when r < 0.6 then 'entrada' else 'salida' end,
         case when r < 0.02 then -1 else 1 + floor(random() * 3)::int end,
         case when r < 0.01 then 'merma' when r < 0.02 then 'conteo' else 'venta' end,
         timestamptz '2023-10-01 09:00:00-05' + (random() * interval '1095 days')
    from (select g, random() as r, 1 + floor(random() * 200)::int as k from generate_series(1, 100000) g) x;

-- ≈ 150 gastos al mes
insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago)
  select case when random() < 0.2 then null else (select id from ub where n = 1 + (g % 3)) end,
         (array['alquileres', 'servicios_basicos'])[1 + (g % 2)], 'gasto simulado',
         date '2023-10-01' + floor(random() * 1095)::int, round((50 + random() * 900)::numeric, 2), 0, 'transferencia'
    from generate_series(1, 5400) g;

analyze;
select 'filas: ventas=' || (select count(*) from retail.ventas) || ' líneas=' || (select count(*) from retail.venta_items)
    || ' movimientos=' || (select count(*) from retail.movimientos) || ' gastos=' || (select count(*) from retail.gastos) as volumen;

\timing on
\echo '--- SIN índices por fecha (como está producción hoy) ---'
\echo 'Estado de Resultados de UN mes (sept-2026):'
select ventas_netas, margen_bruto from retail.fn_estado_resultados('2026-09-15') where es_consolidado;
\echo 'Diario de UN mes (líneas):'
select count(*) from retail.fn_asientos('2026-09-01', '2026-09-30');
\echo 'Diario de TRES AÑOS (líneas):'
select count(*) from retail.fn_asientos('2023-10-01', '2026-09-30');

create index ventas_created_at_idx on retail.ventas (created_at);
create index movimientos_created_at_idx on retail.movimientos (created_at);
create index devoluciones_aprobado_en_idx on retail.devoluciones (aprobado_en) where estado = 'aprobada';
create index cambios_created_at_idx on retail.cambios (created_at);
create index ventas_anulado_en_idx on retail.ventas (anulado_en) where estado = 'anulada';
create index gastos_fecha_idx on retail.gastos (fecha);
create index venta_items_venta_idx on retail.venta_items (venta_id);
create index venta_pagos_venta_idx on retail.venta_pagos (venta_id);
analyze;

\echo '--- CON índices por fecha ---'
\echo 'Estado de Resultados de UN mes:'
select ventas_netas, margen_bruto from retail.fn_estado_resultados('2026-09-15') where es_consolidado;
\echo 'Diario de UN mes (líneas):'
select count(*) from retail.fn_asientos('2026-09-01', '2026-09-30');
\echo 'Estado de Resultados de UN mes viejo (feb-2025):'
select ventas_netas, margen_bruto from retail.fn_estado_resultados('2025-02-10') where es_consolidado;
