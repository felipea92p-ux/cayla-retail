-- ============================================================================
-- "LIQUIDADA" ES UNA VENTA REAL, NO UNA ETIQUETA (corrección de Felipe, 2026-09-17)
--
-- La migración anterior (20260917095000_cuarentena_prendas_danadas.sql) dejó
-- "Liquidada" como una etiqueta + nota, a propósito, con el aviso explícito
-- de que si Felipe quería que fuera una venta real había que confirmarlo
-- antes de tocar dinero de verdad. Confirmó que sí, sin ambigüedad: "se
-- tiene que tomar en cuenta liquidación como una venta, totalmente".
--
-- Esto NO se resuelve tocando `resolver_prenda_danada` para que además
-- inserte una venta: esa función es `security definer`, líder-only, pero no
-- pide precio ni forma de pago, y mezclar ahí la lógica de venta la hubiera
-- dejado con dos responsabilidades (Se botó/Donada son de verdad solo una
-- etiqueta; Liquidada mueve dinero). Se construyó aparte:
-- `liquidar_prenda_danada` — nueva función, dueña de TODO lo que implica
-- vender: crea `ventas`/`venta_items`/`venta_pagos`, exige caja abierta
-- (mismo criterio que `registrar_venta`), y saca la prenda de `cuarentena`
-- con un movimiento `salida` ligado a esa venta (`venta_item_id`), todo en
-- una sola transacción con la resolución de `prendas_danadas`.
--
-- No se tocó `registrar_venta` — es el camino más transitado de todo el
-- sistema (cada venta del piso pasa por ahí) y no tiene ninguna razón para
-- saber que existe `cuarentena`. `liquidar_prenda_danada` inserta en las
-- mismas tablas con la forma exacta que `registrar_venta` ya usa, para que
-- una liquidación aparezca en reportes de ventas/caja como lo que es: una
-- venta real, con su costo y su margen (a veces negativo, y eso es
-- honesto — es mercadería dañada).
--
-- Precio: lo decide el líder al momento de liquidar, sin piso de costo — a
-- diferencia de un descuento normal (`registrar_venta`, que nunca deja
-- vender bajo costo ni para un líder), acá SÍ puede ser necesario vender
-- por debajo del costo: es mercadería dañada, el costo ya está perdido, lo
-- que importa es recuperar algo. `venta_items.costo_unitario` igual se
-- guarda (de `variantes.costo`, igual que cualquier venta) para que el
-- margen negativo quede visible en reportes, no escondido.
--
-- Sin comprobante en esta pasada, a propósito: `registrar_venta` ya soporta
-- "sin comprobante" como camino completo y válido (`emitir_comprobante` es
-- una llamada aparte, condicional). Pedirle al líder los datos del cliente
-- para una boleta/factura en el momento de liquidar una prenda dañada
-- hubiera inflado esta pantalla más allá de lo que Felipe pidió — si hace
-- falta, es un `perform emitir_comprobante(...)` que se agrega después sin
-- tocar el resto de esta función.
-- ============================================================================

set search_path = retail, public, extensions;

-- `resolver_prenda_danada` deja de aceptar 'liquidada': ese camino no pide
-- precio ni pago, y desde ahora CUALQUIER fila con estado 'liquidada' tiene
-- que tener una venta real detrás (invariante nueva que esta migración
-- introduce). Dejar la puerta vieja abierta hubiera sido un backdoor real
-- para crear una "liquidada" sin venta — justo el estado inconsistente que
-- Felipe acaba de pedir que no exista.
create or replace function retail.resolver_prenda_danada(
  p_id uuid, p_estado text, p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare pd prendas_danadas%rowtype; v_persona uuid; v_mov_id uuid; v_sub_cuarentena uuid;
begin
  if p_estado not in ('se_boto', 'donada') then
    raise exception 'Ese estado no se resuelve acá — "Liquidada" necesita precio y forma de pago: usa liquidar_prenda_danada';
  end if;
  if not fn_es_lider() then
    raise exception 'Solo un líder puede resolver una prenda dañada';
  end if;
  select * into pd from prendas_danadas where id = p_id for update;
  if not found then raise exception 'El registro % no existe', p_id; end if;
  if pd.estado <> 'en_cuarentena' then
    raise exception 'Esta prenda ya se resolvió como %', pd.estado;
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  select id into v_sub_cuarentena from sububicaciones where ubicacion_id = pd.ubicacion_id and tipo = 'cuarentena';

  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, nota)
    values (pd.variante_id, pd.ubicacion_id, v_sub_cuarentena, 'salida', pd.cantidad, 'cuarentena_' || p_estado, v_persona, p_nota)
    returning id into v_mov_id;
  perform fn_aplicar_movimiento(v_mov_id);

  update prendas_danadas set estado = p_estado, movimiento_salida_id = v_mov_id,
                             resuelto_por = v_persona, resuelto_en = now(), nota = p_nota
    where id = p_id;
end;
$$;

-- ---------- liquidar_prenda_danada: la sale, con venta real de por medio ----------
create or replace function retail.liquidar_prenda_danada(
  p_id uuid, p_precio_unitario numeric, p_metodo_pago text, p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  pd prendas_danadas%rowtype;
  v_persona uuid;
  v_caja_id uuid;
  v_sub_cuarentena uuid;
  v_costo numeric;
  v_venta_id uuid;
  v_item_id uuid;
  v_mov_id uuid;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede liquidar una prenda dañada';
  end if;
  if p_precio_unitario <= 0 then
    raise exception 'El precio de liquidación debe ser mayor a cero — si no tiene valor, usa Se botó o Donada';
  end if;
  if p_metodo_pago not in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia') then
    raise exception 'Forma de pago desconocida: %', p_metodo_pago;
  end if;

  select * into pd from prendas_danadas where id = p_id for update;
  if not found then raise exception 'El registro % no existe', p_id; end if;
  if pd.estado <> 'en_cuarentena' then
    raise exception 'Esta prenda ya se resolvió como %', pd.estado;
  end if;

  -- Mismo candado que `registrar_venta`: una venta real necesita una caja
  -- abierta donde quedar, sin importar la forma de pago.
  select id into v_caja_id from cajas where ubicacion_id = pd.ubicacion_id and estado = 'abierta';
  if v_caja_id is null then
    raise exception 'No hay una caja abierta en esta ubicación — ábrela antes de liquidar';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();
  select id into v_sub_cuarentena from sububicaciones where ubicacion_id = pd.ubicacion_id and tipo = 'cuarentena';
  select costo into v_costo from variantes where id = pd.variante_id;

  insert into ventas (ubicacion_id, caja_id, usuario_id, nota)
    values (pd.ubicacion_id, v_caja_id, v_persona, 'Liquidación de prenda dañada (cuarentena)')
    returning id into v_venta_id;

  -- Sin descuento_unitario: el precio que pone el líder YA ES el precio
  -- final de liquidación, no un descuento sobre el de catálogo — por eso
  -- tampoco aplica el piso de costo que sí rige en `registrar_venta`.
  insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario)
    values (v_venta_id, pd.variante_id, pd.cantidad, p_precio_unitario, coalesce(v_costo, 0))
    returning id into v_item_id;

  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
    values (pd.variante_id, pd.ubicacion_id, v_sub_cuarentena, 'salida', pd.cantidad, 'cuarentena_liquidada', v_item_id, v_persona)
    returning id into v_mov_id;
  perform fn_aplicar_movimiento(v_mov_id);

  insert into venta_pagos (venta_id, metodo, monto)
    values (v_venta_id, p_metodo_pago, p_precio_unitario * pd.cantidad);

  update prendas_danadas set estado = 'liquidada', movimiento_salida_id = v_mov_id,
                             resuelto_por = v_persona, resuelto_en = now(), nota = p_nota
    where id = p_id;

  return v_venta_id;
end;
$$;
