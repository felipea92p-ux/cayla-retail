-- ============================================================================
-- 20260922121000 — Productos: «N variantes» cuenta variantes, no filas de stock
-- (pantalla:productos, tarea #3 — docs/pantallas/productos.md, objeción 3)
--
-- PROBLEMA. El subtítulo de `/productos` decía «190 variantes» y la base tiene 163 (127 activas y
-- 36 inactivas). `fn_productos_resumen` contaba `count(v.id)` DESPUÉS de unir con `stock`: una
-- variante que tiene stock en dos sedes, o en el piso y en el almacén de la misma sede, se
-- contaba dos veces. Con 138 filas de stock repartidas en varias ubicaciones, el número de la
-- cabecera crecía cada vez que una prenda entraba a una sede nueva, sin que hubiera una sola
-- prenda más. Se coló porque la prueba de regresión de 20260918231300 comparó contra la versión
-- anterior, que ya tenía el mismo error: «igual que antes» no prueba «correcto».
--
-- QUÉ CAMBIA. Una línea: `count(distinct v.id)`. Va en migración APARTE de la 20260922120000
-- porque cambia un número que se ve en pantalla (Kent Beck: un cambio de resultado no se mezcla
-- con otro cambio de resultado). Firma y columnas de salida idénticas; `CREATE OR REPLACE`
-- conserva los permisos.
--
-- LO QUE NO CAMBIA. Sigue contando variantes de TODOS los estados, activas e inactivas: decidir si
-- «variantes» debe significar «vigentes» es la tarea #9 del análisis (un solo universo compartido
-- con Inventario), no esta.
--
-- ESTADO: aplicada solo en el Postgres local; requiere la 20260922120000 antes (parte de su cuerpo).
-- En producción se pega después de ella; el archivo ya trae `set search_path`.
-- ============================================================================

set search_path = retail, public, extensions;

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
      count(distinct v.id)::bigint as num_variantes,
      coalesce(sum(s.cantidad), 0)::integer as stock_total,
      bool_or(p_color_codigo is null or v.color_codigo = p_color_codigo) as color_ok,
      bool_or(
        (p_precio_min is null or v.precio >= p_precio_min)
        and (p_precio_max is null or v.precio <= p_precio_max)
      ) as precio_ok,
      coalesce(max(vd.demanda_diaria), 0) as demanda_diaria,
      coalesce(max(lt.lead_time_dias), 14) as lead_time_dias
    from productos p
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
    group by p.id, p.estado, p.stock_minimo
  ),
  filtrado as (
    select *,
      ceil(demanda_diaria * lead_time_dias)::integer + coalesce(stock_minimo, 0) as punto_reorden
    from agregado where color_ok and precio_ok
  )
  select
    count(*)::bigint,
    coalesce(sum(num_variantes), 0)::bigint,
    count(*) filter (where estado = 'activo' and stock_minimo is not null and stock_total < stock_minimo)::bigint,
    count(*) filter (where estado = 'activo' and stock_total = 0)::bigint,
    count(*) filter (where estado = 'activo' and stock_total <= punto_reorden and demanda_diaria > 0)::bigint
  from filtrado;
end;
$function$;
