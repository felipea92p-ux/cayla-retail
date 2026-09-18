-- ============================================================================
-- 20260918090000_prioridad_conteo_por_sububicacion.sql — CAYLA V2
--
-- BUG (visto en /inventario/conteo, escenario local de Trujillo, 2026-09-18):
-- "Conviene contar primero" mostraba la misma prenda dos veces con dos
-- montos de "valor en riesgo" distintos, sin decir por qué — React tiraba
-- "two children with the same key" porque el frontend usaba variante_id
-- como key.
--
-- CAUSA REAL (no era solo el key de React): `fn_prioridad_conteo` lee de
-- `stock`, que tiene una fila por (variante, ubicación, SUBUBICACIÓN) — una
-- variante con unidades sin contar en piso Y en almacén genera dos filas de
-- verdad, pero la función nunca exponía la sububicación, así que las dos
-- filas se veían idénticas.
--
-- DECISIÓN DE NEGOCIO: no colapsar a una fila por variante. Un conteo se
-- abre para UNA sububicación a la vez ("Contar piso de venta" / "Contar
-- almacén de tienda", 20260914210000_inventario_piso_almacen.sql) —
-- decirle a la encargada "esta prenda tiene S/3844 sin contar en almacén y
-- S/559 en piso, por separado" es justo lo que necesita para elegir qué
-- botón tocar. Colapsar el monto escondería en cuál de los dos está la
-- plata. Consistente con el resto de Inventario (Existencias/Resumen/
-- Movimientos), que siempre trata piso y almacén como cosas separadas,
-- nunca las suma en silencio.
--
-- DE PASO: "días sin contar" y el orden "nunca contada primero" miraban
-- CUALQUIER conteo cerrado de la ubicación, sin importar qué sububicación
-- cubría — una prenda contada hace 3 días solo en piso aparecía como
-- "contada hace 3 días" también para su stock de almacén, que en realidad
-- nunca se verificó. Ahora exige que el conteo cerrado haya cubierto la
-- MISMA sububicación (o, para Taller/sin separar, sin sububicación en
-- ambos lados — de ahí el `is not distinct from`, que trata NULL = NULL
-- como igual en vez de como desconocido).
-- ============================================================================

set search_path = retail, public, extensions;

-- Cambia la forma de la fila (se agrega sububicacion_id) — Postgres no deja
-- `create or replace` cuando cambian los OUT parameters, hay que dropearla.
drop function if exists retail.fn_prioridad_conteo(uuid, uuid);

create or replace function retail.fn_prioridad_conteo(p_ubicacion_id uuid, p_alcance_categoria_id uuid default null)
returns table(variante_id uuid, sku text, referencia text, talla text, color text, sububicacion_id uuid, dias_sin_contar integer, valor_en_riesgo numeric)
language plpgsql
stable security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
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
    st.sububicacion_id,
    (
      select extract(day from now() - max(c.cerrado_en))::integer
      from conteos c
      join conteo_items ci on ci.conteo_id = c.id
      where ci.variante_id = va.id
        and c.ubicacion_id = p_ubicacion_id
        and c.estado = 'cerrado'
        and c.sububicacion_id is not distinct from st.sububicacion_id
    ) as dias_sin_contar,
    (st.cantidad * va.precio) as valor_en_riesgo
  from stock st
  join variantes va on va.id = st.variante_id
  join productos p on p.id = va.producto_id
  left join tallas ta on ta.id = va.talla_id
  left join colores co on co.codigo = va.color_codigo
  where st.ubicacion_id = p_ubicacion_id
    and st.cantidad > 0
    and (p_alcance_categoria_id is null or p.categoria_id = p_alcance_categoria_id)
  order by
    (
      select max(c2.cerrado_en) from conteos c2 join conteo_items ci2 on ci2.conteo_id = c2.id
      where ci2.variante_id = va.id
        and c2.ubicacion_id = p_ubicacion_id
        and c2.estado = 'cerrado'
        and c2.sububicacion_id is not distinct from st.sububicacion_id
    ) asc nulls first,
    (st.cantidad * va.precio) desc
  limit 20;
end;
$function$;

revoke all on function retail.fn_prioridad_conteo(uuid, uuid) from public;
grant execute on function retail.fn_prioridad_conteo(uuid, uuid) to authenticated;

comment on function retail.fn_prioridad_conteo(uuid, uuid) is
  'Las 20 filas (variante × sububicación con stock sin contar) que más conviene contar primero: nunca contadas en ESA sububicación primero, después por plata en riesgo. ADR-0074/PR#77; sububicación agregada 2026-09-18 para no confundir piso con almacén.';
