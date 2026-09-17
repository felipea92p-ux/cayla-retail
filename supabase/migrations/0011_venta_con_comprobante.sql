-- ============================================================================
-- 0011_venta_con_comprobante.sql — CAYLA V2
--
-- Pedido de Felipe (2026-09-12): "en ventas tiene que especificarse si será
-- boleta o factura también". Hasta ahora Vender y Facturación estaban
-- completamente separados — `registrar_venta` nunca creaba un comprobante,
-- y Facturación emitía uno "suelto" tecleando el total a mano
-- (`ComprobantesPanel.tsx`, `ProformasPanel.tsx`). El propio comentario de
-- `ConsultaDocumento.tsx` (2026-09-12) ya lo anticipaba: "el mismo campo va
-- a hacer falta en el punto de venta cuando la clienta pida factura al
-- momento de pagar".
--
-- DECISIÓN: el comprobante se emite DENTRO de la misma transacción que la
-- venta, no como un segundo paso desde el frontend (principio 9 — la unidad
-- es todo o nada). Si se pide comprobante y no hay serie registrada para esa
-- ubicación/tipo, TODA la venta revienta y se revierte (stock incluido) —
-- es preferible que la vendedora vea el error y avise a un líder, a que
-- quede una venta ya cobrada sin forma de facturarla, o un stock descontado
-- sin la venta que lo explique.
--
-- `p_tipo_comprobante` es opcional (default null = no emitir nada): esto
-- deja a `registrar_venta` compatible con cualquier llamador que no lo use
-- todavía, pero el frontend de Vender SIEMPRE va a mandar un valor real —
-- "tiene que especificarse" se hace cumplir en la pantalla, no prohibiendo
-- el caso sin comprobante a nivel de esquema (ej. para no bloquear una
-- migración de datos futura).
-- ============================================================================

set search_path = retail, public, extensions;

-- `create or replace` no alcanza acá: se agregan 4 parámetros nuevos, así
-- que para Postgres es una firma distinta (mismo motivo que 0008 al pasar
-- de pago único a pagos múltiples) — sin este drop quedan dos
-- `registrar_venta` sobrecargadas y una llamada con los 5 argumentos viejos
-- se vuelve ambigua ("is not unique").
drop function if exists retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid);

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
  v_item_id uuid; v_mov_id uuid; v_costo numeric; v_persona uuid;
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

-- ============================================================================
-- "Ventas de hoy" — una fila por venta del día en curso (hora Lima), con su
-- comprobante si ya tiene uno. Vive en Facturación (líder-only en la
-- pantalla); acá se refuerza igual (cinturón y tirantes de siempre): un
-- líder ve todas las ubicaciones o filtra una, un integrante SOLO ve la
-- suya sin importar qué ubicación pida — nunca confía en el parámetro para
-- eso, mismo criterio que fn_puede_operar_ubicacion.
-- ============================================================================
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
  comprobante_estado text
)
language sql stable security definer
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
    cmp.estado
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

grant execute on function retail.fn_ventas_del_dia to authenticated;
