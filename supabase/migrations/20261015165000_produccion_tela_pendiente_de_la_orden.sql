-- ADR-0400, actividad 7 (2026-10-15) y su reescritura del 2026-10-16: «¿alcanza la tela?» cuenta lo que otras órdenes ya reservan y LO QUE VIENE EN CAMINO.
--
-- EL PROBLEMA
--   La página de una orden decía «Alcanza» comparando su plan contra TODO lo que hay en el estante. Pero otra orden abierta puede tener ya reservados esos mismos metros (su plan menos lo que
--   ya descontó), y dos órdenes dirían «alcanza» contra los mismos metros (hallazgo 3 del escéptico del ADR-0400). La hoja de Nueva orden ya resta lo comprometido (`fn_nueva_orden_opciones`);
--   la página de la orden y la lista no.
--   Y el Resumen decía «Faltan 146.5 m» con 155 m pedidos al lado: no se podía saber si lo pedido ya había llegado, y la persona no se atrevió a guardar un pedido por miedo a duplicarlo.
--
-- QUÉ HACE (solo lectura; sin tablas, sin políticas)
--   1. `fn_tela_en_camino(p_ubicacion_id)`: la UNA lectura de lo que viene a ese Taller, por tela y avío. Sale de `fn_orden_insumo_por_recibir_lineas` (ADR-0362, la misma que alimenta la pantalla
--      Recibir): de cada orden de insumos GENERADA con destino el Taller, lo que le QUEDA por recibir (lo pedido o lo facturado, menos lo recibido y lo que se anotó como «no llegará»).
--      Regla de Felipe (2026-10-16): CUENTA lo que falta recibir, salvo los pedidos ATRASADOS (su fecha estimada de entrega ya pasó): esos no se cuentan y salen aparte, porque nadie
--      sabe si van a llegar. Un pedido sin fecha estimada cuenta (no se puede probar que se atrasó). Ya no hay ventana de 60 días: la recepción dice lo que falta de verdad.
--   2. `fn_tela_pendiente_de_la_orden(p_produccion_id)`: por cada tela y avío de esa orden, (a) cuánto reservan las OTRAS órdenes abiertas del Taller (la misma fórmula de
--      `fn_nueva_orden_opciones`: su plan menos lo ya descontado, sin pasar de cero, sin contar esta orden) y (b) lo que viene en camino y los pedidos, de (1). Con (a) y (b) la web calcula
--      «alcanza» (`veredictoTela`), «alcanza cuando llegue lo pedido» o «faltan N m», y dice de qué pedido sale cada cosa.
--
-- DESCARTÉ
--   · Sumar la cantidad PEDIDA a «lo que hay» (la versión del 2026-10-15 lo descartó porque una orden de insumos no se ligaba a la recepción y lo ya recibido se contaría dos veces). Con la
--     recepción de main ya ligada a cada línea, se suma lo que QUEDA por recibir, que no cuenta nada dos veces.
--   · Contar también los pedidos atrasados: un pedido que ya debió llegar y no llegó es un riesgo, no tela disponible; sale aparte con su aviso.
--   · Rehacer `fn_orden_produccion` (ya van tres versiones): una función aparte, que la página llama y la lista incluye.
--   · Tocar `fn_nueva_orden_opciones` (en la migración 154000, que ya puede estar pegada): la hoja de Nueva orden pide `fn_tela_en_camino` aparte.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, después de 154000, 155000 y 20261015005000; necesita la recepción de las órdenes de insumos de main, 20261015035000/040000/043000,
-- que ya está en producción): solo `create or replace function`; ninguna política ni `alter table`. Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Lo que viene en camino al Taller, por tela y avío ----------
-- [{insumo_id, cuenta, atrasado, pedidos: [{numero_texto, proveedor, cantidad (= lo que falta recibir), unidad, fecha_entrega, emision, atrasado}]}], un elemento por insumo con algo por recibir.
-- NULL si quien pregunta no puede leer Producción en ese Taller.
create or replace function retail.fn_tela_en_camino(p_ubicacion_id uuid) returns jsonb
language sql stable
security definer
set search_path = retail, public, extensions
as $$
  select case when p_ubicacion_id is not null and retail.fn_produccion_puede_leer(p_ubicacion_id) then coalesce((
    select jsonb_agg(jsonb_build_object('insumo_id', t.insumo_id, 'cuenta', t.cuenta, 'atrasado', t.atrasado, 'pedidos', t.pedidos) order by t.insumo_id)
    from (
      select l.insumo_id,
             coalesce(sum(l.queda) filter (where not l.atrasado), 0) as cuenta,
             coalesce(sum(l.queda) filter (where l.atrasado), 0) as atrasado,
             jsonb_agg(jsonb_build_object(
               'numero_texto', retail.fn_orden_insumo_numero_texto(l.numero), 'proveedor', l.proveedor, 'cantidad', l.queda, 'unidad', l.unidad,
               'fecha_entrega', l.fecha_entrega, 'emision', l.emision, 'atrasado', l.atrasado)
               -- Primero lo que sí cuenta, lo más próximo a llegar antes (el que no tiene fecha, al final de esos); al fondo, los atrasados.
               order by l.atrasado, l.fecha_entrega nulls last, l.emision desc, l.numero desc) as pedidos
        from (
          select oi.numero, oi.fecha_emision as emision, oi.fecha_entrega_estimada as fecha_entrega, pr.nombre as proveedor, r.insumo_id, r.unidad, r.queda,
                 (oi.fecha_entrega_estimada is not null and oi.fecha_entrega_estimada < retail.fn_hoy_lima()) as atrasado
            from retail.ordenes_insumo oi
            join retail.proveedores_produccion pr on pr.id = oi.proveedor_id
            cross join lateral retail.fn_orden_insumo_por_recibir_lineas(oi.id) r
           where oi.ubicacion_destino_id = p_ubicacion_id and oi.estado = 'generada' and r.queda > 0
        ) l
       group by l.insumo_id
    ) t
  ), '[]'::jsonb) end
$$;

comment on function retail.fn_tela_en_camino(uuid) is
  'ADR-0400 (2026-10-16): lo que viene al Taller por tela y avío = lo que QUEDA por recibir de cada orden de insumos generada (ADR-0362); cuenta lo que no está atrasado (fecha estimada vencida) y saca aparte lo atrasado. NULL si no se puede leer.';

revoke all on function retail.fn_tela_en_camino(uuid) from public, anon;
grant execute on function retail.fn_tela_en_camino(uuid) to authenticated, service_role;

-- ---------- 2. La tela pendiente de una orden ----------
create or replace function retail.fn_tela_pendiente_de_la_orden(p_produccion_id uuid) returns jsonb
language plpgsql stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion uuid;
  v_camino jsonb;
begin
  select p.ubicacion_id into v_ubicacion from retail.producciones p where p.id = p_produccion_id;
  -- La misma puerta que `fn_orden_produccion`: quien ve Producción en ese Taller, o el líder. Si no: NULL.
  if v_ubicacion is null or not retail.fn_produccion_puede_leer(v_ubicacion) then return null; end if;

  v_camino := coalesce(retail.fn_tela_en_camino(v_ubicacion), '[]'::jsonb);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'insumo_id', i.insumo_id, 'comprometido_otras', coalesce(c.cantidad, 0),
             'en_camino', coalesce((cm.e ->> 'cuenta')::numeric, 0), 'atrasado', coalesce((cm.e ->> 'atrasado')::numeric, 0), 'pedidos', coalesce(cm.e -> 'pedidos', '[]'::jsonb)) order by i.insumo_id)
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
      select e from jsonb_array_elements(v_camino) e where (e ->> 'insumo_id')::uuid = i.insumo_id limit 1
    ) cm on true
  ), '[]'::jsonb);
end;
$$;

comment on function retail.fn_tela_pendiente_de_la_orden(uuid) is
  'ADR-0400 (actividad 7, reescrita el 2026-10-16): por cada tela y avío de la orden, lo que reservan las OTRAS órdenes abiertas del Taller y lo que viene en camino (fn_tela_en_camino: lo que falta recibir, sin los pedidos atrasados) con sus pedidos. NULL si no se puede leer.';

revoke all on function retail.fn_tela_pendiente_de_la_orden(uuid) from public, anon;
grant execute on function retail.fn_tela_pendiente_de_la_orden(uuid) to authenticated, service_role;

reset lock_timeout;
