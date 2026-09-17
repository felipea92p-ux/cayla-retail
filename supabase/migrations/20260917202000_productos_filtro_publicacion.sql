-- ============================================================================
-- 20260917202000_productos_filtro_publicacion.sql — CAYLA V2
--
-- Continúa 20260917201500 (columna `estado_publicacion`): ahora que existe
-- la columna, `fn_productos`/`fn_productos_resumen` (usadas por /productos)
-- y `catalogo_actualizar_producto` (usada por /productos/[id]/editar)
-- tienen que saber de ella — sin esto la columna existe en la base pero
-- nadie puede filtrar por ella ni cambiarla desde la UI.
--
-- DROP explícito antes de CREATE OR REPLACE en las tres funciones — no por
-- estilo, sino porque agregar un parámetro nuevo cambia la lista de TIPOS
-- de la firma, y Postgres trata una firma distinta como una sobrecarga
-- NUEVA en vez de remplazar la vieja. Es exactamente el incidente que
-- 20260917200000_fn_productos_dropea_sobrecarga_vieja.sql ya documentó y
-- reparó en producción hace unas horas (dos sobrecargas de fn_productos
-- vivas a la vez → PostgREST no podía elegir con parámetros nombrados →
-- /productos caído). No se repite ese error acá.
--
-- fn_productos: gana columna de salida `estado_publicacion` (por eso se
-- dropea, no solo se reemplaza — cambiar RETURNS TABLE tampoco lo permite
-- CREATE OR REPLACE) y el filtro `p_estado_publicacion`.
-- fn_productos_resumen: mismo filtro de entrada, sin tocar sus columnas de
-- salida (siguen siendo solo conteos).
-- catalogo_actualizar_producto: gana `p_estado_publicacion` — null (default)
-- significa "no tocar este eje", mismo idioma que ya usa `p_fotos` en esta
-- misma función.
--
-- Quién puede filtrar/ver borrador y archivado, y quién puede cambiarlo, se
-- decide en la app (mismo patrón que ya usa `esLider` para las acciones
-- masivas de `estado` en ProductosAgrupados.tsx): la RLS de escritura sobre
-- `productos` ya es lider-only (productos_write_lider, 0004_rls.sql) y no
-- se toca acá.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------
-- 1. fn_productos
-- ---------------------------------------------------------------------------
drop function if exists retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer, text);

create function retail.fn_productos(
  p_busqueda text default null,
  p_categoria_id uuid default null,
  p_color_codigo text default null,
  p_estado text default null,
  p_precio_min numeric default null,
  p_precio_max numeric default null,
  p_stock text default null,
  p_pagina integer default 1,
  p_por_pagina integer default 24,
  p_orden text default null,
  p_estado_publicacion text default null
)
returns table (
  total_productos bigint,
  producto_id uuid,
  referencia text,
  codigo text,
  categoria_id uuid,
  categoria_nombre text,
  estado text,
  estado_publicacion text,
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
  foto_url text,
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
  if p_estado_publicacion is not null and p_estado_publicacion not in ('borrador', 'activo', 'archivado') then
    raise exception 'Estado de publicación desconocido: %', p_estado_publicacion;
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
      p.estado_publicacion,
      p.stock_minimo,
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
      and (p_estado_publicacion is null or p.estado_publicacion = p_estado_publicacion)
    group by p.id, p.referencia, p.codigo, p.categoria_id, c.nombre, p.estado, p.estado_publicacion, p.stock_minimo
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
    pg.estado_publicacion,
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
    foto.url,
    v.precio,
    v.costo,
    v.activo,
    coalesce(cb.codigos, '{}'::text[])
  from pagina pg
  join variantes v on v.producto_id = pg.id
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
    pg.referencia, pg.id, v.talla, v.color_codigo;
end;
$$;

revoke all on function retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer, text, text) from public;
grant execute on function retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer, text, text) to authenticated;

comment on function retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer, text, text) is
  'Catálogo filtrado, paginado por producto: filas planas por variante, con stock_minimo/stock_total, punto de reorden, orden opcional por precio, foto_url de esa variante y estado_publicacion (20260917202000 — borrador/activo/archivado, eje distinto de estado). p_stock admite sin_stock/bajo/reponer. p_orden: null (por referencia), precio_asc, precio_desc. p_estado_publicacion: null = todos (uso de Líder); la app bloquea a un colaborador de sede a "activo" siempre, sin pasar por este parámetro para decidirlo — ver filtrosProductosDesdeParams en catalogo-v2.ts.';

-- ---------------------------------------------------------------------------
-- 2. fn_productos_resumen — mismo filtro de entrada, columnas de salida sin tocar
-- ---------------------------------------------------------------------------
drop function if exists retail.fn_productos_resumen(text, uuid, text, text, numeric, numeric);

create function retail.fn_productos_resumen(
  p_busqueda text default null,
  p_categoria_id uuid default null,
  p_color_codigo text default null,
  p_estado text default null,
  p_precio_min numeric default null,
  p_precio_max numeric default null,
  p_estado_publicacion text default null
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
  if p_estado_publicacion is not null and p_estado_publicacion not in ('borrador', 'activo', 'archivado') then
    raise exception 'Estado de publicación desconocido: %', p_estado_publicacion;
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
      and (p_estado_publicacion is null or p.estado_publicacion = p_estado_publicacion)
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

revoke all on function retail.fn_productos_resumen(text, uuid, text, text, numeric, numeric, text) from public;
grant execute on function retail.fn_productos_resumen(text, uuid, text, text, numeric, numeric, text) to authenticated;

comment on function retail.fn_productos_resumen(text, uuid, text, text, numeric, numeric, text) is
  'Resumen agregado de /productos (tarjetas de arriba), mismos filtros que fn_productos menos stock/orden. p_estado_publicacion (20260917202000): null = todos.';

-- ---------------------------------------------------------------------------
-- 3. catalogo_actualizar_producto — gana p_estado_publicacion (null = no tocar)
-- ---------------------------------------------------------------------------
drop function if exists retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text, integer, text, boolean, jsonb);

create function retail.catalogo_actualizar_producto(
  p_producto_id uuid,
  p_referencia text,
  p_estado text,
  p_variantes jsonb,
  p_categoria_id uuid default null,
  p_descripcion text default null,
  p_stock_minimo integer default null,
  p_temporada text default null,
  p_permitir_venta_sin_stock boolean default false,
  -- null = no tocar la galería (llamada que no trae fotos); [] = vaciarla.
  p_fotos jsonb default null,
  -- null = no tocar este eje (20260917202000) — mismo idioma que p_fotos.
  p_estado_publicacion text default null
) returns void
language plpgsql
set search_path = retail, public
as $$
declare
  v_variante jsonb;
  v_id uuid;
  v_fila record;
  v_foto_id uuid;
  v_ids_mantener uuid[];
  v_ya_principal boolean := false;
begin
  if p_referencia is null or trim(p_referencia) = '' then
    raise exception 'Falta la referencia del producto.';
  end if;
  if p_stock_minimo is not null and p_stock_minimo < 0 then
    raise exception 'El stock mínimo no puede ser negativo.';
  end if;
  if p_estado_publicacion is not null and p_estado_publicacion not in ('borrador', 'activo', 'archivado') then
    raise exception 'Estado de publicación desconocido: %', p_estado_publicacion;
  end if;

  update productos
    set categoria_id = p_categoria_id,
        referencia = trim(p_referencia),
        descripcion = nullif(trim(coalesce(p_descripcion, '')), ''),
        estado = p_estado,
        estado_publicacion = coalesce(p_estado_publicacion, estado_publicacion),
        stock_minimo = p_stock_minimo,
        temporada = nullif(trim(coalesce(p_temporada, '')), ''),
        permitir_venta_sin_stock = coalesce(p_permitir_venta_sin_stock, false)
    where id = p_producto_id;

  if not found then
    raise exception 'El producto % no existe.', p_producto_id;
  end if;

  for v_variante in select * from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb))
  loop
    if coalesce(nullif(trim(v_variante->>'sku'), ''), '') = '' then
      raise exception 'Cada variante necesita un SKU.';
    end if;
    if v_variante->>'precio' is null then
      raise exception 'Cada variante necesita un precio.';
    end if;

    v_id := nullif(v_variante->>'id', '')::uuid;

    if v_id is not null then
      update variantes
        set precio = (v_variante->>'precio')::numeric,
            costo = coalesce((v_variante->>'costo')::numeric, 0),
            activo = coalesce((v_variante->>'activo')::boolean, true)
        where id = v_id and producto_id = p_producto_id;
    else
      insert into variantes (producto_id, color_codigo, talla, sku, precio, costo)
      values (
        p_producto_id,
        nullif(v_variante->>'color_codigo', ''),
        nullif(v_variante->>'talla', ''),
        trim(v_variante->>'sku'),
        (v_variante->>'precio')::numeric,
        coalesce((v_variante->>'costo')::numeric, 0)
      );
    end if;
  end loop;

  if p_fotos is not null then
    v_ids_mantener := array(
      select (f->>'id')::uuid
      from jsonb_array_elements(p_fotos) f
      where f->>'id' is not null
    );

    delete from producto_fotos
      where producto_id = p_producto_id
        and not (id = any(v_ids_mantener));

    update producto_fotos set es_principal = false
      where producto_id = p_producto_id;

    for v_fila in
      select f.value as foto, (f.ordinality - 1)::integer as orden
      from jsonb_array_elements(p_fotos) with ordinality as f(value, ordinality)
    loop
      if coalesce(nullif(trim(v_fila.foto->>'url'), ''), '') = '' then
        raise exception 'Una foto llegó sin URL.';
      end if;
      v_foto_id := nullif(v_fila.foto->>'id', '')::uuid;

      if v_foto_id is not null then
        update producto_fotos
          set orden = v_fila.orden,
              es_principal = (coalesce((v_fila.foto->>'es_principal')::boolean, false) and not v_ya_principal),
              color_codigo = nullif(v_fila.foto->>'color_codigo', '')
          where id = v_foto_id and producto_id = p_producto_id;
      else
        insert into producto_fotos (producto_id, url, orden, es_principal, color_codigo)
        values (
          p_producto_id,
          v_fila.foto->>'url',
          v_fila.orden,
          (coalesce((v_fila.foto->>'es_principal')::boolean, false) and not v_ya_principal),
          nullif(v_fila.foto->>'color_codigo', '')
        );
      end if;

      if coalesce((v_fila.foto->>'es_principal')::boolean, false) then
        v_ya_principal := true;
      end if;
    end loop;

    if not v_ya_principal then
      update producto_fotos set es_principal = true
        where id = (select id from producto_fotos where producto_id = p_producto_id order by orden limit 1);
    end if;
  end if;
end;
$$;

comment on function retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text, integer, text, boolean, jsonb, text) is
  'Edición de producto+variantes+fotos para /productos/[id]/editar (V2). Fotos: p_fotos null = no tocar la galería; [] = vaciarla; con elementos = reemplazo completo. p_estado_publicacion (20260917202000): null = no tocar ese eje; borrador/activo/archivado = fijarlo — es lo que usa el Líder para publicar un producto que nació en borrador.';
