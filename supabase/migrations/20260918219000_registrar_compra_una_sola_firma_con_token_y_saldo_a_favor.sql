-- ============================================================================
-- ADR-0111 (corrección 2026-09-19) — `registrar_compra` vuelve a tener UNA sola firma:
-- la de producción (con `p_token`), más el medio de pago «Saldo a favor».
--
-- QUÉ PASÓ. Producción tenía `registrar_compra` con 15 parámetros (… `p_total`, `p_token`,
-- `p_fecha_estimada_llegada`): la versión de `pegar-en-produccion-compras-atraso-recepcion.sql`,
-- que conserva la idempotencia por `compras.token_cliente`. El repo, en cambio, solo conoce
-- la de 14 (sin `p_token`): `20260918130000_compras_atraso_recepcion.sql` y, encima,
-- `20260918217000_saldo_a_favor_…`, que la reescribió con el medio `saldo_a_favor`. Al pegar
-- 217000 en producción, `create or replace` con una lista de parámetros DISTINTA no reemplazó
-- nada: creó una SOBRECARGA (la trampa de ADR-0009). Quedaron dos `registrar_compra`, y como la
-- pantalla no manda `p_token`, PostgREST no puede elegir entre las dos («Could not choose the
-- best candidate function»): Registrar comprobante fallaba en producción.
--
-- QUÉ HACE ESTA MIGRACIÓN (idempotente):
--   1. `compras.token_cliente` y su UNIQUE `compras_token_cliente_key`: producción ya los tiene;
--      el repo no. Se agregan si faltan, para que una base nueva converja con producción.
--   2. Se suelta la sobrecarga de 14 parámetros.
--   3. Se reescribe la de 15 parámetros (la de producción, línea por línea) con UN solo cambio:
--      acepta `saldo_a_favor` como medio de pago y descuenta ese saldo del libro
--      `proveedor_creditos` (`fn_consumir_saldo_favor`), igual que `registrar_pagos_compra`.
--   Firma, permisos y comportamiento por token: idénticos a producción.
--
-- ORDEN: va después de 20260918217000 (que creó la sobrecarga) y no depende de nada más.
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. lo que producción ya tiene y el repo no ====================
alter table compras add column if not exists token_cliente uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'retail.compras'::regclass and conname = 'compras_token_cliente_key'
  ) then
    alter table compras add constraint compras_token_cliente_key unique (token_cliente);
  end if;
end;
$$;

comment on column compras.token_cliente is
  'Token de idempotencia que manda la pantalla al registrar: si la respuesta se corta y se reintenta con el mismo token, se devuelve la compra que ya existe en vez de duplicarla.';

-- ==================== 2. fuera la sobrecarga sin p_token ====================
drop function if exists retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, date);

-- ==================== 3. la firma de producción, con «saldo a favor» ====================
create or replace function retail.registrar_compra(
  p_proveedor_id uuid,
  p_serie text,
  p_numero text,
  p_condicion text,
  p_ubicacion_destino_id uuid,
  p_items jsonb,
  p_tipo text default 'factura'::text,
  p_fecha_emision date default current_date,
  p_fecha_vencimiento date default null::date,
  p_igv_porcentaje numeric default 18,
  p_pago jsonb default null::jsonb,
  p_nota text default null::text,
  p_total numeric default null::numeric,
  p_token uuid default null::uuid,
  p_fecha_estimada_llegada date default null::date
)
returns uuid
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
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
      -- Saldo a favor del proveedor como medio de pago (ADR-0111): descuenta del libro, con candado por proveedor.
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
$function$;

comment on function retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date) is
  'Registra una factura de compra con sus líneas y, si vino, su pago (uno o varios medios, incluido saldo_a_favor: ADR-0111). Idempotente por p_token. UNA sola firma: una sobrecarga hace ambiguo el RPC (ADR-0009).';

revoke all on function retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date) from public, anon;
grant execute on function retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date) to authenticated;
