-- Cierra cuatro hallazgos de la revisión de los indicadores de Compras (ADR-0111): H1, H2, H3 y H5.
-- Los documentaba `scripts/pruebas/compras_indicadores.mjs` como `[HALLAZGO Hn]`: pruebas que afirman lo
-- que la función DEBERÍA hacer y que hoy salían con ⚠. Con esta migración pasan a ser pruebas normales.
--
--   H1  fn_proveedor_metricas_compras   «% entregado completo» de la ficha del proveedor contaba con
--       `estado_recepcion = 'recibida'`, y una línea cerrada por faltante deja el comprobante en `recibida`
--       aunque el proveedor NO haya entregado todo. Ahora usa `recibido_cantidad >= facturado_cantidad`, la
--       misma definición de resumen_recepciones() (20260918212000): la ficha y Recibir mercadería coinciden.
--       (`facturas_recibidas_completas` NO cambia: es el conteo de la columna «Recibidas» del listado y su
--       semántica «recibida» es anterior a la decisión D2.)
--   H2  fn_proveedor_devoluciones      «última devolución» era la fecha en que la prenda ENTRÓ a cuarentena
--       (`created_at`); es la fecha en que se le devolvió al proveedor (`resuelto_en`, que escribe
--       resolver_prenda_danada). `coalesce(resuelto_en, created_at)` cubre una fila antigua sin esa fecha.
--   H3  por_pagar_tramos               su comentario promete «los MISMOS filtros que listar_compras» pero no
--       aceptaba el tipo de documento ni el rango de emisión: con `?tipo=boleta` la lista se filtraba y los
--       subtotales seguían sumando TODA la deuda. Ahora acepta p_tipo, p_desde y p_hasta.
--   H5  registrar_pago_compra / registrar_pagos_compra / registrar_compra (pago inicial): los pagos sin fecha
--       explícita tomaban `current_date` (UTC): entre las 7 pm y la medianoche de Lima quedaban fechados
--       «mañana», y eso alimenta `dias_pago_real_promedio` de la ficha. Ahora usan fn_hoy_lima(), como ya hacía
--       registrar_pago_compras (por lote). Solo cambia el valor por defecto: quien manda su fecha no nota nada.
--
-- Cada función se reescribe a partir de su definición REAL en producción (pg_get_functiondef, verificada
-- contra la base el 2026-09-19), no de la del repo, y con la MISMA lista de parámetros: `create or replace`
-- con otra lista crearía una sobrecarga (ADR-0009) y PostgREST dejaría de resolver la llamada. La única
-- firma que cambia es la de por_pagar_tramos (3 parámetros nuevos, todos con default), y por eso se SUELTA
-- la anterior en esta misma migración: sin ese `drop` quedarían dos funciones con el mismo nombre.
--
-- Compatible hacia atrás: la pantalla actual llama a por_pagar_tramos con nombres de parámetro y sin los
-- nuevos, y los defaults los cubren. Sin datos que migrar (en producción hay 0 compras y 0 pagos).
--
-- Fuera de alcance, anotado en el BACKLOG: registrar_compra también tiene `p_fecha_emision date DEFAULT
-- CURRENT_DATE`. Es el mismo defecto de reloj, pero la pantalla siempre manda la fecha del papel y cambiar
-- el default de una fecha de EMISIÓN es una decisión distinta a la de un pago.

-- ==================== H1. «% entregado completo» = recibió todo lo facturado ====================
CREATE OR REPLACE FUNCTION retail.fn_proveedor_metricas_compras(p_proveedor_id uuid)
 RETURNS TABLE(facturas_vigentes bigint, total_facturado numeric, saldo numeric, ultima_compra date, facturas_vencidas bigint, facturas_recibidas_completas bigint, facturas_con_recepcion_pendiente bigint, facturas_atrasadas bigint, facturado_12m numeric, monto_vencido numeric, entregado_completo_pct numeric, dias_entrega_promedio numeric, dias_entrega_muestra integer, dias_pago_real_promedio numeric, dias_pago_muestra integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede ver las métricas de un proveedor.';
  end if;
  return query
    with cs as (
      select c2.* from retail.compras c2
      where c2.proveedor_id = p_proveedor_id and fn_puede_operar_ubicacion(c2.ubicacion_destino_id)
    ),
    -- Días entre la emisión y la llegada de cada guía (misma definición que resumen_recepciones()).
    ent as (
      select c3.id as compra_id,
             greatest(0, (l.fecha_recepcion at time zone 'America/Lima')::date - c3.fecha_emision) as dias
      from cs c3
      join retail.compra_items ci on ci.compra_id = c3.id
      join retail.movimientos m on m.compra_item_id = ci.id
      join retail.lotes l on l.id = m.lote_id
      where c3.estado <> 'anulada'
      group by c3.id, c3.fecha_emision, l.id, l.fecha_recepcion
    ),
    -- Días entre la emisión y el ÚLTIMO pago, de lo pagado por completo a crédito: el plazo real.
    pago as (
      select c4.id as compra_id, (max(pg.fecha) - c4.fecha_emision) as dias
      from cs c4
      join retail.compra_pagos pg on pg.compra_id = c4.id
      where c4.estado = 'vigente' and c4.condicion = 'credito' and c4.estado_pago = 'pagada'
      group by c4.id, c4.fecha_emision
    )
    select
      count(*) filter (where cs.estado <> 'anulada'),
      coalesce(sum(cs.total) filter (where cs.estado <> 'anulada'), 0),
      coalesce(sum(cs.saldo) filter (where cs.estado <> 'anulada'), 0),
      max(cs.fecha_emision) filter (where cs.estado <> 'anulada'),
      count(*) filter (where cs.estado = 'vigente' and cs.saldo > 0 and cs.fecha_vencimiento < fn_hoy_lima()),
      count(*) filter (where cs.estado <> 'anulada' and cs.estado_recepcion = 'recibida'),
      count(*) filter (where cs.estado <> 'anulada' and cs.estado_recepcion in ('parcial', 'sin_recibir')),
      count(*) filter (
        where cs.estado = 'vigente' and cs.estado_recepcion in ('sin_recibir', 'parcial')
          and fn_hoy_lima() > coalesce(cs.fecha_estimada_llegada, cs.fecha_emision + 7)
      ),
      coalesce(sum(cs.total) filter (where cs.estado <> 'anulada' and cs.fecha_emision > fn_hoy_lima() - 365), 0),
      coalesce(sum(cs.saldo) filter (where cs.estado = 'vigente' and cs.saldo > 0 and cs.fecha_vencimiento < fn_hoy_lima()), 0),
      round(100.0 * count(*) filter (where cs.estado <> 'anulada' and cs.recibido_cantidad >= cs.facturado_cantidad)
            / nullif(count(*) filter (where cs.estado <> 'anulada'), 0)),
      (select round(avg(e.dias), 1) from ent e),
      (select count(distinct e.compra_id)::integer from ent e),
      (select case when count(*) >= 2 then round(avg(pa.dias), 1) end from pago pa),
      (select count(*)::integer from pago pa)
    from cs;
end;
$function$;

-- ==================== H2. «última devolución» = el día en que se devolvió ====================
CREATE OR REPLACE FUNCTION retail.fn_proveedor_devoluciones(p_proveedor_id uuid)
 RETURNS TABLE(unidades bigint, ultima date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede ver las devoluciones a un proveedor.';
  end if;
  return query
    select coalesce(sum(pd.cantidad), 0)::bigint,
           max((coalesce(pd.resuelto_en, pd.created_at) at time zone 'America/Lima')::date)
    from retail.prendas_danadas pd
    where pd.proveedor_id = p_proveedor_id and pd.estado = 'devuelta_proveedor';
end;
$function$;

-- ==================== H3. por_pagar_tramos con los mismos filtros que listar_compras ====================
-- Los dos `drop ... if exists` hacen la migración repetible: el primero suelta la firma vieja (la de producción
-- hoy), el segundo la nueva si ya se había creado antes, para que el `create` de abajo no choque.
drop function if exists retail.por_pagar_tramos(uuid, text, boolean, text);
drop function if exists retail.por_pagar_tramos(uuid, text, boolean, text, text, date, date);

create function retail.por_pagar_tramos(
  p_proveedor_id uuid default null,
  p_condicion text default null,
  p_solo_vencidas boolean default false,
  p_busqueda text default null,
  p_tipo text default null,
  p_desde date default null,
  p_hasta date default null
)
returns table (tramo text, comprobantes integer, saldo numeric)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := fn_hoy_lima();
  v_busqueda text := nullif(trim(p_busqueda), '');
  v_proveedores uuid[];
begin
  if auth.uid() is null then
    return;
  end if;
  if v_busqueda is not null then
    select coalesce(array_agg(pr.id), '{}') into v_proveedores
    from proveedores pr where pr.nombre ilike '%' || v_busqueda || '%';
  end if;

  return query
    select t.nombre, count(d.id)::integer, coalesce(sum(d.saldo_comprobante), 0)::numeric
    from (values (1, 'vencidas'), (2, 'semana'), (3, 'despues')) as t(orden, nombre)
    left join (
      select c.id, c.saldo as saldo_comprobante,
        case
          when c.fecha_vencimiento < v_hoy then 'vencidas'
          when coalesce(c.fecha_vencimiento, v_hoy) <= v_hoy + 7 then 'semana'
          else 'despues'
        end as tramo_calculado
      from compras c
      where c.estado = 'vigente' and c.saldo > 0
        and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
        and (p_proveedor_id is null or c.proveedor_id = p_proveedor_id)
        and (p_condicion is null or c.condicion = p_condicion)
        and (p_tipo is null or c.tipo = p_tipo)
        and (not p_solo_vencidas or c.fecha_vencimiento < v_hoy)
        and (p_desde is null or c.fecha_emision >= p_desde)
        and (p_hasta is null or c.fecha_emision <= p_hasta)
        and (v_busqueda is null or c.documento ilike '%' || v_busqueda || '%' or c.proveedor_id = any(v_proveedores))
    ) d on d.tramo_calculado = t.nombre
    group by t.orden, t.nombre
    order by t.orden;
end;
$$;

comment on function retail.por_pagar_tramos(uuid, text, boolean, text, text, date, date) is
  'Subtotal real (toda la deuda filtrada, no la página) de los 3 grupos de Por pagar: vencidas, semana, despues. Mismos filtros que listar_compras (proveedor, condición, solo vencidas, búsqueda, tipo de documento y rango de emisión). Siempre 3 filas. "Hoy" = fn_hoy_lima(). Acotada por sede. ADR-0111.';

revoke all on function retail.por_pagar_tramos(uuid, text, boolean, text, text, date, date) from public, anon;
grant execute on function retail.por_pagar_tramos(uuid, text, boolean, text, text, date, date) to authenticated;

-- ==================== H5. pagos sin fecha explícita = la fecha de Lima ====================
-- Los dos primeros cambian el DEFAULT del parámetro de `CURRENT_DATE` a `NULL` (create or replace lo permite
-- con la misma lista de tipos) y resuelven la fecha dentro con fn_hoy_lima().
CREATE OR REPLACE FUNCTION retail.registrar_pagos_compra(p_compra_id uuid, p_pagos jsonb, p_fecha date DEFAULT NULL::date)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  v_compra compras%rowtype; v_suma numeric(12, 2) := 0;
  v_persona uuid; v_pago jsonb; v_monto numeric(12, 2); v_id uuid; v_ids uuid[] := '{}';
begin
  if not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para registrar pagos a proveedores';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0 then
    raise exception 'El pago necesita al menos un medio con su monto';
  end if;

  -- validar cada medio antes de escribir nada
  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    v_monto := (v_pago ->> 'monto')::numeric;
    if v_monto is null or v_monto <= 0 then
      raise exception 'Cada medio de pago necesita un monto mayor a cero';
    end if;
    if coalesce(v_pago ->> 'metodo', '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro', 'saldo_a_favor') then
      raise exception 'Medio de pago no reconocido: %', coalesce(v_pago ->> 'metodo', '(vacío)');
    end if;
    v_suma := v_suma + v_monto;
  end loop;

  -- bloquea la factura: dos pagos simultáneos no pueden pasarse del saldo
  select * into v_compra from compras where id = p_compra_id for update;
  if not found then
    raise exception 'La compra % no existe', p_compra_id;
  end if;
  if v_compra.estado = 'anulada' then
    raise exception 'La factura %-% está anulada, no acepta pagos', v_compra.serie, v_compra.numero;
  end if;

  -- el saldo ya descuenta pagos Y notas de crédito
  if v_suma > v_compra.saldo then
    raise exception 'El pago (S/ %) supera el saldo pendiente (S/ %)', v_suma, v_compra.saldo;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id)
      values (p_compra_id, coalesce(p_fecha, fn_hoy_lima()), (v_pago ->> 'monto')::numeric, v_pago ->> 'metodo', nullif(trim(coalesce(v_pago ->> 'referencia', '')), ''), v_persona)
      returning id into v_id;
    v_ids := v_ids || v_id;
    if v_pago ->> 'metodo' = 'saldo_a_favor' then
      perform fn_consumir_saldo_favor(v_compra.proveedor_id, (v_pago ->> 'monto')::numeric, p_compra_id, v_id, coalesce(p_fecha, fn_hoy_lima()), v_persona);
    end if;
  end loop;

  return v_ids;
end;
$function$;

CREATE OR REPLACE FUNCTION retail.registrar_pago_compra(p_compra_id uuid, p_monto numeric, p_metodo text, p_referencia text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
begin
  return (registrar_pagos_compra(
    p_compra_id,
    jsonb_build_array(jsonb_build_object('monto', p_monto, 'metodo', p_metodo, 'referencia', p_referencia)),
    p_fecha
  ))[1];
end;
$function$;

-- El pago inicial de registrar_compra: una sola línea cambia (`current_date` → `fn_hoy_lima()`).
CREATE OR REPLACE FUNCTION retail.registrar_compra(p_proveedor_id uuid, p_serie text, p_numero text, p_condicion text, p_ubicacion_destino_id uuid, p_items jsonb, p_tipo text DEFAULT 'factura'::text, p_fecha_emision date DEFAULT CURRENT_DATE, p_fecha_vencimiento date DEFAULT NULL::date, p_igv_porcentaje numeric DEFAULT 18, p_pago jsonb DEFAULT NULL::jsonb, p_nota text DEFAULT NULL::text, p_total numeric DEFAULT NULL::numeric, p_token uuid DEFAULT NULL::uuid, p_fecha_estimada_llegada date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  v_compra_id uuid; v_persona uuid; v_item jsonb;
  v_subtotal numeric(12, 2) := 0; v_igv numeric(12, 2); v_total numeric(12, 2);
  v_producto uuid; v_variante uuid;
  v_tolerancia numeric(12, 2);
  v_pago_id uuid;
  v_pagos jsonb; v_pago jsonb; v_monto numeric(12, 2); v_pago_suma numeric(12, 2) := 0; v_pago_fecha date;
  v_existente compras%rowtype;
  v_constraint text;
begin
  if not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para registrar compras';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Una factura necesita al menos una línea';
  end if;
  if p_condicion not in ('contado', 'credito') then
    raise exception 'La condición debe ser contado o credito';
  end if;
  if p_condicion = 'credito' and p_fecha_vencimiento is null then
    raise exception 'Una compra al crédito necesita fecha de vencimiento';
  end if;
  if p_condicion = 'contado' and p_pago is null then
    raise exception 'Una compra al contado se registra con su pago';
  end if;

  -- Reintento honesto: el primer envío sí llegó, solo se cortó la respuesta.
  -- Se devuelve la compra que ya existe sin volver a escribir nada.
  if p_token is not null then
    select * into v_existente from compras where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_producto := (v_item ->> 'producto_id')::uuid;
    v_variante := (v_item ->> 'variante_id')::uuid;
    if v_producto is null then
      raise exception 'Cada línea necesita producto_id';
    end if;
    if v_variante is not null and not exists (
      select 1 from variantes where id = v_variante and producto_id = v_producto
    ) then
      raise exception 'La variante % no pertenece al producto %', v_variante, v_producto;
    end if;
    if coalesce((v_item ->> 'cantidad')::integer, 0) <= 0 then
      raise exception 'Cada línea necesita cantidad mayor a cero';
    end if;
    v_subtotal := v_subtotal + (v_item ->> 'cantidad')::integer * (v_item ->> 'costo_unitario')::numeric;
  end loop;

  v_igv := round(v_subtotal * coalesce(p_igv_porcentaje, 0) / 100, 2);
  v_total := v_subtotal + v_igv;

  if p_total is not null then
    if p_total < 0 then
      raise exception 'El total no puede ser negativo';
    end if;
    if coalesce(p_igv_porcentaje, 0) = 0 and p_total <> v_subtotal then
      raise exception 'Sin IGV el total tiene que ser igual a la suma de las líneas (S/ %), llegó S/ %', v_subtotal, p_total;
    end if;
    v_tolerancia := 0.01 * (jsonb_array_length(p_items) + 1);
    if abs(p_total - v_total) > v_tolerancia then
      raise exception 'El total del documento (S/ %) no cuadra con sus líneas (S/ %): revisa los costos', p_total, v_total;
    end if;
    v_total := p_total;
    v_igv := p_total - v_subtotal;
  end if;

  if p_pago is not null then
    if jsonb_typeof(p_pago) = 'object' then
      v_pagos := jsonb_build_array(p_pago);
    elsif jsonb_typeof(p_pago) = 'array' and jsonb_array_length(p_pago) > 0 then
      v_pagos := p_pago;
    else
      raise exception 'El pago necesita al menos un medio con su monto';
    end if;
    v_pago_fecha := coalesce((v_pagos -> 0 ->> 'fecha')::date, fn_hoy_lima());
    for v_pago in select * from jsonb_array_elements(v_pagos) loop
      v_monto := (v_pago ->> 'monto')::numeric;
      if v_monto is null or v_monto <= 0 then
        raise exception 'Cada medio de pago necesita un monto mayor a cero';
      end if;
      if coalesce(v_pago ->> 'metodo', '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro', 'saldo_a_favor') then
        raise exception 'Medio de pago no reconocido: %', coalesce(v_pago ->> 'metodo', '(vacío)');
      end if;
      v_pago_suma := v_pago_suma + v_monto;
    end loop;
    if p_condicion = 'contado' and v_pago_suma <> v_total then
      raise exception 'Al contado el pago debe ser el total de la factura (S/ %), se recibió S/ %', v_total, v_pago_suma;
    end if;
    if v_pago_suma > v_total then
      raise exception 'El pago (S/ %) supera el total de la factura (S/ %)', v_pago_suma, v_total;
    end if;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into compras (
    proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento,
    ubicacion_destino_id, subtotal, igv, total, nota, usuario_id, token_cliente, fecha_estimada_llegada
  ) values (
    p_proveedor_id, p_tipo, upper(trim(p_serie)), trim(p_numero), p_fecha_emision, p_condicion,
    case when p_condicion = 'contado' then null else p_fecha_vencimiento end,
    p_ubicacion_destino_id, v_subtotal, v_igv, v_total, p_nota, v_persona, p_token, p_fecha_estimada_llegada
  ) returning id into v_compra_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into compra_items (compra_id, producto_id, variante_id, descripcion, cantidad, costo_unitario)
      values (
        v_compra_id,
        (v_item ->> 'producto_id')::uuid,
        (v_item ->> 'variante_id')::uuid,
        v_item ->> 'descripcion',
        (v_item ->> 'cantidad')::integer,
        (v_item ->> 'costo_unitario')::numeric
      );
  end loop;

  if v_pagos is not null then
    for v_pago in select * from jsonb_array_elements(v_pagos) loop
      insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id)
        values (
          v_compra_id,
          v_pago_fecha,
          (v_pago ->> 'monto')::numeric,
          v_pago ->> 'metodo',
          nullif(trim(coalesce(v_pago ->> 'referencia', '')), ''),
          v_persona
        )
        returning id into v_pago_id;
      -- Saldo a favor del proveedor como medio de pago (ADR-0111): descuenta del libro, con candado por proveedor.
      if v_pago ->> 'metodo' = 'saldo_a_favor' then
        perform fn_consumir_saldo_favor(p_proveedor_id, (v_pago ->> 'monto')::numeric, v_compra_id, v_pago_id, v_pago_fecha, v_persona);
      end if;
    end loop;
  end if;

  return v_compra_id;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'compras_token_cliente_key' then
      select * into v_existente from compras where token_cliente = p_token;
      if found then return v_existente.id; end if;
    end if;
    raise exception 'La factura %-% de este proveedor ya está registrada', upper(trim(p_serie)), trim(p_numero);
end;
$function$;
