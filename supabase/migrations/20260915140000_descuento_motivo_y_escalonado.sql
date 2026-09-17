-- ============================================================================
-- 20260915140000_descuento_motivo_y_escalonado.sql — CAYLA V2
--
-- Cierra R-45 y D-44 (docs/datos/15-COMO-OPERA-CAYLA.md, DECISIONES-2026-09-12.md),
-- decididos el 2026-09-12 y saltados por la implementación del descuento manual del
-- 2026-09-14 (ADR-0044 adenda 2, ADR-0048): hoy un Líder descuenta cualquier % sin
-- dejar rastro de por qué, y nada impide vender por debajo del costo.
--
-- QUÉ AGREGA, sobre `venta_items` (ya tiene `descuento_unitario` desde 0002_esquema):
--   · `motivo_descuento` — lista cerrada (R-45, punto 2): «un texto libre no se puede
--     sumar; una lista sí, y a fin de mes se ve cuánto margen se fue por cada motivo».
--   · `motivo_descuento_detalle` — el texto de «otro», solo cuando el motivo es «otro».
--   · `argumento_descuento` — el argumento escrito que pide la banda 20-35% (abajo).
--
-- QUÉ CAMBIA EN `registrar_venta` (misma firma de 11 parámetros — sin drop, los tres
-- campos viajan dentro de cada `p_items[]`, igual que `descuento_unitario`):
--   1. Con cualquier descuento > 0: el motivo es obligatorio y tiene que estar en la
--      lista; si es «otro», el detalle no puede venir vacío.
--   2. Ningún descuento puede dejar el precio por debajo del costo — sin importar
--      quién lo aplique. La Encargada no ve `variantes.costo` y no tiene cómo saberlo:
--      el candado frena sin revelar el número (R-45, punto 1).
--   3. El escalonado (R-45) es SOLO del Líder — la Colaboradora sigue con su propio
--      tope, el código (ADR-0048), un mecanismo distinto que Felipe ya gobierna al
--      crear cada código en Studio:
--        · hasta 20%: el Líder sola, como hoy.
--        · 20% a 35%: el Líder, con un argumento escrito.
--        · más de 35%: NADIE — decisión explícita de Felipe (2026-09-15): la base
--          hoy solo distingue Líder/Colaborador, no puede saber si quien está
--          detrás de una sesión de Líder es Felipe o cualquiera de las otras 8
--          personas. El día que haga falta superar el 35% de verdad, se resuelve en
--          Studio (igual que hoy los códigos), no con un bypass en el código.
--
-- LAS DOS CONSTRAINTS NUEVAS QUE DEPENDEN DE ROL VAN `NOT VALID`: 4 filas en local y 9
-- en producción (medido 2026-09-15) ya tienen `descuento_unitario > 0` sin motivo —
-- son historia, no se reescriben (principio 4). `NOT VALID` deja esas filas tal cual
-- y exige el candado solo desde ahora. `venta_items_motivo_descuento_valido` no
-- necesita `NOT VALID`: toda fila vieja tiene `motivo_descuento` NULL, que la
-- constraint ya acepta.
--
-- SE ROMPE SI: se agrega un motivo nuevo a la lista de la app sin agregarlo también
-- acá Y en `apps/web/lib/vender-reglas.ts` (`RAZONES_DESCUENTO`) — las dos listas
-- tienen que decir lo mismo, la de la base manda.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- las tres columnas ----------
alter table retail.venta_items
  add column motivo_descuento text,
  add column motivo_descuento_detalle text,
  add column argumento_descuento text;

comment on column retail.venta_items.motivo_descuento is
  'Por qué se descontó esta línea — lista cerrada (R-45). Null si no hubo descuento.';
comment on column retail.venta_items.motivo_descuento_detalle is
  'El texto de "otro" cuando motivo_descuento lo pide. Null en cualquier otro motivo.';
comment on column retail.venta_items.argumento_descuento is
  'El argumento escrito que exige la banda 20-35% de un Líder (R-45). Null fuera de esa banda.';

alter table retail.venta_items add constraint venta_items_motivo_descuento_valido
  check (motivo_descuento is null or motivo_descuento in (
    'cumpleanos_clienta_top', 'prenda_con_desperfecto', 'liquidacion_temporada', 'cerrar_venta', 'otro'
  ));

alter table retail.venta_items add constraint venta_items_motivo_coherente_con_descuento
  check ((descuento_unitario = 0 and motivo_descuento is null) or (descuento_unitario > 0 and motivo_descuento is not null))
  not valid;

alter table retail.venta_items add constraint venta_items_otro_tiene_detalle
  check (motivo_descuento is distinct from 'otro' or (motivo_descuento_detalle is not null and btrim(motivo_descuento_detalle) <> ''))
  not valid;

-- ---------- registrar_venta: mismos 11 parámetros, valida motivo + costo + escalonado ----------
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
  -- Motivo, detalle y argumento del descuento (20260915140000) — solo se leen y
  -- validan cuando la línea trae descuento_unitario > 0.
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

  -- Cada ítem contra el catálogo, antes de tocar una sola tabla: el precio que
  -- llega tiene que ser el vigente, salvo el Cargo especial (precio libre). Un
  -- descuento > 0 pasa, en el mismo recorrido, por motivo + costo + escalonado.
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

      -- Candado 1 de R-45: nunca por debajo del costo, sin importar el rango
      -- autorizado. Se frena sin revelar el número.
      select costo into v_costo from variantes where id = (v_item ->> 'variante_id')::uuid;
      if (v_item ->> 'precio_unitario')::numeric - v_descuento < v_costo then
        raise exception 'venta_descuento_bajo_costo' using detail = v_referencia || ' (' || v_sku || ')';
      end if;

      -- El escalonado es solo del Líder (R-45); la Colaboradora sigue con su
      -- propio tope, el código, más abajo — un mecanismo distinto.
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

  -- Quién descuenta sin motivo válido ya se frenó arriba. Esto es aparte: el
  -- TOPE de una Colaboradora es el código, no el escalonado de un Líder.
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

grant execute on function retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text) to authenticated;
