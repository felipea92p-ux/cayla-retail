-- ============================================================================
-- 20260915160000_productos_listado_filtros.sql — CAYLA V2
--
-- /productos pasa de filtrar TODO el catálogo en memoria del cliente
-- (`getCatalogo()` sin filtros ni paginado) a filtros en la URL + Postgres,
-- mismo patrón que Movimientos (`20260915090000_movimientos_lectura.sql`):
-- una función que resuelve la búsqueda a ids, una que lista, una que resume.
--
-- DECIDÍ: paginado por NÚMERO DE PÁGINA (LIMIT/OFFSET + count(*) over()), no
-- por cursor como Movimientos/Compras. El comentario de `PaginacionCursor`
-- explica por qué un cursor evita el OFFSET — pero esa razón es el tamaño de
-- MOVIMIENTOS (un ledger que crece sin techo: ~55.000 filas/ubicación en 3
-- años). El catálogo no es un ledger: crece con el surtido, no con cada
-- venta — el propio censo lo dimensiona en 300-900 SKUs (ver BACKLOG). A ese
-- tamaño un `count(*)` sobre `productos` cuesta lo mismo que ya cuesta pintar
-- "36" en el paginador del mockup — pedido explícito de Felipe (2026-09-15)
-- de mostrar "1 2 3…36", que un cursor no puede expresar (no hay "ir a la
-- página 20" sin contar antes). Si el catálogo algún día se acerca al orden
-- de magnitud de Movimientos, ese es el momento de reconsiderar, no antes
-- (principio 5: diseñar para el volumen que viene).
--
-- DECIDÍ: paginado por PRODUCTO, no por fila de variante — la pantalla
-- agrupa por producto (`ProductosAgrupados`), así que "página 1 de 36" debe
-- contar productos. `fn_productos` pagina un CTE agregado por producto y
-- recién ahí se abre a variantes, para que una prenda de 12 variantes no
-- corra a la página siguiente a la mitad.
--
-- DECIDÍ: `stock_minimo` vive en `productos`, no en `variantes` — es un
-- umbral por MODELO (decisión de Felipe, 2026-09-15: "un campo para colocar
-- el stock mínimo de cada producto" en el mantenedor de ficha), no por
-- talla/color. Nullable: sin valor, ese producto nunca entra en "stock
-- bajo" — no hay umbral inventado (antes de esto, V2 no tenía ninguna
-- columna de umbral; ver comentario de `20260912234726_cargo_especial_pos.sql`).
-- El campo del mantenedor (`ProductoForm.tsx`, ficha de producto) queda para
-- la sesión que edita esa pantalla — esta migración solo abre la columna.
--
-- DECIDÍ (cruza una separación documentada a propósito): `getCatalogo()` y
-- `ProductosAgrupados.tsx` dejan dicho que /productos NO muestra stock —
-- "qué existe" vs. "cuánto hay" es /inventario. Las tarjetas de resumen y el
-- filtro de stock cruzan esa línea a pedido explícito de Felipe (2026-09-15,
-- confirmado tras preguntar). No se revierte la separación: la tabla de
-- variantes sigue sin columna de stock por fila; solo el total agregado por
-- producto (sumado en TODAS las ubicaciones, no una sede) entra a la
-- cabecera y al filtro. `security definer`: `stock_select` es por
-- `fn_puede_operar_ubicacion(ubicacion_id)` (una colaboradora de sede fija
-- solo ve su stock) pero el catálogo (`productos_select`/`variantes_select`)
-- ya es visible para cualquier autenticado — con invoker, una colaboradora
-- vería "sin stock" en prendas que sí tienen, solo en otra sede.
--
-- ESTADO: sin aplicar en producción. Ver BACKLOG.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. stock_minimo por producto ----------
alter table retail.productos
  add column stock_minimo integer;
alter table retail.productos
  add constraint productos_stock_minimo_no_negativo check (stock_minimo is null or stock_minimo >= 0);

comment on column retail.productos.stock_minimo is
  'Umbral de "stock bajo" para este modelo, sumado en todas las ubicaciones. Null = sin umbral definido: el producto nunca entra en el filtro/tarjeta de stock bajo.';

-- ---------- 2. Búsqueda → productos ----------
-- Mismo criterio que `fn_movimientos_variantes`: se resuelve una vez a ids
-- de producto y el resto filtra por `= any(...)`, nunca un ilike repetido
-- por fila. Texto a medias en referencia/código de producto/SKU/código de
-- variante; código de barras solo exacto (una pistola manda el código completo).
create or replace function retail.fn_productos_buscar(p_busqueda text)
returns uuid[]
language sql
stable
set search_path = retail, public, extensions
as $$
  select coalesce(array_agg(distinct p.id), '{}'::uuid[])
  from retail.productos p
  join retail.variantes v on v.producto_id = p.id
  where p.referencia ilike '%' || p_busqueda || '%'
     or p.codigo ilike '%' || p_busqueda || '%'
     or v.sku ilike '%' || p_busqueda || '%'
     or v.codigo ilike '%' || p_busqueda || '%'
     or exists (
       select 1 from retail.codigos_barras cb
       where cb.variante_id = v.id and lower(cb.codigo) = lower(p_busqueda)
     );
$$;

revoke all on function retail.fn_productos_buscar(text) from public;

-- ---------- 3. fn_productos ----------
-- Filtra y pagina por producto; devuelve filas planas por VARIANTE de los
-- productos de esa página (el cliente vuelve a agrupar por `producto_id`,
-- igual que hacía `ProductosAgrupados` antes en memoria — ahora sobre un
-- conjunto ya chico). `total_productos` viaja repetido por fila (window
-- function) para que el cliente arme "página X de Y" sin una segunda consulta.
create or replace function retail.fn_productos(
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
  -- El producto centinela de «Cargo especial» (20260912234726_cargo_especial_pos.sql):
  -- no es mercadería, es el truco del POS para cobrar un monto manual. Se
  -- excluye por id en toda pantalla que cuenta o lista prendas reales
  -- (fn_movimientos, fn_movimientos_resumen) — Productos, que es justo "qué
  -- existe", lo excluye con más razón todavía.
  c_cargo_especial constant uuid := '11111111-1111-4111-8111-111111111111';
  v_busqueda text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_productos uuid[];
  v_pagina integer := greatest(1, coalesce(p_pagina, 1));
  v_por_pagina integer := greatest(1, least(coalesce(p_por_pagina, 24), 100));
begin
  if p_estado is not null and p_estado not in ('activo', 'descontinuado') then
    raise exception 'Estado de producto desconocido: %', p_estado;
  end if;
  if p_stock is not null and p_stock not in ('sin_stock', 'bajo') then
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
      ) as precio_ok
    from productos p
    left join categorias c on c.id = p.categoria_id
    join variantes v on v.producto_id = p.id
    left join stock s on s.variante_id = v.id
    where p.id <> c_cargo_especial
      and (v_productos is null or p.id = any(v_productos))
      and (p_categoria_id is null or p.categoria_id = p_categoria_id)
      and (p_estado is null or p.estado = p_estado)
    group by p.id, p.referencia, p.codigo, p.categoria_id, c.nombre, p.estado, p.stock_minimo
  ),
  filtrado as (
    -- Calificado con el alias: `stock_total`/`stock_minimo` son también los
    -- OUT params de la función, y sin calificar Postgres los prefiere a la
    -- columna del CTE (ambigüedad real, no cosmética — probado en local).
    select agregado.*
    from agregado
    where agregado.color_ok
      and agregado.precio_ok
      and (
        p_stock is null
        or (p_stock = 'sin_stock' and agregado.stock_total = 0)
        or (p_stock = 'bajo' and agregado.stock_minimo is not null and agregado.stock_total < agregado.stock_minimo)
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
  'Catálogo filtrado, paginado por producto (no por fila): filas planas por variante de los productos de la página pedida, con total_productos para el paginador numérico.';

-- ---------- 4. fn_productos_resumen ----------
-- Mismos filtros que `fn_productos` MENOS `p_stock`/paginado — igual que
-- `fn_movimientos_resumen` no recibe `p_categoria`: "stock bajo" y "sin
-- stock" son las cifras que el resumen calcula, no algo que ya viene
-- filtrado; así las cuatro tarjetas conviven con cualquier filtro de stock
-- aplicado en la lista (y una tarjeta puede activarlo, como "Vence esta
-- semana" en Compras).
create or replace function retail.fn_productos_resumen(
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
  sin_stock bigint
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
      return query select 0::bigint, 0::bigint, 0::bigint, 0::bigint;
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
      ) as precio_ok
    from productos p
    join variantes v on v.producto_id = p.id
    left join stock s on s.variante_id = v.id
    where p.id <> c_cargo_especial
      and (v_productos is null or p.id = any(v_productos))
      and (p_categoria_id is null or p.categoria_id = p_categoria_id)
      and (p_estado is null or p.estado = p_estado)
    group by p.id, p.stock_minimo
  ),
  filtrado as (
    select * from agregado where color_ok and precio_ok
  )
  select
    count(*)::bigint,
    coalesce(sum(num_variantes), 0)::bigint,
    count(*) filter (where stock_minimo is not null and stock_total < stock_minimo)::bigint,
    count(*) filter (where stock_total = 0)::bigint
  from filtrado;
end;
$$;

revoke all on function retail.fn_productos_resumen(text, uuid, text, text, numeric, numeric) from public;
grant execute on function retail.fn_productos_resumen(text, uuid, text, text, numeric, numeric) to authenticated;

comment on function retail.fn_productos_resumen(text, uuid, text, text, numeric, numeric) is
  'Tarjetas de /productos: total de productos, total de variantes, y cuántos productos están en stock bajo / sin stock — mismo filtro que fn_productos sin el de stock ni el paginado.';
