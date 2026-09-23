-- ============================================================================
-- 20260923162300_regularizar_prenda.sql — CAYLA V2 (ADR-0179, Felipe 2026-09-23)
--
-- QUÉ HACE. Almacén une una «prenda sin registrar» (vendida en caja antes de estar en el
-- sistema, 20260923161700) con su variante real. Responde UNA pregunta, porque al registrar
-- un lote se cuenta lo físico:
--   · 'ya_registrada' → la prenda ya estaba en el stock y solo perdió la etiqueta: sale 1.
--   · 'llego_nueva'   → llegó en un lote contado sin ella: entra 1 y sale 1 (el stock no
--                       cambia, pero el ledger dice la verdad: llegó y se vendió).
-- Sin la pregunta, una prenda de un lote de 10 contado como 9 se descontaría dos veces.
--
-- La salida lleva motivo 'venta' y el venta_item_id de la línea: rotación, resumen y alertas
-- la cuentan como cualquier venta, y `anular_venta` la encuentra para devolverla al stock. La
-- línea de venta pasa de la centinela a la variante real (y a su costo) una sola vez: lo
-- anotado por caja queda en `prendas_por_regularizar`.
--
-- diferencia = precio cobrado − precio oficial: negativa = descuento no planificado,
-- positiva = sobreprecio (el ingreso es lo que pagó la clienta; la cifra es solo señal).
--
-- PRODUCCIÓN: pegar DESPUÉS de 20260923161700, con OK de Felipe.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.regularizar_prenda(p_id uuid, p_variante_id uuid, p_forma text)
returns numeric
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  v_p prendas_por_regularizar%rowtype;
  v_var variantes%rowtype;
  v_persona uuid := fn_actor_persona_id(true);
  v_piso uuid;
  v_sub uuid;
  v_mov uuid;
  v_dif numeric;
begin
  if p_forma is null or p_forma not in ('ya_registrada', 'llego_nueva') then
    raise exception 'prenda_forma_invalida'
      using hint = 'Responde si la prenda ya estaba registrada o si llegó nueva';
  end if;

  select * into v_p from prendas_por_regularizar where id = p_id for update;
  if not found then
    raise exception 'La prenda por regularizar % no existe', p_id;
  end if;
  if not fn_puede_operar_ubicacion(v_p.ubicacion_id) then
    raise exception 'No tienes permiso para regularizar en esa ubicación';
  end if;
  if v_p.estado <> 'pendiente' then
    raise exception 'prenda_ya_regularizada' using hint = 'Otra persona ya la regularizó, o la venta se anuló';
  end if;

  select * into v_var from variantes where id = p_variante_id;
  if not found or p_variante_id = c_cargo_especial then
    raise exception 'La variante % no existe', p_variante_id;
  end if;

  v_piso := fn_sububicacion_por_defecto(v_p.ubicacion_id, 'venta');

  if p_forma = 'llego_nueva' then
    v_sub := v_piso;
    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
      values (p_variante_id, v_p.ubicacion_id, v_sub, 'entrada', 1, 'ingreso_regularizado', v_p.venta_item_id, v_persona)
      returning id into v_mov;
    perform fn_aplicar_movimiento(v_mov);
  else
    -- Sale de donde la prenda está en el sistema: el piso primero, si no el almacén de la sede.
    select sububicacion_id into v_sub from stock
      where variante_id = p_variante_id and ubicacion_id = v_p.ubicacion_id and cantidad >= 1
      order by (sububicacion_id is not distinct from v_piso) desc
      limit 1;
    if not found then
      raise exception 'prenda_sin_stock_para_descontar'
        using hint = 'Esa prenda no tiene stock en esta sede. Si llegó en un lote que se contó sin ella, elige «llegó nueva».';
    end if;
  end if;

  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
    values (p_variante_id, v_p.ubicacion_id, v_sub, 'salida', 1, 'venta', v_p.venta_item_id, v_persona)
    returning id into v_mov;
  perform fn_aplicar_movimiento(v_mov);

  update venta_items set variante_id = p_variante_id, costo_unitario = v_var.costo
    where id = v_p.venta_item_id and variante_id = c_cargo_especial;

  v_dif := v_p.precio_cobrado - v_var.precio;
  update prendas_por_regularizar
    set estado = 'regularizada', variante_id = p_variante_id, forma = p_forma, precio_oficial = v_var.precio,
        diferencia = v_dif, regularizado_por = v_persona, regularizado_en = now()
    where id = p_id;

  return v_dif;
end;
$$;

comment on function retail.regularizar_prenda(uuid, uuid, text) is
  'ADR-0179: une una prenda vendida sin registrar con su variante real. p_forma: ya_registrada (sale 1) o llego_nueva (entra 1 y sale 1). Devuelve la diferencia (cobrado − oficial).';
revoke all on function retail.regularizar_prenda(uuid, uuid, text) from public, anon;
grant execute on function retail.regularizar_prenda(uuid, uuid, text) to authenticated;
