-- ============================================================================
-- 0054 — `registrar_venta` deja de duplicar una venta si la red se corta
--
-- Ver ADR-0032 y el espejo de producción (`supabase/unificacion/
-- 34_idempotencia_registrar_venta.sql`) para el razonamiento completo: dos
-- rondas de revisión adversarial encontraron y cerraron ahí dos bugs reales
-- (un bypass de autorización, y una rama de la carrera concurrente sin la
-- misma comparación de contexto que la rama normal). Este archivo aplica el
-- mismo diseño ya verificado, en el vocabulario sin prefijo `retail.` que
-- usa el resto de `supabase/migrations/` (equivalente local del `0012_
-- rpc_valida_sede.sql` que ya reemplaza esta misma función una vez).
-- ============================================================================

alter table ventas add column if not exists token_cliente uuid;

create unique index if not exists ventas_token_cliente_key
  on ventas (token_cliente);

drop function if exists registrar_venta(uuid, text, jsonb, text);

create function registrar_venta(
  p_caja_id uuid,
  p_metodo_pago text,
  p_items jsonb,
  p_nota text default null,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caja cajas%rowtype; v_persona_id uuid; v_venta_id uuid; v_movimiento_id uuid;
  v_monto_total numeric := 0; v_linea_total numeric; v_item jsonb;
  v_existente ventas%rowtype;
begin
  select * into v_caja from cajas where id = p_caja_id;
  if not found then raise exception 'La caja % no existe', p_caja_id; end if;
  if not fn_puede_operar_sede(v_caja.sede_id) then
    raise exception 'No tienes permiso para vender en esa caja';
  end if;
  if v_caja.estado <> 'abierta' then raise exception 'Esta caja ya está cerrada — no se pueden registrar más ventas ahí'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'El carrito está vacío'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_monto_total := v_monto_total + (v_item ->> 'monto')::numeric * (v_item ->> 'cantidad')::numeric;
  end loop;

  if p_token is not null then
    select * into v_existente from ventas where token_cliente = p_token;
    if found then
      if v_existente.caja_id is distinct from p_caja_id
         or v_existente.metodo_pago is distinct from p_metodo_pago
         or v_existente.monto_total is distinct from v_monto_total then
        raise exception 'Este token ya se usó para una venta con otros datos (caja, método de pago o monto no coinciden) — no se puede reutilizar.';
      end if;
      return v_existente.id;
    end if;
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  begin
    insert into ventas (sede_id, caja_id, metodo_pago, monto_total, usuario_id, nota, token_cliente)
      values (v_caja.sede_id, p_caja_id, p_metodo_pago, v_monto_total, v_persona_id, p_nota, p_token)
      returning id into v_venta_id;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select * into v_existente from ventas where token_cliente = p_token;
    if not found then raise; end if;
    if v_existente.caja_id is distinct from p_caja_id
       or v_existente.metodo_pago is distinct from p_metodo_pago
       or v_existente.monto_total is distinct from v_monto_total then
      raise exception 'Este token ya se usó para una venta con otros datos (caja, método de pago o monto no coinciden) — no se puede reutilizar.';
    end if;
    return v_existente.id;
  end;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_linea_total := (v_item ->> 'monto')::numeric * (v_item ->> 'cantidad')::numeric;
    insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, canal, monto, venta_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, v_caja.sede_id, 'salida',
              (v_item ->> 'cantidad')::integer, 'venta', 'tienda', v_linea_total, v_venta_id, v_persona_id)
      returning id into v_movimiento_id;
    perform fn_aplicar_movimiento(v_movimiento_id);
  end loop;

  return v_venta_id;
end;
$$;
