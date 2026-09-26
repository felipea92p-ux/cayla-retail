-- ============================================================================
-- 20260926220000_eliminar_producto.sql — CAYLA V2 (Productos ▸ Eliminar, solo Admin y Líder)
--
-- EL PROBLEMA. Un producto dado de alta por error (o una prueba que ya no sirve) solo se podía DESACTIVAR: queda en el
-- catálogo para siempre, con sus 20 variantes, sus códigos de barras y el nombre ocupado. Felipe pidió que un Admin o un
-- Líder pueda eliminarlo.
--
-- LA DECISIÓN. Eliminar existe, pero SOLO cuando el producto nunca se movió: ninguna venta, ningún movimiento de stock,
-- ninguna compra, producción, traslado, apartado, conteo, cambio… La regla del repo es no borrar lo que tiene historia
-- (`movimientos` es inmutable por trigger; `costo_historial` también; ADR-0159 archiva en vez de borrar). Un producto que
-- nunca se movió no tiene historia que perder: solo su ficha y lo que nació con ella (variantes, códigos de barras, fotos).
-- Con historia se rechaza, dice cuál, y el camino es DESACTIVAR (queda como descontinuado y la historia se conserva).
-- Es la misma regla que ADR-0217 fijó para las marcas, con dos diferencias que el producto obliga:
--   1. Solo el Líder. `fn_puede_editar_catalogo()` (la de eliminar marca) también deja pasar a cualquier rol que vea Productos;
--      borrar un producto es más grave que borrar una marca, así que va con `fn_es_lider()`. Un Admin es un Líder activo
--      (`fn_es_admin()` ⊂ `fn_es_lider()`, ADR-0178): «Admin y Líder» son exactamente quienes pasan `fn_es_lider()`.
--   2. Deja rastro. `historial_producto_cambios` (append-only, sin llave al producto) guarda quién lo eliminó y cómo se
--      llamaba; ADR-0217 lamentó que la marca no dejara nada.
--
-- ESTADOS IMPOSIBLES (Lamport).
--   · «Una venta, un movimiento o una compra de una variante que ya no existe»: lo impide la base (llaves foráneas NO ACTION
--     y `movimientos` inmutable). El conteo de abajo existe para DECIRLO en castellano; si algún día otra tabla cita
--     `variantes` y este conteo no la conoce, el DELETE falla por llave y la función lo traduce (bloque `foreign_key_violation`).
--   · «El punto de venta sin su pieza de Monto manual»: el producto `11111111-…` y su variante `22222222-…` son el centinela
--     del cobro «Monto manual» (`registrar_venta` los cita por id fijo, 20260912234726). En PRODUCCIÓN no tienen ningún
--     movimiento —solo en local se siembran—, así que «sin historia» los dejaría borrar y todas las tiendas perderían el cobro
--     manual. Se protegen por nombre propio, no por la regla general.
--
-- POR QUÉ DOS FUNCIONES Y NO UNA. `fn_producto_se_puede_eliminar` es la ÚNICA definición de «qué es historia»: la lee la
-- ventana de la pantalla (para no ofrecer un botón rojo que no puede cumplir) y la lee `eliminar_producto` (que decide de
-- verdad). Dos copias de la regla terminan diciendo cosas distintas.
--
-- CONCURRENCIA. `eliminar_producto` toma el producto y todas sus variantes `for update` ANTES de contar. Una venta o un
-- movimiento que apunte a una de esas variantes toma `for key share` sobre la misma fila (su llave foránea): o llegó primero
-- —y aquí se espera, se ve al contar y se rechaza— o llega después —y su insert falla por «la variante ya no existe», sin
-- dejar nada a medias—. Todo es una sola transacción: o se borra todo, o nada.
--
-- LO QUE NO SE BORRA. Los archivos de las fotos en el almacenamiento (Storage) quedan: quitar una foto desde la ficha
-- tampoco los borra hoy, y un archivo suelto de una prenda no cuesta ni expone nada. Las filas viejas de
-- `historial_producto_cambios` (ediciones previas del producto) tampoco: ninguna lectura las junta con `productos` sin
-- pasar por `variantes`, así que quedan inertes.
--
-- PRODUCCIÓN. Solo crea dos funciones: sin `alter` de tablas en uso ni políticas (ADR-0195), se pega en UNA parte, ANTES
-- que la web (la ventana llama a `fn_producto_se_puede_eliminar`). Prefijo `retail.` escrito. Re-ejecutable.
-- Prueba: `pnpm pruebas:eliminar-producto`.
-- ============================================================================

set lock_timeout = '3s';

-- ==================== 1. ¿Se puede eliminar? (la única definición de «historia») ====================
create or replace function retail.fn_producto_se_puede_eliminar(p_producto_id uuid)
returns table (puede boolean, razon text)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
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
    ) h
   where h.n > 0;

  if v_historia is null then
    return query select true, null::text;
  else
    return query select false, 'tiene ' || v_historia;
  end if;
end;
$$;

comment on function retail.fn_producto_se_puede_eliminar(uuid) is
  'Productos ▸ Eliminar: ¿se puede? (puede, razon). Solo Líder (un Admin es un Líder). No se puede si el producto ya se usó (ventas, movimientos, compras, producción, traslados, apartados, conteos, cambios, prendas dañadas…) o si es la pieza «Monto manual» del punto de venta. La razón viene lista para mostrar. Es la única definición de «historia» de un producto: la usa también eliminar_producto.';

revoke execute on function retail.fn_producto_se_puede_eliminar(uuid) from public, anon;
grant execute on function retail.fn_producto_se_puede_eliminar(uuid) to authenticated;

-- ==================== 2. Eliminar (todo o nada) ====================
create or replace function retail.eliminar_producto(p_producto_id uuid)
returns text
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_producto retail.productos;
  v_actor uuid;
  v_puede boolean;
  v_razon text;
begin
  -- Primero el permiso, antes de mirar si la fila existe (mismo orden que ADR-0143 / ADR-0159).
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede eliminar productos.' using errcode = '42501';
  end if;
  -- El candado del combo «Responsable» (ADR-0161): alguien presente en la tienda hace la operación.
  v_actor := retail.fn_actor_persona_id(true);

  select * into v_producto from retail.productos where id = p_producto_id for update;
  if v_producto.id is null then
    raise exception 'Ese producto ya no existe. Recarga la pantalla.' using hint = 'producto_invalido';
  end if;
  -- Sus variantes también, ANTES de contar: una venta o un movimiento concurrente espera aquí (o ya se ve al contar).
  perform 1 from retail.variantes where producto_id = p_producto_id order by id for update;

  select s.puede, s.razon into v_puede, v_razon from retail.fn_producto_se_puede_eliminar(p_producto_id) s;
  if not v_puede then
    raise exception 'No se puede eliminar «%»: %. Eliminarlo borraría esa historia. Desactívalo: queda como descontinuado y su historia se conserva.',
      v_producto.referencia, v_razon
      using hint = 'producto_con_historia';
  end if;

  begin
    -- Solo lo que nació con la ficha. El stock que queda son filas en cero (el conteo de arriba ya frenó cualquier
    -- unidad); no hay movimiento que las explique porque el producto nunca se movió.
    delete from retail.stock where variante_id in (select id from retail.variantes where producto_id = p_producto_id);
    delete from retail.codigos_barras where variante_id in (select id from retail.variantes where producto_id = p_producto_id);
    delete from retail.producto_fotos where producto_id = p_producto_id;
    delete from retail.variantes where producto_id = p_producto_id; -- arrastra variante_etiquetas (on delete cascade)
    delete from retail.productos where id = p_producto_id;
  exception when foreign_key_violation then
    -- Red de seguridad: otra tabla cita al producto y este conteo no la conoce todavía.
    raise exception 'No se puede eliminar «%»: otra parte del sistema todavía lo usa. Desactívalo en vez de eliminarlo.',
      v_producto.referencia
      using hint = 'producto_con_historia';
  end;

  -- El rastro: quién y cómo se llamaba. Sin llave al producto (ya no existe) y append-only por trigger.
  insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('producto', p_producto_id, 'eliminado',
          v_producto.referencia || coalesce(' · ' || v_producto.codigo, ''), null, v_actor);

  return v_producto.referencia;
end;
$$;

comment on function retail.eliminar_producto(uuid) is
  'Productos ▸ Eliminar: borra un producto y lo que nació con su ficha (variantes, códigos de barras, fotos, stock en cero), todo o nada, SOLO si nunca se movió (fn_producto_se_puede_eliminar) y solo un Líder. Con historia se rechaza: ese se desactiva. Deja una fila en historial_producto_cambios (campo eliminado). Devuelve la referencia del producto eliminado.';

revoke execute on function retail.eliminar_producto(uuid) from public, anon;
grant execute on function retail.eliminar_producto(uuid) to authenticated;
