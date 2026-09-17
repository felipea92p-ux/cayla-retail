-- ============================================================================
-- 20260914231015_registrar_venta_piso_con_nota.sql — CAYLA V2
--
-- Una sola `registrar_venta`, con todo lo que dos líneas de trabajo le pusieron
-- el mismo día sin verse: el piso/almacén de Inventario y el candado de precio,
-- los códigos de descuento y la nota de Vender.
--
-- EL PROBLEMA. El 2026-09-14 convivieron dos definiciones de la misma función:
--   · `20260914230000_inventario_piso_almacen.sql` la recreó con 9 parámetros y
--     el cuerpo que descuenta del PISO (`fn_sububicacion_por_defecto(…, 'venta')`
--     en el movimiento, y `fn_aplicar_movimiento` elige la fila de `stock`).
--   · `…215059_candado_precio_venta`, `…215103_codigos_descuento` y
--     `…220804_nota_en_ventas` la fueron llevando a 11 parámetros, cada una con
--     `drop function … (firma anterior)` — y ninguna sabía del piso.
-- En local, según el orden de aplicación, quedan DOS funciones (9 y 11 args) y
-- PostgREST no puede elegir. En producción se pegaron primero las de Vender:
-- quedó UNA de 11 args… que descuenta por (variante, ubicación) a secas, sobre
-- una tabla `stock` que ya puede tener varias filas por prenda. Hoy no rompe
-- nada porque ninguna sede tiene sububicaciones creadas; el día que se cree un
-- piso y se venda, esa función deja el stock en un estado imposible.
--
-- LA REGLA (principio 2 y 4): una venta descuenta del piso de venta; en una
-- ubicación sin piso/almacén (Taller), del único stock que hay (sububicación
-- nula). Y siempre valida precio de catálogo, autorización del descuento y
-- guarda la nota. Es el cuerpo de `nota_en_ventas` más las dos líneas de
-- `inventario_piso_almacen`: `v_sub` y la columna `sububicacion_id` en el
-- `insert into movimientos`. Nada más cambia.
--
-- De paso, `fn_stock_por_sede` (…220001) devolvía filas crudas: con
-- piso+almacén hay varias por prenda y sede. Ahora SUMA por (variante,
-- ubicación) — para un traslado cuenta el total de la otra tienda, piso más
-- almacén (decisión de Felipe, 2026-09-14, D12).
--
-- AL APLICAR EN PRODUCCIÓN: se borran las dos firmas posibles (la de 9 no
-- existe allá — el `if exists` lo tolera) y se crea la de 11. No toca datos.
-- Antes y después:
--   select pronargs, pg_get_function_identity_arguments(oid)
--   from pg_proc where proname = 'registrar_venta'
--     and pronamespace = 'retail'::regnamespace;          -- después: UNA fila, 11
--   select pg_get_functiondef(oid) ~ 'fn_sububicacion_por_defecto'
--   from pg_proc where proname = 'registrar_venta'
--     and pronamespace = 'retail'::regnamespace;          -- después: true
--
-- SE ROMPE SI: alguien vuelve a hacer `create or replace function
-- retail.registrar_venta(…)` con otra lista de parámetros sin `drop` previo —
-- Postgres crea una función NUEVA al lado (sobrecarga) y PostgREST deja de
-- saber a cuál llamar. Cualquier cambio futuro empieza por `drop function` con
-- la firma completa de 11 parámetros que está al pie.
-- ============================================================================

drop function if exists retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text);
drop function if exists retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text);
drop function if exists retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text);

create function retail.registrar_venta(
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
  -- Piso/almacén (20260914230000): la sububicación de la que sale una venta.
  -- Null en una ubicación sin piso/almacén — y `fn_aplicar_movimiento` toca
  -- la fila de stock con `sububicacion_id is not distinct from`.
  v_sub uuid;
  v_caja_id uuid;
  v_total_items numeric := 0;
  v_total_pagos numeric := 0;
  v_igv numeric;
  v_subtotal numeric;
  -- Candado de precio (20260914215059)
  v_precio_catalogo numeric; v_referencia text; v_sku text;
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  -- Códigos de descuento (20260914215103)
  v_descuento numeric;
  v_hay_descuento boolean := false;
  v_codigo codigos_descuento%rowtype;
  v_codigo_limpio text := upper(btrim(coalesce(p_codigo_descuento, '')));
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

  -- Cada ítem contra el catálogo, antes de tocar una sola tabla: el precio que
  -- llega tiene que ser el vigente, salvo el Cargo especial (precio libre).
  for v_item in select * from jsonb_array_elements(p_items) loop
    select v.precio, p.referencia, v.sku
      into v_precio_catalogo, v_referencia, v_sku
      from variantes v join productos p on p.id = v.producto_id
      where v.id = (v_item ->> 'variante_id')::uuid;
    if v_precio_catalogo is null then
      raise exception 'La variante % no existe', v_item ->> 'variante_id';
    end if;
    if (v_item ->> 'variante_id')::uuid <> c_cargo_especial
       and round((v_item ->> 'precio_unitario')::numeric, 2) <> round(v_precio_catalogo, 2) then
      raise exception 'venta_precio_cambiado'
        using detail = v_referencia || ' (' || v_sku || ')',
              hint = format('En catálogo vale S/%s y la caja mandó S/%s', v_precio_catalogo, v_item ->> 'precio_unitario');
    end if;

    v_descuento := coalesce((v_item ->> 'descuento_unitario')::numeric, 0);
    if v_descuento > 0 then v_hay_descuento := true; end if;

    v_total_items := v_total_items +
      (((v_item ->> 'precio_unitario')::numeric - v_descuento) * (v_item ->> 'cantidad')::integer);
  end loop;

  -- Quién descuenta: un Líder solo; una Colaboradora, con código válido y hasta su %.
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
    -- Un centavo de tolerancia: la caja redondea en coma flotante y acá en decimal.
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
    -- La nota del ticket («lo recoge el sábado»): vacía se guarda como null, nunca ''.
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

    insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
      values (v_venta_id, (v_item ->> 'variante_id')::uuid, (v_item ->> 'cantidad')::integer,
              (v_item ->> 'precio_unitario')::numeric, coalesce((v_item ->> 'descuento_unitario')::numeric, 0), v_costo)
      returning id into v_item_id;

    -- La venta sale del piso (o de la única sububicación, null, donde no hay piso/almacén).
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

  -- El comprobante nace acá, en la misma transacción: si emitir_comprobante()
  -- revienta (ej. sin serie registrada), toda la venta se revierte con él.
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

grant execute on function retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text) to authenticated;

-- ---------- fn_stock_por_sede: una fila por (prenda, sede), sumando piso y almacén ----------
create or replace function retail.fn_stock_por_sede()
returns table (variante_id uuid, ubicacion_id uuid, cantidad integer)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select s.variante_id, s.ubicacion_id, sum(s.cantidad)::integer as cantidad
  from stock s
  join ubicaciones u on u.id = s.ubicacion_id and u.activo
  where exists (
    select 1
    from colaboradores c
    join public.personas p on p.id = c.persona_id
    where p.auth_user_id = auth.uid() and p.estado = 'activo'
  )
  group by s.variante_id, s.ubicacion_id;
$$;
