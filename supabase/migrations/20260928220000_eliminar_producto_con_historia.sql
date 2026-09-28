-- ============================================================================
-- 20260928220000_eliminar_producto_con_historia.sql — CAYLA V2 (Productos ▸ Eliminar; ADR-0252, sobre ADR-0218)
--
-- PARTE 1 — REFACTOR SIN CAMBIO DE COMPORTAMIENTO. La lista de «maneras en que un producto ya se usó» vivía escrita dentro
-- de `fn_producto_se_puede_eliminar`. Sale a su propia función, `fn_producto_historia`, para que la pueda leer también
-- quien necesite saber algo más que «sí/no». `fn_producto_se_puede_eliminar` devuelve EXACTAMENTE lo mismo que antes
-- (mismo orden, mismos textos: lo vigila `pnpm pruebas:eliminar-producto`).
--
-- PRODUCCIÓN. Solo funciones (`create or replace`, mismas firmas): sin `alter` de tablas en uso ni políticas (ADR-0195).
-- Prefijo `retail.` escrito. Re-ejecutable.
-- ============================================================================

set lock_timeout = '3s';

-- ==================== 1. La pieza «Monto manual» (una sola definición) ====================
-- El producto `11111111-…` y su variante `22222222-…` son el centinela del cobro «Monto manual» del punto de venta
-- (`registrar_venta` los cita por id fijo, 20260912234726). En producción no tienen historia, así que ninguna regla de
-- «historia» los protege: se protegen por nombre propio (ADR-0218, «el hallazgo que nadie pidió»).
create or replace function retail.fn_producto_es_pieza_del_sistema(p_producto_id uuid)
returns boolean
language sql
stable
set search_path = retail, public, extensions
as $$
  select p_producto_id = '11111111-1111-4111-8111-111111111111'::uuid
      or exists (select 1 from retail.variantes
                  where id = '22222222-2222-4222-8222-222222222222'::uuid and producto_id = p_producto_id);
$$;

comment on function retail.fn_producto_es_pieza_del_sistema(uuid) is
  'Productos ▸ Eliminar: ¿es la pieza «Monto manual» del punto de venta? (registrar_venta la cita por id fijo). Nunca se elimina, tenga o no historia. Interna: solo la llaman las funciones de eliminar.';

revoke execute on function retail.fn_producto_es_pieza_del_sistema(uuid) from public, anon, authenticated;

-- ==================== 2. La historia de un producto (la ÚNICA definición) ====================
-- Cada renglón es una manera en que el producto ya se usó; solo se devuelven los que tienen algo (n > 0). No se cuenta lo
-- que nace con la ficha y se borra con ella: variantes, códigos de barras, etiquetas, fotos.
create or replace function retail.fn_producto_historia(p_producto_id uuid)
returns table (orden int, concepto text, n bigint)
language sql
stable
set search_path = retail, public, extensions
as $$
  with vs as (select id from retail.variantes where producto_id = p_producto_id)
  select h.orden, h.concepto, h.n
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
$$;

comment on function retail.fn_producto_historia(uuid) is
  'Productos ▸ Eliminar: la ÚNICA definición de «historia» de un producto — un renglón (orden, concepto, n) por cada manera en que ya se usó, solo los que tienen algo. La leen fn_producto_se_puede_eliminar y las funciones de eliminar. Interna: no se llama desde la web.';

revoke execute on function retail.fn_producto_historia(uuid) from public, anon, authenticated;

-- ==================== 3. ¿Se puede eliminar? (el Líder; misma salida que antes) ====================
create or replace function retail.fn_producto_se_puede_eliminar(p_producto_id uuid)
returns table (puede boolean, razon text)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_historia text;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede eliminar productos.' using errcode = '42501';
  end if;

  if retail.fn_producto_es_pieza_del_sistema(p_producto_id) then
    return query select false, 'es una pieza del sistema: el cobro de «Monto manual» del punto de venta la necesita'::text;
    return;
  end if;

  select string_agg(h.concepto || ' (' || h.n || ')', ', ' order by h.orden)
    into v_historia
    from retail.fn_producto_historia(p_producto_id) h;

  if v_historia is null then
    return query select true, null::text;
  else
    return query select false, 'tiene ' || v_historia;
  end if;
end;
$$;

comment on function retail.fn_producto_se_puede_eliminar(uuid) is
  'Productos ▸ Eliminar: ¿se puede? (puede, razon). Solo Líder (un Admin es un Líder). No se puede si el producto ya se usó (fn_producto_historia) o si es la pieza «Monto manual» del punto de venta. La razón viene lista para mostrar. La usa eliminar_producto.';

revoke execute on function retail.fn_producto_se_puede_eliminar(uuid) from public, anon;
grant execute on function retail.fn_producto_se_puede_eliminar(uuid) to authenticated;
