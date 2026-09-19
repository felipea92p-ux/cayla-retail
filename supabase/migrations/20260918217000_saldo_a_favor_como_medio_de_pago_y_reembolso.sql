-- ============================================================================
-- ADR-0111 (corrección 2026-09-18) — «Saldo a favor» como medio de pago, y reembolso.
--
-- El saldo a favor de un proveedor (libro `proveedor_creditos`, migración 175000) se usa
-- como un medio de pago más: aparece en el historial de pagos del comprobante igual que
-- una transferencia, y descuenta del libro. Se puede usar en los tres lugares donde se paga:
--   · `registrar_pagos_compra`  — el pago de UN comprobante, con varios medios;
--   · `registrar_pago_compras`  — el pago por lote (nuevo `p_credito`: cuánto del total se
--                                 cubre con saldo a favor; el resto va con `p_metodo`);
--   · `registrar_compra`        — el pago al contado al registrar el comprobante.
-- El saldo a favor NO es plata que salga de caja: el medio `saldo_a_favor` no debe
-- sumarse en ningún reporte de salidas de dinero.
--
-- Aprovechado el cambio: `registrar_pagos_compra` comparaba el pago contra `total − pagado`
-- y NO descontaba las notas de crédito (el candado de la tabla lo atajaba, pero con un error
-- técnico); ahora compara contra `saldo`.
--
-- `registrar_reembolso_proveedor`: el proveedor devuelve el dinero en vez de dejar crédito.
-- Es un registro (no mueve caja): sin él, un saldo a favor solo podría gastarse en compras.
-- ============================================================================

set search_path = retail, public, extensions;

alter table compra_pagos drop constraint compra_pagos_metodo_check;
alter table compra_pagos add constraint compra_pagos_metodo_check
  check (metodo in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro', 'saldo_a_favor'));

-- ==================== 1. pago de un comprobante, con varios medios ====================
CREATE OR REPLACE FUNCTION retail.registrar_pagos_compra(p_compra_id uuid, p_pagos jsonb, p_fecha date DEFAULT CURRENT_DATE)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  v_compra compras%rowtype; v_suma numeric(12, 2) := 0;
  v_persona uuid; v_pago jsonb; v_monto numeric(12, 2); v_id uuid; v_ids uuid[] := '{}';
begin
  if not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para registrar pagos a proveedores';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0 then
    raise exception 'El pago necesita al menos un medio con su monto';
  end if;

  -- validar cada medio antes de escribir nada
  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    v_monto := (v_pago ->> 'monto')::numeric;
    if v_monto is null or v_monto <= 0 then
      raise exception 'Cada medio de pago necesita un monto mayor a cero';
    end if;
    if coalesce(v_pago ->> 'metodo', '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro', 'saldo_a_favor') then
      raise exception 'Medio de pago no reconocido: %', coalesce(v_pago ->> 'metodo', '(vacío)');
    end if;
    v_suma := v_suma + v_monto;
  end loop;

  -- bloquea la factura: dos pagos simultáneos no pueden pasarse del saldo
  select * into v_compra from compras where id = p_compra_id for update;
  if not found then
    raise exception 'La compra % no existe', p_compra_id;
  end if;
  if v_compra.estado = 'anulada' then
    raise exception 'La factura %-% está anulada, no acepta pagos', v_compra.serie, v_compra.numero;
  end if;

  -- el saldo ya descuenta pagos Y notas de crédito
  if v_suma > v_compra.saldo then
    raise exception 'El pago (S/ %) supera el saldo pendiente (S/ %)', v_suma, v_compra.saldo;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id)
      values (p_compra_id, coalesce(p_fecha, current_date), (v_pago ->> 'monto')::numeric, v_pago ->> 'metodo', nullif(trim(coalesce(v_pago ->> 'referencia', '')), ''), v_persona)
      returning id into v_id;
    v_ids := v_ids || v_id;
    if v_pago ->> 'metodo' = 'saldo_a_favor' then
      perform fn_consumir_saldo_favor(v_compra.proveedor_id, (v_pago ->> 'monto')::numeric, p_compra_id, v_id, coalesce(p_fecha, fn_hoy_lima()), v_persona);
    end if;
  end loop;

  return v_ids;
end;
$function$;

-- ==================== 2. pago al contado al registrar el comprobante ====================
CREATE OR REPLACE FUNCTION retail.registrar_compra(p_proveedor_id uuid, p_serie text, p_numero text, p_condicion text, p_ubicacion_destino_id uuid, p_items jsonb, p_tipo text DEFAULT 'factura'::text, p_fecha_emision date DEFAULT CURRENT_DATE, p_fecha_vencimiento date DEFAULT NULL::date, p_igv_porcentaje numeric DEFAULT 18, p_pago jsonb DEFAULT NULL::jsonb, p_nota text DEFAULT NULL::text, p_total numeric DEFAULT NULL::numeric, p_fecha_estimada_llegada date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  v_compra_id uuid; v_persona uuid; v_item jsonb;
  v_subtotal numeric(12, 2) := 0; v_igv numeric(12, 2); v_total numeric(12, 2);
  v_producto uuid; v_variante uuid;
  v_tolerancia numeric(12, 2);
  v_pago_id uuid;
  v_pagos jsonb; v_pago jsonb; v_monto numeric(12, 2); v_pago_suma numeric(12, 2) := 0; v_pago_fecha date;
begin
  if not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para registrar compras';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Una factura necesita al menos una línea';
  end if;
  if p_condicion not in ('contado', 'credito') then
    raise exception 'La condición debe ser contado o credito';
  end if;
  if p_condicion = 'credito' and p_fecha_vencimiento is null then
    raise exception 'Una compra al crédito necesita fecha de vencimiento';
  end if;
  if p_condicion = 'contado' and p_pago is null then
    raise exception 'Una compra al contado se registra con su pago';
  end if;

  -- validar líneas antes de escribir nada
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_producto := (v_item ->> 'producto_id')::uuid;
    v_variante := (v_item ->> 'variante_id')::uuid;
    if v_producto is null then
      raise exception 'Cada línea necesita producto_id';
    end if;
    if v_variante is not null and not exists (
      select 1 from variantes where id = v_variante and producto_id = v_producto
    ) then
      raise exception 'La variante % no pertenece al producto %', v_variante, v_producto;
    end if;
    if coalesce((v_item ->> 'cantidad')::integer, 0) <= 0 then
      raise exception 'Cada línea necesita cantidad mayor a cero';
    end if;
    v_subtotal := v_subtotal + (v_item ->> 'cantidad')::integer * (v_item ->> 'costo_unitario')::numeric;
  end loop;

  v_igv := round(v_subtotal * coalesce(p_igv_porcentaje, 0) / 100, 2);
  v_total := v_subtotal + v_igv;

  -- El total del papel manda: el IGV absorbe el redondeo de pasar precios
  -- con IGV a base de 2 decimales. Un centavo por línea, más uno, es lo
  -- máximo que ese redondeo puede mover; más que eso es un error de tipeo.
  if p_total is not null then
    if p_total < 0 then
      raise exception 'El total no puede ser negativo';
    end if;
    if coalesce(p_igv_porcentaje, 0) = 0 and p_total <> v_subtotal then
      raise exception 'Sin IGV el total tiene que ser igual a la suma de las líneas (S/ %), llegó S/ %', v_subtotal, p_total;
    end if;
    v_tolerancia := 0.01 * (jsonb_array_length(p_items) + 1);
    if abs(p_total - v_total) > v_tolerancia then
      raise exception 'El total del documento (S/ %) no cuadra con sus líneas (S/ %): revisa los costos', p_total, v_total;
    end if;
    v_total := p_total;
    v_igv := p_total - v_subtotal;
  end if;

  -- El pago: un objeto (un medio, como siempre) o un arreglo de medios. La
  -- fecha, si viene, va en el objeto o en el primer elemento del arreglo.
  if p_pago is not null then
    if jsonb_typeof(p_pago) = 'object' then
      v_pagos := jsonb_build_array(p_pago);
    elsif jsonb_typeof(p_pago) = 'array' and jsonb_array_length(p_pago) > 0 then
      v_pagos := p_pago;
    else
      raise exception 'El pago necesita al menos un medio con su monto';
    end if;
    v_pago_fecha := coalesce((v_pagos -> 0 ->> 'fecha')::date, current_date);
    for v_pago in select * from jsonb_array_elements(v_pagos) loop
      v_monto := (v_pago ->> 'monto')::numeric;
      if v_monto is null or v_monto <= 0 then
        raise exception 'Cada medio de pago necesita un monto mayor a cero';
      end if;
      if coalesce(v_pago ->> 'metodo', '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro', 'saldo_a_favor') then
        raise exception 'Medio de pago no reconocido: %', coalesce(v_pago ->> 'metodo', '(vacío)');
      end if;
      v_pago_suma := v_pago_suma + v_monto;
    end loop;
    if p_condicion = 'contado' and v_pago_suma <> v_total then
      raise exception 'Al contado el pago debe ser el total de la factura (S/ %), se recibió S/ %', v_total, v_pago_suma;
    end if;
    if v_pago_suma > v_total then
      raise exception 'El pago (S/ %) supera el total de la factura (S/ %)', v_pago_suma, v_total;
    end if;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into compras (
    proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento,
    ubicacion_destino_id, subtotal, igv, total, nota, usuario_id, fecha_estimada_llegada
  ) values (
    p_proveedor_id, p_tipo, upper(trim(p_serie)), trim(p_numero), p_fecha_emision, p_condicion,
    case when p_condicion = 'contado' then null else p_fecha_vencimiento end,
    p_ubicacion_destino_id, v_subtotal, v_igv, v_total, p_nota, v_persona, p_fecha_estimada_llegada
  ) returning id into v_compra_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into compra_items (compra_id, producto_id, variante_id, descripcion, cantidad, costo_unitario)
      values (
        v_compra_id,
        (v_item ->> 'producto_id')::uuid,
        (v_item ->> 'variante_id')::uuid,
        v_item ->> 'descripcion',
        (v_item ->> 'cantidad')::integer,
        (v_item ->> 'costo_unitario')::numeric
      );
  end loop;

  if v_pagos is not null then
    for v_pago in select * from jsonb_array_elements(v_pagos) loop
      insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id)
        values (
          v_compra_id,
          v_pago_fecha,
          (v_pago ->> 'monto')::numeric,
          v_pago ->> 'metodo',
          nullif(trim(coalesce(v_pago ->> 'referencia', '')), ''),
          v_persona
        )
        returning id into v_pago_id;
      if v_pago ->> 'metodo' = 'saldo_a_favor' then
        perform fn_consumir_saldo_favor(p_proveedor_id, (v_pago ->> 'monto')::numeric, v_compra_id, v_pago_id, v_pago_fecha, v_persona);
      end if;
    end loop;
  end if;

  return v_compra_id;
exception
  when unique_violation then
    raise exception 'La factura %-% de este proveedor ya está registrada', upper(trim(p_serie)), trim(p_numero);
end;
$function$;

-- ==================== 3. pago por lote ====================
drop function retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid);

CREATE FUNCTION retail.registrar_pago_compras(p_proveedor_id uuid, p_metodo text, p_aplicaciones jsonb, p_referencia text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_token uuid DEFAULT NULL::uuid, p_credito numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  v_persona uuid;
  v_grupo uuid;
  v_ref text;
  v_fecha date;
  v_app jsonb;
  v_compra_ids uuid[] := '{}';
  v_montos numeric[] := '{}';
  v_compra_id uuid;
  v_monto numeric;
  v_c compras%rowtype;
  v_i integer;
  v_pago_id uuid;
  v_suma numeric(12, 2) := 0;
  v_credito_restante numeric(12, 2);
  v_credito_i numeric(12, 2);
  v_resto_i numeric(12, 2);
begin
  if not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para registrar pagos a proveedores';
  end if;

  -- ---- forma del pedido (no depende del estado de la base) ----
  if p_proveedor_id is null then
    raise exception 'El pago necesita el proveedor al que se paga';
  end if;
  if not exists (select 1 from proveedores where id = p_proveedor_id) then
    raise exception 'El proveedor % no existe', p_proveedor_id;
  end if;
  p_credito := coalesce(p_credito, 0);
  if p_credito < 0 or p_credito <> round(p_credito, 2) then
    raise exception 'El saldo a favor a usar debe ser un monto positivo con hasta 2 decimales (llegó %)', p_credito;
  end if;
  if p_aplicaciones is null or jsonb_typeof(p_aplicaciones) <> 'array' or jsonb_array_length(p_aplicaciones) = 0 then
    raise exception 'El pago necesita al menos un comprobante con su monto';
  end if;

  for v_app in select * from jsonb_array_elements(p_aplicaciones) loop
    v_compra_id := (v_app ->> 'compra_id')::uuid;
    v_monto := (v_app ->> 'monto')::numeric;
    if v_compra_id is null or v_monto is null or v_monto <= 0 then
      raise exception 'Cada comprobante del pago necesita su compra_id y un monto mayor a cero';
    end if;
    if v_monto <> round(v_monto, 2) then
      raise exception 'Los montos del pago admiten como máximo 2 decimales (llegó %)', v_monto;
    end if;
    if v_compra_id = any(v_compra_ids) then
      raise exception 'El comprobante % aparece más de una vez en el pago', v_compra_id;
    end if;
    v_compra_ids := v_compra_ids || v_compra_id;
    v_montos := v_montos || v_monto;
    v_suma := v_suma + v_monto;
  end loop;

  -- Cuánto del total se cubre con saldo a favor; el resto, con el medio elegido.
  if p_credito > v_suma then
    raise exception 'El saldo a favor a usar (S/ %) supera el total del pago (S/ %)', p_credito, v_suma;
  end if;
  if p_credito < v_suma and coalesce(p_metodo, '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro') then
    raise exception 'Medio de pago no reconocido: %', coalesce(p_metodo, '(vacío)');
  end if;
  if p_credito > fn_saldo_favor_proveedor(p_proveedor_id) then
    raise exception 'El saldo a favor con este proveedor es S/ % y se intenta usar S/ %', fn_saldo_favor_proveedor(p_proveedor_id), p_credito;
  end if;

  v_fecha := coalesce(p_fecha, fn_hoy_lima());
  v_ref := nullif(trim(coalesce(p_referencia, '')), '');
  v_grupo := coalesce(p_token, gen_random_uuid());

  -- ---- candado por comprobante, siempre en el mismo orden ----
  perform 1 from compras where id = any(v_compra_ids) order by id for update;

  -- ---- idempotencia: si este token ya se registró, es un reintento ----
  if p_token is not null and exists (select 1 from compra_pagos where pago_grupo_id = p_token) then
    return p_token;
  end if;

  -- ---- validar TODO antes de escribir nada ----
  for v_i in 1 .. array_length(v_compra_ids, 1) loop
    select * into v_c from compras where id = v_compra_ids[v_i];
    if not found then
      raise exception 'La compra % no existe', v_compra_ids[v_i];
    end if;
    if v_c.proveedor_id <> p_proveedor_id then
      raise exception 'Un pago por lote cubre comprobantes de un solo proveedor: %-% es de otro proveedor', v_c.serie, v_c.numero;
    end if;
    if v_c.estado <> 'vigente' then
      raise exception 'El comprobante %-% está anulado, no acepta pagos', v_c.serie, v_c.numero;
    end if;
    if v_c.saldo <= 0 then
      raise exception 'El comprobante %-% no tiene saldo pendiente', v_c.serie, v_c.numero;
    end if;
    if v_montos[v_i] > v_c.saldo then
      raise exception 'El pago (S/ %) al comprobante %-% supera su saldo pendiente (S/ %)', v_montos[v_i], v_c.serie, v_c.numero, v_c.saldo;
    end if;
  end loop;

  select id into v_persona from personas where auth_user_id = auth.uid();

  -- El saldo a favor se reparte en el orden de los comprobantes del pedido (la pantalla los manda del más
  -- vencido al menos vencido); cada comprobante puede quedar con dos filas: una con saldo a favor y otra con el medio.
  v_credito_restante := p_credito;
  for v_i in 1 .. array_length(v_compra_ids, 1) loop
    v_credito_i := least(v_montos[v_i], v_credito_restante);
    v_resto_i := v_montos[v_i] - v_credito_i;
    v_credito_restante := v_credito_restante - v_credito_i;
    if v_credito_i > 0 then
      insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id)
        values (v_compra_ids[v_i], v_fecha, v_credito_i, 'saldo_a_favor', null, v_persona, v_grupo)
        returning id into v_pago_id;
      perform fn_consumir_saldo_favor(p_proveedor_id, v_credito_i, v_compra_ids[v_i], v_pago_id, v_fecha, v_persona);
    end if;
    if v_resto_i > 0 then
      insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id)
        values (v_compra_ids[v_i], v_fecha, v_resto_i, p_metodo, v_ref, v_persona, v_grupo);
    end if;
  end loop;

  return v_grupo;
end;
$function$;

comment on function retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid, numeric) is
  'Un pago (una transferencia) que se aplica a varios comprobantes del mismo proveedor (ADR-0111 D3). p_credito = cuánto del total se cubre con saldo a favor del proveedor (el resto va con p_metodo); se reparte en el orden de las aplicaciones. Todo o nada; idempotente por p_token.';

revoke all on function retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid, numeric) from public, anon;
grant execute on function retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid, numeric) to authenticated;

-- ==================== reembolso ====================
create function retail.registrar_reembolso_proveedor(
  p_proveedor_id uuid,
  p_monto numeric,
  p_metodo text,
  p_referencia text default null,
  p_fecha date default null,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_saldo numeric(12, 2);
  v_id uuid;
begin
  if not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para registrar reembolsos de proveedores';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto <> round(p_monto, 2) then
    raise exception 'El reembolso necesita un monto mayor a cero con hasta 2 decimales';
  end if;
  if coalesce(p_metodo, '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro') then
    raise exception 'Medio de devolución no reconocido: %', coalesce(p_metodo, '(vacío)');
  end if;
  if p_fecha is not null and p_fecha > fn_hoy_lima() then
    raise exception 'La fecha del reembolso no puede ser futura';
  end if;

  perform 1 from proveedores where id = p_proveedor_id for update;
  if not found then
    raise exception 'El proveedor % no existe', p_proveedor_id;
  end if;
  v_saldo := fn_saldo_favor_proveedor(p_proveedor_id);
  if p_monto > v_saldo then
    raise exception 'El saldo a favor con este proveedor es S/ % y el reembolso es de S/ %', v_saldo, p_monto;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();
  insert into proveedor_creditos (proveedor_id, tipo, monto, fecha, metodo, referencia, nota, usuario_id)
    values (p_proveedor_id, 'reembolso', p_monto, coalesce(p_fecha, fn_hoy_lima()), p_metodo,
            nullif(trim(coalesce(p_referencia, '')), ''), nullif(trim(coalesce(p_nota, '')), ''), v_persona)
    returning id into v_id;
  return v_id;
end;
$$;

comment on function retail.registrar_reembolso_proveedor(uuid, numeric, text, text, date, text) is
  'El proveedor devolvió dinero en vez de dejar saldo a favor (ADR-0111): baja el saldo a favor. Solo líder. No mueve caja (es un registro).';

revoke all on function retail.registrar_reembolso_proveedor(uuid, numeric, text, text, date, text) from public, anon;
grant execute on function retail.registrar_reembolso_proveedor(uuid, numeric, text, text, date, text) to authenticated;
