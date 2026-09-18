-- ============================================================================
-- Compras (ADR-0106, D3): pago por lote — UNA transferencia, VARIOS comprobantes
--
-- EL PROBLEMA. Felipe le paga al proveedor una sola transferencia de S/ 7,906
-- que cubre dos comprobantes. Hoy hay que registrar dos pagos sueltos: en el
-- estado de cuenta del banco ve UNA línea y en el sistema dos, y conciliar es
-- adivinar cuáles suman cuánto. Y si el segundo pago falla (saldo mal tipeado,
-- sesión vencida) el primero ya quedó escrito: un pago a medias que nadie pidió.
--
-- LA SOLUCIÓN. `registrar_pago_compras` aplica un pago a varios comprobantes del
-- MISMO proveedor en una sola transacción:
--   · cada aplicación es una fila de `compra_pagos` (el historial de cada
--     comprobante queda intacto, y `compras.pagado` lo mantiene el trigger de
--     siempre — el saldo sigue siendo un cálculo);
--   · todas las filas comparten `pago_grupo_id` → conciliar con el banco es
--     comparar UNA línea con UNA suma (`sum(monto) ... group by pago_grupo_id`);
--   · todo o nada: si un comprobante ya no admite su monto, no se registra ninguno;
--   · candado por comprobante (`for update`, en orden de id: dos pagos por lote
--     que se cruzan no se bloquean entre sí) — dos pagos simultáneos no pueden
--     pasarse del saldo;
--   · idempotente por token: el token del cliente ES el `pago_grupo_id`. Apretar
--     dos veces «Registrar pago» (o reintentar tras un corte de red) devuelve el
--     mismo grupo sin pagar de nuevo. La revisión del token va DESPUÉS de tomar
--     los candados y ANTES de validar saldos: si el primer intento ya entró, el
--     saldo ya bajó y validarlo primero rechazaría el reintento en vez de
--     reconocerlo.
--
-- El pago individual de siempre (`registrar_pago_compra`, `registrar_pagos_compra`)
-- NO cambia.
--
-- QUIÉN PUEDE. Mismo candado que `registrar_pago_compra`: `fn_puede_registrar_compras()`
-- (hoy, líder). Un líder opera cualquier sede, así que no hace falta un candado de
-- sede aparte (si mañana `fn_puede_registrar_compras` se abre a encargados de sede,
-- habrá que repetir aquí `fn_puede_operar_ubicacion` por comprobante — esta función
-- es `security definer` y se salta RLS).
--
-- FORMATO. `p_aplicaciones = [{"compra_id": uuid, "monto": numeric}, ...]`. Devuelve el
-- `pago_grupo_id`. `p_fecha` nulo = hoy en Lima (`fn_hoy_lima()`, no `current_date`).
--
-- SE ROMPE SI: alguien reutiliza un token para un pago DISTINTO — la segunda llamada
-- se reconoce como repetida y no paga. El token es «una intención de pago», no un
-- valor a reciclar: la pantalla genera uno nuevo por cada modal abierto.
-- ============================================================================

set search_path = retail, public, extensions;

create function retail.registrar_pago_compras(
  p_proveedor_id uuid,
  p_metodo text,
  p_aplicaciones jsonb,                -- [{compra_id, monto}]
  p_referencia text default null,
  p_fecha date default null,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
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
  if coalesce(p_metodo, '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro') then
    raise exception 'Medio de pago no reconocido: %', coalesce(p_metodo, '(vacío)');
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
  end loop;

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

  for v_i in 1 .. array_length(v_compra_ids, 1) loop
    insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id)
      values (v_compra_ids[v_i], v_fecha, v_montos[v_i], p_metodo, v_ref, v_persona, v_grupo);
  end loop;

  return v_grupo;
end;
$$;

comment on function retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid) is
  'Pago por lote (ADR-0106 D3): una transferencia aplicada a varios comprobantes del mismo proveedor, todo o nada, con candado por comprobante e idempotente por token (el token es el pago_grupo_id). Devuelve el pago_grupo_id. Solo quien puede registrar pagos (líder).';

revoke all on function retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid) from public, anon;
grant execute on function retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid) to authenticated;
