-- ============================================================================
-- `registrar_pago_compras_medios` alineada con el endurecimiento de los pagos (ADR-0135 + ADR-0132).
--
-- EL PROBLEMA. La función nueva (20260919190000) se escribió a partir de `registrar_pago_compras` de PRODUCCIÓN, y el
-- endurecimiento 20260919180000 (ADR-0135) todavía no estaba en `main`. Por eso heredó dos huecos que esa migración
-- cierra en las otras rutas de pago:
--   M1  El saldo a favor disponible se miraba ANTES del token: un pago con saldo a favor lo deja en 0 y su reintento
--       (respuesta cortada, doble toque) fallaba con «el saldo a favor es S/ 0» en vez de devolver el éxito original.
--   M2  La fecha del pago aceptaba cualquier valor (2099, o anterior a la emisión). Ahora pasa por
--       `fn_validar_fecha_pago_compra`, igual que las otras tres rutas.
--
-- DECISIÓN. Misma firma exacta (`create or replace`, sin sobrecarga): solo cambia el orden de dos chequeos y se suma
-- el de fecha. No toca tablas ni datos.
--
-- ORDEN. Requiere `fn_validar_fecha_pago_compra`, que crea 20260919180000_pagos_compras_endurecimiento.sql: aplicar esa
-- ANTES que esta. Si la función no existe, esta migración falla al primer pago (no al crearla) — verificar con la
-- consulta del final.
-- ============================================================================
set search_path = retail, public, extensions;

create or replace function retail.registrar_pago_compras_medios(
  p_proveedor_id uuid,
  p_aplicaciones jsonb,
  p_medios jsonb default null,
  p_fecha date default null,
  p_token uuid default null,
  p_credito numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_persona uuid;
  v_grupo uuid;
  v_fecha date;
  v_app jsonb;
  v_med jsonb;
  v_compra_ids uuid[] := '{}';
  v_montos numeric[] := '{}';
  v_compra_id uuid;
  v_monto numeric;
  v_c compras%rowtype;
  v_i integer;
  v_pago_id uuid;
  v_suma numeric(12, 2) := 0;
  v_por_medios numeric(12, 2);
  v_credito_restante numeric(12, 2);
  v_credito_i numeric(12, 2);
  v_resto_i numeric(12, 2);
  -- los medios, en el orden en que llegaron
  v_med_metodos text[] := '{}';
  v_med_montos numeric[] := '{}';
  v_med_refs text[] := '{}';
  v_med_suma numeric(12, 2) := 0;
  v_metodo text;
  v_ref text;
  v_k integer := 1;
  v_med_restante numeric(12, 2) := 0;
  v_tomar numeric(12, 2);
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

  -- Cuánto del total se cubre con saldo a favor; el resto, con los medios elegidos.
  if p_credito > v_suma then
    raise exception 'El saldo a favor a usar (S/ %) supera el total del pago (S/ %)', p_credito, v_suma;
  end if;
  v_por_medios := v_suma - p_credito;

  -- ---- los medios de pago ----
  if v_por_medios = 0 then
    if p_medios is not null and (jsonb_typeof(p_medios) <> 'array' or jsonb_array_length(p_medios) <> 0) then
      raise exception 'El saldo a favor cubre todo el pago: no lleva medios de pago';
    end if;
  else
    if p_medios is null or jsonb_typeof(p_medios) <> 'array' or jsonb_array_length(p_medios) = 0 then
      raise exception 'El pago necesita al menos un medio de pago para cubrir S/ %', v_por_medios;
    end if;
    if jsonb_array_length(p_medios) > 8 then
      raise exception 'Un pago admite como máximo 8 medios de pago';
    end if;
    for v_med in select * from jsonb_array_elements(p_medios) loop
      if jsonb_typeof(v_med) <> 'object' then
        raise exception 'Cada medio de pago necesita su metodo y su monto';
      end if;
      v_metodo := v_med ->> 'metodo';
      v_monto := (v_med ->> 'monto')::numeric;
      if coalesce(v_metodo, '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro') then
        raise exception 'Medio de pago no reconocido: % (el saldo a favor se indica con p_credito, no como medio)', coalesce(v_metodo, '(vacío)');
      end if;
      if v_monto is null or v_monto <= 0 then
        raise exception 'Cada medio de pago necesita un monto mayor a cero';
      end if;
      if v_monto <> round(v_monto, 2) then
        raise exception 'Los montos de los medios admiten como máximo 2 decimales (llegó %)', v_monto;
      end if;
      v_med_metodos := v_med_metodos || v_metodo;
      v_med_montos := v_med_montos || v_monto;
      v_med_refs := v_med_refs || coalesce(nullif(trim(coalesce(v_med ->> 'referencia', '')), ''), '');
      v_med_suma := v_med_suma + v_monto;
    end loop;
    if v_med_suma <> v_por_medios then
      raise exception 'Los medios de pago suman S/ % y hay que cubrir S/ % (el total del pago menos el saldo a favor)', v_med_suma, v_por_medios;
    end if;
    v_med_restante := v_med_montos[1];
  end if;

  v_fecha := coalesce(p_fecha, fn_hoy_lima());
  v_grupo := coalesce(p_token, gen_random_uuid());

  -- ---- candado por comprobante, siempre en el mismo orden ----
  perform 1 from compras where id = any(v_compra_ids) order by id for update;

  -- ---- idempotencia: si este token ya se registró, es un reintento ----
  if p_token is not null and exists (select 1 from compra_pagos where pago_grupo_id = p_token) then
    return p_token;
  end if;

  -- ---- validar TODO antes de escribir nada (lo que sí mira el estado de la base) ----
  -- M1 (ADR-0135): el saldo a favor disponible se mira DESPUÉS del token. Un pago que usó saldo a favor lo dejó en 0 y su
  -- reintento no puede fallar por eso: tiene que devolver el éxito original.
  if p_credito > fn_saldo_favor_proveedor(p_proveedor_id) then
    raise exception 'El saldo a favor con este proveedor es S/ % y se intenta usar S/ %', fn_saldo_favor_proveedor(p_proveedor_id), p_credito;
  end if;

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
    -- M2 (ADR-0135): ni futura ni anterior a la emisión de ESTE comprobante
    perform fn_validar_fecha_pago_compra(v_fecha, v_c.fecha_emision, v_c.serie || '-' || v_c.numero);
  end loop;

  select id into v_persona from personas where auth_user_id = auth.uid();

  -- El saldo a favor se reparte primero, en el orden de los comprobantes del pedido (la pantalla los manda del más
  -- vencido al menos vencido); lo que resta de cada comprobante se cubre gastando los medios EN CASCADA.
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
    while v_resto_i > 0 loop
      -- Con los totales validados arriba nunca se acaban los medios antes que los comprobantes; si pasara, es un error de la
      -- función y se aborta todo (mejor que dejar un pago a medias).
      if v_k > coalesce(array_length(v_med_montos, 1), 0) then
        raise exception 'Reparto inconsistente: se acabaron los medios de pago antes de cubrir el comprobante %', v_compra_ids[v_i];
      end if;
      v_tomar := least(v_resto_i, v_med_restante);
      insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id)
        values (v_compra_ids[v_i], v_fecha, v_tomar, v_med_metodos[v_k], nullif(v_med_refs[v_k], ''), v_persona, v_grupo);
      v_resto_i := v_resto_i - v_tomar;
      v_med_restante := v_med_restante - v_tomar;
      if v_med_restante = 0 and v_k < array_length(v_med_montos, 1) then
        v_k := v_k + 1;
        v_med_restante := v_med_montos[v_k];
      end if;
    end loop;
  end loop;

  return v_grupo;
end;
$function$;

comment on function retail.registrar_pago_compras_medios(uuid, jsonb, jsonb, date, uuid, numeric) is
  'Pago por lote con VARIOS medios (ADR-0132): reparte p_medios en cascada entre los comprobantes de p_aplicaciones (un solo proveedor), todo o nada, idempotente por p_token (antes del saldo a favor, ADR-0135 M1), fecha validada (M2). Saldo a favor por p_credito, no como medio. Con un solo medio se sigue usando registrar_pago_compras.';

-- Los permisos no cambian (revoke/grant de 20260919190000 siguen vigentes con `create or replace`).
