-- ============================================================================
-- Compras (ADR-0106, D2): cerrar una línea con faltante y registrar la nota de
-- crédito del proveedor
--
-- EL CASO. La factura dice 24 unidades, llegaron 20 y el proveedor no manda las 4
-- que faltan. Antes el comprobante quedaba `parcial` y «atrasada» para siempre, y
-- la deuda seguía siendo la de 24. Ahora se hacen dos cosas, juntas o por separado:
--   1. CERRAR la línea (`cerrar_linea_compra`): «estas 4 no van a llegar», con su
--      motivo (no llegaron / llegaron dañadas / error del proveedor). Deja de contar
--      como pendiente y como atrasada; si todas las líneas quedan cubiertas por
--      «recibido + cerrado», el comprobante pasa a `recibida`. NO toca stock (no
--      es un movimiento: no entró nada) ni dinero.
--   2. NOTA DE CRÉDITO (`registrar_nota_credito_compra`): el documento legal con
--      que el proveedor baja lo que se le debe. Resta del saldo y su IGV resta del
--      crédito fiscal del mes. Puede registrarse junto con el cierre o después,
--      desde el comprobante.
-- Las dos escriben filas nuevas en tablas append-only; el saldo y el estado de
-- recepción siguen siendo un cálculo que mantienen los triggers de la foto.
--
-- QUIÉN PUEDE (mismo criterio que las funciones vecinas):
--   · cerrar una línea → quien puede recibir en la sede destino del comprobante
--     (`fn_puede_operar_ubicacion`, igual que `recibir_compras`): es la sede la
--     que ve que la mercadería no llegó.
--   · registrar una nota de crédito, o cerrar CON nota → solo líder
--     (`fn_puede_registrar_compras`, igual que `registrar_pago_compra`): es dinero.
--     Un colaborador que intente cerrar con nota recibe el rechazo ANTES de que se
--     escriba nada, y el cierre tampoco se registra (todo o nada).
--
-- ORDEN DE CANDADOS. Siempre línea → comprobante, el mismo orden en que `recibir_compras`
-- toma la línea y su trigger toma el comprobante. Así un cierre y una recepción de la
-- misma línea se serializan en vez de pisarse (los dos calculan el pendiente).
--
-- IGV DE LA NOTA. `monto` es el total del documento (con IGV). Se desglosa en la
-- misma proporción del comprobante (`igv / total`) — con el porcentaje real que ese
-- comprobante tuvo, no uno supuesto: una boleta (sin IGV) da IGV 0 y una nota que
-- cubre el comprobante entero devuelve exactamente su IGV. Nunca puede sumar más IGV
-- que el del comprobante (el redondeo de varias notas parciales no lo excede).
--
-- LA NOTA DE UN COMPROBANTE YA PAGADO por completo se rechaza (`monto <= saldo` y el
-- saldo es 0): un saldo a favor con el proveedor no está modelado todavía.
--
-- SE ROMPE SI: alguien llama `fn_insertar_nota_credito_compra` sin tener el
-- comprobante bloqueado (no está expuesta a `authenticated`, solo la usan las dos
-- RPC de abajo, que ya lo bloquearon).
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. helper interno: una sola regla para la nota ====================
-- La usan `cerrar_linea_compra` (nota junto con el cierre) y
-- `registrar_nota_credito_compra` (nota suelta). El llamador YA tiene el comprobante
-- bloqueado (`for update`) y YA validó el permiso; aquí solo viven las reglas del dato.
create function retail.fn_insertar_nota_credito_compra(
  p_compra_id uuid,
  p_serie_numero text,
  p_fecha date,
  p_monto numeric,
  p_motivo text,
  p_nota text,
  p_cierre_id uuid,
  p_persona uuid
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_c compras%rowtype;
  v_serie text := upper(trim(coalesce(p_serie_numero, '')));
  v_igv numeric(12, 2);
  v_igv_previo numeric(12, 2);
  v_id uuid;
begin
  select * into v_c from compras where id = p_compra_id;
  if not found then
    raise exception 'La compra % no existe', p_compra_id;
  end if;
  if v_c.estado <> 'vigente' then
    raise exception 'El comprobante %-% está anulado, no acepta notas de crédito', v_c.serie, v_c.numero;
  end if;
  if v_serie = '' then
    raise exception 'La nota de crédito necesita su serie y número';
  end if;
  if p_fecha is null then
    raise exception 'La nota de crédito necesita su fecha';
  end if;
  if p_fecha < v_c.fecha_emision then
    raise exception 'La nota de crédito no puede ser anterior al comprobante (emitido el %)', to_char(v_c.fecha_emision, 'DD/MM/YYYY');
  end if;
  if p_fecha > fn_hoy_lima() then
    raise exception 'La fecha de la nota de crédito no puede ser futura';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'La nota de crédito necesita un monto mayor a cero';
  end if;
  if p_monto <> round(p_monto, 2) then
    raise exception 'El monto de la nota de crédito admite como máximo 2 decimales (llegó %)', p_monto;
  end if;
  if coalesce(p_motivo, '') not in ('faltante', 'devolucion', 'descuento', 'otro') then
    raise exception 'Motivo de nota de crédito no reconocido: %', coalesce(p_motivo, '(vacío)');
  end if;
  if p_monto > v_c.saldo then
    raise exception 'La nota de crédito (S/ %) supera el saldo pendiente del comprobante (S/ %)', p_monto, v_c.saldo;
  end if;
  if p_cierre_id is not null and not exists (
    select 1
    from compra_item_cierres k
    join compra_items i on i.id = k.compra_item_id
    where k.id = p_cierre_id and i.compra_id = p_compra_id
  ) then
    raise exception 'El cierre % no pertenece a este comprobante', p_cierre_id;
  end if;

  -- IGV en la proporción del comprobante; nunca más que el IGV que le queda por devolver.
  select coalesce(sum(igv), 0) into v_igv_previo from compra_notas_credito where compra_id = p_compra_id;
  v_igv := case
    when v_c.total > 0 then least(round(p_monto * v_c.igv / v_c.total, 2), greatest(v_c.igv - v_igv_previo, 0))
    else 0
  end;

  begin
    insert into compra_notas_credito (compra_id, cierre_id, serie_numero, fecha, subtotal, igv, monto, motivo, nota, usuario_id)
      values (p_compra_id, p_cierre_id, v_serie, p_fecha, p_monto - v_igv, v_igv, p_monto, p_motivo,
              nullif(trim(coalesce(p_nota, '')), ''), p_persona)
      returning id into v_id;
  exception
    when unique_violation then
      raise exception 'La nota de crédito % ya está registrada en el comprobante %-%', v_serie, v_c.serie, v_c.numero;
  end;

  return v_id;
end;
$$;

comment on function retail.fn_insertar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid, uuid) is
  'Interna (ADR-0106 D2): valida e inserta una nota de crédito. El llamador ya bloqueó el comprobante y validó el permiso. No expuesta a authenticated.';

revoke all on function retail.fn_insertar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid, uuid) from public, anon, authenticated;

-- ==================== 2. registrar_nota_credito_compra: la nota, suelta ====================
create function retail.registrar_nota_credito_compra(
  p_compra_id uuid,
  p_serie_numero text,
  p_fecha date,
  p_monto numeric,
  p_motivo text,
  p_nota text default null,
  p_cierre_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
begin
  -- Dinero: solo quien puede registrar pagos (líder).
  if not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para registrar notas de crédito de proveedores';
  end if;

  -- Candado del comprobante: la nota se valida contra el saldo, y un pago
  -- simultáneo no puede dejarlo por debajo de la nota.
  perform 1 from compras where id = p_compra_id for update;
  if not found then
    raise exception 'La compra % no existe', p_compra_id;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  return fn_insertar_nota_credito_compra(p_compra_id, p_serie_numero, p_fecha, p_monto, p_motivo, p_nota, p_cierre_id, v_persona);
end;
$$;

comment on function retail.registrar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid) is
  'Registra una nota de crédito del proveedor contra un comprobante (ADR-0106 D2): baja el saldo y el IGV resta del crédito fiscal del mes. Solo líder. monto <= saldo (total - pagado - notas previas). motivo: faltante | devolucion | descuento | otro.';

revoke all on function retail.registrar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid) from public, anon;
grant execute on function retail.registrar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid) to authenticated;

-- ==================== 3. cerrar_linea_compra: «estas N no van a llegar» ====================
create function retail.cerrar_linea_compra(
  p_compra_item_id uuid,
  p_cantidad integer,
  p_motivo text,                       -- no_llego | danada | error_proveedor
  p_nota text default null,
  p_nota_credito jsonb default null    -- {serie_numero, fecha, monto, motivo?, nota?}
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_linea compra_items%rowtype;
  v_compra compras%rowtype;
  v_persona uuid;
  v_recibido bigint;
  v_cerrado bigint;
  v_pendiente bigint;
  v_cierre_id uuid;
  v_nota_id uuid := null;
begin
  -- ---- forma del pedido ----
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad a cerrar debe ser mayor a cero';
  end if;
  if coalesce(p_motivo, '') not in ('no_llego', 'danada', 'error_proveedor') then
    raise exception 'Motivo de cierre no reconocido: %', coalesce(p_motivo, '(vacío)');
  end if;
  if p_nota_credito is not null and jsonb_typeof(p_nota_credito) <> 'object' then
    raise exception 'La nota de crédito debe enviarse como un objeto con serie_numero, fecha y monto';
  end if;

  -- ---- permiso (antes de bloquear nada) ----
  select * into v_linea from compra_items where id = p_compra_item_id;
  if not found then
    raise exception 'La línea de comprobante % no existe', p_compra_item_id;
  end if;
  select * into v_compra from compras where id = v_linea.compra_id;
  if not fn_puede_operar_ubicacion(v_compra.ubicacion_destino_id) then
    raise exception 'No tienes permiso para cerrar líneas de este comprobante';
  end if;
  if p_nota_credito is not null and not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para registrar notas de crédito de proveedores: cierra la línea sin nota y pídele a un líder que la registre';
  end if;

  -- ---- candados: línea y después comprobante (mismo orden que recibir_compras) ----
  select * into v_linea from compra_items where id = p_compra_item_id for update;
  select * into v_compra from compras where id = v_linea.compra_id for update;
  if v_compra.estado <> 'vigente' then
    raise exception 'El comprobante %-% está anulado, no acepta cierres', v_compra.serie, v_compra.numero;
  end if;

  -- ---- el pendiente, con la línea bloqueada ----
  select coalesce(sum(cantidad), 0) into v_recibido from movimientos where compra_item_id = v_linea.id;
  select coalesce(sum(cantidad), 0) into v_cerrado from compra_item_cierres where compra_item_id = v_linea.id;
  v_pendiente := v_linea.cantidad - v_recibido - v_cerrado;
  if v_pendiente <= 0 then
    raise exception 'La línea ya no tiene unidades pendientes: no hay nada que cerrar';
  end if;
  if p_cantidad > v_pendiente then
    raise exception 'La línea tiene % unidades pendientes: no se pueden cerrar %', v_pendiente, p_cantidad;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into compra_item_cierres (compra_item_id, cantidad, motivo, nota, usuario_id)
    values (v_linea.id, p_cantidad, p_motivo, nullif(trim(coalesce(p_nota, '')), ''), v_persona)
    returning id into v_cierre_id;

  if p_nota_credito is not null then
    v_nota_id := fn_insertar_nota_credito_compra(
      v_compra.id,
      p_nota_credito ->> 'serie_numero',
      (p_nota_credito ->> 'fecha')::date,
      (p_nota_credito ->> 'monto')::numeric,
      coalesce(nullif(p_nota_credito ->> 'motivo', ''), 'faltante'),
      p_nota_credito ->> 'nota',
      v_cierre_id,
      v_persona
    );
  end if;

  return jsonb_build_object('cierre_id', v_cierre_id, 'nota_credito_id', v_nota_id);
end;
$$;

comment on function retail.cerrar_linea_compra(uuid, integer, text, text, jsonb) is
  'Cierra unidades pendientes de una línea de comprobante: «no van a llegar» (ADR-0106 D2). p_cantidad <= pendiente (cantidad - recibido - cerrado). Opcionalmente registra en el mismo acto la nota de crédito del proveedor (solo líder). Devuelve {cierre_id, nota_credito_id}. No toca stock.';

revoke all on function retail.cerrar_linea_compra(uuid, integer, text, text, jsonb) from public, anon;
grant execute on function retail.cerrar_linea_compra(uuid, integer, text, text, jsonb) to authenticated;
