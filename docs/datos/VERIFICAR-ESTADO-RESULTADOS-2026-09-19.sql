-- VERIFICAR-ESTADO-RESULTADOS-2026-09-19.sql — SOLO LECTURA. Pégalo en el SQL Editor de PRODUCCIÓN (proyecto
-- cayla-dynamic, schema `retail`; ya lleva el prefijo) ANTES de aplicar las migraciones 20260918195000 / 196000 / 197000
-- del ADR-0120. No modifica nada: es un solo `select` con una fila por chequeo.
--
-- QUÉ RESPONDE:
--   (a) ¿existe todo lo que lee el diario? (columnas, tablas, funciones). Un «FALTA» aquí es un bloqueo.
--   (b) ¿cuántos datos de hoy harían que el Estado de Resultados avise algo? Un descuadre o un costo faltante NO
--       bloquea, pero es exactamente lo que la pantalla va a mostrar en rojo o en ámbar.
--   (c) ¿qué volumen hay de verdad? (reemplaza los supuestos del ADR-0109 y de la medición de rendimiento).
--
-- CÓMO LEERLO: la columna `veredicto` dice OK / FALTA / AVISO / INFO. Devuélveme la tabla completa.

select chequeo, valor, veredicto from (

  -- ===== (a) existencia =====
  select 1 as ord, 'ventas.anulado_en (fecha de la anulación)' as chequeo,
         exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'ventas' and column_name = 'anulado_en')::text as valor,
         case when exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'ventas' and column_name = 'anulado_en') then 'OK' else 'FALTA' end as veredicto
  union all
  select 2, 'tabla venta_anulacion_items', (to_regclass('retail.venta_anulacion_items') is not null)::text,
         case when to_regclass('retail.venta_anulacion_items') is not null then 'OK' else 'FALTA' end
  union all
  select 3, 'devoluciones.aprobado_en', exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'devoluciones' and column_name = 'aprobado_en')::text,
         case when exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'devoluciones' and column_name = 'aprobado_en') then 'OK' else 'FALTA' end
  union all
  select 4, 'cambios.metodo_pago_diferencia', exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'cambios' and column_name = 'metodo_pago_diferencia')::text,
         case when exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'cambios' and column_name = 'metodo_pago_diferencia') then 'OK' else 'FALTA' end
  union all
  select 5, 'costo_historial.costo_anterior', exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'costo_historial' and column_name = 'costo_anterior')::text,
         case when exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'costo_historial' and column_name = 'costo_anterior') then 'OK' else 'FALTA' end
  union all
  select 6, 'movimientos.motivo', exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'movimientos' and column_name = 'motivo')::text,
         case when exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'movimientos' and column_name = 'motivo') then 'OK' else 'FALTA' end
  union all
  select 7, 'tabla gastos (migración 20260918193000)', (to_regclass('retail.gastos') is not null)::text,
         case when to_regclass('retail.gastos') is not null then 'OK' else 'FALTA: aplicar primero la de gastos' end
  union all
  select 8, 'tabla categorias_gasto (migración 20260918193000)', (to_regclass('retail.categorias_gasto') is not null)::text,
         case when to_regclass('retail.categorias_gasto') is not null then 'OK' else 'FALTA: aplicar primero la de gastos' end
  union all
  select 9, 'función fn_hoy_lima()', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_hoy_lima')::text,
         case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_hoy_lima') then 'OK' else 'FALTA' end
  union all
  select 10, 'función fn_es_lider()', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_es_lider')::text,
         case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_es_lider') then 'OK' else 'FALTA' end
  union all
  select 11, 'las tablas nuevas NO existen todavía (cuentas, parametros_tributarios)',
         (to_regclass('retail.cuentas') is not null or to_regclass('retail.parametros_tributarios') is not null)::text,
         case when to_regclass('retail.cuentas') is null and to_regclass('retail.parametros_tributarios') is null then 'OK' else 'AVISO: ya existen, no repetir la migración' end

  -- ===== (b) datos que la pantalla va a avisar =====
  union all
  select 20, 'ventas cuyo cobro (venta_pagos) NO suma sus líneas — saldrían como «operación descuadrada» en rojo',
         (select count(*) from (
            select v.id from retail.ventas v
              join retail.venta_items vi on vi.venta_id = v.id
              left join (select venta_id, sum(monto) as pagado from retail.venta_pagos group by venta_id) p on p.venta_id = v.id
             group by v.id, p.pagado
            having round(sum(vi.subtotal), 2) <> round(coalesce(p.pagado, 0), 2)) x)::text,
         case when (select count(*) from (
            select v.id from retail.ventas v
              join retail.venta_items vi on vi.venta_id = v.id
              left join (select venta_id, sum(monto) as pagado from retail.venta_pagos group by venta_id) p on p.venta_id = v.id
             group by v.id, p.pagado
            having round(sum(vi.subtotal), 2) <> round(coalesce(p.pagado, 0), 2)) x) = 0 then 'OK' else 'AVISO: revisar antes de confiar en las cifras' end
  union all
  select 21, 'líneas de venta con costo 0 (sin contar «Monto manual») — el margen sale inflado en esa medida',
         (select count(*) from retail.venta_items where costo_unitario = 0 and variante_id <> '22222222-2222-4222-8222-222222222222')::text
           || ' de ' || (select count(*) from retail.venta_items)::text,
         case when (select count(*) from retail.venta_items where costo_unitario = 0 and variante_id <> '22222222-2222-4222-8222-222222222222') = 0 then 'OK' else 'AVISO: cargar costos' end
  union all
  select 22, 'ventas anuladas SIN filas en venta_anulacion_items (se asumen «vendible»)',
         (select count(*) from retail.ventas v where v.estado = 'anulada' and not exists (select 1 from retail.venta_anulacion_items ai where ai.venta_id = v.id))::text,
         case when (select count(*) from retail.ventas v where v.estado = 'anulada' and not exists (select 1 from retail.venta_anulacion_items ai where ai.venta_id = v.id)) = 0 then 'OK' else 'AVISO' end
  union all
  select 23, 'devoluciones aprobadas con reembolso_monto vacío (el diario no lo usa; solo informa)',
         (select count(*) from retail.devoluciones where estado = 'aprobada' and reembolso_monto is null)::text || ' de ' || (select count(*) from retail.devoluciones where estado = 'aprobada')::text,
         'INFO'
  union all
  select 24, 'movimientos de ajuste por motivo (debe verse «merma» y «conteo»)',
         coalesce((select string_agg(motivo || ': ' || n, ' · ' order by n desc) from (
            select coalesce(motivo, '(sin motivo)') as motivo, count(*) as n from retail.movimientos where tipo = 'ajuste' group by 1) t), '(ninguno)'),
         'INFO'
  union all
  select 25, 'ventas por estado', coalesce((select string_agg(estado || ': ' || n, ' · ') from (select estado, count(*) as n from retail.ventas group by 1) t), '(ninguna)'), 'INFO'

  -- ===== (c) volumen real =====
  union all
  select 30, 'volumen: ventas / líneas / movimientos / sedes activas',
         (select count(*) from retail.ventas)::text || ' / ' || (select count(*) from retail.venta_items)::text || ' / '
           || (select count(*) from retail.movimientos)::text || ' / ' || (select count(*) from retail.ubicaciones where activo)::text,
         'INFO'
  union all
  select 31, 'primera y última venta (fechas de Lima)',
         coalesce((select min((created_at at time zone 'America/Lima')::date)::text || ' → ' || max((created_at at time zone 'America/Lima')::date)::text from retail.ventas), '(ninguna)'),
         'INFO'

) c order by ord;
