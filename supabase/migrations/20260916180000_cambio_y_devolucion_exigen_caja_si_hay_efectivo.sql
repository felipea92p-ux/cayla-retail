-- ============================================================================
-- 20260916180000_cambio_y_devolucion_exigen_caja_si_hay_efectivo.sql — CAYLA V2
--
-- Cierra el hueco que ADR-0052 (devoluciones) y ADR-0053 (cambios) dejaron escrito
-- a propósito, sin resolver: si NO hay caja abierta en la ubicación cuando se
-- aprueba una devolución con reembolso en efectivo, o se registra un cambio con
-- diferencia en efectivo, `caja_id` queda `null` — y esa plata nunca entra a
-- ningún `cerrar_caja`. No es un dato que falte: es dinero que YA salió o entró
-- del cajón y que ningún cierre puede ver, para siempre. Principio 2 de
-- CLAUDE.md: es un estado imposible, se corrige la RPC, no una validación
-- after-the-fact en la pantalla.
--
-- QUÉ HACE. Mismo mecanismo que `registrar_venta` ya usa para vender
-- ("No hay una caja abierta en esta ubicación — ábrela antes de..."), aplicado
-- SOLO cuando de verdad hay efectivo moviéndose:
--   · `registrar_cambio`: si `v_diferencia <> 0` y `p_metodo_pago_diferencia =
--     'efectivo'` y no hay caja abierta → rechaza. Un cambio sin diferencia, o
--     con diferencia pagada por tarjeta/yape/plin/transferencia, sigue sin
--     necesitar caja — nunca tocó el cajón físico.
--   · `aprobar_devolucion`: mismo candado con `p_reembolso_metodo = 'efectivo'`
--     y `p_reembolso_monto > 0`. Una devolución sin reembolso, o reembolsada por
--     un método que no es efectivo, sigue sin necesitar caja.
-- Ninguna firma cambia — mismos parámetros que ya tenían.
--
-- POR QUÉ NO SE ELIGIÓ dejarlo pasar y compensarlo después (una cola de
-- "diferencias huérfanas" que el próximo `abrir_caja` recoja). Es más código,
-- un estado nuevo que mantener, y para un caso que ya era "raro" según los dos
-- ADR que lo dejaron pendiente. Principio 5 de CLAUDE.md: no construir para el
-- volumen que no llega. Si en la operación real esto empieza a bloquear gente
-- seguido, es señal de que a esa sede le falta abrir caja más temprano, no de
-- que el candado esté mal.
--
-- SE ROMPE SI: una colaboradora intenta cobrar/devolver una diferencia en
-- efectivo, o un líder intenta aprobar un reembolso en efectivo, sin abrir la
-- caja primero — sale el mismo tipo de error que ya sale al intentar vender sin
-- caja abierta. La respuesta correcta es abrir la caja, no relajar el candado.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- registrar_cambio: exige caja abierta si la diferencia es en efectivo ----------
create or replace function retail.registrar_cambio(
  p_venta_item_id uuid, p_ubicacion_id uuid, p_variante_nueva_id uuid,
  p_cantidad integer default 1, p_metodo_pago_diferencia text default null,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_item venta_items%rowtype;
  v_precio_nuevo numeric;
  v_cambio_id uuid; v_existente cambios%rowtype;
  v_ya_cambiado integer;
  v_diferencia numeric;
  v_persona uuid; v_sub uuid; v_caja_id uuid;
  v_mov_entrada uuid; v_mov_salida uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para hacer cambios en esa ubicación';
  end if;
  if p_cantidad <= 0 then
    raise exception 'La cantidad del cambio debe ser mayor que cero';
  end if;

  if p_token is not null then
    select * into v_existente from cambios where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;

  select * into v_item from venta_items where id = p_venta_item_id;
  if not found then
    raise exception 'La línea de venta % no existe', p_venta_item_id;
  end if;

  select coalesce(sum(cantidad), 0) into v_ya_cambiado from cambios where venta_item_id = p_venta_item_id;
  if v_ya_cambiado + p_cantidad > v_item.cantidad then
    raise exception 'Ya se cambiaron % de % unidades compradas en esa línea — no puedes cambiar %',
      v_ya_cambiado, v_item.cantidad, p_cantidad;
  end if;

  select precio into v_precio_nuevo from variantes where id = p_variante_nueva_id;
  if v_precio_nuevo is null then
    raise exception 'La variante % no existe', p_variante_nueva_id;
  end if;

  v_diferencia := (v_precio_nuevo - v_item.precio_unitario) * p_cantidad;
  if v_diferencia <> 0 and p_metodo_pago_diferencia is null then
    raise exception 'Hay una diferencia de S/% — indica cómo se cobra o se devuelve', v_diferencia;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'venta');
  select id into v_caja_id from cajas where ubicacion_id = p_ubicacion_id and estado = 'abierta';

  -- Nuevo: la plata en efectivo necesita un cajón real donde entrar o salir.
  if v_diferencia <> 0 and p_metodo_pago_diferencia = 'efectivo' and v_caja_id is null then
    raise exception 'No hay una caja abierta en esta ubicación — ábrela antes de cobrar o devolver una diferencia en efectivo';
  end if;

  begin
    insert into cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia, metodo_pago_diferencia, usuario_id, token_cliente, caja_id)
      values (p_venta_item_id, p_ubicacion_id, p_variante_nueva_id, p_cantidad, v_diferencia, p_metodo_pago_diferencia, v_persona, p_token, v_caja_id)
      returning id into v_cambio_id;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select * into v_existente from cambios where token_cliente = p_token;
    if not found then raise; end if;
    return v_existente.id;
  end;

  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, cambio_id, usuario_id)
    values (v_item.variante_id, p_ubicacion_id, v_sub, 'entrada', p_cantidad, 'cambio', v_cambio_id, v_persona)
    returning id into v_mov_entrada;
  perform fn_aplicar_movimiento(v_mov_entrada);

  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, cambio_id, usuario_id)
    values (p_variante_nueva_id, p_ubicacion_id, v_sub, 'salida', p_cantidad, 'cambio', v_cambio_id, v_persona)
    returning id into v_mov_salida;
  perform fn_aplicar_movimiento(v_mov_salida);

  return v_cambio_id;
end;
$$;

-- ---------- aprobar_devolucion: exige caja abierta si el reembolso es en efectivo ----------
create or replace function retail.aprobar_devolucion(
  p_devolucion_id uuid, p_reembolso_monto numeric default null, p_reembolso_metodo text default null
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare d devoluciones%rowtype; r record; v_mov_id uuid; v_persona uuid; v_sub uuid; v_caja_id uuid;
begin
  select * into d from devoluciones where id = p_devolucion_id for update;
  if not found then raise exception 'La devolución % no existe', p_devolucion_id; end if;
  if d.estado <> 'pendiente' then raise exception 'Esa devolución ya está %', d.estado; end if;
  if not fn_es_lider() then
    raise exception 'Solo un líder puede aprobar una devolución';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub := fn_sububicacion_por_defecto(d.ubicacion_id, 'venta');
  select id into v_caja_id from cajas where ubicacion_id = d.ubicacion_id and estado = 'abierta';

  -- Nuevo: mismo candado que registrar_cambio — el reembolso en efectivo necesita
  -- un cajón real de dónde salir.
  if p_reembolso_metodo = 'efectivo' and coalesce(p_reembolso_monto, 0) > 0 and v_caja_id is null then
    raise exception 'No hay una caja abierta en esta ubicación — ábrela antes de aprobar un reembolso en efectivo';
  end if;

  for r in select * from devolucion_items where devolucion_id = p_devolucion_id loop
    if r.condicion = 'vendible' then
      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, devolucion_item_id, usuario_id)
        select vi.variante_id, d.ubicacion_id, v_sub, 'entrada', r.cantidad, 'devolucion', r.id, v_persona
        from venta_items vi where vi.id = r.venta_item_id
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
      update devolucion_items set movimiento_id = v_mov_id where id = r.id;
    end if;
  end loop;

  update devoluciones set estado = 'aprobada', aprobado_por = v_persona, aprobado_en = now(),
                          reembolso_monto = p_reembolso_monto, reembolso_metodo = p_reembolso_metodo,
                          caja_id = v_caja_id
    where id = p_devolucion_id;
end;
$$;
