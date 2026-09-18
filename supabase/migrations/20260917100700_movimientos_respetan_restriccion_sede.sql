-- ============================================================================
-- 20260917100700 — sedes_permitidas también bloquea traslados, no solo ventas
--
-- El diseño original de etiquetas (rama sin fusionar, ADR-0071) puso el
-- candado SOLO en registrar_venta. Felipe (2026-09-17): es un estado
-- inconsistente real — una prenda restringida a Tienda TRU podía terminar
-- en el piso de AQP por un traslado normal, sin que nada lo impidiera.
-- Se cierra ahora, antes de construir nada más encima (principio 2).
--
-- UNA SOLA FUNCIÓN, NO DOS CHEQUEOS DUPLICADOS
--   `fn_variante_permitida_en_sede` es la única fuente de verdad de la
--   regla — registrar_venta y transferir la llaman igual, en vez de cada
--   una repetir su propia versión del EXISTS (integridad conceptual,
--   principio 2).
--
-- QUÉ NO SE TOCA: registrar_movimiento (entrada/salida/ajuste sueltos)
--   Entrada/salida no MUEVEN una variante hacia una sede nueva — ocurren
--   dentro de la sede donde ya se está operando (fn_puede_operar_ubicacion
--   ya exige pertenecer a esa sede). El caso real que rompe la regla es
--   moverse DE una sede A otra: venta (sede→cliente) y traslado
--   (sede→sede). Ajuste es un ajuste con el proveedor: si la sede ya tiene
--   esa variante restringida y de algún modo apareció ahí, el ajuste no la
--   está llevando a ningún lado nuevo.
-- ============================================================================

create or replace function retail.fn_variante_permitida_en_sede(p_variante_id uuid, p_ubicacion_id uuid)
returns boolean
language sql
stable
set search_path = retail, public
as $$
  select not exists (
    select 1
    from variante_etiquetas ve
    join etiquetas e on e.id = ve.etiqueta_id
    where ve.variante_id = p_variante_id
      and e.activo
      and e.estado = 'aprobado'
      and e.sedes_permitidas is not null
      and not (p_ubicacion_id = any (e.sedes_permitidas))
  );
$$;

comment on function retail.fn_variante_permitida_en_sede(uuid, uuid) is
  'true = esta variante puede estar/venderse en esta ubicación. Una etiqueta PENDIENTE nunca restringe (mismo criterio que ADR-0071): evita que un colaborador bloquee una venta por accidente antes de que un Líder la revise.';

-- ---------- registrar_venta: mismo candado, ahora vía la función compartida ----------
create or replace function retail.registrar_venta(
  p_ubicacion_id uuid, p_items jsonb, p_pagos jsonb,
  p_cliente_id uuid default null, p_token uuid default null,
  p_tipo_comprobante text default null,
  p_cliente_tipo_doc text default 'sin_documento',
  p_cliente_num_doc text default null,
  p_cliente_nombre text default null,
  p_codigo_descuento text default null,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_venta_id uuid; v_existente ventas%rowtype; v_item jsonb; v_pago jsonb;
  v_item_id uuid; v_mov_id uuid; v_costo numeric; v_persona uuid;
  v_sub uuid;
  v_caja_id uuid;
  v_total_items numeric := 0;
  v_total_pagos numeric := 0;
  v_igv numeric;
  v_subtotal numeric;
  v_precio_catalogo numeric; v_referencia text; v_sku text;
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  v_descuento numeric;
  v_hay_descuento boolean := false;
  v_codigo codigos_descuento%rowtype;
  v_codigo_limpio text := upper(btrim(coalesce(p_codigo_descuento, '')));
  v_motivo text; v_motivo_otro text; v_argumento text;
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
    select v.precio, p.referencia, v.sku
      into v_precio_catalogo, v_referencia, v_sku
      from variantes v join productos p on p.id = v.producto_id
      where v.id = (v_item ->> 'variante_id')::uuid;
    if v_precio_catalogo is null then
      raise exception 'La variante % no existe', v_item ->> 'variante_id';
    end if;

    if (v_item ->> 'variante_id')::uuid <> c_cargo_especial
       and not fn_variante_permitida_en_sede((v_item ->> 'variante_id')::uuid, p_ubicacion_id) then
      raise exception 'venta_variante_restringida_a_otra_sede' using detail = v_referencia || ' (' || v_sku || ')';
    end if;

    if (v_item ->> 'variante_id')::uuid <> c_cargo_especial
       and round((v_item ->> 'precio_unitario')::numeric, 2) <> round(v_precio_catalogo, 2) then
      raise exception 'venta_precio_cambiado'
        using detail = v_referencia || ' (' || v_sku || ')',
              hint = format('En catálogo vale S/%s y la caja mandó S/%s', v_precio_catalogo, v_item ->> 'precio_unitario');
    end if;

    v_descuento := coalesce((v_item ->> 'descuento_unitario')::numeric, 0);
    if v_descuento > 0 then
      v_hay_descuento := true;

      v_motivo := btrim(coalesce(v_item ->> 'motivo_descuento', ''));
      v_motivo_otro := btrim(coalesce(v_item ->> 'motivo_descuento_detalle', ''));
      v_argumento := btrim(coalesce(v_item ->> 'argumento_descuento', ''));

      if v_motivo not in ('cumpleanos_clienta_top', 'prenda_con_desperfecto', 'liquidacion_temporada', 'cerrar_venta', 'otro') then
        raise exception 'venta_descuento_requiere_motivo' using detail = v_referencia || ' (' || v_sku || ')';
      end if;
      if v_motivo = 'otro' and v_motivo_otro = '' then
        raise exception 'venta_descuento_otro_sin_detalle' using detail = v_referencia || ' (' || v_sku || ')';
      end if;

      select costo into v_costo from variantes where id = (v_item ->> 'variante_id')::uuid;
      if (v_item ->> 'precio_unitario')::numeric - v_descuento < v_costo then
        raise exception 'venta_descuento_bajo_costo' using detail = v_referencia || ' (' || v_sku || ')';
      end if;

      if fn_es_lider() then
        if v_descuento > round((v_item ->> 'precio_unitario')::numeric * 0.35, 2) + 0.01 then
          raise exception 'venta_descuento_supera_autorizacion' using detail = v_referencia || ' (' || v_sku || ')';
        elsif v_descuento > round((v_item ->> 'precio_unitario')::numeric * 0.20, 2) + 0.01 and v_argumento = '' then
          raise exception 'venta_descuento_requiere_argumento' using detail = v_referencia || ' (' || v_sku || ')';
        end if;
      end if;
    end if;

    v_total_items := v_total_items +
      (((v_item ->> 'precio_unitario')::numeric - v_descuento) * (v_item ->> 'cantidad')::integer);
  end loop;

  if v_hay_descuento and not fn_es_lider() then
    if v_codigo_limpio = '' then
      raise exception 'venta_descuento_requiere_codigo';
    end if;
    select * into v_codigo from codigos_descuento
      where codigo = v_codigo_limpio
        and activo
        and (vigente_desde is null or vigente_desde <= current_date)
        and (vigente_hasta is null or vigente_hasta >= current_date)
        and (ubicacion_id is null or ubicacion_id = p_ubicacion_id);
    if not found then
      raise exception 'venta_codigo_descuento_invalido' using detail = v_codigo_limpio;
    end if;
    for v_item in select * from jsonb_array_elements(p_items) loop
      if coalesce((v_item ->> 'descuento_unitario')::numeric, 0)
         > round((v_item ->> 'precio_unitario')::numeric * v_codigo.porcentaje / 100, 2) + 0.01 then
        raise exception 'venta_descuento_supera_codigo'
          using detail = trim(trailing '.' from trim(trailing '0' from v_codigo.porcentaje::text)),
                hint = format('La línea %s pide S/%s de descuento', v_item ->> 'variante_id', v_item ->> 'descuento_unitario');
      end if;
    end loop;
  end if;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    v_total_pagos := v_total_pagos + (v_pago ->> 'monto')::numeric;
  end loop;
  if round(v_total_items, 2) <> round(v_total_pagos, 2) then
    raise exception 'Los pagos (S/%) no cuadran con el total de la venta (S/%)', v_total_pagos, v_total_items;
  end if;

  begin
    insert into ventas (ubicacion_id, cliente_id, caja_id, usuario_id, token_cliente, nota)
      values (p_ubicacion_id, p_cliente_id, v_caja_id, v_persona, p_token, nullif(btrim(p_nota), ''))
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

    insert into venta_items (
      venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario,
      motivo_descuento, motivo_descuento_detalle, argumento_descuento
    )
      values (
        v_venta_id, (v_item ->> 'variante_id')::uuid, (v_item ->> 'cantidad')::integer,
        (v_item ->> 'precio_unitario')::numeric, coalesce((v_item ->> 'descuento_unitario')::numeric, 0), v_costo,
        nullif(btrim(coalesce(v_item ->> 'motivo_descuento', '')), ''),
        nullif(btrim(coalesce(v_item ->> 'motivo_descuento_detalle', '')), ''),
        nullif(btrim(coalesce(v_item ->> 'argumento_descuento', '')), '')
      )
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

-- ---------- transferir: el candado mira el DESTINO, no el origen ----------
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
  v_referencia text; v_sku text;
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

  for v_item in select * from jsonb_array_elements(p_items) loop
    if not fn_variante_permitida_en_sede((v_item ->> 'variante_id')::uuid, p_ubicacion_destino_id) then
      select p.referencia, v.sku into v_referencia, v_sku
        from variantes v join productos p on p.id = v.producto_id
        where v.id = (v_item ->> 'variante_id')::uuid;
      raise exception 'traslado_variante_restringida_a_otra_sede' using detail = coalesce(v_referencia || ' (' || v_sku || ')', v_item ->> 'variante_id');
    end if;
  end loop;

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
