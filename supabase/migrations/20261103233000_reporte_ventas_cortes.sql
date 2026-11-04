-- Ventas ▸ Reportes ▸ Ventas del mes: la tabla que se corta (Felipe, 2026-11-03; maqueta docs/maquetas/reportes-ventas-2026-11/).
--
-- `retail.fn_reporte_ventas_cortes(p_mes, p_ubicacion)` devuelve, en UN jsonb, lo mismo del mes cortado de dos formas:
--   · `tiendas`:    por tienda — vendido, ventas, prendas y devuelto, del tramo del mes y del tramo equivalente del anterior.
--   · `categorias`: por categoría — vendido y prendas, de los dos tramos.
-- Hermana de `fn_reporte_ventas_mes` (20261103230000) y de `fn_reporte_ventas_series` (20261103232000): MISMA regla de qué cuenta como venta
-- (completadas, sin pruebas, días de Lima), MISMO tramo, MISMA puerta (módulo `reportes_ventas`, 42501) y MISMA forma de ver (INVOKER: el líder
-- lee todas las tiendas y quien tiene el módulo, la suya). Por eso los cortes SUMAN lo que dicen las cifras de arriba: la prueba lo exige.
-- El tramo se calcula aquí con la misma cuenta que en `fn_reporte_ventas_mes` (tres funciones, una fórmula de seis renglones); la prueba compara
-- los totales de los cortes con los de esa función para varios meses, así que si una cambia sola, la prueba falla.
--
-- LA CATEGORÍA DE UNA LÍNEA. La del catálogo (`productos.categoria_id`); si la prenda no tiene (la «prenda sin registrar» del mostrador), la que se
-- DECLARÓ en caja al venderla (`prendas_por_regularizar.categoria_id`, una fila por línea: `venta_item_id` es único, así que la unión no duplica
-- nada). Es la misma regla que el Observatorio (20261022201000, ADR-0322). Sin ella, el 38 % de octubre de 2026 caía en «Sin categoría». Lo que
-- no tiene ni una ni otra va en «Sin categoría», y la bolsa de obsequio —una venta real— queda en su categoría «Bolsas».
-- «Devuelto» por tienda es el reembolso de las devoluciones aprobadas en el día de su aprobación, como en las cifras; por categoría no se
-- reparte (una devolución es de una venta, no de una línea).
-- Sin `security definer` ni `set search_path` (ver la cabecera de 20261103230000). Pegado en producción: un `create or replace function` y dos permisos.
set lock_timeout = '3s';

create or replace function retail.fn_reporte_ventas_cortes(p_mes date, p_ubicacion uuid default null)
returns jsonb
language plpgsql
stable
as $fn$
declare
  v_ini date;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_sig date;
  v_fin date;            -- fin (exclusivo) del tramo del mes pedido
  v_prev_ini date;
  v_prev_fin date;       -- fin (exclusivo) del tramo equivalente del mes anterior
  v_tiendas jsonb;
  v_categorias jsonb;
begin
  if p_mes is null then
    raise exception 'Falta el mes del reporte.' using errcode = '22023';
  end if;
  if not coalesce(retail.fn_ve_modulo('reportes_ventas'), false) then
    raise exception 'Tu rol no ve los Reportes de ventas.' using errcode = '42501';
  end if;

  v_ini := date_trunc('month', p_mes)::date;
  v_sig := (v_ini + interval '1 month')::date;
  v_fin := least(v_sig, v_hoy + 1);
  if v_fin < v_ini then v_fin := v_ini; end if;   -- mes futuro: tramo vacío
  v_prev_ini := (v_ini - interval '1 month')::date;
  v_prev_fin := least(v_prev_ini + (v_fin - v_ini), v_ini);

  -- UNA consulta: las líneas de venta de los dos tramos se arman una vez (`lin`) y de ellas salen los dos cortes.
  with ventanas(k, d, h) as (
    values ('actual', v_ini, v_fin), ('anterior', v_prev_ini, v_prev_fin)
  ),
  lin as (
    select w.k, vt.ubicacion_id, vt.id as venta_id, i.id as item_id, i.variante_id, i.cantidad, i.subtotal
    from ventanas w
    join retail.ventas vt
      on vt.created_at >= (w.d::timestamp at time zone 'America/Lima')
     and vt.created_at <  (w.h::timestamp at time zone 'America/Lima')
    join retail.venta_items i on i.venta_id = vt.id
    where vt.estado = 'completada' and not vt.es_prueba
      and (p_ubicacion is null or vt.ubicacion_id = p_ubicacion)
  ),
  -- Por tienda
  t_lin as (
    select k, ubicacion_id, sum(subtotal) as vendido, sum(cantidad) as unidades, count(distinct venta_id) as tickets
    from lin group by k, ubicacion_id
  ),
  t_dev as (
    select w.k, d.ubicacion_id, sum(d.reembolso_monto) as devuelto
    from ventanas w
    join retail.devoluciones d
      on coalesce(d.aprobado_en, d.created_at) >= (w.d::timestamp at time zone 'America/Lima')
     and coalesce(d.aprobado_en, d.created_at) <  (w.h::timestamp at time zone 'America/Lima')
    join retail.ventas vv on vv.id = d.venta_id
    where d.estado = 'aprobada' and not vv.es_prueba
      and (p_ubicacion is null or d.ubicacion_id = p_ubicacion)
    group by w.k, d.ubicacion_id
  ),
  tk as (select k, ubicacion_id from t_lin union select k, ubicacion_id from t_dev),
  tt as (
    select tk.k, tk.ubicacion_id,
           round(coalesce(l.vendido, 0), 2) as vendido,
           coalesce(l.tickets, 0) as tickets,
           coalesce(l.unidades, 0) as unidades,
           round(coalesce(d.devuelto, 0), 2) as devuelto
    from tk
    left join t_lin l on l.k = tk.k and l.ubicacion_id = tk.ubicacion_id
    left join t_dev d on d.k = tk.k and d.ubicacion_id = tk.ubicacion_id
  ),
  tiendas as (
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.nombre, 'actual', x.actual, 'anterior', x.anterior)
                              order by (x.actual ->> 'vendido')::numeric desc, x.nombre), '[]'::jsonb) as j
    from (
      select u.id, u.nombre,
             coalesce((select to_jsonb(r) - 'k' - 'ubicacion_id' from tt r where r.k = 'actual' and r.ubicacion_id = u.id),
                      '{"vendido":0,"tickets":0,"unidades":0,"devuelto":0}'::jsonb) as actual,
             coalesce((select to_jsonb(r) - 'k' - 'ubicacion_id' from tt r where r.k = 'anterior' and r.ubicacion_id = u.id),
                      '{"vendido":0,"tickets":0,"unidades":0,"devuelto":0}'::jsonb) as anterior
      from retail.ubicaciones u
      where u.id in (select ubicacion_id from tk)
    ) x
  ),
  -- Por categoría
  cat as (
    select l.k,
           coalesce(pr.categoria_id, pp.categoria_id) as categoria_id,
           sum(l.subtotal) as vendido,
           sum(l.cantidad) as unidades
    from lin l
    join retail.variantes va on va.id = l.variante_id
    join retail.productos pr on pr.id = va.producto_id
    left join retail.prendas_por_regularizar pp on pp.venta_item_id = l.item_id
    group by l.k, coalesce(pr.categoria_id, pp.categoria_id)
  ),
  ids as (select distinct categoria_id from cat),
  categorias as (
    select coalesce(jsonb_agg(jsonb_build_object('id', x.categoria_id, 'nombre', x.nombre, 'actual', x.actual, 'anterior', x.anterior)
                              order by (x.nombre = 'Sin categoría'), (x.actual ->> 'vendido')::numeric desc, x.nombre), '[]'::jsonb) as j
    from (
      select i.categoria_id, coalesce(c.nombre, 'Sin categoría') as nombre,
             coalesce((select jsonb_build_object('vendido', round(a.vendido, 2), 'unidades', a.unidades) from cat a where a.k = 'actual' and a.categoria_id is not distinct from i.categoria_id),
                      '{"vendido":0,"unidades":0}'::jsonb) as actual,
             coalesce((select jsonb_build_object('vendido', round(a.vendido, 2), 'unidades', a.unidades) from cat a where a.k = 'anterior' and a.categoria_id is not distinct from i.categoria_id),
                      '{"vendido":0,"unidades":0}'::jsonb) as anterior
      from ids i
      left join retail.categorias c on c.id = i.categoria_id
    ) x
  )
  select (select j from tiendas), (select j from categorias) into v_tiendas, v_categorias;

  return jsonb_build_object('mes', v_ini, 'hoy', v_hoy, 'tiendas', v_tiendas, 'categorias', v_categorias);
end
$fn$;

revoke all on function retail.fn_reporte_ventas_cortes(date, uuid) from public, anon;
grant execute on function retail.fn_reporte_ventas_cortes(date, uuid) to authenticated;

comment on function retail.fn_reporte_ventas_cortes(date, uuid) is
  'Ventas ▸ Reportes ▸ Ventas del mes: el mes cortado por tienda y por categoría, con el tramo equivalente del anterior. Invoker; exige el módulo reportes_ventas.';
