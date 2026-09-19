-- ============================================================================
-- Recibir mercadería: quién cumple y cuánto tarda (ADR-0111, sección «Lectura»)
--
-- EL PROBLEMA. «Recibidas recientemente» es una lista fija de las últimas 15 sin
-- cifra alguna: no responde la pregunta que Felipe se hace antes de pactar el
-- próximo pedido — ¿este proveedor entrega completo?, ¿cuántos días tarda desde
-- que emite el comprobante?, ¿cuánto quedó sin llegar? — y no deja buscar una
-- guía ni un proveedor cuando haya datos reales.
--
-- LA DECISIÓN. Dos funciones de lectura sobre la verdad que ya existe
-- (`movimientos` con `compra_item_id` + `lotes`), sin tablas nuevas:
--
--   · listar_recepciones_compras(...): una fila por (lote, comprobante) — cada
--     guía contra cada comprobante que cubrió. Un lote (una guía) puede cubrir
--     varios comprobantes del mismo proveedor, así que la unidad es el par.
--   · resumen_recepciones(p_desde): las 4 cifras de la cabecera de la pestaña.
--
-- DEFINICIONES (las lee la interfaz y las fichas de proveedor):
--   · Recepción = un (lote, comprobante) con al menos un movimiento contra una
--     línea de ese comprobante. `unidades_llegaron` = Σ cantidad de esos
--     movimientos. La fecha es la del lote (`lotes.fecha_recepcion`), y todo día
--     se cuenta en hora de Lima, no UTC.
--   · dias_demora = días entre la emisión del comprobante y la llegada de ESA
--     guía, nunca negativo. `dias_entrega_promedio` es el promedio simple de esos
--     días sobre las mismas filas que la lista muestra: lo que se ve se puede
--     verificar a ojo.
--   · Entrega COMPLETA = el comprobante recibió TODO lo facturado
--     (`recibido_cantidad >= facturado_cantidad`), contando solo lo que de verdad
--     llegó. Una línea cerrada por D2 («esas unidades no van a llegar») deja el
--     comprobante en `recibida` pero NO lo vuelve entrega completa: el proveedor
--     no cumplió. Por eso se usa `recibido_cantidad` y no `estado_recepcion`.
--   · Faltante ABIERTO = unidades que aún faltan de comprobantes vigentes en
--     recepción `parcial` (algo llegó, algo falta, y nadie lo cerró). Un
--     comprobante `sin_recibir` no es faltante: es «por llegar» y vive en
--     Pendientes. Es el estado de HOY: no depende de `p_desde` — un faltante sin
--     cerrar no debe desaparecer de la vista por ser viejo.
--   · `faltante` de cada fila de la lista = unidades que faltan HOY del
--     comprobante (Σ pendiente de sus líneas, D2-aware), igual en todas las
--     guías de ese comprobante.
--
-- CANDADO DE SEDE: el del comprobante (`ubicacion_destino_id`), igual que
-- `resumen_compras` (ADR-0075). `security definer` se salta la RLS, así que se
-- repite a mano. Solo comprobantes vigentes: una anulada no puede tener
-- recepciones (`anular_compra` lo impide), el filtro es defensa.
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. la lista, una fila por (lote, comprobante) ====================
create or replace function retail.listar_recepciones_compras(
  p_proveedor_id uuid default null,
  p_desde date default null,
  p_hasta date default null,
  p_busqueda text default null,
  p_limite integer default 30
)
returns table (
  lote_id uuid,
  fecha_recepcion timestamptz,
  ubicacion_nombre text,
  proveedor_id uuid,
  proveedor_nombre text,
  numero_guia text,
  recibido_por uuid,
  compra_id uuid,
  documento text,
  unidades_llegaron integer,
  unidades_facturadas integer,
  faltante integer,
  dias_demora integer
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select
    l.id,
    l.fecha_recepcion,
    u.nombre,
    c.proveedor_id,
    pr.nombre,
    l.numero_guia,
    l.recibido_por,
    c.id,
    c.documento,
    sum(m.cantidad)::integer,
    c.facturado_cantidad,
    (select coalesce(sum(greatest(x.pendiente, 0)), 0)::integer from compra_items_resumen x where x.compra_id = c.id),
    greatest(0, (l.fecha_recepcion at time zone 'America/Lima')::date - c.fecha_emision)::integer
  from lotes l
  join movimientos m on m.lote_id = l.id and m.compra_item_id is not null
  join compra_items ci on ci.id = m.compra_item_id
  join compras c on c.id = ci.compra_id
  join proveedores pr on pr.id = c.proveedor_id
  join ubicaciones u on u.id = l.ubicacion_id
  where auth.uid() is not null
    and c.estado = 'vigente'
    and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
    and (p_proveedor_id is null or c.proveedor_id = p_proveedor_id)
    and (p_desde is null or (l.fecha_recepcion at time zone 'America/Lima')::date >= p_desde)
    and (p_hasta is null or (l.fecha_recepcion at time zone 'America/Lima')::date <= p_hasta)
    and (nullif(trim(p_busqueda), '') is null
         or c.documento ilike '%' || trim(p_busqueda) || '%'
         or pr.nombre ilike '%' || trim(p_busqueda) || '%'
         or l.numero_guia ilike '%' || trim(p_busqueda) || '%')
  group by l.id, l.fecha_recepcion, l.numero_guia, l.recibido_por, l.ubicacion_id,
           u.nombre, c.id, c.proveedor_id, c.documento, c.facturado_cantidad, c.fecha_emision, pr.nombre
  order by l.fecha_recepcion desc, l.id asc, c.id asc
  limit greatest(1, least(coalesce(p_limite, 30), 200));
$$;

comment on function retail.listar_recepciones_compras(uuid, date, date, text, integer) is
  'Recepciones contra comprobante: una fila por (lote, comprobante) con lo que llegó, lo facturado, lo que falta hoy y los días desde la emisión. Busca por documento, proveedor o guía. Más recientes primero, máx. 200. Acotada por sede. ADR-0111.';

revoke all on function retail.listar_recepciones_compras(uuid, date, date, text, integer) from public, anon;
grant execute on function retail.listar_recepciones_compras(uuid, date, date, text, integer) to authenticated;

-- ==================== 2. las 4 cifras de la pestaña ====================
create or replace function retail.resumen_recepciones(p_desde date default null)
returns table (
  unidades_recibidas bigint,
  recepciones integer,
  dias_entrega_promedio numeric,
  comprobantes_recibidos integer,
  entregas_completas integer,
  faltante_unidades bigint,
  faltante_comprobantes integer
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  with r as (
    -- Las mismas filas que lista `listar_recepciones_compras`, sin filtros extra.
    select l.id as lote, c.id as comprobante,
           sum(m.cantidad) as llegaron,
           greatest(0, (l.fecha_recepcion at time zone 'America/Lima')::date - c.fecha_emision) as dias,
           (c.recibido_cantidad >= c.facturado_cantidad) as completo
    from lotes l
    join movimientos m on m.lote_id = l.id and m.compra_item_id is not null
    join compra_items ci on ci.id = m.compra_item_id
    join compras c on c.id = ci.compra_id
    where c.estado = 'vigente'
      and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
      and (l.fecha_recepcion at time zone 'America/Lima')::date >= coalesce(p_desde, fn_hoy_lima() - 90)
    group by l.id, l.fecha_recepcion, c.id, c.fecha_emision, c.recibido_cantidad, c.facturado_cantidad
  ),
  faltante as (
    select c.id, sum(greatest(ci.pendiente, 0)) as pendiente
    from compras c
    join compra_items_resumen ci on ci.compra_id = c.id
    where c.estado = 'vigente' and c.estado_recepcion = 'parcial'
      and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
    group by c.id
    having sum(greatest(ci.pendiente, 0)) > 0
  )
  select
    coalesce((select sum(r.llegaron) from r), 0)::bigint,
    (select count(distinct r.lote) from r)::integer,
    (select round(avg(r.dias), 1) from r),
    (select count(distinct r.comprobante) from r)::integer,
    (select count(distinct r.comprobante) from r where r.completo)::integer,
    coalesce((select sum(f.pendiente) from faltante f), 0)::bigint,
    (select count(*) from faltante f)::integer
  where auth.uid() is not null;
$$;

comment on function retail.resumen_recepciones(date) is
  'Una fila: unidades recibidas, guías (lotes), días de entrega promedio (emisión → llegada), comprobantes recibidos y cuántos llegaron completos, más el faltante abierto de hoy (recepción parcial). p_desde null = 90 días atrás. Acotada por sede. ADR-0111.';

revoke all on function retail.resumen_recepciones(date) from public, anon;
grant execute on function retail.resumen_recepciones(date) to authenticated;
