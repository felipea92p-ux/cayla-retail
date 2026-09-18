-- Conteo físico: la sugerencia "Conviene contar primero" pasa a ordenar
-- por valor en riesgo, no por ventas del mes (Felipe, 2026-09-17)
--
-- ESPECIFICACIÓN — qué significa "prioriza por plata en riesgo":
--   valor_en_riesgo(variante, sede) = stock.cantidad × variantes.precio
--   Es cuánta plata hay parada en esa variante, en esa sede, ahora mismo —
--   NO cuánto se vendió. Una prenda cara de baja rotación puede tener más
--   plata parada en la percha que un básico barato que vende mucho; antes
--   (20260916110000_conteo_alcance_y_cadencia.sql) el desempate usaba
--   ventas_30d (unidades vendidas en 30 días) y esa prenda cara perdía
--   siempre contra el básico, sin importar cuánto valiera.
--
--   Orden final, sin cambios respecto a antes en el primer criterio:
--     1. Cobertura: lo nunca contado va primero (`nulls first`) — cero
--        confianza en ese número hasta la primera vez que se cuenta.
--     2. Dentro de eso: valor_en_riesgo descendente (antes: ventas_30d).
--
-- `ventas_30d` sale del resultado: ya no se usa para ordenar y no queda
-- otro consumidor en el código (grep verificado) — dato muerto, no
-- información "por si acaso".
--
-- `create or replace` no alcanza: Postgres no deja cambiar la forma de lo
-- que devuelve una función (SQLSTATE 42P13) — hay que soltarla primero.
drop function retail.fn_prioridad_conteo(uuid, uuid);

create function retail.fn_prioridad_conteo(p_ubicacion_id uuid, p_alcance_categoria_id uuid default null)
returns table (
  variante_id uuid,
  sku text,
  referencia text,
  talla text,
  color text,
  dias_sin_contar integer,
  valor_en_riesgo numeric
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para ver la prioridad de conteo de esa ubicación';
  end if;

  return query
  select
    va.id,
    va.sku,
    p.referencia,
    va.talla,
    co.nombre,
    (
      select extract(day from now() - max(c.cerrado_en))::integer
      from conteos c
      join conteo_items ci on ci.conteo_id = c.id
      where ci.variante_id = va.id and c.ubicacion_id = p_ubicacion_id and c.estado = 'cerrado'
    ) as dias_sin_contar,
    (st.cantidad * va.precio) as valor_en_riesgo
  from stock st
  join variantes va on va.id = st.variante_id
  join productos p on p.id = va.producto_id
  left join colores co on co.codigo = va.color_codigo
  where st.ubicacion_id = p_ubicacion_id
    and st.cantidad > 0
    and (p_alcance_categoria_id is null or p.categoria_id = p_alcance_categoria_id)
  order by
    (
      select max(c2.cerrado_en) from conteos c2 join conteo_items ci2 on ci2.conteo_id = c2.id
      where ci2.variante_id = va.id and c2.ubicacion_id = p_ubicacion_id and c2.estado = 'cerrado'
    ) asc nulls first,
    (st.cantidad * va.precio) desc
  limit 20;
end;
$$;

revoke all on function retail.fn_prioridad_conteo(uuid, uuid) from public;
grant execute on function retail.fn_prioridad_conteo(uuid, uuid) to authenticated;
