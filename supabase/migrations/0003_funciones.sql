-- ============================================================================
-- 0003_funciones.sql — CAYLA V2
--
-- LA DECISIÓN DE auth.uid() vs. parámetro explícito (pedida por Felipe,
-- consistente, no mecánica):
--
--   auth.uid() SIEMPRE para "quién está llamando esta función ahora" — el
--   laboratorio usaba p_usuario_id porque no tenía sesión real; acá SÍ la
--   hay, y aceptar un p_usuario_id de quien llama sería dejar que cualquiera
--   diga ser cualquier otra persona (hueco de seguridad real, no teórico).
--   Por eso `fn_persona_actual()` reemplaza a p_usuario_id en TODAS las
--   funciones que en el laboratorio lo tenían.
--
--   Ningún caso de este esquema necesita el patrón contrario ("actuar en
--   nombre de otra persona" con un id explícito) — si aparece más adelante
--   (ej. un Líder registrando algo para otra persona), se agrega ahí, no
--   antes.
--
-- Las 4 funciones de seguridad de abajo (fn_es_lider, fn_persona_actual,
-- fn_ubicacion_actual_persona, fn_puede_operar_ubicacion) son el mismo
-- patrón EXACTO que ya prueba cayla-retail V1 en producción (ver
-- backups/cayla-v1/dump/retail-schema-only.sql) — security definer sobre
-- `personas`, para que la política RLS de `personas` no se llame a sí misma
-- en un ciclo infinito. No se reinventa, se preserva.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- seguridad: quién es quién ----------
create function retail.fn_persona_actual() returns retail.personas
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select * from personas where auth_user_id = auth.uid();
$$;

create function retail.fn_es_lider() returns boolean
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select coalesce((select rol = 'lider' from personas where auth_user_id = auth.uid()), false);
$$;

create function retail.fn_ubicacion_actual_persona() returns uuid
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select ubicacion_id from personas where auth_user_id = auth.uid();
$$;

-- NO es security definer, a propósito: solo compone las 2 funciones de
-- arriba, que ya rompen la recursión — agregar otra capa acá no protege
-- nada más y sería una superficie de permiso elevado sin motivo.
create function retail.fn_puede_operar_ubicacion(p_ubicacion_id uuid) returns boolean
language sql stable
set search_path = retail, public, extensions
as $$
  select fn_es_lider() or p_ubicacion_id = fn_ubicacion_actual_persona();
$$;

-- ---------- el motor: aplicar UN movimiento ya insertado ----------
create function retail.fn_aplicar_movimiento(p_movimiento_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  m movimientos%rowtype;
  v_actual integer;
begin
  select * into m from movimientos where id = p_movimiento_id;
  if not found then
    raise exception 'El movimiento % no existe', p_movimiento_id;
  end if;

  if m.tipo = 'entrada' then
    insert into stock (variante_id, ubicacion_id, cantidad)
      values (m.variante_id, m.ubicacion_id, m.cantidad)
      on conflict (variante_id, ubicacion_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, updated_at = now();

  elsif m.tipo = 'salida' then
    select cantidad into v_actual from stock
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
      for update;
    if v_actual is null or v_actual < m.cantidad then
      raise exception 'Stock insuficiente: hay % y se pide sacar %', coalesce(v_actual, 0), m.cantidad;
    end if;
    update stock set cantidad = cantidad - m.cantidad, updated_at = now()
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id;

  elsif m.tipo = 'ajuste' then
    insert into stock (variante_id, ubicacion_id, cantidad)
      values (m.variante_id, m.ubicacion_id, 0)
      on conflict (variante_id, ubicacion_id) do nothing;
    select cantidad into v_actual from stock
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
      for update;
    if v_actual + m.cantidad < 0 then
      raise exception 'El ajuste dejaría stock negativo: hay % y el ajuste es %', v_actual, m.cantidad;
    end if;
    update stock set cantidad = cantidad + m.cantidad, updated_at = now()
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id;

  elsif m.tipo = 'traslado' then
    if m.ubicacion_destino_id is null then
      raise exception 'Traslado requiere ubicacion_destino_id';
    end if;
    select cantidad into v_actual from stock
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
      for update;
    if v_actual is null or v_actual < m.cantidad then
      raise exception 'Stock insuficiente en origen: hay % y se pide trasladar %', coalesce(v_actual, 0), m.cantidad;
    end if;
    update stock set cantidad = cantidad - m.cantidad, updated_at = now()
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id;
    insert into stock (variante_id, ubicacion_id, cantidad)
      values (m.variante_id, m.ubicacion_destino_id, m.cantidad)
      on conflict (variante_id, ubicacion_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, updated_at = now();
  end if;
end;
$$;

create function retail.recalcular_stock()
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  delete from stock;
  insert into stock (variante_id, ubicacion_id, cantidad)
  select variante_id, ubicacion_id, sum(delta) from (
    select variante_id, ubicacion_id, cantidad as delta from movimientos where tipo = 'entrada'
    union all
    select variante_id, ubicacion_id, -cantidad from movimientos where tipo = 'salida'
    union all
    select variante_id, ubicacion_id, cantidad from movimientos where tipo = 'ajuste'
    union all
    select variante_id, ubicacion_id, -cantidad from movimientos where tipo = 'traslado'
    union all
    select variante_id, ubicacion_destino_id, cantidad from movimientos where tipo = 'traslado'
  ) t
  group by variante_id, ubicacion_id
  having sum(delta) <> 0;
end;
$$;

-- ---------- ajustes/entradas/salidas manuales sueltas ----------
create function retail.registrar_movimiento(
  p_variante_id uuid, p_ubicacion_id uuid, p_tipo text, p_cantidad integer,
  p_motivo text default null, p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_id uuid; v_persona uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para registrar movimientos en esa ubicación';
  end if;
  if p_tipo not in ('entrada', 'salida', 'ajuste') then
    raise exception 'registrar_movimiento es para entrada/salida/ajuste sueltos. Traslados van por transferir(), ventas por registrar_venta(), etc.';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, usuario_id, nota)
    values (p_variante_id, p_ubicacion_id, p_tipo, p_cantidad, p_motivo, v_persona, p_nota)
    returning id into v_id;
  perform fn_aplicar_movimiento(v_id);
  return v_id;
end;
$$;

-- ---------- recepción de mercadería ----------
create function retail.recibir_lote(
  p_ubicacion_id uuid, p_proveedor_id uuid, p_items jsonb,
  p_orden_compra_id uuid default null, p_numero_guia text default null, p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_lote_id uuid; v_item jsonb; v_mov_id uuid; v_persona uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para recibir mercadería en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Un lote necesita al menos un ítem';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into lotes (ubicacion_id, proveedor_id, orden_compra_id, numero_guia, recibido_por, nota)
    values (p_ubicacion_id, p_proveedor_id, p_orden_compra_id, p_numero_guia, v_persona, p_nota)
    returning id into v_lote_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, lote_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, 'entrada',
              (v_item ->> 'cantidad')::integer, 'recepcion', v_lote_id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);

    if (v_item ->> 'costo_unitario') is not null then
      update variantes set costo = (v_item ->> 'costo_unitario')::numeric
        where id = (v_item ->> 'variante_id')::uuid;
    end if;
  end loop;

  if p_orden_compra_id is not null then
    update ordenes_compra set estado = 'recibida' where id = p_orden_compra_id;
  end if;

  return v_lote_id;
end;
$$;

-- ---------- venta ----------
create function retail.registrar_venta(
  p_ubicacion_id uuid, p_items jsonb, p_metodo_pago text,
  p_cliente_id uuid default null, p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_venta_id uuid; v_existente ventas%rowtype; v_item jsonb;
  v_item_id uuid; v_mov_id uuid; v_costo numeric; v_persona uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para vender en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;

  if p_token is not null then
    select * into v_existente from ventas where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  begin
    insert into ventas (ubicacion_id, cliente_id, metodo_pago, usuario_id, token_cliente)
      values (p_ubicacion_id, p_cliente_id, p_metodo_pago, v_persona, p_token)
      returning id into v_venta_id;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select * into v_existente from ventas where token_cliente = p_token;
    if not found then raise; end if;
    return v_existente.id;
  end;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select costo into v_costo from variantes where id = (v_item ->> 'variante_id')::uuid;
    if v_costo is null then
      raise exception 'La variante % no existe', v_item ->> 'variante_id';
    end if;

    insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
      values (v_venta_id, (v_item ->> 'variante_id')::uuid, (v_item ->> 'cantidad')::integer,
              (v_item ->> 'precio_unitario')::numeric, coalesce((v_item ->> 'descuento_unitario')::numeric, 0), v_costo)
      returning id into v_item_id;

    insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, 'salida',
              (v_item ->> 'cantidad')::integer, 'venta', v_item_id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);
  end loop;

  return v_venta_id;
end;
$$;

-- ---------- transferencia entre ubicaciones ----------
create function retail.transferir(
  p_ubicacion_origen_id uuid, p_ubicacion_destino_id uuid, p_items jsonb, p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_transferencia_id uuid; v_item jsonb; v_item_id uuid; v_mov_id uuid; v_persona uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_origen_id) then
    raise exception 'No tienes permiso para transferir desde esa ubicación';
  end if;
  if p_ubicacion_origen_id = p_ubicacion_destino_id then
    raise exception 'Origen y destino no pueden ser la misma ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Una transferencia necesita al menos un ítem';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into transferencias (ubicacion_origen_id, ubicacion_destino_id, creado_por, nota)
    values (p_ubicacion_origen_id, p_ubicacion_destino_id, v_persona, p_nota)
    returning id into v_transferencia_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into transferencia_items (transferencia_id, variante_id, cantidad)
      values (v_transferencia_id, (v_item ->> 'variante_id')::uuid, (v_item ->> 'cantidad')::integer)
      returning id into v_item_id;

    insert into movimientos (variante_id, ubicacion_id, ubicacion_destino_id, tipo, cantidad, motivo, transferencia_item_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_origen_id, p_ubicacion_destino_id,
              'traslado', (v_item ->> 'cantidad')::integer, 'transferencia', v_item_id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);

    update transferencia_items set movimiento_id = v_mov_id where id = v_item_id;
  end loop;

  return v_transferencia_id;
end;
$$;

-- ---------- conteo físico ----------
create function retail.abrir_conteo(p_ubicacion_id uuid, p_sububicacion_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_id uuid; v_persona uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para contar en esa ubicación';
  end if;
  if exists (select 1 from conteos where ubicacion_id = p_ubicacion_id and estado = 'abierto') then
    raise exception 'Ya hay un conteo abierto en esta ubicación — ciérralo antes de abrir otro';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  insert into conteos (ubicacion_id, sububicacion_id, abierto_por)
    values (p_ubicacion_id, p_sububicacion_id, v_persona)
    returning id into v_id;
  return v_id;
end;
$$;

create function retail.conteo_contar(p_conteo_id uuid, p_variante_id uuid, p_cantidad_contada integer)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare c conteos%rowtype; v_sistema integer; v_item_id uuid;
begin
  select * into c from conteos where id = p_conteo_id for update;
  if not found then raise exception 'El conteo % no existe', p_conteo_id; end if;
  if c.estado <> 'abierto' then raise exception 'Ese conteo ya está %', c.estado; end if;
  if not fn_puede_operar_ubicacion(c.ubicacion_id) then
    raise exception 'No tienes permiso para contar en esa ubicación';
  end if;

  select coalesce(cantidad, 0) into v_sistema from stock
    where variante_id = p_variante_id and ubicacion_id = c.ubicacion_id;
  v_sistema := coalesce(v_sistema, 0);

  insert into conteo_items (conteo_id, variante_id, cantidad_sistema, cantidad_contada)
    values (p_conteo_id, p_variante_id, v_sistema, p_cantidad_contada)
    on conflict (conteo_id, variante_id) do update set cantidad_contada = excluded.cantidad_contada
    returning id into v_item_id;

  return v_item_id;
end;
$$;

create function retail.cerrar_conteo(p_conteo_id uuid)
returns table (lineas_ajustadas integer, unidades_sobrantes integer, unidades_faltantes integer)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c conteos%rowtype; r record; v_dif integer; v_mov_id uuid; v_persona uuid;
  v_ajustadas integer := 0; v_sobran integer := 0; v_faltan integer := 0;
begin
  select * into c from conteos where id = p_conteo_id for update;
  if not found then raise exception 'El conteo % no existe', p_conteo_id; end if;
  if c.estado <> 'abierto' then raise exception 'Ese conteo ya está %', c.estado; end if;
  if not fn_es_lider() then
    raise exception 'Solo un líder puede cerrar un conteo — es la aprobación de lo contado';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();

  for r in select * from conteo_items where conteo_id = p_conteo_id and diferencia is null loop
    v_dif := r.cantidad_contada - r.cantidad_sistema;
    v_mov_id := null;
    if v_dif <> 0 then
      insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, conteo_item_id, usuario_id)
        values (r.variante_id, c.ubicacion_id, 'ajuste', v_dif, 'conteo', r.id, v_persona)
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
      v_ajustadas := v_ajustadas + 1;
      if v_dif > 0 then v_sobran := v_sobran + v_dif; else v_faltan := v_faltan - v_dif; end if;
    end if;
    update conteo_items set diferencia = v_dif, movimiento_id = v_mov_id where id = r.id;
  end loop;

  update conteos set estado = 'cerrado', cerrado_en = now(), cerrado_por = v_persona where id = p_conteo_id;

  return query select v_ajustadas, v_sobran, v_faltan;
end;
$$;

-- ---------- devoluciones ----------
create function retail.crear_devolucion(
  p_venta_id uuid, p_ubicacion_id uuid, p_items jsonb, p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_devolucion_id uuid; v_item jsonb; v_venta_item venta_items%rowtype;
  v_ya_devuelto integer; v_persona uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para registrar devoluciones en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Una devolución necesita al menos un ítem';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into devoluciones (venta_id, ubicacion_id, motivo, solicitado_por)
    values (p_venta_id, p_ubicacion_id, p_motivo, v_persona)
    returning id into v_devolucion_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_venta_item from venta_items
      where id = (v_item ->> 'venta_item_id')::uuid and venta_id = p_venta_id;
    if not found then
      raise exception 'El ítem % no pertenece a la venta %', v_item ->> 'venta_item_id', p_venta_id;
    end if;

    select coalesce(sum(di.cantidad), 0) into v_ya_devuelto
      from devolucion_items di join devoluciones d on d.id = di.devolucion_id
      where di.venta_item_id = v_venta_item.id and d.estado <> 'rechazada';

    if v_ya_devuelto + (v_item ->> 'cantidad')::integer > v_venta_item.cantidad then
      raise exception 'Se pide devolver % pero la línea vendió % y ya se devolvieron %',
        (v_item ->> 'cantidad')::integer, v_venta_item.cantidad, v_ya_devuelto;
    end if;

    insert into devolucion_items (devolucion_id, venta_item_id, cantidad, condicion)
      values (v_devolucion_id, v_venta_item.id, (v_item ->> 'cantidad')::integer, v_item ->> 'condicion');
  end loop;

  return v_devolucion_id;
end;
$$;

create function retail.aprobar_devolucion(
  p_devolucion_id uuid, p_reembolso_monto numeric default null, p_reembolso_metodo text default null
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare d devoluciones%rowtype; r record; v_mov_id uuid; v_persona uuid;
begin
  select * into d from devoluciones where id = p_devolucion_id for update;
  if not found then raise exception 'La devolución % no existe', p_devolucion_id; end if;
  if d.estado <> 'pendiente' then raise exception 'Esa devolución ya está %', d.estado; end if;
  if not fn_es_lider() then
    raise exception 'Solo un líder puede aprobar una devolución';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();

  for r in select * from devolucion_items where devolucion_id = p_devolucion_id loop
    if r.condicion = 'vendible' then
      insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, devolucion_item_id, usuario_id)
        select vi.variante_id, d.ubicacion_id, 'entrada', r.cantidad, 'devolucion', r.id, v_persona
        from venta_items vi where vi.id = r.venta_item_id
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
      update devolucion_items set movimiento_id = v_mov_id where id = r.id;
    end if;
  end loop;

  update devoluciones set estado = 'aprobada', aprobado_por = v_persona, aprobado_en = now(),
                          reembolso_monto = p_reembolso_monto, reembolso_metodo = p_reembolso_metodo
    where id = p_devolucion_id;
end;
$$;

create function retail.rechazar_devolucion(p_devolucion_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_persona uuid;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede rechazar una devolución';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  update devoluciones set estado = 'rechazada', aprobado_por = v_persona, aprobado_en = now(),
                          motivo = concat_ws(' · ', motivo, 'rechazada: ' || coalesce(p_motivo, 'sin detalle'))
    where id = p_devolucion_id and estado = 'pendiente';
  if not found then
    raise exception 'La devolución % no existe o ya no está pendiente', p_devolucion_id;
  end if;
end;
$$;

-- ---------- catálogo: alta directa (sin RPC, cubierto por RLS lider-only) ----------
-- productos/variantes/colores/categorias/proveedores/clientes se crean con
-- INSERT directo desde el cliente — igual que ComprasManager/Proveedores en
-- V1 (ARQUITECTURA.md: "escribe directo, sin RPC"), protegido por policies,
-- no por una función. No se sobredimensiona con una RPC para cada alta
-- simple que no mueve stock ni dinero.
