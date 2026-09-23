-- ============================================================================
-- 20260923193700_costo_solo_con_permiso_de_dinero.sql — el costo de una prenda solo lo ve quien ve el dinero
-- (Felipe, 2026-09-23: opción C «cerrarlo en la base» y regla A «líder o permiso de dinero de compras»).
--
-- EL PROBLEMA PRIMERO. `variantes.costo` se leía con cualquier sesión (`grant select` de la tabla entera a
-- `authenticated`): una colaboradora podía pedirle a la base el costo —y con el precio, el margen— de todo el
-- catálogo, y Conteo le mandaba los 1.295 costos al navegador. Además tres funciones con permisos propios lo
-- devolvían sin preguntar (`fn_productos`, `fn_costo_historial`, `censo_crear_variante`).
-- Chocaba con ADR-0126 (el dinero de compras es de quien tiene ese permiso) y con P5 (Existencias ya lo escondía).
--
-- LA REGLA: `retail.fn_puede_ver_dinero_de_compras()` = líder, o un rol con Facturas de compra, Por pagar o Notas
-- de crédito. Quien la pasa ve todo igual que antes; quien no, recibe el costo VACÍO (null), nunca un 0 que
-- parezca un dato. EXCEPCIÓN decidida (Felipe, opción 2, mantiene P5 de 20260923140000): Análisis
-- (`fn_resumen_comparacion`) NO cambia — quien tiene el módulo Análisis ve ahí el costo de SU sede (la función ya exige
-- `fn_puede_analizar()` y `fn_puede_operar_ubicacion`). Sin costo, la rotación y los márgenes no existen.
--
-- QUÉ CAMBIA
--   1. La columna: `authenticated` lee todas las columnas de `variantes` MENOS `costo`. OJO: una columna NUEVA de
--      `variantes` no se lee hasta agregarla a este `grant` (el de la tabla entera ya no existe).
--   2. Una sola puerta para leer costos: `fn_costos_variantes_json(p_ids)` → {variante_id: costo}, o null sin permiso.
--   3. `fn_soles_diferencia_conteo(conteo)`: la diferencia de un conteo en soles, revisando el permiso UNA vez por
--      conteo (no fila por fila: un censo pasa de 1.000 líneas). La usa `fn_conteos_resumen`, que es INVOKER y ya
--      no puede leer `costo`.
--   4. Las tres funciones devuelven el costo vacío a quien no tiene el permiso (`case when … then … end`; el
--      permiso se evalúa una vez por consulta).
--   5. `catalogo_actualizar_producto` (INVOKER): quien no ve el costo guarda la ficha SIN tocarlo (antes lo habría
--      pisado con 0 al no ver el campo); una variante nueva que crea queda «sin costo» (0) hasta que alguien con
--      permiso lo cargue.
--   Las demás funciones que usan el costo por dentro (registrar_venta, recepciones, producción, Existencias) son
--   SECURITY DEFINER y no cambian.
--
-- Las funciones de la sección 4-5 son la definición VIVA de producción (huella md5 tomada el 2026-09-23) con solo
-- esos cambios. Los permisos (ACL) de una función se conservan con `create or replace`.
-- ============================================================================

-- 1. La columna
revoke select on table retail.variantes from authenticated;
grant select (id, producto_id, color_codigo, sku, precio, activo, created_at, codigo, talla_id) on table retail.variantes to authenticated;

-- 2. La puerta de los costos
create or replace function retail.fn_costos_variantes_json(p_ids uuid[] default null)
returns jsonb
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
  select case when retail.fn_puede_ver_dinero_de_compras() then
    coalesce((select jsonb_object_agg(v.id, v.costo) from retail.variantes v where p_ids is null or v.id = any (p_ids)), '{}'::jsonb)
  end;
$$;
revoke all on function retail.fn_costos_variantes_json(uuid[]) from public, anon;
grant execute on function retail.fn_costos_variantes_json(uuid[]) to authenticated;

-- 3. La diferencia de un conteo en soles
create or replace function retail.fn_soles_diferencia_conteo(p_conteo_id uuid)
returns numeric
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
  select case when retail.fn_puede_ver_dinero_de_compras() then
    coalesce((
      select sum((ci.cantidad_contada - ci.cantidad_sistema) * v.costo)::numeric
        from retail.conteo_items ci
        join retail.variantes v on v.id = ci.variante_id
       where ci.conteo_id = p_conteo_id
    ), 0)
  end;
$$;
revoke all on function retail.fn_soles_diferencia_conteo(uuid) from public, anon;
grant execute on function retail.fn_soles_diferencia_conteo(uuid) to authenticated;

-- 4 y 5. Las funciones, desde su definición viva

CREATE OR REPLACE FUNCTION retail.fn_conteos_resumen(p_ubicacion_id uuid, p_limite integer DEFAULT 20)
 RETURNS TABLE(id uuid, numero integer, estado text, created_at timestamp with time zone, cerrado_en timestamp with time zone, sububicacion_id uuid, sububicacion_nombre text, sububicacion_tipo text, alcance text, alcance_categoria_nombre text, abierto_por uuid, cerrado_por uuid, lineas integer, lineas_con_diferencia integer, sistema integer, contado integer, diferencia integer, soles_diferencia numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
  select c.id,
         c.numero,
         c.estado,
         c.created_at,
         c.cerrado_en,
         c.sububicacion_id,
         s.nombre,
         s.tipo,
         c.alcance,
         cat.nombre,
         c.abierto_por,
         c.cerrado_por,
         coalesce(agg.lineas, 0),
         coalesce(agg.lineas_con_diferencia, 0),
         coalesce(agg.sistema, 0),
         coalesce(agg.contado, 0),
         coalesce(agg.diferencia, 0),
         retail.fn_soles_diferencia_conteo(c.id)
    from conteos c
    left join sububicaciones s on s.id = c.sububicacion_id
    left join categorias cat on cat.id = c.alcance_categoria_id
    left join lateral (
      select count(*)::integer as lineas,
             count(*) filter (where ci.cantidad_contada <> ci.cantidad_sistema)::integer as lineas_con_diferencia,
             sum(ci.cantidad_sistema)::integer as sistema,
             sum(ci.cantidad_contada)::integer as contado,
             sum(ci.cantidad_contada - ci.cantidad_sistema)::integer as diferencia
        from conteo_items ci
       where ci.conteo_id = c.id
    ) agg on true
   where c.ubicacion_id = p_ubicacion_id
   order by (c.estado = 'abierto') desc, c.created_at desc
   limit greatest(p_limite, 1);
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
    case when (select retail.fn_puede_ver_dinero_de_compras()) then v.costo end,
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

CREATE OR REPLACE FUNCTION retail.fn_costo_historial(p_variante_id uuid)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, stock_previo integer, costo_anterior numeric, cantidad_nueva integer, costo_unitario_nuevo numeric, costo_resultante numeric, origen text, usuario_nombre text, lote_guia text, proveedor_nombre text, compra_documento text, produccion_referencia text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
  select
    ch.id, ch.created_at, ch.stock_previo, ch.costo_anterior, ch.cantidad_nueva,
    ch.costo_unitario_nuevo, ch.costo_resultante, ch.origen,
    per.nombres || ' ' || per.apellidos,
    lo.numero_guia, prov.nombre,
    nullif(trim(concat_ws(' ', cp.serie, cp.numero)), ''),
    prod_p.referencia
  from costo_historial ch
  join movimientos m on m.id = ch.movimiento_id
  left join public.personas per on per.id = ch.usuario_id
  left join lotes lo on lo.id = m.lote_id
  left join proveedores prov on prov.id = lo.proveedor_id
  left join compra_items ci on ci.id = m.compra_item_id
  left join compras cp on cp.id = ci.compra_id
  left join producciones prod on prod.id = m.produccion_id
  left join productos prod_p on prod_p.id = prod.producto_id
  where ch.variante_id = p_variante_id
    and (select retail.fn_puede_ver_dinero_de_compras())
  order by ch.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION retail.censo_crear_variante(p_referencia text, p_categoria_id uuid, p_codigo_barras text, p_talla_id uuid DEFAULT NULL::uuid, p_color_codigo text DEFAULT NULL::text, p_costo numeric DEFAULT 0, p_precio numeric DEFAULT 0, p_marca_id uuid DEFAULT NULL::uuid, p_proveedor_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(variante_id uuid, sku text, referencia text, talla text, color text, costo numeric, codigo_barras text, reutilizado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  v_reutilizado boolean := false;
  v_precio numeric := p_precio;
  v_costo numeric := p_costo;
  v_hermana record;
  v_producto_id uuid;
  v_producto_cat uuid;
  v_ref text;
  v_variante_id uuid;
  v_codigo_barras text := trim(p_codigo_barras);
begin
  if coalesce(trim(p_referencia), '') = '' then
    raise exception 'Falta el nombre de la prenda';
  end if;
  if not exists (select 1 from categorias where id = p_categoria_id and activo) then
    raise exception 'Elige una categoría activa del catálogo';
  end if;
  if coalesce(v_codigo_barras, '') = '' then
    raise exception 'Falta el código de barras escaneado';
  end if;
  if exists (select 1 from codigos_barras where codigo = v_codigo_barras) then
    raise exception 'Ese código de barras ya está registrado — vuelve a buscarlo, puede que ya exista en el catálogo.';
  end if;
  if p_precio < 0 then
    raise exception 'El precio de venta no puede ser negativo';
  end if;
  if p_costo < 0 then
    raise exception 'El costo no puede ser negativo';
  end if;

  if p_talla_id is not null then
    if not exists (select 1 from tallas where id = p_talla_id and activo) then
      raise exception 'Esa talla ya no está activa en el vocabulario';
    end if;
    if not exists (select 1 from categoria_tallas where categoria_id = p_categoria_id and talla_id = p_talla_id) then
      raise exception 'Esa talla no está habilitada para esta categoría — pídele a un Líder que la habilite en Catálogo → Categorías';
    end if;
  end if;
  if p_color_codigo is not null and not exists (select 1 from colores where codigo = p_color_codigo and activo) then
    raise exception 'Ese color ya no está activo en el vocabulario';
  end if;

  select pr.id, pr.categoria_id, pr.referencia
    into v_producto_id, v_producto_cat, v_ref
    from productos pr
    where retail.fn_clave_referencia(pr.referencia) = retail.fn_clave_referencia(p_referencia)
      and pr.estado_alta <> 'rechazado';

  if found then
    v_reutilizado := true;
    -- `is distinct from`: el producto «Cargo especial» no tiene categoría (null) y `null <> x` da null.
    if v_producto_cat is distinct from p_categoria_id then
      raise exception 'Ya existe "%" en otra categoría — un nombre identifica a un solo producto. Búscalo en el catálogo o cambia el nombre.', v_ref;
    end if;
    -- ¿La variante ya existe (misma talla y color)? Es otro código de barras
    -- para lo mismo: lo frena el índice variantes_producto_talla_color_unico,
    -- y error-escritura.ts lo traduce a frase humana (mismo commit).
  else
    -- Solo cuando se CREA el producto: si el nombre ya existe, la variante se cuelga del que hay y su marca no se toca.
    perform fn_validar_marca_proveedor(p_marca_id, p_proveedor_id);
    begin
      insert into productos (categoria_id, referencia, marca_id, proveedor_id)
        values (p_categoria_id, trim(p_referencia), p_marca_id, p_proveedor_id)
        returning id, productos.referencia into v_producto_id, v_ref;
    exception when unique_violation then
      -- Dos escaneos del mismo nombre nuevo casi a la vez: el segundo pierde la carrera contra el índice único.
      -- No es un error de la persona: se cuelga del producto que el primero acaba de crear.
      select pr.id, pr.categoria_id, pr.referencia into v_producto_id, v_producto_cat, v_ref
        from productos pr
        where retail.fn_clave_referencia(pr.referencia) = retail.fn_clave_referencia(p_referencia)
          and pr.estado_alta <> 'rechazado';
      if not found or v_producto_cat is distinct from p_categoria_id then
        raise;
      end if;
      v_reutilizado := true;
    end;
  end if;

  -- Una variante colgada de un producto que YA existe (y está aprobado) no pasa por la cola de revisión del
  -- Líder: el aviso «pendiente de revisión» no aplica y nadie completaría un precio en 0 (revisión adversarial
  -- del PR). Por eso: (1) quien no es Líder no fija precio ni costo de algo ya aprobado, (2) un 0 —el «déjalo
  -- en 0 y lo completa el Líder» de la pantalla— no pisa un precio real. En ambos casos hereda el de una
  -- variante hermana (la del mismo color primero, y la de mayor precio a igualdad). Un Líder que escribe
  -- un precio a propósito lo conserva.
  if v_reutilizado then
    if not fn_puede_editar_catalogo() or coalesce(p_precio, 0) = 0 or coalesce(p_costo, 0) = 0 then
      select v.precio, v.costo into v_hermana
        from variantes v
        where v.producto_id = v_producto_id and v.activo
        order by (v.color_codigo is not distinct from p_color_codigo) desc, v.precio desc
        limit 1;
      if found then
        if not fn_puede_editar_catalogo() or coalesce(p_precio, 0) = 0 then v_precio := v_hermana.precio; end if;
        if not fn_puede_editar_catalogo() or coalesce(p_costo, 0) = 0 then v_costo := v_hermana.costo; end if;
      end if;
    end if;
  end if;

  insert into variantes (producto_id, talla_id, color_codigo, precio, costo)
    values (v_producto_id, p_talla_id, p_color_codigo, v_precio, v_costo)
    returning id into v_variante_id;

  perform fn_asignar_codigo_variante(v_variante_id);

  insert into codigos_barras (codigo, variante_id, origen)
    values (v_codigo_barras, v_variante_id, 'fabrica');

  return query
    select v.id, v.sku, v_ref, t.valor, c.nombre, case when (select retail.fn_puede_ver_dinero_de_compras()) then v.costo end, v_codigo_barras, v_reutilizado
    from variantes v
      left join tallas t on t.id = v.talla_id
      left join colores c on c.codigo = v.color_codigo
    where v.id = v_variante_id;
end;
$function$;

CREATE OR REPLACE FUNCTION retail.catalogo_actualizar_producto(p_producto_id uuid, p_referencia text, p_estado text, p_variantes jsonb, p_categoria_id uuid DEFAULT NULL::uuid, p_descripcion text DEFAULT NULL::text, p_stock_minimo integer DEFAULT NULL::integer, p_temporada text DEFAULT NULL::text, p_permitir_venta_sin_stock boolean DEFAULT false, p_fotos jsonb DEFAULT NULL::jsonb, p_tejido_id uuid DEFAULT NULL::uuid, p_patron_id uuid DEFAULT NULL::uuid, p_marca_id uuid DEFAULT NULL::uuid, p_proveedor_id uuid DEFAULT NULL::uuid, p_confirmo_distinto boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'retail', 'public'
AS $function$
declare
  -- 20260923193700: el costo solo lo fija quien puede verlo; quien no, guarda la ficha sin tocarlo.
  v_ve_costo boolean := retail.fn_puede_ver_dinero_de_compras();
  v_variante jsonb;
  v_id uuid;
  v_fila record;
  v_foto_id uuid;
  v_ids_mantener uuid[];
  v_ya_principal boolean := false;
  v_talla_id uuid;
  v_ref_actual text;
  v_estado_actual text;
  v_estado_alta_actual text;
  v_ref_nueva text;
  v_marca_actual uuid;
  v_proveedor_actual uuid;
  v_tejido_actual uuid;
  v_patron_actual uuid;
  v_par_id uuid;
  v_par_ref text;
  v_par_nivel text;
  v_exige boolean;
  v_familia_nombre text;
begin
  if p_referencia is null or trim(p_referencia) = '' then
    raise exception 'Falta la referencia del producto.';
  end if;
  if p_stock_minimo is not null and p_stock_minimo < 0 then
    raise exception 'El stock mínimo no puede ser negativo.';
  end if;

  select referencia, marca_id, proveedor_id, estado, estado_alta, tejido_id, patron_id
    into v_ref_actual, v_marca_actual, v_proveedor_actual, v_estado_actual, v_estado_alta_actual, v_tejido_actual, v_patron_actual
    from productos where id = p_producto_id;
  if not found then
    raise exception 'El producto % no existe.', p_producto_id;
  end if;

  -- Renombrar: la misma regla de nombre que al crear. Solo si el nombre CAMBIA de verdad
  -- (una clave distinta): pasar de "blusa aurora" a "Blusa Aurora" no es un nombre nuevo.
  v_ref_nueva := fn_titulo_referencia(p_referencia);
  if fn_clave_referencia(v_ref_nueva) is null then
    raise exception 'El nombre del producto necesita al menos una letra o un número.';
  end if;
  if fn_clave_referencia(v_ref_nueva) is distinct from fn_clave_referencia(v_ref_actual) then
    select b.id, b.referencia, b.nivel into v_par_id, v_par_ref, v_par_nivel
      from buscar_productos_parecidos(v_ref_nueva, p_producto_id) b
      where b.nivel in ('identico', 'una_letra')
      order by (b.nivel = 'identico') desc
      limit 1;
    if v_par_nivel = 'identico' then
      raise exception 'Ya existe un producto llamado "%". Búscalo en Productos en vez de renombrar este.', v_par_ref
        using hint = 'nombre_duplicado', detail = v_par_id::text;
    end if;
    if v_par_nivel = 'una_letra' and not coalesce(p_confirmo_distinto, false) then
      raise exception 'Ya existe "%", que se escribe casi igual. Si es el mismo producto, ábrelo; si es otro de verdad, confírmalo.', v_par_ref
        using hint = 'nombre_casi_igual', detail = v_par_id::text;
    end if;
  end if;

  -- Marca y proveedor: sin mandar ninguno, no cambian. Mandando cualquiera, la pareja resultante
  -- tiene que ser válida (una sola regla, la misma que al crear).
  -- También al REACTIVAR un producto descontinuado: si su marca o su proveedor se desactivaron mientras tanto,
  -- volver a ponerlo activo saltaría el candado de desactivar (revisión adversarial del PR).
  if p_marca_id is not null or p_proveedor_id is not null or (p_estado = 'activo' and v_estado_actual is distinct from 'activo') then
    perform fn_validar_marca_proveedor(coalesce(p_marca_id, v_marca_actual), coalesce(p_proveedor_id, v_proveedor_actual));
  end if;

  -- Una prenda rechazada en el censo no se reactiva (productos_rechazado_descontinuado_check): si fue un error,
  -- se vuelve a crear con Nuevo producto, que pasa por el candado de nombre. Aquí se dice con palabras.
  if p_estado = 'activo' and v_estado_alta_actual = 'rechazado' then
    raise exception 'Esta prenda se rechazó al revisar un alta al vuelo y no se puede reactivar. Créala de nuevo con Nuevo producto.'
      using hint = 'rechazado_no_reactivable';
  end if;

  -- Exigencias de la familia (Indumentaria: tejido y patrón). Al EDITAR la regla es «no empeora»: un producto ACTIVO
  -- que YA tenía tejido o patrón no puede quedarse sin él; uno que nunca lo tuvo se guarda igual (ver la cabecera:
  -- 38 de los 39 productos activos no los tienen, y exigirlos habría impedido hasta cambiar un precio). Para
  -- descontinuar una prenda no se pide nada. Nuevo producto (crear_producto_con_variantes) sí los exige siempre.
  if p_estado = 'activo' then
    select f.exige_tejido_patron, f.nombre into v_exige, v_familia_nombre
      from categorias c left join familias f on f.codigo = c.familia
      where c.id = p_categoria_id;
    if coalesce(v_exige, false) then
      if p_tejido_id is null and v_tejido_actual is not null then
        raise exception 'En % esta prenda ya tenía tejido y no se puede dejar sin él. Elige uno.', v_familia_nombre using hint = 'tejido_obligatorio';
      end if;
      if p_patron_id is null and v_patron_actual is not null then
        raise exception 'En % esta prenda ya tenía patrón y no se puede dejar sin él (si es sin diseño, elige Liso).', v_familia_nombre using hint = 'patron_obligatorio';
      end if;
    end if;
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
        referencia = v_ref_nueva,
        descripcion = nullif(trim(coalesce(p_descripcion, '')), ''),
        estado = p_estado,
        stock_minimo = p_stock_minimo,
        temporada = nullif(trim(coalesce(p_temporada, '')), ''),
        permitir_venta_sin_stock = coalesce(p_permitir_venta_sin_stock, false),
        tejido_id = p_tejido_id,
        patron_id = p_patron_id,
        marca_id = coalesce(p_marca_id, marca_id),
        proveedor_id = coalesce(p_proveedor_id, proveedor_id)
    where id = p_producto_id;
  -- Esta función es SECURITY INVOKER: si la RLS deniega el UPDATE, no falla, simplemente no toca nada. La versión
  -- anterior lo notaba (chequeaba `found` DESPUÉS del update); al moverlo antes, un guardado sin permiso «salía bien»
  -- sin cambiar nada (revisión adversarial del PR). Se vuelve a comprobar acá.
  if not found then
    raise exception 'No se pudo guardar el producto: no existe o no tienes permiso para editarlo.';
  end if;

  for v_variante in select * from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb))
  loop
    if v_variante->>'precio' is null then
      raise exception 'Cada variante necesita un precio.';
    end if;

    v_id := nullif(v_variante->>'id', '')::uuid;

    if v_id is not null then
      if v_ve_costo then
        update variantes
          set precio = (v_variante->>'precio')::numeric,
              costo = coalesce((v_variante->>'costo')::numeric, 0),
              activo = coalesce((v_variante->>'activo')::boolean, true)
          where id = v_id and producto_id = p_producto_id;
      else
        update variantes
          set precio = (v_variante->>'precio')::numeric,
              activo = coalesce((v_variante->>'activo')::boolean, true)
          where id = v_id and producto_id = p_producto_id;
      end if;
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
        case when v_ve_costo then coalesce((v_variante->>'costo')::numeric, 0) else 0 end
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
$function$;
