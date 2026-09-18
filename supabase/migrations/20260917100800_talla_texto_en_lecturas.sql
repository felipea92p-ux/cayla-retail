-- ============================================================================
-- 20260917100800 — Las 7 funciones de lectura que leían variantes.talla
-- directo quedan apuntando a tallas.valor por talla_id
--
-- CÓMO SE ENCONTRARON LAS 7: no confiando en qué migración las tocó por
-- última vez (varias, como fn_productos, se redefinieron 2-3 veces en
-- migraciones distintas) — se consultó pg_get_functiondef contra el
-- Postgres local ya reseteado con 20260917100500 aplicada, buscando
-- `\.talla\M` en el cuerpo real y vigente de cada función del schema
-- retail. Estas 7 son Movimientos, Ventas del día, Prioridad de conteo,
-- Traslados (detalle de línea), Historial de producto, Previsualizar
-- cierre de conteo y el listado de /productos — es decir, casi toda
-- pantalla que muestra una prenda por su talla. `fn_asignar_codigo_variante`
-- y las 3 RPC de alta/edición ya se corrigieron en 20260917100500/100600.
--
-- EL CAMBIO ES MECÁNICO Y NO TOCA NINGÚN TIPO DE SALIDA: cada función
-- sigue devolviendo una columna `talla text` con el mismo nombre — ningún
-- archivo de apps/web/ necesita cambiar, porque la forma del dato hacia
-- afuera no cambió, solo de dónde sale adentro (`tallas.valor` vía
-- `talla_id`, en vez de la columna de texto libre que ya no existe).
-- ============================================================================

CREATE OR REPLACE FUNCTION retail.fn_historial_producto_cambios(p_producto_id uuid)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, entidad text, campo text, valor_anterior text, valor_nuevo text, categoria_anterior_nombre text, categoria_nueva_nombre text, variante_id uuid, variante_sku text, variante_talla text, variante_color text, usuario_id uuid, usuario_nombre text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
  select
    h.id,
    h.created_at,
    h.entidad,
    h.campo,
    h.valor_anterior,
    h.valor_nuevo,
    cat_ant.nombre,
    cat_nue.nombre,
    case when h.entidad = 'variante' then h.entidad_id end,
    va.sku,
    ta.valor,
    co.nombre,
    h.usuario_id,
    per.nombres || ' ' || per.apellidos
  from retail.historial_producto_cambios h
  left join retail.variantes va on h.entidad = 'variante' and va.id = h.entidad_id
  left join retail.tallas ta on ta.id = va.talla_id
  left join retail.colores co on co.codigo = va.color_codigo
  left join retail.categorias cat_ant on cat_ant.id = case when h.campo = 'categoria_id' then h.valor_anterior::uuid end
  left join retail.categorias cat_nue on cat_nue.id = case when h.campo = 'categoria_id' then h.valor_nuevo::uuid end
  left join public.personas per on per.id = h.usuario_id
  where
    (h.entidad = 'producto' and h.entidad_id = p_producto_id)
    or (h.entidad = 'variante' and va.producto_id = p_producto_id)
  order by h.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION retail.fn_prioridad_conteo(p_ubicacion_id uuid, p_alcance_categoria_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(variante_id uuid, sku text, referencia text, talla text, color text, dias_sin_contar integer, ventas_30d integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
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
    coalesce((
      select sum(m.cantidad)::integer
      from movimientos m
      where m.variante_id = va.id and m.ubicacion_id = p_ubicacion_id
        and m.tipo = 'salida' and m.motivo = 'venta'
        and m.created_at >= now() - interval '30 days'
    ), 0) as ventas_30d
  from variantes va
  join productos p on p.id = va.producto_id
  left join tallas ta on ta.id = va.talla_id
  left join colores co on co.codigo = va.color_codigo
  where exists (
      select 1 from stock st
      where st.variante_id = va.id and st.ubicacion_id = p_ubicacion_id and st.cantidad > 0
    )
    and (p_alcance_categoria_id is null or p.categoria_id = p_alcance_categoria_id)
  order by (
    select max(c2.cerrado_en) from conteos c2 join conteo_items ci2 on ci2.conteo_id = c2.id
    where ci2.variante_id = va.id and c2.ubicacion_id = p_ubicacion_id and c2.estado = 'cerrado'
  ) asc nulls first, ventas_30d desc
  limit 20;
end;
$function$;

CREATE OR REPLACE FUNCTION retail.fn_traslado_lineas(p_transferencia_id uuid)
 RETURNS TABLE(variante_id uuid, sku text, referencia text, talla text, color text, cantidad_enviada integer, cantidad_recibida integer, diferencia integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
  select coalesce(ti.variante_id, tr.variante_id), va.sku, p.referencia, ta.valor, co.nombre,
         ti.cantidad, tr.cantidad_recibida, coalesce(tr.cantidad_recibida, 0) - coalesce(ti.cantidad, 0)
  from transferencia_items ti
  full join transferencia_recepciones tr
    on tr.transferencia_id = ti.transferencia_id and tr.variante_id = ti.variante_id
  join variantes va on va.id = coalesce(ti.variante_id, tr.variante_id)
  join productos p on p.id = va.producto_id
  left join tallas ta on ta.id = va.talla_id
  left join colores co on co.codigo = va.color_codigo
  where coalesce(ti.transferencia_id, tr.transferencia_id) = p_transferencia_id
    and exists (select 1 from transferencias t where t.id = p_transferencia_id
      and (fn_puede_operar_ubicacion(t.ubicacion_origen_id) or fn_puede_operar_ubicacion(t.ubicacion_destino_id)));
$function$;

CREATE OR REPLACE FUNCTION retail.fn_ventas_del_dia(p_ubicacion_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(venta_id uuid, hora text, ubicacion_nombre text, vendedor text, cliente_nombre text, items jsonb, total numeric, metodos_pago text, comprobante_tipo text, comprobante_texto text, comprobante_estado text, nota text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
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
  from ventas v
  join ubicaciones u on u.id = v.ubicacion_id
  left join public.personas per on per.id = v.usuario_id
  left join clientes cli on cli.id = v.cliente_id
  left join comprobantes cmp on cmp.venta_id = v.id
  where (v.created_at at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date
    and (
      (fn_es_lider() and (p_ubicacion_id is null or v.ubicacion_id = p_ubicacion_id))
      or (not fn_es_lider() and v.ubicacion_id = fn_ubicacion_actual_persona())
    )
  order by v.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION retail.previsualizar_cierre_conteo(p_conteo_id uuid)
 RETURNS TABLE(variante_id uuid, codigo text, referencia text, talla text, color text, contada integer, sistema integer, diferencia integer, origen text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
  select * from (
  select
    ci.variante_id,
    (select cb.codigo from codigos_barras cb where cb.variante_id = ci.variante_id order by cb.created_at limit 1),
    p.referencia, ta.valor, co.nombre,
    ci.cantidad_contada, ci.cantidad_sistema,
    ci.cantidad_contada - ci.cantidad_sistema,
    'contado'
  from conteo_items ci
  join variantes v on v.id = ci.variante_id
  join productos p on p.id = v.producto_id
  left join tallas ta on ta.id = v.talla_id
  left join colores co on co.codigo = v.color_codigo
  where ci.conteo_id = p_conteo_id

  union all

  select
    s.variante_id,
    (select cb.codigo from codigos_barras cb where cb.variante_id = s.variante_id order by cb.created_at limit 1),
    p.referencia, ta.valor, co.nombre,
    0, sum(s.cantidad)::integer, -sum(s.cantidad)::integer,
    'no_contado'
  from stock s
  join variantes v on v.id = s.variante_id
  join productos p on p.id = v.producto_id
  left join tallas ta on ta.id = v.talla_id
  left join colores co on co.codigo = v.color_codigo
  where s.ubicacion_id = (select ubicacion_id from conteos where id = p_conteo_id)
    and (
      (select sububicacion_id from conteos where id = p_conteo_id) is null
      or s.sububicacion_id = (select sububicacion_id from conteos where id = p_conteo_id)
    )
    and not exists (select 1 from conteo_items ci where ci.conteo_id = p_conteo_id and ci.variante_id = s.variante_id)
  group by s.variante_id, p.referencia, ta.valor, co.nombre
  having sum(s.cantidad) <> 0
  ) t
  where fn_puede_operar_ubicacion((select ubicacion_id from conteos where id = p_conteo_id));
$function$;

CREATE OR REPLACE FUNCTION retail.fn_movimientos(p_ubicacion_id uuid, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_categoria text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text, p_busqueda text DEFAULT NULL::text, p_usuario_id uuid DEFAULT NULL::uuid, p_sububicacion_id uuid DEFAULT NULL::uuid, p_cursor_creado_en timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limite integer DEFAULT 50, p_producto_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, fecha_lima date, hora text, tipo text, categoria text, motivo text, cantidad integer, delta integer, es_sistema boolean, nota text, variante_id uuid, sku text, referencia text, talla text, color text, ubicacion_id uuid, ubicacion_nombre text, ubicacion_destino_id uuid, ubicacion_destino_nombre text, sububicacion_id uuid, sububicacion_nombre text, sububicacion_tipo text, sububicacion_destino_id uuid, sububicacion_destino_nombre text, sububicacion_destino_tipo text, usuario_id uuid, usuario_nombre text, venta_id uuid, venta_nota text, comprobante_tipo text, comprobante_numero text, comprobante_estado text, lote_id uuid, lote_guia text, lote_nota text, proveedor_nombre text, compra_id uuid, compra_documento text, transferencia_id uuid, transferencia_estado text, transferencia_nota text, conteo_id uuid, conteo_cantidad_sistema integer, conteo_cantidad_contada integer, devolucion_id uuid, devolucion_motivo text, devolucion_estado text, cambio_id uuid, cambio_diferencia numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  v_busqueda text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_variantes uuid[];
  v_variantes_producto uuid[];
  v_limite integer := greatest(1, least(coalesce(p_limite, 50), 200)) + 1;
  v_desde timestamptz := (p_desde::timestamp) at time zone 'America/Lima';
  v_hasta timestamptz := ((p_hasta + 1)::timestamp) at time zone 'America/Lima';
begin
  if p_ubicacion_id is null then
    raise exception 'Falta indicar la ubicación cuyos movimientos quieres ver';
  end if;
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para ver los movimientos de esa ubicación';
  end if;
  if p_categoria is not null and p_categoria not in ('entrada', 'salida', 'interno', 'ajuste', 'transferencia') then
    raise exception 'Categoría de movimiento desconocida: %', p_categoria;
  end if;
  if (p_cursor_creado_en is null) <> (p_cursor_id is null) then
    raise exception 'El cursor de paginado viene incompleto';
  end if;

  if v_busqueda is not null then
    v_variantes := fn_movimientos_variantes(v_busqueda);
    if coalesce(array_length(v_variantes, 1), 0) = 0 then return; end if;
  end if;

  if p_producto_id is not null then
    select coalesce(array_agg(v.id), '{}'::uuid[]) into v_variantes_producto
    from variantes v where v.producto_id = p_producto_id;
    if coalesce(array_length(v_variantes_producto, 1), 0) = 0 then return; end if;
  end if;

  return query
  select
    m.id,
    m.created_at,
    (m.created_at at time zone 'America/Lima')::date,
    to_char(m.created_at at time zone 'America/Lima', 'HH24:MI'),
    m.tipo,
    case
      when m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id then 'interno'
      when m.tipo = 'traslado' then 'transferencia'
      when m.motivo in ('traslado_salida', 'traslado_entrada') then 'transferencia'
      else m.tipo
    end,
    m.motivo,
    m.cantidad,
    case m.tipo
      when 'entrada' then m.cantidad
      when 'salida' then -m.cantidad
      when 'ajuste' then m.cantidad
      when 'traslado' then
        case
          when m.ubicacion_id = m.ubicacion_destino_id then 0
          when m.ubicacion_destino_id = p_ubicacion_id then m.cantidad
          else -m.cantidad
        end
    end,
    m.usuario_id is null,
    m.nota,
    m.variante_id,
    va.sku,
    pr.referencia,
    ta.valor,
    co.nombre,
    case when m.motivo in ('traslado_salida', 'traslado_entrada') then tr.ubicacion_origen_id else m.ubicacion_id end,
    case when m.motivo in ('traslado_salida', 'traslado_entrada') then tr_origen.nombre else uo.nombre end,
    case when m.motivo in ('traslado_salida', 'traslado_entrada') then tr.ubicacion_destino_id else m.ubicacion_destino_id end,
    case when m.motivo in ('traslado_salida', 'traslado_entrada') then tr_destino.nombre else ud.nombre end,
    m.sububicacion_id,
    so.nombre,
    so.tipo,
    m.sububicacion_destino_id,
    sd.nombre,
    sd.tipo,
    m.usuario_id,
    per.nombres || ' ' || per.apellidos,
    ve.id,
    ve.nota,
    cmp.tipo,
    case when cmp.serie is not null then cmp.serie || '-' || lpad(cmp.numero::text, 6, '0') end,
    cmp.estado,
    m.lote_id,
    lo.numero_guia,
    lo.nota,
    prov.nombre,
    ci.compra_id,
    cp.documento,
    tr.id,
    tr.estado,
    tr.nota,
    cti.conteo_id,
    cti.cantidad_sistema,
    cti.cantidad_contada,
    di.devolucion_id,
    de.motivo,
    de.estado,
    m.cambio_id,
    ca.diferencia
  from movimientos m
  join variantes va on va.id = m.variante_id
  join productos pr on pr.id = va.producto_id
  left join tallas ta on ta.id = va.talla_id
  left join colores co on co.codigo = va.color_codigo
  join ubicaciones uo on uo.id = m.ubicacion_id
  left join ubicaciones ud on ud.id = m.ubicacion_destino_id
  left join sububicaciones so on so.id = m.sububicacion_id
  left join sububicaciones sd on sd.id = m.sububicacion_destino_id
  left join public.personas per on per.id = m.usuario_id
  left join venta_items vi on vi.id = m.venta_item_id
  left join devolucion_items di on di.id = m.devolucion_item_id
  left join devoluciones de on de.id = di.devolucion_id
  left join cambios ca on ca.id = m.cambio_id
  left join venta_items cvi on cvi.id = ca.venta_item_id
  left join ventas ve on ve.id = coalesce(vi.venta_id, de.venta_id, cvi.venta_id)
  left join lateral (
    select c.tipo, c.serie, c.numero, c.estado
    from comprobantes c
    where c.venta_id = ve.id and c.tipo in ('boleta', 'factura')
    order by c.created_at desc
    limit 1
  ) cmp on ve.id is not null
  left join lotes lo on lo.id = m.lote_id
  left join proveedores prov on prov.id = lo.proveedor_id
  left join compra_items ci on ci.id = m.compra_item_id
  left join compras cp on cp.id = ci.compra_id
  left join transferencia_items ti on ti.id = m.transferencia_item_id
  left join transferencia_recepciones trc on trc.id = m.transferencia_recepcion_id
  left join transferencias tr on tr.id = coalesce(ti.transferencia_id, trc.transferencia_id)
  left join ubicaciones tr_origen on tr_origen.id = tr.ubicacion_origen_id
  left join ubicaciones tr_destino on tr_destino.id = tr.ubicacion_destino_id
  left join conteo_items cti on cti.id = m.conteo_item_id
  where (m.ubicacion_id = p_ubicacion_id or m.ubicacion_destino_id = p_ubicacion_id)
    and m.variante_id <> c_cargo_especial
    and (p_desde is null or m.created_at >= v_desde)
    and (p_hasta is null or m.created_at < v_hasta)
    and (p_motivo is null or m.motivo = p_motivo)
    and (p_usuario_id is null or m.usuario_id = p_usuario_id)
    and (p_sububicacion_id is null or m.sububicacion_id = p_sububicacion_id or m.sububicacion_destino_id = p_sububicacion_id)
    and (v_variantes is null or m.variante_id = any(v_variantes))
    and (v_variantes_producto is null or m.variante_id = any(v_variantes_producto))
    and (
      p_categoria is null
      or (p_categoria = 'salida' and m.tipo = 'salida' and coalesce(m.motivo, '') <> 'traslado_salida')
      or (p_categoria = 'entrada' and m.tipo = 'entrada' and coalesce(m.motivo, '') <> 'traslado_entrada')
      or (p_categoria = 'ajuste' and m.tipo = 'ajuste')
      or (p_categoria = 'interno' and m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id)
      or (p_categoria = 'transferencia' and (
            (m.tipo = 'traslado' and m.ubicacion_id <> m.ubicacion_destino_id)
            or m.motivo in ('traslado_salida', 'traslado_entrada')
          ))
    )
    and (p_cursor_creado_en is null or (m.created_at, m.id) < (p_cursor_creado_en, p_cursor_id))
  order by m.created_at desc, m.id desc
  limit v_limite;
end;
$function$;

CREATE OR REPLACE FUNCTION retail.fn_productos(p_busqueda text DEFAULT NULL::text, p_categoria_id uuid DEFAULT NULL::uuid, p_color_codigo text DEFAULT NULL::text, p_estado text DEFAULT NULL::text, p_precio_min numeric DEFAULT NULL::numeric, p_precio_max numeric DEFAULT NULL::numeric, p_stock text DEFAULT NULL::text, p_pagina integer DEFAULT 1, p_por_pagina integer DEFAULT 24)
 RETURNS TABLE(total_productos bigint, producto_id uuid, referencia text, codigo text, categoria_id uuid, categoria_nombre text, estado text, stock_minimo integer, stock_total integer, demanda_diaria numeric, lead_time_dias numeric, punto_reorden integer, reponer_de_proveedor boolean, variante_id uuid, variante_codigo text, sku text, talla text, color_codigo text, color_nombre text, color_hex text, precio numeric, costo numeric, activo boolean, codigos_barras text[])
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
    v.precio,
    v.costo,
    v.activo,
    coalesce(cb.codigos, '{}'::text[])
  from pagina pg
  join variantes v on v.producto_id = pg.id
  left join tallas ta on ta.id = v.talla_id
  left join colores co on co.codigo = v.color_codigo
  left join lateral (
    select array_agg(cb2.codigo order by cb2.codigo) as codigos
    from codigos_barras cb2 where cb2.variante_id = v.id
  ) cb on true
  order by pg.referencia, pg.id, ta.valor, v.color_codigo;
end;
$function$;
