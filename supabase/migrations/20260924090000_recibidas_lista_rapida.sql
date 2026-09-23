-- =====================================================================================================================
-- «Recibidas recientemente» dejó de cargar: `listar_recepciones_compras` tardaba 33 s y PostgREST la corta a los 8 s
-- (500 «canceling statement due to statement timeout», medido en producción el 2026-09-23 con un líder).
--
-- EL PROBLEMA. La versión de ADR-0139 (20260919173000) calcula lo asignado y lo faltante de cada comprobante con DOS
-- subconsultas escalares sobre la vista `compra_item_reparto_resumen`, una por cada fila agrupada. Postgres las evalúa
-- ANTES del `order by … limit 30` —sobre las ~320 recepciones de la historia— y cada una vuelve a llamar a
-- `fn_puede_operar_ubicacion` fila por fila (no se inlinea: lleva `set search_path`, y adentro consulta personas,
-- colaboradores y la terminal). Solo, el cuerpo tarda 0,15 s; con las ~640 subconsultas, 33 s. Crece con cada envío.
--
-- LA CORRECCIÓN (mismas columnas, mismos filtros, mismo orden, mismos permisos):
--   1. Las tiendas que la persona opera se resuelven UNA vez (`mias`, una llamada por ubicación), no por fila.
--   2. Primero se arma y se corta la página (`pagina`, ≤ 200 filas); DESPUÉS se suma el reparto, una sola vez por
--      comprobante de esa página (`reparto`), y se une.
-- `fn_puede_operar_ubicacion` sigue siendo la única fuente del permiso: aquí solo se llama menos veces.
--
-- Sin prefijo `retail.` (lleva `set search_path`). Al pegar en el SQL Editor de producción ya corre en `retail`.
-- =====================================================================================================================

set search_path = retail, public, extensions;

create or replace function listar_recepciones_compras(
  p_proveedor_id uuid default null,
  p_desde date default null,
  p_hasta date default null,
  p_busqueda text default null,
  p_limite integer default 30
)
 RETURNS TABLE(lote_id uuid, fecha_recepcion timestamp with time zone, ubicacion_nombre text, proveedor_id uuid, proveedor_nombre text, numero_guia text, recibido_por uuid, compra_id uuid, documento text, unidades_llegaron integer, unidades_facturadas integer, faltante integer, dias_demora integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
  with mias as materialized (
    -- Las tiendas que la persona opera (un líder, todas): una llamada al permiso por ubicación, no por fila.
    select u.id from ubicaciones u where auth.uid() is not null and fn_puede_operar_ubicacion(u.id)
  ),
  pagina as materialized (
    select
      l.id as lote_id,
      l.fecha_recepcion,
      u.nombre as ubicacion_nombre,
      c.proveedor_id,
      pr.nombre as proveedor_nombre,
      l.numero_guia,
      l.recibido_por,
      c.id as compra_id,
      c.documento,
      sum(m.cantidad)::integer as unidades_llegaron,
      greatest(0, (l.fecha_recepcion at time zone 'America/Lima')::date - c.fecha_emision)::integer as dias_demora
    from lotes l
    join mias on mias.id = l.ubicacion_id
    join movimientos m on m.lote_id = l.id and m.compra_item_id is not null
    join compra_items ci on ci.id = m.compra_item_id
    join compras c on c.id = ci.compra_id
    join proveedores pr on pr.id = c.proveedor_id
    join ubicaciones u on u.id = l.ubicacion_id
    where c.estado = 'vigente'
      and (p_proveedor_id is null or c.proveedor_id = p_proveedor_id)
      and (p_desde is null or (l.fecha_recepcion at time zone 'America/Lima')::date >= p_desde)
      and (p_hasta is null or (l.fecha_recepcion at time zone 'America/Lima')::date <= p_hasta)
      and (nullif(trim(p_busqueda), '') is null
           or c.documento ilike '%' || trim(p_busqueda) || '%'
           or pr.nombre ilike '%' || trim(p_busqueda) || '%'
           or l.numero_guia ilike '%' || trim(p_busqueda) || '%')
    group by l.id, l.fecha_recepcion, l.numero_guia, l.recibido_por, l.ubicacion_id,
             u.nombre, c.id, c.proveedor_id, c.documento, c.fecha_emision, pr.nombre
    order by l.fecha_recepcion desc, l.id asc, c.id asc
    limit greatest(1, least(coalesce(p_limite, 30), 200))
  ),
  reparto as (
    -- ADR-0138: lo asignado y lo que falta, de las tiendas que la persona opera (un líder, todas: el total).
    select rs.compra_id,
           coalesce(sum(rs.asignado), 0)::integer as asignado,
           coalesce(sum(greatest(rs.pendiente, 0)), 0)::integer as pendiente
    from compra_item_reparto_resumen rs
    join mias on mias.id = rs.ubicacion_id
    where rs.compra_id in (select p.compra_id from pagina p)
    group by rs.compra_id
  )
  select p.lote_id, p.fecha_recepcion, p.ubicacion_nombre, p.proveedor_id, p.proveedor_nombre, p.numero_guia,
         p.recibido_por, p.compra_id, p.documento, p.unidades_llegaron,
         coalesce(r.asignado, 0), coalesce(r.pendiente, 0), p.dias_demora
  from pagina p
  left join reparto r on r.compra_id = p.compra_id
  order by p.fecha_recepcion desc, p.lote_id asc, p.compra_id asc;
$function$;
