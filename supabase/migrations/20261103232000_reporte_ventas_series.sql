-- Ventas ▸ Reportes ▸ Ventas del mes: las series de los gráficos (Felipe, 2026-11-03; maqueta docs/maquetas/reportes-ventas-2026-11/).
--
-- `retail.fn_reporte_ventas_series(p_mes, p_ubicacion)` devuelve, en UN jsonb, lo que dibujan los tres gráficos de «Ventas del mes»:
--   · `dias`:  una fila por día del tramo del mes (los días sin ventas valen 0, no faltan): lo vendido y las ventas de cada día.
--   · `pagos`: lo cobrado por cada medio de pago en ese tramo, del que más al que menos.
--   · `meses`: lo vendido en cada mes de una ventana de hasta 12 meses (solo los meses con ventas); el mes en curso, a la fecha.
-- Es hermana de `fn_reporte_ventas_mes` (20261103230000): MISMA regla de qué cuenta como venta (completadas, sin pruebas, días de Lima),
-- MISMO tramo (el mes entero, o hasta hoy si está en curso), MISMA puerta (módulo `reportes_ventas`, 42501) y MISMA forma de ver (INVOKER: el
-- líder lee todas las tiendas y quien tiene el módulo, la suya, por las reglas de fila de siempre). Por eso las cifras de las tarjetas y los
-- gráficos suman lo mismo.
--
-- LA VENTANA DE MESES. Los 12 meses que terminan en el mes de hoy; si el mes pedido es más viejo que eso, los 12 que empiezan en él (sin pasar de
-- hoy), así el mes que se mira siempre sale en el gráfico. Un mes sin ventas no se devuelve: antes de que el ERP vendiera no hay barras en cero.
-- «Cobrado» sale de `venta_pagos` (incluye el anticipo de apartados y el redondeo, que puede valer 0): la web no dibuja los medios en cero.
-- Sin `security definer` ni `set search_path` (ver la cabecera de 20261103230000). Pegado en producción: un `create or replace function` y dos permisos.
set lock_timeout = '3s';

create or replace function retail.fn_reporte_ventas_series(p_mes date, p_ubicacion uuid default null)
returns jsonb
language plpgsql
stable
as $fn$
declare
  v_ini date;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_mes_hoy date;
  v_sig date;
  v_fin date;            -- fin (exclusivo) del tramo del mes pedido
  v_ult_mes date;        -- primer día del ÚLTIMO mes de la ventana de meses
  v_pri_mes date;        -- primer día del PRIMER mes de la ventana de meses
  v_dias jsonb;
  v_pagos jsonb;
  v_meses jsonb;
begin
  if p_mes is null then
    raise exception 'Falta el mes del reporte.' using errcode = '22023';
  end if;
  if not coalesce(retail.fn_ve_modulo('reportes_ventas'), false) then
    raise exception 'Tu rol no ve los Reportes de ventas.' using errcode = '42501';
  end if;

  v_ini := date_trunc('month', p_mes)::date;
  v_mes_hoy := date_trunc('month', v_hoy)::date;
  v_sig := (v_ini + interval '1 month')::date;
  v_fin := least(v_sig, v_hoy + 1);
  if v_fin < v_ini then v_fin := v_ini; end if;   -- mes futuro: tramo vacío

  -- Los días del tramo, con ceros donde no hubo ventas
  select coalesce(jsonb_agg(jsonb_build_object('fecha', d.dia, 'vendido', coalesce(x.vendido, 0), 'tickets', coalesce(x.tickets, 0)) order by d.dia), '[]'::jsonb)
  into v_dias
  from (select g::date as dia from generate_series(v_ini, v_fin - 1, interval '1 day') g) d
  left join (
    select (vt.created_at at time zone 'America/Lima')::date as dia,
           round(sum(i.subtotal), 2) as vendido,
           count(distinct vt.id) as tickets
    from retail.ventas vt
    join retail.venta_items i on i.venta_id = vt.id
    where vt.estado = 'completada' and not vt.es_prueba
      and vt.created_at >= (v_ini::timestamp at time zone 'America/Lima')
      and vt.created_at <  (v_fin::timestamp at time zone 'America/Lima')
      and (p_ubicacion is null or vt.ubicacion_id = p_ubicacion)
    group by 1
  ) x on x.dia = d.dia;

  -- Cómo se pagó
  select coalesce(jsonb_agg(jsonb_build_object('metodo', t.metodo, 'monto', t.monto) order by t.monto desc, t.metodo), '[]'::jsonb)
  into v_pagos
  from (
    select p.metodo, round(sum(p.monto), 2) as monto
    from retail.ventas vt
    join retail.venta_pagos p on p.venta_id = vt.id
    where vt.estado = 'completada' and not vt.es_prueba
      and vt.created_at >= (v_ini::timestamp at time zone 'America/Lima')
      and vt.created_at <  (v_fin::timestamp at time zone 'America/Lima')
      and (p_ubicacion is null or vt.ubicacion_id = p_ubicacion)
    group by p.metodo
  ) t;

  -- Mes a mes: la ventana de 12 meses que contiene al mes pedido
  v_ult_mes := case when v_ini > (v_mes_hoy - interval '12 months')::date then v_mes_hoy
                    else least((v_ini + interval '11 months')::date, v_mes_hoy) end;
  v_pri_mes := (v_ult_mes - interval '11 months')::date;
  select coalesce(jsonb_agg(jsonb_build_object('mes', m.mes, 'vendido', m.vendido, 'tickets', m.tickets, 'en_curso', m.mes = v_mes_hoy) order by m.mes), '[]'::jsonb)
  into v_meses
  from (
    select date_trunc('month', vt.created_at at time zone 'America/Lima')::date as mes,
           round(sum(i.subtotal), 2) as vendido,
           count(distinct vt.id) as tickets
    from retail.ventas vt
    join retail.venta_items i on i.venta_id = vt.id
    where vt.estado = 'completada' and not vt.es_prueba
      and vt.created_at >= (v_pri_mes::timestamp at time zone 'America/Lima')
      and vt.created_at <  ((v_ult_mes + interval '1 month')::date::timestamp at time zone 'America/Lima')
      and (p_ubicacion is null or vt.ubicacion_id = p_ubicacion)
    group by 1
  ) m;

  return jsonb_build_object('mes', v_ini, 'hoy', v_hoy, 'dias', v_dias, 'pagos', v_pagos, 'meses', v_meses);
end
$fn$;

revoke all on function retail.fn_reporte_ventas_series(date, uuid) from public, anon;
grant execute on function retail.fn_reporte_ventas_series(date, uuid) to authenticated;

comment on function retail.fn_reporte_ventas_series(date, uuid) is
  'Ventas ▸ Reportes ▸ Ventas del mes: ventas por día, cobrado por medio de pago y mes a mes (ventana de 12 meses). Invoker; exige el módulo reportes_ventas.';
