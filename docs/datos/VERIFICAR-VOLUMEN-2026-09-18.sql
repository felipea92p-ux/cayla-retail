-- VERIFICAR-VOLUMEN-2026-09-18.sql — SOLO LECTURA. No modifica nada.
--
-- PARA QUÉ: ADR-0109 (cómo se arman los estados financieros) necesita el ORDEN DE MAGNITUD
-- real: cuántas filas de dinero hay hoy y cuántas habrá en 3 años. Sin número no hay decisión
-- de rendimiento, hay superstición. Hoy el ADR usa supuestos declarados (ticket de S/100, 1,8
-- líneas por ticket); esta consulta los reemplaza por datos de producción.
--
-- CÓMO SE USA: pegar en el SQL Editor de producción (proyecto de Dynamic, schema `retail`) y
-- devolver la tabla completa. Devuelve dos columnas: dato / valor.

with t as (
  select v.id, v.ubicacion_id, v.created_at::date as dia, v.estado,
         coalesce(sum((i.precio_unitario - coalesce(i.descuento_unitario, 0)) * i.cantidad), 0) as monto,
         count(i.id) as lineas
  from retail.ventas v left join retail.venta_items i on i.venta_id = v.id
  group by v.id
)
select dato, valor from (
  select 1 as o, 'ventas (todas)' as dato, count(*)::text as valor from t
  union all select 2, 'ventas completadas', count(*) filter (where estado = 'completada')::text from t
  union all select 3, 'primera / última venta', coalesce(min(dia)::text, '-') || ' / ' || coalesce(max(dia)::text, '-') from t
  union all select 4, 'monto vendido (S/, con IGV, completadas)',
         coalesce(round(sum(monto) filter (where estado = 'completada'), 2)::text, '0') from t
  union all select 5, 'ticket promedio (S/)',
         coalesce(round(avg(monto) filter (where estado = 'completada'), 2)::text, '-') from t
  union all select 6, 'líneas por ticket (promedio)',
         coalesce(round(avg(lineas) filter (where estado = 'completada'), 2)::text, '-') from t
  union all select 7, 'máximo de tickets en un día en una sola sede',
         coalesce((select max(n) from (select count(*) as n from t group by ubicacion_id, dia) x)::text, '0')
  union all select 10, 'filas: venta_items',      count(*)::text from retail.venta_items
  union all select 11, 'filas: venta_pagos',      count(*)::text from retail.venta_pagos
  union all select 12, 'filas: movimientos',      count(*)::text from retail.movimientos
  union all select 13, 'filas: compras',          count(*)::text from retail.compras
  union all select 14, 'filas: compra_pagos',     count(*)::text from retail.compra_pagos
  union all select 15, 'filas: caja_movimientos', count(*)::text from retail.caja_movimientos
  union all select 16, 'filas: comprobantes',     count(*)::text from retail.comprobantes
  union all select 17, 'filas: activos_fijos',    count(*)::text from retail.activos_fijos
  union all select 18, 'filas: prendas_danadas',  count(*)::text from retail.prendas_danadas
  union all select 19, 'filas: variantes',        count(*)::text from retail.variantes
) r
order by o;
