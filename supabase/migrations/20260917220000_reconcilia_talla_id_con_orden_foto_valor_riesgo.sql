-- ============================================================================
-- 20260917220000_reconcilia_talla_id_con_orden_foto_valor_riesgo.sql — CAYLA V2
--
-- INCIDENTE (2026-09-17, noche): la PR de Taxonomía (ADR-0095, tejido/patrón/
-- talla/etiqueta cerrados) se fusionó a `main` reemplazando `variantes.talla`
-- (texto) por `variantes.talla_id` — pero producción todavía no tenía esa
-- columna. Esa sesión lo sabía y lo dejó anotado ("backend y frontend tienen
-- que moverse juntos"), pero el cambio de base quedó bloqueado por el propio
-- entorno ("Production Deploy" denegado) — solo el frontend llegó a `main`.
-- Resultado: `getCatalogo()` (Vender/Cambios/Devoluciones/Buscar) y
-- `getProducto()` (`/productos/[id]/editar`) rompían en el segundo que Vercel
-- desplegara el código nuevo contra la base vieja.
--
-- Ok puntual de Felipe ("Aplica las migraciones pendientes a producción") para
-- aplicar el resto de la cadena — este archivo es el registro de la ÚLTIMA
-- pieza: reconciliar `fn_productos`/`fn_prioridad_conteo`/
-- `catalogo_crear_producto`/`catalogo_actualizar_producto`, que la propia
-- cadena de migraciones de Taxonomía (`20260917100800`, `20260917100600`)
-- redefinía partiendo de versiones ANTERIORES a los cambios de esta sesión —
-- perdiendo `p_orden`/`foto_url` (Grilla, ADR-0077), `valor_en_riesgo`
-- (ADR-0074/PR#77) y la remoción del `SKU` obligatorio en edición (que ya
-- vivía en producción antes de hoy). El resto de la cadena de Taxonomía
-- (`pegar-en-produccion-taxonomia-parte-segura.sql`, `20260917100500`,
-- `20260917100600` solo en su parte de `crear_producto_con_variantes`,
-- `20260917100700`, `20260917100900`) se aplicó tal cual — sin reconciliar,
-- porque no tocaba nada de lo que esta sesión había construido.
--
-- QUÉ NO SE APLICÓ A PROPÓSITO: `20260917110000_familias_categorias_reales.sql`
-- (renombra/fusiona categorías reales que una encargada de sede ve hoy en el
-- desplegable) — es una decisión de negocio sobre CUÁNDO cambiar ese
-- vocabulario, no una corrección técnica; queda pendiente del ok explícito
-- de Felipe, por separado. `20260917120000`/`20260917130000`/`20260917140000`
-- tampoco se aplicaron solas: su contenido ya vive completo dentro de
-- `pegar-en-produccion-taxonomia-parte-segura.sql` (esa sesión los consolidó
-- ahí antes de terminar) — aplicarlos de nuevo habría intentado recrear
-- funciones/tablas ya existentes.
--
-- DE PASO, LIMPIEZA: `catalogo_crear_producto` (firma vieja de 8 parámetros,
-- sin tejido/patrón) y `crear_producto_con_variantes` (firma huérfana de 11
-- parámetros con stock_minimo/temporada/fotos, de otra sesión en curso que
-- nunca llegó a `main` — el frontend fusionado llama la de 7) quedaron con
-- una sobrecarga duplicada cada una tras aplicar la cadena de Taxonomía —
-- mismo bug de ambigüedad de RPC que ya tumbó `/productos` esta tarde.
-- Dropeadas ambas; barrido completo del esquema después: cero sobrecargas
-- duplicadas en todo `retail`.
--
-- Verificado antes de dar esto por cerrado: `select proname from pg_proc ...
-- where pg_get_functiondef ~ 'v.talla[^_]'` da cero filas (ninguna función
-- quedó apuntando a la columna vieja); `fn_productos` con búsqueda/orden real
-- y `select ... talla:tallas(valor) ...` (el patrón exacto de `getCatalogo()`)
-- devuelven datos reales, no error de relación.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- fn_prioridad_conteo: talla_id + valor_en_riesgo (ADR-0074/PR#77) ----------
create or replace function retail.fn_prioridad_conteo(p_ubicacion_id uuid, p_alcance_categoria_id uuid default null)
returns table(variante_id uuid, sku text, referencia text, talla text, color text, dias_sin_contar integer, valor_en_riesgo numeric)
language plpgsql
stable security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para ver la prioridad de conteo de esa ubicación';
  end if;

  return query
  select
    va.id,
    va.sku,
    p.referencia,
    ta.valor,
    co.nombre,
    (
      select extract(day from now() - max(c.cerrado_en))::integer
      from conteos c
      join conteo_items ci on ci.conteo_id = c.id
      where ci.variante_id = va.id and c.ubicacion_id = p_ubicacion_id and c.estado = 'cerrado'
    ) as dias_sin_contar,
    (st.cantidad * va.precio) as valor_en_riesgo
  from stock st
  join variantes va on va.id = st.variante_id
  join productos p on p.id = va.producto_id
  left join tallas ta on ta.id = va.talla_id
  left join colores co on co.codigo = va.color_codigo
  where st.ubicacion_id = p_ubicacion_id
    and st.cantidad > 0
    and (p_alcance_categoria_id is null or p.categoria_id = p_alcance_categoria_id)
  order by
    (
      select max(c2.cerrado_en) from conteos c2 join conteo_items ci2 on ci2.conteo_id = c2.id
      where ci2.variante_id = va.id and c2.ubicacion_id = p_ubicacion_id and c2.estado = 'cerrado'
    ) asc nulls first,
    (st.cantidad * va.precio) desc
  limit 20;
end;
$function$;

-- ---------- fn_productos: talla_id + p_orden + foto_url (ADR-0077) ----------
create or replace function retail.fn_productos(p_busqueda text default null, p_categoria_id uuid default null, p_color_codigo text default null, p_estado text default null, p_precio_min numeric default null, p_precio_max numeric default null, p_stock text default null, p_pagina integer default 1, p_por_pagina integer default 24, p_orden text default null)
returns table(total_productos bigint, producto_id uuid, referencia text, codigo text, categoria_id uuid, categoria_nombre text, estado text, stock_minimo integer, stock_total integer, demanda_diaria numeric, lead_time_dias numeric, punto_reorden integer, reponer_de_proveedor boolean, variante_id uuid, variante_codigo text, sku text, talla text, color_codigo text, color_nombre text, color_hex text, foto_url text, precio numeric, costo numeric, activo boolean, codigos_barras text[])
language plpgsql
stable security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
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
    ta.valor,
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

-- ---------- catalogo_crear_producto / catalogo_actualizar_producto: talla_id + color_codigo en fotos + sin SKU obligatorio en edición ----------
drop function if exists retail.catalogo_crear_producto(text, jsonb, uuid, text, integer, text, boolean, jsonb);

create or replace function retail.catalogo_crear_producto(
  p_referencia text,
  p_variantes jsonb,
  p_categoria_id uuid default null,
  p_descripcion text default null,
  p_stock_minimo integer default null,
  p_temporada text default null,
  p_permitir_venta_sin_stock boolean default false,
  p_fotos jsonb default '[]'::jsonb,
  p_tejido_id uuid default null,
  p_patron_id uuid default null
) returns uuid
language plpgsql
set search_path = retail, public
as $$
declare
  v_producto_id uuid;
  v_variante jsonb;
  v_fila record;
  v_ya_principal boolean := false;
  v_talla_id uuid;
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
  if p_tejido_id is not null and not exists (
    select 1 from categoria_tejidos where categoria_id = p_categoria_id and tejido_id = p_tejido_id
  ) then
    raise exception 'Ese tejido no está habilitado para la categoría elegida.';
  end if;
  if p_patron_id is not null and not exists (
    select 1 from categoria_patrones where categoria_id = p_categoria_id and patron_id = p_patron_id
  ) then
    raise exception 'Ese patrón no está habilitado para la categoría elegida.';
  end if;

  insert into productos (categoria_id, referencia, descripcion, stock_minimo, temporada, permitir_venta_sin_stock, tejido_id, patron_id)
  values (
    p_categoria_id,
    trim(p_referencia),
    nullif(trim(coalesce(p_descripcion, '')), ''),
    p_stock_minimo,
    nullif(trim(coalesce(p_temporada, '')), ''),
    coalesce(p_permitir_venta_sin_stock, false),
    p_tejido_id,
    p_patron_id
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

    v_talla_id := nullif(v_variante->>'talla_id', '')::uuid;
    if v_talla_id is not null and not exists (
      select 1 from categoria_tallas where categoria_id = p_categoria_id and talla_id = v_talla_id
    ) then
      raise exception 'Esa talla no está habilitada para la categoría elegida.';
    end if;

    insert into variantes (producto_id, color_codigo, talla_id, sku, precio, costo)
    values (
      v_producto_id,
      nullif(v_variante->>'color_codigo', ''),
      v_talla_id,
      trim(v_variante->>'sku'),
      (v_variante->>'precio')::numeric,
      coalesce((v_variante->>'costo')::numeric, 0)
    );
  end loop;

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

comment on function retail.catalogo_crear_producto(text, jsonb, uuid, text, integer, text, boolean, jsonb, uuid, uuid) is
  'Alta de producto+variantes+fotos+tejido/patrón/talla_id para /productos/nuevo vía ProductoForm.tsx (V2). Cada foto con color_codigo? opcional (20260917190000, perdido al sumar tejido/patrón en 20260917100600, recuperado acá).';

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
  p_fotos jsonb default null,
  p_tejido_id uuid default null,
  p_patron_id uuid default null
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
  v_talla_id uuid;
begin
  if p_referencia is null or trim(p_referencia) = '' then
    raise exception 'Falta la referencia del producto.';
  end if;
  if p_stock_minimo is not null and p_stock_minimo < 0 then
    raise exception 'El stock mínimo no puede ser negativo.';
  end if;
  if p_tejido_id is not null and not exists (
    select 1 from categoria_tejidos where categoria_id = p_categoria_id and tejido_id = p_tejido_id
  ) then
    raise exception 'Ese tejido no está habilitado para la categoría elegida.';
  end if;
  if p_patron_id is not null and not exists (
    select 1 from categoria_patrones where categoria_id = p_categoria_id and patron_id = p_patron_id
  ) then
    raise exception 'Ese patrón no está habilitado para la categoría elegida.';
  end if;

  update productos
    set categoria_id = p_categoria_id,
        referencia = trim(p_referencia),
        descripcion = nullif(trim(coalesce(p_descripcion, '')), ''),
        estado = p_estado,
        stock_minimo = p_stock_minimo,
        temporada = nullif(trim(coalesce(p_temporada, '')), ''),
        permitir_venta_sin_stock = coalesce(p_permitir_venta_sin_stock, false),
        tejido_id = p_tejido_id,
        patron_id = p_patron_id
    where id = p_producto_id;

  if not found then
    raise exception 'El producto % no existe.', p_producto_id;
  end if;

  for v_variante in select * from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb))
  loop
    -- Ya no se exige SKU acá: las prendas del censo nacen sin él
    -- (crear_producto_con_variantes) y exigirlo en cada edición las dejaba
    -- sin poder editarse nunca más (fix ya vivo en producción antes de hoy,
    -- preservado al reconciliar con talla_id).
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
      v_talla_id := nullif(v_variante->>'talla_id', '')::uuid;
      if v_talla_id is not null and not exists (
        select 1 from categoria_tallas where categoria_id = p_categoria_id and talla_id = v_talla_id
      ) then
        raise exception 'Esa talla no está habilitada para la categoría elegida.';
      end if;

      insert into variantes (producto_id, color_codigo, talla_id, sku, precio, costo)
      values (
        p_producto_id,
        nullif(v_variante->>'color_codigo', ''),
        v_talla_id,
        nullif(trim(v_variante->>'sku'), ''),
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

comment on function retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text, integer, text, boolean, jsonb, uuid, uuid) is
  'Edición de producto+variantes+fotos+tejido/patrón/talla_id para /productos/[id]/editar (V2). No exige SKU en variantes ya existentes (fix previo, preservado). Fotos con color_codigo? opcional, recuperado tras perderse en 20260917100600.';

-- ---------- limpieza: sobrecargas huérfanas de otras sesiones en curso ----------
drop function if exists retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, integer, text, boolean, jsonb, uuid, uuid);
