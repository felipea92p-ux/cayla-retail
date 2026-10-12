-- Plan de campaña: lo ya pedido en órdenes de compra (ADR-0372, act. 2026-10-12 (e); Órdenes de compra, ADR-0362).
--
-- EL PROBLEMA. El Plan decía cuánto conviene comprar de cada categoría y la orden de compra decía cuánto se le pidió a un proveedor, pero no se
-- miraban: «Te quedan S/ X» restaba solo lo planificado y nadie veía cuánto del plan ya estaba pedido.
--
-- DECISIONES DE FELIPE (2026-10-12):
--   · Una orden es de una campaña por sus FECHAS: la que llega (su entrega estimada; sin ella, su emisión) dentro de las fechas de la campaña
--     («Diciembre es del 1 al 31»). Sin campo nuevo en la orden.
--   · Lo pedido se MUESTRA, no se resta de «Comprar»: las órdenes todavía no saben cuándo llegó la mercadería (eso es la fase 4 de Órdenes, recibir
--     contra la orden). Restarlo contaría dos veces lo que ya entró al stock.
--
-- QUÉ CREA: `fn_plan_compra_pedido(plan)` → por categoría, las unidades y los soles pedidos (solo órdenes `generada`; una anulada deja de contar
-- sola), y la lista corta de esas órdenes (número, proveedor, a dónde llega, cuándo). Pide el módulo del Plan, como el resto de sus lecturas: muestra
-- totales por categoría a quien ve el Plan aunque no vea Órdenes de compra (el Plan ya muestra la inversión planificada).
--
-- CÓMO SE PEGA: una función nueva, sin tablas ni políticas. Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_plan_compra_pedido(p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_desde date;
  v_hasta date;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Ver el plan de campaña necesita el módulo «Plan de campaña» en tu rol' using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  for v_desde, v_hasta in select p.desde, p.hasta from retail.planes_compra p where p.id = p_plan_id loop exit; end loop;
  if v_desde is null then
    return null;
  end if;

  return (
    with ordenes as (
      select o.id, o.numero, o.fecha_emision, o.fecha_entrega_estimada, pv.nombre as proveedor,
             coalesce(u.nombre, 'Por repartir') as destino
        from retail.ordenes_compra o
        join retail.proveedores pv on pv.id = o.proveedor_id
        left join retail.ubicaciones u on u.id = o.ubicacion_destino_id
       where o.estado = 'generada'
         and coalesce(o.fecha_entrega_estimada, o.fecha_emision) between v_desde and v_hasta
    ),
    lineas as (
      select i.orden_compra_id, i.categoria_id, i.cantidad, i.subtotal
        from retail.orden_compra_items i
       where i.orden_compra_id in (select id from ordenes)
    )
    select jsonb_build_object(
      'ordenes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', o.id, 'numero', o.numero, 'proveedor', o.proveedor, 'destino', o.destino,
                 'emision', o.fecha_emision, 'entrega', o.fecha_entrega_estimada,
                 'unidades', (select coalesce(sum(l.cantidad), 0) from lineas l where l.orden_compra_id = o.id),
                 'total', (select coalesce(round(sum(l.subtotal), 2), 0) from lineas l where l.orden_compra_id = o.id))
               order by coalesce(o.fecha_entrega_estimada, o.fecha_emision), o.numero)
          from ordenes o), '[]'::jsonb),
      'categorias', coalesce((
        select jsonb_agg(jsonb_build_object('c', g.categoria_id, 'unidades', g.unidades, 'soles', g.soles, 'ordenes', g.ordenes))
          from (select l.categoria_id, sum(l.cantidad)::integer as unidades, round(sum(l.subtotal), 2) as soles,
                       jsonb_agg(distinct (select o.numero from ordenes o where o.id = l.orden_compra_id)) as ordenes
                  from lineas l group by l.categoria_id) g), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function retail.fn_plan_compra_pedido(uuid) from public, anon;
grant execute on function retail.fn_plan_compra_pedido(uuid) to authenticated, service_role;
comment on function retail.fn_plan_compra_pedido(uuid) is
  'ADR-0372: lo pedido en órdenes de compra (generadas) que llegan dentro de las fechas de la campaña, por categoría y por orden. Lo muestra el Plan; no lo resta de «Comprar» hasta que las órdenes sepan cuándo llegó la mercadería. Pide el módulo plan_compra.';
