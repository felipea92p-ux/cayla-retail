-- Conteo físico: sugerencia de qué contar primero, por valor en riesgo
-- (Felipe, 2026-09-17)
--
-- Problema real: /inventario/conteo hoy no sugiere nada — el colaborador
-- busca a ciegas por SKU o escanea lo que se le ocurre. Sin una sugerencia,
-- en la práctica se termina contando primero lo que más se nota (lo que
-- más rota), y una prenda cara de baja rotación puede pasar meses sin que
-- nadie la cuente — un descuadre ahí no se nota en unidades, se nota en
-- plata.
--
-- fn_prioridad_conteo ordena por dos criterios, en este orden:
--   1. Cobertura: lo nunca contado va primero siempre — cero confianza en
--      ese número hasta que alguien lo cuente por primera vez.
--   2. Valor en riesgo: stock.cantidad * variantes.precio — cuánta plata
--      hay parada en esa variante en esta sede ahora mismo. A propósito
--      NO se usa ventas del mes: una prenda cara que casi no rota igual
--      tiene plata parada en la percha, y un descuadre ahí cuesta más que
--      uno en un básico barato que vende mucho pero vale poco por unidad.
create function retail.fn_prioridad_conteo(p_ubicacion_id uuid)
returns table (
  variante_id uuid,
  sku text,
  referencia text,
  talla text,
  color text,
  dias_sin_contar integer,
  cantidad_stock integer,
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
    st.cantidad,
    (st.cantidad * va.precio) as valor_en_riesgo
  from stock st
  join variantes va on va.id = st.variante_id
  join productos p on p.id = va.producto_id
  left join colores co on co.codigo = va.color_codigo
  where st.ubicacion_id = p_ubicacion_id
    and st.cantidad > 0
  order by
    (
      select max(c2.cerrado_en) from conteos c2 join conteo_items ci2 on ci2.conteo_id = c2.id
      where ci2.variante_id = va.id and c2.ubicacion_id = p_ubicacion_id and c2.estado = 'cerrado'
    ) asc nulls first,
    (st.cantidad * va.precio) desc
  limit 20;
end;
$$;

grant execute on function retail.fn_prioridad_conteo(uuid) to authenticated;
