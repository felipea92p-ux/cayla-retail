-- ADR-0400, actividad 7 (2026-10-15): «¿alcanza la tela?» cuenta lo que otras órdenes ya reservan, y dice lo que está pedido.
--
-- EL PROBLEMA
--   La página de una orden decía «Alcanza» comparando su plan contra TODO lo que hay en el estante. Pero otra orden abierta puede tener ya reservados esos mismos metros (su plan menos lo que
--   ya descontó), y dos órdenes dirían «alcanza» contra los mismos metros (hallazgo 3 del escéptico del ADR-0400). La hoja de Nueva orden ya resta lo comprometido (`fn_nueva_orden_opciones`);
--   la página de la orden y la lista no.
--
-- QUÉ HACE (solo lectura; sin tablas, sin políticas)
--   `fn_tela_pendiente_de_la_orden(p_produccion_id)`: por cada tela y avío de esa orden, (1) cuánto reservan las OTRAS órdenes abiertas del Taller (la misma fórmula de `fn_nueva_orden_opciones`:
--   su plan menos lo ya descontado, sin pasar de cero, sin contar esta orden) y (2) las órdenes de insumos GENERADAS de ese insumo con destino ese Taller (número, proveedor, cuánto, para cuándo),
--   de los últimos 60 días. Con (1) la web calcula «alcanza» (`veredictoTela` ya recibe lo comprometido) y con (2) dice «ya hay 50 m pedidos a X» y lleva a pedir lo que falta.
--
-- DESCARTÉ
--   · Sumar lo pedido a «lo que hay» para decir «alcanza»: una orden de insumos no tiene estado «recibida» ni se liga a la recepción (`ordenes_insumo.estado` es `generada` o `anulada`), así que lo
--     ya recibido se contaría dos veces (en el estante y en lo pedido) y diría «alcanza» sin que alcance. Lo pedido se MUESTRA; quien lo sabe decide. Si algún día la recepción se liga a la orden,
--     esto cuenta lo pendiente de verdad.
--   · Rehacer `fn_orden_produccion` (ya van tres versiones): una función aparte, que la página llama y la lista incluye.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, después de 154000, 155000 y 20261015005000): solo `create or replace function`; ninguna política ni `alter table`. Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_tela_pendiente_de_la_orden(p_produccion_id uuid) returns jsonb
language plpgsql stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion uuid;
begin
  select p.ubicacion_id into v_ubicacion from retail.producciones p where p.id = p_produccion_id;
  -- La misma puerta que `fn_orden_produccion`: quien ve Producción en ese Taller, o el líder. Si no: NULL.
  if v_ubicacion is null or not retail.fn_produccion_puede_leer(v_ubicacion) then return null; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('insumo_id', i.insumo_id, 'comprometido_otras', coalesce(c.cantidad, 0), 'pedidos', coalesce(pd.pedidos, '[]'::jsonb)) order by i.insumo_id)
    from (select distinct pi.insumo_id from retail.produccion_insumos pi where pi.produccion_id = p_produccion_id) i
    left join lateral (
      select greatest(
               sum(pi2.cantidad_plan) - coalesce((
                 select sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end)
                 from retail.movimientos_insumo mi
                 where mi.insumo_id = i.insumo_id and mi.tipo in ('consumo', 'devolucion')
                   and mi.produccion_id in (select p3.id from retail.producciones p3 where p3.ubicacion_id = v_ubicacion and p3.estado = 'en_proceso' and p3.id <> p_produccion_id)), 0), 0) as cantidad
        from retail.produccion_insumos pi2
        join retail.producciones p2 on p2.id = pi2.produccion_id
       where pi2.insumo_id = i.insumo_id and p2.ubicacion_id = v_ubicacion and p2.estado = 'en_proceso' and p2.id <> p_produccion_id
    ) c on true
    left join lateral (
      select jsonb_agg(jsonb_build_object(
               'numero_texto', retail.fn_orden_insumo_numero_texto(oi.numero), 'proveedor', pr.nombre, 'cantidad', it.cantidad, 'unidad', it.unidad_medida,
               'fecha_entrega', oi.fecha_entrega_estimada, 'emision', oi.fecha_emision) order by oi.fecha_emision desc, oi.numero desc) as pedidos
        from retail.orden_insumo_items it
        join retail.ordenes_insumo oi on oi.id = it.orden_insumo_id
        join retail.proveedores_produccion pr on pr.id = oi.proveedor_id
       where it.insumo_id = i.insumo_id and oi.ubicacion_destino_id = v_ubicacion and oi.estado = 'generada' and oi.fecha_emision >= retail.fn_hoy_lima() - 60
    ) pd on true
  ), '[]'::jsonb);
end;
$$;

comment on function retail.fn_tela_pendiente_de_la_orden(uuid) is
  'ADR-0400 (actividad 7): por cada tela y avío de la orden, lo que reservan las OTRAS órdenes abiertas del Taller y las órdenes de insumos generadas (últimos 60 días) de ese insumo. NULL si no se puede leer.';

revoke all on function retail.fn_tela_pendiente_de_la_orden(uuid) from public, anon;
grant execute on function retail.fn_tela_pendiente_de_la_orden(uuid) to authenticated, service_role;

reset lock_timeout;
