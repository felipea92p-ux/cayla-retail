-- Un producto pedido a otra sede para apartar ya tiene historia (ADR-0233 → ADR-0218).
--
-- EL PROBLEMA. `separacion_pedidos` (20260927140000) cita `variantes`: un pedido puede existir antes de que la prenda se
-- mueva (estado «pedido»), así que ni `movimientos` ni `apartados` lo cuentan. Sin este renglón, «Eliminar» ofrecería
-- borrar un producto que una clienta está esperando y el borrado chocaría con la llave foránea.
--
-- LA DECISIÓN. Un renglón más en la única definición de «historia» de un producto (`fn_producto_se_puede_eliminar`,
-- que usa también `eliminar_producto`). El resto de la función es IDÉNTICO a producción (pg_get_functiondef del
-- 2026-09-26, huella 7f474f7fe8495e7431bc45f5a5d36f0c). `separacion_items_retirados` no necesita renglón: cada fila
-- viene de un apartado de la misma prenda, que ya cuenta el renglón 7.
--
-- PRODUCCIÓN. Solo `create or replace function` (mismo nombre, mismos parámetros y salida). Una parte. Idempotente.

set lock_timeout = '3s';

CREATE OR REPLACE FUNCTION retail.fn_producto_se_puede_eliminar(p_producto_id uuid)
 RETURNS TABLE(puede boolean, razon text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  -- Las mismas constantes de `registrar_venta` (20260912234726_cargo_especial_pos.sql).
  c_producto_centinela constant uuid := '11111111-1111-4111-8111-111111111111';
  c_variante_centinela constant uuid := '22222222-2222-4222-8222-222222222222';
  v_historia text;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede eliminar productos.' using errcode = '42501';
  end if;

  if p_producto_id = c_producto_centinela
     or exists (select 1 from retail.variantes where id = c_variante_centinela and producto_id = p_producto_id) then
    return query select false, 'es una pieza del sistema: el cobro de «Monto manual» del punto de venta la necesita'::text;
    return;
  end if;

  -- Cada renglón es una manera en que el producto ya se usó. Solo cuentan los que tienen algo (n > 0).
  -- No se cuenta lo que nace con la ficha y se borra con ella: variantes, códigos de barras, etiquetas, fotos.
  with vs as (select id from retail.variantes where producto_id = p_producto_id)
  select string_agg(h.concepto || ' (' || h.n || ')', ', ' order by h.orden)
    into v_historia
    from (
      select 1 as orden, 'líneas de venta' as concepto, count(*) as n
        from retail.venta_items x where x.variante_id in (select id from vs)
      union all select 2, 'movimientos de stock', count(*)
        from retail.movimientos x where x.variante_id in (select id from vs)
      union all select 3, 'unidades en stock', coalesce(sum(abs(x.cantidad)), 0)
        from retail.stock x where x.variante_id in (select id from vs) and x.cantidad <> 0
      union all select 4, 'líneas de compra', count(*)
        from retail.compra_items x where x.producto_id = p_producto_id or x.variante_id in (select id from vs)
      union all select 5, 'órdenes de producción', count(*)
        from retail.producciones x where x.producto_id = p_producto_id
      union all select 6, 'líneas de traslado', count(*)
        from retail.transferencia_items x where x.variante_id in (select id from vs)
      union all select 7, 'apartados', count(*)
        from retail.apartados x where x.variante_id in (select id from vs)
      union all select 8, 'separaciones', count(*)
        from retail.separacion_items x where x.variante_id in (select id from vs)
      union all select 9, 'líneas de conteo', count(*)
        from retail.conteo_items x where x.variante_id in (select id from vs)
      union all select 10, 'cambios de prenda', count(*)
        from retail.cambios x where x.variante_nueva_id in (select id from vs)
      union all select 11, 'prendas dañadas', count(*)
        from retail.prendas_danadas x where x.variante_id in (select id from vs)
      union all select 12, 'prendas por regularizar', count(*)
        from retail.prendas_por_regularizar x where x.variante_id in (select id from vs)
      union all select 13, 'bajadas al piso', count(*)
        from retail.bajada_piso_items x where x.variante_id in (select id from vs)
      union all select 14, 'costos registrados', count(*)
        from retail.costo_historial x where x.variante_id in (select id from vs)
      union all select 15, 'pedidos que no se pudieron atender', count(*)
        from retail.pedidos_no_atendidos x where x.producto_id = p_producto_id
      union all select 16, 'pedidos a otra sede para apartar', count(*)
        from retail.separacion_pedidos x where x.variante_id in (select id from vs)
    ) h
   where h.n > 0;

  if v_historia is null then
    return query select true, null::text;
  else
    return query select false, 'tiene ' || v_historia;
  end if;
end;
$function$;
