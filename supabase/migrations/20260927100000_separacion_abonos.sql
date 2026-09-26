-- Abonos a cuenta (Apartados v2, paso 2 — ADR-0236; spike `docs/maquetas/apartados-v2-2026-09/`).
--
-- EL PROBLEMA. Hoy un apartado tiene dos pagos: el adelanto y el saldo al recoger. Si la clienta viene a mitad de
-- semana con una parte, no hay dónde registrarlo: o se le pide que vuelva con todo, o se cobra «por fuera».
--
-- LA DECISIÓN (Felipe, 2026-09-26). Un abono es un pago más del mismo apartado:
--   · entra como `separacion_pagos` (efectivo → ingreso de la caja, como el adelanto) y sube `separaciones.adelanto`
--     (lo pagado antes de recoger), así que el saldo, el arqueo, la custodia y la devolución siguen saliendo de lo mismo;
--   · lleva SU boleta o factura de anticipo (SUNAT: el anticipo se documenta al cobrarlo), con los datos de la clienta
--     del anticipo original. Hoy ningún anticipo se transmite a SUNAT (`lib/transmision-reglas.ts`): queda pendiente,
--     igual que el del apartado;
--   · sin monto mínimo. El plazo NO cambia solo; al abonar se puede elegir esperarla 2 días más, o 3 si el abono cubre
--     la mitad o más de lo que le faltaba (`p_esperar`).
-- Al entregar, la boleta final descuenta TODOS los anticipos (`comprobante_anticipos`); al devolver, sale una nota de
-- crédito por cada anticipo. `separaciones` y sus candados no cambian: el invariante «los pagos suman el adelanto» de
-- `fn_verificar_separaciones` sigue valiendo tal cual.
--
-- PRODUCCIÓN. Dos tablas nuevas, una columna nueva en `separacion_pagos` y funciones. Sin políticas (las tablas nuevas
-- solo se leen por funciones security definer). Una sola parte. Idempotente.

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create table if not exists retail.separacion_abonos (
  id uuid primary key default gen_random_uuid(),
  separacion_id uuid not null references retail.separaciones (id),
  monto numeric(12, 2) not null check (monto > 0),
  comprobante_id uuid references retail.comprobantes (id),
  -- Lo que se le dio de espera por abonar (0, 2 o 3 días) y la fecha antes y después: el historial de plazos.
  dias_espera smallint not null default 0 check (dias_espera in (0, 2, 3)),
  vence_antes date not null,
  vence_despues date not null check (vence_despues >= vence_antes),
  creado_por uuid references public.personas (id),
  token_cliente uuid unique,
  created_at timestamptz not null default now()
);
create index if not exists separacion_abonos_separacion_idx on retail.separacion_abonos (separacion_id, created_at);
alter table retail.separacion_abonos enable row level security;
revoke all on retail.separacion_abonos from anon, authenticated;

-- A qué abono pertenece cada pago (NULL = el adelanto de cuando se apartó).
alter table retail.separacion_pagos add column if not exists abono_id uuid references retail.separacion_abonos (id);

-- Los anticipos que descuenta un comprobante final (uno o varios). `comprobantes.anticipo_comprobante_id` sigue
-- apuntando al primero para lo que ya lo lee.
create table if not exists retail.comprobante_anticipos (
  comprobante_id uuid not null references retail.comprobantes (id),
  anticipo_comprobante_id uuid not null references retail.comprobantes (id),
  monto numeric(12, 2) not null check (monto > 0),
  primary key (comprobante_id, anticipo_comprobante_id)
);
alter table retail.comprobante_anticipos enable row level security;
revoke all on retail.comprobante_anticipos from anon, authenticated;

-- ---------------------------------------------------------------------------
-- abonar_separacion — la clienta paga una parte; la prenda sigue guardada.
-- ---------------------------------------------------------------------------
create or replace function retail.abonar_separacion(
  p_separacion_id uuid,
  p_pagos jsonb,
  p_esperar boolean default false,
  p_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  s separaciones%rowtype;
  v_existente separacion_abonos%rowtype;
  v_persona uuid;
  v_caja uuid;
  v_pago jsonb;
  v_monto numeric := 0;
  v_saldo numeric;
  v_dias smallint := 0;
  v_vence date;
  v_abono uuid;
  v_cm uuid;
  v_ant comprobantes%rowtype;
  v_igv numeric; v_subtotal numeric; v_comp uuid;
begin
  -- Idempotencia: un reintento con el mismo token (doble toque, red que se cae) no abona dos veces.
  if p_token is not null then
    select * into v_existente from separacion_abonos where token_cliente = p_token;
    if found then
      return jsonb_build_object('abono_id', v_existente.id, 'vence_el', v_existente.vence_despues, 'comprobante_id', v_existente.comprobante_id);
    end if;
  end if;
  if not fn_ve_modulo('apartados') then
    raise exception 'Tu rol no tiene el módulo Apartados' using errcode = '42501';
  end if;
  select * into s from separaciones where id = p_separacion_id for update;
  if not found then
    raise exception 'Ese apartado no existe';
  end if;
  if not fn_puede_operar_ubicacion(s.ubicacion_id) then
    raise exception 'No tienes permiso sobre los apartados de esa tienda' using errcode = '42501';
  end if;
  if s.estado <> 'abierta' then
    raise exception 'Solo se abona a un apartado abierto (el % está %)', s.codigo, s.estado;
  end if;
  v_persona := fn_actor_persona_id(true);
  select id into v_caja from cajas where ubicacion_id = s.ubicacion_id and estado = 'abierta' for share;
  if v_caja is null then
    raise exception 'No hay una caja abierta en esta tienda — ábrela antes de cobrar el abono';
  end if;

  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Falta indicar cómo paga el abono';
  end if;
  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    if coalesce(v_pago ->> 'metodo', '') not in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia') then
      raise exception 'Medio de pago no reconocido: %', v_pago ->> 'metodo';
    end if;
    if coalesce((v_pago ->> 'monto')::numeric, 0) <= 0 then
      raise exception 'Cada medio de pago lleva un monto mayor a cero';
    end if;
    v_monto := v_monto + (v_pago ->> 'monto')::numeric;
  end loop;
  v_monto := round(v_monto, 2);
  v_saldo := round(s.total - s.adelanto, 2);
  if v_monto > v_saldo then
    raise exception 'El abono (S/%) pasa lo que falta pagar (S/%)', v_monto, v_saldo;
  end if;

  -- El plazo no cambia solo. Si se eligió esperarla: 2 días, o 3 si el abono cubre la mitad o más de lo que faltaba.
  if coalesce(p_esperar, false) then
    v_dias := case when v_monto * 2 >= v_saldo then 3 else 2 end;
  end if;
  v_vence := greatest(s.vence_el, fn_hoy_lima()) + v_dias;
  if v_dias = 0 then v_vence := s.vence_el; end if;

  begin
    insert into separacion_abonos (separacion_id, monto, dias_espera, vence_antes, vence_despues, creado_por, token_cliente)
      values (s.id, v_monto, v_dias, s.vence_el, v_vence, v_persona, p_token)
      returning id into v_abono;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select * into v_existente from separacion_abonos where token_cliente = p_token;
    return jsonb_build_object('abono_id', v_existente.id, 'vence_el', v_existente.vence_despues, 'comprobante_id', v_existente.comprobante_id);
  end;

  -- El dinero: igual que el adelanto. Solo el efectivo entra al cajón (ingreso de caja, que `cerrar_caja` ya suma).
  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    v_cm := null;
    if v_pago ->> 'metodo' = 'efectivo' then
      insert into caja_movimientos (caja_id, tipo, monto, motivo, usuario_id, nota, separacion_id)
        values (v_caja, 'ingreso', (v_pago ->> 'monto')::numeric, 'Abono de apartado ' || s.codigo, v_persona,
                'En custodia hasta que la clienta recoja: no es venta', s.id)
        returning id into v_cm;
    end if;
    insert into separacion_pagos (separacion_id, metodo, monto, recibido, caja_movimiento_id, abono_id)
      values (s.id, v_pago ->> 'metodo', (v_pago ->> 'monto')::numeric,
              case when v_pago ->> 'metodo' = 'efectivo' then nullif(v_pago ->> 'recibido', '')::numeric end, v_cm, v_abono);
  end loop;

  update separaciones set adelanto = adelanto + v_monto, vence_el = v_vence where id = s.id;
  if v_vence <> s.vence_el then
    update apartados set vence_el = v_vence where separacion_id = s.id and estado = 'abierto';
  end if;

  -- SU comprobante de anticipo, con la misma clienta y el mismo tipo que el anticipo del apartado.
  select * into v_ant from comprobantes where id = s.comprobante_anticipo_id;
  v_igv := round((v_monto - v_monto / 1.18) * 100) / 100;
  v_subtotal := round((v_monto - v_igv) * 100) / 100;
  v_comp := emitir_comprobante(
    s.ubicacion_id, s.comprobante_tipo, v_subtotal, v_igv, v_monto, null,
    coalesce(v_ant.cliente_tipo_doc, 'sin_documento'), v_ant.cliente_num_doc, v_ant.cliente_nombre,
    jsonb_build_array(jsonb_build_object(
      'descripcion', left('Anticipo (abono) por apartado ' || s.codigo, 250),
      'cantidad', 1, 'precio_unitario', v_subtotal))
  );
  update comprobantes set separacion_id = s.id, es_anticipo = true where id = v_comp;
  update separacion_abonos set comprobante_id = v_comp where id = v_abono;

  return jsonb_build_object('abono_id', v_abono, 'vence_el', v_vence, 'comprobante_id', v_comp,
                            'saldo', round(s.total - s.adelanto - v_monto, 2), 'dias_espera', v_dias);
end;
$$;

revoke all on function retail.abonar_separacion(uuid, jsonb, boolean, uuid) from public, anon;
grant execute on function retail.abonar_separacion(uuid, jsonb, boolean, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- entregar_separacion — igual que en producción (pg_get_functiondef del 2026-09-26), más la lista de anticipos.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION retail.entregar_separacion(p_separacion_id uuid, p_pagos jsonb DEFAULT '[]'::jsonb, p_token uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  s separaciones%rowtype;
  v_persona uuid;
  v_caja uuid;
  v_venta uuid;
  v_existente uuid;
  v_it record;
  v_item_id uuid; v_mov uuid; v_costo numeric;
  v_pago jsonb;
  v_saldo numeric;
  v_pagado numeric := 0;
  v_ap apartados%rowtype;
  v_igv numeric; v_subtotal numeric; v_comp uuid; v_ant comprobantes%rowtype;
  v_items_comp jsonb;
begin
  if p_token is not null then
    select id into v_existente from ventas where token_cliente = p_token;
    if found then return v_existente; end if;
  end if;

  -- `for update`: dos cajas entregando la misma separación — la segunda espera y la ve entregada.
  select * into s from separaciones where id = p_separacion_id for update;
  if not found then
    raise exception 'Ese apartado no existe';
  end if;
  if not fn_puede_operar_ubicacion(s.ubicacion_id) then
    raise exception 'No tienes permiso para entregar apartados de esa tienda';
  end if;
  if s.estado = 'entregada' then
    raise exception 'El apartado % ya se entregó', s.codigo;
  elsif s.estado in ('liberada', 'devuelta') then
    raise exception 'El apartado % venció y se liberó: las prendas volvieron a la tienda. Si la clienta aún las quiere, apártalas de nuevo', s.codigo;
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  select id into v_caja from cajas where ubicacion_id = s.ubicacion_id and estado = 'abierta' for share;
  -- ADR-0190: los candados en orden fijo antes de mover nada (sin bloqueos mutuos entre dos operaciones).
  perform fn_bloquear_en_orden(s.ubicacion_id, array(select si.variante_id from separacion_items si where si.separacion_id = s.id));
  if v_caja is null then
    raise exception 'No hay una caja abierta en esta tienda — ábrela antes de entregar';
  end if;

  v_saldo := round(s.total - s.adelanto, 2);
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' then
    raise exception 'Los pagos del saldo vienen mal formados';
  end if;
  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    if coalesce(v_pago ->> 'metodo', '') not in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia') then
      raise exception 'Medio de pago no reconocido: %', v_pago ->> 'metodo';
    end if;
    if coalesce((v_pago ->> 'monto')::numeric, 0) <= 0 then
      raise exception 'Cada medio de pago lleva un monto mayor a cero';
    end if;
    v_pagado := v_pagado + (v_pago ->> 'monto')::numeric;
  end loop;
  if round(v_pagado, 2) <> v_saldo then
    raise exception 'Los pagos (S/%) no cuadran con el saldo del apartado (S/%)', round(v_pagado, 2), v_saldo;
  end if;

  begin
    insert into ventas (ubicacion_id, cliente_id, caja_id, usuario_id, token_cliente, nota, asesora_id, emisor)
      values (s.ubicacion_id, s.clienta_id, v_caja, v_persona, p_token, 'Entrega del apartado ' || s.codigo, s.asesora_id, 'retail')
      returning id into v_venta;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select id into v_existente from ventas where token_cliente = p_token;
    if not found then raise; end if;
    return v_existente;
  end;

  -- En una sola transacción: se cierra cada apartado y sale la prenda. No queda ventana en la que
  -- otra caja pueda llevarse la unidad liberada (la que dejó abierta la Fase 1 de ADR-0141).
  for v_it in select * from separacion_items where separacion_id = s.id order by id loop
    select * into v_ap from apartados where id = v_it.apartado_id;
    perform fn_cerrar_apartado_de_separacion(v_it.apartado_id, 'entregada', v_persona);
    select costo into v_costo from variantes where id = v_it.variante_id;
    insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario,
                             motivo_descuento, descuento_etiqueta_id)
      values (v_venta, v_it.variante_id, v_it.cantidad, v_it.precio_unitario, v_it.descuento_unitario, coalesce(v_costo, 0),
              case when v_it.descuento_unitario > 0 then 'campana' end, v_it.descuento_etiqueta_id)
      returning id into v_item_id;
    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
      values (v_it.variante_id, s.ubicacion_id, v_ap.sububicacion_id, 'salida', v_it.cantidad, 'venta', v_item_id, v_persona)
      returning id into v_mov;
    perform fn_aplicar_movimiento(v_mov);
  end loop;

  -- El adelanto es un pago más de esta venta (medio `anticipo`); el saldo, lo que paga hoy.
  insert into venta_pagos (venta_id, metodo, monto) values (v_venta, 'anticipo', s.adelanto);
  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    insert into venta_pagos (venta_id, metodo, monto, recibido)
      values (v_venta, v_pago ->> 'metodo', (v_pago ->> 'monto')::numeric,
              case when v_pago ->> 'metodo' = 'efectivo' then nullif(v_pago ->> 'recibido', '')::numeric end);
  end loop;

  -- D1: el comprobante final DEDUCE el anticipo. Si el adelanto cubrió el 100%, no hay saldo que
  -- documentar: el comprobante del anticipo ya cubrió toda la operación (validar con el contador).
  if v_saldo > 0 then
    select * into v_ant from comprobantes where id = s.comprobante_anticipo_id;
    v_igv := round((v_saldo - v_saldo / 1.18) * 100) / 100;
    v_subtotal := round((v_saldo - v_igv) * 100) / 100;
    select jsonb_agg(jsonb_build_object(
             'variante_id', si.variante_id, 'descripcion', p.referencia || ' ' || v.sku, 'cantidad', si.cantidad,
             'precio_unitario', si.precio_unitario - si.descuento_unitario) order by v.sku)
      into v_items_comp
      from separacion_items si join variantes v on v.id = si.variante_id join productos p on p.id = v.producto_id
     where si.separacion_id = s.id;
    v_comp := emitir_comprobante(
      s.ubicacion_id, s.comprobante_tipo, v_subtotal, v_igv, v_saldo, v_venta,
      coalesce(v_ant.cliente_tipo_doc, 'sin_documento'), v_ant.cliente_num_doc, v_ant.cliente_nombre, v_items_comp
    );
    update comprobantes
       set separacion_id = s.id, anticipo_deducido = s.adelanto, anticipo_comprobante_id = s.comprobante_anticipo_id
     where id = v_comp;
    -- Abonos (20260927100000): la boleta final descuenta TODOS los anticipos del apartado, no solo el primero.
    -- `anticipo_comprobante_id` sigue apuntando al del apartado; la lista completa queda aquí para SUNAT.
    insert into comprobante_anticipos (comprobante_id, anticipo_comprobante_id, monto)
      select v_comp, c.id, c.total from comprobantes c
       where c.separacion_id = s.id and c.es_anticipo
      on conflict do nothing;
  end if;

  update separaciones
     set estado = 'entregada', venta_id = v_venta, entregada_en = now(), entregada_por = v_persona
   where id = s.id;
  return v_venta;
end;
$function$;


-- ---------------------------------------------------------------------------
-- registrar_devolucion_separacion — igual que en producción, con una nota de crédito por cada anticipo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION retail.registrar_devolucion_separacion(p_separacion_id uuid, p_medio text, p_operacion text DEFAULT NULL::text, p_cci text DEFAULT NULL::text, p_cuenta_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  s separaciones%rowtype;
  v_persona uuid;
  v_caja uuid;
  v_cm uuid;
  v_nc uuid;
  v_aviso text;
  v_op text := nullif(btrim(coalesce(p_operacion, '')), '');
  v_cci text := nullif(regexp_replace(coalesce(p_cci, ''), '\D', '', 'g'), '');
  v_ant comprobantes%rowtype;
begin
  if not fn_puede_gestionar_caja() then
    raise exception 'Solo una líder o la cuenta de ventas de la tienda puede registrar una devolución' using errcode = '42501';
  end if;
  if p_medio is null or p_medio not in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia') then
    raise exception 'Elige cómo se devolvió el adelanto';
  end if;
  select * into s from separaciones where id = p_separacion_id for update;
  if not found then raise exception 'Ese apartado no existe'; end if;
  if not fn_puede_operar_ubicacion(s.ubicacion_id) then
    raise exception 'No tienes permiso sobre los apartados de esa tienda';
  end if;
  if s.estado = 'abierta' then
    raise exception 'Primero libera el apartado %: las prendas siguen guardadas para la clienta', s.codigo;
  elsif s.estado <> 'liberada' then
    raise exception 'El apartado % no tiene devolución pendiente (está %)', s.codigo, s.estado;
  end if;
  if p_medio <> 'efectivo' and v_op is null then
    raise exception 'Anota el N.º de operación: es la prueba de que se le devolvió';
  end if;
  if p_medio = 'transferencia' and coalesce(v_cci, s.devolucion_cci) is null then
    raise exception 'Anota el CCI de la clienta (20 dígitos)';
  end if;
  if v_cci is not null and v_cci !~ '^[0-9]{20}$' then
    raise exception 'El CCI tiene 20 dígitos';
  end if;
  v_persona := retail.fn_actor_persona_id(true);

  if p_medio = 'efectivo' then
    select id into v_caja from cajas where ubicacion_id = s.ubicacion_id and estado = 'abierta';
    if v_caja is null then
      raise exception 'Para devolver en efectivo tiene que haber una caja abierta en la tienda';
    end if;
    insert into caja_movimientos (caja_id, tipo, monto, motivo, usuario_id, nota, separacion_id)
      values (v_caja, 'egreso', s.adelanto, 'Devolución de apartado ' || s.codigo, v_persona,
              'Adelanto devuelto a ' || s.clienta_nombres || ' ' || s.clienta_apellidos, s.id)
      returning id into v_cm;
  end if;

  -- Abonos (20260927100000): cada anticipo tiene su comprobante, así que cada uno lleva su nota de crédito. La del
  -- anticipo del apartado queda en `nota_credito_id`, como siempre; las de los abonos, ligadas por `separacion_id`.
  for v_ant in
    select * from comprobantes
     where (id = s.comprobante_anticipo_id or (separacion_id = s.id and es_anticipo))
     order by (id = s.comprobante_anticipo_id) desc, created_at
  loop
    declare
      v_una uuid;
    begin
      v_una := emitir_nota(v_ant.id, 'nota_credito', 'Anulación de la operación: apartado ' || s.codigo || ' no recogido',
                           v_ant.subtotal, v_ant.igv, v_ant.total, v_ant.items);
      update comprobantes set separacion_id = s.id where id = v_una;
      if v_ant.id = s.comprobante_anticipo_id then v_nc := v_una; end if;
    exception when others then
      v_aviso := coalesce(v_aviso || ' · ', '') || 'La nota de crédito queda pendiente (' || v_ant.serie || '-' || v_ant.numero || '): ' || sqlerrm;
    end;
  end loop;

  update separaciones
     set estado = 'devuelta', devuelta_en = now(), devuelta_por = v_persona, devolucion_medio_real = p_medio, devolucion_cuenta_id = case when p_medio <> 'efectivo' then p_cuenta_id end,
         devolucion_operacion = v_op, devolucion_caja_movimiento_id = v_cm, nota_credito_id = v_nc,
         devolucion_cci = case when p_medio = 'transferencia' and v_cci is not null and devolucion_medio = 'transferencia' then v_cci else devolucion_cci end
   where id = s.id;
  return jsonb_build_object('nota_credito_id', v_nc, 'aviso', v_aviso);
end;
$function$;
