-- Ingresos por modelo: el VALOR de lo que entró (2026-11-11, Felipe: «Valor del ingreso en soles»).
--
-- EL PROBLEMA. La pestaña «Ingresos» de Movimientos decía el costo POR PRENDA de cada modelo (`costo_min` / `costo_max`), pero no
-- cuánta plata entró: con tallas de distinto costo, «S/ 27 – 28.25» por 12 prendas no se multiplica de cabeza, y el total del
-- período no estaba en ningún lado. Compras quiere ver el tamaño del fardo en soles.
--
-- QUÉ CAMBIA. Solo agrega dos datos, por modelo y en `totales`; todo lo demás de `20261029022000_ingresos_por_modelo.sql` queda igual:
--   · `costo_total`: la suma, variante por variante, de lo que entró × su costo (`variantes.costo`, el mismo que ya da `costo_min`).
--   · `prendas_sin_costo`: las prendas que entraron de variantes con costo 0 («sin costo cargado»). NO suman al valor —un 0 no es
--     un dato— y se cuentan aparte, para que la pantalla diga «sin costo en 4 prendas» en vez de un total que parece completo.
--     Si NINGUNA prenda del modelo tiene costo, `costo_total` es null (como `costo_min`), no 0.
--   · Los dos son dinero: SOLO para quien pasa `fn_puede_ver_dinero_de_compras()` (ADR-0183). Sin permiso, null.
--
-- Es el costo de HOY de cada variante, no el de la factura de ese día: igual que la columna «Costo» de la misma pantalla. Si el
-- costo de una prenda se corrige después, el valor de un ingreso viejo cambia con él. Es una lectura de compras, no contabilidad.
--
-- Solo lectura; `create or replace` con la misma firma (se puede pegar dos veces). No toma candados sobre tablas en uso.
-- Lo prueba `scripts/pruebas/ingresos_por_modelo.mjs` (casos VA1–VA4).

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.fn_ingresos_por_modelo(
  p_ubicacion_id uuid,
  p_desde date,
  p_hasta date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ini timestamptz;
  v_fin timestamptz;
  -- El costo por prenda es dinero: lo ve quien ve el dinero de compras, y la columna está cerrada para el resto (ADR-0183).
  v_ve_costo boolean := coalesce(retail.fn_puede_ver_dinero_de_compras(), false);
  v_resultado jsonb;
begin
  if p_ubicacion_id is null then
    raise exception 'Falta indicar la sede cuyos ingresos quieres ver' using errcode = 'P0001';
  end if;
  if not coalesce(retail.fn_ve_modulo('movimientos'), false) then
    raise exception 'Ver los ingresos necesita el módulo Movimientos en tu rol' using errcode = '42501';
  end if;
  if not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para ver los ingresos de esa sede' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas no es válido' using errcode = 'P0001';
  end if;
  if p_hasta - p_desde > 400 then
    raise exception 'Elige un período de hasta un año' using errcode = 'P0001';
  end if;
  -- La frontera es la medianoche DE LIMA, como el diario y Pérdidas.
  v_ini := (p_desde::timestamp at time zone 'America/Lima');
  v_fin := ((p_hasta + 1)::timestamp at time zone 'America/Lima');

  with e as (
    select va.producto_id, m.variante_id, m.motivo, m.cantidad, (m.created_at at time zone 'America/Lima')::date as dia
      from retail.movimientos m
      join retail.variantes va on va.id = m.variante_id
     where m.ubicacion_id = p_ubicacion_id
       and m.tipo = 'entrada'
       and m.motivo in ('carga_inicial', 'recepcion')
       and m.created_at >= v_ini
       and m.created_at < v_fin
  ),
  por_modelo as (
    select e.producto_id,
           sum(e.cantidad)::integer as unidades,
           coalesce(sum(e.cantidad) filter (where e.motivo = 'carga_inicial'), 0)::integer as de_stock_inicial,
           coalesce(sum(e.cantidad) filter (where e.motivo = 'recepcion'), 0)::integer as de_recepcion,
           min(e.dia) as primer_dia,
           max(e.dia) as ultimo_dia
      from e
     group by e.producto_id
  ),
  -- Lo que entró de cada color y talla: el detalle que se abre debajo de cada modelo.
  por_variante as (
    select e.producto_id, e.variante_id, sum(e.cantidad)::integer as unidades
      from e
     group by e.producto_id, e.variante_id
  ),
  -- El valor de lo que entró: unidades × costo de cada variante. Un costo en 0 es «sin costo cargado»: no suma, se cuenta aparte.
  valor as (
    select pv.producto_id,
           case when v_ve_costo then sum(pv.unidades * va.costo) filter (where va.costo > 0) end as costo_total,
           case when v_ve_costo then coalesce(sum(pv.unidades) filter (where coalesce(va.costo, 0) <= 0), 0)::integer end as prendas_sin_costo
      from por_variante pv
      join retail.variantes va on va.id = pv.variante_id
     group by pv.producto_id
  ),
  -- Precio y costo de las variantes que entraron (no de todas las del modelo): lo que se está recibiendo.
  vars as (
    select distinct e.producto_id, e.variante_id from e
  ),
  valores as (
    select v.producto_id,
           min(retail.fn_precio_en_sede(v.variante_id, p_ubicacion_id)) as precio_min,
           max(retail.fn_precio_en_sede(v.variante_id, p_ubicacion_id)) as precio_max,
           case when v_ve_costo then min(va.costo) filter (where va.costo > 0) end as costo_min,
           case when v_ve_costo then max(va.costo) filter (where va.costo > 0) end as costo_max
      from vars v
      join retail.variantes va on va.id = v.variante_id
     group by v.producto_id
  ),
  lista as (
    select pm.*, pr.referencia, pr.codigo, ca.nombre as categoria,
           va.precio_min, va.precio_max, va.costo_min, va.costo_max,
           vl.costo_total, vl.prendas_sin_costo,
           -- «Nuevo»: ningún ingreso antes del rango, en ninguna sede. Un traslado anulado o un ajuste no son un ingreso.
           not exists (
             select 1
               from retail.movimientos m2
               join retail.variantes v2 on v2.id = m2.variante_id
              where v2.producto_id = pm.producto_id
                and m2.tipo = 'entrada'
                and m2.motivo in ('carga_inicial', 'recepcion')
                and m2.created_at < v_ini
           ) as es_nuevo
      from por_modelo pm
      join retail.productos pr on pr.id = pm.producto_id
      left join retail.categorias ca on ca.id = pr.categoria_id
      left join valores va on va.producto_id = pm.producto_id
      left join valor vl on vl.producto_id = pm.producto_id
  )
  select jsonb_build_object(
           'desde', p_desde,
           'hasta', p_hasta,
           've_costo', v_ve_costo,
           'modelos', coalesce((
             select jsonb_agg(
                      jsonb_build_object(
                        'producto_id', l.producto_id,
                        'referencia', l.referencia,
                        'codigo', l.codigo,
                        'categoria', l.categoria,
                        'unidades', l.unidades,
                        'de_stock_inicial', l.de_stock_inicial,
                        'de_recepcion', l.de_recepcion,
                        'primer_dia', l.primer_dia,
                        'ultimo_dia', l.ultimo_dia,
                        'variantes', coalesce((
                          select jsonb_agg(
                                   jsonb_build_object(
                                     'variante_id', pv.variante_id,
                                     'color', co.nombre,
                                     'color_hex', co.hex,
                                     'talla', ta.valor,
                                     'unidades', pv.unidades
                                   )
                                   order by co.nombre, ta.valor, pv.variante_id
                                 )
                            from por_variante pv
                            join retail.variantes vv on vv.id = pv.variante_id
                            left join retail.colores co on co.codigo = vv.color_codigo
                            left join retail.tallas ta on ta.id = vv.talla_id
                           where pv.producto_id = l.producto_id
                        ), '[]'::jsonb),
                        'es_nuevo', l.es_nuevo,
                        'precio_min', l.precio_min,
                        'precio_max', l.precio_max,
                        'costo_min', l.costo_min,
                        'costo_max', l.costo_max,
                        'costo_total', l.costo_total,
                        'prendas_sin_costo', l.prendas_sin_costo
                      )
                      order by l.unidades desc, l.referencia, l.producto_id
                    )
               from lista l
           ), '[]'::jsonb),
           'totales', jsonb_build_object(
             'modelos', (select count(*) from lista),
             'unidades', coalesce((select sum(unidades) from lista), 0),
             'de_stock_inicial', coalesce((select sum(de_stock_inicial) from lista), 0),
             'de_recepcion', coalesce((select sum(de_recepcion) from lista), 0),
             'nuevos', (select count(*) from lista where es_nuevo),
             -- Dinero: null sin permiso, y null si ninguna prenda del período tiene costo.
             'costo_total', case when v_ve_costo then (select sum(costo_total) from lista) end,
             'prendas_sin_costo', case when v_ve_costo then coalesce((select sum(prendas_sin_costo) from lista), 0) end
           )
         )
    into v_resultado;

  return v_resultado;
end;
$$;

comment on function retail.fn_ingresos_por_modelo(uuid, date, date) is
  'Qué prendas entraron a una sede entre dos fechas (hora de Lima), una línea por modelo: stock inicial y mercadería recibida, sumados. Solo lectura; no resta ajustes posteriores. Pestaña «Ingresos» de Movimientos.';

revoke all on function retail.fn_ingresos_por_modelo(uuid, date, date) from public, anon;
grant execute on function retail.fn_ingresos_por_modelo(uuid, date, date) to authenticated;
