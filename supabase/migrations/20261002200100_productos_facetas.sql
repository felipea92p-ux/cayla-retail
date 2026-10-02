-- ============================================================================
-- 20261002200100 — Productos: cuántas prendas hay en cada opción del filtro, y el rango real del precio
--                  (ADR-0308, tanda 2; decisiones de Felipe del 2026-10-02)
--
-- EL PROBLEMA
--   El 2026-10-02, en producción, 179 de las 284 opciones del filtro (63 %) llevaban a una lista vacía: 44 categorías
--   activas y 14 con prendas, 85 marcas y 24, 80 proveedores y 24, 75 colores y 43. Y el control de precio iba de S/ 0 a
--   S/ 999 con la prenda más cara a S/ 119. Felipe: esconder las opciones vacías, mostrar cuántas hay en cada una, y que el
--   precio salga de los datos con tramos que digan cuántas prendas tienen.
--
-- QUÉ AGREGA (una función NUEVA, de solo lectura: `fn_productos_facetas`)
--   Con los MISMOS parámetros de filtro que `fn_productos_listado` (20261002200000) devuelve un jsonb con:
--   · total: las prendas que calzan con todo (lo mismo que la lista).
--   · por cada filtro (categoria, marca, proveedor, color, familia, talla, temporada, estado, falta, disponibilidad):
--     { valor: cuántas }, contando con TODOS los demás filtros y SIN el suyo («conteo disyuntivo»). Si se contara con el
--     propio filtro, al elegir «Blusas» las otras categorías dirían 0 y no se podría cambiar de categoría sin limpiar.
--     Un valor que no aparece tiene 0: la pantalla lo esconde.
--   · precio: { min, max } (sin el propio filtro de precio: si no, el rango se encogería al moverlo) y tramos
--     [{ desde, hasta, n }] con cortes en los cuartiles del precio mínimo de cada prenda, redondeados a 10 (con 21 precios
--     distintos y 17 prendas a S/ 39,90, tramos de ancho fijo dejarían uno lleno y otro vacío; los cuartiles los
--     reparten). Cada `n` cuenta exactamente lo que trae ese tramo como filtro: el primero es «hasta», el último «desde».
--
-- POR QUÉ ASÍ (y no de otra forma)
--   · Lee `fn_productos_filtro`, la MISMA definición que la lista: un conteo nunca contradice a lo que sale al elegir.
--   · Una sola pasada por las variantes visibles (hoy 578; a 3 años 7 000–17 000): ~4 ms hoy. Lo caro es la disponibilidad
--     (el stock de la red, `fn_existencias_base`, ~340 ms a 3 000 productos): se calcula UNA vez para las prendas que
--     calzan con todo lo demás, no una por opción.
--   · No se agregó a `fn_productos_resumen`: cambiar lo que devuelve obliga a borrarla, y la web publicada la usa.
--
-- ORDEN DE PEGADO: después de 20261002200000 (lee `fn_productos_filtro`), y las dos ANTES de fusionar el PR de la tanda 2.
--   Solo crea funciones: sin `alter` de tablas en uso ni políticas (no hay riesgo de 40P01).
-- ============================================================================

set lock_timeout = '3s';

-- «¿Esta prenda pasa con esta disponibilidad?», escrito una vez. `m`: alguna variante cumple los demás filtros; `mh`: alguna
-- que cumple, además hay en la sede. Lo demás es de la prenda en la red. La misma regla que `fn_productos_listado`.
create or replace function retail.fn_productos_pasa_disponibilidad(
  p_disponibilidad text, m boolean, mh boolean, vendible boolean, red integer, stock_minimo integer, punto integer, demanda numeric
)
returns boolean
language sql
immutable
as $$
  select coalesce(m, false) and case p_disponibilidad
    when 'en_sede' then coalesce(mh, false)
    when 'sin_sede' then vendible and not coalesce(mh, false)
    when 'sin_red' then vendible and red = 0
    when 'bajo' then vendible and red > 0 and stock_minimo is not null and red < stock_minimo
    when 'reponer' then vendible and red <= punto and demanda > 0
    else true
  end;
$$;

create or replace function retail.fn_productos_facetas(
  p_busqueda text default null,
  p_categoria_id uuid default null,
  p_marca_id uuid default null,
  p_proveedor_id uuid default null,
  p_colores text[] default null,
  p_familias text[] default null,
  p_tallas uuid[] default null,
  p_temporada text default null,
  p_falta text default null,
  p_estado text default null,
  p_precio_min numeric default null,
  p_precio_max numeric default null,
  p_disponibilidad text default null,
  p_ubicacion_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
set plan_cache_mode = force_custom_plan
as $$
#variable_conflict use_column
declare
  v_salida jsonb;
begin
  if not retail.fn_tiene_acceso_retail() then
    raise exception 'Sin acceso al catálogo' using errcode = '42501';
  end if;
  if p_disponibilidad is not null and p_disponibilidad not in ('en_sede', 'sin_sede', 'sin_red', 'bajo', 'reponer') then
    raise exception 'Filtro de disponibilidad desconocido: %', p_disponibilidad;
  end if;
  if p_disponibilidad in ('en_sede', 'sin_sede') and p_ubicacion_id is null then
    raise exception 'Para filtrar por la sede hace falta la sede (p_ubicacion_id)';
  end if;

  with filas as (
    select * from retail.fn_productos_filtro(
      p_busqueda, p_categoria_id, p_marca_id, p_proveedor_id, p_colores, p_familias, p_tallas, p_temporada, p_falta,
      p_estado, p_precio_min, p_precio_max, p_disponibilidad, p_ubicacion_id, p_ubicacion_id is not null)
  ),
  -- Una marca por filtro que se «suelta»: `t_x` = todos los filtros salvo `x` (y salvo la disponibilidad, que se aplica
  -- aparte por prenda). `t` = todos.
  f as (
    select fi.*,
      (fi.f_busqueda and fi.f_categoria and fi.f_marca and fi.f_proveedor and fi.f_estado and fi.f_falta
        and fi.f_color and fi.f_talla and fi.f_precio and fi.f_temporada) as t,
      (fi.f_busqueda and fi.f_marca and fi.f_proveedor and fi.f_estado and fi.f_falta
        and fi.f_color and fi.f_talla and fi.f_precio and fi.f_temporada) as t_categoria,
      (fi.f_busqueda and fi.f_categoria and fi.f_proveedor and fi.f_estado and fi.f_falta
        and fi.f_color and fi.f_talla and fi.f_precio and fi.f_temporada) as t_marca,
      (fi.f_busqueda and fi.f_categoria and fi.f_marca and fi.f_estado and fi.f_falta
        and fi.f_color and fi.f_talla and fi.f_precio and fi.f_temporada) as t_proveedor,
      (fi.f_busqueda and fi.f_categoria and fi.f_marca and fi.f_proveedor and fi.f_falta
        and fi.f_color and fi.f_talla and fi.f_precio and fi.f_temporada) as t_estado,
      (fi.f_busqueda and fi.f_categoria and fi.f_marca and fi.f_proveedor and fi.f_estado
        and fi.f_color and fi.f_talla and fi.f_precio and fi.f_temporada) as t_falta,
      (fi.f_busqueda and fi.f_categoria and fi.f_marca and fi.f_proveedor and fi.f_estado and fi.f_falta
        and fi.f_talla and fi.f_precio and fi.f_temporada) as t_color,
      (fi.f_busqueda and fi.f_categoria and fi.f_marca and fi.f_proveedor and fi.f_estado and fi.f_falta
        and fi.f_color and fi.f_precio and fi.f_temporada) as t_talla,
      (fi.f_busqueda and fi.f_categoria and fi.f_marca and fi.f_proveedor and fi.f_estado and fi.f_falta
        and fi.f_color and fi.f_talla and fi.f_temporada) as t_precio,
      (fi.f_busqueda and fi.f_categoria and fi.f_marca and fi.f_proveedor and fi.f_estado and fi.f_falta
        and fi.f_color and fi.f_talla and fi.f_precio) as t_temporada
    from filas fi
  ),
  -- Las cifras de la RED, una vez (de ellas salen «sin stock en ninguna», «bajo» y «reponer»: la misma definición que
  -- `fn_productos_listado`). Para las prendas que calzan con todo; y si el filtro puesto es uno de la red, también para las
  -- que suma cualquier filtro «soltado» (sin ellas, el conteo de otra categoría con «sin stock en ninguna» saldría corto).
  candidatos as (
    select distinct f.producto_id from f
    where f.t
       or (p_disponibilidad in ('sin_red', 'bajo', 'reponer')
           and (f.t_categoria or f.t_marca or f.t_proveedor or f.t_estado or f.t_falta or f.t_color or f.t_talla
                or f.t_precio or f.t_temporada))
  ),
  red as (
    select e.producto_id, sum(e.disponible)::integer as cantidad
    from retail.fn_existencias_base(null, array(select c.producto_id from candidatos c)) e
    where not e.talla_retirada
    group by e.producto_id
  ),
  demanda as (
    select v2.producto_id, sum(m.cantidad)::numeric / 30 as diaria
    from retail.movimientos m
    join retail.variantes v2 on v2.id = m.variante_id
    where m.tipo = 'salida' and m.motivo = 'venta' and m.created_at >= now() - interval '30 days'
      and v2.producto_id in (select c.producto_id from candidatos c)
    group by v2.producto_id
  ),
  lead_time as (
    select v3.producto_id, avg(lo.fecha_recepcion::date - cm.fecha_emision)::numeric as dias
    from retail.movimientos m3
    join retail.variantes v3 on v3.id = m3.variante_id
    join retail.lotes lo on lo.id = m3.lote_id
    join retail.compra_items ci on ci.id = m3.compra_item_id
    join retail.compras cm on cm.id = ci.compra_id
    where m3.tipo = 'entrada' and m3.motivo = 'recepcion'
      and v3.producto_id in (select c.producto_id from candidatos c)
    group by v3.producto_id
  ),
  prenda as (
    -- Por prenda. La red vale 0 para una candidata sin stock en ninguna parte y null para las demás (no hacía falta).
    select fi.producto_id,
           bool_and(fi.estado = 'activo' and not fi.es_prueba) as vendible,
           max(fi.stock_minimo) as stock_minimo,
           coalesce(max(r.cantidad), case when bool_or(c.producto_id is not null) then 0 end) as red,
           ceil(coalesce(max(d.diaria), 0) * coalesce(max(lt.dias), 14))::integer + coalesce(max(fi.stock_minimo), 0) as punto,
           coalesce(max(d.diaria), 0) as demanda
    from f fi
    left join candidatos c on c.producto_id = fi.producto_id
    left join red r on r.producto_id = fi.producto_id
    left join demanda d on d.producto_id = fi.producto_id
    left join lead_time lt on lt.producto_id = fi.producto_id
    group by fi.producto_id
  ),
  -- Una fila por (prenda, opción) con «alguna variante cumple» (m) y «alguna que cumple hay en la sede» (mh).
  opciones as (
    select 'categoria' as faceta, coalesce(fi.categoria_id::text, 'sin') as valor, fi.producto_id,
           bool_or(fi.t_categoria) as m, bool_or(fi.t_categoria and fi.hay_en_sede) as mh
    from f fi group by 1, 2, 3
    union all
    select 'marca', coalesce(fi.marca_id::text, 'sin'), fi.producto_id, bool_or(fi.t_marca), bool_or(fi.t_marca and fi.hay_en_sede)
    from f fi group by 1, 2, 3
    union all
    select 'proveedor', coalesce(fi.proveedor_id::text, 'sin'), fi.producto_id, bool_or(fi.t_proveedor), bool_or(fi.t_proveedor and fi.hay_en_sede)
    from f fi group by 1, 2, 3
    union all
    select 'estado', fi.estado, fi.producto_id, bool_or(fi.t_estado), bool_or(fi.t_estado and fi.hay_en_sede)
    from f fi group by 1, 2, 3
    union all
    select 'color', fi.color_codigo, fi.producto_id, bool_or(fi.t_color), bool_or(fi.t_color and fi.hay_en_sede)
    from f fi where fi.color_codigo is not null group by 1, 2, 3
    union all
    select 'familia', fi.familia_color, fi.producto_id, bool_or(fi.t_color), bool_or(fi.t_color and fi.hay_en_sede)
    from f fi where fi.familia_color is not null group by 1, 2, 3
    union all
    select 'talla', fi.talla_id::text, fi.producto_id, bool_or(fi.t_talla), bool_or(fi.t_talla and fi.hay_en_sede)
    from f fi where fi.talla_id is not null group by 1, 2, 3
    union all
    select 'temporada', coalesce(fi.temporada, 'sin'), fi.producto_id, bool_or(fi.t_temporada), bool_or(fi.t_temporada and fi.hay_en_sede)
    from f fi group by 1, 2, 3
    union all
    -- Cada falta es su propia condición (una prenda puede faltarle foto Y marca: cuenta en las dos).
    select 'falta', x.falta, fi.producto_id, bool_or(fi.t_falta and x.cumple), bool_or(fi.t_falta and x.cumple and fi.hay_en_sede)
    from f fi
    cross join lateral (values
      ('foto', fi.sin_foto),
      ('temporada', fi.temporada is null),
      ('marca', fi.marca_id is null),
      ('proveedor', fi.proveedor_id is null)
    ) as x(falta, cumple)
    group by 1, 2, 3
  ),
  conteos as (
    select o.faceta, o.valor, count(*) as n
    from opciones o
    join prenda pr on pr.producto_id = o.producto_id
    where retail.fn_productos_pasa_disponibilidad(p_disponibilidad, o.m, o.mh, pr.vendible, pr.red, pr.stock_minimo, pr.punto, pr.demanda)
    group by o.faceta, o.valor
  ),
  -- La disponibilidad se cuenta con todos los demás filtros (t) y cada opción a su turno.
  por_prenda as (
    select fi.producto_id, bool_or(fi.t) as m, bool_or(fi.t and fi.hay_en_sede) as mh
    from f fi group by fi.producto_id
  ),
  disponibilidad as (
    select d.opcion, count(*) filter (
             where retail.fn_productos_pasa_disponibilidad(d.opcion, pp.m, pp.mh, pr.vendible, pr.red, pr.stock_minimo, pr.punto, pr.demanda)
           ) as n
    from (values ('en_sede'), ('sin_sede'), ('sin_red'), ('bajo'), ('reponer')) as d(opcion)
    cross join por_prenda pp
    join prenda pr on pr.producto_id = pp.producto_id
    -- Sin sede elegida, «hay / no hay en la sede» no se cuentan (no hay a qué sede mirar).
    where p_ubicacion_id is not null or d.opcion not in ('en_sede', 'sin_sede')
    group by d.opcion
  ),
  total as (
    select count(*) as n
    from por_prenda pp join prenda pr on pr.producto_id = pp.producto_id
    where retail.fn_productos_pasa_disponibilidad(p_disponibilidad, pp.m, pp.mh, pr.vendible, pr.red, pr.stock_minimo, pr.punto, pr.demanda)
  ),
  -- ── Precio: con todos los filtros menos el suyo ─────────────────────────────────────────────────────────────────────
  -- Las variantes que entran en el rango: cumplen lo demás, y con «hay en la sede» las que hay; con «sin stock en la sede»
  -- las que NO hay (en una prenda partida —una talla aquí, otra no—, la que no hay es la que la hace pasar con un precio).
  precio_filas as (
    select fi.producto_id, fi.precio, fi.hay_en_sede
    from f fi
    where fi.t_precio
      and (p_disponibilidad is distinct from 'en_sede' or fi.hay_en_sede)
      and (p_disponibilidad is distinct from 'sin_sede' or not fi.hay_en_sede)
  ),
  precio_prenda as (
    select fi.producto_id, bool_or(fi.t_precio) as m, bool_or(fi.t_precio and fi.hay_en_sede) as mh
    from f fi group by fi.producto_id
  ),
  precio_ok as (
    -- Prendas que pueden salir con ALGÚN rango de precio: las que pasan la disponibilidad sin mirar el precio; con «sin stock
    -- en la sede», basta que tengan una variante que cumple y no hay aquí (con el rango justo, esa sola la hace pasar).
    select pp.producto_id, min(pf.precio) as pmin, max(pf.precio) as pmax
    from precio_prenda pp
    join prenda pr on pr.producto_id = pp.producto_id
    join precio_filas pf on pf.producto_id = pp.producto_id
    where (p_disponibilidad = 'sin_sede' and pr.vendible)
       or (p_disponibilidad is distinct from 'sin_sede'
           and retail.fn_productos_pasa_disponibilidad(p_disponibilidad, pp.m, pp.mh, pr.vendible, pr.red, pr.stock_minimo, pr.punto, pr.demanda))
    group by pp.producto_id
  ),
  rango as (
    select min(pmin) as minimo, max(pmax) as maximo, count(*) as prendas,
           percentile_disc(array[0.25, 0.5, 0.75]) within group (order by pmin) as cuartiles
    from precio_ok
  ),
  cortes as (
    -- Los cuartiles redondeados a 10, sin repetir, estrictamente dentro del rango redondeado. Con menos de 4 prendas no
    -- hay tramos: con 3 prendas un «tramo» es una prenda, y la caja «Hasta» ya alcanza.
    select coalesce(array_agg(distinct c order by c), '{}'::numeric[]) as lista
    from rango r, unnest(r.cuartiles) as q, lateral (select round(q / 10) * 10 as c) x
    where r.prendas >= 4 and c > floor(r.minimo / 10) * 10 and c < ceil(r.maximo / 10) * 10
  ),
  tramos as (
    select i, case when i = 1 then null else co.lista[i - 1] end as desde,
              case when i = array_length(co.lista, 1) + 1 then null else co.lista[i] end as hasta
    from cortes co, generate_series(1, coalesce(array_length(co.lista, 1), 0) + 1) as i
    where coalesce(array_length(co.lista, 1), 0) > 0
  ),
  tramos_n as (
    -- Cada tramo decide la disponibilidad CON su rango (como lo hace la lista al elegirlo): alguna variante en el rango que
    -- cumple lo demás (m) y alguna de esas que hay en la sede (mh), y la misma regla de siempre.
    select x.i, x.desde, x.hasta, count(*) as n
    from (
      select t.i, t.desde, t.hasta, fi.producto_id,
             bool_or(fi.t_precio) as m, bool_or(fi.t_precio and fi.hay_en_sede) as mh
      from tramos t
      join f fi on (t.desde is null or fi.precio >= t.desde) and (t.hasta is null or fi.precio <= t.hasta)
      group by t.i, t.desde, t.hasta, fi.producto_id
    ) x
    join prenda pr on pr.producto_id = x.producto_id
    where retail.fn_productos_pasa_disponibilidad(p_disponibilidad, x.m, x.mh, pr.vendible, pr.red, pr.stock_minimo, pr.punto, pr.demanda)
    group by x.i, x.desde, x.hasta
  )
  select jsonb_build_object(
    'total', (select n from total),
    'facetas', coalesce((
      select jsonb_object_agg(x.faceta, x.valores) from (
        select c.faceta, jsonb_object_agg(c.valor, c.n) as valores from conteos c group by c.faceta
      ) x), '{}'::jsonb)
      || jsonb_build_object('disponibilidad', coalesce((select jsonb_object_agg(d.opcion, d.n) from disponibilidad d), '{}'::jsonb)),
    'precio', (select jsonb_build_object('min', r.minimo, 'max', r.maximo) from rango r),
    'tramos', coalesce((select jsonb_agg(jsonb_build_object('desde', tn.desde, 'hasta', tn.hasta, 'n', tn.n) order by tn.i) from tramos_n tn), '[]'::jsonb)
  )
  into v_salida;

  return v_salida;
end;
$$;

revoke all on function retail.fn_productos_pasa_disponibilidad(text, boolean, boolean, boolean, integer, integer, integer, numeric) from public, anon;
grant execute on function retail.fn_productos_pasa_disponibilidad(text, boolean, boolean, boolean, integer, integer, integer, numeric) to authenticated, service_role;
revoke all on function retail.fn_productos_facetas(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid) from public, anon;
grant execute on function retail.fn_productos_facetas(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid) to authenticated, service_role;

-- Verificación (solo lectura; debe devolver 2 filas):
--   select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'retail' and proname in ('fn_productos_facetas', 'fn_productos_pasa_disponibilidad');
