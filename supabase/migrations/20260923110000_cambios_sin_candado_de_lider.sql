-- ============================================================================
-- 20260923110000_cambios_sin_candado_de_lider.sql — CAYLA V2
--
-- REVIERTE una sola pieza de ADR-0177 (20260922235000): el candado que exigía
-- líder cuando un cambio le devuelve plata a la clienta (diferencia negativa).
--
-- DECISIÓN DE FELIPE (2026-09-23, en el chat): «quita el candado, que
-- cualquier integrante lo resuelva solo con su nombre — 0 trabas, queremos
-- agilidad y el mejor servicio hacia nuestros clientes». Devoluciones ya se
-- opera hoy desde el terminal de cada sede, con quien lo gestiona marcando su
-- propio nombre (el combo Responsable, ADR-0161) — no hay una líder física
-- parada esperando; exigir una aprobación aparte en Cambios sumaba fricción
-- sin agregar el control que sí tiene sentido en Devoluciones (ahí el reembolso
-- puede tardar días; en un cambio, la clienta está ahí mismo, en el mostrador).
--
-- LO QUE SE ADVIRTIÓ Y FELIPE ACEPTÓ: sin este candado, una colaboradora sola
-- puede devolverle plata a una clienta en un cambio sin que nadie más lo
-- revise — es el mismo caso real que ya pasó en producción (S/100 devueltos
-- por Plin sin nota de crédito, docs/pantallas/cambios.md §2). Se acepta ese
-- riesgo a cambio de agilidad; no se resuelve con más candado, sino dejándolo
-- afuera. Lo que SÍ sigue en pie, sin tocar en esta migración: Caja
-- (registrar_movimiento_caja) y Devoluciones (aprobar_devolucion, el revoke
-- de las 4 tablas) — Felipe no pidió tocar esos dos.
--
-- QUÉ HACE. `create or replace` con la misma firma: quita únicamente el
-- bloque `if v_diferencia < 0 and not fn_es_lider() then raise exception...`
-- que sumó 20260922235000. Todo lo demás del cuerpo (vocabulario de motivo,
-- condición, venta anulada, cuarentena) sigue exactamente igual.
--
-- OJO (verificado en producción el 2026-09-23, antes de escribir esto): entre
-- que se pegó 20260922235000 y esta migración, **ya se pegó también la F3**
-- (`20260923100000_actor_firma_las_operaciones.sql`, ADR-0162): la línea
-- `select id into v_persona from personas where auth_user_id = auth.uid();`
-- de esta función YA es `v_persona := retail.fn_actor_persona_id(true);` en
-- producción. El cuerpo de abajo parte de esa versión VIVA (leída con
-- `pg_get_functiondef` contra `cayla-dynamic`, no de una copia vieja del
-- repo) — pegar la versión anterior (con `select ... auth.uid()` a secas)
-- habría revertido la F3 en silencio, el mismo tipo de landmina que ya
-- documentó la memoria de `colaboradores_endurecimiento`.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.registrar_cambio(
  p_venta_item_id uuid, p_ubicacion_id uuid, p_variante_nueva_id uuid,
  p_cantidad integer default 1, p_metodo_pago_diferencia text default null,
  p_token uuid default null,
  p_motivo text default null, p_condicion text default 'vendible'
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_item venta_items%rowtype;
  v_venta_estado text;
  v_precio_nuevo numeric;
  v_cambio_id uuid; v_existente cambios%rowtype;
  v_ya_cambiado integer;
  v_diferencia numeric;
  v_persona uuid; v_sub uuid; v_sub_entrada uuid; v_caja_id uuid;
  v_mov_entrada uuid; v_mov_salida uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para hacer cambios en esa ubicación';
  end if;
  if p_cantidad <= 0 then
    raise exception 'La cantidad del cambio debe ser mayor que cero';
  end if;

  if p_motivo is not null and p_motivo not in ('talla_chica', 'talla_grande', 'otro_color', 'defecto', 'otro') then
    raise exception 'Motivo de cambio desconocido: %', p_motivo;
  end if;
  if p_condicion is null or p_condicion not in ('vendible', 'no_vendible') then
    raise exception 'Estado de la prenda desconocido: %', p_condicion;
  end if;
  if p_motivo = 'defecto' and p_condicion = 'vendible' then
    raise exception 'Una prenda que se cambia por defecto no puede volver al piso de venta — márcala como "con defecto o uso"';
  end if;

  if p_token is not null then
    select * into v_existente from cambios where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;

  select * into v_item from venta_items where id = p_venta_item_id;
  if not found then
    raise exception 'La línea de venta % no existe', p_venta_item_id;
  end if;

  select estado into v_venta_estado from ventas where id = v_item.venta_id;
  if v_venta_estado = 'anulada' then
    raise exception 'Esa venta está anulada — sus prendas ya volvieron al stock, no se pueden cambiar';
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

  v_persona := retail.fn_actor_persona_id(true);
  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'venta');
  select id into v_caja_id from cajas where ubicacion_id = p_ubicacion_id and estado = 'abierta';

  if v_diferencia <> 0 and p_metodo_pago_diferencia = 'efectivo' and v_caja_id is null then
    raise exception 'No hay una caja abierta en esta ubicación — ábrela antes de cobrar o devolver una diferencia en efectivo';
  end if;

  if p_condicion = 'vendible' then
    v_sub_entrada := v_sub;
  else
    select id into v_sub_entrada from sububicaciones where ubicacion_id = p_ubicacion_id and tipo = 'cuarentena';
    if v_sub_entrada is null then
      raise exception 'Esta ubicación no tiene sububicación de cuarentena configurada';
    end if;
  end if;

  begin
    insert into cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia, metodo_pago_diferencia,
                         usuario_id, token_cliente, caja_id, motivo, condicion)
      values (p_venta_item_id, p_ubicacion_id, p_variante_nueva_id, p_cantidad, v_diferencia, p_metodo_pago_diferencia,
              v_persona, p_token, v_caja_id, p_motivo, p_condicion)
      returning id into v_cambio_id;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select * into v_existente from cambios where token_cliente = p_token;
    if not found then raise; end if;
    return v_existente.id;
  end;

  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, cambio_id, usuario_id)
    values (v_item.variante_id, p_ubicacion_id, v_sub_entrada, 'entrada', p_cantidad, 'cambio', v_cambio_id, v_persona)
    returning id into v_mov_entrada;
  perform fn_aplicar_movimiento(v_mov_entrada);

  if p_condicion = 'no_vendible' then
    insert into prendas_danadas (variante_id, ubicacion_id, cantidad, cambio_id, movimiento_entrada_id)
      values (v_item.variante_id, p_ubicacion_id, p_cantidad, v_cambio_id, v_mov_entrada);
  end if;

  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, cambio_id, usuario_id)
    values (p_variante_nueva_id, p_ubicacion_id, v_sub, 'salida', p_cantidad, 'cambio', v_cambio_id, v_persona)
    returning id into v_mov_salida;
  perform fn_aplicar_movimiento(v_mov_salida);

  return v_cambio_id;
end;
$$;
