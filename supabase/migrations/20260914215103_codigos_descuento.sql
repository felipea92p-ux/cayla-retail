-- ============================================================================
-- 20260914215103_codigos_descuento.sql — CAYLA V2
--
-- Quién puede descontar, y hasta cuánto. Desde el 2026-09-14 la caja aplica
-- descuentos por prenda o al ticket entero (ADR-0044) y viajan como
-- `descuento_unitario` — pero la base los aceptaba de cualquiera, sin tope.
-- Decisión de Felipe (2026-09-14, BACKLOG «códigos de descuento», 1-A):
--
--   · Un Líder descuenta sin código.
--   · Una Colaboradora (rol de 0016_roles_colaborador.sql) necesita un código
--     válido para cualquier `descuento_unitario > 0`, y el % del código es el
--     TOPE de cada línea.
--
-- Qué hace: tabla `codigos_descuento` (el código, su %, vigencia, activo, sede
-- o todas, quién lo creó) con RLS — leerla puede cualquiera con sesión;
-- crear/editar solo `fn_es_lider()`; borrar nadie (se apaga con `activo`).
-- `registrar_venta` gana `p_codigo_descuento text default null` y aplica la
-- regla ANTES de escribir nada, con nombres estables que
-- `apps/web/lib/error-escritura.ts` vuelve frase:
--   venta_descuento_requiere_codigo  → «necesitas un código válido…»
--   venta_codigo_descuento_invalido  → «El código X no es válido o ya venció…»
--   venta_descuento_supera_codigo    → «Ese código permite hasta un N %…»
--
-- Sin pantalla de administración por ahora: los códigos se crean en Studio
-- (BACKLOG: paso propio). La venta NO guarda qué código usó — si un día hace
-- falta medir cuánto se regala por código, es una columna en `ventas`, no un
-- cambio de esta regla.
--
-- Drop por firma de 9 parámetros (la de 20260914215059_candado_precio_venta)
-- y recreate con 10; los grants se vuelven a dar.
--
-- ESTADO: aplicada en la base local el 2026-09-14. NO en producción — la pega
-- Felipe (D-11); ya lleva el prefijo `retail.`.
-- SE ROMPE SI: se quita `fn_es_lider()` del `with check` — cualquier
-- colaboradora podría crearse su propio código del 100 %.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- la tabla ----------
create table retail.codigos_descuento (
  codigo text primary key,
  porcentaje numeric(5, 2) not null,
  vigente_desde date,
  vigente_hasta date,
  activo boolean not null default true,
  -- null = vale en todas las sedes
  ubicacion_id uuid references retail.ubicaciones(id),
  creado_por uuid references public.personas(id),
  created_at timestamptz not null default now(),
  constraint codigos_descuento_porcentaje_valido check (porcentaje > 0 and porcentaje <= 100),
  constraint codigos_descuento_codigo_formato check (codigo = upper(btrim(codigo)) and length(codigo) between 3 and 20),
  constraint codigos_descuento_vigencia_coherente check (vigente_desde is null or vigente_hasta is null or vigente_desde <= vigente_hasta)
);

comment on table retail.codigos_descuento is
  'Códigos que autorizan a una Colaboradora a descontar en Vender; el % es el tope por línea. Un Líder no los necesita. Se apagan con activo=false, nunca se borran.';

alter table retail.codigos_descuento enable row level security;

create policy codigos_descuento_select on retail.codigos_descuento
  for select using (auth.role() = 'authenticated');
create policy codigos_descuento_insert on retail.codigos_descuento
  for insert with check (retail.fn_es_lider());
create policy codigos_descuento_update on retail.codigos_descuento
  for update using (retail.fn_es_lider()) with check (retail.fn_es_lider());
-- Sin policy de delete: un código que ya se usó es historia.

grant select on retail.codigos_descuento to authenticated;
grant insert, update on retail.codigos_descuento to authenticated;

-- ---------- registrar_venta: aprende p_codigo_descuento ----------
drop function if exists retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text);

create function retail.registrar_venta(
  p_ubicacion_id uuid, p_items jsonb, p_pagos jsonb,
  p_cliente_id uuid default null, p_token uuid default null,
  p_tipo_comprobante text default null,
  p_cliente_tipo_doc text default 'sin_documento',
  p_cliente_num_doc text default null,
  p_cliente_nombre text default null,
  p_codigo_descuento text default null
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

grant execute on function retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text) to authenticated;

comment on function retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text) is
  'Registra una venta con sus ítems, pagos y comprobante en una transacción. Rechaza precios distintos al catálogo (venta_precio_cambiado) y, para una Colaboradora, descuentos sin código válido o por encima de su % (venta_descuento_*).';
