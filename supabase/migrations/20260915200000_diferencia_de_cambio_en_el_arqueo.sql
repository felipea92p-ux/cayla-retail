-- ============================================================================
-- 20260915200000_diferencia_de_cambio_en_el_arqueo.sql — CAYLA V2
--
-- Misma fuga que ADR-0052 encontró en Devoluciones, hallada al escribir ese
-- candado: `registrar_cambio` calcula y guarda `cambios.diferencia` +
-- `metodo_pago_diferencia` cuando una clienta paga o recibe la diferencia de
-- un cambio de prenda, pero nunca la liga a una caja ni `cerrar_caja` la mira.
-- Un cambio con diferencia en efectivo mueve plata real del cajón — para
-- arriba si la clienta paga más, para abajo si se le devuelve— y hoy ese
-- movimiento es invisible para el arqueo.
--
-- MISMO MECANISMO QUE ADR-0052, reutilizado tal cual: `cambios.caja_id` —
-- la caja que estaba abierta en esa ubicación al REGISTRAR el cambio —,
-- fijada sola por `registrar_cambio`; `cerrar_caja` la suma con signo.
-- `diferencia` ya trae el signo correcto (positiva = la clienta pagó de más,
-- negativa = se le devolvió), así que un solo `sum(diferencia)` filtrado a
-- 'efectivo' cubre los dos sentidos sin dos ramas — a diferencia del
-- reembolso de una devolución, que siempre resta.
--
-- SE ROMPE SI: se registra un cambio sin caja abierta en esa ubicación —
-- `caja_id` queda null y esa diferencia nunca entra a ningún cierre. Mismo
-- hueco conocido y no resuelto que ADR-0052 dejó para las devoluciones.
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.cambios add column caja_id uuid references retail.cajas(id);

comment on column retail.cambios.caja_id is
  'La caja que absorbe la diferencia de este cambio — la que estaba abierta en registrar_cambio(), no la de la venta original. Null si no había caja abierta al registrarlo.';

-- ---------- registrar_cambio: fija caja_id, sin cambiar la firma ----------
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

-- ---------- cerrar_caja: suma la diferencia en efectivo de los cambios de esta caja ----------
create or replace function retail.cerrar_caja(p_caja_id uuid, p_monto_real numeric)
returns table (monto_sistema numeric, monto_real numeric, diferencia numeric)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_caja cajas%rowtype;
  v_ventas_efectivo numeric;
  v_ingresos numeric;
  v_egresos numeric;
  v_reembolsos_efectivo numeric;
  v_cambios_efectivo numeric;
  v_sistema numeric;
  v_persona uuid;
begin
  select * into v_caja from cajas where id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id;
  end if;
  if not fn_puede_operar_ubicacion(v_caja.ubicacion_id) then
    raise exception 'No tienes permiso para cerrar esa caja';
  end if;
  if v_caja.estado <> 'abierta' then
    raise exception 'Esta caja ya está cerrada';
  end if;
  if p_monto_real < 0 then
    raise exception 'El monto contado no puede ser negativo';
  end if;

  select coalesce(sum(vp.monto), 0) into v_ventas_efectivo
    from venta_pagos vp join ventas v on v.id = vp.venta_id
    where v.caja_id = p_caja_id and vp.metodo = 'efectivo';

  select coalesce(sum(monto) filter (where tipo = 'ingreso'), 0),
         coalesce(sum(monto) filter (where tipo = 'egreso'), 0)
    into v_ingresos, v_egresos
    from caja_movimientos where caja_id = p_caja_id;

  select coalesce(sum(reembolso_monto), 0) into v_reembolsos_efectivo
    from devoluciones
    where caja_id = p_caja_id and estado = 'aprobada' and reembolso_metodo = 'efectivo';

  -- `cambios.diferencia` ya trae el signo: positiva (la clienta pagó de más)
  -- suma, negativa (se le devolvió) resta — un solo sum cubre los dos
  -- sentidos. Calificado con `cambios.` porque esta función también RETORNA
  -- una columna `diferencia` (la del cuadre) — sin calificar, Postgres no
  -- sabe si es la columna de la tabla o el parámetro de salida.
  select coalesce(sum(cambios.diferencia), 0) into v_cambios_efectivo
    from cambios
    where caja_id = p_caja_id and metodo_pago_diferencia = 'efectivo';

  v_sistema := v_caja.monto_apertura + v_ventas_efectivo + v_ingresos - v_egresos
               - v_reembolsos_efectivo + v_cambios_efectivo;
  select id into v_persona from personas where auth_user_id = auth.uid();

  update cajas set
    estado = 'cerrada',
    monto_cierre_sistema = v_sistema,
    monto_cierre_real = p_monto_real,
    diferencia = p_monto_real - v_sistema,
    cerrada_por = v_persona,
    cerrada_en = now()
  where id = p_caja_id;

  return query select v_sistema, p_monto_real, p_monto_real - v_sistema;
end;
$$;
