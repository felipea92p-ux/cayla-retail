-- ============================================================================
-- Proveedores: facturado por mes, últimos 12 meses (ADR-0122, spike visual 2026-09-19)
--
-- EL PROBLEMA. «Facturado 12 m» es un solo número: no dice si el proveedor viene subiendo,
-- cayendo o si compraste todo en un mes. La lista y la vista rápida de Proveedores ahora
-- dibujan esa forma (mini-tendencia por fila y barras por mes) y necesitan el dato mes a mes.
--
-- LO QUE SE AGREGA (solo lectura; no cambia ninguna tabla ni ninguna función existente):
--   · fn_proveedores_serie_12m(): una fila por (proveedor, mes) con lo facturado ese mes.
--     Devuelve solo los meses CON compras; quien pinta rellena con ceros los demás (así la
--     función no fabrica filas vacías para cada proveedor × 12 meses).
--
-- POR QUÉ UNA FUNCIÓN APARTE y no una columna más en fn_proveedores(). fn_proveedores() ya
-- tiene 23 columnas que la app lee por nombre y se reescribió tres veces; agregarle un arreglo
-- por proveedor la haría más pesada para quien solo pide el directorio. Una función chica y
-- aparte no puede romper la lista: si no existe (producción aún sin esta migración) la pantalla
-- pinta igual, sin tendencias.
--
-- Criterios (los mismos que fn_proveedores): `estado <> 'anulada'`; lo financiero es solo de
-- líder (sin filas si no lo es); «hoy» es fn_hoy_lima(), nunca current_date. La ventana son los
-- 12 meses de calendario que terminan en el mes actual (mes actual + 11 anteriores) — por eso la
-- suma no coincide al sol con facturado_12m (que cuenta 365 días corridos): son dos cortes
-- distintos del mismo dato y la pantalla rotula cada uno con su nombre.
-- ============================================================================
set search_path = retail, public, extensions;

create function retail.fn_proveedores_serie_12m()
returns table(proveedor_id uuid, mes date, monto numeric)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
  select c.proveedor_id,
         date_trunc('month', c.fecha_emision)::date as mes,
         sum(c.total) as monto
    from retail.compras c
   where retail.fn_es_lider()
     and c.estado <> 'anulada'
     and c.proveedor_id is not null
     and c.fecha_emision >= (date_trunc('month', retail.fn_hoy_lima()) - interval '11 months')::date
   group by c.proveedor_id, date_trunc('month', c.fecha_emision)
$$;

revoke all on function retail.fn_proveedores_serie_12m() from public, anon;
grant execute on function retail.fn_proveedores_serie_12m() to authenticated;

comment on function retail.fn_proveedores_serie_12m() is
  'Lo facturado por proveedor y mes, últimos 12 meses de calendario (solo meses con compras). Solo líder. ADR-0122.';
