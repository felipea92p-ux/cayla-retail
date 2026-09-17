-- ============================================================================
-- 20260916100000_punto_reorden.sql — CAYLA V2
--
-- "Cuándo reponer stock del proveedor", elegida por Felipe entre las piezas
-- inspiradas en NetSuite. El dato real de tiempo de entrega (fecha de pedido
-- → fecha de llegada) se borró a propósito en el corte a V2
-- (`20260912231956_compras_desde_factura.sql:72-74`, tabla `ordenes_compra`).
-- Felipe eligió el proxy con lo que hay hoy: factura→recepción, imperfecto
-- pero sin inventar ningún flujo nuevo.
--
-- Se integra sobre `fn_productos`/`fn_productos_resumen`
-- (20260915160000_productos_listado_filtros.sql), no como función aparte:
-- ya agregan `stock_total` por producto (sumado en todas las sedes) y ya
-- comparan contra `productos.stock_minimo` para "Stock bajo". El punto de
-- reorden reusa exactamente ese mismo agregado — global por producto, no
-- por ubicación: un proveedor no despacha "para Tienda Lima", despacha para
-- la empresa; qué sede recibe qué ya lo resuelve Traslados, no Compras.
--
-- Fórmula (la misma que V1 ya tenía y verificó en producción — recuperable
-- en `git show pre-v2-cutover:apps/web/lib/inteligencia.ts:119`):
--   punto_reorden = ceil(demanda_diaria × lead_time_dias) + stock_minimo
-- `stock_minimo` entra como PISO, no se reemplaza: es el mismo campo que
-- Felipe ya decidió el 2026-09-15, no una segunda "reposición" con otro
-- alcance.
--
-- SE ROMPE SI: un producto no tiene ninguna recepción con factura (recién
-- creado, o el proveedor nunca facturó) — usa lead_time_dias = 14 por
-- defecto (mismo valor que la constante vieja de V1) en vez de fallar o
-- devolver NULL.
--
-- Solo LOCAL. No aplicar en producción sin autorización explícita de Felipe.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- fn_productos: agrega demanda/lead time/punto de reorden ----------
-- Cambia el RETURNS TABLE, así que hay que dropear primero (Postgres no deja
-- CREATE OR REPLACE cuando cambian las columnas de salida).
drop function if exists retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer);

create function retail.fn_productos(
  p_busqueda text default null,
  p_categoria_id uuid default null,
  p_color_codigo text default null,
  p_estado text default null,
  p_precio_min numeric default null,
  p_precio_max numeric default null,
  p_stock text default null,
  p_pagina integer default 1,
  p_por_pagina integer default 24
)
returns table (
  total_productos bigint,
  producto_id uuid,
  referencia text,
  codigo text,
  categoria_id uuid,
  categoria_nombre text,
  estado text,
  stock_minimo integer,
  stock_total integer,
  demanda_diaria numeric,
  lead_time_dias numeric,
  punto_reorden integer,
  reponer_de_proveedor boolean,
  variante_id uuid,
  variante_codigo text,
  sku text,
  talla text,
  color_codigo text,
  color_nombre text,
  color_hex text,
  precio numeric,
  costo numeric,
  activo boolean,
  codigos_barras text[]
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
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
      coalesce(sum(s.cantidad), 0)::integer as stock_total,
      bool_or(p_color_codigo is null or v.color_codigo = p_color_codigo) as color_ok,
      bool_or(
        (p_precio_min is null or v.precio >= p_precio_min)
        and (p_precio_max is null or v.precio <= p_precio_max)
      ) as precio_ok,
      -- Ventas de los últimos 30 días de TODAS las variantes de este
      -- producto, en TODAS las sedes — excluye Cargo especial por
      -- construcción (join parte de `p.id`, y ese producto ya se excluye
      -- en el where de abajo). LATERAL: constante por producto, no por
      -- fila variante×stock — max() la vuelve a colapsar tras el fan-out
      -- del join con `stock`, mismo motivo que bool_or arriba.
      coalesce(max(vd.demanda_diaria), 0) as demanda_diaria,
      -- Proxy de tiempo de entrega: promedio de días entre la factura y la
      -- recepción, sobre cualquier proveedor que alguna vez abasteció este
      -- producto. Solo cuenta recepciones que vinieron de una factura
      -- (recibir_compras) — una recepción manual sin factura (recibir_lote)
      -- no tiene "fecha de pedido" que comparar. 14 = el mismo default que
      -- usaba la constante vieja de V1 cuando no hay historial.
      coalesce(max(lt.lead_time_dias), 14) as lead_time_dias
    from productos p
    left join categorias c on c.id = p.categoria_id
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
    group by p.id, p.referencia, p.codigo, p.categoria_id, c.nombre, p.estado, p.stock_minimo
  ),
  con_reorden as (
    select
      agregado.*,
      ceil(agregado.demanda_diaria * agregado.lead_time_dias)::integer + coalesce(agregado.stock_minimo, 0) as punto_reorden
    from agregado
  ),
  filtrado as (
    -- Calificado con el alias: `stock_total`/`stock_minimo` son también los
    -- OUT params de la función, y sin calificar Postgres los prefiere a la
    -- columna del CTE (ambigüedad real, no cosmética — probado en local).
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
    order by f.referencia, f.id
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
    v.talla,
    v.color_codigo,
    co.nombre,
    co.hex,
    v.precio,
    v.costo,
    v.activo,
    coalesce(cb.codigos, '{}'::text[])
  from pagina pg
  join variantes v on v.producto_id = pg.id
  left join colores co on co.codigo = v.color_codigo
  left join lateral (
    -- Calificado por lo mismo que en `filtrado`: `codigo` también es un OUT
    -- param de la función (el código corto del producto).
    select array_agg(cb2.codigo order by cb2.codigo) as codigos
    from codigos_barras cb2 where cb2.variante_id = v.id
  ) cb on true
  order by pg.referencia, pg.id, v.talla, v.color_codigo;
end;
$$;

revoke all on function retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer) from public;
grant execute on function retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer) to authenticated;

comment on function retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer) is
  'Catálogo filtrado, paginado por producto: filas planas por variante, con stock_minimo/stock_total (todas las sedes) y el punto de reorden (demanda_diaria × lead_time_dias + stock_minimo). p_stock admite ahora "reponer" además de "bajo"/"sin_stock".';

-- ---------- fn_productos_resumen: suma la tarjeta "Pedir a proveedor" ----------
drop function if exists retail.fn_productos_resumen(text, uuid, text, text, numeric, numeric);

create function retail.fn_productos_resumen(
  p_busqueda text default null,
  p_categoria_id uuid default null,
  p_color_codigo text default null,
  p_estado text default null,
  p_precio_min numeric default null,
  p_precio_max numeric default null
)
returns table (
  total_productos bigint,
  total_variantes bigint,
  stock_bajo bigint,
  sin_stock bigint,
  reponer_de_proveedor bigint
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
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
$$;

revoke all on function retail.fn_productos_resumen(text, uuid, text, text, numeric, numeric) from public;
grant execute on function retail.fn_productos_resumen(text, uuid, text, text, numeric, numeric) to authenticated;

comment on function retail.fn_productos_resumen(text, uuid, text, text, numeric, numeric) is
  'Tarjetas de /productos: agrega reponer_de_proveedor (punto de reorden) a total/stock_bajo/sin_stock.';
