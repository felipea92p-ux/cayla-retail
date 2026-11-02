-- 5 · ¿Qué parches de `fn_orden_produccion` tiene producción? — SOLO LECTURA (ADR-0597). Una fila por reemplazo anclado de las migraciones de main/del PR sobre esa función: `esta` = el texto
-- nuevo de ese reemplazo está hoy en la función viva. Se compara con la misma consulta en una base local al día (la de abajo está probada ahí).
with d as (select pg_get_functiondef('retail.fn_orden_produccion(uuid)'::regprocedure) as def)
select r.migracion, r.n, position(r.nuevo in d.def) > 0 as esta
from d, (values
  ('20261026151000', 1, $m$'consumo_por_prenda', pi.consumo_por_prenda, 'consumo_por_talla', pi.consumo_por_talla, 'cantidad_plan', pi.cantidad_plan,$m$),
  ('20261029021000', 1, $m$'consumo_por_talla', pi.consumo_por_talla, 'cantidad_plan', pi.cantidad_plan, 'es_complemento', pi.es_complemento,$m$),
  ('20261029164000', 1, $m$'variante_id', l.variante_id, 'plan', l.cantidad_plan,
                 'fallas_segundas', coalesce((select sum(fa.cantidad) from retail.produccion_fallas fa where fa.fase_id = v_fase_id and fa.variante_id = l.variante_id and fa.destino = 'segunda'), 0),
                 'fallas_perdidas', coalesce((select sum(fa.cantidad) from retail.produccion_fallas fa where fa.fase_id = v_fase_id and fa.variante_id = l.variante_id and fa.destino = 'perdida'), 0),$m$),
  ('20261029164000', 2, $m$select coalesce(a.hecho_en, a.created_at), 1, jsonb_build_object($m$),
  ('20261029164000', 3, $m$'cuando', coalesce(a.hecho_en, a.created_at), 'registrado_en', case when a.hecho_en is not null then a.created_at end, 'quien_nombre'$m$),
  ('20261029164000', 4, $m$-- ADR-0570: las prendas con falla de «Terminé» (y su Deshacer), con su destino y su motivo; `falla_id` solo si todavía se puede deshacer.
      select coalesce(fa.hecho_en, fa.created_at), 1, jsonb_build_object(
          'cuando', coalesce(fa.hecho_en, fa.created_at), 'registrado_en', case when fa.hecho_en is not null then fa.created_at end,
          'quien_nombre', nullif(concat_ws(' ', pe.nombres, pe.apellidos), ''),
          'tipo', case when fa.deshace_id is null then 'falla' else 'falla_deshecha' end,
          'fase_clave', f.clave, 'fase_nombre', retail.fn_fase_nombre(f.clave), 'cantidad', abs(fa.cantidad),
          'detalle', abs(fa.cantidad) || ' de ' || retail.fn_produccion_variante_texto(fa.variante_id),
          'destino', fa.destino, 'motivo', fa.motivo, 'variante_id', fa.variante_id,
          'falla_id', case when fa.deshace_id is null and not exists (select 1 from retail.produccion_fallas d where d.deshace_id = fa.id) then fa.id end,
          'avance_id', null, 'id', fa.id)
        from retail.produccion_fallas fa
        join retail.produccion_fases f on f.id = fa.fase_id
        left join public.personas pe on pe.id = fa.hecho_por
       where f.produccion_id = p_produccion_id
      union all
      -- Las anulaciones (filas compensatorias): «Anuló la salida de 48 a X: el motivo». La salida o la vuelta original sigue en su lugar, con `anulada`.$m$),
  ('20261029173000', 1, $m$'linea_de_tiempo', v_tiempo,
    'cambios', retail.fn_produccion_cambios_de_orden(p_produccion_id),
    'deshechos', retail.fn_produccion_deshechos_de_orden(p_produccion_id),$m$),
  ('20261031194000', 1, $m$    -- Estimado: el plan de cada tela o avío × lo que cuesta cada unidad. Si la orden ya consumió de ese insumo, cuesta lo que le costó (su costo medio: consumo menos devolución); si todavía
    -- no, el del lote más antiguo con saldo en ese Taller (PEPS, como `registrar_consumo_insumo`); sin ninguno de los dos, 0 (la pantalla dice «sin lote recibido», no inventa un precio).
    -- Antes se medía SIEMPRE contra el lote con saldo: al gastarse el último lote de una tela su estimado caía a 0 justo cuando ya se había consumido (ADR-0400, act. 2026-10-31).
    select coalesce(sum(case when i.tipo = 'tela' then pi.cantidad_plan * coalesce(case when cons.cantidad > 0 then cons.monto / cons.cantidad end, peps.costo, 0) end), 0),
           coalesce(sum(case when i.tipo <> 'tela' then pi.cantidad_plan * coalesce(case when cons.cantidad > 0 then cons.monto / cons.cantidad end, peps.costo, 0) end), 0)$m$),
  ('20261031194000', 2, $m$      ) peps on true
      left join lateral (
        select sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end) as cantidad,
               sum(case when mi.tipo = 'consumo' then mi.cantidad * mi.costo_unitario else -mi.cantidad * mi.costo_unitario end) as monto
          from retail.movimientos_insumo mi
         where mi.produccion_id = p_produccion_id and mi.insumo_id = pi.insumo_id and mi.tipo in ('consumo', 'devolucion')
      ) cons on true
     where pi.produccion_id = p_produccion_id;$m$),
  ('20261101033000', 1, $m$if v_f ->> 'quien' = 'servicio' or (v_f ->> 'tarifa_prenda') is not null or coalesce((v_f ->> 'fijo_orden')::numeric, 0) > 0 then$m$)
) as r(migracion, n, nuevo)
order by r.migracion, r.n;
