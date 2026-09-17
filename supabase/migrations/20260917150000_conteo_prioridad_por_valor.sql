-- ============================================================================
-- 20260917150000 — Prioridad de conteo: ordena por plata en riesgo, no por
-- unidades vendidas
--
-- QUÉ ESTABA MAL
--   `fn_prioridad_conteo` (20260916110000_conteo_alcance_y_cadencia.sql)
--   ordena primero por "nunca contada" / "hace más tiempo sin contar" (eso
--   queda igual, es correcto) y como desempate usa `ventas_30d desc` —
--   unidades VENDIDAS, no plata en juego. Es el mismo error que el ABC
--   clásico de cycle counting evita a propósito: una prenda cara de baja
--   rotación (una chaqueta de cuero, pocas unidades, costo alto) pierde
--   contra un pack de medias barato que vende 40 al mes, aunque la
--   chaqueta sea la que de verdad duele si el conteo la encuentra mal.
--
-- QUÉ CAMBIA
--   El desempate pasa a ser `valor_stock desc` (cantidad en esa ubicación ×
--   costo actual de la variante — la misma fórmula que ya usa
--   `getResumenCierreConteo` en `apps/web/lib/conteos.ts:261` para valorizar
--   la diferencia al cerrar). `ventas_30d` se queda en la respuesta — sigue
--   siendo un dato útil para la Encargada ("vende 12/mes"), solo deja de
--   decidir el orden.
--
-- POR QUÉ MIGRACIÓN NUEVA Y NO EDITAR LA DEL 16
--   Esa migración ya está fusionada a `main` — no se reescribe una migración
--   que ya viajó, aunque todavía no esté pegada en producción (ver
--   BACKLOG.md, sección "5 piezas inspiradas en NetSuite": "todo verificado
--   solo en LOCAL — nada tocado en producción"). `create or replace
--   function` con la misma firma no rompe nada que ya la llame.
-- ============================================================================

-- `create or replace` no puede sumar una columna al RETURNS TABLE de una
-- función existente (Postgres lo rechaza: "cannot change return type of
-- existing function") — se dropea y se recrea, mismo criterio que ya usó
-- `retail.actualizar_categoria` (20260915224501_categorias_subcategoria.sql)
-- para el mismo problema con un parámetro nuevo.
drop function if exists retail.fn_prioridad_conteo(uuid, uuid);

create function retail.fn_prioridad_conteo(p_ubicacion_id uuid, p_alcance_categoria_id uuid default null)
returns table (
  variante_id uuid,
  sku text,
  referencia text,
  talla text,
  color text,
  dias_sin_contar integer,
  ventas_30d integer,
  valor_stock numeric
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
    coalesce((
      select sum(m.cantidad)::integer
      from movimientos m
      where m.variante_id = va.id and m.ubicacion_id = p_ubicacion_id
        and m.tipo = 'salida' and m.motivo = 'venta'
        and m.created_at >= now() - interval '30 days'
    ), 0) as ventas_30d,
    (st.cantidad * coalesce(va.costo, 0)) as valor_stock
  from variantes va
  join productos p on p.id = va.producto_id
  left join colores co on co.codigo = va.color_codigo
  join stock st on st.variante_id = va.id and st.ubicacion_id = p_ubicacion_id and st.cantidad > 0
  where (p_alcance_categoria_id is null or p.categoria_id = p_alcance_categoria_id)
  order by (
    select max(c2.cerrado_en) from conteos c2 join conteo_items ci2 on ci2.conteo_id = c2.id
    where ci2.variante_id = va.id and c2.ubicacion_id = p_ubicacion_id and c2.estado = 'cerrado'
  ) asc nulls first, valor_stock desc
  limit 20;
end;
$$;

comment on function retail.fn_prioridad_conteo(uuid, uuid) is
  'Las 20 variantes que más conviene contar primero: nunca contadas / hace más tiempo sin contar primero, después por plata en riesgo (cantidad en stock × costo actual) — no por unidades vendidas. ventas_30d se conserva en la respuesta como dato informativo.';
