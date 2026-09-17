-- ============================================================================
-- 20260912231956_compras_desde_factura.sql — CAYLA V2
--
-- DECISIÓN (Felipe, 2026-09-12): el flujo de compras ARRANCA EN LA FACTURA
-- del proveedor, no en una "orden de compra" previa. CAYLA no emite pedidos
-- formales: compra, recibe la factura, y lo que hay que controlar es (a) qué
-- de esa factura ya llegó físicamente y (b) qué de esa factura ya se pagó.
--
-- Por eso:
--   1. `ordenes_compra` / `ordenes_compra_items` / `lotes.orden_compra_id`
--      se eliminan — nunca los usó ninguna pantalla de V2 (solo el seed).
--      El DROP está protegido: si en producción hubiera filas, la migración
--      frena con un error claro en vez de borrar (regla del repo: nunca se
--      borran datos con historial sin mirarlos primero).
--   2. Nace `compras` (la factura), `compra_items` (sus líneas) y
--      `compra_pagos` (cada pago, append-only). `movimientos` gana
--      `compra_item_id`, igual que ya tiene venta_item_id / conteo_item_id:
--      cada entrada de stock sabe contra qué línea de qué factura entró.
--   3. Lo "pendiente de recibir" y lo "pendiente de pagar" NO se guardan:
--      la vista `compras_resumen` los calcula desde movimientos y pagos
--      (principio 4: una sola fuente de verdad, cero columnas que se
--      desincronicen).
--
-- LÍNEAS DETALLADAS vs. AGRUPADAS (Felipe: "cada proveedor factura
-- distinto"): `compra_items.producto_id` es obligatorio y `variante_id`
-- opcional. Si la factura dice "Blusa Lino, M, Arena x 12", la línea trae
-- la variante y la recepción sale precargada. Si dice "Blusa Lino x 24", la
-- línea queda a nivel producto y el reparto por talla/color se hace al
-- recibir — que es cuando se abre la caja y se ve qué llegó. La regla dura
-- vive en `recibir_compras`: lo recibido de una línea nunca supera lo
-- facturado, y la variante recibida siempre pertenece al producto de la línea.
--
-- CONTADO vs. CRÉDITO (Felipe): contado ⇒ el pago es obligatorio al
-- registrar la factura y se escribe en la misma transacción (una factura al
-- contado sin pago es un estado imposible). Crédito ⇒ `fecha_vencimiento`
-- obligatoria, pago opcional; vive en "Por pagar" hasta saldarse.
--
-- PAGOS: salen de cuenta de la empresa (transferencia/Yape/etc.), nunca de
-- la caja de tienda — por eso `compra_pagos` NO escribe `caja_movimientos`.
-- Si un día un pago sale del efectivo del día, ese es el lugar a tocar.
--
-- COSTO: `compra_items.costo_unitario` es SIN IGV (valor unitario de la
-- factura). Al recibir, `variantes.costo` se actualiza con ese valor — el
-- IGV es crédito fiscal, no costo de la prenda.
--
-- PERMISOS: `fn_puede_registrar_compras()` es la única puerta para
-- facturas y pagos (hoy = fn_es_lider(), que con 0012 es "cualquier persona
-- activa"). Recibir mercadería sigue siendo `fn_puede_operar_ubicacion`.
-- Cambiar quién registra compras es cambiar UNA función.
--
-- ESCRITURA SOLO POR RPC: `compras`, `compra_items` y `compra_pagos` tienen
-- RLS con política de SELECT únicamente. Sin política de INSERT/UPDATE/
-- DELETE, Postgres niega la escritura directa aunque el grant de tabla
-- exista — así nadie puede registrar una factura al contado sin su pago
-- saltándose `registrar_compra`.
--
-- SE ROMPE SI: alguien agrega una política de escritura directa sobre estas
-- tablas "para ir rápido" — ahí vuelven los estados imposibles.
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. eliminar el flujo de orden de compra ====================
-- Protegido: con filas, frena. Producción decide qué hacer con ellas antes.
do $$
begin
  if exists (select 1 from ordenes_compra) then
    raise exception 'ordenes_compra tiene filas: archívalas antes de eliminar la tabla (ver migración compras_desde_factura)';
  end if;
end $$;

alter table lotes drop column orden_compra_id;
drop table ordenes_compra_items;
drop table ordenes_compra;

-- La firma vieja de recibir_lote (con p_orden_compra_id) se borra, no se
-- sobrecarga — ADR-0026. Se recrea igual pero sin ese parámetro.
drop function recibir_lote(uuid, uuid, jsonb, uuid, text, text);

create function retail.recibir_lote(
  p_ubicacion_id uuid, p_proveedor_id uuid, p_items jsonb,
  p_numero_guia text default null, p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_lote_id uuid; v_item jsonb; v_mov_id uuid; v_persona uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para recibir mercadería en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Un lote necesita al menos un ítem';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into lotes (ubicacion_id, proveedor_id, numero_guia, recibido_por, nota)
    values (p_ubicacion_id, p_proveedor_id, p_numero_guia, v_persona, p_nota)
    returning id into v_lote_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, lote_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, 'entrada',
              (v_item ->> 'cantidad')::integer, 'recepcion', v_lote_id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);

    if (v_item ->> 'costo_unitario') is not null then
      update variantes set costo = (v_item ->> 'costo_unitario')::numeric
        where id = (v_item ->> 'variante_id')::uuid;
    end if;
  end loop;

  return v_lote_id;
end;
$$;

-- ==================== 2. tablas ====================

create table retail.compras (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references retail.proveedores (id),
  tipo text not null default 'factura' check (tipo in ('factura', 'boleta', 'nota_venta')),
  serie text not null,
  numero text not null,
  fecha_emision date not null default current_date,
  condicion text not null check (condicion in ('contado', 'credito')),
  fecha_vencimiento date,
  ubicacion_destino_id uuid not null references retail.ubicaciones (id),
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  igv numeric(12, 2) not null check (igv >= 0),
  total numeric(12, 2) not null check (total >= 0),
  estado text not null default 'vigente' check (estado in ('vigente', 'anulada')),
  motivo_anulacion text,
  nota text,
  usuario_id uuid references public.personas (id),
  created_at timestamptz not null default now(),
  -- la misma factura del mismo proveedor no se registra dos veces
  unique (proveedor_id, serie, numero),
  -- crédito sin fecha de vencimiento no se puede cobrar ni alertar
  constraint compras_credito_tiene_vencimiento check (
    condicion = 'contado' or fecha_vencimiento is not null
  )
);
create index compras_proveedor_idx on retail.compras (proveedor_id);
create index compras_fecha_idx on retail.compras (fecha_emision desc);

create table retail.compra_items (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references retail.compras (id),
  producto_id uuid not null references retail.productos (id),
  -- null = la factura vino agrupada por modelo; se reparte al recibir
  variante_id uuid references retail.variantes (id),
  descripcion text,
  cantidad integer not null check (cantidad > 0),
  costo_unitario numeric(12, 2) not null check (costo_unitario >= 0),
  subtotal numeric(12, 2) generated always as (cantidad * costo_unitario) stored
);
create index compra_items_compra_idx on retail.compra_items (compra_id);

create table retail.compra_pagos (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references retail.compras (id),
  fecha date not null default current_date,
  monto numeric(12, 2) not null check (monto > 0),
  metodo text not null check (metodo in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro')),
  referencia text,
  usuario_id uuid references public.personas (id),
  created_at timestamptz not null default now()
);
create index compra_pagos_compra_idx on retail.compra_pagos (compra_id);

-- cada entrada por recepción sabe contra qué línea de factura entró
alter table retail.movimientos add column compra_item_id uuid references retail.compra_items (id);
create index movimientos_compra_item_idx on retail.movimientos (compra_item_id) where compra_item_id is not null;

-- ==================== 3. RLS: leer sí, escribir solo por RPC ====================
alter table retail.compras enable row level security;
create policy compras_select on retail.compras for select using (auth.role() = 'authenticated');

alter table retail.compra_items enable row level security;
create policy compra_items_select on retail.compra_items for select using (auth.role() = 'authenticated');

alter table retail.compra_pagos enable row level security;
create policy compra_pagos_select on retail.compra_pagos for select using (auth.role() = 'authenticated');

-- ==================== 4. permiso ====================
create function retail.fn_puede_registrar_compras() returns boolean
language sql stable
set search_path = retail, public, extensions
as $$
  select fn_es_lider();
$$;

-- ==================== 5. vista: lo pendiente se calcula, no se guarda ====================
-- security_invoker: la vista respeta la RLS de quien consulta, no la del dueño.
create view retail.compras_resumen with (security_invoker = true) as
with pagos as (
  select compra_id, sum(monto) as pagado from compra_pagos group by compra_id
),
lineas as (
  select
    ci.compra_id,
    sum(ci.cantidad) as facturado,
    sum(coalesce(r.recibido, 0)) as recibido
  from compra_items ci
  left join lateral (
    select sum(m.cantidad) as recibido from movimientos m where m.compra_item_id = ci.id
  ) r on true
  group by ci.compra_id
)
select
  c.id, c.proveedor_id, p.nombre as proveedor_nombre, p.ruc as proveedor_ruc,
  c.tipo, c.serie, c.numero, c.serie || '-' || c.numero as documento,
  c.fecha_emision, c.condicion, c.fecha_vencimiento, c.ubicacion_destino_id,
  c.subtotal, c.igv, c.total, c.estado, c.nota, c.created_at,
  coalesce(pg.pagado, 0) as pagado,
  c.total - coalesce(pg.pagado, 0) as saldo,
  case
    when c.estado = 'anulada' then 'anulada'
    when coalesce(pg.pagado, 0) >= c.total then 'pagada'
    when coalesce(pg.pagado, 0) > 0 then 'parcial'
    else 'pendiente'
  end as estado_pago,
  coalesce(l.facturado, 0) as facturado_cantidad,
  coalesce(l.recibido, 0) as recibido_cantidad,
  case
    when c.estado = 'anulada' then 'anulada'
    when coalesce(l.recibido, 0) >= coalesce(l.facturado, 0) then 'recibida'
    when coalesce(l.recibido, 0) > 0 then 'parcial'
    else 'sin_recibir'
  end as estado_recepcion,
  (c.estado = 'vigente' and c.total - coalesce(pg.pagado, 0) > 0
     and c.fecha_vencimiento is not null and c.fecha_vencimiento < current_date) as vencida
from compras c
join proveedores p on p.id = c.proveedor_id
left join pagos pg on pg.compra_id = c.id
left join lineas l on l.compra_id = c.id;

-- por línea: cuánto se facturó y cuánto llegó (para precargar la recepción)
create view retail.compra_items_resumen with (security_invoker = true) as
select
  ci.id, ci.compra_id, ci.producto_id, ci.variante_id, ci.descripcion,
  ci.cantidad, ci.costo_unitario, ci.subtotal,
  coalesce((select sum(m.cantidad) from movimientos m where m.compra_item_id = ci.id), 0) as recibido,
  ci.cantidad - coalesce((select sum(m.cantidad) from movimientos m where m.compra_item_id = ci.id), 0) as pendiente
from compra_items ci;

-- ==================== 6. RPC: registrar factura (+ pago si es contado) ====================
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
  p_pago jsonb default null,           -- {monto, metodo, referencia?, fecha?} — obligatorio si contado
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_compra_id uuid; v_persona uuid; v_item jsonb;
  v_subtotal numeric(12, 2) := 0; v_igv numeric(12, 2); v_total numeric(12, 2);
  v_producto uuid; v_variante uuid; v_pago_monto numeric(12, 2);
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

  if p_pago is not null then
    v_pago_monto := (p_pago ->> 'monto')::numeric;
    if v_pago_monto is null or v_pago_monto <= 0 then
      raise exception 'El pago necesita un monto mayor a cero';
    end if;
    if p_condicion = 'contado' and v_pago_monto <> v_total then
      raise exception 'Al contado el pago debe ser el total de la factura (S/ %), se recibió S/ %', v_total, v_pago_monto;
    end if;
    if v_pago_monto > v_total then
      raise exception 'El pago (S/ %) supera el total de la factura (S/ %)', v_pago_monto, v_total;
    end if;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into compras (
    proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento,
    ubicacion_destino_id, subtotal, igv, total, nota, usuario_id
  ) values (
    p_proveedor_id, p_tipo, upper(trim(p_serie)), trim(p_numero), p_fecha_emision, p_condicion,
    case when p_condicion = 'contado' then null else p_fecha_vencimiento end,
    p_ubicacion_destino_id, v_subtotal, v_igv, v_total, p_nota, v_persona
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

  if p_pago is not null then
    insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id)
      values (
        v_compra_id,
        coalesce((p_pago ->> 'fecha')::date, current_date),
        v_pago_monto,
        p_pago ->> 'metodo',
        p_pago ->> 'referencia',
        v_persona
      );
  end if;

  return v_compra_id;
exception
  when unique_violation then
    raise exception 'La factura %-% de este proveedor ya está registrada', upper(trim(p_serie)), trim(p_numero);
end;
$$;

-- ==================== 7. RPC: registrar un pago contra una factura ====================
create function retail.registrar_pago_compra(
  p_compra_id uuid,
  p_monto numeric,
  p_metodo text,
  p_referencia text default null,
  p_fecha date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_compra compras%rowtype; v_pagado numeric(12, 2); v_persona uuid; v_pago_id uuid;
begin
  if not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para registrar pagos a proveedores';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El pago necesita un monto mayor a cero';
  end if;

  -- bloquea la factura: dos pagos simultáneos no pueden pasarse del saldo
  select * into v_compra from compras where id = p_compra_id for update;
  if not found then
    raise exception 'La compra % no existe', p_compra_id;
  end if;
  if v_compra.estado = 'anulada' then
    raise exception 'La factura %-% está anulada, no acepta pagos', v_compra.serie, v_compra.numero;
  end if;

  select coalesce(sum(monto), 0) into v_pagado from compra_pagos where compra_id = p_compra_id;
  if v_pagado + p_monto > v_compra.total then
    raise exception 'El pago (S/ %) supera el saldo pendiente (S/ %)', p_monto, v_compra.total - v_pagado;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id)
    values (p_compra_id, p_fecha, p_monto, p_metodo, p_referencia, v_persona)
    returning id into v_pago_id;

  return v_pago_id;
end;
$$;

-- ==================== 8. RPC: anular una factura (nunca borrar) ====================
create function retail.anular_compra(p_compra_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_compra compras%rowtype;
begin
  if not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para anular compras';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Anular una factura necesita un motivo';
  end if;

  select * into v_compra from compras where id = p_compra_id for update;
  if not found then
    raise exception 'La compra % no existe', p_compra_id;
  end if;
  if v_compra.estado = 'anulada' then
    return;
  end if;
  -- con pagos o mercadería ya ingresada, anular dejaría stock o dinero sin respaldo
  if exists (select 1 from compra_pagos where compra_id = p_compra_id) then
    raise exception 'La factura tiene pagos registrados: no se puede anular';
  end if;
  if exists (
    select 1 from movimientos m join compra_items ci on ci.id = m.compra_item_id
    where ci.compra_id = p_compra_id
  ) then
    raise exception 'La factura ya tiene mercadería recibida: no se puede anular';
  end if;

  update compras set estado = 'anulada', motivo_anulacion = trim(p_motivo) where id = p_compra_id;
end;
$$;

-- ==================== 9. RPC: recibir mercadería contra una o varias facturas ====================
-- Una guía = un lote = una recepción. Puede cubrir varias facturas del MISMO
-- proveedor. Cada ítem recibido apunta a una línea de factura; si la línea
-- vino agrupada (sin variante), acá se reparte por talla/color.
create function retail.recibir_compras(
  p_ubicacion_id uuid,
  p_items jsonb,                       -- [{compra_item_id, variante_id, cantidad}]
  p_numero_guia text default null,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_lote_id uuid; v_persona uuid; v_item jsonb; v_mov_id uuid;
  v_linea compra_items%rowtype; v_compra compras%rowtype;
  v_proveedor uuid; v_recibido integer; v_cantidad integer;
  v_agregado jsonb;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para recibir mercadería en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Una recepción necesita al menos un ítem';
  end if;

  -- sumar por línea lo que viene en esta recepción (una línea agrupada puede
  -- llegar repartida en varias variantes) y validar contra lo facturado
  for v_agregado in
    select jsonb_build_object('compra_item_id', i ->> 'compra_item_id', 'cantidad', sum((i ->> 'cantidad')::integer))
    from jsonb_array_elements(p_items) i
    group by i ->> 'compra_item_id'
  loop
    select * into v_linea from compra_items where id = (v_agregado ->> 'compra_item_id')::uuid for update;
    if not found then
      raise exception 'La línea de factura % no existe', v_agregado ->> 'compra_item_id';
    end if;
    select * into v_compra from compras where id = v_linea.compra_id;
    if v_compra.estado <> 'vigente' then
      raise exception 'La factura %-% está anulada', v_compra.serie, v_compra.numero;
    end if;
    if v_proveedor is null then
      v_proveedor := v_compra.proveedor_id;
    elsif v_proveedor <> v_compra.proveedor_id then
      raise exception 'Una recepción cubre facturas de un solo proveedor';
    end if;

    select coalesce(sum(cantidad), 0) into v_recibido from movimientos where compra_item_id = v_linea.id;
    v_cantidad := (v_agregado ->> 'cantidad')::integer;
    if v_cantidad <= 0 then
      raise exception 'La cantidad recibida debe ser mayor a cero';
    end if;
    if v_recibido + v_cantidad > v_linea.cantidad then
      raise exception 'Factura %-%: la línea tiene % facturados, % ya recibidos y se intenta recibir % más',
        v_compra.serie, v_compra.numero, v_linea.cantidad, v_recibido, v_cantidad;
    end if;
  end loop;

  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into lotes (ubicacion_id, proveedor_id, numero_guia, recibido_por, nota)
    values (p_ubicacion_id, v_proveedor, p_numero_guia, v_persona, p_nota)
    returning id into v_lote_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_linea from compra_items where id = (v_item ->> 'compra_item_id')::uuid;

    -- la variante recibida tiene que ser del producto facturado; si la
    -- factura ya venía detallada, tiene que ser exactamente esa variante
    if v_linea.variante_id is not null and v_linea.variante_id <> (v_item ->> 'variante_id')::uuid then
      raise exception 'La línea de factura ya especifica una variante distinta a la recibida';
    end if;
    if not exists (
      select 1 from variantes where id = (v_item ->> 'variante_id')::uuid and producto_id = v_linea.producto_id
    ) then
      raise exception 'La variante recibida no pertenece al producto de la línea de factura';
    end if;

    insert into movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, lote_id, compra_item_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, 'entrada',
              (v_item ->> 'cantidad')::integer, 'recepcion', v_lote_id, v_linea.id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);

    -- el costo de la prenda es el de la última factura (sin IGV)
    update variantes set costo = v_linea.costo_unitario where id = (v_item ->> 'variante_id')::uuid;
  end loop;

  return v_lote_id;
end;
$$;

grant execute on function retail.fn_puede_registrar_compras to authenticated;
grant execute on function retail.registrar_compra to authenticated;
grant execute on function retail.registrar_pago_compra to authenticated;
grant execute on function retail.anular_compra to authenticated;
grant execute on function retail.recibir_compras to authenticated;
grant execute on function retail.recibir_lote to authenticated;
