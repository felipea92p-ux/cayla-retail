-- ============================================================================
-- 20260923161700_prendas_por_regularizar.sql — CAYLA V2 (ADR-0179, Felipe 2026-09-23)
--
-- EL PROBLEMA. En hora punta llegan a piso prendas que almacén todavía no etiquetó ni
-- registró, y se venden a un precio estimado. El único camino de la caja era «Monto
-- manual»: un monto suelto, sin saber qué prenda fue. El stock real nunca bajaba y la
-- diferencia de precio no se veía. (En producción ni siquiera existía la variante
-- centinela: el botón fallaba. Verificado por el MCP en solo lectura, 2026-09-23.)
--
-- LA DECISIÓN (spec docs/superpowers/specs/2026-09-23-prendas-sin-registrar-design.md):
-- la caja vende sin pedir permiso, pero anota descripción, categoría, talla y color. La
-- línea queda en `prendas_por_regularizar` y almacén la une después con su prenda real
-- (`regularizar_prenda`, migración siguiente).
--
-- POR QUÉ LA LÍNEA NO MUEVE STOCK AL VENDERSE. La prenda no está en el sistema: no hay stock
-- que bajar. Antes se sembraban 999.999 unidades ficticias de la centinela, que ensuciaban el
-- ledger. Ahora el único movimiento de esa prenda es el real, el que escribe almacén al
-- regularizar. Por eso `anular_venta` salta la línea mientras está pendiente.
--
-- QUÉ TOCA. (1) asegura la variante centinela (faltaba en producción); (2) tabla nueva con RLS
-- de solo lectura; (3) `registrar_venta` y `anular_venta` con la MISMA firma (cuerpo copiado
-- de 20260922150000 y 20260922151500 + los bloques marcados «ADR-0179»); (4) triggers: anular
-- la venta saca la prenda de la cola, y un cambio o devolución exige la prenda regularizada.
--
-- PRODUCCIÓN: pegar con OK de Felipe; ya lleva `retail.` en todo el DDL.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. La variante centinela (idempotente) ----------
-- Marca CAYLA / proveedor CAYLA SAC: la misma regla que 20260918231000 usó para lo que no tenía.
insert into retail.productos (id, referencia, descripcion, estado, marca_id, proveedor_id)
values ('11111111-1111-4111-8111-111111111111', 'Prenda sin registrar',
        'Variante centinela: una prenda vendida antes de estar en el sistema. Almacén la regulariza (ADR-0179).', 'activo',
        (select id from retail.marcas where retail.fn_clave_texto(nombre) = 'cayla'),
        (select id from retail.proveedores where retail.fn_clave_texto(nombre) = 'cayla sac'))
on conflict (id) do update set referencia = excluded.referencia, descripcion = excluded.descripcion;

insert into retail.variantes (id, producto_id, sku, precio, costo, activo)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'CARGO-ESPECIAL-01', 0, 0, false)
on conflict (id) do nothing;

-- ---------- 2. La cola ----------
create table if not exists retail.prendas_por_regularizar (
  id uuid primary key default gen_random_uuid(),
  venta_item_id uuid not null unique references retail.venta_items (id),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  descripcion text not null check (btrim(descripcion) <> ''),
  categoria_id uuid not null references retail.categorias (id),
  talla_id uuid not null references retail.tallas (id),
  color_codigo text not null references retail.colores (codigo),
  precio_cobrado numeric(12, 2) not null check (precio_cobrado > 0),
  vendido_por uuid references public.personas (id),
  vendido_en timestamptz not null default now(),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'regularizada', 'anulada')),
  variante_id uuid references retail.variantes (id),
  forma text check (forma in ('ya_registrada', 'llego_nueva')),
  precio_oficial numeric(12, 2),
  diferencia numeric(12, 2),
  regularizado_por uuid references public.personas (id),
  regularizado_en timestamptz,
  -- Regularizada ⇔ trae todo lo de almacén: nunca a medias (principio 2).
  constraint prendas_por_regularizar_completa check (
    (estado = 'regularizada') = (variante_id is not null and forma is not null and precio_oficial is not null
                                  and diferencia is not null and regularizado_en is not null)
  )
);
comment on table retail.prendas_por_regularizar is
  'Prenda vendida en caja antes de estar en el sistema (ADR-0179). Nace pendiente en registrar_venta; almacén la une a su variante real con regularizar_prenda. diferencia = precio_cobrado − precio_oficial: negativa = descuento no planificado, positiva = sobreprecio.';
create index if not exists prendas_por_regularizar_pendientes_idx
  on retail.prendas_por_regularizar (ubicacion_id, vendido_en) where estado = 'pendiente';

alter table retail.prendas_por_regularizar enable row level security;
-- Solo lectura desde el navegador; escriben registrar_venta y regularizar_prenda (security definer).
drop policy if exists prendas_por_regularizar_select on retail.prendas_por_regularizar;
create policy prendas_por_regularizar_select on retail.prendas_por_regularizar for select
  using (retail.fn_puede_operar_ubicacion(ubicacion_id));
revoke all on retail.prendas_por_regularizar from public, anon;
grant select on retail.prendas_por_regularizar to authenticated;

-- ---------- 3a. registrar_venta (misma firma; cuerpo de 20260922150000 + bloques «ADR-0179») ----------

create or replace function retail.registrar_venta(
  p_ubicacion_id uuid, p_items jsonb, p_pagos jsonb,
  p_cliente_id uuid default null, p_token uuid default null,
  p_tipo_comprobante text default null,
  p_cliente_tipo_doc text default 'sin_documento',
  p_cliente_num_doc text default null,
  p_cliente_nombre text default null,
  p_codigo_descuento text default null,
  p_nota text default null,
  -- ---------- nuevo desde acá (D-56/57/62/67/85/86/87, 2026-09-22) ----------
  p_asesora_id uuid default null,
  p_emisor text default 'retail',
  p_descuento_pct numeric default 0,
  p_autorizado_por uuid default null,
  p_motivo_descuento text default null
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
  -- Días después de terminar que la base todavía ACEPTA el descuento de una
  -- campaña (venta hecha sin red y subida más tarde). No afecta lo que se exige.
  c_tolerancia_campana constant integer := 3;
  v_descuento numeric;
  v_hay_descuento boolean := false;  -- descuento MANUAL (el que pide código a una colaboradora)
  v_codigo codigos_descuento%rowtype;
  v_codigo_limpio text := upper(btrim(coalesce(p_codigo_descuento, '')));
  v_motivo text; v_motivo_otro text; v_argumento text;
  v_hoy date := fn_hoy_lima();
  v_c_id uuid; v_c_nombre text; v_c_pct numeric; v_c_unit numeric;
  v_etq_id uuid; v_etq_pct numeric;
  v_tope_descuento numeric;  -- D-67: tope de descuento de VENTA de quien vende (NULL = sin tope)
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
  if p_emisor not in ('alegra', 'retail') then
    raise exception 'p_emisor solo puede ser "alegra" o "retail" (se pidió %)', p_emisor;
  end if;
  if p_descuento_pct < 0 or p_descuento_pct > 100 then
    raise exception 'El descuento de la venta debe estar entre 0%% y 100%% (se pidió %)', p_descuento_pct;
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

  -- D-67: descuento a nivel de VENTA (distinto del descuento por línea, que sigue su propio
  -- candado más abajo sin cambios). Solo se evalúa si de verdad se pidió uno.
  if p_descuento_pct > 0 then
    select tope_descuento_pct into v_tope_descuento from colaboradores where persona_id = v_persona;
    if v_tope_descuento is not null and p_descuento_pct > v_tope_descuento then
      if p_autorizado_por is null or not fn_es_lider_persona(p_autorizado_por) then
        raise exception 'Ese descuento (%.2f%%) supera tu tope (%.2f%%) — necesita la autorización de un líder de equipo', p_descuento_pct, v_tope_descuento
          using errcode = '42501';
      end if;
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select v.precio, p.referencia, v.sku
      into v_precio_catalogo, v_referencia, v_sku
      from variantes v join productos p on p.id = v.producto_id
      where v.id = (v_item ->> 'variante_id')::uuid;
    if v_precio_catalogo is null then
      raise exception 'La variante % no existe', v_item ->> 'variante_id';
    end if;

    -- ADR-0179: una prenda sin registrar sin sus datos no se puede regularizar después.
    if (v_item ->> 'variante_id')::uuid = c_cargo_especial and (
         btrim(coalesce(v_item ->> 'descripcion_libre', '')) = ''
         or nullif(v_item ->> 'categoria_id', '') is null
         or nullif(v_item ->> 'talla_id', '') is null
         or nullif(v_item ->> 'color_codigo', '') is null
         or (v_item ->> 'cantidad')::integer <> 1
         or (v_item ->> 'precio_unitario')::numeric - coalesce((v_item ->> 'descuento_unitario')::numeric, 0) <= 0) then
      raise exception 'prenda_sin_registrar_incompleta'
        using hint = 'Una prenda sin registrar necesita descripción, categoría, talla, color, precio y cantidad 1';
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
    v_motivo := btrim(coalesce(v_item ->> 'motivo_descuento', ''));

    -- La campaña que RIGE HOY para esta prenda (la de mayor %). El "Monto
    -- manual" no es una prenda del catálogo: no entra en campañas.
    v_c_id := null; v_c_nombre := null; v_c_pct := null;
    if (v_item ->> 'variante_id')::uuid <> c_cargo_especial then
      select c.etiqueta_id, c.etiqueta_nombre, c.descuento_pct
        into v_c_id, v_c_nombre, v_c_pct
        from fn_campanas_por_variante(v_hoy, 0, array[(v_item ->> 'variante_id')::uuid]) c
        order by c.descuento_pct desc, c.etiqueta_nombre, c.etiqueta_id
        limit 1;
    end if;
    v_c_unit := case when v_c_pct is null then 0
                     else round((v_item ->> 'precio_unitario')::numeric * v_c_pct / 100, 2) end;

    -- Lo EXIGIDO: si la prenda tiene campaña hoy, la clienta la recibe. La caja
    -- no puede cobrar menos descuento (el 0,01 absorbe el redondeo del navegador).
    if v_c_id is not null and v_descuento < v_c_unit - 0.01 then
      raise exception 'venta_campana_omitida'
        using detail = v_referencia || ' (' || v_sku || ')',
              hint = format('«%s» da %s %% y la caja mandó S/%s de descuento', v_c_nombre,
                            trim(trailing '.' from trim(trailing '0' from v_c_pct::text)), v_descuento);
    end if;

    if v_motivo = 'campana' then
      -- Descuento de campaña: se verifica contra la etiqueta que la caja dice
      -- (aceptando una terminada hace pocos días, por la venta sin red).
      v_etq_id := nullif(btrim(coalesce(v_item ->> 'descuento_etiqueta_id', '')), '')::uuid;
      if v_etq_id is null then
        raise exception 'venta_campana_sin_etiqueta' using detail = v_referencia || ' (' || v_sku || ')';
      end if;
      select c.descuento_pct into v_etq_pct
        from fn_campanas_por_variante(v_hoy, c_tolerancia_campana, array[(v_item ->> 'variante_id')::uuid]) c
        where c.etiqueta_id = v_etq_id;
      if not found then
        raise exception 'venta_campana_no_vigente' using detail = v_referencia || ' (' || v_sku || ')';
      end if;
      if v_descuento <= 0
         or abs(v_descuento - round((v_item ->> 'precio_unitario')::numeric * v_etq_pct / 100, 2)) > 0.011 then
        raise exception 'venta_campana_monto_no_coincide'
          using detail = v_referencia || ' (' || v_sku || ')',
                hint = format('La etiqueta da %s %% y la caja mandó S/%s de descuento',
                              trim(trailing '.' from trim(trailing '0' from v_etq_pct::text)), v_descuento);
      end if;

    elsif v_descuento > 0 then
      -- Descuento MANUAL. Con campaña, solo vale si la supera: un solo descuento.
      if v_c_id is not null and v_descuento <= v_c_unit + 0.01 then
        raise exception 'venta_descuento_no_supera_campana'
          using detail = v_referencia || ' (' || v_sku || ')',
                hint = format('«%s» ya da S/%s por prenda', v_c_nombre, v_c_unit);
      end if;

      v_hay_descuento := true;

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

  -- El código de una colaboradora autoriza solo los descuentos MANUALES: una
  -- campaña no lo pide (y una línea de campaña no cuenta contra el tope).
  if v_hay_descuento and not fn_es_lider() then
    if v_codigo_limpio = '' then
      raise exception 'venta_descuento_requiere_codigo';
    end if;
    select * into v_codigo from codigos_descuento
      where codigo = v_codigo_limpio
        and activo
        and (vigente_desde is null or vigente_desde <= v_hoy)
        and (vigente_hasta is null or vigente_hasta >= v_hoy)
        and (ubicacion_id is null or ubicacion_id = p_ubicacion_id);
    if not found then
      raise exception 'venta_codigo_descuento_invalido' using detail = v_codigo_limpio;
    end if;
    for v_item in select * from jsonb_array_elements(p_items) loop
      if btrim(coalesce(v_item ->> 'motivo_descuento', '')) <> 'campana'
         and coalesce((v_item ->> 'descuento_unitario')::numeric, 0)
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
    insert into ventas (
      ubicacion_id, cliente_id, caja_id, usuario_id, token_cliente, nota,
      asesora_id, emisor, descuento_pct, descuento_autorizado_por, descuento_motivo
    )
      values (
        p_ubicacion_id, p_cliente_id, v_caja_id, v_persona, p_token, nullif(btrim(p_nota), ''),
        p_asesora_id, p_emisor, p_descuento_pct, p_autorizado_por,
        nullif(btrim(coalesce(p_motivo_descuento, '')), '')
      )
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
      motivo_descuento, motivo_descuento_detalle, argumento_descuento, descuento_etiqueta_id
    )
      values (
        v_venta_id, (v_item ->> 'variante_id')::uuid, (v_item ->> 'cantidad')::integer,
        (v_item ->> 'precio_unitario')::numeric, coalesce((v_item ->> 'descuento_unitario')::numeric, 0), v_costo,
        nullif(btrim(coalesce(v_item ->> 'motivo_descuento', '')), ''),
        nullif(btrim(coalesce(v_item ->> 'motivo_descuento_detalle', '')), ''),
        nullif(btrim(coalesce(v_item ->> 'argumento_descuento', '')), ''),
        case when btrim(coalesce(v_item ->> 'motivo_descuento', '')) = 'campana'
             then nullif(btrim(coalesce(v_item ->> 'descuento_etiqueta_id', '')), '')::uuid end
      )
      returning id into v_item_id;

    -- ADR-0179: la prenda sin registrar no mueve stock (no está en el sistema); queda en la cola
    -- y su único movimiento es el real, el que escribe almacén al regularizarla.
    if (v_item ->> 'variante_id')::uuid = c_cargo_especial then
      insert into prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id,
                                           color_codigo, precio_cobrado, vendido_por)
        values (v_item_id, p_ubicacion_id, btrim(v_item ->> 'descripcion_libre'),
                (v_item ->> 'categoria_id')::uuid, (v_item ->> 'talla_id')::uuid, v_item ->> 'color_codigo',
                (v_item ->> 'precio_unitario')::numeric - coalesce((v_item ->> 'descuento_unitario')::numeric, 0),
                coalesce(p_asesora_id, v_persona));
      continue;
    end if;

    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, v_sub, 'salida',
              (v_item ->> 'cantidad')::integer, 'venta', v_item_id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);
  end loop;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    -- `recibido`: lo que la clienta entregó en efectivo (para reimprimir el ticket con su
    -- vuelto). Solo cuenta en efectivo; cualquier otro medio lo deja en NULL.
    insert into venta_pagos (venta_id, metodo, monto, recibido)
      values (
        v_venta_id, v_pago ->> 'metodo', (v_pago ->> 'monto')::numeric,
        case when v_pago ->> 'metodo' = 'efectivo' then nullif(v_pago ->> 'recibido', '')::numeric end
      );
  end loop;

  -- D-56: solo retail reserva comprobante. Cuando el emisor es Alegra, la venta queda
  -- registrada completa (stock, caja, pagos) y el comprobante se emite aparte, en Alegra.
  if p_tipo_comprobante is not null and p_emisor = 'retail' then
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

revoke all on function retail.registrar_venta(
  uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text
) from public, anon;
grant execute on function retail.registrar_venta(
  uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text
) to authenticated;

-- ---------- 3b. anular_venta (misma firma; cuerpo de 20260922151500 + bloque «ADR-0179») ----------

create or replace function retail.anular_venta(
  p_venta_id uuid, p_motivo text, p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_venta ventas%rowtype;
  v_caja_estado text;
  v_persona uuid;
  v_item jsonb;
  v_venta_item venta_items%rowtype;
  v_salida movimientos%rowtype;
  v_salidas integer;
  v_mov_id uuid;
  v_condicion text;
  v_items_venta integer;
  v_items_input integer;
  v_items_distintos integer;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede anular una venta';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Anular una venta necesita un motivo';
  end if;

  -- `for update` primero: una devolución o un cambio de esta misma venta que llegue al
  -- mismo tiempo espera acá (su disparador pide `for share` sobre esta fila).
  select * into v_venta from ventas where id = p_venta_id for update;
  if not found then
    raise exception 'La venta % no existe', p_venta_id;
  end if;
  if v_venta.estado = 'anulada' then
    raise exception 'Esta venta ya está anulada';
  end if;

  if v_venta.caja_id is null then
    raise exception 'Esta venta no tiene caja registrada — no se puede confirmar que sigue abierta';
  end if;
  select estado into v_caja_estado from cajas where id = v_venta.caja_id;
  if v_caja_estado is distinct from 'abierta' then
    raise exception 'La caja de esta venta ya cerró — a partir de ahí, usa Cambio o Devolución';
  end if;

  if exists (
    select 1 from comprobantes where venta_id = p_venta_id and estado in ('enviado', 'aceptado')
  ) then
    raise exception 'Esta venta ya tiene un comprobante enviado o aceptado por SUNAT — usa Cambio o Devolución en su lugar';
  end if;

  -- Un ítem ya tocado por Cambios o Devoluciones no puede volver a contarse acá:
  -- anular movería stock de nuevo sobre una cantidad que ese otro camino ya movió.
  if exists (
    select 1 from venta_items vi
    where vi.venta_id = p_venta_id
      and (
        exists (select 1 from cambios ca where ca.venta_item_id = vi.id)
        or exists (
          select 1 from devolucion_items di join devoluciones d on d.id = di.devolucion_id
          where di.venta_item_id = vi.id and d.estado <> 'rechazada'
        )
      )
  ) then
    raise exception 'Esta venta ya tiene un cambio o una devolución registrada — resuelve sus ítems por separado en vez de anular la venta completa';
  end if;

  -- Cada línea de la venta, una vez cada una. Contar solo cuántas llegan dejaba pasar
  -- una línea repetida en lugar de otra.
  select count(*) into v_items_venta from venta_items where venta_id = p_venta_id;
  select count(*), count(distinct e ->> 'venta_item_id')
    into v_items_input, v_items_distintos
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e;
  if v_items_input <> v_items_venta or v_items_distintos <> v_items_venta then
    raise exception 'Anular una venta necesita la condición de cada una de sus % líneas, una vez cada una (llegaron %)',
      v_items_venta, v_items_input;
  end if;

  select id into v_persona from public.personas where auth_user_id = auth.uid();

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_venta_item from venta_items
      where id = (v_item ->> 'venta_item_id')::uuid and venta_id = p_venta_id;
    if not found then
      raise exception 'El ítem % no pertenece a la venta %', v_item ->> 'venta_item_id', p_venta_id;
    end if;
    v_condicion := v_item ->> 'condicion';
    v_mov_id := null;

    -- ADR-0179: una prenda sin registrar todavía pendiente nunca movió stock — no hay nada que
    -- devolver. (Ya regularizada, su línea apunta a la variante real y tiene su salida `venta`.)
    if v_condicion = 'vendible' and v_venta_item.variante_id = '22222222-2222-4222-8222-222222222222' then
      null;
    elsif v_condicion = 'vendible' then
      select count(*) into v_salidas from movimientos
        where venta_item_id = v_venta_item.id and tipo = 'salida' and motivo = 'venta';
      if v_salidas <> 1 then
        raise exception 'La línea % tiene % salidas de stock por venta registradas (se esperaba 1) — esta venta necesita revisarse a mano, no anularse',
          v_venta_item.id, v_salidas;
      end if;
      select * into v_salida from movimientos
        where venta_item_id = v_venta_item.id and tipo = 'salida' and motivo = 'venta';

      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
        values (v_salida.variante_id, v_salida.ubicacion_id, v_salida.sububicacion_id, 'entrada', v_salida.cantidad,
                'anulacion_venta', v_venta_item.id, v_persona)
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
    end if;

    insert into venta_anulacion_items (venta_id, venta_item_id, condicion, movimiento_id)
      values (p_venta_id, v_venta_item.id, v_condicion, v_mov_id);
  end loop;

  update ventas set estado = 'anulada', motivo_anulacion = p_motivo, anulado_por = v_persona, anulado_en = now()
    where id = p_venta_id;

  -- Un comprobante PENDIENTE (o ya en la cola de reintento — D-60, agregado acá) de esta venta
  -- reservó su número pero nunca se transmitió con éxito. Con la venta anulada no hay nada que
  -- declarar: se libera igual que «Liberar sin espera» (ADR-0093). El número queda sin usar.
  --   · Uno `rechazado` NO se toca: ya llegó a SUNAT (ADR-0093).
  --   · Uno `enviado` o `aceptado` no llega hasta acá: frenó la anulación más arriba.
  --   · Los que ya estaban `no_emitido` o `anulado` quedan como estaban.
  update comprobantes set
      estado = 'no_emitido',
      motivo_no_emitido = 'Venta anulada: ' || btrim(p_motivo),
      marcado_no_emitido_por = v_persona,
      marcado_no_emitido_at = now()
    where venta_id = p_venta_id and estado in ('pendiente', 'pendiente_reintento');
end;
$$;

revoke all on function retail.anular_venta(uuid, text, jsonb) from public, anon;
grant execute on function retail.anular_venta(uuid, text, jsonb) to authenticated;

-- ---------- 4. Triggers ----------

-- Anular la venta saca de la cola lo que seguía pendiente.
create or replace function retail.fn_prendas_por_regularizar_al_anular()
returns trigger
language plpgsql
security definer
set search_path = retail, public
as $$
begin
  if new.estado = 'anulada' and old.estado is distinct from 'anulada' then
    update prendas_por_regularizar p set estado = 'anulada'
      from venta_items vi
      where vi.id = p.venta_item_id and vi.venta_id = new.id and p.estado = 'pendiente';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_prendas_por_regularizar_al_anular on retail.ventas;
create trigger trg_prendas_por_regularizar_al_anular after update of estado on retail.ventas
  for each row execute function retail.fn_prendas_por_regularizar_al_anular();

-- Cambio o devolución de una prenda que almacén aún no identificó: no se sabe a qué stock vuelve.
create or replace function retail.fn_exige_prenda_regularizada()
returns trigger
language plpgsql
security definer
set search_path = retail, public
as $$
begin
  if exists (select 1 from prendas_por_regularizar where venta_item_id = new.venta_item_id and estado = 'pendiente') then
    raise exception 'prenda_sin_regularizar'
      using hint = 'Pide a almacén que regularice esta prenda (Recibir ▸ Por regularizar) antes de cambiarla o devolverla';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_cambios_exige_regularizada on retail.cambios;
create trigger trg_cambios_exige_regularizada before insert on retail.cambios
  for each row execute function retail.fn_exige_prenda_regularizada();
drop trigger if exists trg_devolucion_items_exige_regularizada on retail.devolucion_items;
create trigger trg_devolucion_items_exige_regularizada before insert on retail.devolucion_items
  for each row execute function retail.fn_exige_prenda_regularizada();

revoke all on function retail.fn_prendas_por_regularizar_al_anular() from public, anon, authenticated;
revoke all on function retail.fn_exige_prenda_regularizada() from public, anon, authenticated;

select retail.fn_rls_una_vez_por_consulta();
