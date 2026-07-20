-- F2: órdenes de compra formales. Se reutiliza la tabla ordenes_compra de la Fase 1
-- (existía sin UI) y se conecta al mundo real: proveedor del directorio, monto
-- estimado, y el cierre del ciclo — al recibir el lote, la orden se marca recibida.
-- El detalle por prenda (ordenes_compra_items) queda para cuando haga falta: la
-- compra real de CAYLA se pacta por fardo/monto, no por SKU (así operaba SINATRA).

alter table ordenes_compra add column proveedor_id uuid references proveedores (id);
alter table ordenes_compra add column monto_estimado numeric(12, 2);
alter table ordenes_compra add column fecha_estimada date;
alter table ordenes_compra add column nota text;

alter table lotes add column orden_compra_id uuid references ordenes_compra (id);

-- Las Encargadas necesitan VER las órdenes pendientes de su sede para ligarlas al
-- recibir (la política existente era solo-Líder para todo).
create policy ordenes_compra_select_propia_sede on ordenes_compra for select
  using (sede_destino_id = fn_sede_actual_persona());

-- ==================== recibir_lote: + p_orden_compra_id ====================
-- Mismo cuerpo que 0012 (validación de sede + categoria_id). Novedad: si la
-- recepción corresponde a una orden de compra, se liga al lote y la orden pasa a
-- 'recibida' en la misma transacción — o todo o nada.
create or replace function recibir_lote(
  p_sede_id uuid,
  p_origen text,
  p_items jsonb,
  p_proveedor text default null,
  p_numero_guia text default null,
  p_nota text default null,
  p_orden_compra_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
  v_lote_id uuid;
  v_item jsonb;
  v_variante_id uuid;
  v_producto_id uuid;
  v_movimiento_id uuid;
  v_contenedor_id uuid;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El lote no tiene ítems';
  end if;
  if not fn_puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para recibir mercadería en ese almacén';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into lotes (sede_id, origen, proveedor, numero_guia, recibido_por, nota, orden_compra_id)
    values (p_sede_id, p_origen, p_proveedor, p_numero_guia, v_persona_id, p_nota, p_orden_compra_id)
    returning id into v_lote_id;

  if p_orden_compra_id is not null then
    update ordenes_compra set estado = 'recibida', updated_at = now()
      where id = p_orden_compra_id and estado in ('pendiente', 'confirmada');
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item ->> 'variante_id') is not null then
      v_variante_id := (v_item ->> 'variante_id')::uuid;
    else
      if (v_item ->> 'producto_id') is not null then
        v_producto_id := (v_item ->> 'producto_id')::uuid;
      else
        insert into productos (sku_padre, referencia, categoria_id, genero, marca, temporada)
          values (
            v_item ->> 'sku_padre', v_item ->> 'referencia',
            case when (v_item ->> 'categoria_id') is not null then (v_item ->> 'categoria_id')::uuid else null end,
            v_item ->> 'genero', v_item ->> 'marca', v_item ->> 'temporada'
          )
          returning id into v_producto_id;
      end if;

      insert into variantes (producto_id, sku, talla, color, costo, precio, stock_minimo)
        values (
          v_producto_id, v_item ->> 'sku', v_item ->> 'talla', v_item ->> 'color',
          coalesce((v_item ->> 'costo')::numeric, 0), coalesce((v_item ->> 'precio')::numeric, 0),
          coalesce((v_item ->> 'stock_minimo')::integer, 0)
        )
        returning id into v_variante_id;
    end if;

    v_contenedor_id := case when (v_item ->> 'contenedor_id') is not null
      then (v_item ->> 'contenedor_id')::uuid else null end;

    insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, lote_id, contenedor_id)
      values (
        v_variante_id, p_sede_id, 'entrada', (v_item ->> 'cantidad')::integer,
        'ingreso de lote', v_persona_id, v_lote_id, v_contenedor_id
      )
      returning id into v_movimiento_id;
    perform fn_aplicar_movimiento(v_movimiento_id);
  end loop;

  return v_lote_id;
end;
$$;
