-- ============================================================================
-- 20260922143700_vendedora_en_la_venta.sql — CAYLA V2
--
-- QUÉ HACE («quién vendió» en el Punto de venta; spec
-- docs/superpowers/specs/2026-09-21-vendedora-en-el-ticket-design.md)
--   1) `colaboradores.atiende_en_caja`: un líder marca qué colaboradoras atienden en el mostrador
--      de su sede. Solo esas aparecen en la fila «Atendió» del ticket.
--   2) `ventas.vendedora_id`: quién atendió a la clienta. `usuario_id` NO cambia: sigue siendo la
--      sesión que cobró (auditoría de caja y de anulaciones).
--   3) `registrar_venta` gana `p_vendedora_id` (12.º parámetro, default null) y lo valida.
--   4) `fn_vendedoras_de_sede`, `fn_candidatas_vendedora_de_sede` y `marcar_atiende_en_caja`.
--   5) `fn_ventas_del_dia`: el «vendedor» pasa a ser `vendedora_id` y, si no hay, `usuario_id`.
--
-- POR QUÉ. En Tienda TRU hay varias colaboradoras y UN solo equipo de caja: `usuario_id` (la persona
-- de la sesión) no dice quién atendió a la clienta, y ni el ticket ni la boleta lo pueden decir.
--
-- DECISIONES
--   · `registrar_venta` cambia de firma (11 → 12 parámetros): `create or replace` dejaría DOS
--     versiones vivas (lo que tumbó `/productos`), así que se hace `drop function` de la de 11 y
--     `create` de la de 12, todo en la misma transacción. Los permisos se reponen idénticos.
--   · `p_vendedora_id` es opcional: la cola offline ya guardada y los equipos que aún no recargaron
--     siguen mandando 11 parámetros y la venta sale a nombre de la sesión, como hasta hoy.
--   · La marca vive en `colaboradores`. Suspender MUEVE la fila a `colaboradores_suspendidos`
--     (20260922110000): una suspendida sale de la fila del ticket y, al reactivarla, vuelve SIN marca
--     (un líder la marca otra vez). Cambiarla de sede apaga la marca (trigger de abajo).
--
-- SE ROMPE SI
--   · Se despliega la web ANTES de pegar esto: la fila «Atendió» no aparece (la lectura da PGRST202 y
--     se vende como siempre), pero nadie puede marcar a nadie. Orden: migración primero, web después.
--   · El ADR-0150 (roles a medida) agrega roles a `colaboradores`: `rol = 'colaborador'` en estas
--     funciones tendría que revisarse.
--
-- PRODUCCIÓN. Se pega ENTERA en una sola transacción en el SQL Editor de cayla-dynamic (ya trae el
-- `set search_path` y los `retail.`). Re-ejecutable. Después: una sola sobrecarga de `registrar_venta`
-- y `proacl = {postgres=X/postgres,authenticated=X/postgres}`.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1) columnas ----------
alter table retail.colaboradores add column if not exists atiende_en_caja boolean not null default false;
comment on column retail.colaboradores.atiende_en_caja is
  'Un líder la marcó como colaboradora que atiende en el mostrador de su sede: aparece en la fila «Atendió» del Punto de venta. Se apaga al cambiarla de sede y no sobrevive a suspenderla y reactivarla.';

alter table retail.ventas add column if not exists vendedora_id uuid references public.personas (id);
comment on column retail.ventas.vendedora_id is
  'Quién atendió a la clienta (la elige la caja compartida). NULL = no se eligió: vale usuario_id, la sesión que cobró. usuario_id sigue siendo la auditoría de quién operó el equipo.';

-- ---------- 2) cambiarla de sede apaga la marca ----------
create or replace function retail.fn_colaboradores_desmarca_al_cambiar_de_sede() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if new.ubicacion_asignada_id is distinct from old.ubicacion_asignada_id then
    new.atiende_en_caja := false;
  end if;
  return new;
end;
$$;

drop trigger if exists colaboradores_desmarca_al_cambiar_de_sede on retail.colaboradores;
create trigger colaboradores_desmarca_al_cambiar_de_sede
  before update of ubicacion_asignada_id on retail.colaboradores
  for each row execute function retail.fn_colaboradores_desmarca_al_cambiar_de_sede();

-- ---------- 3) el interruptor y sus dos lecturas ----------
create or replace function retail.marcar_atiende_en_caja(p_persona_id uuid, p_atiende boolean) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede elegir quiénes atienden en caja';
  end if;
  update colaboradores set atiende_en_caja = coalesce(p_atiende, false)
   where persona_id = p_persona_id and rol = 'colaborador';
  if not found then
    raise exception 'Solo una colaboradora con acceso activo y sede asignada puede atender en caja — actualiza la pantalla';
  end if;
end;
$$;

-- La fila del ticket: las MARCADAS y ACTIVAS de la sede. La lee cualquiera que opere esa sede
-- (una colaboradora no puede leer `colaboradores` por RLS; por eso es security definer).
create or replace function retail.fn_vendedoras_de_sede(p_ubicacion_id uuid)
returns table (persona_id uuid, nombre text)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select p.id, p.nombres || ' ' || p.apellidos
  from retail.colaboradores c
  join public.personas p on p.id = c.persona_id
  where c.rol = 'colaborador'
    and c.atiende_en_caja
    and c.ubicacion_asignada_id = p_ubicacion_id
    and p.estado = 'activo'
    and fn_puede_operar_ubicacion(p_ubicacion_id)
  order by p.nombres, p.apellidos;
$$;

-- El modal del líder: TODAS las colaboradoras activas de la sede, con su interruptor.
create or replace function retail.fn_candidatas_vendedora_de_sede(p_ubicacion_id uuid)
returns table (persona_id uuid, nombre text, atiende_en_caja boolean)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select p.id, p.nombres || ' ' || p.apellidos, c.atiende_en_caja
  from retail.colaboradores c
  join public.personas p on p.id = c.persona_id
  where fn_es_lider()
    and c.rol = 'colaborador'
    and c.ubicacion_asignada_id = p_ubicacion_id
    and p.estado = 'activo'
  order by p.nombres, p.apellidos;
$$;

-- ---------- 4) registrar_venta: 12 parámetros (drop de la de 11 + create) ----------
drop function if exists retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text);

create function retail.registrar_venta(
  p_ubicacion_id uuid, p_items jsonb, p_pagos jsonb,
  p_cliente_id uuid default null, p_token uuid default null,
  p_tipo_comprobante text default null,
  p_cliente_tipo_doc text default 'sin_documento',
  p_cliente_num_doc text default null,
  p_cliente_nombre text default null,
  p_codigo_descuento text default null,
  p_nota text default null,
  p_vendedora_id uuid default null
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

  -- Quién atendió (la elige la caja compartida; el navegador solo PROPONE). Tiene que ser colaboradora
  -- de ESTA sede. Se acepta también a una suspendida: una venta guardada sin red no debe perderse porque
  -- un líder la suspendió entre que se cobró y se subió. NO se exige el interruptor `atiende_en_caja`
  -- (es comodidad de la pantalla, no un candado). Un líder no tiene sede fija: no es elegible.
  if p_vendedora_id is not null and not exists (
    select 1 from colaboradores
     where persona_id = p_vendedora_id and rol = 'colaborador' and ubicacion_asignada_id = p_ubicacion_id
    union all
    select 1 from colaboradores_suspendidos
     where persona_id = p_vendedora_id and rol = 'colaborador' and ubicacion_asignada_id = p_ubicacion_id
  ) then
    raise exception 'venta_vendedora_no_es_de_la_sede' using detail = p_vendedora_id::text;
  end if;
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
    insert into ventas (ubicacion_id, cliente_id, caja_id, usuario_id, vendedora_id, token_cliente, nota)
      values (p_ubicacion_id, p_cliente_id, v_caja_id, v_persona, p_vendedora_id, p_token, nullif(btrim(p_nota), ''))
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

-- ---------- 5) permisos: EXACTAMENTE los de hoy ({postgres=X/postgres,authenticated=X/postgres}) ----------
revoke all on function retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid) to authenticated;

revoke all on function retail.marcar_atiende_en_caja(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function retail.marcar_atiende_en_caja(uuid, boolean) to authenticated;

revoke all on function retail.fn_vendedoras_de_sede(uuid) from public, anon, authenticated, service_role;
grant execute on function retail.fn_vendedoras_de_sede(uuid) to authenticated;

revoke all on function retail.fn_candidatas_vendedora_de_sede(uuid) from public, anon, authenticated, service_role;
grant execute on function retail.fn_candidatas_vendedora_de_sede(uuid) to authenticated;

-- ---------- 6) fn_ventas_del_dia: misma firma, cambia solo el join del vendedor ----------
create or replace function retail.fn_ventas_del_dia(p_ubicacion_id uuid default null::uuid)
 returns table(venta_id uuid, hora text, ubicacion_nombre text, vendedor text, cliente_nombre text, items jsonb, total numeric, metodos_pago text, comprobante_tipo text, comprobante_texto text, comprobante_estado text, nota text)
 language sql
 stable security definer
 set search_path to 'retail', 'public', 'extensions'
as $function$
  select
    v.id,
    to_char(v.created_at at time zone 'America/Lima', 'HH24:MI'),
    u.nombre,
    coalesce(per.nombres || ' ' || per.apellidos, '—'),
    coalesce(cli.nombre, 'Cliente varios'),
    (select jsonb_agg(jsonb_build_object(
        'referencia', pr.referencia, 'talla', ta.valor, 'color', co.nombre,
        'cantidad', vi.cantidad, 'precio_unitario', vi.precio_unitario
      ) order by vi.id)
      from venta_items vi
      join variantes va on va.id = vi.variante_id
      join productos pr on pr.id = va.producto_id
      left join tallas ta on ta.id = va.talla_id
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
  -- El «vendedor» es quien atendió; si la caja no eligió a nadie (ventas anteriores), la sesión que cobró.
  left join public.personas per on per.id = coalesce(v.vendedora_id, v.usuario_id)
  left join clientes cli on cli.id = v.cliente_id
  -- Un comprobante por venta: el vigente y, entre iguales, el más nuevo (ver arriba).
  left join lateral (
    select c.id, c.tipo, c.serie, c.numero, c.estado
    from comprobantes c
    where c.venta_id = v.id
    order by (c.estado in ('anulado', 'no_emitido')), c.created_at desc, c.id
    limit 1
  ) cmp on true
  where v.estado = 'completada'
    and (v.created_at at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date
    and (
      (fn_es_lider() and (p_ubicacion_id is null or v.ubicacion_id = p_ubicacion_id))
      or (not fn_es_lider() and v.ubicacion_id = fn_ubicacion_actual_persona())
    )
  order by v.created_at desc;
$function$;

comment on function retail.fn_ventas_del_dia(uuid) is
  'Lo vendido hoy (hora de Lima): UNA fila por venta completada, con su comprobante vigente (o el más nuevo si solo hay anulados/no emitidos). El vendedor es quien atendió (ventas.vendedora_id) y, si no se eligió, la sesión que cobró. Un líder ve todas las sedes o la que pida; el resto, la suya. Sin ventas anuladas (ADR-0110).';
