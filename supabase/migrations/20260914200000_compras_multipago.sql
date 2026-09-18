-- ============================================================================
-- Multipago en compras: un pago puede repartirse en varios medios
--
-- EL PROBLEMA (lo pidió Felipe, 2026-09-14). Una factura de S/ 8,000 se paga
-- S/ 5,000 por transferencia y S/ 3,000 en efectivo, en el mismo acto. Hoy
-- `registrar_pago_compra` toma UN monto con UN medio: había que registrar
-- dos pagos por separado, y si el segundo fallaba (sesión vencida, saldo
-- mal tipeado) el primero ya estaba escrito — un pago a medias que nadie
-- pidió.
--
-- EL MODELO NO CAMBIA: `compra_pagos` ya es "una fila por medio de pago"
-- (así el Diario de caja y la conciliación bancaria siguen viendo cada
-- medio por separado). Lo que faltaba era escribir varias filas EN UNA
-- SOLA TRANSACCIÓN, validando la suma contra el saldo una sola vez y con la
-- factura bloqueada. Eso es `registrar_pagos_compra`.
--
-- `registrar_pago_compra` (singular) queda como atajo para un solo medio:
-- llama a la nueva. Ninguna pantalla se rompe mientras se despliega.
--
-- `registrar_compra` acepta en `p_pago` lo de siempre (un objeto) o un
-- arreglo de medios. Misma firma → `create or replace`, sin DROP. Al contado
-- la SUMA debe ser el total; al crédito, no superarlo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Varios medios contra una factura, todo o nada
-- ---------------------------------------------------------------------------
create function retail.registrar_pagos_compra(
  p_compra_id uuid,
  p_pagos jsonb,                       -- [{monto, metodo, referencia?}]
  p_fecha date default current_date
)
returns uuid[]
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_compra compras%rowtype; v_pagado numeric(12, 2); v_suma numeric(12, 2) := 0;
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
    if coalesce(v_pago ->> 'metodo', '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro') then
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

  select coalesce(sum(monto), 0) into v_pagado from compra_pagos where compra_id = p_compra_id;
  if v_pagado + v_suma > v_compra.total then
    raise exception 'El pago (S/ %) supera el saldo pendiente (S/ %)', v_suma, v_compra.total - v_pagado;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id)
      values (p_compra_id, coalesce(p_fecha, current_date), (v_pago ->> 'monto')::numeric, v_pago ->> 'metodo', nullif(trim(coalesce(v_pago ->> 'referencia', '')), ''), v_persona)
      returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  return v_ids;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Un solo medio = la misma regla, por el mismo camino
-- ---------------------------------------------------------------------------
create or replace function retail.registrar_pago_compra(
  p_compra_id uuid,
  p_monto numeric,
  p_metodo text,
  p_referencia text default null,
  p_fecha date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  return (registrar_pagos_compra(
    p_compra_id,
    jsonb_build_array(jsonb_build_object('monto', p_monto, 'metodo', p_metodo, 'referencia', p_referencia)),
    p_fecha
  ))[1];
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. registrar_compra: `p_pago` acepta un objeto o un arreglo de medios
-- ---------------------------------------------------------------------------
create or replace function retail.registrar_compra(
  p_proveedor_id uuid,
  p_serie text,
  p_numero text,
  p_condicion text,
  p_ubicacion_destino_id uuid,
  p_items jsonb,                       -- [{producto_id, variante_id?, descripcion?, cantidad, costo_unitario}]
  p_tipo text default 'factura',
  p_fecha_emision date default current_date,
  p_fecha_vencimiento date default null,
  p_igv_porcentaje numeric default 18,
  p_pago jsonb default null,           -- {monto, metodo, referencia?, fecha?} o [{monto, metodo, referencia?}] — obligatorio si contado
  p_nota text default null,
  p_total numeric default null         -- el total del papel, cuando los precios traen el IGV incluido
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_compra_id uuid; v_persona uuid; v_item jsonb;
  v_subtotal numeric(12, 2) := 0; v_igv numeric(12, 2); v_total numeric(12, 2);
  v_producto uuid; v_variante uuid;
  v_tolerancia numeric(12, 2);
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
      if coalesce(v_pago ->> 'metodo', '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro') then
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
    ubicacion_destino_id, subtotal, igv, total, nota, usuario_id
  ) values (
    p_proveedor_id, p_tipo, upper(trim(p_serie)), trim(p_numero), p_fecha_emision, p_condicion,
    case when p_condicion = 'contado' then null else p_fecha_vencimiento end,
    p_ubicacion_destino_id, v_subtotal, v_igv, v_total, p_nota, v_persona
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
        );
    end loop;
  end if;

  return v_compra_id;
exception
  when unique_violation then
    raise exception 'La factura %-% de este proveedor ya está registrada', upper(trim(p_serie)), trim(p_numero);
end;
$$;

grant execute on function retail.registrar_pagos_compra(uuid, jsonb, date) to authenticated;
grant execute on function retail.registrar_pago_compra(uuid, numeric, text, text, date) to authenticated;
grant execute on function retail.registrar_compra to authenticated;
