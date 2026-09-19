-- ============================================================================
-- Compras (ADR-0111, D2): lo que ya existía ahora respeta cierres y notas de crédito
--
-- Tres funciones existentes que tenían que enterarse de las tablas nuevas:
--
-- 1. `recibir_compras` — el tope por línea era `cantidad - recibido`; pasa a
--    `cantidad - recibido - cerrado`. Si el proveedor dijo «estas 4 no llegan» y se
--    cerraron, después no se pueden «recibir» esas 4: el pendiente ya no las cuenta.
--    (Sin este cambio, recibir podría meter al stock unidades que el comprobante ya
--    dio por perdidas y `compras_no_sobrerecibida` — el CHECK de la foto — rechazaría
--    la recepción con un error crudo en vez de uno legible.) Mismo cuerpo de
--    20260917100001 salvo el tope; el mensaje viejo se conserva cuando no hay cierres.
--
-- 2. `anular_compra` — ya no deja anular con pagos ni con mercadería recibida (dejaría
--    stock o dinero sin respaldo). Igual con notas de crédito y con líneas cerradas:
--    son documentos que cuelgan del comprobante, y anularlo los dejaría huérfanos
--    (y el IGV de la nota seguiría restando del crédito fiscal de un comprobante que
--    ya no existe). Principio 2: se cierra en el origen, no se parcha después.
--
-- 3. `listar_compras` — los filtros por vencimiento comparaban contra `current_date`
--    (UTC: de 7 pm a medianoche de Lima ya era «mañana»); pasan a `fn_hoy_lima()`,
--    igual que la vista `compras_resumen.vencida`. Misma firma, mismo tipo de retorno:
--    `create or replace`, sin sobrecarga nueva.
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. recibir_compras: el tope descuenta lo cerrado ====================
create or replace function retail.recibir_compras(
  p_ubicacion_id uuid,
  p_items jsonb,                       -- [{compra_item_id, variante_id, cantidad, costo_unitario?}]
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
  v_proveedor uuid; v_recibido integer; v_cerrado integer; v_cantidad integer;
  v_agregado jsonb; v_con_factura boolean := false;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para recibir mercadería en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Una recepción necesita al menos un ítem';
  end if;

  -- Tope contra lo facturado: SOLO para ítems atados a una línea de factura.
  for v_agregado in
    select jsonb_build_object('compra_item_id', i ->> 'compra_item_id', 'cantidad', sum((i ->> 'cantidad')::integer))
    from jsonb_array_elements(p_items) i
    where (i ->> 'compra_item_id') is not null
    group by i ->> 'compra_item_id'
  loop
    v_con_factura := true;
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
    -- Lo cerrado («no va a llegar», ADR-0111 D2) ya no se puede recibir.
    select coalesce(sum(cantidad), 0) into v_cerrado from compra_item_cierres where compra_item_id = v_linea.id;
    v_cantidad := (v_agregado ->> 'cantidad')::integer;
    if v_cantidad <= 0 then
      raise exception 'La cantidad recibida debe ser mayor a cero';
    end if;
    if v_recibido + v_cerrado + v_cantidad > v_linea.cantidad then
      if v_cerrado = 0 then
        raise exception 'Factura %-%: la línea tiene % facturados, % ya recibidos y se intenta recibir % más',
          v_compra.serie, v_compra.numero, v_linea.cantidad, v_recibido, v_cantidad;
      else
        raise exception 'Factura %-%: la línea tiene % facturados, % ya recibidos, % cerrados sin llegar y se intenta recibir % más',
          v_compra.serie, v_compra.numero, v_linea.cantidad, v_recibido, v_cerrado, v_cantidad;
      end if;
    end if;
  end loop;

  if not v_con_factura then
    raise exception 'Una recepción de Compras necesita al menos un ítem de una factura — si nada de lo que llegó está facturado, usa "Recibir sin factura"';
  end if;

  -- Fuera de factura: sin tope que chequear, pero sí cantidad > 0 y una
  -- variante real — mismo candado mínimo que recibir_lote.
  for v_item in select i from jsonb_array_elements(p_items) i where (i ->> 'compra_item_id') is null loop
    if coalesce((v_item ->> 'cantidad')::integer, 0) <= 0 then
      raise exception 'La cantidad recibida debe ser mayor a cero';
    end if;
    if not exists (select 1 from variantes where id = (v_item ->> 'variante_id')::uuid) then
      raise exception 'La prenda fuera de factura no existe';
    end if;
  end loop;

  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'entrada');

  insert into lotes (ubicacion_id, proveedor_id, numero_guia, recibido_por, nota)
    values (p_ubicacion_id, v_proveedor, p_numero_guia, v_persona, p_nota)
    returning id into v_lote_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item ->> 'compra_item_id') is not null then
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

      perform fn_recalcular_costo_variante(
        (v_item ->> 'variante_id')::uuid,
        (v_item ->> 'cantidad')::integer,
        v_linea.costo_unitario,
        'compra',
        v_mov_id
      );
    else
      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, lote_id, usuario_id)
        values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, v_sub, 'entrada',
                (v_item ->> 'cantidad')::integer, 'recepcion', v_lote_id, v_persona)
        returning id into v_mov_id;

      if (v_item ->> 'costo_unitario') is not null then
        perform fn_recalcular_costo_variante(
          (v_item ->> 'variante_id')::uuid,
          (v_item ->> 'cantidad')::integer,
          (v_item ->> 'costo_unitario')::numeric,
          'compra',
          v_mov_id
        );
      end if;
    end if;

    perform fn_aplicar_movimiento(v_mov_id);
  end loop;

  return v_lote_id;
end;
$$;

comment on function retail.recibir_compras(uuid, jsonb, text, text) is
  'Recibe mercadería contra una o varias facturas del mismo proveedor (ADR-0035). Un ítem con compra_item_id = null es fuera de factura (ADR-0076): mismo lote, sin tope ni deuda, costo opcional. El tope por línea es cantidad - recibido - cerrado (ADR-0111 D2).';

-- ==================== 2. anular_compra: tampoco con notas de crédito ni cierres ====================
create or replace function retail.anular_compra(p_compra_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_compra compras%rowtype;
begin
  if not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para anular compras';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Anular una factura necesita un motivo';
  end if;

  select * into v_compra from compras where id = p_compra_id for update;
  if not found then
    raise exception 'La compra % no existe', p_compra_id;
  end if;
  if v_compra.estado = 'anulada' then
    return;
  end if;
  -- con pagos o mercadería ya ingresada, anular dejaría stock o dinero sin respaldo
  if exists (select 1 from compra_pagos where compra_id = p_compra_id) then
    raise exception 'La factura tiene pagos registrados: no se puede anular';
  end if;
  if exists (
    select 1 from movimientos m join compra_items ci on ci.id = m.compra_item_id
    where ci.compra_id = p_compra_id
  ) then
    raise exception 'La factura ya tiene mercadería recibida: no se puede anular';
  end if;
  -- ADR-0111: una nota de crédito o un cierre de línea cuelgan del comprobante;
  -- anularlo los dejaría huérfanos (y el IGV de la nota seguiría restando del crédito fiscal).
  if exists (select 1 from compra_notas_credito where compra_id = p_compra_id) then
    raise exception 'La factura tiene notas de crédito registradas: no se puede anular';
  end if;
  if exists (
    select 1 from compra_item_cierres k join compra_items ci on ci.id = k.compra_item_id
    where ci.compra_id = p_compra_id
  ) then
    raise exception 'La factura tiene líneas cerradas por faltante: no se puede anular';
  end if;

  update compras set estado = 'anulada', motivo_anulacion = trim(p_motivo) where id = p_compra_id;
end;
$$;

-- ==================== 3. listar_compras: el día de corte es el de Lima ====================
create or replace function retail.listar_compras(
  p_limite integer default 50,
  p_cursor_fecha date default null,
  p_cursor_creado_en timestamptz default null,
  p_cursor_id uuid default null,
  p_orden text default 'emision',
  p_busqueda text default null,
  p_proveedor_id uuid default null,
  p_estado_pago text default null,
  p_estado_recepcion text default null,
  p_condicion text default null,
  p_solo_vigentes boolean default false,
  p_con_saldo boolean default false,
  p_solo_vencidas boolean default false,
  p_por_recibir boolean default false,
  p_desde date default null,
  p_hasta date default null,
  p_tipo text default null
)
returns setof retail.compras_resumen
language plpgsql stable
set search_path = retail, public, extensions
as $$
declare
  v_limite integer := greatest(1, least(coalesce(p_limite, 50), 200)) + 1;
  v_busqueda text := nullif(trim(p_busqueda), '');
  v_proveedores uuid[];
  v_hoy date := fn_hoy_lima();
begin
  if v_busqueda is not null then
    select coalesce(array_agg(id), '{}') into v_proveedores from proveedores where nombre ilike '%' || v_busqueda || '%';
  end if;
  if p_orden = 'vencimiento' then
    return query
      select r.*
      from compras_resumen r
      where (v_busqueda is null or r.documento ilike '%' || v_busqueda || '%' or r.proveedor_id = any(v_proveedores))
        and (p_proveedor_id is null or r.proveedor_id = p_proveedor_id)
        and (p_estado_pago is null or r.estado_pago = p_estado_pago)
        and (p_estado_recepcion is null or r.estado_recepcion = p_estado_recepcion)
        and (p_condicion is null or r.condicion = p_condicion)
        and (p_tipo is null or r.tipo = p_tipo)
        and (not p_solo_vigentes or r.estado = 'vigente')
        and (not p_con_saldo or (r.estado = 'vigente' and r.saldo > 0))
        and (not p_solo_vencidas or (r.estado = 'vigente' and r.saldo > 0 and r.fecha_vencimiento < v_hoy))
        and (not p_por_recibir or (r.estado = 'vigente' and r.estado_recepcion in ('sin_recibir', 'parcial')))
        and (p_desde is null or r.fecha_emision >= p_desde)
        and (p_hasta is null or r.fecha_emision <= p_hasta)
        and (p_cursor_id is null or (r.fecha_vencimiento, r.id) > (p_cursor_fecha, p_cursor_id))
      order by r.fecha_vencimiento asc nulls last, r.id asc
      limit v_limite;
  else
    return query
      select r.*
      from compras_resumen r
      where (v_busqueda is null or r.documento ilike '%' || v_busqueda || '%' or r.proveedor_id = any(v_proveedores))
        and (p_proveedor_id is null or r.proveedor_id = p_proveedor_id)
        and (p_estado_pago is null or r.estado_pago = p_estado_pago)
        and (p_estado_recepcion is null or r.estado_recepcion = p_estado_recepcion)
        and (p_condicion is null or r.condicion = p_condicion)
        and (p_tipo is null or r.tipo = p_tipo)
        and (not p_solo_vigentes or r.estado = 'vigente')
        and (not p_con_saldo or (r.estado = 'vigente' and r.saldo > 0))
        and (not p_solo_vencidas or (r.estado = 'vigente' and r.saldo > 0 and r.fecha_vencimiento < v_hoy))
        and (not p_por_recibir or (r.estado = 'vigente' and r.estado_recepcion in ('sin_recibir', 'parcial')))
        and (p_desde is null or r.fecha_emision >= p_desde)
        and (p_hasta is null or r.fecha_emision <= p_hasta)
        and (p_cursor_id is null or (r.fecha_emision, r.created_at, r.id) < (p_cursor_fecha, p_cursor_creado_en, p_cursor_id))
      order by r.fecha_emision desc, r.created_at desc, r.id desc
      limit v_limite;
  end if;
end;
$$;

grant execute on function retail.listar_compras to authenticated;
