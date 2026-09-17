-- ============================================================================
-- 20260917150000 — Prioridad de conteo por valor en riesgo, no solo unidades
--
-- EL PROBLEMA
--   `fn_prioridad_conteo` (20260916110000) desempata por `ventas_30d` en
--   UNIDADES. Eso es volumen, no plata: una prenda cara de baja rotación
--   (una chompa de alpaca a S/280 que vende 1 al mes) pierde contra una
--   prenda barata de alta rotación (un llavero a S/15 que vende 30 al mes)
--   aunque la primera tenga mucho más dinero parado en el estante. El
--   cycle counting real (clasificación ABC) pesa por valor — cantidad ×
--   costo — no por volumen de venta. CAYLA ya usa exactamente ese cálculo
--   en `apps/web/lib/conteo-varianza.ts` (diferencia × costo) para valorizar
--   una varianza; esto le aplica el mismo criterio a QUÉ CONTAR PRIMERO.
--
-- QUÉ CAMBIA
--   Se agrega `valor_en_riesgo` (stock actual en esa ubicación × costo de
--   la variante) a lo que devuelve la función, y pasa a ser el desempate
--   principal — antes de `ventas_30d`, que se conserva como segundo
--   desempate (una prenda sin costo cargado no debe desaparecer del todo
--   de la lista solo por eso). El orden de fondo no cambia: lo nunca
--   contado sigue yendo primero, siempre.
--
--   El join de talla vía `ta.valor` (no `va.talla`) viene de
--   20260917100800_talla_texto_en_lecturas.sql — esta función ya se había
--   arreglado ahí para el drop de `variantes.talla`; como esta migración
--   la reemplaza entera (ver nota de abajo), hay que preservar ese fix,
--   no partir de la versión original de 20260916110000.
-- ============================================================================

-- `create or replace` no puede cambiar las columnas de salida de una
-- función existente (agregar `valor_en_riesgo` cuenta como cambiar el
-- tipo de retorno) — hay que dropearla y crearla de nuevo.
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
    ta.valor,
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
    (st.cantidad * coalesce(va.costo, 0)) as valor_en_riesgo
  from variantes va
  join productos p on p.id = va.producto_id
  left join tallas ta on ta.id = va.talla_id
  left join colores co on co.codigo = va.color_codigo
  join stock st on st.variante_id = va.id and st.ubicacion_id = p_ubicacion_id
  where st.cantidad > 0
    and (p_alcance_categoria_id is null or p.categoria_id = p_alcance_categoria_id)
  order by (
    select max(c2.cerrado_en) from conteos c2 join conteo_items ci2 on ci2.conteo_id = c2.id
    where ci2.variante_id = va.id and c2.ubicacion_id = p_ubicacion_id and c2.estado = 'cerrado'
  ) asc nulls first, valor_en_riesgo desc, ventas_30d desc
  limit 20;
end;
$$;

revoke all on function retail.fn_prioridad_conteo(uuid, uuid) from public;
grant execute on function retail.fn_prioridad_conteo(uuid, uuid) to authenticated;

comment on function retail.fn_prioridad_conteo(uuid, uuid) is
  'Qué sugiere contar primero: nunca contado primero, después por valor en riesgo (stock × costo, clasificación ABC real), con ventas_30d en unidades como segundo desempate. No restringe qué se puede contar de verdad (conteo_contar sigue abierto a cualquier variante).';
