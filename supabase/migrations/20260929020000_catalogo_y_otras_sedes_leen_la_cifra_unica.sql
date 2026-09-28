-- ============================================================================
-- 20260929020000 — Catálogo y «Dónde más hay» leen la cifra única (ADR-0270, tareas #3 y #4, parte de la base)
--
-- EL PROBLEMA
--   Tres funciones sumaban `stock` crudo, cada una a su manera, y por eso no coincidían con Existencias:
--     · `fn_productos` y `fn_productos_resumen` (la tarjeta «Stock total N», la cabecera y los filtros del Catálogo):
--       toda la red con Cuarentena, apartadas, tallas retiradas y productos de prueba.
--     · `fn_stock_por_sede` («Dónde más hay», «En la red», las otras sedes de Vender, Cambios y Apartados): físico con
--       Cuarentena y apartadas. Una talla toda apartada en Lima se ofrecía desde Trujillo como si estuviera libre.
--
-- QUÉ CAMBIA
--   Las tres leen `fn_existencias_base` (20260929010000) y usan lo DISPONIBLE (físico − dañado − apartado) sin tallas
--   retiradas. Nada más: mismas firmas, mismas columnas, mismo orden y los mismos candados de quién entra. La web no
--   cambia de llamada.
--   · Catálogo: la cifra sigue siendo la de la RED (de ella sale «Pedir a proveedor»: se le compra a la empresa). Las
--     alertas (sin stock, bajo, pedir) ya no se encienden para un producto de prueba, que no tiene cifra.
--   · Nueva `fn_existencias_productos(ids, sede)`: lo de la sede elegida, las otras tiendas, el Taller y lo que viene
--     en camino, por producto, para la tarjeta del Catálogo («3 aquí · +60 en Lima»). Decisiones 1-5 de ADR-0270.
--
-- ANTES DE REEMPLAZAR (parches vivos)
--   Se compararon los cuerpos de producción con los de este repo el 2026-09-28 (md5 de `prosrc`): `fn_productos`
--   8af6c222…, `fn_productos_resumen` 47a84cb8… y `fn_stock_por_sede` 5432a9ba… son idénticos a sus últimas
--   migraciones (20260924180000, 20260922120000, 20260922170000). Ninguna tiene un `reemplazar_vivo`. Si al pegar la
--   huella ya no coincide, alguien las cambió después: parar y comparar.
--
-- NÚMEROS (medidos el 2026-09-28 en un Postgres 17 desechable, con 3 000 productos y 90 000 filas de stock: la escala
-- del ADR-0194, ~7 veces lo que se espera en 3 años; misma transacción, antes y después intercalados)
--   · Página del Catálogo sin filtro:           21 → 44 ms
--   · Catálogo con filtro «Sin stock»:          49 → 270 ms
--   · Cabecera (`fn_productos_resumen`):       215 → 340 ms
--   · `fn_stock_por_sede_json` (Vender al abrir): 285 → 405 ms, y el paquete baja de 11,2 a 9,6 MB (ya no manda ceros)
--   El costo es agrupar las filas con más columnas (dañado, apartado, en camino, talla retirada) que la suma cruda. Se
--   probó sacar `security definer`/`search_path` de la fórmula para que Postgres la incorporara a cada consulta: no
--   cambió nada medible, así que quedó con el patrón de siempre. Todo muy por debajo de los 8 s de PostgREST; si un día
--   pesa, el camino es que Vender pida solo las tallas que muestra en vez de la red entera (eso ya era así antes).
--
-- PRODUCCIÓN
--   Solo `create or replace function` y `grant`: sin políticas ni `alter table` (ADR-0195). Se pega DESPUÉS de
--   20260929010000, entera, en una sola parte.
-- ============================================================================

set lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- A. fn_productos — solo cambia `por_stock` (la cifra) y las alertas de un producto de prueba
-- ----------------------------------------------------------------------------

create or replace function retail.fn_productos(p_busqueda text DEFAULT NULL::text, p_categoria_id uuid DEFAULT NULL::uuid, p_color_codigo text DEFAULT NULL::text, p_estado text DEFAULT NULL::text, p_precio_min numeric DEFAULT NULL::numeric, p_precio_max numeric DEFAULT NULL::numeric, p_stock text DEFAULT NULL::text, p_pagina integer DEFAULT 1, p_por_pagina integer DEFAULT 24, p_orden text DEFAULT NULL::text, p_marca_id uuid DEFAULT NULL::uuid, p_proveedor_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_productos bigint, producto_id uuid, referencia text, codigo text, categoria_id uuid, categoria_nombre text, estado text, stock_minimo integer, stock_total integer, demanda_diaria numeric, lead_time_dias numeric, punto_reorden integer, reponer_de_proveedor boolean, variante_id uuid, variante_codigo text, sku text, talla text, color_codigo text, color_nombre text, color_hex text, foto_url text, precio numeric, costo numeric, activo boolean, codigos_barras text[], marca_id uuid, marca_nombre text, proveedor_id uuid, proveedor_nombre text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
-- ADR-0194 (varios usuarios a la vez, etapa 2): mismo resultado que la versión anterior, pero cada cifra por producto
-- (stock total, demanda de 30 días, tiempo de reposición, precio mínimo) se calcula UNA vez, agrupada, en vez de
-- dentro de un cruce producto × variante × stock-de-cada-sede con dos subconsultas laterales por fila. Con 3.000
-- productos y 6 tiendas eran ~144.000 filas intermedias antes de elegir la página de 50: ~1 s con una persona y
-- más de 8 s (tiempo agotado) con 15 a la vez.
-- plan_cache_mode = force_custom_plan: PL/pgSQL, desde la 6ª llamada en la misma conexión, pasa a un plan «genérico»
-- que no conoce los filtros (p_stock, p_busqueda… vienen null) y no puede descartar ramas: 70 ms → 800 ms por llamada.
-- PostgREST reutiliza conexiones, así que en producción casi TODAS las llamadas iban por el plan genérico. Y sin filtro de stock (lo normal al abrir la pantalla) esas cifras se
-- calculan solo para los productos de la página.
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
  with base as (
    select p.id, p.referencia, p.codigo, p.categoria_id, c.nombre as categoria_nombre, p.estado, p.stock_minimo,
           p.marca_id, mc.nombre as marca_nombre, p.proveedor_id, pv.nombre as proveedor_nombre, p.es_prueba
    from productos p
    left join categorias c on c.id = p.categoria_id
    left join marcas mc on mc.id = p.marca_id
    left join proveedores pv on pv.id = p.proveedor_id
    where p.id <> c_cargo_especial
      and (v_productos is null or p.id = any(v_productos))
      and (p_categoria_id is null or p.categoria_id = p_categoria_id)
      and (p_estado is null or p.estado = p_estado)
      and (p_marca_id is null or p.marca_id = p_marca_id)
      and (p_proveedor_id is null or p.proveedor_id = p_proveedor_id)
  ),
  -- Por producto, sobre sus variantes (el join interno de antes: un producto sin variantes no aparece).
  por_variantes as (
    select v.producto_id,
      min(v.precio) as precio_min,
      bool_or(p_color_codigo is null or v.color_codigo = p_color_codigo) as color_ok,
      bool_or((p_precio_min is null or v.precio >= p_precio_min) and (p_precio_max is null or v.precio <= p_precio_max)) as precio_ok
    from variantes v
    where v.producto_id in (select b.id from base b)
    group by v.producto_id
  ),
  -- Lo que ya se puede decidir sin cifras: color y precio. Sin filtro de stock, la página tampoco depende de las
  -- cifras (se ordena por referencia o por precio mínimo), así que se elige ANTES y las cifras se calculan solo para
  -- esos productos. Con filtro de stock hay que calcularlas para todos, como siempre.
  candidatos as (
    select b.id, b.referencia, pvar.precio_min
    from base b join por_variantes pvar on pvar.producto_id = b.id
    where pvar.color_ok and pvar.precio_ok
  ),
  pagina_previa as (
    select c.id from candidatos c
    where p_stock is null
    order by
      case when p_orden = 'precio_asc' then c.precio_min end asc,
      case when p_orden = 'precio_desc' then c.precio_min end desc,
      c.referencia, c.id
    limit v_por_pagina offset (v_pagina - 1) * v_por_pagina
  ),
  objetivo as (
    select c.id from candidatos c where p_stock is not null
    union all
    select pp.id from pagina_previa pp
  ),
  -- ADR-0270: la cifra única (`fn_existencias_base`). Lo DISPONIBLE de toda la red (todas las sedes y el Taller): sin
  -- Cuarentena, sin apartadas y sin tallas retiradas; un producto de prueba no tiene cifra. Antes era `sum(stock.cantidad)`
  -- crudo, con todo eso adentro: «Stock total 58» no coincidía con ninguna otra pantalla. Es la cifra de la RED porque de
  -- ella salen «Pedir a proveedor» y los filtros (se le compra a la empresa, no a una tienda); lo de la sede elegida lo
  -- trae aparte `fn_existencias_productos` para la tarjeta.
  por_stock as (
    select e.producto_id, sum(e.disponible) as cantidad
    from fn_existencias_base(null, array(select o.id from objetivo o)) e
    where not e.talla_retirada
    group by e.producto_id
  ),
  demanda as (
    select v2.producto_id, sum(m.cantidad)::numeric / 30 as demanda_diaria
    from movimientos m
    join variantes v2 on v2.id = m.variante_id
    where m.tipo = 'salida' and m.motivo = 'venta'
      and m.created_at >= now() - interval '30 days'
      and v2.producto_id in (select o.id from objetivo o)
    group by v2.producto_id
  ),
  lead_time as (
    select v3.producto_id, avg(lo.fecha_recepcion::date - cm.fecha_emision)::numeric as lead_time_dias
    from movimientos m3
    join variantes v3 on v3.id = m3.variante_id
    join lotes lo on lo.id = m3.lote_id
    join compra_items ci on ci.id = m3.compra_item_id
    join compras cm on cm.id = ci.compra_id
    where m3.tipo = 'entrada' and m3.motivo = 'recepcion'
      and v3.producto_id in (select o.id from objetivo o)
    group by v3.producto_id
  ),
  agregado as (
    select b.id, b.referencia, b.codigo, b.categoria_id, b.categoria_nombre, b.estado, b.stock_minimo,
      b.marca_id, b.marca_nombre, b.proveedor_id, b.proveedor_nombre, b.es_prueba,
      coalesce(ps.cantidad, 0)::integer as stock_total,
      pvar.precio_min, pvar.color_ok, pvar.precio_ok,
      coalesce(d.demanda_diaria, 0) as demanda_diaria,
      coalesce(lt.lead_time_dias, 14) as lead_time_dias
    from base b
    join objetivo o on o.id = b.id
    join por_variantes pvar on pvar.producto_id = b.id
    left join por_stock ps on ps.producto_id = b.id
    left join demanda d on d.producto_id = b.id
    left join lead_time lt on lt.producto_id = b.id
  ),
  con_reorden as (
    select
      agregado.*,
      ceil(agregado.demanda_diaria * agregado.lead_time_dias)::integer + coalesce(agregado.stock_minimo, 0) as punto_reorden
    from agregado
  ),
  filtrado as (
    select con_reorden.*,
      (con_reorden.estado = 'activo' and not con_reorden.es_prueba and con_reorden.stock_total <= con_reorden.punto_reorden and con_reorden.demanda_diaria > 0) as reponer_de_proveedor
    from con_reorden
    where con_reorden.color_ok
      and con_reorden.precio_ok
      and (
        p_stock is null
        or (p_stock = 'sin_stock' and con_reorden.estado = 'activo' and not con_reorden.es_prueba and con_reorden.stock_total = 0)
        or (p_stock = 'bajo' and con_reorden.estado = 'activo' and not con_reorden.es_prueba and con_reorden.stock_total > 0 and con_reorden.stock_minimo is not null and con_reorden.stock_total < con_reorden.stock_minimo)
        or (p_stock = 'reponer' and con_reorden.estado = 'activo' and not con_reorden.es_prueba and con_reorden.stock_total <= con_reorden.punto_reorden and con_reorden.demanda_diaria > 0)
      )
  ),
  pagina as (
    -- Sin filtro de stock, `filtrado` ya ES la página: el total son los candidatos y no se vuelve a saltar filas.
    select f.*, case when p_stock is null then (select count(*) from candidatos) else count(*) over () end::bigint as total
    from filtrado f
    order by
      case when p_orden = 'precio_asc' then f.precio_min end asc,
      case when p_orden = 'precio_desc' then f.precio_min end desc,
      f.referencia, f.id
    limit v_por_pagina offset case when p_stock is null then 0 else (v_pagina - 1) * v_por_pagina end
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

-- ----------------------------------------------------------------------------
-- B. fn_productos_resumen — la misma cifra que la lista
-- ----------------------------------------------------------------------------

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
      p.es_prueba,
      count(distinct v.id)::bigint as num_variantes,
      coalesce(max(st.cantidad), 0)::integer as stock_total,
      bool_or(p_color_codigo is null or v.color_codigo = p_color_codigo) as color_ok,
      bool_or(
        (p_precio_min is null or v.precio >= p_precio_min)
        and (p_precio_max is null or v.precio <= p_precio_max)
      ) as precio_ok,
      coalesce(max(vd.demanda_diaria), 0) as demanda_diaria,
      coalesce(max(lt.lead_time_dias), 14) as lead_time_dias
    from productos p
    join variantes v on v.producto_id = p.id
    -- ADR-0270: la misma cifra que la lista (`fn_productos`): lo disponible de la red, sin tallas retiradas ni pruebas.
    left join (
      select e.producto_id, sum(e.disponible) as cantidad
      from fn_existencias_base(null, null) e
      where not e.talla_retirada
      group by e.producto_id
    ) st on st.producto_id = p.id
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
    group by p.id, p.estado, p.stock_minimo, p.es_prueba
  ),
  filtrado as (
    select *,
      ceil(demanda_diaria * lead_time_dias)::integer + coalesce(stock_minimo, 0) as punto_reorden
    from agregado where color_ok and precio_ok
  )
  select
    count(*)::bigint,
    coalesce(sum(num_variantes), 0)::bigint,
    count(*) filter (where estado = 'activo' and not es_prueba and stock_total > 0 and stock_minimo is not null and stock_total < stock_minimo)::bigint,
    count(*) filter (where estado = 'activo' and not es_prueba and stock_total = 0)::bigint,
    count(*) filter (where estado = 'activo' and not es_prueba and stock_total <= punto_reorden and demanda_diaria > 0)::bigint
  from filtrado;
end;
$function$;

-- ----------------------------------------------------------------------------
-- C. fn_stock_por_sede — lo disponible, no lo físico (mismo candado de quién entra)
-- ----------------------------------------------------------------------------

create or replace function retail.fn_stock_por_sede()
returns table (variante_id uuid, ubicacion_id uuid, cantidad integer)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  -- ADR-0270: lo que otra sede puede ofrecer de verdad. Sin Cuarentena, sin apartadas, sin tallas retiradas, sin
  -- pruebas ni «Monto manual». Antes: `sum(stock.cantidad)` físico. Solo sedes activas, como antes.
  -- Solo lo que es > 0: la web ya ignoraba los ceros (`agruparStockPorSede`: «una sede que suma cero no se nombra») y
  -- `fn_stock_por_sede_json` los empaquetaba todos en un solo JSON que Vender descarga al abrir.
  select e.variante_id, e.ubicacion_id, e.disponible as cantidad
  from fn_existencias_base(null, null) e
  join ubicaciones u on u.id = e.ubicacion_id and u.activo
  where not e.talla_retirada
    and e.disponible > 0
    and exists (
      select 1
      from colaboradores c
      join public.personas p on p.id = c.persona_id
      where p.auth_user_id = auth.uid() and p.estado = 'activo' and c.estado = 'activo'
    );
$$;

-- ----------------------------------------------------------------------------
-- D. fn_existencias_productos — la tarjeta del Catálogo: aquí, otras sedes, Taller, en camino
-- ----------------------------------------------------------------------------

create or replace function retail.fn_existencias_productos(p_producto_ids uuid[], p_ubicacion_id uuid)
returns table (
  producto_id         uuid,
  aqui                integer,
  apartado_aqui       integer,
  danado_aqui         integer,
  en_camino_aqui      integer,
  en_otras_tiendas    integer,
  en_taller           integer,
  otras               jsonb,
  en_tallas_retiradas integer
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  -- Una fila por producto con algo que contar (sin filas: nunca tuvo stock → la pantalla muestra 0).
  --   aqui / apartado_aqui / danado_aqui / en_camino_aqui   la sede elegida arriba (ADR-0270, decisiones 1, 2, 3 y 5)
  --   en_otras_tiendas + otras                             el resto de tiendas activas, sede por sede («+60 en Lima»)
  --   en_taller                                            aparte, nunca sumado a lo que se vende (decisión 4)
  --   en_tallas_retiradas                                  unidades físicas en tallas desactivadas, en toda la red:
  --                                                         no se venden, así que no suman arriba; se muestran como aviso
  with e as (
    select x.*, u.nombre, u.tipo
    from fn_existencias_base(null, p_producto_ids) x
    join ubicaciones u on u.id = x.ubicacion_id and u.activo
    where fn_tiene_acceso_retail()
  ),
  otras_sedes as (
    select e.producto_id, e.ubicacion_id, e.nombre, sum(e.disponible)::integer as disponible
    from e
    where not e.talla_retirada and e.tipo <> 'taller' and e.ubicacion_id is distinct from p_ubicacion_id
    group by e.producto_id, e.ubicacion_id, e.nombre
    having sum(e.disponible) > 0
  )
  select e.producto_id,
         coalesce(sum(e.disponible) filter (where not e.talla_retirada and e.ubicacion_id = p_ubicacion_id), 0)::integer,
         coalesce(sum(e.apartado)   filter (where not e.talla_retirada and e.ubicacion_id = p_ubicacion_id), 0)::integer,
         coalesce(sum(e.danado)     filter (where not e.talla_retirada and e.ubicacion_id = p_ubicacion_id), 0)::integer,
         coalesce(sum(e.en_camino)  filter (where not e.talla_retirada and e.ubicacion_id = p_ubicacion_id), 0)::integer,
         coalesce(sum(e.disponible) filter (where not e.talla_retirada and e.tipo <> 'taller'
                                              and e.ubicacion_id is distinct from p_ubicacion_id), 0)::integer,
         coalesce(sum(e.disponible) filter (where not e.talla_retirada and e.tipo = 'taller'
                                              and e.ubicacion_id is distinct from p_ubicacion_id), 0)::integer,
         coalesce((select jsonb_agg(jsonb_build_object('ubicacion_id', o.ubicacion_id, 'sede', o.nombre, 'disponible', o.disponible)
                                    order by o.disponible desc, o.nombre)
                   from otras_sedes o where o.producto_id = e.producto_id), '[]'::jsonb),
         coalesce(sum(e.fisico) filter (where e.talla_retirada), 0)::integer
  from e
  group by e.producto_id;
$$;

comment on function retail.fn_existencias_productos(uuid[], uuid) is
  'ADR-0270: por producto, lo disponible en la sede elegida (con apartado, dañado y en camino), en las otras tiendas '
  '(sede por sede) y en el Taller, más las unidades en tallas retiradas. Sale de fn_existencias_base: es la misma '
  'cifra que Existencias. Para la tarjeta del Catálogo.';

revoke all on function retail.fn_existencias_productos(uuid[], uuid) from public, anon;
grant execute on function retail.fn_existencias_productos(uuid[], uuid) to authenticated, service_role;
