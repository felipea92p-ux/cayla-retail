-- ============================================================================
-- 20260917190000_producto_fotos_por_color.sql — CAYLA V2
--
-- Pedido de Felipe (2026-09-17): antes de fotografiar el piloto de la
-- Grilla (ADR-0075), que cada foto sepa a qué color pertenece — hasta acá
-- `producto_fotos` era una galería a nivel de PRODUCTO, sin color, así que
-- el swatch interactivo (hover = vista previa del color) solo podía mostrar
-- un tinte, nunca la foto real.
--
-- DECIDÍ: `color_codigo` en `producto_fotos`, NULLABLE — una foto SIN color
-- sigue siendo válida (una prenda sin variante de color, como un cinturón;
-- o una foto general que nadie tiene por qué etiquetar). No se inventa un
-- concepto de "foto principal por color": si un color tiene más de una
-- foto, `fn_productos` toma la primera por `orden` — alcanza para el piloto
-- (una foto por color) y no complica el índice único que ya existe
-- (`producto_fotos_principal_unico`, que sigue significando "la miniatura
-- de TODO el producto", sin tocar).
--
-- DECIDÍ: el join en `fn_productos` usa `IS NOT DISTINCT FROM`, no `=` — en
-- SQL `NULL = NULL` da NULL (no verdadero), así que una variante sin color
-- (`v.color_codigo` NULL) nunca hubiera calzado con una foto sin color
-- (`pf.color_codigo` NULL) usando `=`. Con `IS NOT DISTINCT FROM`, "sin
-- color" combina contra "sin color" igual que cualquier otro par.
--
-- QUÉ TOCA
--   · `retail.producto_fotos` gana `color_codigo` (FK a `colores`).
--   · `catalogo_crear_producto`/`catalogo_actualizar_producto`
--     (20260915224500) leen `color_codigo` de cada foto en `p_fotos` — la
--     firma de las dos NO cambia (mismos parámetros, mismo tipo de
--     retorno), así que no hace falta dropearlas primero.
--   · `fn_productos` (20260917180000) gana la columna de salida
--     `foto_url` — ESTA sí cambia el RETURNS TABLE, así que se dropea antes
--     de recrearla (Postgres no deja CREATE OR REPLACE cuando cambian las
--     columnas de salida). Se parte de la versión de 20260917180000
--     (con punto de reorden y p_orden), no de una anterior — ver la
--     addenda 5 de ADR-0075 sobre el casi-error de basarse en la
--     definición equivocada.
--
-- ESTADO: sin aplicar en producción — pendiente el ok puntual de Felipe.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------
-- 1. `producto_fotos` gana `color_codigo`
-- ---------------------------------------------------------------------------
alter table retail.producto_fotos
  add column if not exists color_codigo text references retail.colores (codigo);

create index if not exists producto_fotos_color_idx on retail.producto_fotos (producto_id, color_codigo);

comment on column retail.producto_fotos.color_codigo is
  'A qué color de la prenda corresponde esta foto — null = sin color (accesorio sin variante de color, o foto general sin etiquetar). fn_productos la usa para mostrar la foto real al pasar el mouse por ese color en la Grilla (ADR-0075); si un color no tiene foto, el cliente cae a un tinte, nunca a un ícono de "sin foto".';

-- ---------------------------------------------------------------------------
-- 2. `catalogo_crear_producto` — cada foto de p_fotos puede traer color_codigo
-- ---------------------------------------------------------------------------
create or replace function retail.catalogo_crear_producto(
  p_referencia text,
  p_variantes jsonb,
  p_categoria_id uuid default null,
  p_descripcion text default null,
  p_stock_minimo integer default null,
  p_temporada text default null,
  p_permitir_venta_sin_stock boolean default false,
  p_fotos jsonb default '[]'::jsonb
) returns uuid
language plpgsql
set search_path = retail, public
as $$
declare
  v_producto_id uuid;
  v_variante jsonb;
  v_fila record;
  v_ya_principal boolean := false;
begin
  if p_referencia is null or trim(p_referencia) = '' then
    raise exception 'Falta la referencia del producto.';
  end if;
  if p_variantes is null or jsonb_typeof(p_variantes) <> 'array' or jsonb_array_length(p_variantes) = 0 then
    raise exception 'Un producto necesita al menos una variante (talla y/o color) antes de guardarse.';
  end if;
  if p_stock_minimo is not null and p_stock_minimo < 0 then
    raise exception 'El stock mínimo no puede ser negativo.';
  end if;

  insert into productos (categoria_id, referencia, descripcion, stock_minimo, temporada, permitir_venta_sin_stock)
  values (
    p_categoria_id,
    trim(p_referencia),
    nullif(trim(coalesce(p_descripcion, '')), ''),
    p_stock_minimo,
    nullif(trim(coalesce(p_temporada, '')), ''),
    coalesce(p_permitir_venta_sin_stock, false)
  )
  returning id into v_producto_id;

  for v_variante in select * from jsonb_array_elements(p_variantes)
  loop
    if coalesce(nullif(trim(v_variante->>'sku'), ''), '') = '' then
      raise exception 'Cada variante necesita un SKU.';
    end if;
    if v_variante->>'precio' is null then
      raise exception 'Cada variante necesita un precio.';
    end if;

    insert into variantes (producto_id, color_codigo, talla, sku, precio, costo)
    values (
      v_producto_id,
      nullif(v_variante->>'color_codigo', ''),
      nullif(v_variante->>'talla', ''),
      trim(v_variante->>'sku'),
      (v_variante->>'precio')::numeric,
      coalesce((v_variante->>'costo')::numeric, 0)
    );
  end loop;

  -- Fotos: se insertan en el orden del array (el cliente ya las reordenó
  -- localmente); a lo más la primera marcada `es_principal` gana, y si
  -- ninguna llegó marcada, la primera de la lista queda principal.
  for v_fila in
    select f.value as foto, (f.ordinality - 1)::integer as orden
    from jsonb_array_elements(coalesce(p_fotos, '[]'::jsonb)) with ordinality as f(value, ordinality)
  loop
    if coalesce(nullif(trim(v_fila.foto->>'url'), ''), '') = '' then
      raise exception 'Una foto llegó sin URL.';
    end if;
    insert into producto_fotos (producto_id, url, orden, es_principal, color_codigo)
    values (
      v_producto_id,
      v_fila.foto->>'url',
      v_fila.orden,
      (coalesce((v_fila.foto->>'es_principal')::boolean, false) and not v_ya_principal),
      nullif(v_fila.foto->>'color_codigo', '')
    );
    if coalesce((v_fila.foto->>'es_principal')::boolean, false) then
      v_ya_principal := true;
    end if;
  end loop;

  if not v_ya_principal then
    update producto_fotos set es_principal = true
      where id = (select id from producto_fotos where producto_id = v_producto_id order by orden limit 1);
  end if;

  return v_producto_id;
end;
$$;

comment on function retail.catalogo_crear_producto(text, jsonb, uuid, text, integer, text, boolean, jsonb) is
  'Alta de producto+variantes+fotos para /productos/nuevo (V2). Sin security definer: corre con los permisos de quien llama; productos_write_lider/variantes_write_lider/producto_fotos_write_lider (RLS) son el único candado de permiso. p_stock_minimo: umbral de "stock bajo" (20260915160000). p_temporada/p_permitir_venta_sin_stock: 20260915224500. p_fotos: reemplazo completo en el orden del array, [{url, es_principal?, color_codigo?}] (20260917190000: color_codigo); sin id porque el producto todavía no existe.';

-- ---------------------------------------------------------------------------
-- 3. `catalogo_actualizar_producto` — igual, en las dos ramas (actualizar/crear fila)
-- ---------------------------------------------------------------------------
create or replace function retail.catalogo_actualizar_producto(
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
  p_fotos jsonb default null
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

  update productos
    set categoria_id = p_categoria_id,
        referencia = trim(p_referencia),
        descripcion = nullif(trim(coalesce(p_descripcion, '')), ''),
        estado = p_estado,
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
      -- Variante existente: solo precio, costo y activo cambian. Color,
      -- talla, sku y codigo son la identidad de la prenda — ver el
      -- encabezado de 20260915150000_catalogo_alta_edicion.sql.
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

    -- Todas a false antes de volver a marcar como mucho una — el índice
    -- único parcial de arriba no es diferible, y actualizar fila por fila
    -- sin este paso deja un instante con dos `true` a la vez si la
    -- principal nueva no es la misma fila que la principal vieja.
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

comment on function retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text, integer, text, boolean, jsonb) is
  'Edición de producto+variantes+fotos para /productos/[id]/editar (V2). Fotos: p_fotos null = no tocar la galería; [] = vaciarla; con elementos = reemplazo completo (id presente = fila existente, ausente = nueva), en el orden del array, cada una con color_codigo? opcional (20260917190000). p_temporada/p_permitir_venta_sin_stock: 20260915224500.';

-- ---------------------------------------------------------------------------
-- 4. `fn_productos` — gana `foto_url` por variante (busca por color de ESA
--    variante, no la "principal" del producto)
-- ---------------------------------------------------------------------------
drop function if exists retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer, text);

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
    group by p.id, p.referencia, p.codigo, p.categoria_id, c.nombre, p.estado, p.stock_minimo
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
  -- Foto de ESTA variante: el color de ESTE renglón, no "la principal del
  -- producto" — es lo que permite que el swatch de la Grilla muestre la
  -- foto real al pasar el mouse. `IS NOT DISTINCT FROM`, no `=`: una
  -- variante sin color (v.color_codigo NULL) tiene que calzar con una foto
  -- sin color (pf.color_codigo NULL), y NULL = NULL da NULL, no verdadero.
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

revoke all on function retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer, text) from public;
grant execute on function retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer, text) to authenticated;

comment on function retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer, text) is
  'Catálogo filtrado, paginado por producto: filas planas por variante, con stock_minimo/stock_total, punto de reorden, orden opcional por precio y foto_url de ESA variante (por su color, 20260917190000 — null si ese color no tiene foto todavía). p_stock admite sin_stock/bajo/reponer. p_orden: null (por referencia), precio_asc, precio_desc.';
