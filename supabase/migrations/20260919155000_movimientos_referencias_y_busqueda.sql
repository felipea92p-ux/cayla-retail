-- ============================================================================
-- 20260919155000 — Movimientos: la búsqueda encuentra el PROCESO («Traslado 24»,
-- «Boleta 184», «B001-000184») y cada fila trae el número de su traslado / conteo.
-- ADR-0127.
--
-- POR QUÉ. La pantalla de Movimientos va a mostrar una columna «Referencia»
-- («Traslado 24», «Conteo 12», «Boleta B001-000184», «Guía T001-000045») y quien la
-- lee tiene que poder escribir eso mismo en el buscador y llegar a los movimientos de
-- ESE proceso. Hasta hoy `fn_movimientos` solo buscaba por prenda (nombre, SKU,
-- código, código de barras) y no devolvía el número del traslado ni del conteo.
--
-- QUÉ EXISTE Y QUÉ NO (verificado en producción, 2026-09-19, solo lectura)
--   · `transferencias.numero` y `conteos.numero`: número corrido real (1..4 y 1..3).
--   · Ventas, devoluciones, cambios y producciones NO tienen número propio: una venta
--     se identifica por su comprobante (`comprobantes.serie` + `numero`); una recepción,
--     por su guía (`lotes.numero_guia`) o la factura de compra (`compras.serie/numero`).
--   Esta migración NO inventa numeración nueva: busca por lo que ya existe.
--
-- CONTRATO (escrito antes que el código)
--   fn_movimientos_busqueda(texto) → qué prendas (variantes) y/o qué movimientos
--   concretos coinciden con lo escrito en «Prenda, código, barras o referencia…»:
--     · «traslado 24», «conteo 12», «venta 184», «boleta 184», «factura 184»
--       (con o sin #, n°, nro): una referencia INEQUÍVOCA → solo los movimientos de
--       ese proceso; no se busca por prenda («venta 184» no debe traer una blusa).
--     · «B001-000184», «F001-45», «T001-0034» (serie + número): los movimientos de
--       esa boleta/factura de venta, de esa factura de compra o de esa guía Y las
--       prendas que lo digan (un SKU podría parecerse: se suman, no se esconden).
--     · cualquier otra cosa: por prenda, como siempre.
--   Sin coincidencias (ni prendas ni movimientos) → cero filas, nunca un error.
--   fn_movimientos y fn_movimientos_resumen usan ESTA misma función: la lista y las
--   tarjetas de arriba no pueden discrepar sobre qué es «lo que coincide».
--
-- LO QUE CAMBIA
--   1. fn_movimientos_de_comprobante(tipos, serie, número): ids de movimientos de la
--      venta con ese comprobante, por las tres vías que tiene un movimiento de llegar
--      a una venta (línea vendida, devolución, cambio).
--   2. fn_movimientos_busqueda(texto): el contrato de arriba.
--   3. fn_movimientos: mismas 12 entradas y mismo orden de columnas + DOS al final
--      (`transferencia_numero`, `conteo_numero`); la búsqueda pasa por (2). Cambia el
--      tipo de retorno, así que se elimina la firma anterior a propósito (dos
--      sobrecargas harían ambigua la llamada por nombre de PostgREST).
--   4. fn_movimientos_resumen: misma firma y misma salida; la búsqueda pasa por (2).
--   NO se toca ninguna tabla, ningún índice ni ninguna escritura. `usuario_id` y
--   `usuario_nombre` siguen saliendo y `p_usuario_id` sigue existiendo: la pantalla
--   dejó de mostrarlos/filtrarlos, la auditoría en la base no cambia.
--
-- SE ROMPE SI: `movimientos` pasa de ~1 millón de filas (las vías por
-- `transferencia_item_id`, `conteo_item_id`, `devolucion_item_id` y `cambio_id` no
-- tienen índice propio: hoy son ~460 filas en producción y un barrido es
-- despreciable; con 3 sedes y ~300 movimientos al día tardaría años en importar), o
-- si alguien agrega a `ventas` un número corrido propio: entonces «venta 184»
-- debería buscarlo a él y no al del comprobante.
-- ============================================================================

-- ---------- 1. movimientos de la venta que tiene ese comprobante ----------
create or replace function retail.fn_movimientos_de_comprobante(p_tipos text[], p_serie text, p_numero integer)
returns uuid[]
language sql
stable
set search_path to 'retail', 'public', 'extensions'
as $$
  select coalesce(array_agg(x.id), '{}'::uuid[])
  from (
    -- la línea vendida
    select m.id
    from movimientos m
    join venta_items vi on vi.id = m.venta_item_id
    join comprobantes c on c.venta_id = vi.venta_id
    where c.tipo = any(p_tipos) and c.numero = p_numero and (p_serie is null or lower(c.serie) = p_serie)
    union
    -- la devolución de esa venta
    select m.id
    from movimientos m
    join devolucion_items di on di.id = m.devolucion_item_id
    join devoluciones de on de.id = di.devolucion_id
    join comprobantes c on c.venta_id = de.venta_id
    where c.tipo = any(p_tipos) and c.numero = p_numero and (p_serie is null or lower(c.serie) = p_serie)
    union
    -- el cambio de una línea de esa venta
    select m.id
    from movimientos m
    join cambios ca on ca.id = m.cambio_id
    join venta_items cvi on cvi.id = ca.venta_item_id
    join comprobantes c on c.venta_id = cvi.venta_id
    where c.tipo = any(p_tipos) and c.numero = p_numero and (p_serie is null or lower(c.serie) = p_serie)
  ) x;
$$;

comment on function retail.fn_movimientos_de_comprobante(text[], text, integer) is
  'Ids de los movimientos de la venta cuyo comprobante (boleta/factura) tiene ese número (y serie, si se da). Une las tres vías: línea vendida, devolución y cambio. Lo usa fn_movimientos_busqueda.';

-- ---------- 2. la caja de búsqueda: prendas y/o movimientos concretos ----------
create or replace function retail.fn_movimientos_busqueda(p_busqueda text)
returns table (variante_ids uuid[], movimiento_ids uuid[])
language plpgsql
stable
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_q text := fn_clave_texto(p_busqueda);   -- minúsculas, sin tildes, espacios colapsados
  v_pal text[];
  v_ser text[];
  v_cifras text;
  v_ids uuid[];
begin
  if v_q is null then
    return;
  end if;

  -- (a) palabra + número: «traslado 24», «traslado #24», «traslado n° 24», «boleta 000184».
  v_pal := regexp_match(
    v_q,
    '^(traslados?|conteos?|ventas?|boletas?|facturas?|comprobantes?)\s*(?:(?:n[°º]|nro|num|numero)\.?\s*)?[#°º]?\s*0*(\d{1,9})$'
  );
  if v_pal is not null then
    v_cifras := v_pal[2];
    if v_pal[1] like 'traslado%' then
      select coalesce(array_agg(m.id), '{}'::uuid[]) into v_ids
      from movimientos m
      left join transferencia_items ti on ti.id = m.transferencia_item_id
      left join transferencia_recepciones trc on trc.id = m.transferencia_recepcion_id
      join transferencias tr on tr.id = coalesce(ti.transferencia_id, trc.transferencia_id)
      where tr.numero = v_cifras::integer;
    elsif v_pal[1] like 'conteo%' then
      select coalesce(array_agg(m.id), '{}'::uuid[]) into v_ids
      from movimientos m
      join conteo_items cti on cti.id = m.conteo_item_id
      join conteos c on c.id = cti.conteo_id
      where c.numero = v_cifras::integer;
    else
      v_ids := fn_movimientos_de_comprobante(
        case when v_pal[1] like 'boleta%' then array['boleta'] when v_pal[1] like 'factura%' then array['factura'] else array['boleta', 'factura'] end,
        null,
        v_cifras::integer
      );
    end if;
    -- Referencia inequívoca: sin prendas (variante_ids null = «no se busca por prenda»).
    return query select null::uuid[], v_ids;
    return;
  end if;

  -- (b) serie + número: «B001-000184», «F001 45», «T001-0034», y tal como los escribe la
  -- columna Referencia, con su palabra: «Boleta B001-000184», «Guía T001-000045».
  v_ser := regexp_match(v_q, '^(?:(?:boletas?|facturas?|comprobantes?|ventas?|guias?)\s*)?([a-z]\d{3})[\s\-]*0*(\d{1,9})$');
  if v_ser is not null then
    v_cifras := v_ser[2];
    v_ids :=
      -- boleta/factura de venta
      fn_movimientos_de_comprobante(array['boleta', 'factura'], v_ser[1], v_cifras::integer)
      -- factura de compra (la recepción que entró contra ella)
      || coalesce((
        select array_agg(m.id)
        from movimientos m
        join compra_items ci on ci.id = m.compra_item_id
        join compras cp on cp.id = ci.compra_id
        where lower(cp.serie) = v_ser[1] and ltrim(regexp_replace(cp.numero, '\D', '', 'g'), '0') = v_cifras
      ), '{}'::uuid[])
      -- guía de remisión de la recepción
      || coalesce((
        select array_agg(m.id)
        from movimientos m
        join lotes lo on lo.id = m.lote_id
        cross join lateral regexp_match(lower(lo.numero_guia), '^([a-z]\d{3})[^a-z0-9]*0*(\d+)$') g
        where g[1] = v_ser[1] and g[2] = v_cifras
      ), '{}'::uuid[]);
    -- Ambigua a propósito: un código de prenda podría parecerse a una serie-número,
    -- así que las prendas se SUMAN a los movimientos del documento.
    return query select fn_movimientos_variantes(p_busqueda), v_ids;
    return;
  end if;

  -- (c) todo lo demás: por prenda, como siempre.
  return query select fn_movimientos_variantes(p_busqueda), null::uuid[];
end;
$$;

comment on function retail.fn_movimientos_busqueda(text) is
  'La caja «Prenda, código, barras o referencia…» de Movimientos. Devuelve prendas (variante_ids) y/o movimientos concretos (movimiento_ids). «traslado 24», «conteo 12», «venta 184», «boleta 184» son referencias inequívocas (solo ese proceso); una serie-número («B001-000184», guía, factura de compra) suma sus movimientos a las prendas que coincidan; el resto es búsqueda por prenda. Sin coincidencias: cero filas.';

-- ---------- 3. fn_movimientos: + transferencia_numero, conteo_numero; búsqueda por (2) ----------
drop function if exists retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid);

create function retail.fn_movimientos(
  p_ubicacion_id uuid,
  p_desde date default null,
  p_hasta date default null,
  p_categoria text default null,
  p_motivo text default null,
  p_busqueda text default null,
  p_usuario_id uuid default null,
  p_sububicacion_id uuid default null,
  p_cursor_creado_en timestamptz default null,
  p_cursor_id uuid default null,
  p_limite integer default 50,
  p_producto_id uuid default null
)
returns table (
  id uuid,
  created_at timestamptz,
  fecha_lima date,
  hora text,
  tipo text,
  categoria text,
  motivo text,
  cantidad integer,
  delta integer,
  es_sistema boolean,
  nota text,
  variante_id uuid,
  sku text,
  referencia text,
  talla text,
  color text,
  ubicacion_id uuid,
  ubicacion_nombre text,
  ubicacion_destino_id uuid,
  ubicacion_destino_nombre text,
  sububicacion_id uuid,
  sububicacion_nombre text,
  sububicacion_tipo text,
  sububicacion_destino_id uuid,
  sububicacion_destino_nombre text,
  sububicacion_destino_tipo text,
  usuario_id uuid,
  usuario_nombre text,
  venta_id uuid,
  venta_nota text,
  comprobante_tipo text,
  comprobante_numero text,
  comprobante_estado text,
  lote_id uuid,
  lote_guia text,
  lote_nota text,
  proveedor_nombre text,
  compra_id uuid,
  compra_documento text,
  transferencia_id uuid,
  transferencia_estado text,
  transferencia_nota text,
  conteo_id uuid,
  conteo_cantidad_sistema integer,
  conteo_cantidad_contada integer,
  devolucion_id uuid,
  devolucion_motivo text,
  devolucion_estado text,
  cambio_id uuid,
  cambio_diferencia numeric,
  -- Nuevas (ADR-0127): al final, para que quien lea por posición no note nada.
  transferencia_numero integer,
  conteo_numero integer
)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  v_busqueda text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_variantes uuid[];
  v_movs uuid[];
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
    select b.variante_ids, b.movimiento_ids into v_variantes, v_movs from fn_movimientos_busqueda(v_busqueda) b;
    if coalesce(array_length(v_variantes, 1), 0) = 0 and coalesce(array_length(v_movs, 1), 0) = 0 then return; end if;
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
    ca.diferencia,
    tr.numero,
    cnt.numero
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
  left join conteos cnt on cnt.id = cti.conteo_id
  where (m.ubicacion_id = p_ubicacion_id or m.ubicacion_destino_id = p_ubicacion_id)
    and m.variante_id <> c_cargo_especial
    and (p_desde is null or m.created_at >= v_desde)
    and (p_hasta is null or m.created_at < v_hasta)
    and (p_motivo is null or m.motivo = p_motivo)
    and (p_usuario_id is null or m.usuario_id = p_usuario_id)
    and (p_sububicacion_id is null or m.sububicacion_id = p_sububicacion_id or m.sububicacion_destino_id = p_sububicacion_id)
    and (
      v_busqueda is null
      or (v_variantes is not null and m.variante_id = any(v_variantes))
      or (v_movs is not null and m.id = any(v_movs))
    )
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

comment on function retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid) is
  'Historial de movimientos de una ubicación (origen o destino), una fila plana con la referencia de su proceso ya resuelta (incluye el número del traslado y del conteo). Filtros server-side, cursor (created_at, id), devuelve limite+1 filas. p_busqueda entiende prendas y referencias («traslado 24», «boleta 184», «B001-000184»: ver fn_movimientos_busqueda). p_producto_id acota a las variantes de ese producto. Excluye la variante centinela Cargo especial. Reconoce las dos piernas de un traslado en dos fases (traslado_salida/traslado_entrada) como categoría "transferencia".';

revoke all on function retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid) from public, anon;
grant execute on function retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid) to authenticated;

revoke all on function retail.fn_movimientos_busqueda(text) from public, anon;
grant execute on function retail.fn_movimientos_busqueda(text) to authenticated;
revoke all on function retail.fn_movimientos_de_comprobante(text[], text, integer) from public, anon;
grant execute on function retail.fn_movimientos_de_comprobante(text[], text, integer) to authenticated;

-- ---------- 4. fn_movimientos_resumen: misma búsqueda que la lista ----------
create or replace function retail.fn_movimientos_resumen(
  p_ubicacion_id uuid,
  p_desde date default null,
  p_hasta date default null,
  p_motivo text default null,
  p_busqueda text default null,
  p_usuario_id uuid default null,
  p_sububicacion_id uuid default null
)
returns table (categoria text, movimientos bigint, unidades bigint, delta bigint)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  v_busqueda text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_variantes uuid[];
  v_movs uuid[];
  v_desde timestamptz := (p_desde::timestamp) at time zone 'America/Lima';
  v_hasta timestamptz := ((p_hasta + 1)::timestamp) at time zone 'America/Lima';
begin
  if p_ubicacion_id is null then
    raise exception 'Falta indicar la ubicación cuyos movimientos quieres ver';
  end if;
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para ver los movimientos de esa ubicación';
  end if;

  if v_busqueda is not null then
    select b.variante_ids, b.movimiento_ids into v_variantes, v_movs from fn_movimientos_busqueda(v_busqueda) b;
    if coalesce(array_length(v_variantes, 1), 0) = 0 and coalesce(array_length(v_movs, 1), 0) = 0 then return; end if;
  end if;

  return query
  select
    x.categoria,
    count(*)::bigint,
    sum(abs(x.cantidad))::bigint,
    sum(x.delta)::bigint
  from (
    select
      case
        when m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id then 'interno'
        when m.tipo = 'traslado' then 'transferencia'
        when m.motivo in ('traslado_salida', 'traslado_entrada') then 'transferencia'
        else m.tipo
      end as categoria,
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
      end as delta
    from movimientos m
    where (m.ubicacion_id = p_ubicacion_id or m.ubicacion_destino_id = p_ubicacion_id)
      and m.variante_id <> c_cargo_especial
      and (p_desde is null or m.created_at >= v_desde)
      and (p_hasta is null or m.created_at < v_hasta)
      and (p_motivo is null or m.motivo = p_motivo)
      and (p_usuario_id is null or m.usuario_id = p_usuario_id)
      and (p_sububicacion_id is null or m.sububicacion_id = p_sububicacion_id or m.sububicacion_destino_id = p_sububicacion_id)
      and (
        v_busqueda is null
        or (v_variantes is not null and m.variante_id = any(v_variantes))
        or (v_movs is not null and m.id = any(v_movs))
      )
  ) x
  group by x.categoria;
end;
$function$;

notify pgrst, 'reload schema';
