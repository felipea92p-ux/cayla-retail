-- ============================================================================
-- 0008_caja_y_pagos.sql — CAYLA V2
--
-- Caja/POS y pagos múltiples (Prioridad 1 del roadmap, 2026-09-12). Van en
-- la misma migración porque son una sola capacidad, no dos: el cuadre de
-- caja necesita saber cuánto de lo vendido fue EFECTIVO específicamente
-- (tarjeta/yape/plin/transferencia no tocan el cajón físico) — separar el
-- pago por método es lo que hace posible calcular el cuadre, no un extra
-- aparte.
--
-- DECISIÓN (Felipe, 2026-09-12): a partir de ahora `registrar_venta` EXIGE
-- una caja abierta en la ubicación. Antes de esto no existía el concepto de
-- caja y cualquier venta se aceptaba; el roadmap pide expresamente "abrir
-- caja" como paso previo a "registrar venta" — una venta sin caja no se
-- puede cuadrar nunca, así que se vuelve un estado imposible del esquema en
-- vez de una regla que alguien podría olvidar validar en la UI.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- caja ----------
create table retail.cajas (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones(id),
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  monto_apertura numeric(12,2) not null check (monto_apertura >= 0),
  abierta_por uuid references retail.personas(id),
  abierta_en timestamptz not null default now(),
  monto_cierre_sistema numeric(12,2),
  monto_cierre_real numeric(12,2),
  diferencia numeric(12,2),
  cerrada_por uuid references retail.personas(id),
  cerrada_en timestamptz,
  nota text
);
-- Nunca dos cajas abiertas a la vez en la misma ubicación: el propio índice
-- lo hace irrepresentable, no algo que una RPC futura podría olvidar validar.
create unique index cajas_ubicacion_abierta_unica on retail.cajas (ubicacion_id) where estado = 'abierta';

create table retail.caja_movimientos (
  id uuid primary key default gen_random_uuid(),
  caja_id uuid not null references retail.cajas(id),
  tipo text not null check (tipo in ('ingreso', 'egreso')),
  monto numeric(12,2) not null check (monto > 0),
  motivo text not null,
  usuario_id uuid references retail.personas(id),
  created_at timestamptz not null default now()
);
-- "Retiro de efectivo" del roadmap es un egreso con motivo='retiro' — no una
-- tabla propia: sería el mismo caso especial que el criterio del repo pide
-- eliminar (ver 0006, misma razón para no separar las 4 acciones de persona).
create index caja_movimientos_caja_idx on retail.caja_movimientos (caja_id);

-- ---------- pagos múltiples ----------
alter table retail.ventas add column caja_id uuid references retail.cajas(id);
alter table retail.ventas drop column metodo_pago;
-- Reemplazado por venta_pagos: una venta puede pagarse con más de un método
-- (pago mixto, ej. parte efectivo + parte Yape). Mantener la columna vieja
-- en paralelo con la tabla nueva sería dos fuentes de verdad para el mismo
-- dato — se elimina, no se deja "por compatibilidad".

create table retail.venta_pagos (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references retail.ventas(id),
  metodo text not null check (metodo in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia')),
  monto numeric(12,2) not null check (monto > 0)
);
create index venta_pagos_venta_idx on retail.venta_pagos (venta_id);

-- ---------- registrar_venta: ahora exige caja y pagos múltiples ----------
-- `create or replace` NO alcanza acá: el tercer parámetro cambia de tipo
-- (text -> jsonb), así que para Postgres es una firma distinta y `replace`
-- dejaría dos funciones `registrar_venta` sobrecargadas en vez de una sola
-- actualizada. Se elimina la firma vieja explícitamente primero.
drop function if exists retail.registrar_venta(uuid, jsonb, text, uuid, uuid);

create or replace function retail.registrar_venta(
  p_ubicacion_id uuid, p_items jsonb, p_pagos jsonb,
  p_cliente_id uuid default null, p_token uuid default null
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

  return v_venta_id;
end;
$$;

-- ---------- abrir caja ----------
create function retail.abrir_caja(p_ubicacion_id uuid, p_monto_apertura numeric)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_caja_id uuid; v_persona uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para abrir caja en esa ubicación';
  end if;
  if p_monto_apertura < 0 then
    raise exception 'El monto de apertura no puede ser negativo';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  insert into cajas (ubicacion_id, monto_apertura, abierta_por)
    values (p_ubicacion_id, p_monto_apertura, v_persona)
    returning id into v_caja_id;
  return v_caja_id;
end;
$$;

-- ---------- ingreso / egreso / retiro de efectivo ----------
create function retail.registrar_movimiento_caja(p_caja_id uuid, p_tipo text, p_monto numeric, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_caja cajas%rowtype; v_persona uuid; v_id uuid;
begin
  select * into v_caja from cajas where id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id;
  end if;
  if not fn_puede_operar_ubicacion(v_caja.ubicacion_id) then
    raise exception 'No tienes permiso para operar esa caja';
  end if;
  if v_caja.estado <> 'abierta' then
    raise exception 'Esta caja ya está cerrada — no se pueden registrar más movimientos ahí';
  end if;
  if p_tipo not in ('ingreso', 'egreso') then
    raise exception 'Tipo de movimiento de caja inválido: %', p_tipo;
  end if;
  if p_monto <= 0 then
    raise exception 'El monto debe ser mayor que cero';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Todo movimiento de caja necesita un motivo';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();
  insert into caja_movimientos (caja_id, tipo, monto, motivo, usuario_id)
    values (p_caja_id, p_tipo, p_monto, p_motivo, v_persona)
    returning id into v_id;
  return v_id;
end;
$$;

-- ---------- cerrar caja (cuadre) ----------
create function retail.cerrar_caja(p_caja_id uuid, p_monto_real numeric)
returns table (monto_sistema numeric, monto_real numeric, diferencia numeric)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_caja cajas%rowtype;
  v_ventas_efectivo numeric;
  v_ingresos numeric;
  v_egresos numeric;
  v_sistema numeric;
  v_persona uuid;
begin
  select * into v_caja from cajas where id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id;
  end if;
  if not fn_puede_operar_ubicacion(v_caja.ubicacion_id) then
    raise exception 'No tienes permiso para cerrar esa caja';
  end if;
  if v_caja.estado <> 'abierta' then
    raise exception 'Esta caja ya está cerrada';
  end if;
  if p_monto_real < 0 then
    raise exception 'El monto contado no puede ser negativo';
  end if;

  select coalesce(sum(vp.monto), 0) into v_ventas_efectivo
    from venta_pagos vp join ventas v on v.id = vp.venta_id
    where v.caja_id = p_caja_id and vp.metodo = 'efectivo';

  select coalesce(sum(monto) filter (where tipo = 'ingreso'), 0),
         coalesce(sum(monto) filter (where tipo = 'egreso'), 0)
    into v_ingresos, v_egresos
    from caja_movimientos where caja_id = p_caja_id;

  v_sistema := v_caja.monto_apertura + v_ventas_efectivo + v_ingresos - v_egresos;
  select id into v_persona from personas where auth_user_id = auth.uid();

  update cajas set
    estado = 'cerrada',
    monto_cierre_sistema = v_sistema,
    monto_cierre_real = p_monto_real,
    diferencia = p_monto_real - v_sistema,
    cerrada_por = v_persona,
    cerrada_en = now()
  where id = p_caja_id;

  return query select v_sistema, p_monto_real, p_monto_real - v_sistema;
end;
$$;

-- ---------- RLS ----------
alter table retail.cajas enable row level security;
create policy cajas_select on retail.cajas for select
  using (retail.fn_puede_operar_ubicacion(ubicacion_id));

alter table retail.caja_movimientos enable row level security;
create policy caja_movimientos_select on retail.caja_movimientos for select
  using (exists (select 1 from retail.cajas c where c.id = caja_id and retail.fn_puede_operar_ubicacion(c.ubicacion_id)));

alter table retail.venta_pagos enable row level security;
create policy venta_pagos_select on retail.venta_pagos for select
  using (exists (select 1 from retail.ventas v where v.id = venta_id and retail.fn_puede_operar_ubicacion(v.ubicacion_id)));
-- Ninguna de las tres lleva policy de escritura directa: abrir_caja/
-- registrar_movimiento_caja/cerrar_caja (security definer) son el único
-- camino — mismo patrón que conteo_items, reforzado acá porque esto es
-- dinero, no solo inventario.

-- ---------- grants ----------
grant select on retail.cajas to authenticated;
grant select on retail.caja_movimientos to authenticated;
grant select on retail.venta_pagos to authenticated;
grant execute on function retail.abrir_caja to authenticated;
grant execute on function retail.registrar_movimiento_caja to authenticated;
grant execute on function retail.cerrar_caja to authenticated;
grant execute on function retail.registrar_venta to authenticated;
