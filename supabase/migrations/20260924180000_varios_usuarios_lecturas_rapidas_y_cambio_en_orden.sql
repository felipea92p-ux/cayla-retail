-- ============================================================================
-- 20260924180000_varios_usuarios_lecturas_rapidas_y_cambio_en_orden.sql — CAYLA V2 · ADR-0194
-- (varios usuarios a la vez, etapa 3: prueba de carga con un año de volumen)
--
-- EL PROBLEMA PRIMERO. Con un año de operación sintética (6 tiendas, 24.000 variantes, 131.000 ventas, 407.000
-- movimientos; base `cayla_carga`, igual a producción función por función) y 15 a 50 personas usando el ERP a la vez,
-- el sistema se saturaba antes de las 30 personas: atendía MENOS operaciones con 30 (18/s) que con 15 (31/s). No por
-- las ventas (esas ya estaban bien protegidas, ADR-0188–0193) sino por dos lecturas que acaparaban la base y hacían
-- esperar a todas las demás, incluida la caja que cobra:
--   1. `fn_ventas_del_dia` (Vender ▸ «ventas de hoy», se pide en cada apertura de Vender): filtraba
--      `(created_at at time zone 'America/Lima')::date = hoy`, que no puede usar índice → recorría TODA la historia
--      de ventas; y Postgres metía la consulta de «¿es líder?» dentro del WHERE → fn_es_lider() 2 veces por venta.
--      ~2 s por llamada con 15 personas, >8 s (tiempo agotado: la pantalla falla) con 30.
--   2. `fn_productos` (Existencias / Productos): calculaba demanda de 30 días y tiempo de reposición con dos
--      subconsultas laterales dentro de un cruce producto × variante × stock-de-cada-sede (~144.000 filas) y RECIÉN
--      después elegía la página de 50. ~300.000 bloques leídos por llamada; >8 s con 15 personas.
--   Además, sin relación con la carga pero medido en la misma prueba:
--   3. «Ventas de una prenda» (Historial ▸ buscar por prenda) y «compras de una clienta» recorrían venta_items y
--      ventas enteras: faltaban los índices de venta_items.variante_id y ventas.cliente_id (555.790 → 624 bloques).
--   4. `registrar_cambio` bloqueaba el stock de la prenda devuelta y después el de la nueva, en el orden en que
--      llegan; una venta de esas dos prendas en la misma tienda las bloquea en orden por id (ADR-0190). Cruce posible →
--      Postgres cancela una de las dos (40P01). Era el pendiente «registrar_cambio sin fn_bloquear_en_orden».
--   5. 37 políticas de 31 tablas (todo el catálogo) evaluaban auth.role() fila por fila (pendiente de ADR-0188).
--      Impacto medido: dentro del ruido; se deja por higiene y porque el asesor de Supabase lo marca.
--
-- QUÉ HACE
--   A. fn_ventas_del_dia: «hoy» como rango de created_at (usa ventas_ubicacion_fecha_idx) y quién pregunta en una CTE
--      MATERIALIZED (una sola llamada a fn_es_lider()). Mismo resultado (comparado por md5 como líder y como integrante).
--   B. fn_productos: stock, demanda, reposición y precio mínimo agrupados UNA vez por producto; sin filtro de stock (lo
--      normal) se elige la página primero y las cifras se calculan solo para esos productos. Y siempre con plan a medida
--      (`plan_cache_mode = force_custom_plan`): el plan genérico que PL/pgSQL usa desde la 6ª llamada era 12× más lento. Mismo resultado en 10
--      combinaciones de filtros × 2 perfiles (md5 idéntico); 2–6 % del trabajo de antes.
--   C. registrar_cambio: `fn_bloquear_en_orden(p_ubicacion_id, [prenda devuelta, prenda nueva])` justo después de leer
--      la caja con `for share`, igual que registrar_venta. Parche sobre la definición VIVA (local y producción pueden
--      diferir); el ancla tiene que estar exactamente una vez o aborta sin cambiar nada; con la marca ADR-0194 ya
--      puesta, no hace nada (re-pegable).
--   D. Políticas: auth.role()/auth.uid()/auth.jwt() sueltos → (select …): se evalúan una vez por consulta.
--   E. Índices venta_items(variante_id) y ventas(cliente_id) parcial.
--
-- QUÉ NO HACE. No toca datos ni mensajes. No cambia la forma de ninguna respuesta (la web no cambia). No resuelve lo
-- que es de diseño y queda para decidir (ADR-0194 «Lo que queda»): Vender descarga el catálogo entero y el stock de
-- todas las sedes en cada apertura; fn_resumen_variantes recalcula todo el catálogo (9,8 s con un año de datos).
--
-- ORDEN AL PEGAR: después de 20260924110000 (ancla de caja de ADR-0188) y 20260924130000 (fn_bloquear_en_orden).
-- PARA PEGAR EN PRODUCCIÓN: trae `set search_path`, no hace falta el prefijo `retail.`. Re-pegable.
-- Prueba: `pnpm pruebas:lecturas-rapidas-y-cambio` (mismo resultado que antes + cambio sin bloqueo mutuo).
-- ============================================================================

set search_path = retail, public, extensions;

-- ----------------------------------------------------------------------------
-- A. fn_ventas_del_dia
-- ----------------------------------------------------------------------------

create or replace function retail.fn_ventas_del_dia(p_ubicacion_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(venta_id uuid, hora text, ubicacion_nombre text, vendedor text, cliente_nombre text, items jsonb, total numeric, metodos_pago text, comprobante_tipo text, comprobante_texto text, comprobante_estado text, nota text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
  -- ADR-0194: «hoy» como RANGO de created_at (desde la medianoche de Lima, 24 h) para que use
  -- ventas_ubicacion_fecha_idx / ventas_created_at_id_idx. Antes comparaba `(created_at at time zone …)::date = hoy`,
  -- que no puede usar índice: cada apertura de Vender recorría TODAS las ventas de la historia (131.000 en un año:
  -- ~3 s, y con 30 cajas a la vez se pasaba de los 8 s). Quién pregunta (líder / su tienda) se calcula UNA vez
  -- («materialized»: sin eso Postgres mete la CTE en el WHERE y llama a fn_es_lider() dos veces por venta).
  with quien as materialized (
    select fn_es_lider() as lider,
           fn_ubicacion_actual_persona() as mia,
           ((now() at time zone 'America/Lima')::date::timestamp at time zone 'America/Lima') as ini
  )
  select
    v.id,
    to_char(v.created_at at time zone 'America/Lima', 'HH24:MI'),
    u.nombre,
    coalesce(per.nombres || ' ' || per.apellidos, '—'),
    coalesce(cli.nombre, 'Cliente varios'),
    (select jsonb_agg(jsonb_build_object(
        'referencia', pr.referencia, 'talla', ta.valor, 'color', co.nombre,
        'cantidad', vi.cantidad, 'precio_unitario', vi.precio_unitario
      ) order by vi.id)
      from venta_items vi
      join variantes va on va.id = vi.variante_id
      join productos pr on pr.id = va.producto_id
      left join tallas ta on ta.id = va.talla_id
      left join colores co on co.codigo = va.color_codigo
      where vi.venta_id = v.id),
    (select coalesce(sum(vi.subtotal), 0) from venta_items vi where vi.venta_id = v.id),
    (select string_agg(distinct vp.metodo, ' + ') from venta_pagos vp where vp.venta_id = v.id),
    cmp.tipo,
    case when cmp.id is not null then cmp.serie || '-' || lpad(cmp.numero::text, 6, '0') else null end,
    cmp.estado,
    v.nota
  from quien q
  join ventas v
    on v.created_at >= q.ini and v.created_at < q.ini + interval '1 day'
   and ((q.lider and (p_ubicacion_id is null or v.ubicacion_id = p_ubicacion_id))
        or (not q.lider and v.ubicacion_id = q.mia))
  join ubicaciones u on u.id = v.ubicacion_id
  -- El «vendedor» es quien atendió (ADR-0161); si la caja no eligió a nadie, la sesión que cobró.
  left join public.personas per on per.id = coalesce(v.asesora_id, v.usuario_id)
  left join clientas cli on cli.id = v.cliente_id
  -- Un comprobante por venta: el vigente y, entre iguales, el más nuevo.
  left join lateral (
    select c.id, c.tipo, c.serie, c.numero, c.estado
    from comprobantes c
    where c.venta_id = v.id
    order by (c.estado in ('anulado', 'no_emitido')), c.created_at desc, c.id
    limit 1
  ) cmp on true
  where v.estado = 'completada'
  order by v.created_at desc;
$function$;

-- ----------------------------------------------------------------------------
-- B. fn_productos
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
           p.marca_id, mc.nombre as marca_nombre, p.proveedor_id, pv.nombre as proveedor_nombre
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
  -- Stock de todas las sedes y sububicaciones, como el `sum(s.cantidad)` de antes.
  por_stock as (
    select v.producto_id, sum(s.cantidad) as cantidad
    from variantes v
    join stock s on s.variante_id = v.id
    where v.producto_id in (select o.id from objetivo o)
    group by v.producto_id
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
      b.marca_id, b.marca_nombre, b.proveedor_id, b.proveedor_nombre,
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
-- C. registrar_cambio: los candados en orden fijo (parche sobre la definición viva)
-- ----------------------------------------------------------------------------

do $$
declare
  c_marca constant text := 'ADR-0194';
  c_ancla constant text := 'select id into v_caja_id from cajas where ubicacion_id = p_ubicacion_id and estado = ''abierta'' for share;';
  v_oid oid;
  v_def text;
  v_veces int;
begin
  if (select count(*) from pg_proc where proname = 'registrar_cambio' and pronamespace = 'retail'::regnamespace) <> 1 then
    raise exception 'ADR-0194: retail.registrar_cambio no tiene exactamente una versión. Revisar antes de pegar.';
  end if;
  select oid into v_oid from pg_proc where proname = 'registrar_cambio' and pronamespace = 'retail'::regnamespace;
  v_def := pg_get_functiondef(v_oid);
  if position(c_marca in v_def) > 0 then
    raise notice 'ADR-0194: registrar_cambio ya estaba parchada';
    return;
  end if;
  v_veces := (length(v_def) - length(replace(v_def, c_ancla, ''))) / length(c_ancla);
  if v_veces <> 1 then
    raise exception 'ADR-0194: registrar_cambio no tiene el ancla de caja de ADR-0188 exactamente una vez (aparece % veces). ¿Se pegó 20260924110000 antes?', v_veces;
  end if;
  execute replace(v_def, c_ancla, c_ancla || format(
    E'\n  -- %s: los candados en orden fijo (prenda devuelta y prenda nueva) antes de mover nada, como registrar_venta:\n'
    '  -- un cambio y una venta de las mismas dos prendas ya no pueden esperarse en círculo.\n'
    '  perform fn_bloquear_en_orden(p_ubicacion_id, array[v_item.variante_id, p_variante_nueva_id]);', c_marca));
  raise notice 'ADR-0194: registrar_cambio parchada';
end;
$$;

-- ----------------------------------------------------------------------------
-- D. Políticas: auth.role()/uid()/jwt() una vez por consulta
-- ----------------------------------------------------------------------------

do $$
declare
  r record;
  v_using text;
  v_check text;
  n int := 0;
begin
  -- Sin search_path, pg_get_expr escribe los nombres completos (auth.role()), que es lo que se busca.
  perform set_config('search_path', '', true);
  for r in
    select c.relname as tabla, p.polname as nombre,
           pg_get_expr(p.polqual, p.polrelid) as usando, pg_get_expr(p.polwithcheck, p.polrelid) as chequeo
    from pg_policy p join pg_class c on c.oid = p.polrelid
    where c.relnamespace = 'retail'::regnamespace
  loop
    v_using := regexp_replace(r.usando, '(?<!SELECT )auth\.(role|uid|jwt)\(\)', '(SELECT auth.\1())', 'g');
    v_check := regexp_replace(r.chequeo, '(?<!SELECT )auth\.(role|uid|jwt)\(\)', '(SELECT auth.\1())', 'g');
    if v_using is distinct from r.usando or v_check is distinct from r.chequeo then
      execute format('alter policy %I on retail.%I', r.nombre, r.tabla)
        || case when r.usando is not null then format(' using (%s)', v_using) else '' end
        || case when r.chequeo is not null then format(' with check (%s)', v_check) else '' end;
      n := n + 1;
    end if;
  end loop;
  perform set_config('search_path', 'retail, public, extensions', true);
  raise notice 'ADR-0194: % políticas ahora evalúan auth.* una vez por consulta', n;
end;
$$;

-- ----------------------------------------------------------------------------
-- E. Índices de las búsquedas por prenda y por clienta
-- ----------------------------------------------------------------------------

create index if not exists venta_items_variante_idx on venta_items (variante_id);
create index if not exists ventas_cliente_idx on ventas (cliente_id) where cliente_id is not null;

notify pgrst, 'reload schema';
