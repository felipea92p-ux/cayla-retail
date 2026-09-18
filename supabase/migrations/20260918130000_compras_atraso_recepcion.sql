-- ============================================================================
-- Compras: saber que un fardo ya debió llegar
--
-- EL PROBLEMA. `estado_recepcion` (20260912234815) solo compara CANTIDADES
-- (recibido_cantidad vs facturado_cantidad) — cero noción de TIEMPO en todo
-- el módulo. `fn_proveedor_metricas_compras` (hoy, 20260918072000) ya cuenta
-- `facturas_con_recepcion_pendiente`, pero sigue sin decir CUÁNTO lleva
-- esperando cada una. `/compras/recibir` no tiene ninguna tarjeta de
-- cabecera, a diferencia de `/compras` y `/compras/por-pagar`.
--
-- LA DECISIÓN (Felipe, 2026-09-17): híbrida. Al registrar la factura se
-- puede tipear una fecha estimada de llegada, opcional. Si se deja vacía, se
-- asume un plazo por defecto de 7 días desde `fecha_emision` — misma ventana
-- que ya usa "vence esta semana" en Por-pagar.
--
-- NOMBRE DE LA COLUMNA. Se llama `fecha_estimada_llegada`, no
-- `fecha_entrega_estimada` (el nombre del primer borrador) — hoy se fusionó
-- `20260918080000_resumen_inventario.sql`, que ya resuelve el mismo problema
-- para TRASLADOS con una columna `traslados.fecha_estimada_llegada` y un
-- `en_camino_atrasado`. Mismo concepto, mismo nombre en las dos tablas — un
-- solo vocabulario para "cuándo se espera que llegue algo" en todo el
-- sistema (principio 11).
--
-- POR QUÉ NO ES UNA COLUMNA GENERADA. "Atrasada" depende de `current_date`,
-- que no es inmutable — Postgres no permite `generated always as` con
-- `current_date`. Se calcula en la vista `compras_resumen` (mismo lugar
-- donde ya se calcula `vencida`, mismo patrón) y en `resumen_compras()` /
-- `fn_proveedor_metricas_compras()`, nunca se guarda.
--
-- DE PASO. El modal de pago necesita el banco/cuenta/teléfono del proveedor
-- (agregados en 20260918120000) para mostrarlos según el método elegido —
-- se agregan a la misma vista, mismo join que ya existe, sin segunda
-- consulta. Y `fn_proveedores()`/`fn_proveedor_metricas_compras()` se tocan
-- una vez más hoy para sumar el conteo de atrasadas — mismo criterio
-- "financiero = solo líder" que ya fijó `20260918073000`.
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. la fecha, opcional ====================
alter table compras
  add column fecha_estimada_llegada date;

-- ==================== 2. registrar_compra acepta la fecha estimada ====================
drop function retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric);
create function retail.registrar_compra(
  p_proveedor_id uuid,
  p_serie text,
  p_numero text,
  p_condicion text,
  p_ubicacion_destino_id uuid,
  p_items jsonb,                       -- [{producto_id, variante_id?, descripcion?, cantidad, costo_unitario}]
  p_tipo text default 'factura',
  p_fecha_emision date default current_date,
  p_fecha_vencimiento date default null,
  p_igv_porcentaje numeric default 18,
  p_pago jsonb default null,           -- {monto, metodo, referencia?, fecha?} o [{monto, metodo, referencia?}] — obligatorio si contado
  p_nota text default null,
  p_total numeric default null,        -- el total del papel, cuando los precios traen el IGV incluido
  p_fecha_estimada_llegada date default null  -- cuándo se espera el fardo; vacío = umbral por defecto (7 días desde emisión)
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_compra_id uuid; v_persona uuid; v_item jsonb;
  v_subtotal numeric(12, 2) := 0; v_igv numeric(12, 2); v_total numeric(12, 2);
  v_producto uuid; v_variante uuid;
  v_tolerancia numeric(12, 2);
  v_pagos jsonb; v_pago jsonb; v_monto numeric(12, 2); v_pago_suma numeric(12, 2) := 0; v_pago_fecha date;
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

  -- validar líneas antes de escribir nada
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

  -- El total del papel manda: el IGV absorbe el redondeo de pasar precios
  -- con IGV a base de 2 decimales. Un centavo por línea, más uno, es lo
  -- máximo que ese redondeo puede mover; más que eso es un error de tipeo.
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

  -- El pago: un objeto (un medio, como siempre) o un arreglo de medios. La
  -- fecha, si viene, va en el objeto o en el primer elemento del arreglo.
  if p_pago is not null then
    if jsonb_typeof(p_pago) = 'object' then
      v_pagos := jsonb_build_array(p_pago);
    elsif jsonb_typeof(p_pago) = 'array' and jsonb_array_length(p_pago) > 0 then
      v_pagos := p_pago;
    else
      raise exception 'El pago necesita al menos un medio con su monto';
    end if;
    v_pago_fecha := coalesce((v_pagos -> 0 ->> 'fecha')::date, current_date);
    for v_pago in select * from jsonb_array_elements(v_pagos) loop
      v_monto := (v_pago ->> 'monto')::numeric;
      if v_monto is null or v_monto <= 0 then
        raise exception 'Cada medio de pago necesita un monto mayor a cero';
      end if;
      if coalesce(v_pago ->> 'metodo', '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro') then
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
    ubicacion_destino_id, subtotal, igv, total, nota, usuario_id, fecha_estimada_llegada
  ) values (
    p_proveedor_id, p_tipo, upper(trim(p_serie)), trim(p_numero), p_fecha_emision, p_condicion,
    case when p_condicion = 'contado' then null else p_fecha_vencimiento end,
    p_ubicacion_destino_id, v_subtotal, v_igv, v_total, p_nota, v_persona, p_fecha_estimada_llegada
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
        );
    end loop;
  end if;

  return v_compra_id;
exception
  when unique_violation then
    raise exception 'La factura %-% de este proveedor ya está registrada', upper(trim(p_serie)), trim(p_numero);
end;
$$;

grant execute on function retail.registrar_compra to authenticated;

-- ==================== 3. la vista: atraso de recepción + datos del proveedor para el pago ====================
-- Mismo patrón que ya usa `vencida` en esta misma vista — columna calculada,
-- no guardada.
create or replace view retail.compras_resumen with (security_invoker = true) as
select
  c.id, c.proveedor_id, p.nombre as proveedor_nombre, p.ruc as proveedor_ruc,
  c.tipo, c.serie, c.numero, c.documento,
  c.fecha_emision, c.condicion, c.fecha_vencimiento, c.ubicacion_destino_id,
  c.subtotal, c.igv, c.total, c.estado, c.nota, c.created_at,
  c.pagado, c.saldo, c.estado_pago,
  c.facturado_cantidad, c.recibido_cantidad, c.estado_recepcion,
  (c.estado = 'vigente' and c.saldo > 0 and c.fecha_vencimiento is not null and c.fecha_vencimiento < current_date) as vencida,
  c.fecha_estimada_llegada,
  (c.estado = 'vigente' and c.estado_recepcion in ('sin_recibir', 'parcial')
    and current_date > coalesce(c.fecha_estimada_llegada, c.fecha_emision + 7)) as recepcion_atrasada,
  p.telefono as proveedor_telefono, p.banco as proveedor_banco, p.cuenta_bancaria as proveedor_cuenta_bancaria
from compras c
join proveedores p on p.id = c.proveedor_id;

-- ==================== 4. resumen_compras: un campo más, mismo candado de sede ====================
drop function retail.resumen_compras();
create function retail.resumen_compras()
returns table (
  registradas bigint, vigentes bigint, por_recibir bigint,
  deuda numeric, con_saldo bigint, vencido numeric, vencidas bigint,
  por_vencer bigint, por_vencer_monto numeric, por_recibir_atrasadas bigint
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select
    (select count(*) from compras where fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select count(*) from compras where estado = 'vigente' and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select count(*) from compras where estado = 'vigente' and estado_recepcion in ('sin_recibir', 'parcial') and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select coalesce(sum(saldo), 0) from compras where estado = 'vigente' and saldo > 0 and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select count(*) from compras where estado = 'vigente' and saldo > 0 and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select coalesce(sum(saldo), 0) from compras where estado = 'vigente' and saldo > 0 and fecha_vencimiento < current_date and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select count(*) from compras where estado = 'vigente' and saldo > 0 and fecha_vencimiento < current_date and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select count(*) from compras where estado = 'vigente' and saldo > 0 and fecha_vencimiento between current_date and current_date + 7 and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select coalesce(sum(saldo), 0) from compras where estado = 'vigente' and saldo > 0 and fecha_vencimiento between current_date and current_date + 7 and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select count(*) from compras where estado = 'vigente' and estado_recepcion in ('sin_recibir', 'parcial')
       and current_date > coalesce(fecha_estimada_llegada, fecha_emision + 7) and fn_puede_operar_ubicacion(ubicacion_destino_id))
  where auth.uid() is not null;
$$;

grant execute on function retail.resumen_compras to authenticated;

-- ==================== 5. fn_proveedores: suma facturas_atrasadas, mismo candado líder ====================
-- Se toca otra vez hoy (venía de 20260918120000, que a su vez venía de
-- 20260918073000) porque este campo necesita `fecha_estimada_llegada`,
-- recién creada arriba. Mismo criterio "financiero = solo líder" fijado hoy.
drop function retail.fn_proveedores();
create function retail.fn_proveedores()
returns table (
  id uuid,
  nombre text,
  ruc text,
  contacto text,
  telefono text,
  banco text,
  cuenta_bancaria text,
  activo boolean,
  facturas bigint,
  total_facturado numeric,
  saldo numeric,
  ultima_compra date,
  facturas_vencidas bigint,
  facturas_recibidas_completas bigint,
  facturas_con_recepcion_pendiente bigint,
  facturas_atrasadas bigint,
  rubro text,
  plazo_credito_dias integer,
  forma_pago_preferida text
)
language sql stable security definer set search_path = retail, public, extensions as $$
  select p.id, p.nombre, p.ruc, p.contacto, p.telefono, p.banco, p.cuenta_bancaria, p.activo,
         case when fn_es_lider() then count(c.id) filter (where c.estado <> 'anulada') end as facturas,
         case when fn_es_lider() then coalesce(sum(c.total) filter (where c.estado <> 'anulada'), 0) end as total_facturado,
         case when fn_es_lider() then coalesce(sum(c.saldo) filter (where c.estado <> 'anulada'), 0) end as saldo,
         case when fn_es_lider() then max(c.fecha_emision) filter (where c.estado <> 'anulada') end as ultima_compra,
         case when fn_es_lider() then count(c.id) filter (where c.estado = 'vigente' and c.saldo > 0 and c.fecha_vencimiento < current_date) end as facturas_vencidas,
         case when fn_es_lider() then count(c.id) filter (where c.estado <> 'anulada' and c.estado_recepcion = 'recibida') end as facturas_recibidas_completas,
         case when fn_es_lider() then count(c.id) filter (where c.estado <> 'anulada' and c.estado_recepcion in ('parcial', 'sin_recibir')) end as facturas_con_recepcion_pendiente,
         case when fn_es_lider() then count(c.id) filter (
           where c.estado = 'vigente' and c.estado_recepcion in ('sin_recibir', 'parcial')
             and current_date > coalesce(c.fecha_estimada_llegada, c.fecha_emision + 7)
         ) end as facturas_atrasadas,
         p.rubro, p.plazo_credito_dias, p.forma_pago_preferida
  from retail.proveedores p
  left join retail.compras c
    on c.proveedor_id = p.id
    and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
  where retail.fn_tiene_acceso_retail()
  group by p.id, p.nombre, p.ruc, p.contacto, p.telefono, p.banco, p.cuenta_bancaria, p.activo, p.rubro, p.plazo_credito_dias, p.forma_pago_preferida
  order by p.activo desc, p.nombre;
$$;

comment on function retail.fn_proveedores() is
  'Directorio de proveedores para cualquiera con cuenta (ficha + contacto + banco). Lo financiero (facturas, montos, saldo, vencidas, recepción, atrasadas) sale NULL si quien pregunta no es líder.';

grant execute on function retail.fn_proveedores() to authenticated;

-- ==================== 6. fn_proveedor_metricas_compras: mismo conteo, para el detalle ====================
-- Mismo motivo, la pantalla de detalle (2026-09-18) merece la misma señal
-- que la lista. Solo líder, como el resto de esta función desde hoy.
drop function retail.fn_proveedor_metricas_compras(uuid);
create function retail.fn_proveedor_metricas_compras(p_proveedor_id uuid)
returns table (
  facturas_vigentes bigint,
  total_facturado numeric,
  saldo numeric,
  ultima_compra date,
  facturas_vencidas bigint,
  facturas_recibidas_completas bigint,
  facturas_con_recepcion_pendiente bigint,
  facturas_atrasadas bigint
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede ver las métricas de un proveedor.';
  end if;
  return query
    select
      count(*) filter (where c.estado <> 'anulada'),
      coalesce(sum(c.total) filter (where c.estado <> 'anulada'), 0),
      coalesce(sum(c.saldo) filter (where c.estado <> 'anulada'), 0),
      max(c.fecha_emision) filter (where c.estado <> 'anulada'),
      count(*) filter (where c.estado = 'vigente' and c.saldo > 0 and c.fecha_vencimiento < current_date),
      count(*) filter (where c.estado <> 'anulada' and c.estado_recepcion = 'recibida'),
      count(*) filter (where c.estado <> 'anulada' and c.estado_recepcion in ('parcial', 'sin_recibir')),
      count(*) filter (
        where c.estado = 'vigente' and c.estado_recepcion in ('sin_recibir', 'parcial')
          and current_date > coalesce(c.fecha_estimada_llegada, c.fecha_emision + 7)
      )
    from retail.compras c
    where c.proveedor_id = p_proveedor_id
      and fn_puede_operar_ubicacion(c.ubicacion_destino_id);
end;
$$;

comment on function retail.fn_proveedor_metricas_compras(uuid) is
  'Solo líder. Prenda terminada: facturado, saldo, vencidas, recepción completa/pendiente/atrasada por tiempo.';

grant execute on function retail.fn_proveedor_metricas_compras(uuid) to authenticated;
