-- ============================================================================
-- 20260917180000_productos_ordenar_por_precio.sql — CAYLA V2
--
-- Pedido de Felipe (grilla de /productos, 2026-09-17): ordenar el catálogo
-- por precio, ascendente o descendente. `fn_productos` (20260915160000,
-- ampliada por 20260916100000_punto_reorden.sql con demanda/lead time/punto
-- de reorden) solo tenía un orden fijo (`referencia, id`) — se suma
-- `p_orden` ('precio_asc'|'precio_desc'), opcional, sin cambiar el orden por
-- defecto cuando no se pide.
--
-- OJO — esta migración parte de la versión de `20260916100000_punto_reorden.sql`,
-- NO de `20260915160000` (la primera versión, ya superada): esa base trae el
-- filtro `p_stock='reponer'`, las columnas `demanda_diaria`/`lead_time_dias`/
-- `punto_reorden`/`reponer_de_proveedor` y `fn_productos_resumen` con su
-- propia cifra de "pedir a proveedor" — nada de eso se toca ni se pierde acá,
-- solo se le suma el orden por precio encima.
--
-- DECIDÍ: el precio "representativo" de un producto para ordenar es el
-- MÍNIMO entre sus variantes (`min(v.precio)`) — el mismo criterio que ya
-- usa `rangoPrecio()` en el cliente (`S/{min}–{max}`) para mostrar "desde
-- cuánto" cuesta el modelo. Ordenar por el precio máximo confundiría más de
-- lo que ayuda: un producto con una variante cara y el resto barata
-- aparecería arriba en "menor a mayor" sin serlo de verdad.
--
-- DECIDÍ: `case when p_orden = '...' then precio_min end` en vez de un
-- `order by` armado con `execute`/`format` — Postgres no deja un `order by`
-- condicional directo, pero si `p_orden` no calza con una rama, esa
-- expresión da NULL para TODAS las filas (empate total) y el `order by`
-- sigue de largo al siguiente criterio (`referencia, id`, el de siempre)
-- sin cambiar nada. Cero SQL armado a mano, cero riesgo de inyección.
--
-- CRÍTICO: se DROPEA la firma vieja de `fn_productos` antes de recrearla —
-- agregar un parámetro nuevo sin dropear deja dos sobrecargas conviviendo
-- (el mismo hueco que ya cerraron otras RPC de este módulo; ver ADR-0009/
-- 0004 y BITÁCORA 2026-09-16 sobre `registrar_cambio`/`aprobar_devolucion`).
-- `fn_productos_resumen` no se toca — el orden no le aplica (no pagina).
--
-- ESTADO: sin aplicar en producción — pendiente el ok puntual de Felipe
-- (mismo protocolo que el resto de este módulo: prefijo `retail.` en el
-- SQL Editor).
-- ============================================================================

set search_path = retail, public, extensions;

drop function if exists retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer);

create or replace function retail.fn_productos(
  p_busqueda text default null,
  p_categoria_id uuid default null,
  p_color_codigo text default null,
  p_estado text default null,
  p_precio_min numeric default null,
  p_precio_max numeric default null,
  p_stock text default null,
  p_pagina integer default 1,
  p_por_pagina integer default 24,
  p_orden text default null
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
      coalesce(sum(s.cantidad), 0)::integer as stock_total,
      min(v.precio) as precio_min,
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
  order by
    case when p_orden = 'precio_asc' then pg.precio_min end asc,
    case when p_orden = 'precio_desc' then pg.precio_min end desc,
    pg.referencia, pg.id, v.talla, v.color_codigo;
end;
$$;

revoke all on function retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer, text) from public;
grant execute on function retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer, text) to authenticated;

comment on function retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer, text) is
  'Catálogo filtrado, paginado por producto: filas planas por variante, con stock_minimo/stock_total (todas las sedes), punto de reorden (demanda_diaria × lead_time_dias + stock_minimo) y orden opcional por precio. p_stock admite sin_stock/bajo/reponer. p_orden: null (por referencia), precio_asc, precio_desc.';
