-- ============================================================================
-- 20260919160000 — El vuelto se guarda: venta_pagos.recibido
--
-- QUÉ HACE
--   Agrega `venta_pagos.recibido` (lo que la clienta entregó en efectivo) y hace que
--   `registrar_venta` lo guarde. El vuelto NO se guarda: se calcula (`recibido - monto`),
--   así no hay dos cifras que se puedan desincronizar.
--
-- POR QUÉ
--   Al cobrar, la pantalla de Vender sabe cuánto entregó la clienta, pero solo mandaba
--   `{ metodo, monto }`. Al reimprimir el ticket de una venta ya cerrada no había de
--   dónde sacar el vuelto. Las ventas anteriores a esta migración quedan con `recibido`
--   NULL: su reimpresión sale sin línea de vuelto (es un dato que nunca se guardó).
--
-- CANDADO
--   `recibido` solo existe en efectivo y nunca es menor que lo que cubre (`monto`).
--   El arqueo y el cierre de caja NO cambian: siguen sumando `monto`.
--
-- FIRMA
--   `registrar_venta` conserva sus 11 parámetros: `create or replace` sobre la misma
--   firma. `p_pagos` sigue siendo jsonb; solo se lee una clave más (`recibido`).
--
-- CÓMO SE APLICA EN PRODUCCIÓN
--   Este archivo ya trae el prefijo `retail.` y su `search_path`: se pega entero en el
--   SQL Editor del proyecto cayla-dynamic. APLICARLO ANTES de desplegar el código que
--   lee `venta_pagos.recibido` (el detalle de venta de Caja).
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.venta_pagos add column if not exists recibido numeric(12,2);

comment on column retail.venta_pagos.recibido is
  'Efectivo que la clienta entregó para este pago (solo efectivo). El vuelto es recibido - monto. NULL en las ventas anteriores a 2026-09-19.';

alter table retail.venta_pagos drop constraint if exists venta_pagos_recibido_coherente;
alter table retail.venta_pagos add constraint venta_pagos_recibido_coherente
  check (recibido is null or (metodo = 'efectivo' and recibido >= monto));

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
