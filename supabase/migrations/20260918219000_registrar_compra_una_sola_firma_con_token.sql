-- ============================================================================
-- 20260918219000_registrar_compra_una_sola_firma_con_token.sql — CAYLA V2
--
-- EL PROBLEMA. Dos migraciones distintas le pusieron mano a `registrar_compra` sin verse:
--   · 20260918180000_compras_token_cliente_idempotencia (reconstruye lo que ya corría en
--     producción): firma de 15 parámetros, con `p_token`.
--   · 20260918217000_saldo_a_favor_como_medio_de_pago_y_reembolso (ADR-0111): `create or replace`
--     con 14 parámetros, SIN `p_token`, y con el medio de pago `saldo_a_favor`.
-- La segunda cambia la lista de tipos, así que Postgres no reemplaza: crea una SEGUNDA sobrecarga
-- (el hueco de ADR-0009/0004). Verificado en producción el 2026-09-18: existen las dos. La de 14
-- tiene el saldo a favor y no el token; la de 15 tiene el token y no el saldo a favor. Una llamada
-- sin `p_token` (el front que está desplegado no lo manda) coincide con las dos y falla por
-- ambigua; una con `p_token` va a la de 15 y pierde el saldo a favor.
--
-- QUÉ HACE. Deja UNA sola función, la de 15 parámetros, con las dos cosas: el cuerpo de 217000
-- (el medio `saldo_a_favor` y `fn_consumir_saldo_favor`) más el candado de idempotencia de 180000
-- (pre-chequeo del token, `token_cliente` en el insert y la rama del token en `unique_violation`).
-- Y borra la de 14.
--
-- ORDEN. Va DESPUÉS de las dos. En una base limpia: 180000 crea la de 15, 217000 crea la de 14, y
-- esta reemplaza la de 15 y borra la de 14. En producción: reemplaza la de 15 (que hoy no tiene el
-- saldo a favor) y borra la de 14 (que hoy no tiene el token).
--
-- IDEMPOTENTE. Aplicada dos veces, la segunda no cambia nada: `create or replace` con el mismo
-- cuerpo y `drop function if exists` de una firma que ya no está.
--
-- SE ROMPE SI: una migración nueva vuelve a definir `registrar_compra` con la lista de tipos de
-- 14 parámetros. Parte siempre del cuerpo vivo (`pg_get_functiondef`) y conserva `p_token`.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.registrar_compra(
  p_proveedor_id uuid,
  p_serie text,
  p_numero text,
  p_condicion text,
  p_ubicacion_destino_id uuid,
  p_items jsonb,
  p_tipo text default 'factura',
  p_fecha_emision date default current_date,
  p_fecha_vencimiento date default null,
  p_igv_porcentaje numeric default 18,
  p_pago jsonb default null,
  p_nota text default null,
  p_total numeric default null,
  p_token uuid default null,
  p_fecha_estimada_llegada date default null
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
  v_pago_id uuid;
  v_pagos jsonb; v_pago jsonb; v_monto numeric(12, 2); v_pago_suma numeric(12, 2) := 0; v_pago_fecha date;
  v_existente compras%rowtype;
  v_constraint text;
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

  -- Reintento honesto: el primer envío sí llegó, solo se cortó la respuesta.
  -- Se devuelve la compra que ya existe sin volver a escribir nada.
  if p_token is not null then
    select * into v_existente from compras where token_cliente = p_token;
    if found then return v_existente.id; end if;
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
    ubicacion_destino_id, subtotal, igv, total, nota, usuario_id, token_cliente, fecha_estimada_llegada
  ) values (
    p_proveedor_id, p_tipo, upper(trim(p_serie)), trim(p_numero), p_fecha_emision, p_condicion,
    case when p_condicion = 'contado' then null else p_fecha_vencimiento end,
    p_ubicacion_destino_id, v_subtotal, v_igv, v_total, p_nota, v_persona, p_token, p_fecha_estimada_llegada
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
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'compras_token_cliente_key' then
      select * into v_existente from compras where token_cliente = p_token;
      if found then return v_existente.id; end if;
    end if;
    raise exception 'La factura %-% de este proveedor ya está registrada', upper(trim(p_serie)), trim(p_numero);
end;
$$;

revoke all on function retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date) from public;
grant execute on function retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date) to authenticated;

-- La sobrecarga de 14 parámetros (sin p_token) que dejó 20260918217000.
drop function if exists retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, date);

-- ==================== VERIFICAR DESPUÉS DE PEGAR (debe dar 1 | true | true | true) ====================
-- firmas: una sola registrar_compra. tiene_p_token / tiene_token: el candado de idempotencia.
-- tiene_saldo_a_favor: el cuerpo de ADR-0111. (En un Postgres local que aún no aplicó 20260918217000
-- el tercero da false: allá la función es la anterior y no existe fn_consumir_saldo_favor.)
--
-- select count(*) as firmas,
--        bool_and(pg_get_function_arguments(p.oid) like '%p_token uuid%') as tiene_p_token,
--        bool_and(p.prosrc like '%fn_consumir_saldo_favor%') as tiene_saldo_a_favor,
--        bool_and(p.prosrc like '%token_cliente%') as tiene_token
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'retail' and p.proname = 'registrar_compra';
