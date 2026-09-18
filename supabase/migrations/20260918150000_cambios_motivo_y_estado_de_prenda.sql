-- ============================================================================
-- 20260918150000_cambios_motivo_y_estado_de_prenda.sql — CAYLA V2
--
-- EL PROBLEMA. `registrar_cambio` devolvía SIEMPRE la prenda que trae la clienta
-- al piso de venta (`fn_sububicacion_por_defecto(..., 'venta')`). Si la cambia
-- porque tiene la costura abierta, esa blusa vuelve a figurar como vendible y el
-- stock miente. R-39 (docs/datos/15-COMO-OPERA-CAYLA.md) ya lo decidió: "a qué
-- stock vuelve la prenda depende del estado en que vuelva" — Devoluciones lo
-- cumple desde la cuarentena (20260917095000); Cambios no.
--
-- Y nadie sabía POR QUÉ se cambia una prenda. Para CAYLA, que confecciona,
-- "6 de 8 cambios de la Blusa Emma fueron de M a L porque le quedó chica" es una
-- orden directa al Taller; hoy ese dato no existe en ningún lado.
--
-- QUÉ HACE.
--   1. `cambios.motivo`: lista cerrada — mismo criterio que el descuento (R-45:
--      un texto libre no se puede sumar, una lista sí). Nullable: los cambios
--      anteriores a esta migración no lo tienen.
--   2. `cambios.condicion`: 'vendible' (vuelve al piso, lo de siempre) o
--      'no_vendible' (entra a la cuarentena de Devoluciones y se resuelve con el
--      mismo flujo de dañados: se botó / donada / devuelta al proveedor /
--      liquidada). Default 'vendible': describe con verdad lo que pasó con los
--      cambios viejos, que fueron todos al piso.
--   3. Candado en la tabla, no en la pantalla (principio 2): un cambio POR
--      DEFECTO no puede volver al piso.
--   4. `prendas_danadas.cambio_id`: la cuarentena deja de ser solo de
--      Devoluciones — mismo razonamiento que 20260918070000 usó para sumarle
--      'devolver_proveedor' en vez de una tabla gemela. El origen es exactamente
--      uno de los dos (constraint).
--   5. Candado nuevo: no se cambia una prenda de una venta ANULADA. `anular_venta`
--      ya bloqueaba el sentido contrario (anular una venta con cambios), pero
--      cambiar una prenda de una venta ya anulada volvía a meter al stock una
--      prenda que la anulación ya había devuelto — stock duplicado.
--
-- FIRMA. `create or replace` NO alcanza: dos parámetros nuevos cambian la lista
-- de tipos y Postgres crearía una SEGUNDA sobrecarga (mismo bug que
-- 20260918070000 documentó para `resolver_prenda_danada`). Va drop + create.
--
-- ORDEN DE DESPLIEGUE. Los dos parámetros nuevos tienen default y `p_motivo`
-- null se acepta, así que la pantalla VIEJA (6 parámetros) sigue funcionando
-- contra esta firma. En producción va PRIMERO esta migración y DESPUÉS el front
-- que manda p_motivo/p_condicion: al revés, PostgREST no encuentra la función y
-- Cambios se cae. La pantalla nueva no deja confirmar sin motivo.
--
-- SE ROMPE SI: alguien intenta devolver al piso una prenda cambiada por defecto,
-- o cambiar una prenda de una venta anulada — sale un mensaje que dice por qué.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1-3. cambios: motivo, estado de la prenda que vuelve, y su candado ----------
alter table retail.cambios add column motivo text
  check (motivo in ('talla_chica', 'talla_grande', 'otro_color', 'defecto', 'otro'));
comment on column retail.cambios.motivo is
  'Por qué la clienta cambia la prenda (lista cerrada, R-45). Null solo en cambios anteriores a 20260918150000.';

alter table retail.cambios add column condicion text not null default 'vendible'
  check (condicion in ('vendible', 'no_vendible'));
comment on column retail.cambios.condicion is
  'Cómo vuelve la prenda que trae la clienta (R-39): vendible = al piso de venta; no_vendible = a cuarentena (prendas_danadas.cambio_id).';

alter table retail.cambios add constraint cambios_defecto_no_vuelve_al_piso
  check (motivo is distinct from 'defecto' or condicion = 'no_vendible');

-- ---------- 4. prendas_danadas: la cuarentena también recibe lo que vuelve por un cambio ----------
alter table retail.prendas_danadas alter column devolucion_item_id drop not null;
alter table retail.prendas_danadas add column cambio_id uuid unique references retail.cambios (id);
comment on column retail.prendas_danadas.cambio_id is
  'Origen cuando la prenda llegó por un cambio (registrar_cambio con condicion = no_vendible). Excluyente con devolucion_item_id.';
alter table retail.prendas_danadas add constraint prendas_danadas_un_origen
  check (num_nonnulls(devolucion_item_id, cambio_id) = 1);

-- ---------- 5. registrar_cambio: motivo, destino según el estado, y venta anulada ----------
-- Cuerpo real más reciente (20260916180000_cambio_y_devolucion_exigen_caja_si_hay_efectivo.sql,
-- verificado contra pg_proc local) + lo marcado "Nuevo".
drop function retail.registrar_cambio(uuid, uuid, uuid, integer, text, uuid);
create function retail.registrar_cambio(
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

  -- Nuevo: los mismos candados que la tabla, con un mensaje que se entiende en caja.
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

  -- Nuevo: la anulación ya devolvió estas prendas al stock.
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

  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'venta');
  select id into v_caja_id from cajas where ubicacion_id = p_ubicacion_id and estado = 'abierta';

  if v_diferencia <> 0 and p_metodo_pago_diferencia = 'efectivo' and v_caja_id is null then
    raise exception 'No hay una caja abierta en esta ubicación — ábrela antes de cobrar o devolver una diferencia en efectivo';
  end if;

  -- Nuevo: a dónde entra la prenda que trae la clienta (R-39). Misma cuarentena que
  -- usa aprobar_devolucion.
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

  -- Nuevo: lo que entra a cuarentena queda esperando que un líder lo resuelva,
  -- igual que una devolución dañada.
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

grant execute on function retail.registrar_cambio(uuid, uuid, uuid, integer, text, uuid, text, text) to authenticated;
