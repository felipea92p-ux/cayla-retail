-- ============================================================================
-- 20260915090000_movimientos_lectura.sql — CAYLA V2
--
-- Movimientos se LEE bien; no se toca nada de cómo se escribe.
--
-- El problema (auditoría del 2026-09-15): `retail.movimientos` ya guarda todo
-- lo que una Líder necesita para responder «qué cambió, cuánto, dónde, por qué,
-- quién y desde qué proceso» — tipo, motivo, sububicación origen y destino,
-- usuario, nota, y una FK al proceso que lo originó (venta, lote, compra,
-- transferencia, devolución, conteo, cambio). Es inmutable por trigger
-- (20260914165703_movimientos_inmutables.sql). Pero la pantalla lo leía con
-- embeds de PostgREST sobre los últimos 100 y filtraba en memoria: sin
-- búsqueda, sin filtros, sin detalle, y con un bug de signo (todo `traslado`
-- salía en negativo, incluso los que ENTRAN a la ubicación).
--
-- Qué hace:
--   1. Dos índices por fecha — hoy la tabla solo indexa (variante, ubicación) y
--      las FKs; una lista ordenada por fecha era seq scan + sort.
--   2. `fn_movimientos(...)`: UNA fila plana por movimiento con todos los joins
--      resueltos (variante, ubicaciones, sububicaciones, persona de Dynamic,
--      comprobante, lote+proveedor, factura de compra, transferencia, conteo,
--      devolución, cambio), filtros server-side y paginado por cursor
--      `(created_at, id)` — el mismo patrón que `listar_compras`.
--   3. `fn_movimientos_resumen(...)`: totales por categoría del mismo filtro,
--      sin cursor, para la cabecera. Nunca se calcula desde la página cargada:
--      con paginado, la página nunca es «todo el período».
--
-- DECIDÍ: la CATEGORÍA (entrada/salida/interno/ajuste/transferencia) es una
-- proyección de lectura, no un 5.º `tipo`. `interno` y `transferencia` son ambos
-- `tipo = 'traslado'`; los distingue `ubicacion_id = ubicacion_destino_id`.
-- DESCARTÉ: agregar `tipo = 'interno'` a la tabla — duplicaría ramas en
-- `fn_aplicar_movimiento` y `recalcular_stock` (la clase de bug de ADR-0031) para
-- un dato que ya está en las columnas. Ver docs/adr/0050-la-categoria-de-un-movimiento-es-lectura-no-un-tipo.md.
-- SE ROMPE SI: alguien llama `fn_movimientos` sin ubicación esperando «todas»:
-- `fn_puede_operar_ubicacion(null)` devuelve TRUE para una Líder. Por eso
-- `p_ubicacion_id` es obligatorio y se valida con `raise` antes de leer nada.
--
-- Security definer, no invoker: `usuario_nombre` sale de `public.personas`
-- (Dynamic, otro schema). El stub local da `select` a `authenticated` sin RLS;
-- producción no tiene por qué — con invoker la pantalla mostraría nombres en
-- local y NULL en producción. Barandas: `p_ubicacion_id` obligatorio +
-- `fn_puede_operar_ubicacion`, toda fila cumple `ubicacion_id = p or
-- ubicacion_destino_id = p` (reproduce la policy `movimientos_select`), de
-- personas solo `nombres || ' ' || apellidos`, `revoke from public`.
--
-- La variante centinela «Cargo especial» (20260912234726_cargo_especial_pos.sql)
-- se EXCLUYE por constante: 999.999 unidades de `siembra_cargo_especial` por
-- ubicación y una `salida` por cada «Monto manual» del POS no son movimientos de
-- mercadería. No se excluye por `variantes.activo`: las prendas descontinuadas
-- también están en `false` y su historial SÍ debe verse. Decisión de Felipe
-- (2026-09-15): «contamina el ledger, excluye todo registro innecesario».
--
-- ESTADO: aplicada en la base local el 2026-09-15 y en producción el mismo día
-- (execute_sql sobre el proyecto de Dynamic, schema `retail`, tras el merge del
-- PR #33; registrada en supabase_migrations.schema_migrations). Verificada en
-- producción como Benjamin en Tienda AQP dentro de una transacción revertida:
-- resumen 288 entradas (carga inicial) + 288 internas (activación), centinela
-- con 1 fila en el ledger y 0 devueltas.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. Índices por fecha ----------
-- Orden de magnitud: 3 tiendas + Taller, ~50 movimientos/día por tienda →
-- ~55.000 filas por ubicación en 3 años. Medido en local el 2026-09-15 con
-- 165.000 filas sintéticas (transacción revertida): `fn_movimientos` con
-- filtros por defecto tarda ~30 ms; el predicado `ubicacion_id = p OR
-- ubicacion_destino_id = p` entra por BitmapOr sobre estos dos índices y
-- ordena solo lo de esa ubicación. Si algún día CAYLA multiplica por 10 ese
-- volumen, el siguiente paso conocido es partir el OR en dos ramas `union all`
-- con `limit` cada una — no hace falta hoy.
create index if not exists movimientos_ubicacion_fecha_idx
  on retail.movimientos (ubicacion_id, created_at desc, id desc);

create index if not exists movimientos_destino_fecha_idx
  on retail.movimientos (ubicacion_destino_id, created_at desc, id desc)
  where ubicacion_destino_id is not null;

-- ---------- 2. Búsqueda → variantes ----------
-- La búsqueda se resuelve UNA vez a ids de variante (patrón `listar_compras`
-- con proveedores) y después el ledger filtra por `= any(...)`: nunca un join
-- a `codigos_barras` (1:N) dentro de la consulta principal. Texto a medias en
-- SKU, código de variante, nombre y código del producto; código de barras solo
-- exacto (una pistola manda el código completo).
create or replace function retail.fn_movimientos_variantes(p_busqueda text)
returns uuid[]
language sql
stable
set search_path = retail, public, extensions
as $$
  select coalesce(array_agg(v.id), '{}'::uuid[])
  from retail.variantes v
  join retail.productos p on p.id = v.producto_id
  where v.sku ilike '%' || p_busqueda || '%'
     or v.codigo ilike '%' || p_busqueda || '%'
     or p.referencia ilike '%' || p_busqueda || '%'
     or p.codigo ilike '%' || p_busqueda || '%'
     or exists (
       select 1 from retail.codigos_barras cb
       where cb.variante_id = v.id and lower(cb.codigo) = lower(p_busqueda)
     );
$$;

revoke all on function retail.fn_movimientos_variantes(text) from public;

-- ---------- 3. fn_movimientos ----------
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
  p_limite integer default 50
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

revoke all on function retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer) from public;
grant execute on function retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer) to authenticated;

comment on function retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamptz, uuid, integer) is
  'Historial de movimientos de una ubicación (origen o destino), una fila plana con la referencia de su proceso ya resuelta. Filtros server-side, cursor (created_at, id), devuelve limite+1 filas. Excluye la variante centinela Cargo especial.';

-- ---------- 4. fn_movimientos_resumen ----------
-- Misma cláusula WHERE que `fn_movimientos` (sin cursor): si un día cambia un
-- filtro, cambia en los dos o la cabecera deja de describir la lista.
drop function if exists retail.fn_movimientos_resumen(uuid, date, date, text, text, uuid, uuid);

create function retail.fn_movimientos_resumen(
  p_ubicacion_id uuid,
  p_desde date default null,
  p_hasta date default null,
  p_motivo text default null,
  p_busqueda text default null,
  p_usuario_id uuid default null,
  p_sububicacion_id uuid default null
)
returns table (
  categoria text,
  movimientos bigint,
  -- `unidades`: cuántas prendas se movieron (siempre positivo).
  -- `delta`: efecto neto sobre el total de la ubicación (con signo).
  unidades bigint,
  delta bigint
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
    v_variantes := fn_movimientos_variantes(v_busqueda);
    if coalesce(array_length(v_variantes, 1), 0) = 0 then return; end if;
  end if;

  return query
  select
    x.categoria,
    count(*)::bigint,
    sum(abs(x.cantidad))::bigint,
    sum(x.delta)::bigint
  from (
    select
      case m.tipo
        when 'traslado' then case when m.ubicacion_id = m.ubicacion_destino_id then 'interno' else 'transferencia' end
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
      and (v_variantes is null or m.variante_id = any(v_variantes))
  ) x
  group by x.categoria;
end;
$$;

revoke all on function retail.fn_movimientos_resumen(uuid, date, date, text, text, uuid, uuid) from public;
grant execute on function retail.fn_movimientos_resumen(uuid, date, date, text, text, uuid, uuid) to authenticated;

comment on function retail.fn_movimientos_resumen(uuid, date, date, text, text, uuid, uuid) is
  'Totales por categoría (entrada/salida/interno/ajuste/transferencia) del mismo filtro que fn_movimientos, sin cursor: movimientos, unidades movidas y efecto neto sobre la ubicación.';
