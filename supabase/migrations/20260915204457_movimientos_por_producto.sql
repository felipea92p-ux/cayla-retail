-- ============================================================================
-- 20260915204457_movimientos_por_producto.sql — CAYLA V2
--
-- Historial de Producto (Sesión A3, mitad 1 de 2): `fn_movimientos`
-- (20260915090000_movimientos_lectura.sql) arma una fila plana del ledger
-- para una ubicación, pero no filtra por producto — solo por `p_busqueda`
-- (texto libre que resuelve a variantes por SKU/código/referencia/código de
-- barras). Un producto puede tener varias variantes (talla × color); el
-- panel de historial de producto necesita las de TODAS sus variantes en una
-- sede, sin pedirle a quien lo mira que escriba el SKU de cada una.
--
-- Qué hace: agrega `p_producto_id` a `fn_movimientos`. Cuando viene, se
-- resuelve una vez a los ids de variante del producto (mismo patrón que
-- `fn_movimientos_variantes` con la búsqueda) y se combina con el filtro de
-- búsqueda existente por AND — las dos cosas puestas a la vez acotan, nunca
-- se relajan entre sí.
--
-- No toca `p_ubicacion_id`: sigue obligatorio y validado con
-- `fn_puede_operar_ubicacion`. El historial de producto se mira sede por
-- sede, con selector — igual que `/movimientos` — en vez de agregado de
-- toda la red. Decisión de Felipe (2026-09-15): reusar el modelo de permiso
-- que ya existe (una Líder elige sede, una integrante ve la suya) en vez de
-- construir una función nueva que agregue varias sedes a la vez.
--
-- CREATE OR REPLACE no alcanza para agregar un parámetro: cambia la firma.
-- drop+create, mismo patrón que ya usó 20260915090000 sobre esta función.
-- ============================================================================

set search_path = retail, public, extensions;

drop function if exists retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer);

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
  cambio_diferencia numeric
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  v_busqueda text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_variantes uuid[];
  v_variantes_producto uuid[];
  -- Una fila de más a propósito: la pantalla la usa solo para saber si hay otra página.
  v_limite integer := greatest(1, least(coalesce(p_limite, 50), 200)) + 1;
  -- Rango inclusivo en días de Lima, convertido UNA vez a timestamptz para que
  -- el predicado sobre `created_at` use el índice.
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
    -- Nada coincide con lo buscado: no hay filas, y no hace falta tocar el ledger.
    if coalesce(array_length(v_variantes, 1), 0) = 0 then return; end if;
  end if;

  if p_producto_id is not null then
    select coalesce(array_agg(v.id), '{}'::uuid[]) into v_variantes_producto
    from variantes v where v.producto_id = p_producto_id;
    -- Producto sin variantes (o inexistente): no hay filas que buscar.
    if coalesce(array_length(v_variantes_producto, 1), 0) = 0 then return; end if;
  end if;

  return query
  select
    m.id,
    m.created_at,
    (m.created_at at time zone 'America/Lima')::date,
    to_char(m.created_at at time zone 'America/Lima', 'HH24:MI'),
    m.tipo,
    -- La categoría de pantalla: `interno` y `transferencia` son ambos `traslado`.
    case m.tipo
      when 'traslado' then case when m.ubicacion_id = m.ubicacion_destino_id then 'interno' else 'transferencia' end
      else m.tipo
    end,
    m.motivo,
    m.cantidad,
    -- Efecto sobre la ubicación que se está mirando: un traslado que ENTRA suma,
    -- uno que SALE resta, uno interno no cambia el total de la tienda. `ajuste`
    -- ya viene con signo (movimientos_cantidad_valida).
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
    va.talla,
    co.nombre,
    m.ubicacion_id,
    uo.nombre,
    m.ubicacion_destino_id,
    ud.nombre,
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
    -- Mismo formato que `fn_ventas_del_dia`: B001-000012.
    case when cmp.serie is not null then cmp.serie || '-' || lpad(cmp.numero::text, 6, '0') end,
    cmp.estado,
    m.lote_id,
    lo.numero_guia,
    lo.nota,
    prov.nombre,
    ci.compra_id,
    cp.documento,
    ti.transferencia_id,
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
  left join colores co on co.codigo = va.color_codigo
  join ubicaciones uo on uo.id = m.ubicacion_id
  left join ubicaciones ud on ud.id = m.ubicacion_destino_id
  left join sububicaciones so on so.id = m.sububicacion_id
  left join sububicaciones sd on sd.id = m.sububicacion_destino_id
  left join public.personas per on per.id = m.usuario_id
  -- Los tres procesos que nacen de una venta (venta, devolución, cambio) llegan a
  -- la MISMA venta por caminos distintos; se resuelve una vez y el comprobante
  -- se busca una sola vez para los tres.
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
  left join transferencias tr on tr.id = ti.transferencia_id
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
      or (p_categoria in ('entrada', 'salida', 'ajuste') and m.tipo = p_categoria)
      or (p_categoria = 'interno' and m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id)
      or (p_categoria = 'transferencia' and m.tipo = 'traslado' and m.ubicacion_id <> m.ubicacion_destino_id)
    )
    and (p_cursor_creado_en is null or (m.created_at, m.id) < (p_cursor_creado_en, p_cursor_id))
  order by m.created_at desc, m.id desc
  limit v_limite;
end;
$$;

revoke all on function retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid) from public;
grant execute on function retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid) to authenticated;

comment on function retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer, uuid) is
  'Historial de movimientos de una ubicación (origen o destino), una fila plana con la referencia de su proceso ya resuelta. Filtros server-side, cursor (created_at, id), devuelve limite+1 filas. p_producto_id acota a las variantes de ese producto. Excluye la variante centinela Cargo especial.';
