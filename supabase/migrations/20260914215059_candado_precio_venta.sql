-- ============================================================================
-- 20260914215059_candado_precio_venta.sql — CAYLA V2
--
-- El precio lo fija el catálogo, no la caja. Desde el 2026-09-14 la pantalla de
-- Vender ya no deja editar `precio_unitario` (ADR-0044), pero `registrar_venta`
-- (0011_venta_con_comprobante.sql, líneas 114-117) seguía insertando el precio
-- tal cual llegaba del navegador: cualquiera con sesión podía mandar S/1.00 por
-- una blusa de S/79.90 desde la consola y la venta entraba. Un candado de
-- pantalla no es un candado (BACKLOG: «el precio lo pone el navegador»).
--
-- Qué hace: ANTES de escribir nada, compara cada `precio_unitario` con
-- `variantes.precio` vigente, a 2 decimales. Si difiere levanta
-- `venta_precio_cambiado` con la prenda en `detail` — el nombre es estable (como
-- el de una restricción) y `apps/web/lib/error-escritura.ts` lo vuelve frase:
-- «El precio de Blusa Emma (BLU-EMMA-BEI-S) cambió: quítala del ticket y vuelve a
-- agregarla». Excepción por diseño: la variante centinela de «Cargo especial»
-- (20260912234726_cargo_especial_pos.sql), cuyo precio lo escribe la caja.
--
-- El descuento (`descuento_unitario`) NO se toca acá: quién puede descontar y
-- hasta cuánto es la migración siguiente (códigos de descuento).
--
-- Drop por firma completa y recreate, no `create or replace`: así la firma queda
-- escrita y el día que cambie un tipo de parámetro no queda una función vieja
-- viva al lado de la nueva. Los grants se vuelven a dar porque el drop los borra.
--
-- ESTADO: aplicada en la base local el 2026-09-14. NO en producción — la pega
-- Felipe (D-11); ya lleva el prefijo `retail.`.
-- SE ROMPE SI: se cambia el precio de una variante mientras esa prenda está en un
-- ticket abierto — la venta falla con el mensaje de arriba y la colaboradora
-- vuelve a agregarla. Es el comportamiento buscado, no un bug.
-- ============================================================================

set search_path = retail, public, extensions;

drop function if exists retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text);

create function retail.registrar_venta(
  p_ubicacion_id uuid, p_items jsonb, p_pagos jsonb,
  p_cliente_id uuid default null, p_token uuid default null,
  p_tipo_comprobante text default null,
  p_cliente_tipo_doc text default 'sin_documento',
  p_cliente_num_doc text default null,
  p_cliente_nombre text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_venta_id uuid; v_existente ventas%rowtype; v_item jsonb; v_pago jsonb;
  v_item_id uuid; v_mov_id uuid; v_costo numeric; v_persona uuid;
  v_caja_id uuid;
  v_total_items numeric := 0;
  v_total_pagos numeric := 0;
  v_igv numeric;
  v_subtotal numeric;
  -- Candado de precio
  v_precio_catalogo numeric; v_referencia text; v_sku text;
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para vender en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;
  if p_pagos is null or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Falta indicar cómo se pagó la venta';
  end if;
  if p_tipo_comprobante is not null and p_tipo_comprobante not in ('boleta', 'factura') then
    raise exception 'Una venta solo puede facturarse como boleta o factura (se pidió %)', p_tipo_comprobante;
  end if;

  if p_token is not null then
    select * into v_existente from ventas where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;

  select id into v_caja_id from cajas where ubicacion_id = p_ubicacion_id and estado = 'abierta';
  if v_caja_id is null then
    raise exception 'No hay una caja abierta en esta ubicación — ábrela antes de registrar una venta';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  -- Cada ítem contra el catálogo, antes de tocar una sola tabla: el precio que
  -- llega tiene que ser el vigente, salvo el Cargo especial (precio libre).
  for v_item in select * from jsonb_array_elements(p_items) loop
    select v.precio, p.referencia, v.sku
      into v_precio_catalogo, v_referencia, v_sku
      from variantes v join productos p on p.id = v.producto_id
      where v.id = (v_item ->> 'variante_id')::uuid;
    if v_precio_catalogo is null then
      raise exception 'La variante % no existe', v_item ->> 'variante_id';
    end if;
    if (v_item ->> 'variante_id')::uuid <> c_cargo_especial
       and round((v_item ->> 'precio_unitario')::numeric, 2) <> round(v_precio_catalogo, 2) then
      raise exception 'venta_precio_cambiado'
        using detail = v_referencia || ' (' || v_sku || ')',
              hint = format('En catálogo vale S/%s y la caja mandó S/%s', v_precio_catalogo, v_item ->> 'precio_unitario');
    end if;

    v_total_items := v_total_items +
      (((v_item ->> 'precio_unitario')::numeric - coalesce((v_item ->> 'descuento_unitario')::numeric, 0))
        * (v_item ->> 'cantidad')::integer);
  end loop;
  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    v_total_pagos := v_total_pagos + (v_pago ->> 'monto')::numeric;
  end loop;
  if round(v_total_items, 2) <> round(v_total_pagos, 2) then
    raise exception 'Los pagos (S/%) no cuadran con el total de la venta (S/%)', v_total_pagos, v_total_items;
  end if;

  begin
    insert into ventas (ubicacion_id, cliente_id, caja_id, usuario_id, token_cliente)
      values (p_ubicacion_id, p_cliente_id, v_caja_id, v_persona, p_token)
      returning id into v_venta_id;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select * into v_existente from ventas where token_cliente = p_token;
    if not found then raise; end if;
    return v_existente.id;
  end;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select costo into v_costo from variantes where id = (v_item ->> 'variante_id')::uuid;
    if v_costo is null then
      raise exception 'La variante % no existe', v_item ->> 'variante_id';
    end if;

    insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
      values (v_venta_id, (v_item ->> 'variante_id')::uuid, (v_item ->> 'cantidad')::integer,
              (v_item ->> 'precio_unitario')::numeric, coalesce((v_item ->> 'descuento_unitario')::numeric, 0), v_costo)
      returning id into v_item_id;

    insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, 'salida',
              (v_item ->> 'cantidad')::integer, 'venta', v_item_id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);
  end loop;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    insert into venta_pagos (venta_id, metodo, monto)
      values (v_venta_id, v_pago ->> 'metodo', (v_pago ->> 'monto')::numeric);
  end loop;

  -- El comprobante nace acá, en la misma transacción: si emitir_comprobante()
  -- revienta (ej. sin serie registrada), toda la venta se revierte con él.
  if p_tipo_comprobante is not null then
    v_igv := round((v_total_items - v_total_items / 1.18) * 100) / 100;
    v_subtotal := round((v_total_items - v_igv) * 100) / 100;
    perform emitir_comprobante(
      p_ubicacion_id, p_tipo_comprobante, v_subtotal, v_igv, v_total_items,
      v_venta_id, p_cliente_tipo_doc, p_cliente_num_doc, p_cliente_nombre, p_items
    );
  end if;

  return v_venta_id;
end;
$$;

grant execute on function retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text) to authenticated;

comment on function retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text) is
  'Registra una venta con sus ítems, pagos y comprobante en una transacción. Desde 2026-09-14 rechaza precios distintos al catálogo (venta_precio_cambiado), salvo el Cargo especial.';
