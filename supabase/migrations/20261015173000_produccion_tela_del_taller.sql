-- ADR-0400, actividad 8d (2026-10-15) y su reescritura del 2026-10-16: «¿Alcanza la tela?» del Resumen cuenta lo que las órdenes ya reservan y LO QUE VIENE EN CAMINO.
--
-- EL PROBLEMA
--   El Resumen calculaba lo que «piden» las órdenes abiertas con el RENDIMIENTO MEDIDO de las órdenes cerradas de cada modelo (rendimiento × plan − lo descontado). Un modelo sin una orden cerrada con tela usada no
--   aportaba demanda («todavía no aporta», decía la nota de abajo), y una orden nueva, que ya trae su tela declarada (`produccion_insumos`, actividad 1), contaba con una fórmula distinta de la de la hoja
--   de Nueva orden y de la página de la orden. Y cuando faltaba tela, la tarjeta mandaba a «Registrar el comprobante»: a anotar una factura, no a PEDIR (hallazgo de la prueba ciega del 2026-10-14).
--   Y después, con 155 m pedidos al lado, seguía diciendo «Faltan 146.5 m»: no se sabía si lo pedido ya había llegado (hallazgo de la prueba ciega del 2026-10-15).
--
-- QUÉ HACE (solo lectura; sin tablas, sin políticas)
--   `fn_tela_del_taller(p_ubicacion_id)`: devuelve (1) por cada tela y avío que alguna orden abierta del Taller declara o que tiene algo por recibir: lo COMPROMETIDO (la MISMA cuenta de `fn_nueva_orden_opciones`: el plan
--   declarado menos lo ya descontado, sin pasar de cero), los modelos de las órdenes que todavía lo necesitan, y lo que VIENE EN CAMINO —lo que falta recibir de las órdenes de insumos generadas con destino el Taller, con
--   sus pedidos— sacado de `fn_tela_en_camino` (20261015165000), la lectura única que usan también la página de la orden y la hoja de Nueva orden: `en_camino` (lo que cuenta), `atrasado` (los pedidos cuya fecha
--   estimada de entrega ya pasó: no se cuentan, regla de Felipe del 2026-10-16) y `pedidos`; y (2) las órdenes abiertas que NO declaran ninguna tela (las de antes de las fases, y las que se abrieron sin tela),
--   para que el Resumen las siga contando con el rendimiento medido: no se inventa ni se pierde demanda.
--
-- DESCARTÉ
--   · Reemplazar el rendimiento medido de golpe: una orden sin tela declarada quedaría sin demanda. La declarada manda; el medido sigue donde no hay nada declarado.
--   · Volver a calcular aquí lo pendiente de cada pedido: es de `fn_orden_insumo_por_recibir_lineas` (ADR-0362) y de `fn_tela_en_camino`; una sola cuenta para las tres pantallas.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, después de 154000, 155000, 20261015005000 y 20261015165000, que define `fn_tela_en_camino`): solo `create or replace function`; ninguna política ni
-- `alter table`. Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_tela_del_taller(p_ubicacion_id uuid) returns jsonb
language sql stable
security definer
set search_path = retail, public, extensions
as $$
  -- Lo que viene en camino, UNA vez (la misma lectura que la página de la orden). NULL si no se puede leer: entonces la respuesta entera es NULL.
  with camino as materialized (
    select e from jsonb_array_elements(coalesce(retail.fn_tela_en_camino(p_ubicacion_id), '[]'::jsonb)) e
  )
  -- Una ubicación que no existe no es «no hay nada»: es NULL (la misma respuesta que a quien no puede leer).
  select case when exists (select 1 from retail.ubicaciones u where u.id = p_ubicacion_id) and retail.fn_produccion_puede_leer(p_ubicacion_id) then jsonb_build_object(
    'telas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'insumo_id', t.insumo_id, 'comprometido', coalesce(c.comprometido, 0), 'ordenes', coalesce(c.ordenes, '[]'::jsonb),
               'en_camino', coalesce((cm.e ->> 'cuenta')::numeric, 0), 'atrasado', coalesce((cm.e ->> 'atrasado')::numeric, 0), 'pedidos', coalesce(cm.e -> 'pedidos', '[]'::jsonb)) order by t.insumo_id)
      -- Las telas que alguna orden abierta declara y las que tienen algo por recibir (aunque ninguna orden las declare: una orden sin tela declarada también las pide).
      from (
        select pi0.insumo_id from retail.produccion_insumos pi0 join retail.producciones p0 on p0.id = pi0.produccion_id where p0.ubicacion_id = p_ubicacion_id and p0.estado = 'en_proceso'
        union
        select (e ->> 'insumo_id')::uuid from camino
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
        select e from camino where (e ->> 'insumo_id')::uuid = t.insumo_id limit 1
      ) cm on true
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
  'ADR-0400 (actividad 8d, reescrita el 2026-10-16): por cada tela y avío que declaran las órdenes abiertas del Taller o que tienen algo por recibir, lo comprometido (la cuenta de Nueva orden), los modelos que lo necesitan y lo que viene en camino (fn_tela_en_camino: lo que falta recibir, sin los pedidos atrasados) con sus pedidos; y las órdenes abiertas sin tela declarada. NULL si no se puede leer.';

revoke all on function retail.fn_tela_del_taller(uuid) from public, anon;
grant execute on function retail.fn_tela_del_taller(uuid) to authenticated, service_role;

reset lock_timeout;
