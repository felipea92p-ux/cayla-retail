-- ============================================================================
-- 20260914220804_nota_en_ventas.sql — CAYLA V2
--
-- «Lo recoge el sábado», «va con arreglo de bastilla»: la venta tenía dónde
-- guardar cuánto, cómo se pagó y a nombre de quién, pero no una línea de texto
-- de la colaboradora. Pedido de Felipe (2026-09-14).
--
-- Qué hace: `ventas.nota` (hasta 200 caracteres), `registrar_venta` gana `p_nota`
-- (drop por firma de 10 —la de 20260914215103— y recreate con 11; vacía se guarda
-- como null) y `fn_ventas_del_dia` devuelve `nota` al final — drop + create
-- porque cambia el `returns table` y `create or replace` no puede. Aditivo para
-- sus dos consumidores (vender/page.tsx y Facturación).
--
-- La nota NO va al comprobante: SUNAT no la lleva y no es dato fiscal. Y es
-- parte del ticket, no del cobro: el «ticket en espera» (paso siguiente) la
-- guarda y la recupera junto con las líneas.
--
-- ESTADO: aplicada en la base local el 2026-09-14. NO en producción — la pega
-- Felipe (D-11), junto con las dos anteriores; ya lleva el prefijo `retail.`.
-- SE ROMPE SI: alguien recrea `fn_ventas_del_dia` sin `nota` — «Ventas de hoy»
-- dejaría de mostrarla sin que nada avise (no hay test sobre la función).
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.ventas
  add column nota text,
  add constraint ventas_nota_corta check (char_length(nota) <= 200);

comment on column retail.ventas.nota is
  'Nota libre de la colaboradora sobre esta venta (recojo, arreglo, aviso). Hasta 200 caracteres. No va al comprobante.';

-- ---------- registrar_venta: aprende p_nota ----------
drop function if exists retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text);

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
  v_caja_id uuid;
  v_total_items numeric := 0;
  v_total_pagos numeric := 0;
  v_igv numeric;
  v_subtotal numeric;
  -- Candado de precio (20260914215059)
  v_precio_catalogo numeric; v_referencia text; v_sku text;
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  -- Códigos de descuento
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

    insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, 'salida',
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

comment on function retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text) is
  'Registra una venta con sus ítems, pagos, nota y comprobante en una transacción. Rechaza precios distintos al catálogo (venta_precio_cambiado) y, para una Colaboradora, descuentos sin código válido o por encima de su % (venta_descuento_*).';

-- ---------- fn_ventas_del_dia: devuelve la nota ----------
-- Misma consulta de 0011 (una fila por venta del día, hora Lima, líder ve todas o
-- filtra una, integrante solo la suya) + `nota` como última columna.
drop function if exists retail.fn_ventas_del_dia(uuid);

create function retail.fn_ventas_del_dia(p_ubicacion_id uuid default null)
returns table (
  venta_id uuid,
  hora text,
  ubicacion_nombre text,
  vendedor text,
  cliente_nombre text,
  items jsonb,
  total numeric,
  metodos_pago text,
  comprobante_tipo text,
  comprobante_texto text,
  comprobante_estado text,
  nota text
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select
    v.id,
    to_char(v.created_at at time zone 'America/Lima', 'HH24:MI'),
    u.nombre,
    coalesce(per.nombres || ' ' || per.apellidos, '—'),
    coalesce(cli.nombre, 'Cliente varios'),
    (select jsonb_agg(jsonb_build_object(
        'referencia', pr.referencia, 'talla', va.talla, 'color', co.nombre,
        'cantidad', vi.cantidad, 'precio_unitario', vi.precio_unitario
      ) order by vi.id)
      from venta_items vi
      join variantes va on va.id = vi.variante_id
      join productos pr on pr.id = va.producto_id
      left join colores co on co.codigo = va.color_codigo
      where vi.venta_id = v.id),
    (select coalesce(sum(vi.subtotal), 0) from venta_items vi where vi.venta_id = v.id),
    (select string_agg(distinct vp.metodo, ' + ') from venta_pagos vp where vp.venta_id = v.id),
    cmp.tipo,
    case when cmp.id is not null then cmp.serie || '-' || lpad(cmp.numero::text, 6, '0') else null end,
    cmp.estado,
    v.nota
  from ventas v
  join ubicaciones u on u.id = v.ubicacion_id
  left join public.personas per on per.id = v.usuario_id
  left join clientes cli on cli.id = v.cliente_id
  left join comprobantes cmp on cmp.venta_id = v.id
  where (v.created_at at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date
    and (
      (fn_es_lider() and (p_ubicacion_id is null or v.ubicacion_id = p_ubicacion_id))
      or (not fn_es_lider() and v.ubicacion_id = fn_ubicacion_actual_persona())
    )
  order by v.created_at desc;
$$;

grant execute on function retail.fn_ventas_del_dia(uuid) to authenticated;
