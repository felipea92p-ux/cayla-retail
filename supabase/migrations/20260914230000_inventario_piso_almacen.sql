-- ============================================================================
-- INVENTARIO: PISO DE VENTA vs. ALMACÉN DE TIENDA (ADR-0044)
--
-- `retail.sububicaciones` ya existía (Taller tiene "Rack A"/"Rack B") y
-- `movimientos`/`conteos` ya tenían `sububicacion_id` opcional desde el primer
-- diseño de V2 — pero `stock`, la tabla que de verdad importa, nunca ganó esa
-- columna, y `fn_aplicar_movimiento` la ignoraba por completo. Esta migración
-- es ese "después" que el propio código dejaba anunciado.
--
-- V1 (reemplazada 2026-09-12) tuvo esta misma feature y tuvo bugs reales
-- (ADR-0031): una reconstrucción de stock que "olvidó" el almacén y duplicó
-- mercadería, y un traslado hacia almacén que restó del piso sin sumar en
-- ningún lado. Por eso cada función que toca `stock` se revisa una por una
-- abajo, no solo la que aplica el movimiento.
-- ============================================================================

-- ---------- 1. stock gana sububicación, con clave NULL-segura ----------
-- `unique nulls not distinct` (PG15+, local es 17.6) en vez de un UUID
-- centinela: Taller va a tener `sububicacion_id = null` de forma permanente
-- (no usa piso/almacén), y `on conflict` necesita que ese NULL cuente como
-- la MISMA clave cada vez — con un `unique` normal, dos NULLs nunca
-- "empatan" para el arbiter y cada entrada insertaría una fila nueva en vez
-- de acumular.
alter table retail.stock add column sububicacion_id uuid;
alter table retail.stock drop constraint stock_pkey;
alter table retail.stock add constraint stock_variante_ubicacion_sububicacion_key
  unique nulls not distinct (variante_id, ubicacion_id, sububicacion_id);

-- ---------- 2. integridad: la sububicación tiene que ser de esa ubicación ----------
-- Sin esto, nada impide que un movimiento en Tienda Lima cargue una
-- sububicación de Taller — crearía una fila de stock fantasma sin ningún
-- error. FK compuesto: si `sububicacion_id` es NULL, Postgres no evalúa el
-- FK (no afecta a ubicaciones sin sububicaciones). Reemplaza a la FK simple
-- de `sububicacion_id` (en `movimientos`/`conteos`, puesta desde 0002; en
-- `stock`, la que acabamos de crear arriba) en vez de sumarse a ella: dos
-- FKs sobre la misma columna hacia la misma tabla dejan a PostgREST sin
-- poder elegir una para el embed (`sububicacion:sububicaciones(...)`) —
-- "more than one relationship was found". Una FK compuesta ya implica la
-- simple (si el par es válido, `sububicacion_id` por sí solo también lo es).
alter table retail.sububicaciones add constraint sububicaciones_id_ubicacion_unique
  unique (id, ubicacion_id);

alter table retail.stock add constraint stock_sububicacion_pertenece_fk
  foreign key (sububicacion_id, ubicacion_id) references retail.sububicaciones (id, ubicacion_id);

alter table retail.movimientos
  drop constraint movimientos_sububicacion_id_fkey,
  drop constraint movimientos_sububicacion_destino_id_fkey,
  add constraint movimientos_sububicacion_pertenece_fk
    foreign key (sububicacion_id, ubicacion_id) references retail.sububicaciones (id, ubicacion_id),
  add constraint movimientos_sububicacion_destino_pertenece_fk
    foreign key (sububicacion_destino_id, ubicacion_destino_id) references retail.sububicaciones (id, ubicacion_id);

alter table retail.conteos
  drop constraint conteos_sububicacion_id_fkey,
  add constraint conteos_sububicacion_pertenece_fk
    foreign key (sububicacion_id, ubicacion_id) references retail.sububicaciones (id, ubicacion_id);

-- ---------- 3. a lo sumo una sububicación de cada tipo lógico por ubicación ----------
-- `tipo` sigue siendo texto libre (Taller y sus racks quedan sin tocar) —
-- este índice solo evita ambigüedad en los dos tipos que si tienen
-- significado para el motor: sin él, "la sububicación de tipo piso_venta"
-- con dos candidatas elegiría una al azar sin avisar (PL/pgSQL sin STRICT).
create unique index sububicaciones_tipo_unico_por_ubicacion
  on retail.sububicaciones (ubicacion_id, tipo)
  where tipo in ('piso_venta', 'almacen_tienda');

-- ---------- 4. resolución de sububicación por defecto ----------
-- Se llama ANTES de insertar el movimiento (no dentro de fn_aplicar_movimiento,
-- que se mantiene mecánico) — así `movimientos.sububicacion_id` es siempre la
-- verdad física real en el momento de auditar, no algo que el motor adivina
-- después. Tokens separados aunque 3 de los 4 resuelvan igual hoy: un cambio
-- futuro en uno no debe arrastrar a los otros sin querer.
create function retail.fn_sububicacion_por_defecto(p_ubicacion_id uuid, p_uso text)
returns uuid
language sql stable
set search_path = retail, public, extensions
as $$
  select id from sububicaciones
  where ubicacion_id = p_ubicacion_id
    and tipo = case p_uso
      when 'venta' then 'piso_venta'
      when 'entrada' then 'almacen_tienda'
      when 'traslado_salida' then 'almacen_tienda'
      when 'traslado_entrada' then 'almacen_tienda'
    end;
$$;
grant execute on function retail.fn_sububicacion_por_defecto to authenticated;

-- ---------- 5. el motor: aplicar UN movimiento, ahora consciente de sububicación ----------
create or replace function retail.fn_aplicar_movimiento(p_movimiento_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  m movimientos%rowtype;
  v_actual integer;
  v_ubic_a uuid; v_sub_a uuid; v_ubic_b uuid; v_sub_b uuid;
begin
  select * into m from movimientos where id = p_movimiento_id;
  if not found then
    raise exception 'El movimiento % no existe', p_movimiento_id;
  end if;

  if m.tipo = 'entrada' then
    insert into stock (variante_id, ubicacion_id, sububicacion_id, cantidad)
      values (m.variante_id, m.ubicacion_id, m.sububicacion_id, m.cantidad)
      on conflict (variante_id, ubicacion_id, sububicacion_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, updated_at = now();

  elsif m.tipo = 'salida' then
    -- `sububicacion_id is not distinct from` en vez de `=`: con `=`, la
    -- primera salida en una ubicación sin sububicaciones (sububicacion_id
    -- NULL en ambos lados) fallaría con "stock insuficiente: hay 0" aunque
    -- el stock exista — `NULL = NULL` nunca es verdadero en SQL.
    select cantidad into v_actual from stock
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id
      for update;
    if v_actual is null or v_actual < m.cantidad then
      raise exception 'Stock insuficiente: hay % y se pide sacar %', coalesce(v_actual, 0), m.cantidad;
    end if;
    update stock set cantidad = cantidad - m.cantidad, updated_at = now()
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id;

  elsif m.tipo = 'ajuste' then
    insert into stock (variante_id, ubicacion_id, sububicacion_id, cantidad)
      values (m.variante_id, m.ubicacion_id, m.sububicacion_id, 0)
      on conflict (variante_id, ubicacion_id, sububicacion_id) do nothing;
    select cantidad into v_actual from stock
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id
      for update;
    if v_actual + m.cantidad < 0 then
      raise exception 'El ajuste dejaría stock negativo: hay % y el ajuste es %', v_actual, m.cantidad;
    end if;
    update stock set cantidad = cantidad + m.cantidad, updated_at = now()
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id;

  elsif m.tipo = 'traslado' then
    if m.ubicacion_destino_id is null then
      raise exception 'Traslado requiere ubicacion_destino_id';
    end if;

    -- Bloquea origen y destino siempre en el mismo orden relativo (no
    -- "origen primero, destino después" literal): la reposición interna va
    -- a ser mucho más frecuente que las transferencias entre sedes, y sin
    -- un orden determinístico, dos movimientos en sentidos opuestos entre
    -- las mismas dos sububicaciones podrían formar un ciclo de espera real.
    if (m.ubicacion_id, coalesce(m.sububicacion_id, '00000000-0000-0000-0000-000000000000'))
       <= (m.ubicacion_destino_id, coalesce(m.sububicacion_destino_id, '00000000-0000-0000-0000-000000000000'))
    then
      v_ubic_a := m.ubicacion_id; v_sub_a := m.sububicacion_id;
      v_ubic_b := m.ubicacion_destino_id; v_sub_b := m.sububicacion_destino_id;
    else
      v_ubic_a := m.ubicacion_destino_id; v_sub_a := m.sububicacion_destino_id;
      v_ubic_b := m.ubicacion_id; v_sub_b := m.sububicacion_id;
    end if;
    perform 1 from stock where variante_id = m.variante_id and ubicacion_id = v_ubic_a
      and sububicacion_id is not distinct from v_sub_a for update;
    perform 1 from stock where variante_id = m.variante_id and ubicacion_id = v_ubic_b
      and sububicacion_id is not distinct from v_sub_b for update;

    select cantidad into v_actual from stock
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id;
    if v_actual is null or v_actual < m.cantidad then
      raise exception 'Stock insuficiente en origen: hay % y se pide trasladar %', coalesce(v_actual, 0), m.cantidad;
    end if;
    update stock set cantidad = cantidad - m.cantidad, updated_at = now()
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id;
    insert into stock (variante_id, ubicacion_id, sububicacion_id, cantidad)
      values (m.variante_id, m.ubicacion_destino_id, m.sububicacion_destino_id, m.cantidad)
      on conflict (variante_id, ubicacion_id, sububicacion_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, updated_at = now();
  end if;
end;
$$;

-- ---------- 6. reconstrucción completa, misma dimensión nueva ----------
create or replace function retail.recalcular_stock()
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  delete from stock;
  insert into stock (variante_id, ubicacion_id, sububicacion_id, cantidad)
  select variante_id, ubicacion_id, sububicacion_id, sum(delta) from (
    select variante_id, ubicacion_id, sububicacion_id, cantidad as delta from movimientos where tipo = 'entrada'
    union all
    select variante_id, ubicacion_id, sububicacion_id, -cantidad from movimientos where tipo = 'salida'
    union all
    select variante_id, ubicacion_id, sububicacion_id, cantidad from movimientos where tipo = 'ajuste'
    union all
    select variante_id, ubicacion_id, sububicacion_id, -cantidad from movimientos where tipo = 'traslado'
    union all
    select variante_id, ubicacion_destino_id, sububicacion_destino_id, cantidad from movimientos where tipo = 'traslado'
  ) t
  group by variante_id, ubicacion_id, sububicacion_id
  having sum(delta) <> 0;
end;
$$;

-- ---------- 7. ajustes/entradas/salidas manuales sueltas ----------
create or replace function retail.registrar_movimiento(
  p_variante_id uuid, p_ubicacion_id uuid, p_tipo text, p_cantidad integer,
  p_motivo text default null, p_nota text default null, p_sububicacion_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_id uuid; v_persona uuid; v_sub uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para registrar movimientos en esa ubicación';
  end if;
  if p_tipo not in ('entrada', 'salida', 'ajuste') then
    raise exception 'registrar_movimiento es para entrada/salida/ajuste sueltos. Traslados van por transferir()/mover_interno(), ventas por registrar_venta(), etc.';
  end if;
  -- un ajuste sin sububicación explícita, en una ubicación que separa
  -- piso/almacén, no tiene un default seguro: correspondería a una fila que
  -- ya no existe ahí (todo el stock vive bajo piso_venta/almacen_tienda) —
  -- mejor exigir la decisión que adivinar mal.
  if p_tipo = 'ajuste' and p_sububicacion_id is null and exists (
    select 1 from sububicaciones where ubicacion_id = p_ubicacion_id and tipo in ('piso_venta', 'almacen_tienda')
  ) then
    raise exception 'Esta ubicación separa piso y almacén — indica a cuál corresponde el ajuste';
  end if;
  v_sub := coalesce(p_sububicacion_id,
    case p_tipo
      when 'entrada' then fn_sububicacion_por_defecto(p_ubicacion_id, 'entrada')
      when 'salida' then fn_sububicacion_por_defecto(p_ubicacion_id, 'venta')
    end);
  select id into v_persona from personas where auth_user_id = auth.uid();
  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, nota)
    values (p_variante_id, p_ubicacion_id, v_sub, p_tipo, p_cantidad, p_motivo, v_persona, p_nota)
    returning id into v_id;
  perform fn_aplicar_movimiento(v_id);
  return v_id;
end;
$$;

-- ---------- 8. recepción de mercadería suelta (sin factura) ----------
-- Entra al almacén de tienda, nunca directo al piso — quien recibe
-- mercadería no necesita saber que existe esa distinción.
create or replace function retail.recibir_lote(
  p_ubicacion_id uuid, p_proveedor_id uuid, p_items jsonb,
  p_numero_guia text default null, p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_lote_id uuid; v_item jsonb; v_mov_id uuid; v_persona uuid; v_sub uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para recibir mercadería en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Un lote necesita al menos un ítem';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'entrada');

  insert into lotes (ubicacion_id, proveedor_id, numero_guia, recibido_por, nota)
    values (p_ubicacion_id, p_proveedor_id, p_numero_guia, v_persona, p_nota)
    returning id into v_lote_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, lote_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, v_sub, 'entrada',
              (v_item ->> 'cantidad')::integer, 'recepcion', v_lote_id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);

    if (v_item ->> 'costo_unitario') is not null then
      update variantes set costo = (v_item ->> 'costo_unitario')::numeric
        where id = (v_item ->> 'variante_id')::uuid;
    end if;
  end loop;

  return v_lote_id;
end;
$$;

-- ---------- 9. recepción de mercadería contra una factura de compra ----------
create or replace function retail.recibir_compras(
  p_ubicacion_id uuid,
  p_items jsonb,                       -- [{compra_item_id, variante_id, cantidad}]
  p_numero_guia text default null,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_lote_id uuid; v_persona uuid; v_item jsonb; v_mov_id uuid; v_sub uuid;
  v_linea compra_items%rowtype; v_compra compras%rowtype;
  v_proveedor uuid; v_recibido integer; v_cantidad integer;
  v_agregado jsonb;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para recibir mercadería en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Una recepción necesita al menos un ítem';
  end if;

  for v_agregado in
    select jsonb_build_object('compra_item_id', i ->> 'compra_item_id', 'cantidad', sum((i ->> 'cantidad')::integer))
    from jsonb_array_elements(p_items) i
    group by i ->> 'compra_item_id'
  loop
    select * into v_linea from compra_items where id = (v_agregado ->> 'compra_item_id')::uuid for update;
    if not found then
      raise exception 'La línea de factura % no existe', v_agregado ->> 'compra_item_id';
    end if;
    select * into v_compra from compras where id = v_linea.compra_id;
    if v_compra.estado <> 'vigente' then
      raise exception 'La factura %-% está anulada', v_compra.serie, v_compra.numero;
    end if;
    if v_proveedor is null then
      v_proveedor := v_compra.proveedor_id;
    elsif v_proveedor <> v_compra.proveedor_id then
      raise exception 'Una recepción cubre facturas de un solo proveedor';
    end if;

    select coalesce(sum(cantidad), 0) into v_recibido from movimientos where compra_item_id = v_linea.id;
    v_cantidad := (v_agregado ->> 'cantidad')::integer;
    if v_cantidad <= 0 then
      raise exception 'La cantidad recibida debe ser mayor a cero';
    end if;
    if v_recibido + v_cantidad > v_linea.cantidad then
      raise exception 'Factura %-%: la línea tiene % facturados, % ya recibidos y se intenta recibir % más',
        v_compra.serie, v_compra.numero, v_linea.cantidad, v_recibido, v_cantidad;
    end if;
  end loop;

  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'entrada');

  insert into lotes (ubicacion_id, proveedor_id, numero_guia, recibido_por, nota)
    values (p_ubicacion_id, v_proveedor, p_numero_guia, v_persona, p_nota)
    returning id into v_lote_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_linea from compra_items where id = (v_item ->> 'compra_item_id')::uuid;

    if v_linea.variante_id is not null and v_linea.variante_id <> (v_item ->> 'variante_id')::uuid then
      raise exception 'La línea de factura ya especifica una variante distinta a la recibida';
    end if;
    if not exists (
      select 1 from variantes where id = (v_item ->> 'variante_id')::uuid and producto_id = v_linea.producto_id
    ) then
      raise exception 'La variante recibida no pertenece al producto de la línea de factura';
    end if;

    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, lote_id, compra_item_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, v_sub, 'entrada',
              (v_item ->> 'cantidad')::integer, 'recepcion', v_lote_id, v_linea.id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);

    update variantes set costo = v_linea.costo_unitario where id = (v_item ->> 'variante_id')::uuid;
  end loop;

  return v_lote_id;
end;
$$;

-- ---------- 10. venta: descuenta el piso, nunca el almacén en silencio ----------
create or replace function retail.registrar_venta(
  p_ubicacion_id uuid, p_items jsonb, p_pagos jsonb,
  p_cliente_id uuid default null, p_token uuid default null,
  p_tipo_comprobante text default null,
  p_cliente_tipo_doc text default 'sin_documento',
  p_cliente_num_doc text default null,
  p_cliente_nombre text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_venta_id uuid; v_existente ventas%rowtype; v_item jsonb; v_pago jsonb;
  v_item_id uuid; v_mov_id uuid; v_costo numeric; v_persona uuid; v_sub uuid;
  v_caja_id uuid;
  v_total_items numeric := 0;
  v_total_pagos numeric := 0;
  v_igv numeric;
  v_subtotal numeric;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para vender en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;
  if p_pagos is null or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Falta indicar cómo se pagó la venta';
  end if;
  if p_tipo_comprobante is not null and p_tipo_comprobante not in ('boleta', 'factura') then
    raise exception 'Una venta solo puede facturarse como boleta o factura (se pidió %)', p_tipo_comprobante;
  end if;

  if p_token is not null then
    select * into v_existente from ventas where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;

  select id into v_caja_id from cajas where ubicacion_id = p_ubicacion_id and estado = 'abierta';
  if v_caja_id is null then
    raise exception 'No hay una caja abierta en esta ubicación — ábrela antes de registrar una venta';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'venta');

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_total_items := v_total_items +
      (((v_item ->> 'precio_unitario')::numeric - coalesce((v_item ->> 'descuento_unitario')::numeric, 0))
        * (v_item ->> 'cantidad')::integer);
  end loop;
  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    v_total_pagos := v_total_pagos + (v_pago ->> 'monto')::numeric;
  end loop;
  if round(v_total_items, 2) <> round(v_total_pagos, 2) then
    raise exception 'Los pagos (S/%) no cuadran con el total de la venta (S/%)', v_total_pagos, v_total_items;
  end if;

  begin
    insert into ventas (ubicacion_id, cliente_id, caja_id, usuario_id, token_cliente)
      values (p_ubicacion_id, p_cliente_id, v_caja_id, v_persona, p_token)
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

    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, v_sub, 'salida',
              (v_item ->> 'cantidad')::integer, 'venta', v_item_id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);
  end loop;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    insert into venta_pagos (venta_id, metodo, monto)
      values (v_venta_id, v_pago ->> 'metodo', (v_pago ->> 'monto')::numeric);
  end loop;

  if p_tipo_comprobante is not null then
    v_igv := round((v_total_items - v_total_items / 1.18) * 100) / 100;
    v_subtotal := round((v_total_items - v_igv) * 100) / 100;
    perform emitir_comprobante(
      p_ubicacion_id, p_tipo_comprobante, v_subtotal, v_igv, v_total_items,
      v_venta_id, p_cliente_tipo_doc, p_cliente_num_doc, p_cliente_nombre, p_items
    );
  end if;

  return v_venta_id;
end;
$$;

-- ---------- 11. cambio de prenda: siempre en el piso, es el mostrador ----------
-- "La prenda vieja regresa al stock (siempre vendible)" ya era el criterio
-- original de este archivo — eso significa piso, no almacén: un cambio es
-- una operación de mostrador, nunca pasa por la trastienda.
create or replace function retail.registrar_cambio(
  p_venta_item_id uuid, p_ubicacion_id uuid, p_variante_nueva_id uuid,
  p_cantidad integer default 1, p_metodo_pago_diferencia text default null,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_item venta_items%rowtype;
  v_precio_nuevo numeric;
  v_cambio_id uuid; v_existente cambios%rowtype;
  v_ya_cambiado integer;
  v_diferencia numeric;
  v_persona uuid; v_sub uuid;
  v_mov_entrada uuid; v_mov_salida uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para hacer cambios en esa ubicación';
  end if;
  if p_cantidad <= 0 then
    raise exception 'La cantidad del cambio debe ser mayor que cero';
  end if;

  if p_token is not null then
    select * into v_existente from cambios where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;

  select * into v_item from venta_items where id = p_venta_item_id;
  if not found then
    raise exception 'La línea de venta % no existe', p_venta_item_id;
  end if;

  select coalesce(sum(cantidad), 0) into v_ya_cambiado from cambios where venta_item_id = p_venta_item_id;
  if v_ya_cambiado + p_cantidad > v_item.cantidad then
    raise exception 'Ya se cambiaron % de % unidades compradas en esa línea — no puedes cambiar %',
      v_ya_cambiado, v_item.cantidad, p_cantidad;
  end if;

  select precio into v_precio_nuevo from variantes where id = p_variante_nueva_id;
  if v_precio_nuevo is null then
    raise exception 'La variante % no existe', p_variante_nueva_id;
  end if;

  v_diferencia := (v_precio_nuevo - v_item.precio_unitario) * p_cantidad;
  if v_diferencia <> 0 and p_metodo_pago_diferencia is null then
    raise exception 'Hay una diferencia de S/% — indica cómo se cobra o se devuelve', v_diferencia;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'venta');

  begin
    insert into cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia, metodo_pago_diferencia, usuario_id, token_cliente)
      values (p_venta_item_id, p_ubicacion_id, p_variante_nueva_id, p_cantidad, v_diferencia, p_metodo_pago_diferencia, v_persona, p_token)
      returning id into v_cambio_id;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select * into v_existente from cambios where token_cliente = p_token;
    if not found then raise; end if;
    return v_existente.id;
  end;

  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, cambio_id, usuario_id)
    values (v_item.variante_id, p_ubicacion_id, v_sub, 'entrada', p_cantidad, 'cambio', v_cambio_id, v_persona)
    returning id into v_mov_entrada;
  perform fn_aplicar_movimiento(v_mov_entrada);

  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, cambio_id, usuario_id)
    values (p_variante_nueva_id, p_ubicacion_id, v_sub, 'salida', p_cantidad, 'cambio', v_cambio_id, v_persona)
    returning id into v_mov_salida;
  perform fn_aplicar_movimiento(v_mov_salida);

  return v_cambio_id;
end;
$$;

-- ---------- 12. devolución aprobada y vendible: vuelve directo al piso ----------
create or replace function retail.aprobar_devolucion(
  p_devolucion_id uuid, p_reembolso_monto numeric default null, p_reembolso_metodo text default null
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare d devoluciones%rowtype; r record; v_mov_id uuid; v_persona uuid; v_sub uuid;
begin
  select * into d from devoluciones where id = p_devolucion_id for update;
  if not found then raise exception 'La devolución % no existe', p_devolucion_id; end if;
  if d.estado <> 'pendiente' then raise exception 'Esa devolución ya está %', d.estado; end if;
  if not fn_es_lider() then
    raise exception 'Solo un líder puede aprobar una devolución';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub := fn_sububicacion_por_defecto(d.ubicacion_id, 'venta');

  for r in select * from devolucion_items where devolucion_id = p_devolucion_id loop
    if r.condicion = 'vendible' then
      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, devolucion_item_id, usuario_id)
        select vi.variante_id, d.ubicacion_id, v_sub, 'entrada', r.cantidad, 'devolucion', r.id, v_persona
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

-- ---------- 13. transferencia entre ubicaciones — el hallazgo crítico ----------
-- Sin resolver sububicación acá, un traslado a una tienda creaba una fila
-- de stock con sububicacion_id=null (invisible en piso/almacén, aunque
-- cuenta en el total), y un traslado DESDE una tienda ya repartida fallaba
-- con "stock insuficiente" aunque el stock se viera en pantalla. El sale
-- del almacén (no del piso: mandar mercadería a otra sede no debe tocar lo
-- que la clienta ve hoy) y entra al almacén del destino.
create or replace function retail.transferir(
  p_ubicacion_origen_id uuid, p_ubicacion_destino_id uuid, p_items jsonb, p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_transferencia_id uuid; v_item jsonb; v_item_id uuid; v_mov_id uuid; v_persona uuid;
  v_sub_origen uuid; v_sub_destino uuid;
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
  v_sub_origen := fn_sububicacion_por_defecto(p_ubicacion_origen_id, 'traslado_salida');
  v_sub_destino := fn_sububicacion_por_defecto(p_ubicacion_destino_id, 'traslado_entrada');

  insert into transferencias (ubicacion_origen_id, ubicacion_destino_id, creado_por, nota)
    values (p_ubicacion_origen_id, p_ubicacion_destino_id, v_persona, p_nota)
    returning id into v_transferencia_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into transferencia_items (transferencia_id, variante_id, cantidad)
      values (v_transferencia_id, (v_item ->> 'variante_id')::uuid, (v_item ->> 'cantidad')::integer)
      returning id into v_item_id;

    insert into movimientos (
      variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
      tipo, cantidad, motivo, transferencia_item_id, usuario_id
    )
      values (
        (v_item ->> 'variante_id')::uuid, p_ubicacion_origen_id, v_sub_origen, p_ubicacion_destino_id, v_sub_destino,
        'traslado', (v_item ->> 'cantidad')::integer, 'transferencia', v_item_id, v_persona
      )
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);

    update transferencia_items set movimiento_id = v_mov_id where id = v_item_id;
  end loop;

  return v_transferencia_id;
end;
$$;

-- ---------- 14. movimiento interno: mismo motor, sin tocar tipo ----------
-- `traslado` se generaliza para cubrir esto (constraint abajo) en vez de un
-- `tipo` nuevo: un tipo nuevo hubiera obligado a duplicar la rama en
-- fn_aplicar_movimiento Y en recalcular_stock() — la clase exacta de código
-- en dos lugares que causó el bug de ADR-0031. Reusar el motor da "el total
-- de la tienda no cambia" gratis, por construcción, no por una garantía
-- nueva escrita a mano. Se diferencia por `motivo`, mismo patrón que ya usa
-- el repo (`ajuste`+motivo='conteo', `traslado`+motivo='transferencia').
-- Reutilizable más allá de piso/almacén: cualquier par de sububicaciones de
-- la MISMA ubicación (ej. Rack A → Rack B en Taller).
create function retail.mover_interno(
  p_ubicacion_id uuid, p_variante_id uuid, p_cantidad integer,
  p_sububicacion_origen_id uuid, p_sububicacion_destino_id uuid,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_mov_id uuid; v_persona uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para mover mercadería en esa ubicación';
  end if;
  if p_cantidad <= 0 then
    raise exception 'La cantidad a mover debe ser mayor a cero';
  end if;
  if p_sububicacion_origen_id is not distinct from p_sububicacion_destino_id then
    raise exception 'Origen y destino no pueden ser la misma sububicación';
  end if;
  if p_sububicacion_origen_id is not null and not exists (
    select 1 from sububicaciones where id = p_sububicacion_origen_id and ubicacion_id = p_ubicacion_id
  ) then
    raise exception 'La sububicación de origen no pertenece a esta ubicación';
  end if;
  if p_sububicacion_destino_id is not null and not exists (
    select 1 from sububicaciones where id = p_sububicacion_destino_id and ubicacion_id = p_ubicacion_id
  ) then
    raise exception 'La sububicación de destino no pertenece a esta ubicación';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into movimientos (
    variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
    tipo, cantidad, motivo, usuario_id, nota
  )
    values (
      p_variante_id, p_ubicacion_id, p_sububicacion_origen_id,
      p_ubicacion_id, p_sububicacion_destino_id,
      'traslado', p_cantidad, 'movimiento_interno', v_persona, p_nota
    )
    returning id into v_mov_id;
  perform fn_aplicar_movimiento(v_mov_id);

  return v_mov_id;
end;
$$;
grant execute on function retail.mover_interno to authenticated;

-- ---------- 15. traslado ahora también cubre "misma ubicación, distinta sububicación" ----------
alter table retail.movimientos drop constraint movimientos_traslado_tiene_destino;
alter table retail.movimientos add constraint movimientos_traslado_tiene_destino check (
  (
    tipo = 'traslado'
    and ubicacion_destino_id is not null
    and (
      ubicacion_destino_id <> ubicacion_id
      or sububicacion_destino_id is distinct from sububicacion_id
    )
  )
  or (tipo <> 'traslado' and ubicacion_destino_id is null)
);

-- ---------- 16. conteo físico: dos modos de lectura, coherencia al abrir ----------
create or replace function retail.abrir_conteo(p_ubicacion_id uuid, p_sububicacion_id uuid default null)
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
  -- si la ubicación separa piso/almacén, un conteo de "toda la ubicación"
  -- dejaría a cerrar_conteo sin forma de saber a cuál de las dos cargar el
  -- ajuste — se exige elegir una de entrada.
  if p_sububicacion_id is null and exists (
    select 1 from sububicaciones where ubicacion_id = p_ubicacion_id and tipo in ('piso_venta', 'almacen_tienda')
  ) then
    raise exception 'Esta ubicación separa piso y almacén — el conteo debe indicar cuál de los dos';
  end if;
  if p_sububicacion_id is not null and not exists (
    select 1 from sububicaciones where id = p_sububicacion_id and ubicacion_id = p_ubicacion_id
  ) then
    raise exception 'Esa sububicación no pertenece a la ubicación indicada';
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

create or replace function retail.conteo_contar(p_conteo_id uuid, p_variante_id uuid, p_cantidad_contada integer)
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

  -- conteo de ubicación completa (sububicacion_id null): sigue sumando
  -- TODAS las sububicaciones, igual que antes de que existiera esta
  -- columna. Conteo específico: filtra exacto.
  select coalesce(sum(cantidad), 0) into v_sistema from stock
    where variante_id = p_variante_id and ubicacion_id = c.ubicacion_id
      and (c.sububicacion_id is null or sububicacion_id = c.sububicacion_id);

  insert into conteo_items (conteo_id, variante_id, cantidad_sistema, cantidad_contada)
    values (p_conteo_id, p_variante_id, v_sistema, p_cantidad_contada)
    on conflict (conteo_id, variante_id) do update set cantidad_contada = excluded.cantidad_contada
    returning id into v_item_id;

  return v_item_id;
end;
$$;

create or replace function retail.cerrar_conteo(p_conteo_id uuid)
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
      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, conteo_item_id, usuario_id)
        values (r.variante_id, c.ubicacion_id, c.sububicacion_id, 'ajuste', v_dif, 'conteo', r.id, v_persona)
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

-- ---------- 17. vista previa de cierre: mismos dos modos que conteo_contar ----------
-- Sin esto, un conteo de piso mostraría el stock de almacén como "nunca
-- contado" (0015_previsualizar_conteo.sql leía `stock` de toda la
-- ubicación) — una alarma falsa sobre algo que ese conteo ni siquiera
-- pretendía cubrir. `group by` + `sum` además evita mostrar el mismo
-- producto dos veces (una fila por sububicación) en un conteo de
-- ubicación completa.
create or replace function retail.previsualizar_cierre_conteo(p_conteo_id uuid)
returns table (
  variante_id uuid, codigo text, referencia text, talla text, color text,
  contada integer, sistema integer, diferencia integer, origen text
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select * from (
  select
    ci.variante_id,
    (select cb.codigo from codigos_barras cb where cb.variante_id = ci.variante_id order by cb.created_at limit 1),
    p.referencia, v.talla, co.nombre,
    ci.cantidad_contada, ci.cantidad_sistema,
    ci.cantidad_contada - ci.cantidad_sistema,
    'contado'
  from conteo_items ci
  join variantes v on v.id = ci.variante_id
  join productos p on p.id = v.producto_id
  left join colores co on co.codigo = v.color_codigo
  where ci.conteo_id = p_conteo_id

  union all

  select
    s.variante_id,
    (select cb.codigo from codigos_barras cb where cb.variante_id = s.variante_id order by cb.created_at limit 1),
    p.referencia, v.talla, co.nombre,
    0, sum(s.cantidad)::integer, -sum(s.cantidad)::integer,
    'no_contado'
  from stock s
  join variantes v on v.id = s.variante_id
  join productos p on p.id = v.producto_id
  left join colores co on co.codigo = v.color_codigo
  where s.ubicacion_id = (select ubicacion_id from conteos where id = p_conteo_id)
    and (
      (select sububicacion_id from conteos where id = p_conteo_id) is null
      or s.sububicacion_id = (select sububicacion_id from conteos where id = p_conteo_id)
    )
    and not exists (select 1 from conteo_items ci where ci.conteo_id = p_conteo_id and ci.variante_id = s.variante_id)
  group by s.variante_id, p.referencia, v.talla, co.nombre
  having sum(s.cantidad) <> 0
  ) t
  where fn_puede_operar_ubicacion((select ubicacion_id from conteos where id = p_conteo_id));
$$;
