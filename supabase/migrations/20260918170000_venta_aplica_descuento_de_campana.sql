-- ============================================================================
-- 20260918170000 — La venta aplica el descuento de campaña de la etiqueta
--
-- QUÉ HACE
--   Una prenda etiquetada con una campaña vigente (Black Friday 20 %) se vende
--   con ese descuento sola: la caja lo calcula y lo manda; `registrar_venta` lo
--   VERIFICA y rechaza lo que no cuadre. Es el paso 3 de ADR-0107; el modelo
--   (`etiquetas.descuento_pct`, `etiqueta_categorias`) ya está en producción
--   desde 20260918160000.
--
-- POR QUÉ LA BASE VERIFICA EN VEZ DE REESCRIBIR
--   Los pagos que la caja suma y el comprobante SUNAT (que guarda las líneas
--   tal cual las manda la caja) ya vienen calculados con el descuento. Si la
--   base lo cambiara por su cuenta, el ticket, los pagos y el comprobante
--   quedarían con tres números distintos. Verificar deja UNA verdad: lo cobrado.
--
-- LAS REGLAS (decididas con Felipe, 2026-09-18)
--   · UN descuento por prenda: el MAYOR entre las campañas que la alcanzan
--     (por etiqueta puesta a mano, `variante_etiquetas`, o por categoría,
--     `etiqueta_categorias`). No se suman.
--   · La campaña no pide código ni motivo escrito ni argumento: la autorizó el
--     Líder al configurarla. Motivo nuevo `campana` + `descuento_etiqueta_id`.
--   · Un descuento manual solo vale si es MAYOR que el de campaña (reemplaza,
--     no se suma) y entonces sigue todas las reglas manuales de siempre:
--     motivo, no bajar del costo, tope de Líder, código de colaboradora. El
--     tope del código es el de la línea completa, así que una colaboradora no
--     puede "mejorar" una campaña salvo que su código permita más que ella.
--   · SIN tope propio para la campaña: puede pasar de 35 % y bajar del costo
--     (una liquidación). El aviso de "por debajo del costo" vive donde el
--     Líder decide (el modal de la campaña), no en el mostrador.
--   · La fecha es la de LIMA, no `current_date` (UTC): pasadas las 7 pm una
--     campaña que termina hoy dejaba de aplicarse con la tienda abierta.
--
-- QUÉ SE RECHAZA (nombres estables; `error-escritura.ts` los vuelve frase)
--   venta_campana_omitida            la prenda tiene campaña hoy y la caja mandó menos
--   venta_campana_sin_etiqueta       motivo campana sin decir de qué etiqueta
--   venta_campana_no_vigente         esa etiqueta no alcanza a la prenda / no está aprobada
--   venta_campana_monto_no_coincide  el monto no es el % de la etiqueta
--   venta_descuento_no_supera_campana  manual menor o igual que la campaña
--
-- VENTA SIN RED: la caja guarda el pedido y lo sube después. Para no perder una
-- venta física porque la campaña terminó entre medio, la base ACEPTA la campaña
-- de una etiqueta terminada hace hasta `c_tolerancia_campana` días (3). Lo que
-- se EXIGE (venta_campana_omitida) sigue siendo solo lo vigente hoy. Si se ve
-- abuso: `descuento_etiqueta_id` + `ventas.created_at` permiten auditarlo, y el
-- paso siguiente sería mandar la fecha de la venta (firma nueva).
--
-- NO CUBRE: `registrar_cambio` (cambio de prenda) y `liquidar_prenda_danada`
-- escriben `venta_items` por su lado y no aplican campañas.
--
-- ORDEN AL DESPLEGAR: pegar esto, desplegar la caja nueva, y RECIÉN ENTONCES
-- configurar una campaña. Con la caja vieja, una prenda en campaña se
-- rechazaría en el mostrador (venta_campana_omitida).
--
-- ESTADO: escrita y probada en un Postgres de prueba el 2026-09-18. NO en
-- producción. Lleva `retail.`; es idempotente.
-- SE ROMPE SI: dos etiquetas con el mismo % alcanzan a la misma prenda y la
-- caja elige una y la base otra — el desempate es el mismo (mayor %, luego
-- nombre, luego id) porque ambas leen `fn_campanas_por_variante`.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- hoy, en Lima ----------
create or replace function retail.fn_hoy_lima() returns date
language sql stable as $$ select (now() at time zone 'America/Lima')::date $$;

comment on function retail.fn_hoy_lima() is
  'Fecha de hoy en Lima. Las vigencias de campaña se miden con esto, no con current_date (UTC).';

-- ---------- la regla, escrita UNA vez ----------
-- Todas las campañas que alcanzan a cada prenda en `p_hoy`. `p_tolerancia_dias`
-- alarga solo el final de la vigencia (venta sin red). La caja y la base leen
-- esta misma función: si la regla cambia, cambia en un solo lugar.
create or replace function retail.fn_campanas_por_variante(
  p_hoy date,
  p_tolerancia_dias integer default 0,
  p_variante_ids uuid[] default null
) returns table (variante_id uuid, etiqueta_id uuid, etiqueta_nombre text, descuento_pct numeric)
language sql stable set search_path = retail, public as $$
  select v.id, e.id, e.nombre, e.descuento_pct
  from retail.variantes v
  join retail.productos p on p.id = v.producto_id
  join retail.etiquetas e
    on e.estado = 'aprobado' and e.activo and e.descuento_pct is not null
   and (e.vigente_desde is null or e.vigente_desde <= p_hoy)
   and (e.vigente_hasta is null or e.vigente_hasta >= p_hoy - p_tolerancia_dias)
  where (p_variante_ids is null or v.id = any (p_variante_ids))
    and (
      exists (select 1 from retail.variante_etiquetas ve where ve.variante_id = v.id and ve.etiqueta_id = e.id)
      or exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = e.id and ec.categoria_id = p.categoria_id)
    )
$$;

comment on function retail.fn_campanas_por_variante(date, integer, uuid[]) is
  'Campañas (etiquetas aprobadas, activas, con % y vigentes) que alcanzan a cada variante: por etiqueta manual o por categoría. Fuente única de la regla, compartida por la caja y registrar_venta.';

-- Lo que la caja pide al abrir Vender: la MEJOR campaña de hoy por prenda.
create or replace function retail.campanas_vigentes()
returns table (variante_id uuid, etiqueta_id uuid, etiqueta_nombre text, descuento_pct numeric)
language sql stable set search_path = retail, public as $$
  select distinct on (c.variante_id) c.variante_id, c.etiqueta_id, c.etiqueta_nombre, c.descuento_pct
  from retail.fn_campanas_por_variante(retail.fn_hoy_lima(), 0, null) c
  order by c.variante_id, c.descuento_pct desc, c.etiqueta_nombre, c.etiqueta_id
$$;

comment on function retail.campanas_vigentes() is
  'La campaña de mayor % que rige HOY (Lima) para cada variante que tiene una. Un solo descuento por prenda: el mayor.';

revoke all on function retail.fn_campanas_por_variante(date, integer, uuid[]) from public;
grant execute on function retail.fn_campanas_por_variante(date, integer, uuid[]) to authenticated;
revoke all on function retail.campanas_vigentes() from public;
grant execute on function retail.campanas_vigentes() to authenticated;

-- ---------- venta_items: de qué campaña vino el descuento ----------
alter table retail.venta_items add column if not exists descuento_etiqueta_id uuid references retail.etiquetas (id);

comment on column retail.venta_items.descuento_etiqueta_id is
  'La etiqueta de campaña que dio el descuento de esta línea. Null si no hubo descuento o fue manual. Va de la mano de motivo_descuento = ''campana''.';

alter table retail.venta_items drop constraint if exists venta_items_motivo_descuento_valido;
alter table retail.venta_items add constraint venta_items_motivo_descuento_valido
  check (motivo_descuento is null or motivo_descuento = any (array[
    'cumpleanos_clienta_top', 'prenda_con_desperfecto', 'liquidacion_temporada', 'cerrar_venta', 'otro', 'campana'
  ]));

-- Los dos lados del mismo hecho: hay motivo 'campana' si y solo si se sabe de
-- qué etiqueta. Un descuento "de campaña" sin etiqueta no se puede auditar.
-- El coalesce importa: con motivo NULL, `motivo = 'campana'` da NULL y un CHECK que da
-- NULL se da por CUMPLIDO — sin él, una fila sin motivo pero con etiqueta se colaba.
alter table retail.venta_items drop constraint if exists venta_items_campana_coherente;
alter table retail.venta_items add constraint venta_items_campana_coherente
  check (coalesce(motivo_descuento = 'campana', false) = (descuento_etiqueta_id is not null));

-- ---------- registrar_venta: verifica la campaña ----------
-- Misma firma de 11 parámetros que ya corre en producción; `create or replace`.
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
