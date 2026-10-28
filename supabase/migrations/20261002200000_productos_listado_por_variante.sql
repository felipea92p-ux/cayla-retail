-- ============================================================================
-- 20261002200000 — Productos: el listado filtra por VARIANTE, con talla, temporada, faltas y stock de la sede
--                  (ADR-0308, tanda 2; decisiones de Felipe del 2026-10-02)
--
-- EL PROBLEMA
--   La barra de filtros de /productos (docs/pantallas/productos-filtros.md) necesita filtros que `fn_productos` no tiene
--   (Talla, Color por familia y varios a la vez, Temporada, «Por completar», «Hay en mi sede») y tiene tres defectos:
--   · Cada filtro de variante se decidía por separado: «existe una talla negra» Y «existe una talla de hasta S/ 80». Una
--     blusa con una talla roja a S/ 50 y una negra a S/ 120 salía al pedir «negra hasta S/ 80», sin ninguna negra a ese
--     precio. Aquí se exigen a LA MISMA variante: existe una variante negra, en M, de hasta S/ 80 y con stock aquí.
--   · El precio y el color contaban variantes desactivadas, que la pantalla esconde desde 17671448 (el resumen contaba
--     580 variantes y la lista 578 en producción, 2026-10-02).
--   · «Sin stock» medía solo la red: la tienda de Lima, vacía, no tenía cómo decir «no hay aquí».
--   Y el buscador: sin tildes no encontraba («sueter» ≠ «Suéter»), no buscaba por categoría ni color («blusa negra») y
--   `%`/`_` eran comodines («50%» traía casi todo).
--
-- QUÉ AGREGA (todo NUEVO: `fn_productos`, `fn_productos_resumen` y `fn_productos_buscar` no se tocan)
--   La web publicada sigue llamando a las de hoy hasta que se fusione su PR; si esto reemplazara `fn_productos`, la web
--   quedaría caída entre pegar y fusionar (el error del #444). Las viejas se borran en una limpieza posterior.
--   · fn_productos_buscar_palabras(texto): cada palabra tiene que aparecer (en cualquier campo), sin tildes ni
--     mayúsculas (`fn_clave_texto`, la del repo; sin extensiones nuevas), con `strpos` (los símbolos son literales). Busca
--     en nombre, código, marca, proveedor, CATEGORÍA, y en sku, código y COLOR de cada variante. Una palabra de 4 letras o
--     más pierde su final -a/-o/-as/-os: «negra» encuentra «Negro», «blusa» encuentra «Blusas». Y el código de barras
--     exacto, como siempre.
--   · fn_productos_filtro(...): una fila por variante visible (las activas; o todas, si la prenda no tiene ninguna activa:
--     la misma regla que la pantalla) con una marca por filtro (`f_*`). Es el ÚNICO lugar donde se define qué cumple cada
--     filtro: el listado (aquí) y los conteos por opción (20261002200100) la leen, así nunca dicen cosas distintas.
--   · fn_productos_listado(...): las mismas columnas que `fn_productos`, con los filtros nuevos, sin variantes
--     desactivadas en el precio y con la regla «la misma variante».
--
-- DISPONIBILIDAD (`p_disponibilidad`, decisión de Felipe: las dos medidas, cada una rotulada)
--   en_sede   hay al menos una variante que cumple los demás filtros con stock disponible en `p_ubicacion_id`.
--   sin_sede  prenda activa (no de prueba) con variantes que cumplen y NINGUNA con stock en `p_ubicacion_id`.
--   sin_red   lo que era `sin_stock`: activa, no de prueba, 0 disponible en toda la red.
--   bajo      lo que era `bajo` (pide `stock_minimo`). reponer: lo que era `reponer` (punto de reorden, 30 días).
--   La cifra es la única (`fn_existencias_base`, ADR-0270): disponible = físico − dañado − apartado, sin tallas retiradas.
--
-- VOLUMEN (principio 5): hoy 86 productos / 578 variantes; a 3 años, 1 000–2 500 productos y 7 000–17 000 variantes. El
--   filtro es una pasada por esas filas; el stock (lo caro: ~340 ms a 3 000 productos, 20260929020000) se pide solo si hay
--   filtro de disponibilidad, y si no, solo para la página. `plan_cache_mode = force_custom_plan` por la misma razón que
--   `fn_productos` (ADR-0194: el plan genérico no descarta ramas).
--
-- ORDEN DE PEGADO: esta parte, después 20261002200100 (facetas). Las dos ANTES de fusionar el PR de la tanda 2. Se pueden
--   pegar sin apuro: solo crean funciones nuevas (ni `alter` de tablas en uso ni políticas: no hay riesgo de 40P01).
-- ============================================================================

set lock_timeout = '3s';

-- ── Buscador por palabras ────────────────────────────────────────────────────────────────────────────────────────────
create or replace function retail.fn_productos_buscar_palabras(p_busqueda text)
returns uuid[]
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with consulta as (
    select retail.fn_clave_texto(p_busqueda) as texto
  ),
  palabras as (
    -- «negra» → «negr» (encuentra «negro»), «blusas» → «blus»; las cortas («azul», «rosa» no: 4 letras sí) se recortan
    -- solo si terminan en a/o. Es una regla de catálogo, no de lingüística: amplía un poco, nunca deja fuera lo escrito.
    select distinct case when length(w) >= 4 then regexp_replace(w, '(as|os|a|o)$', '') else w end as raiz
    from consulta c, regexp_split_to_table(c.texto, ' ') as w
    where c.texto is not null and w <> ''
  ),
  textos as (
    select p.id,
           concat_ws(' ',
             retail.fn_clave_texto(p.referencia), retail.fn_clave_texto(p.codigo),
             retail.fn_clave_texto(mc.nombre), retail.fn_clave_texto(pv.nombre), retail.fn_clave_texto(ca.nombre),
             -- sku y código de TODAS las variantes (una etiqueta vieja sigue encontrando su prenda); el color, solo de las que
             -- la pantalla muestra (si no, «blusa rosa» traía una blusa a la que le apagaron el rosado).
             (select string_agg(concat_ws(' ', retail.fn_clave_texto(v.sku), retail.fn_clave_texto(v.codigo),
                       case when v.activo or not exists (select 1 from retail.variantes va where va.producto_id = p.id and va.activo)
                            then retail.fn_clave_texto(co.nombre) end), ' ')
                from retail.variantes v
                left join retail.colores co on co.codigo = v.color_codigo
               where v.producto_id = p.id)
           ) as texto
    from retail.productos p
    left join retail.marcas mc on mc.id = p.marca_id
    left join retail.proveedores pv on pv.id = p.proveedor_id
    left join retail.categorias ca on ca.id = p.categoria_id
  ),
  por_palabras as (
    select t.id
    from textos t
    where exists (select 1 from palabras)
      and not exists (select 1 from palabras w where strpos(t.texto, w.raiz) = 0)
  ),
  por_codigo_de_barras as (
    select v.producto_id as id
    from retail.codigos_barras cb
    join retail.variantes v on v.id = cb.variante_id
    where lower(cb.codigo) = lower(btrim(coalesce(p_busqueda, '')))
  )
  select coalesce(array_agg(distinct x.id), '{}'::uuid[])
  from (select id from por_palabras union select id from por_codigo_de_barras) x;
$$;

-- ── El filtro: una fila por variante visible, una marca por filtro ───────────────────────────────────────────────────
-- `drop … if exists` antes del create: es una función NUEVA de esta tanda, interna (solo la leen el listado y los conteos,
-- que se crean después en este mismo lote), y así el archivo se puede volver a pegar aunque su forma cambie.
drop function if exists retail.fn_productos_filtro(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, boolean);
create or replace function retail.fn_productos_filtro(
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
  p_ubicacion_id uuid default null,
  -- true solo si se filtra «aquí» (en_sede / sin_sede): el stock de la sede es la parte cara y casi nunca hace falta.
  p_con_stock boolean default false
)
returns table (
  producto_id uuid, variante_id uuid, precio numeric, color_codigo text, familia_color text, talla_id uuid, temporada text,
  categoria_id uuid, marca_id uuid, proveedor_id uuid, estado text, es_prueba boolean, stock_minimo integer,
  f_busqueda boolean, f_categoria boolean, f_marca boolean, f_proveedor boolean, f_estado boolean, f_falta boolean,
  f_color boolean, f_talla boolean, f_precio boolean, f_temporada boolean, f_disp boolean,
  disp_sede integer, talla_retirada boolean,
  -- Para los conteos por opción (20261002200100): si a la prenda le falta la foto, y si ESTA variante hay en la sede.
  sin_foto boolean, hay_en_sede boolean
)
language sql
stable
security definer
set search_path = retail, public, extensions
set plan_cache_mode = force_custom_plan
as $$
  -- `materialized`: sin él, Postgres copia esta expresión en cada fila de variante y el buscador (que recorre el catálogo)
  -- corría 2 veces por variante: ~5 s con 86 prendas y más de 8 s (el límite de PostgREST) con ~130. Lo encontró la revisión
  -- adversaria del 2026-10-02; la prueba exige UNA llamada por listado.
  with params as materialized (
    select
      case when nullif(btrim(coalesce(p_busqueda, '')), '') is null then null
           else retail.fn_productos_buscar_palabras(p_busqueda) end as ids_busqueda,
      -- El uuid nulo es «sin marca» / «sin proveedor» (ADR-0283), como en `fn_productos`.
      nullif(p_marca_id, '00000000-0000-0000-0000-000000000000'::uuid) as marca,
      nullif(p_proveedor_id, '00000000-0000-0000-0000-000000000000'::uuid) as proveedor,
      nullif(p_colores, '{}') as colores,
      nullif(p_familias, '{}') as familias,
      nullif(p_tallas, '{}') as tallas
  ),
  visibles as (
    -- La regla de la pantalla (`variantesQueSeVenden`, productos-vista.ts): las activas; y si la prenda no tiene NINGUNA
    -- activa, todas (para que no desaparezca de la lista y se pueda abrir para reactivarla). Antes era «activas o prenda
    -- descontinuada»: una activa con todas sus tallas apagadas desaparecía y en una descontinuada contaban las apagadas.
    select v.id as variante_id, v.producto_id, v.precio, v.color_codigo, co.familia_color, v.talla_id,
           p.categoria_id, p.marca_id, p.proveedor_id, p.estado, p.es_prueba, p.stock_minimo,
           coalesce(pct.temporada, p.temporada, ca.temporada) as temporada,
           not exists (select 1 from retail.producto_fotos pf where pf.producto_id = p.id) as sin_foto
    from retail.variantes v
    join retail.productos p on p.id = v.producto_id
    left join retail.categorias ca on ca.id = p.categoria_id
    left join retail.colores co on co.codigo = v.color_codigo
    -- La temporada de cada color, como `fn_temporada_efectiva_nucleo`: la del color, si no la del producto, si no la
    -- de su categoría.
    left join retail.producto_color_temporadas pct on pct.producto_id = v.producto_id and pct.color_codigo = v.color_codigo
    where p.id <> '11111111-1111-4111-8111-111111111111'::uuid -- «Monto manual»: no es una prenda
      and (v.activo or not exists (select 1 from retail.variantes va where va.producto_id = v.producto_id and va.activo))
  ),
  -- Solo la sede pedida (la red la calcula el listado aparte, para la página): `p_con_stock` = hay un filtro «aquí».
  stock_variante as (
    select e.variante_id, sum(e.disponible)::integer as disp_sede, bool_or(e.talla_retirada) as talla_retirada
    from retail.fn_existencias_base(p_ubicacion_id, (select array_agg(distinct vi.producto_id) from visibles vi)) e
    where p_con_stock and p_ubicacion_id is not null
    group by e.variante_id
  )
  select vi.producto_id, vi.variante_id, vi.precio, vi.color_codigo, vi.familia_color, vi.talla_id, vi.temporada,
         vi.categoria_id, vi.marca_id, vi.proveedor_id, vi.estado, vi.es_prueba, vi.stock_minimo,
         (pa.ids_busqueda is null or vi.producto_id = any(pa.ids_busqueda)),
         (p_categoria_id is null or vi.categoria_id = p_categoria_id),
         (p_marca_id is null or vi.marca_id is not distinct from pa.marca),
         (p_proveedor_id is null or vi.proveedor_id is not distinct from pa.proveedor),
         (p_estado is null or vi.estado = p_estado),
         (p_falta is null
           or (p_falta = 'foto' and vi.sin_foto)
           or (p_falta = 'temporada' and vi.temporada is null)
           or (p_falta = 'marca' and vi.marca_id is null)
           or (p_falta = 'proveedor' and vi.proveedor_id is null)),
         -- Color: los colores elegidos O cualquiera de las familias elegidas (dentro del filtro se suma).
         ((pa.colores is null and pa.familias is null)
           or vi.color_codigo = any(coalesce(pa.colores, '{}'))
           or vi.familia_color = any(coalesce(pa.familias, '{}'))),
         (pa.tallas is null or vi.talla_id = any(pa.tallas)),
         ((p_precio_min is null or vi.precio >= p_precio_min) and (p_precio_max is null or vi.precio <= p_precio_max)),
         (p_temporada is null
           or (p_temporada = 'sin' and vi.temporada is null)
           or vi.temporada = p_temporada),
         -- La única disponibilidad que se decide por variante: «hay aquí». Las demás miran la prenda entera (abajo).
         (p_disponibilidad is distinct from 'en_sede'
           or (coalesce(sv.disp_sede, 0) > 0 and not coalesce(sv.talla_retirada, false))),
         coalesce(sv.disp_sede, 0),
         coalesce(sv.talla_retirada, false),
         vi.sin_foto,
         (coalesce(sv.disp_sede, 0) > 0 and not coalesce(sv.talla_retirada, false))
  from visibles vi
  cross join params pa
  left join stock_variante sv on sv.variante_id = vi.variante_id;
$$;

-- ── El listado: las columnas de `fn_productos`, con los filtros nuevos ───────────────────────────────────────────────
create or replace function retail.fn_productos_listado(
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
  p_ubicacion_id uuid default null,
  p_orden text default null,
  p_pagina integer default 1,
  p_por_pagina integer default 20
)
returns table (
  total_productos bigint, producto_id uuid, referencia text, codigo text, categoria_id uuid, categoria_nombre text,
  estado text, stock_minimo integer, stock_total integer, demanda_diaria numeric, lead_time_dias numeric,
  punto_reorden integer, reponer_de_proveedor boolean, variante_id uuid, variante_codigo text, sku text, talla text,
  color_codigo text, color_nombre text, color_hex text, foto_url text, precio numeric, costo numeric, activo boolean,
  codigos_barras text[], marca_id uuid, marca_nombre text, proveedor_id uuid, proveedor_nombre text
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
set plan_cache_mode = force_custom_plan
as $$
#variable_conflict use_column
declare
  v_pagina integer := greatest(1, coalesce(p_pagina, 1));
  v_por_pagina integer := greatest(1, least(coalesce(p_por_pagina, 20), 100));
begin
  if not retail.fn_tiene_acceso_retail() then
    raise exception 'Sin acceso al catálogo' using errcode = '42501';
  end if;
  if p_estado is not null and p_estado not in ('activo', 'descontinuado') then
    raise exception 'Estado de producto desconocido: %', p_estado;
  end if;
  if p_disponibilidad is not null and p_disponibilidad not in ('en_sede', 'sin_sede', 'sin_red', 'bajo', 'reponer') then
    raise exception 'Filtro de disponibilidad desconocido: %', p_disponibilidad;
  end if;
  if p_disponibilidad in ('en_sede', 'sin_sede') and p_ubicacion_id is null then
    raise exception 'Para filtrar por la sede hace falta la sede (p_ubicacion_id)';
  end if;
  if p_falta is not null and p_falta not in ('foto', 'temporada', 'marca', 'proveedor') then
    raise exception 'Falta desconocida: %', p_falta;
  end if;
  if p_orden is not null and p_orden not in ('precio_asc', 'precio_desc', 'recientes', 'antiguos', 'vendidos_desc', 'vendidos_asc') then
    raise exception 'Orden de catálogo desconocido: %', p_orden;
  end if;

  return query
  with filas as (
    select * from retail.fn_productos_filtro(
      p_busqueda, p_categoria_id, p_marca_id, p_proveedor_id, p_colores, p_familias, p_tallas, p_temporada, p_falta,
      p_estado, p_precio_min, p_precio_max, p_disponibilidad, p_ubicacion_id, p_disponibilidad in ('en_sede', 'sin_sede'))
  ),
  -- Una prenda pasa si UNA MISMA variante cumple todo (`cumple`). «Sin stock en la sede» mira las variantes que cumplen
  -- los demás filtros (`cumple_sin_disp`) y exige que ninguna tenga stock aquí.
  por_producto as (
    select fi.producto_id,
           bool_or(fi.f_busqueda and fi.f_categoria and fi.f_marca and fi.f_proveedor and fi.f_estado and fi.f_falta
                   and fi.f_color and fi.f_talla and fi.f_precio and fi.f_temporada and fi.f_disp) as cumple,
           bool_or(fi.f_busqueda and fi.f_categoria and fi.f_marca and fi.f_proveedor and fi.f_estado and fi.f_falta
                   and fi.f_color and fi.f_talla and fi.f_precio and fi.f_temporada
                   and fi.disp_sede > 0 and not fi.talla_retirada) as con_stock_aqui,
           min(fi.precio) as precio_min,
           bool_and(fi.estado = 'activo' and not fi.es_prueba) as vendible
    from filas fi
    group by fi.producto_id
  ),
  base as (
    select p.id, p.referencia, p.codigo, p.categoria_id, c.nombre as categoria_nombre, p.estado, p.stock_minimo,
           p.marca_id, mc.nombre as marca_nombre, p.proveedor_id, pv.nombre as proveedor_nombre, p.es_prueba,
           p.created_at, pp.precio_min, pp.con_stock_aqui, pp.vendible
    from por_producto pp
    join retail.productos p on p.id = pp.producto_id
    left join retail.categorias c on c.id = p.categoria_id
    left join retail.marcas mc on mc.id = p.marca_id
    left join retail.proveedores pv on pv.id = p.proveedor_id
    where pp.cumple
      and (p_disponibilidad is distinct from 'sin_sede' or (pp.vendible and not pp.con_stock_aqui))
  ),
  vendidas as (
    select v2.producto_id, sum(m.cantidad)::numeric as unidades
    from retail.movimientos m
    join retail.variantes v2 on v2.id = m.variante_id
    where p_orden in ('vendidos_desc', 'vendidos_asc')
      and m.tipo = 'salida' and m.motivo = 'venta'
      and m.created_at >= now() - interval '30 days'
      and v2.producto_id in (select b.id from base b)
    group by v2.producto_id
  ),
  candidatos as (
    select b.*, coalesce(vd.unidades, 0) as vendidas
    from base b left join vendidas vd on vd.producto_id = b.id
  ),
  -- Sin filtro de la red (sin_red, bajo, reponer) la página no depende de las cifras: se elige antes y las cifras se
  -- calculan solo para ella. Con uno de esos filtros hay que calcularlas para todos, como en `fn_productos`.
  pagina_previa as (
    select c.id from candidatos c
    where p_disponibilidad is null or p_disponibilidad not in ('sin_red', 'bajo', 'reponer')
    order by
      case when p_orden = 'precio_asc' then c.precio_min end asc,
      case when p_orden = 'precio_desc' then c.precio_min end desc,
      case when p_orden = 'recientes' then c.created_at end desc,
      case when p_orden = 'antiguos' then c.created_at end asc,
      case when p_orden = 'vendidos_desc' then c.vendidas end desc,
      case when p_orden = 'vendidos_asc' then c.vendidas end asc,
      c.referencia, c.id
    limit v_por_pagina offset (v_pagina - 1) * v_por_pagina
  ),
  objetivo as (
    select c.id from candidatos c where p_disponibilidad in ('sin_red', 'bajo', 'reponer')
    union all
    select pp.id from pagina_previa pp
  ),
  por_stock as (
    select e.producto_id, sum(e.disponible) as cantidad
    from retail.fn_existencias_base(null, array(select o.id from objetivo o)) e
    where not e.talla_retirada
    group by e.producto_id
  ),
  demanda as (
    select v2.producto_id, sum(m.cantidad)::numeric / 30 as demanda_diaria
    from retail.movimientos m
    join retail.variantes v2 on v2.id = m.variante_id
    where m.tipo = 'salida' and m.motivo = 'venta'
      and m.created_at >= now() - interval '30 days'
      and v2.producto_id in (select o.id from objetivo o)
    group by v2.producto_id
  ),
  lead_time as (
    select v3.producto_id, avg(lo.fecha_recepcion::date - cm.fecha_emision)::numeric as lead_time_dias
    from retail.movimientos m3
    join retail.variantes v3 on v3.id = m3.variante_id
    join retail.lotes lo on lo.id = m3.lote_id
    join retail.compra_items ci on ci.id = m3.compra_item_id
    join retail.compras cm on cm.id = ci.compra_id
    where m3.tipo = 'entrada' and m3.motivo = 'recepcion'
      and v3.producto_id in (select o.id from objetivo o)
    group by v3.producto_id
  ),
  agregado as (
    select c.*,
           coalesce(ps.cantidad, 0)::integer as stock_total,
           coalesce(d.demanda_diaria, 0) as demanda_diaria,
           coalesce(lt.lead_time_dias, 14) as lead_time_dias
    from candidatos c
    join objetivo o on o.id = c.id
    left join por_stock ps on ps.producto_id = c.id
    left join demanda d on d.producto_id = c.id
    left join lead_time lt on lt.producto_id = c.id
  ),
  con_reorden as (
    select a.*, ceil(a.demanda_diaria * a.lead_time_dias)::integer + coalesce(a.stock_minimo, 0) as punto_reorden
    from agregado a
  ),
  filtrado as (
    select cr.*,
           (cr.estado = 'activo' and not cr.es_prueba and cr.stock_total <= cr.punto_reorden and cr.demanda_diaria > 0) as reponer_de_proveedor
    from con_reorden cr
    where p_disponibilidad is null
       or p_disponibilidad in ('en_sede', 'sin_sede')
       or (p_disponibilidad = 'sin_red' and cr.estado = 'activo' and not cr.es_prueba and cr.stock_total = 0)
       or (p_disponibilidad = 'bajo' and cr.estado = 'activo' and not cr.es_prueba and cr.stock_total > 0
           and cr.stock_minimo is not null and cr.stock_total < cr.stock_minimo)
       or (p_disponibilidad = 'reponer' and cr.estado = 'activo' and not cr.es_prueba
           and cr.stock_total <= cr.punto_reorden and cr.demanda_diaria > 0)
  ),
  pagina as (
    select f.*,
           case when p_disponibilidad in ('sin_red', 'bajo', 'reponer') then count(*) over ()
                else (select count(*) from candidatos) end::bigint as total
    from filtrado f
    order by
      case when p_orden = 'precio_asc' then f.precio_min end asc,
      case when p_orden = 'precio_desc' then f.precio_min end desc,
      case when p_orden = 'recientes' then f.created_at end desc,
      case when p_orden = 'antiguos' then f.created_at end asc,
      case when p_orden = 'vendidos_desc' then f.vendidas end desc,
      case when p_orden = 'vendidos_asc' then f.vendidas end asc,
      f.referencia, f.id
    limit v_por_pagina
    offset case when p_disponibilidad in ('sin_red', 'bajo', 'reponer') then (v_pagina - 1) * v_por_pagina else 0 end
  )
  select pg.total, pg.id, pg.referencia, pg.codigo, pg.categoria_id, pg.categoria_nombre, pg.estado, pg.stock_minimo,
         pg.stock_total, pg.demanda_diaria, pg.lead_time_dias, pg.punto_reorden, pg.reponer_de_proveedor,
         v.id, v.codigo, v.sku, ta.valor, v.color_codigo, co.nombre, co.hex, foto.url, v.precio,
         case when (select retail.fn_puede_ver_dinero_de_compras()) then v.costo end,
         v.activo, coalesce(cb.codigos, '{}'::text[]), pg.marca_id, pg.marca_nombre, pg.proveedor_id, pg.proveedor_nombre
  from pagina pg
  join retail.variantes v on v.producto_id = pg.id
  left join retail.tallas ta on ta.id = v.talla_id
  left join retail.colores co on co.codigo = v.color_codigo
  left join lateral (
    select pf.url from retail.producto_fotos pf
    where pf.producto_id = pg.id and (pf.color_codigo is not distinct from v.color_codigo or pf.color_codigo is null)
    order by (pf.color_codigo is null), pf.orden
    limit 1
  ) foto on true
  left join lateral (
    select array_agg(cb2.codigo order by cb2.codigo) as codigos from retail.codigos_barras cb2 where cb2.variante_id = v.id
  ) cb on true
  order by
    case when p_orden = 'precio_asc' then pg.precio_min end asc,
    case when p_orden = 'precio_desc' then pg.precio_min end desc,
    case when p_orden = 'recientes' then pg.created_at end desc,
    case when p_orden = 'antiguos' then pg.created_at end asc,
    case when p_orden = 'vendidos_desc' then pg.vendidas end desc,
    case when p_orden = 'vendidos_asc' then pg.vendidas end asc,
    pg.referencia, pg.id, ta.valor, v.color_codigo;
end;
$$;

-- `fn_productos_filtro` es una pieza interna: la leen las dos funciones de la pantalla (security definer), nadie más.
revoke all on function retail.fn_productos_filtro(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, boolean) from public, anon, authenticated;
-- El buscador también es interno (security definer: ignora RLS). Solo lo llama `fn_productos_filtro`; quien quiera exponerlo
-- después, que empiece con `fn_tiene_acceso_retail()`.
revoke all on function retail.fn_productos_buscar_palabras(text) from public, anon, authenticated;
revoke all on function retail.fn_productos_listado(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, text, integer, integer) from public, anon;
grant execute on function retail.fn_productos_listado(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, text, integer, integer) to authenticated, service_role;

-- Verificación (solo lectura; debe devolver 3 filas):
--   select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'retail' and proname in ('fn_productos_buscar_palabras', 'fn_productos_filtro', 'fn_productos_listado');
