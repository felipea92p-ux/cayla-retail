-- ============================================================================
-- 20260912234815_compras_snapshot_y_paginado.sql — CAYLA V2
--
-- PEDIDO (Felipe, 2026-09-12): filtros y paginado en las tablas de Compras,
-- pensados para millones de registros.
--
-- EL PROBLEMA. `compras_resumen` (compras_desde_factura) calculaba `pagado`
-- y `recibido_cantidad` sumando `compra_pagos` y `movimientos` POR CADA
-- FILA en el momento de consultar. Para mostrar una factura está bien; para
-- filtrar "las pendientes de pago" sobre un millón de facturas obliga a
-- Postgres a sumar los pagos de todas antes de descartar ninguna — no hay
-- índice que salve eso.
--
-- LA SOLUCIÓN es la misma que el repo ya usa para el stock: `movimientos`
-- es la única verdad y `stock` es la foto, mantenida por la base en la
-- misma transacción (fn_aplicar_movimiento). Acá `compra_pagos`,
-- `compra_items` y `movimientos` siguen siendo la verdad; `compras.pagado`,
-- `compras.facturado_cantidad` y `compras.recibido_cantidad` pasan a ser la
-- foto, mantenida por triggers. Encima de la foto van columnas generadas
-- (`saldo`, `estado_pago`, `estado_recepcion`, `documento`) e índices: cada
-- filtro de la pantalla cae en un índice, y el paginado es por cursor
-- (keyset: "dame las 50 siguientes a ESTA"), no por OFFSET — OFFSET 900000
-- lee y descarta 900000 filas; el cursor salta directo por el índice.
--
-- POR QUÉ NO ROMPE EL PRINCIPIO 4 (una sola fuente de verdad): nadie escribe
-- `pagado` a mano — no hay política de UPDATE para `authenticated` y las RPC
-- no lo tocan; solo los triggers. Y `recalcular_compras()` reconstruye la
-- foto desde la verdad en cualquier momento, igual que `recalcular_stock()`.
--
-- SE ROMPE SI: alguien inserta en `compra_pagos`/`compra_items`/`movimientos`
-- saltándose los triggers (deshabilitándolos) — la foto queda vieja hasta
-- correr `recalcular_compras()`. Con RLS de solo lectura eso hoy solo puede
-- hacerlo el rol `postgres` desde el SQL Editor.
-- ============================================================================

set search_path = retail, public, extensions;

create extension if not exists pg_trgm with schema extensions;

-- ==================== 1. la foto ====================
alter table compras
  add column pagado numeric(12, 2) not null default 0 check (pagado >= 0),
  add column facturado_cantidad integer not null default 0 check (facturado_cantidad >= 0),
  add column recibido_cantidad integer not null default 0 check (recibido_cantidad >= 0);

-- Generadas a partir de la foto: cero lógica duplicada en la app.
alter table compras
  add column documento text generated always as (serie || '-' || numero) stored,
  add column saldo numeric(12, 2) generated always as (total - pagado) stored,
  add column estado_pago text generated always as (
    case
      when estado = 'anulada' then 'anulada'
      when pagado >= total then 'pagada'
      when pagado > 0 then 'parcial'
      else 'pendiente'
    end
  ) stored,
  add column estado_recepcion text generated always as (
    case
      when estado = 'anulada' then 'anulada'
      when recibido_cantidad >= facturado_cantidad then 'recibida'
      when recibido_cantidad > 0 then 'parcial'
      else 'sin_recibir'
    end
  ) stored;

-- ==================== 2. triggers que mantienen la foto ====================
create function retail.fn_compra_item_insertado() returns trigger
language plpgsql security definer set search_path = retail, public, extensions
as $$
begin
  update compras set facturado_cantidad = facturado_cantidad + new.cantidad where id = new.compra_id;
  return new;
end;
$$;
create trigger compra_items_foto after insert on compra_items
  for each row execute function retail.fn_compra_item_insertado();

create function retail.fn_compra_pago_insertado() returns trigger
language plpgsql security definer set search_path = retail, public, extensions
as $$
begin
  update compras set pagado = pagado + new.monto where id = new.compra_id;
  return new;
end;
$$;
create trigger compra_pagos_foto after insert on compra_pagos
  for each row execute function retail.fn_compra_pago_insertado();

-- Solo los movimientos que entran contra una línea de factura.
create function retail.fn_movimiento_compra_insertado() returns trigger
language plpgsql security definer set search_path = retail, public, extensions
as $$
begin
  update compras c set recibido_cantidad = c.recibido_cantidad + new.cantidad
    from compra_items ci where ci.id = new.compra_item_id and c.id = ci.compra_id;
  return new;
end;
$$;
create trigger movimientos_compra_foto after insert on movimientos
  for each row when (new.compra_item_id is not null)
  execute function retail.fn_movimiento_compra_insertado();

-- ==================== 3. reconstruir la foto desde la verdad ====================
create function retail.recalcular_compras()
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  update compras c set
    pagado = coalesce((select sum(monto) from compra_pagos p where p.compra_id = c.id), 0),
    facturado_cantidad = coalesce((select sum(cantidad) from compra_items i where i.compra_id = c.id), 0),
    recibido_cantidad = coalesce((
      select sum(m.cantidad) from movimientos m join compra_items i on i.id = m.compra_item_id
      where i.compra_id = c.id
    ), 0);
end;
$$;

-- Backfill de lo que ya existe (local: el seed; producción: lo que haya).
select recalcular_compras();

-- ==================== 4. índices: cada filtro de la pantalla cae en uno ====================
-- Orden por defecto de la lista y cursor del paginado.
create index compras_orden_idx on compras (fecha_emision desc, id desc);
-- Filtro por estado de pago / recepción / condición, combinados con el orden.
create index compras_estado_pago_idx on compras (estado_pago, fecha_emision desc, id desc);
create index compras_estado_recepcion_idx on compras (estado_recepcion, fecha_emision desc, id desc);
create index compras_condicion_idx on compras (condicion, fecha_emision desc, id desc);
-- Por pagar: solo las que deben algo, ordenadas por vencimiento. Parcial: chico
-- aunque haya millones de facturas pagadas.
-- El predicado usa `saldo` (no `total - pagado`): la consulta filtra por `saldo`,
-- y Postgres solo usa un índice parcial si el predicado coincide textualmente.
create index compras_por_pagar_idx on compras (fecha_vencimiento, id) where estado = 'vigente' and saldo > 0;
-- Por recibir: idem, solo lo pendiente.
create index compras_por_recibir_idx on compras (fecha_emision, id) where estado = 'vigente' and estado_recepcion in ('sin_recibir', 'parcial');
-- Búsqueda por número de documento ("000210", "F001-0002…") en cualquier posición.
create index compras_documento_trgm_idx on compras using gin (documento extensions.gin_trgm_ops);
-- Búsqueda por nombre de proveedor: la tabla es chica, pero el ilike igual cae en índice.
create index proveedores_nombre_trgm_idx on proveedores using gin (nombre extensions.gin_trgm_ops);

-- ==================== 5. la vista, ahora sin agregados ====================
-- Misma forma que antes (las pantallas no cambian), pero cada columna sale
-- de la tabla: Postgres la inlinea y los índices de arriba aplican.
drop view compras_resumen;
create view retail.compras_resumen with (security_invoker = true) as
select
  c.id, c.proveedor_id, p.nombre as proveedor_nombre, p.ruc as proveedor_ruc,
  c.tipo, c.serie, c.numero, c.documento,
  c.fecha_emision, c.condicion, c.fecha_vencimiento, c.ubicacion_destino_id,
  c.subtotal, c.igv, c.total, c.estado, c.nota, c.created_at,
  c.pagado, c.saldo, c.estado_pago,
  c.facturado_cantidad, c.recibido_cantidad, c.estado_recepcion,
  (c.estado = 'vigente' and c.saldo > 0 and c.fecha_vencimiento is not null and c.fecha_vencimiento < current_date) as vencida
from compras c
join proveedores p on p.id = c.proveedor_id;

-- `compra_items_resumen` queda igual: se consulta por factura (decenas de
-- líneas), nunca sobre toda la tabla.

-- ==================== 6. listar con filtros y cursor ====================
-- Una sola función para la lista, "por pagar" y "por recibir": los filtros
-- son parámetros, el cursor es (fecha, id) de la última fila vista, y se
-- devuelve limite+1 filas para saber si hay página siguiente sin contar.
-- Devolver la vista entera (setof compras_resumen) mantiene un solo tipo en
-- la app.
create function retail.listar_compras(
  p_limite integer default 50,
  p_cursor_fecha date default null,
  p_cursor_id uuid default null,
  p_orden text default 'emision',          -- 'emision' (desc) | 'vencimiento' (asc)
  p_busqueda text default null,            -- documento o nombre de proveedor
  p_proveedor_id uuid default null,
  p_estado_pago text default null,
  p_estado_recepcion text default null,
  p_condicion text default null,
  p_solo_vigentes boolean default false,
  p_con_saldo boolean default false,
  p_solo_vencidas boolean default false,
  p_por_recibir boolean default false,
  p_desde date default null,
  p_hasta date default null
)
returns setof retail.compras_resumen
language plpgsql stable
set search_path = retail, public, extensions
as $$
declare
  v_limite integer := greatest(1, least(coalesce(p_limite, 50), 200)) + 1;
  v_busqueda text := nullif(trim(p_busqueda), '');
  v_proveedores uuid[];
begin
  -- Los proveedores que matchean se resuelven ANTES, a un array: así el OR
  -- de abajo queda entre dos condiciones simples sobre `compras` (trigram en
  -- documento + btree en proveedor_id), que Postgres combina en un BitmapOr.
  -- Con un `in (select ...)` dentro del OR no puede, y lee toda la tabla.
  if v_busqueda is not null then
    select coalesce(array_agg(id), '{}') into v_proveedores from proveedores where nombre ilike '%' || v_busqueda || '%';
  end if;
  -- Dos consultas estáticas en vez de una con ORDER BY dinámico: un
  -- `order by case ...` no puede usar índice para ordenar, y a un millón de
  -- filas eso es leer todo, ordenar en memoria y quedarse con 50.
  if p_orden = 'vencimiento' then
    return query
      select r.*
      from compras_resumen r
      where (v_busqueda is null or r.documento ilike '%' || v_busqueda || '%' or r.proveedor_id = any(v_proveedores))
        and (p_proveedor_id is null or r.proveedor_id = p_proveedor_id)
        and (p_estado_pago is null or r.estado_pago = p_estado_pago)
        and (p_estado_recepcion is null or r.estado_recepcion = p_estado_recepcion)
        and (p_condicion is null or r.condicion = p_condicion)
        and (not p_solo_vigentes or r.estado = 'vigente')
        and (not p_con_saldo or (r.estado = 'vigente' and r.saldo > 0))
        and (not p_solo_vencidas or (r.estado = 'vigente' and r.saldo > 0 and r.fecha_vencimiento < current_date))
        and (not p_por_recibir or (r.estado = 'vigente' and r.estado_recepcion in ('sin_recibir', 'parcial')))
        and (p_desde is null or r.fecha_emision >= p_desde)
        and (p_hasta is null or r.fecha_emision <= p_hasta)
        and (p_cursor_id is null or (r.fecha_vencimiento, r.id) > (p_cursor_fecha, p_cursor_id))
      order by r.fecha_vencimiento asc nulls last, r.id asc
      limit v_limite;
  else
    return query
      select r.*
      from compras_resumen r
      where (v_busqueda is null or r.documento ilike '%' || v_busqueda || '%' or r.proveedor_id = any(v_proveedores))
        and (p_proveedor_id is null or r.proveedor_id = p_proveedor_id)
        and (p_estado_pago is null or r.estado_pago = p_estado_pago)
        and (p_estado_recepcion is null or r.estado_recepcion = p_estado_recepcion)
        and (p_condicion is null or r.condicion = p_condicion)
        and (not p_solo_vigentes or r.estado = 'vigente')
        and (not p_con_saldo or (r.estado = 'vigente' and r.saldo > 0))
        and (not p_solo_vencidas or (r.estado = 'vigente' and r.saldo > 0 and r.fecha_vencimiento < current_date))
        and (not p_por_recibir or (r.estado = 'vigente' and r.estado_recepcion in ('sin_recibir', 'parcial')))
        and (p_desde is null or r.fecha_emision >= p_desde)
        and (p_hasta is null or r.fecha_emision <= p_hasta)
        and (p_cursor_id is null or (r.fecha_emision, r.id) < (p_cursor_fecha, p_cursor_id))
      order by r.fecha_emision desc, r.id desc
      limit v_limite;
  end if;
end;
$$;

grant execute on function retail.listar_compras to authenticated;

-- ==================== 7. RLS que no se evalúa por fila ====================
-- Medido a 200k filas: `auth.role() = 'authenticated'` en la política hacía
-- que un count(*) tardara 3,1 s por PostgREST — la función se llama una vez
-- POR FILA y parsea el JWT (JSON) cada vez. Envuelta en `(select ...)`,
-- Postgres la evalúa una sola vez por consulta (InitPlan). Es la forma que
-- recomienda Supabase para toda política que llame a auth.*.
drop policy compras_select on compras;
create policy compras_select on compras for select using ((select auth.role()) = 'authenticated');
drop policy compra_items_select on compra_items;
create policy compra_items_select on compra_items for select using ((select auth.role()) = 'authenticated');
drop policy compra_pagos_select on compra_pagos;
create policy compra_pagos_select on compra_pagos for select using ((select auth.role()) = 'authenticated');

-- ==================== 8. cifras de cabecera, en una sola consulta ====================
-- Sumas y conteos en Postgres, nunca en la página. Los de "por pagar" y
-- "por recibir" caen en sus índices parciales; los totales son
-- index-only scans. (PostgREST tiene los agregados deshabilitados por
-- defecto, y aunque no los tuviera, esto es una llamada en vez de cuatro.)
-- `security definer` con un solo chequeo de sesión arriba, como el resto de
-- las RPC: contar 200k filas pasando por RLS fila a fila es lo que se mide
-- en el punto 7, y acá no hay nada que filtrar por persona.
create function retail.resumen_compras()
returns table (
  registradas bigint, vigentes bigint, por_recibir bigint,
  deuda numeric, con_saldo bigint, vencido numeric, vencidas bigint
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select
    (select count(*) from compras),
    (select count(*) from compras where estado = 'vigente'),
    (select count(*) from compras where estado = 'vigente' and estado_recepcion in ('sin_recibir', 'parcial')),
    (select coalesce(sum(saldo), 0) from compras where estado = 'vigente' and saldo > 0),
    (select count(*) from compras where estado = 'vigente' and saldo > 0),
    (select coalesce(sum(saldo), 0) from compras where estado = 'vigente' and saldo > 0 and fecha_vencimiento < current_date),
    (select count(*) from compras where estado = 'vigente' and saldo > 0 and fecha_vencimiento < current_date)
  where auth.uid() is not null;
$$;

grant execute on function retail.resumen_compras to authenticated;
grant execute on function retail.recalcular_compras to authenticated;
