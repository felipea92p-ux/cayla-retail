-- ============================================================================
-- 20260918231300 — Productos se filtra y se busca por marca y proveedor
--
-- Felipe (2026-09-18): la marca tiene que verse y usarse en Productos ("filtro
-- y tarjeta"), y poder buscarse. Tres funciones de lectura cambian:
--
--   fn_productos          + p_marca_id, p_proveedor_id (filtros) y 4 columnas de
--                           salida al FINAL (marca_id, marca_nombre,
--                           proveedor_id, proveedor_nombre) para la tarjeta.
--   fn_productos_resumen  + los mismos dos filtros (los contadores de arriba
--                           tienen que contar lo mismo que la grilla).
--   fn_productos_buscar   la búsqueda por texto ahora también reconoce el
--                           nombre de la marca y del proveedor: "adidas" trae
--                           sus prendas.
--
-- ES UNA REESCRITURA DE FUNCIONES DE LECTURA QUE YA FUNCIONAN, así que se hizo
-- sobre la copia EXACTA de producción del 2026-09-18 y se probó que, SIN los
-- filtros nuevos, devuelven las mismas filas y los mismos números que hoy
-- (prueba de regresión contra la versión anterior).
--
-- COMPATIBILIDAD: los parámetros nuevos van al final con default; cambiar las
-- columnas de salida obliga a borrar y recrear (Postgres no permite cambiar el
-- RETURNS TABLE con CREATE OR REPLACE), así que se borra la firma vieja antes.
-- El código de la pantalla lee las columnas por NOMBRE, no por posición.
--
-- DESCARTÉ filtrar en el navegador: Productos pagina en la base (24 por
-- página); filtrar después de paginar mostraría páginas a medias.
-- SE ROMPE SI la base crece a decenas de miles de productos: los `left join` de
-- marca y proveedor son a tablas de decenas de filas, no cambian el orden de
-- magnitud de la consulta.
-- ============================================================================

drop function if exists retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer, text);
drop function if exists retail.fn_productos_resumen(text, uuid, text, text, numeric, numeric);

CREATE OR REPLACE FUNCTION retail.fn_productos_buscar(p_busqueda text)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
  select coalesce(array_agg(distinct p.id), '{}'::uuid[])
  from retail.productos p
  join retail.variantes v on v.producto_id = p.id
  left join retail.marcas mc on mc.id = p.marca_id
  left join retail.proveedores pv on pv.id = p.proveedor_id
  where p.referencia ilike '%' || p_busqueda || '%'
     or p.codigo ilike '%' || p_busqueda || '%'
     or v.sku ilike '%' || p_busqueda || '%'
     or v.codigo ilike '%' || p_busqueda || '%'
     or mc.nombre ilike '%' || p_busqueda || '%'
     or pv.nombre ilike '%' || p_busqueda || '%'
     or exists (
       select 1 from retail.codigos_barras cb
       where cb.variante_id = v.id and lower(cb.codigo) = lower(p_busqueda)
     );
$function$;

CREATE OR REPLACE FUNCTION retail.fn_productos(p_busqueda text DEFAULT NULL::text, p_categoria_id uuid DEFAULT NULL::uuid, p_color_codigo text DEFAULT NULL::text, p_estado text DEFAULT NULL::text, p_precio_min numeric DEFAULT NULL::numeric, p_precio_max numeric DEFAULT NULL::numeric, p_stock text DEFAULT NULL::text, p_pagina integer DEFAULT 1, p_por_pagina integer DEFAULT 24, p_orden text DEFAULT NULL::text, p_marca_id uuid DEFAULT NULL::uuid, p_proveedor_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_productos bigint, producto_id uuid, referencia text, codigo text, categoria_id uuid, categoria_nombre text, estado text, stock_minimo integer, stock_total integer, demanda_diaria numeric, lead_time_dias numeric, punto_reorden integer, reponer_de_proveedor boolean, variante_id uuid, variante_codigo text, sku text, talla text, color_codigo text, color_nombre text, color_hex text, foto_url text, precio numeric, costo numeric, activo boolean, codigos_barras text[], marca_id uuid, marca_nombre text, proveedor_id uuid, proveedor_nombre text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  c_cargo_especial constant uuid := '11111111-1111-4111-8111-111111111111';
  v_busqueda text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_productos uuid[];
  v_pagina integer := greatest(1, coalesce(p_pagina, 1));
  v_por_pagina integer := greatest(1, least(coalesce(p_por_pagina, 24), 100));
begin
  if p_estado is not null and p_estado not in ('activo', 'descontinuado') then
    raise exception 'Estado de producto desconocido: %', p_estado;
  end if;
  if p_stock is not null and p_stock not in ('sin_stock', 'bajo', 'reponer') then
    raise exception 'Filtro de stock desconocido: %', p_stock;
  end if;
  if p_orden is not null and p_orden not in ('precio_asc', 'precio_desc') then
    raise exception 'Orden de catálogo desconocido: %', p_orden;
  end if;

  if v_busqueda is not null then
    v_productos := fn_productos_buscar(v_busqueda);
    if coalesce(array_length(v_productos, 1), 0) = 0 then return; end if;
  end if;

  return query
  with agregado as (
    select
      p.id,
      p.referencia,
      p.codigo,
      p.categoria_id,
      c.nombre as categoria_nombre,
      p.estado,
      p.stock_minimo,
      p.marca_id,
      mc.nombre as marca_nombre,
      p.proveedor_id,
      pv.nombre as proveedor_nombre,
      coalesce(sum(s.cantidad), 0)::integer as stock_total,
      min(v.precio) as precio_min,
      bool_or(p_color_codigo is null or v.color_codigo = p_color_codigo) as color_ok,
      bool_or(
        (p_precio_min is null or v.precio >= p_precio_min)
        and (p_precio_max is null or v.precio <= p_precio_max)
      ) as precio_ok,
      coalesce(max(vd.demanda_diaria), 0) as demanda_diaria,
      coalesce(max(lt.lead_time_dias), 14) as lead_time_dias
    from productos p
    left join categorias c on c.id = p.categoria_id
    left join marcas mc on mc.id = p.marca_id
    left join proveedores pv on pv.id = p.proveedor_id
    join variantes v on v.producto_id = p.id
    left join stock s on s.variante_id = v.id
    left join lateral (
      select sum(m.cantidad)::numeric / 30 as demanda_diaria
      from movimientos m
      join variantes v2 on v2.id = m.variante_id
      where v2.producto_id = p.id
        and m.tipo = 'salida' and m.motivo = 'venta'
        and m.created_at >= now() - interval '30 days'
    ) vd on true
    left join lateral (
      select avg(lo.fecha_recepcion::date - cm.fecha_emision)::numeric as lead_time_dias
      from movimientos m3
      join variantes v3 on v3.id = m3.variante_id
      join lotes lo on lo.id = m3.lote_id
      join compra_items ci on ci.id = m3.compra_item_id
      join compras cm on cm.id = ci.compra_id
      where v3.producto_id = p.id
        and m3.tipo = 'entrada' and m3.motivo = 'recepcion'
    ) lt on true
    where p.id <> c_cargo_especial
      and (v_productos is null or p.id = any(v_productos))
      and (p_categoria_id is null or p.categoria_id = p_categoria_id)
      and (p_estado is null or p.estado = p_estado)
      and (p_marca_id is null or p.marca_id = p_marca_id)
      and (p_proveedor_id is null or p.proveedor_id = p_proveedor_id)
    group by p.id, p.referencia, p.codigo, p.categoria_id, c.nombre, p.estado, p.stock_minimo, p.marca_id, mc.nombre, p.proveedor_id, pv.nombre
  ),
  con_reorden as (
    select
      agregado.*,
      ceil(agregado.demanda_diaria * agregado.lead_time_dias)::integer + coalesce(agregado.stock_minimo, 0) as punto_reorden
    from agregado
  ),
  filtrado as (
    select con_reorden.*,
      (con_reorden.stock_total <= con_reorden.punto_reorden and con_reorden.demanda_diaria > 0) as reponer_de_proveedor
    from con_reorden
    where con_reorden.color_ok
      and con_reorden.precio_ok
      and (
        p_stock is null
        or (p_stock = 'sin_stock' and con_reorden.stock_total = 0)
        or (p_stock = 'bajo' and con_reorden.stock_minimo is not null and con_reorden.stock_total < con_reorden.stock_minimo)
        or (p_stock = 'reponer' and con_reorden.stock_total <= con_reorden.punto_reorden and con_reorden.demanda_diaria > 0)
      )
  ),
  pagina as (
    select f.*, count(*) over ()::bigint as total
    from filtrado f
    order by
      case when p_orden = 'precio_asc' then f.precio_min end asc,
      case when p_orden = 'precio_desc' then f.precio_min end desc,
      f.referencia, f.id
    limit v_por_pagina offset (v_pagina - 1) * v_por_pagina
  )
  select
    pg.total,
    pg.id,
    pg.referencia,
    pg.codigo,
    pg.categoria_id,
    pg.categoria_nombre,
    pg.estado,
    pg.stock_minimo,
    pg.stock_total,
    pg.demanda_diaria,
    pg.lead_time_dias,
    pg.punto_reorden,
    pg.reponer_de_proveedor,
    v.id,
    v.codigo,
    v.sku,
    ta.valor,
    v.color_codigo,
    co.nombre,
    co.hex,
    foto.url,
    v.precio,
    v.costo,
    v.activo,
    coalesce(cb.codigos, '{}'::text[]),
    pg.marca_id,
    pg.marca_nombre,
    pg.proveedor_id,
    pg.proveedor_nombre
  from pagina pg
  join variantes v on v.producto_id = pg.id
  left join tallas ta on ta.id = v.talla_id
  left join colores co on co.codigo = v.color_codigo
  left join lateral (
    select pf.url
    from producto_fotos pf
    where pf.producto_id = pg.id
      and pf.color_codigo is not distinct from v.color_codigo
    order by pf.orden
    limit 1
  ) foto on true
  left join lateral (
    select array_agg(cb2.codigo order by cb2.codigo) as codigos
    from codigos_barras cb2 where cb2.variante_id = v.id
  ) cb on true
  order by
    case when p_orden = 'precio_asc' then pg.precio_min end asc,
    case when p_orden = 'precio_desc' then pg.precio_min end desc,
    pg.referencia, pg.id, ta.valor, v.color_codigo;
end;
$function$;

CREATE OR REPLACE FUNCTION retail.fn_productos_resumen(p_busqueda text DEFAULT NULL::text, p_categoria_id uuid DEFAULT NULL::uuid, p_color_codigo text DEFAULT NULL::text, p_estado text DEFAULT NULL::text, p_precio_min numeric DEFAULT NULL::numeric, p_precio_max numeric DEFAULT NULL::numeric, p_marca_id uuid DEFAULT NULL::uuid, p_proveedor_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_productos bigint, total_variantes bigint, stock_bajo bigint, sin_stock bigint, reponer_de_proveedor bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  c_cargo_especial constant uuid := '11111111-1111-4111-8111-111111111111';
  v_busqueda text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_productos uuid[];
begin
  if p_estado is not null and p_estado not in ('activo', 'descontinuado') then
    raise exception 'Estado de producto desconocido: %', p_estado;
  end if;

  if v_busqueda is not null then
    v_productos := fn_productos_buscar(v_busqueda);
    if coalesce(array_length(v_productos, 1), 0) = 0 then
      return query select 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint;
      return;
    end if;
  end if;

  return query
  with agregado as (
    select
      p.id,
      p.stock_minimo,
      count(v.id)::bigint as num_variantes,
      coalesce(sum(s.cantidad), 0)::integer as stock_total,
      bool_or(p_color_codigo is null or v.color_codigo = p_color_codigo) as color_ok,
      bool_or(
        (p_precio_min is null or v.precio >= p_precio_min)
        and (p_precio_max is null or v.precio <= p_precio_max)
      ) as precio_ok,
      coalesce(max(vd.demanda_diaria), 0) as demanda_diaria,
      coalesce(max(lt.lead_time_dias), 14) as lead_time_dias
    from productos p
    join variantes v on v.producto_id = p.id
    left join stock s on s.variante_id = v.id
    left join lateral (
      select sum(m.cantidad)::numeric / 30 as demanda_diaria
      from movimientos m
      join variantes v2 on v2.id = m.variante_id
      where v2.producto_id = p.id
        and m.tipo = 'salida' and m.motivo = 'venta'
        and m.created_at >= now() - interval '30 days'
    ) vd on true
    left join lateral (
      select avg(lo.fecha_recepcion::date - cm.fecha_emision)::numeric as lead_time_dias
      from movimientos m3
      join variantes v3 on v3.id = m3.variante_id
      join lotes lo on lo.id = m3.lote_id
      join compra_items ci on ci.id = m3.compra_item_id
      join compras cm on cm.id = ci.compra_id
      where v3.producto_id = p.id
        and m3.tipo = 'entrada' and m3.motivo = 'recepcion'
    ) lt on true
    where p.id <> c_cargo_especial
      and (v_productos is null or p.id = any(v_productos))
      and (p_categoria_id is null or p.categoria_id = p_categoria_id)
      and (p_estado is null or p.estado = p_estado)
      and (p_marca_id is null or p.marca_id = p_marca_id)
      and (p_proveedor_id is null or p.proveedor_id = p_proveedor_id)
    group by p.id, p.stock_minimo
  ),
  filtrado as (
    select *,
      ceil(demanda_diaria * lead_time_dias)::integer + coalesce(stock_minimo, 0) as punto_reorden
    from agregado where color_ok and precio_ok
  )
  select
    count(*)::bigint,
    coalesce(sum(num_variantes), 0)::bigint,
    count(*) filter (where stock_minimo is not null and stock_total < stock_minimo)::bigint,
    count(*) filter (where stock_total = 0)::bigint,
    count(*) filter (where stock_total <= punto_reorden and demanda_diaria > 0)::bigint
  from filtrado;
end;
$function$;

-- Recrear una función borra sus grants: se restablece el cierre a anon/public que tenían las versiones anteriores
-- (en producción lo tapa un privilegio por defecto, en una base nueva no).
revoke execute on function retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer, text, uuid, uuid) from public, anon;
revoke execute on function retail.fn_productos_resumen(text, uuid, text, text, numeric, numeric, uuid, uuid) from public, anon;
grant execute on function retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer, text, uuid, uuid) to authenticated;
grant execute on function retail.fn_productos_resumen(text, uuid, text, text, numeric, numeric, uuid, uuid) to authenticated;
