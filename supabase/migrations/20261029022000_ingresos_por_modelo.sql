-- Ingresos por modelo (2026-10-29): «qué prendas entraron» en una sede entre dos fechas, UNA línea por modelo.
--
-- EL PROBLEMA. Cuando llega un fardo, la persona de compras le pide a la colaboradora de almacén saber qué prendas
-- entraron — por modelo, sin colores ni tallas. Movimientos no responde esa pregunta: su libro tiene una fila por
-- operación y por color y talla, y no suma por modelo. Se filtraba «Stock inicial» desde el día que llegó el fardo hasta
-- hoy y salían decenas de filas sueltas.
--
-- QUÉ HACE. Suma, por modelo (productos), lo que ENTRÓ a la sede en el rango: el stock inicial (`carga_inicial`, lo que
-- se carga en Nuevo producto) y la mercadería recibida (`recepcion`, Llegó mercadería). Nada más: ni traslados, ni
-- ajustes, ni anulaciones de venta. Es la misma lectura que Movimientos filtrado por esos dos procesos, sumada por modelo.
--
-- POR CADA MODELO TAMBIÉN DICE:
--   · `es_nuevo`: el modelo no tenía NINGÚN ingreso (stock inicial o mercadería recibida, en cualquier sede) antes del rango.
--     Un modelo que ya había entrado antes y vuelve a recibir stock es un «Reingreso».
--   · `precio_min` / `precio_max`: lo que se cobra en ESA sede (`fn_precio_en_sede`: el precio propio de la tienda y, sin él, el
--     de la grilla) por las variantes que entraron. Un solo precio si todas valen lo mismo; un rango si varían por talla.
--   · `costo_min` / `costo_max`: lo que costó, SOLO para quien pasa `fn_puede_ver_dinero_de_compras()` (ADR-0183: la columna
--     `variantes.costo` está cerrada para el resto). Sin permiso es `null` y `ve_costo` es false: nunca un 0, que parece un
--     dato. Un costo en 0 es «sin costo cargado» (el valor de fábrica): no entra al rango, y si ninguna variante tiene costo
--     el modelo sale con `null` y la pantalla dice «Sin costo».
--
-- QUÉ NO HACE. Escribir. Es una lectura: no toca `movimientos` ni `stock` (principio 4: el libro es la única verdad).
-- Tampoco RESTA lo que se ajustó después: cuenta lo que entró, no lo que quedó; la pantalla lo dice en una nota.
--
-- PERMISOS (los mismos de Pérdidas, ADR-0328 act. 14): quien ve el módulo Movimientos y opera la sede. Es la pestaña
-- «Ingresos» de Movimientos, no un módulo aparte (ADR-0306). La frontera de cada día es la medianoche DE LIMA.
--
-- Se puede pegar dos veces: `create or replace`. No toma candados sobre tablas en uso.

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
                        'es_nuevo', l.es_nuevo,
                        'precio_min', l.precio_min,
                        'precio_max', l.precio_max,
                        'costo_min', l.costo_min,
                        'costo_max', l.costo_max
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
             'nuevos', (select count(*) from lista where es_nuevo)
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
