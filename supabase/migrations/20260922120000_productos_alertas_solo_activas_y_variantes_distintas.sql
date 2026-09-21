-- ============================================================================
-- 20260922120000 — Productos: las alertas de stock solo cuentan prendas ACTIVAS y «N variantes» cuenta variantes
-- (pantalla:productos, tareas #1 y #3 — docs/pantallas/productos.md, objeciones 1 y 3; ADR-0150)
--
-- PROBLEMA 1. `/productos` lista por defecto las prendas activas Y las descontinuadas, y los cuatro
-- números de la cabecera («sin stock», «stock bajo», «para pedir» y el bloque «A quién pedirle»)
-- las contaban a todas. Una prenda que CAYLA ya no vende y que quedó en 0 aparecía como «sin
-- stock»; peor, una prenda en liquidación —con ventas recientes y poco stock— salía como «para
-- pedir» y «A quién pedirle» le sugería comprársela otra vez al proveedor. En producción, según
-- una lectura del 2026-09-21 (por confirmar con la consulta Q2 de docs/pantallas/productos.md): 6
-- descontinuadas, todas de prueba; «23 sin stock» eran 17 o 18 de verdad, y los «3 para pedir»
-- eran prendas descontinuadas que todavía tenían ventas de los últimos 30 días.
--
-- PROBLEMA 2. El subtítulo decía «190 variantes» y la base tiene 163: `fn_productos_resumen` contaba
-- `count(v.id)` DESPUÉS de unir con `stock`, y una variante con stock en dos sedes (o en el piso y
-- en el almacén de la misma sede) se contaba dos veces. Se coló porque la prueba de regresión de
-- 20260918231300 comparó contra la versión anterior, que ya tenía el mismo error: «igual que
-- antes» no prueba «correcto».
--
-- PROBLEMA 3 (lo encontró la revisión adversarial). «Stock bajo» y «sin stock» se solapaban: una
-- prenda activa con mínimo cargado y 0 unidades contaba en LOS DOS contadores y salía en las dos
-- listas, pero la tarjeta (que ya era exclusiva) solo decía «sin stock». Un mismo problema contado dos
-- veces, y un filtro «Stock bajo» que devolvía tarjetas que decían otra cosa.
--
-- DECISIÓN (Felipe, 2026-09-22, tareas #1 a #4 del análisis): una prenda descontinuada NO dispara
-- alertas. Sigue apareciendo en la lista (se puede ver, buscar y reactivar: la Tabla tiene
-- «Activar» en bloque), pero no cuenta como «sin stock», «stock bajo» ni «para pedir».
--
-- QUÉ CAMBIA.
--   fn_productos          el filtro `p_stock` (sin_stock / bajo / reponer) solo devuelve prendas
--                         activas; «bajo» exige además tener unidades (0 unidades es «sin stock»);
--                         y la columna `reponer_de_proveedor` es falsa si la prenda no está activa.
--                         «A quién pedirle» sale de esta misma columna: se corrige sin tocar la app.
--   fn_productos_resumen  los tres contadores siguen las mismas reglas que el filtro, y
--                         «total_variantes» cuenta `count(distinct v.id)`.
--   El filtro y el contador cambian JUNTOS: lo que dice el número de arriba es lo que muestran las
--   tarjetas de abajo, con o sin filtros de estado, color, precio, marca, proveedor o búsqueda
--   (lo comprueba scripts/pruebas/productos_alertas_de_stock.mjs sobre 18 combinaciones).
--
-- UN SOLO ARCHIVO, A PROPÓSITO. Esta migración reemplaza las DOS funciones enteras. Se pega a mano en el
-- SQL Editor: dos archivos que reemplazan la misma función dejan, si se pegan en otro orden, la
-- versión vieja del contador de variantes o un resumen que ya no coincide con la lista.
--
-- LO QUE NO CAMBIA. `total_productos` y `total_variantes` siguen contando todos los estados (y las
-- variantes activas e inactivas: que «variantes» signifique «vigentes» es la tarea #9 del análisis);
-- firmas y columnas de salida idénticas (CREATE OR REPLACE conserva permisos); la app funciona igual
-- con esta migración aplicada antes o después de desplegarse. Combinar `estado = descontinuado` con un
-- filtro de stock no devuelve nada, a propósito: un descontinuado no es una alerta.
--
-- ESTADO: aplicada solo en el Postgres local. En producción se pega DESPUÉS de que Felipe la revise
-- (el archivo ya trae `set search_path`, sirve tal cual en el SQL Editor de retail dentro de Dynamic).
-- ============================================================================

set search_path = retail, public, extensions;

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
      (con_reorden.estado = 'activo' and con_reorden.stock_total <= con_reorden.punto_reorden and con_reorden.demanda_diaria > 0) as reponer_de_proveedor
    from con_reorden
    where con_reorden.color_ok
      and con_reorden.precio_ok
      and (
        p_stock is null
        or (p_stock = 'sin_stock' and con_reorden.estado = 'activo' and con_reorden.stock_total = 0)
        or (p_stock = 'bajo' and con_reorden.estado = 'activo' and con_reorden.stock_total > 0 and con_reorden.stock_minimo is not null and con_reorden.stock_total < con_reorden.stock_minimo)
        or (p_stock = 'reponer' and con_reorden.estado = 'activo' and con_reorden.stock_total <= con_reorden.punto_reorden and con_reorden.demanda_diaria > 0)
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
      p.estado,
      p.stock_minimo,
      count(distinct v.id)::bigint as num_variantes,
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
    group by p.id, p.estado, p.stock_minimo
  ),
  filtrado as (
    select *,
      ceil(demanda_diaria * lead_time_dias)::integer + coalesce(stock_minimo, 0) as punto_reorden
    from agregado where color_ok and precio_ok
  )
  select
    count(*)::bigint,
    coalesce(sum(num_variantes), 0)::bigint,
    count(*) filter (where estado = 'activo' and stock_total > 0 and stock_minimo is not null and stock_total < stock_minimo)::bigint,
    count(*) filter (where estado = 'activo' and stock_total = 0)::bigint,
    count(*) filter (where estado = 'activo' and stock_total <= punto_reorden and demanda_diaria > 0)::bigint
  from filtrado;
end;
$function$;
