-- scripts/pruebas/_antes_0622.sql — los cuerpos de main ANTES de 20261107171000 (ADR-0622) de las tres funciones que las suites de CLAURE
-- y del Club vuelven a pegar con reemplazos anclados. Solo lo usa _deshacer_0622.mjs, dentro de una transacción que se deshace.
-- Generado con pg_get_functiondef desde una base con main al 2026-11-07; _deshacer_0622.mjs comprueba sus md5 contra el candado de la migración.

CREATE OR REPLACE FUNCTION retail.fn_observatorio(p_dias integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  v_ahora timestamp := now() at time zone 'America/Lima';
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_dias integer := greatest(8, least(coalesce(p_dias, 60), 120));
  v_ini timestamptz;
  v_res jsonb;
begin
  if not retail.fn_es_admin() then
    raise exception 'El Observatorio es solo de las cuentas Admin.' using errcode = '42501';
  end if;
  -- Desde la medianoche de Lima del primer día de la ventana (que siempre incluye el mismo día de la semana pasada).
  v_ini := (v_hoy - (v_dias - 1))::timestamp at time zone 'America/Lima';

  with tiendas as materialized (
    select u.id, u.nombre, u.hora_cierre
    from retail.ubicaciones u
    where u.tipo = 'tienda' and u.activo
  ),
  v as materialized (
    select ve.id,
           ve.ubicacion_id as u,
           ve.created_at at time zone 'America/Lima' as lima,
           coalesce(ve.asesora_id, ve.usuario_id) as quien,
           coalesce(sum(vi.subtotal) filter (where not o.es), 0) as s,
           coalesce(sum(vi.cantidad) filter (where not o.es), 0) as p
    from retail.ventas ve
    join tiendas t on t.id = ve.ubicacion_id
    left join retail.venta_items vi on vi.venta_id = ve.id
    -- ADR-0560 (6a): lo vendido de CLAURE no es de CAYLA.
    cross join lateral (select retail.fn_item_es_de_claure(vi.id, ve.ubicacion_id, ve.created_at) as es) o
    where ve.created_at >= v_ini
      and ve.estado = 'completada'
      and not coalesce(ve.es_prueba, false)
    group by ve.id
    having bool_or(not o.es)
  ),
  dias as (
    select (v_hoy - g)::date as f from generate_series(0, v_dias - 1) g
  ),
  por_dia as (
    select v.u, v.lima::date as f, sum(v.s) as s, count(*) as t, sum(v.p) as p
    from v
    group by 1, 2
  )
  select jsonb_build_object(
    'hoy', v_hoy,
    'ahora_min', extract(hour from v_ahora)::int * 60 + extract(minute from v_ahora)::int,
    'tiendas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id,
               'nombre', t.nombre,
               'cierre', to_char(t.hora_cierre, 'HH24:MI'),
               'caja', (
                 select jsonb_build_object(
                          'desde', extract(hour from c.abierta_en at time zone 'America/Lima')::int * 60
                                   + extract(minute from c.abierta_en at time zone 'America/Lima')::int,
                          'por', coalesce(pc.nombres, ''))
                 from retail.cajas c
                 left join public.personas pc on pc.id = c.abierta_por
                 where c.ubicacion_id = t.id and c.estado = 'abierta' and not coalesce(c.es_prueba, false)
                 order by c.abierta_en desc
                 limit 1),
               'turno', retail.fn_observatorio_turno(t.id)
             ) order by t.nombre)
      from tiendas t), '[]'::jsonb),
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'u', t.id, 'f', d.f,
               's', coalesce(x.s, 0), 't', coalesce(x.t, 0), 'p', coalesce(x.p, 0),
               'm', (select pc.meta from retail.fn_parametros_caja(t.id, d.f) pc)
             ) order by d.f, t.nombre)
      from tiendas t
      cross join dias d
      left join por_dia x on x.u = t.id and x.f = d.f), '[]'::jsonb),
    'hoy_ventas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'u', v.u,
               'min', extract(hour from v.lima)::int * 60 + extract(minute from v.lima)::int,
               's', v.s, 'p', v.p,
               'q', coalesce(nullif(trim(coalesce(pe.nombres, '') || ' ' || coalesce(split_part(pe.apellidos, ' ', 1), '')), ''), '—')
             ) order by v.lima)
      from v
      left join public.personas pe on pe.id = v.quien
      where v.lima::date = v_hoy), '[]'::jsonb),
    'semana_pasada', coalesce((
      select jsonb_agg(jsonb_build_object(
               'u', v.u,
               'min', extract(hour from v.lima)::int * 60 + extract(minute from v.lima)::int,
               's', v.s
             ) order by v.lima)
      from v
      where v.lima::date = v_hoy - 7), '[]'::jsonb)
  )
  into v_res;

  return v_res;
end;
$function$

;

CREATE OR REPLACE FUNCTION retail.fn_club_compras_netas(p_clienta_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(clienta_id uuid, venta_id uuid, ubicacion_id uuid, fecha timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
  select v.cliente_id, v.id, v.ubicacion_id, v.created_at
    from retail.ventas v
   where v.cliente_id is not null
     and (p_clienta_id is null or v.cliente_id = p_clienta_id)
     and v.estado = 'completada'
     and not v.es_prueba
     and not retail.fn_venta_devuelta_entera(v.id)
     -- ADR-0560 (6c): una compra solo de CLAURE no es compra de CAYLA (la mixta sí).
     and (not exists (select 1 from retail.venta_items vi where vi.venta_id = v.id and retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at))
          or exists (select 1 from retail.venta_items vi where vi.venta_id = v.id and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)));
$function$

;

CREATE OR REPLACE FUNCTION retail.fn_calidad(p_dia date DEFAULT NULL::date, p_dias integer DEFAULT 90, p_plazo_dias integer DEFAULT 15)
 RETURNS TABLE(nivel text, clave text, etiqueta text, unidades_vendidas integer, unidades_devueltas integer, devueltas_vendibles integer, devueltas_danadas integer, devueltas_a_proveedor integer, unidades_cambiadas integer, cohorte_desde date, cohorte_hasta date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
#variable_conflict use_column
declare
  v_dia date;
  v_hasta date;
  v_desde date;
  v_ts_desde timestamptz;
  v_ts_hasta timestamptz;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede ver la calidad de las ventas';
  end if;
  if p_dias < 1 or p_plazo_dias < 0 then
    raise exception 'Parámetros fuera de rango (p_dias >= 1, p_plazo_dias >= 0)';
  end if;

  v_dia := coalesce(p_dia, (now() at time zone 'America/Lima')::date);
  -- Primer día que YA NO entra (exclusivo): las ventas de ese día aún no cumplieron su plazo completo.
  v_hasta := v_dia - p_plazo_dias;
  v_desde := v_hasta - p_dias;
  v_ts_desde := v_desde::timestamp at time zone 'America/Lima';
  v_ts_hasta := v_hasta::timestamp at time zone 'America/Lima';

  return query
  with items as (
    select vi.id as item_id, vi.cantidad, va.producto_id, ta.valor as talla, p.categoria_id,
           o.tipo as origen_tipo, o.origen_id
    from ventas ve
    join venta_items vi on vi.venta_id = ve.id
    join variantes va on va.id = vi.variante_id
    join productos p on p.id = va.producto_id
    left join tallas ta on ta.id = va.talla_id
    left join lateral fn_origen_producto(p.id, (ve.created_at at time zone 'America/Lima')::date) o on true
    where ve.estado = 'completada'
      and ve.created_at >= v_ts_desde
      and ve.created_at <  v_ts_hasta
      -- ADR-0560 (6d): lo vendido de CLAURE no es de CAYLA (no viene de su producción).
      and not retail.fn_item_es_de_claure(vi.id, ve.ubicacion_id, ve.created_at)
  ),
  devuelto as (
    -- Una fila por línea de venta: cuánto volvió y en qué condición. Solo devoluciones APROBADAS.
    select di.venta_item_id,
           sum(di.cantidad) filter (where di.condicion = 'vendible') as vendibles,
           sum(di.cantidad) filter (where di.condicion in ('danada_reparacion', 'danada_donar')) as danadas,
           sum(di.cantidad) filter (where di.condicion = 'devolver_proveedor') as a_proveedor
    from devolucion_items di
    join devoluciones d on d.id = di.devolucion_id and d.estado = 'aprobada'
    group by di.venta_item_id
  ),
  cambiado as (
    select c.venta_item_id, sum(c.cantidad) as cantidad
    from cambios c
    group by c.venta_item_id
  ),
  base as (
    select it.item_id, it.cantidad, it.producto_id, it.talla, it.categoria_id, it.origen_tipo, it.origen_id,
           coalesce(dv.vendibles, 0) as vendibles,
           coalesce(dv.danadas, 0) as danadas,
           coalesce(dv.a_proveedor, 0) as a_proveedor,
           coalesce(cb.cantidad, 0) as cambiadas
    from items it
    left join devuelto dv on dv.venta_item_id = it.item_id
    left join cambiado cb on cb.venta_item_id = it.item_id
  )
  select
    case when grouping(b.producto_id) = 0 then 'producto'
         when grouping(b.talla) = 0 then 'talla'
         when grouping(b.origen_tipo) = 0 then 'origen'
         when grouping(b.categoria_id) = 0 then 'categoria'
         else 'total' end,
    case when grouping(b.producto_id) = 0 then b.producto_id::text
         when grouping(b.talla) = 0 then coalesce(b.talla, '')
         when grouping(b.origen_tipo) = 0 then coalesce(b.origen_tipo, 'sin') || ':' || coalesce(b.origen_id::text, '')
         when grouping(b.categoria_id) = 0 then coalesce(b.categoria_id::text, '')
         else '' end,
    case when grouping(b.producto_id) = 0 then (select pr.referencia from productos pr where pr.id = b.producto_id)
         when grouping(b.talla) = 0 then coalesce(b.talla, 'Sin talla')
         when grouping(b.origen_tipo) = 0 then
           case b.origen_tipo
             when 'proveedor' then coalesce((select pv.nombre from proveedores pv where pv.id = b.origen_id), 'Proveedor sin nombre')
             when 'taller' then 'Taller'
             else 'Sin origen registrado' end
         when grouping(b.categoria_id) = 0 then coalesce((select ca.nombre from categorias ca where ca.id = b.categoria_id), 'Sin categoría')
         else 'Total' end,
    -- coalesce: sobre CERO filas, el total `()` sigue devolviendo una fila y un SUM de nada es NULL, no 0.
    coalesce(sum(b.cantidad), 0)::integer,
    coalesce(sum(b.vendibles + b.danadas + b.a_proveedor), 0)::integer,
    coalesce(sum(b.vendibles), 0)::integer,
    coalesce(sum(b.danadas), 0)::integer,
    coalesce(sum(b.a_proveedor), 0)::integer,
    coalesce(sum(b.cambiadas), 0)::integer,
    v_desde,
    v_hasta - 1
  from base b
  group by grouping sets ((b.producto_id), (b.talla), (b.origen_tipo, b.origen_id), (b.categoria_id), ())
  order by 1, 4 desc, 3;
end;
$function$

;

