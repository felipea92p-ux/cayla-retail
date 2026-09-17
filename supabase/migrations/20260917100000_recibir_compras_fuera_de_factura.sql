-- ADR-0074: recibir_compras acepta productos fuera de factura.
--
-- Pedido de Felipe: la recepción contra factura (ADR-0035) solo aceptaba
-- ítems que resolvían a una compra_items real — si el proveedor mandó (o el
-- taller recibió) una prenda que la factura no lista, no había dónde
-- anotarla sin salir de la guía y abrir /inventario/recibir por separado,
-- perdiendo que llegó en el mismo paquete.
--
-- Un ítem con compra_item_id = null en el mismo p_items queda "fuera de
-- factura": mismo lote (misma guía, mismo proveedor) que los ítems
-- facturados, pero sin tocar compra_items/compra_pagos — no cuenta contra
-- ninguna línea ni inventa una deuda que el papel no respalda (principio 2).
-- El costo es opcional, mismo criterio que recibir_lote (0003_funciones.sql):
-- si no se indica, variantes.costo no se toca. Se exige al menos un ítem SÍ
-- atado a una factura — cero ítems facturados es el caso de
-- /inventario/recibir, no de esta pantalla.
create or replace function retail.recibir_compras(
  p_ubicacion_id uuid,
  p_items jsonb,                       -- [{compra_item_id, variante_id, cantidad, costo_unitario?}]
  p_numero_guia text default null,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_lote_id uuid; v_persona uuid; v_item jsonb; v_mov_id uuid; v_sub uuid;
  v_linea compra_items%rowtype; v_compra compras%rowtype;
  v_proveedor uuid; v_recibido integer; v_cantidad integer;
  v_agregado jsonb; v_con_factura boolean := false;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para recibir mercadería en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Una recepción necesita al menos un ítem';
  end if;

  -- Tope contra lo facturado: SOLO para ítems atados a una línea de factura.
  for v_agregado in
    select jsonb_build_object('compra_item_id', i ->> 'compra_item_id', 'cantidad', sum((i ->> 'cantidad')::integer))
    from jsonb_array_elements(p_items) i
    where (i ->> 'compra_item_id') is not null
    group by i ->> 'compra_item_id'
  loop
    v_con_factura := true;
    select * into v_linea from compra_items where id = (v_agregado ->> 'compra_item_id')::uuid for update;
    if not found then
      raise exception 'La línea de factura % no existe', v_agregado ->> 'compra_item_id';
    end if;
    select * into v_compra from compras where id = v_linea.compra_id;
    if v_compra.estado <> 'vigente' then
      raise exception 'La factura %-% está anulada', v_compra.serie, v_compra.numero;
    end if;
    if v_proveedor is null then
      v_proveedor := v_compra.proveedor_id;
    elsif v_proveedor <> v_compra.proveedor_id then
      raise exception 'Una recepción cubre facturas de un solo proveedor';
    end if;

    select coalesce(sum(cantidad), 0) into v_recibido from movimientos where compra_item_id = v_linea.id;
    v_cantidad := (v_agregado ->> 'cantidad')::integer;
    if v_cantidad <= 0 then
      raise exception 'La cantidad recibida debe ser mayor a cero';
    end if;
    if v_recibido + v_cantidad > v_linea.cantidad then
      raise exception 'Factura %-%: la línea tiene % facturados, % ya recibidos y se intenta recibir % más',
        v_compra.serie, v_compra.numero, v_linea.cantidad, v_recibido, v_cantidad;
    end if;
  end loop;

  if not v_con_factura then
    raise exception 'Una recepción de Compras necesita al menos un ítem de una factura — si nada de lo que llegó está facturado, usa "Recibir sin factura"';
  end if;

  -- Fuera de factura: sin tope que chequear, pero sí cantidad > 0 y una
  -- variante real — mismo candado mínimo que recibir_lote.
  for v_item in select i from jsonb_array_elements(p_items) i where (i ->> 'compra_item_id') is null loop
    if coalesce((v_item ->> 'cantidad')::integer, 0) <= 0 then
      raise exception 'La cantidad recibida debe ser mayor a cero';
    end if;
    if not exists (select 1 from variantes where id = (v_item ->> 'variante_id')::uuid) then
      raise exception 'La prenda fuera de factura no existe';
    end if;
  end loop;

  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'entrada');

  insert into lotes (ubicacion_id, proveedor_id, numero_guia, recibido_por, nota)
    values (p_ubicacion_id, v_proveedor, p_numero_guia, v_persona, p_nota)
    returning id into v_lote_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item ->> 'compra_item_id') is not null then
      select * into v_linea from compra_items where id = (v_item ->> 'compra_item_id')::uuid;

      if v_linea.variante_id is not null and v_linea.variante_id <> (v_item ->> 'variante_id')::uuid then
        raise exception 'La línea de factura ya especifica una variante distinta a la recibida';
      end if;
      if not exists (
        select 1 from variantes where id = (v_item ->> 'variante_id')::uuid and producto_id = v_linea.producto_id
      ) then
        raise exception 'La variante recibida no pertenece al producto de la línea de factura';
      end if;

      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, lote_id, compra_item_id, usuario_id)
        values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, v_sub, 'entrada',
                (v_item ->> 'cantidad')::integer, 'recepcion', v_lote_id, v_linea.id, v_persona)
        returning id into v_mov_id;

      perform fn_recalcular_costo_variante(
        (v_item ->> 'variante_id')::uuid,
        (v_item ->> 'cantidad')::integer,
        v_linea.costo_unitario,
        'compra',
        v_mov_id
      );
    else
      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, lote_id, usuario_id)
        values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, v_sub, 'entrada',
                (v_item ->> 'cantidad')::integer, 'recepcion', v_lote_id, v_persona)
        returning id into v_mov_id;

      if (v_item ->> 'costo_unitario') is not null then
        perform fn_recalcular_costo_variante(
          (v_item ->> 'variante_id')::uuid,
          (v_item ->> 'cantidad')::integer,
          (v_item ->> 'costo_unitario')::numeric,
          'compra',
          v_mov_id
        );
      end if;
    end if;

    perform fn_aplicar_movimiento(v_mov_id);
  end loop;

  return v_lote_id;
end;
$$;

comment on function retail.recibir_compras(uuid, jsonb, text, text) is
  'Recibe mercadería contra una o varias facturas del mismo proveedor (ADR-0035). Un ítem con compra_item_id = null es fuera de factura (ADR-0074): mismo lote, sin tope ni deuda, costo opcional.';
