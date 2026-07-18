-- Las funciones del servidor validan la sede de quien las llama. Aplicada en Supabase el
-- 2026-07-18, aprobada por Felipe.
--
-- QUÉ ARREGLA (Decisión 3 del checklist): 5 funciones del servidor corren con permisos
-- elevados (security definer) y antes confiaban en que el cliente mandara la sede
-- correcta. La pantalla siempre la manda bien, pero alguien con acceso y algo de técnica
-- podía, por API directa, mover stock o cajas de OTRA sede. Ahora cada función aplica el
-- mismo criterio que las reglas de las tablas: "eres Líder, o eres de esta sede (o de su
-- almacén asociado). Si no, error". No cambia nada en el uso normal — es defensa en
-- profundidad. Cumple lo que 0003_rls.sql ya prometía: roles validados en el servidor.

-- ==================== Helper: ¿el que llama puede operar sobre esta sede? ====================
-- Líder puede sobre cualquier sede. Un integrante puede sobre su propia sede, y sobre el
-- almacén asociado a su tienda (para recibir mercadería y bajar al piso).
create or replace function fn_puede_operar_sede(p_sede_id uuid)
returns boolean
language sql stable
set search_path = public
as $$
  select fn_es_lider()
    or p_sede_id = fn_sede_actual_persona()
    or exists (
      select 1 from sedes
      where id = p_sede_id and tienda_asociada_id = fn_sede_actual_persona()
    );
$$;

-- ==================== registrar_movimiento (base: 0008) ====================
create or replace function registrar_movimiento(
  p_variante_id uuid,
  p_sede_id uuid,
  p_tipo text,
  p_cantidad integer,
  p_motivo text default null,
  p_canal text default null,
  p_sede_destino_id uuid default null,
  p_monto numeric default null,
  p_venta_id uuid default null,
  p_nota text default null,
  p_contenedor_id uuid default null,
  p_lote_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_persona_id uuid;
begin
  if not fn_puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para registrar movimientos en esa sede';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into movimientos (
    variante_id, sede_id, tipo, cantidad, motivo, canal, sede_destino_id, monto,
    venta_id, usuario_id, nota, contenedor_id, lote_id
  )
    values (
      p_variante_id, p_sede_id, p_tipo, p_cantidad, p_motivo, p_canal, p_sede_destino_id,
      p_monto, p_venta_id, v_persona_id, p_nota, p_contenedor_id, p_lote_id
    )
    returning id into v_id;

  perform fn_aplicar_movimiento(v_id);
  return v_id;
end;
$$;

-- ==================== abrir_caja (base: 0007) ====================
create or replace function abrir_caja(p_sede_id uuid, p_monto_apertura numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
  v_caja_id uuid;
begin
  if not fn_puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para abrir caja en esa sede';
  end if;

  if exists (select 1 from cajas where sede_id = p_sede_id and estado = 'abierta') then
    raise exception 'Ya hay una caja abierta en esta sede — ciérrala antes de abrir otra';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into cajas (sede_id, monto_apertura, abierta_por)
    values (p_sede_id, p_monto_apertura, v_persona_id)
    returning id into v_caja_id;

  return v_caja_id;
end;
$$;

-- ==================== registrar_venta (base: 0007) ====================
create or replace function registrar_venta(
  p_caja_id uuid,
  p_metodo_pago text,
  p_items jsonb,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caja cajas%rowtype;
  v_persona_id uuid;
  v_venta_id uuid;
  v_movimiento_id uuid;
  v_monto_total numeric := 0;
  v_linea_total numeric;
  v_item jsonb;
begin
  select * into v_caja from cajas where id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id;
  end if;
  if not fn_puede_operar_sede(v_caja.sede_id) then
    raise exception 'No tienes permiso para vender en esa caja';
  end if;
  if v_caja.estado <> 'abierta' then
    raise exception 'Esta caja ya está cerrada — no se pueden registrar más ventas ahí';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_monto_total := v_monto_total + (v_item ->> 'monto')::numeric * (v_item ->> 'cantidad')::numeric;
  end loop;

  insert into ventas (sede_id, caja_id, metodo_pago, monto_total, usuario_id, nota)
    values (v_caja.sede_id, p_caja_id, p_metodo_pago, v_monto_total, v_persona_id, p_nota)
    returning id into v_venta_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_linea_total := (v_item ->> 'monto')::numeric * (v_item ->> 'cantidad')::numeric;
    insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, canal, monto, venta_id, usuario_id)
      values (
        (v_item ->> 'variante_id')::uuid, v_caja.sede_id, 'salida',
        (v_item ->> 'cantidad')::integer, 'venta', 'tienda', v_linea_total, v_venta_id, v_persona_id
      )
      returning id into v_movimiento_id;
    perform fn_aplicar_movimiento(v_movimiento_id);
  end loop;

  return v_venta_id;
end;
$$;

-- ==================== cerrar_caja (base: 0007) ====================
create or replace function cerrar_caja(p_caja_id uuid, p_monto_contado numeric)
returns table (monto_esperado numeric, monto_contado numeric, diferencia numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
  v_caja cajas%rowtype;
  v_esperado numeric;
begin
  select * into v_caja from cajas where id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id;
  end if;
  if not fn_puede_operar_sede(v_caja.sede_id) then
    raise exception 'No tienes permiso para cerrar esa caja';
  end if;
  if v_caja.estado <> 'abierta' then
    raise exception 'Esta caja ya está cerrada';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  -- Solo el efectivo mueve el cajón físico; POS/Yape/Transferencia no afectan el conteo.
  select v_caja.monto_apertura + coalesce(sum(monto_total), 0) into v_esperado
    from ventas where caja_id = p_caja_id and metodo_pago = 'efectivo';

  update cajas set
    monto_cierre_contado = p_monto_contado,
    monto_cierre_esperado = v_esperado,
    diferencia = p_monto_contado - v_esperado,
    cerrada_por = v_persona_id,
    cerrada_en = now(),
    estado = 'cerrada'
  where id = p_caja_id;

  return query select v_esperado, p_monto_contado, p_monto_contado - v_esperado;
end;
$$;

-- ==================== recibir_lote (base: 0009) ====================
create or replace function recibir_lote(
  p_sede_id uuid,
  p_origen text,
  p_items jsonb,
  p_proveedor text default null,
  p_numero_guia text default null,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
  v_lote_id uuid;
  v_item jsonb;
  v_variante_id uuid;
  v_producto_id uuid;
  v_movimiento_id uuid;
  v_contenedor_id uuid;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El lote no tiene ítems';
  end if;
  if not fn_puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para recibir mercadería en ese almacén';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into lotes (sede_id, origen, proveedor, numero_guia, recibido_por, nota)
    values (p_sede_id, p_origen, p_proveedor, p_numero_guia, v_persona_id, p_nota)
    returning id into v_lote_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item ->> 'variante_id') is not null then
      v_variante_id := (v_item ->> 'variante_id')::uuid;
    else
      if (v_item ->> 'producto_id') is not null then
        v_producto_id := (v_item ->> 'producto_id')::uuid;
      else
        insert into productos (sku_padre, referencia, categoria_id, genero, marca, temporada)
          values (
            v_item ->> 'sku_padre', v_item ->> 'referencia',
            case when (v_item ->> 'categoria_id') is not null then (v_item ->> 'categoria_id')::uuid else null end,
            v_item ->> 'genero', v_item ->> 'marca', v_item ->> 'temporada'
          )
          returning id into v_producto_id;
      end if;

      insert into variantes (producto_id, sku, talla, color, costo, precio, stock_minimo)
        values (
          v_producto_id, v_item ->> 'sku', v_item ->> 'talla', v_item ->> 'color',
          coalesce((v_item ->> 'costo')::numeric, 0), coalesce((v_item ->> 'precio')::numeric, 0),
          coalesce((v_item ->> 'stock_minimo')::integer, 0)
        )
        returning id into v_variante_id;
    end if;

    v_contenedor_id := case when (v_item ->> 'contenedor_id') is not null
      then (v_item ->> 'contenedor_id')::uuid else null end;

    insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, lote_id, contenedor_id)
      values (
        v_variante_id, p_sede_id, 'entrada', (v_item ->> 'cantidad')::integer,
        'ingreso de lote', v_persona_id, v_lote_id, v_contenedor_id
      )
      returning id into v_movimiento_id;
    perform fn_aplicar_movimiento(v_movimiento_id);
  end loop;

  return v_lote_id;
end;
$$;
