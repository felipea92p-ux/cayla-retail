-- Plan de campaña: la historia de ventas de antes del ERP, desde Sinatra (ADR-0372, C2 · Felipe 2026-10-12).
--
-- EL PROBLEMA PRIMERO. El ERP vende desde el 30-09-2026: para planificar diciembre no sabe cuánto vendió ningún diciembre. Esa historia
-- existe, pero en los Excel «Sinatra» de Finanzas (2017–2026, uno por año): una hoja «Diario» con lo vendido cada día, en soles, por
-- tienda. No sabe de categorías, tallas ni unidades: solo soles por tienda y día. Eso, y nada más, es lo que se guarda aquí.
--
-- QUÉ CREA.
--   1. `retail.ventas_historicas (ubicacion_id, fecha, soles, fuente)`: un día de una tienda, una sola fila (PK). Estado imposible que
--      el esquema impide: dos cifras distintas para el mismo día de la misma tienda, un monto negativo o una fila sin saber de qué
--      archivo salió. NO se mezcla con `ventas`: una venta inventada sin prenda, sin pagos ni comprobante rompería caja y SUNAT.
--      RLS encendido y SIN políticas: solo se lee por la función de abajo; se carga una vez, a mano, con el script
--      `scripts/plan-compra/sinatra-a-sql.py` (los datos nunca pasan por el repo, que es público).
--   2. `fn_historial_ventas(desde, hasta)`: lo vendido por tienda, día a día dentro del rango y mes a mes de toda la historia. Para cada
--      tienda, ANTES de su primera venta en el ERP manda Sinatra y DESDE esa venta manda el ERP: una sola regla, así un día nunca se
--      cuenta dos veces aunque Sinatra siga llenándose después del arranque. Pide el módulo `plan_compra`.
--
-- SE ROMPE SI alguien corrige un día en el Excel después de la carga: la tabla es una foto. Por eso cada fila dice de qué archivo salió
-- y la carga es un `upsert` (recargar el mismo archivo pisa sus días).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: una tabla nueva y una función; sin políticas ni `drop trigger`
-- (ADR-0195). Idempotente. Los datos van aparte, con el SQL que arma el script.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create table if not exists retail.ventas_historicas (
  ubicacion_id uuid not null references retail.ubicaciones (id),
  fecha date not null,
  soles numeric(12, 2) not null check (soles >= 0),
  fuente text not null check (btrim(fuente) <> ''),
  cargado_en timestamptz not null default now(),
  primary key (ubicacion_id, fecha)
);

alter table retail.ventas_historicas enable row level security;
revoke all on table retail.ventas_historicas from public, anon, authenticated;

comment on table retail.ventas_historicas is
  'ADR-0372 (C2): lo vendido cada día en soles por tienda ANTES del ERP, cargado una vez desde los Excel Sinatra de Finanzas. Solo soles (Sinatra no sabe de categorías ni unidades). Se lee por fn_historial_ventas; no se mezcla con ventas.';
comment on column retail.ventas_historicas.fuente is
  'El archivo y la hoja de Sinatra de donde salió el día (p. ej. «SINATRA 2025.xlsm · Diario TRU»): para recargarlo si se corrige.';

create or replace function retail.fn_historial_ventas(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Ver el historial necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 1200 then
    raise exception 'El rango del historial no es válido (máximo 1200 días)' using hint = 'historial_rango';
  end if;

  return (
    with erp as (
      -- Lo vendido en el ERP por tienda y día (de Lima): ventas completadas, sin pruebas. Toda línea cuenta, también la bolsa y el monto
      -- manual: aquí se habla de plata vendida (ADR-0377: dinero y Ventas no preguntan por la familia).
      select v.ubicacion_id, (v.created_at at time zone 'America/Lima')::date as fecha, sum(vi.subtotal) as soles
        from retail.ventas v
        join retail.venta_items vi on vi.venta_id = v.id
       where v.estado = 'completada' and not v.es_prueba
       group by 1, 2
    ),
    arranque as (
      select e.ubicacion_id, min(e.fecha) as erp_desde from erp e group by 1
    ),
    dias as (
      select h.ubicacion_id, h.fecha, h.soles
        from retail.ventas_historicas h
        left join arranque a on a.ubicacion_id = h.ubicacion_id
       where a.erp_desde is null or h.fecha < a.erp_desde
      union all
      select e.ubicacion_id, e.fecha, e.soles from erp e
    )
    select jsonb_build_object(
      'hoy', retail.fn_hoy_lima(),
      'tiendas', coalesce((
        select jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre, 'erp_desde', a.erp_desde,
                                            'historia_desde', (select min(h.fecha) from retail.ventas_historicas h where h.ubicacion_id = u.id))
                         order by u.nombre)
          from retail.ubicaciones u
          left join arranque a on a.ubicacion_id = u.id
         where exists (select 1 from dias d where d.ubicacion_id = u.id)), '[]'::jsonb),
      'meses', coalesce((
        select jsonb_agg(jsonb_build_object('u', m.ubicacion_id, 'mes', m.mes, 'soles', m.soles, 'dias', m.dias) order by m.mes, m.ubicacion_id)
          from (select d.ubicacion_id, to_char(d.fecha, 'YYYY-MM') as mes, round(sum(d.soles), 2) as soles, count(*) as dias
                  from dias d group by 1, 2) m), '[]'::jsonb),
      'dias', coalesce((
        select jsonb_agg(jsonb_build_object('u', d.ubicacion_id, 'f', d.fecha, 's', round(d.soles, 2)) order by d.fecha, d.ubicacion_id)
          from dias d where d.fecha between p_desde and p_hasta), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function retail.fn_historial_ventas(date, date) from public, anon;
grant execute on function retail.fn_historial_ventas(date, date) to authenticated, service_role;
comment on function retail.fn_historial_ventas(date, date) is
  'ADR-0372 (C2): lo vendido por tienda, día a día en el rango (máx. 1200 días) y mes a mes de toda la historia. Antes de la primera venta de cada tienda en el ERP, Sinatra (ventas_historicas); desde ella, el ERP. Pide el módulo plan_compra.';
