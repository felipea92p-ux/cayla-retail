-- ADR-0400, actividad 8d (2026-10-15): «¿Alcanza la tela?» del Resumen cuenta lo que las órdenes ya reservan y dice lo que está pedido.
--
-- EL PROBLEMA
--   El Resumen calculaba lo que «piden» las órdenes abiertas con el RENDIMIENTO MEDIDO de las órdenes cerradas de cada modelo (rendimiento × plan − lo descontado). Un modelo sin una orden cerrada con tela usada no
--   aportaba demanda («todavía no aporta», decía la nota de abajo), y una orden nueva, que ya trae su tela declarada (`produccion_insumos`, actividad 1), contaba con una fórmula distinta de la de la hoja
--   de Nueva orden y de la página de la orden. Y cuando faltaba tela, la tarjeta mandaba a «Registrar el comprobante»: a anotar una factura, no a PEDIR (hallazgo de la prueba ciega del 2026-10-14).
--
-- QUÉ HACE (solo lectura; sin tablas, sin políticas)
--   `fn_tela_del_taller(p_ubicacion_id)`: devuelve (1) por cada tela y avío que alguna orden abierta del Taller declara o que tiene un pedido en camino: lo COMPROMETIDO (la MISMA cuenta de `fn_nueva_orden_opciones`: el plan declarado menos lo
--   ya descontado, sin pasar de cero), los modelos de las órdenes que todavía lo necesitan y las órdenes de insumos GENERADAS de ese insumo con destino el Taller (de los últimos 60 días); y (2) las órdenes abiertas
--   que NO declaran ninguna tela (las de antes de las fases, y las que se abrieron sin tela), para que el Resumen las siga contando con el rendimiento medido: no se inventa ni se pierde demanda.
--
-- DESCARTÉ
--   · Reemplazar el rendimiento medido de golpe: una orden sin tela declarada quedaría sin demanda. La declarada manda; el medido sigue donde no hay nada declarado.
--   · Sumar lo pedido a «lo que hay» para decir «alcanza»: una orden de insumos no se liga a la recepción (solo es `generada` o `anulada`), así que lo ya recibido se contaría dos veces. Lo pedido se MUESTRA,
--     igual que en la página de la orden (actividad 7).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, después de 154000, 155000, 20261015005000 y 20261015165000): solo `create or replace function`; ninguna política ni `alter table`. Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_tela_del_taller(p_ubicacion_id uuid) returns jsonb
language sql stable
security definer
set search_path = retail, public, extensions
as $$
  -- Una ubicación que no existe no es «no hay nada»: es NULL (la misma respuesta que a quien no puede leer).
  select case when exists (select 1 from retail.ubicaciones u where u.id = p_ubicacion_id) and retail.fn_produccion_puede_leer(p_ubicacion_id) then jsonb_build_object(
    'telas', coalesce((
      select jsonb_agg(jsonb_build_object('insumo_id', t.insumo_id, 'comprometido', coalesce(c.comprometido, 0), 'ordenes', coalesce(c.ordenes, '[]'::jsonb), 'pedidos', coalesce(pd.pedidos, '[]'::jsonb)) order by t.insumo_id)
      -- Las telas que alguna orden abierta declara y las que tienen un pedido en camino (aunque ninguna orden las declare: una orden sin tela declarada también las pide).
      from (
        select pi0.insumo_id from retail.produccion_insumos pi0 join retail.producciones p0 on p0.id = pi0.produccion_id where p0.ubicacion_id = p_ubicacion_id and p0.estado = 'en_proceso'
        union
        select it0.insumo_id from retail.orden_insumo_items it0 join retail.ordenes_insumo oi0 on oi0.id = it0.orden_insumo_id
         where oi0.ubicacion_destino_id = p_ubicacion_id and oi0.estado = 'generada' and oi0.fecha_emision >= retail.fn_hoy_lima() - 60
      ) t
      left join lateral (
        select greatest(sum(pi.cantidad_plan) - coalesce((
                 select sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end)
                 from retail.movimientos_insumo mi
                 where mi.insumo_id = t.insumo_id and mi.tipo in ('consumo', 'devolucion')
                   and mi.produccion_id in (select p2.id from retail.producciones p2 where p2.ubicacion_id = p_ubicacion_id and p2.estado = 'en_proceso')), 0), 0) as comprometido,
               -- Los modelos de las órdenes que todavía necesitan esta tela (su plan de ese insumo menos lo que esa orden ya descontó, por encima de cero).
               coalesce((
                 select jsonb_agg(pr3.referencia order by p3.numero)
                 from retail.producciones p3
                 join retail.productos pr3 on pr3.id = p3.producto_id
                 where p3.ubicacion_id = p_ubicacion_id and p3.estado = 'en_proceso'
                   and coalesce((select sum(pi3.cantidad_plan) from retail.produccion_insumos pi3 where pi3.produccion_id = p3.id and pi3.insumo_id = t.insumo_id), 0)
                       - coalesce((select sum(case when mi3.tipo = 'consumo' then mi3.cantidad else -mi3.cantidad end)
                                   from retail.movimientos_insumo mi3
                                   where mi3.insumo_id = t.insumo_id and mi3.tipo in ('consumo', 'devolucion') and mi3.produccion_id = p3.id), 0) > 0.0005), '[]'::jsonb) as ordenes
          from retail.produccion_insumos pi
          join retail.producciones p on p.id = pi.produccion_id
         where pi.insumo_id = t.insumo_id and p.ubicacion_id = p_ubicacion_id and p.estado = 'en_proceso'
      ) c on true
      left join lateral (
        select jsonb_agg(jsonb_build_object(
                 'numero_texto', retail.fn_orden_insumo_numero_texto(oi.numero), 'proveedor', pr.nombre, 'cantidad', it.cantidad, 'unidad', it.unidad_medida,
                 'fecha_entrega', oi.fecha_entrega_estimada, 'emision', oi.fecha_emision) order by oi.fecha_emision desc, oi.numero desc) as pedidos
          from retail.orden_insumo_items it
          join retail.ordenes_insumo oi on oi.id = it.orden_insumo_id
          join retail.proveedores_produccion pr on pr.id = oi.proveedor_id
         where it.insumo_id = t.insumo_id and oi.ubicacion_destino_id = p_ubicacion_id and oi.estado = 'generada' and oi.fecha_emision >= retail.fn_hoy_lima() - 60
      ) pd on true
    ), '[]'::jsonb),
    'sin_declarar', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'producto_id', p.producto_id, 'referencia', pr.referencia) order by p.numero)
      from retail.producciones p
      join retail.productos pr on pr.id = p.producto_id
      where p.ubicacion_id = p_ubicacion_id and p.estado = 'en_proceso'
        and not exists (select 1 from retail.produccion_insumos x where x.produccion_id = p.id)), '[]'::jsonb)
  ) end
$$;

comment on function retail.fn_tela_del_taller(uuid) is
  'ADR-0400 (actividad 8d): por cada tela y avío que declaran las órdenes abiertas del Taller, lo comprometido (la cuenta de Nueva orden), los modelos que lo necesitan y lo pedido (últimos 60 días); y las órdenes abiertas sin tela declarada. NULL si no se puede leer.';

revoke all on function retail.fn_tela_del_taller(uuid) from public, anon;
grant execute on function retail.fn_tela_del_taller(uuid) to authenticated, service_role;

reset lock_timeout;
