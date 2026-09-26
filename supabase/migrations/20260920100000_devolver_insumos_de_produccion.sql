-- ============================================================================
-- 20260920100000_devolver_insumos_de_produccion.sql — CAYLA V2 (ADR-0133, F3b)
--
-- PROBLEMA. Hasta hoy un consumo de insumo (`registrar_consumo_insumo`) no tenía
-- vuelta atrás: si el Taller descontaba 30 m de lino por error, el metro salía del
-- estante para siempre y la orden quedaba con un costo de tela inflado. El ledger
-- `movimientos_insumo` YA aceptaba el tipo `devolucion` (CHECK de 20260917145000 y
-- saldo por lote de `registrar_consumo_insumo`), pero ninguna función lo escribía.
-- Y anular una orden dejaba la tela "gastada" en una orden que no existe.
--
-- QUÉ HACE ESTA MIGRACIÓN (todo sobre lo que ya existe; ninguna tabla nueva):
--
--  1. `fn_recalcular_costo_insumos_produccion(uuid)` — helper INTERNO. Costo real de
--     tela / avíos de una orden = Σ(consumo × costo del lote) − Σ(devolución × costo
--     del lote), por tipo. Pisa `producciones.costo_tela` / `costo_avios` solo del tipo
--     que tuvo movimientos (el costo tecleado de un tipo sin insumos no se toca). No
--     es ejecutable por `authenticated`: la llaman las tres funciones de abajo.
--
--  2. `devolver_insumo_de_produccion(p_produccion_id, p_insumo_id, p_cantidad, p_nota)`
--     — la vuelta del consumo. La cantidad regresa al lote ÚLTIMO del que esa orden sacó
--     ese insumo (con neto > 0), al mismo costo con que salió: PEPS al revés, para que
--     el saldo por lote y el costo de la orden queden como si el consumo no hubiera
--     pasado. No parte entre lotes (mismo alcance chico que el consumo). Solo con la
--     orden `en_proceso`, y nunca más de lo que la orden tiene descontado (neto).
--
--  3. `registrar_consumo_insumo` (misma firma) — su recálculo de costo sumaba consumos
--     SIN restar devoluciones; con devoluciones reales eso dejaba el costo de la orden
--     inflado. Ahora llama al helper. Lo demás queda idéntico (candado del lote,
--     elección PEPS, mensajes).
--
--  4. `anular_produccion` (misma firma) — al anular, cada insumo que la orden tenía
--     descontado vuelve a su lote con un movimiento `devolucion` (motivo
--     `anulacion_orden`), y el costo de tela/avíos queda en su neto (0). Nunca se
--     borra nada del ledger (principio 4). Una orden anulada sin consumos se comporta
--     exactamente como antes.
--
-- SE ROMPE SI: cambian los CHECK de `movimientos_insumo` (devolucion exige
-- `produccion_id` y lote) o `fn_puede_operar_ubicacion`. Si algún día se permite
-- devolver con la orden ya cerrada, hay que decidir cómo se corrige
-- `variantes.costo` retroactivamente (hoy no se permite, a propósito).
--
-- ESTADO: solo local hasta que Felipe la pegue en producción (con `retail.`; ya lo
-- lleva). Reemplaza `registrar_consumo_insumo` y `anular_produccion` por CREATE OR
-- REPLACE con la MISMA firma (no crea sobrecargas — ver memoria de reescritura de
-- funciones de producción).
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. costo neto de insumos de una orden ----------
create or replace function retail.fn_recalcular_costo_insumos_produccion(p_produccion_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_tela numeric; v_avios numeric; v_n_tela integer; v_n_avios integer;
begin
  select
    coalesce(sum(case when i.tipo = 'tela' then (case when mi.tipo = 'consumo' then 1 else -1 end) * mi.cantidad * mi.costo_unitario end), 0),
    coalesce(sum(case when i.tipo = 'avio' then (case when mi.tipo = 'consumo' then 1 else -1 end) * mi.cantidad * mi.costo_unitario end), 0),
    count(*) filter (where i.tipo = 'tela'),
    count(*) filter (where i.tipo = 'avio')
  into v_tela, v_avios, v_n_tela, v_n_avios
  from movimientos_insumo mi
  join insumos i on i.id = mi.insumo_id
  where mi.produccion_id = p_produccion_id and mi.tipo in ('consumo', 'devolucion');

  if v_n_tela > 0 then
    update producciones set costo_tela = round(v_tela, 2) where id = p_produccion_id;
  end if;
  if v_n_avios > 0 then
    update producciones set costo_avios = round(v_avios, 2) where id = p_produccion_id;
  end if;
end;
$$;

comment on function retail.fn_recalcular_costo_insumos_produccion(uuid) is
  'Interno (ADR-0133 F3b): costo_tela/costo_avios de una orden = consumos − devoluciones, cada uno al costo de su lote. Solo pisa el tipo con movimientos.';

revoke execute on function retail.fn_recalcular_costo_insumos_produccion(uuid) from public, authenticated;

-- ---------- 2. devolver_insumo_de_produccion ----------
create or replace function retail.devolver_insumo_de_produccion(
  p_produccion_id uuid,
  p_insumo_id uuid,
  p_cantidad numeric,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion_id uuid;
  v_estado text;
  v_lote record;
  v_neto_lote numeric;
  v_neto_total numeric := 0;
  v_lote_id uuid;
  v_costo numeric;
  v_neto_elegido numeric;
  v_persona_id uuid;
  v_movimiento_id uuid;
begin
  -- Mismo orden de candados que registrar_consumo_insumo: la orden primero, después los lotes.
  select ubicacion_id, estado into v_ubicacion_id, v_estado
    from producciones where id = p_produccion_id for update;
  if not found then
    raise exception 'La producción no existe';
  end if;

  if not fn_puede_operar_ubicacion(v_ubicacion_id) then
    raise exception 'No tienes permiso para devolver insumos de esa producción';
  end if;

  if v_estado <> 'en_proceso' then
    raise exception 'Los insumos se devuelven antes de cerrar la orden — esta ya está %', v_estado;
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad devuelta debe ser mayor a cero';
  end if;

  if not exists (select 1 from insumos where id = p_insumo_id) then
    raise exception 'El insumo % no existe', p_insumo_id;
  end if;

  -- Lotes del insumo en ascendente (mismo orden que el consumo, para no cruzar candados);
  -- de todos, el ÚLTIMO con neto > 0 para esta orden es a donde vuelve la cantidad.
  v_lote_id := null;
  for v_lote in
    select id, costo_unitario
    from insumo_lotes
    where insumo_id = p_insumo_id and ubicacion_id = v_ubicacion_id
    order by fecha_ingreso, created_at
    for update
  loop
    select coalesce(sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end), 0)
      into v_neto_lote
      from movimientos_insumo mi
      where mi.insumo_lote_id = v_lote.id and mi.produccion_id = p_produccion_id and mi.tipo in ('consumo', 'devolucion');

    if v_neto_lote > 0 then
      v_neto_total := v_neto_total + v_neto_lote;
      v_lote_id := v_lote.id;
      v_costo := v_lote.costo_unitario;
      v_neto_elegido := v_neto_lote;
    end if;
  end loop;

  if v_lote_id is null then
    raise exception 'Esta orden no tiene este insumo descontado — no hay nada que devolver';
  end if;

  if p_cantidad > v_neto_total then
    raise exception 'Esta orden solo tiene descontado % de este insumo y pediste devolver %', v_neto_total, p_cantidad;
  end if;

  if p_cantidad > v_neto_elegido then
    raise exception 'El último lote del que salió tiene % descontados por esta orden y pediste devolver % — devuélvelo en dos llamadas', v_neto_elegido, p_cantidad;
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into movimientos_insumo (
    insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, produccion_id, usuario_id, motivo, nota
  ) values (
    p_insumo_id, v_lote_id, v_ubicacion_id, 'devolucion', p_cantidad, v_costo, p_produccion_id, v_persona_id, 'devolucion_a_estante', p_nota
  ) returning id into v_movimiento_id;

  perform fn_recalcular_costo_insumos_produccion(p_produccion_id);

  return v_movimiento_id;
end;
$$;

comment on function retail.devolver_insumo_de_produccion(uuid, uuid, numeric, text) is
  'ADR-0133 F3b: deshace (total o parcialmente) un consumo de insumo con la orden en proceso. La cantidad vuelve al último lote del que salió, al mismo costo; el costo de tela/avíos de la orden queda en su neto.';

revoke execute on function retail.devolver_insumo_de_produccion(uuid, uuid, numeric, text) from public;
grant execute on function retail.devolver_insumo_de_produccion(uuid, uuid, numeric, text) to authenticated;

-- ---------- 3. registrar_consumo_insumo: el costo ahora es neto de devoluciones ----------
create or replace function retail.registrar_consumo_insumo(
  p_produccion_id uuid,
  p_insumo_id uuid,
  p_cantidad numeric,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion_id uuid;
  v_estado text;
  v_lote record;
  v_saldo_lote numeric;
  v_lote_id uuid;
  v_costo_unitario numeric;
  v_persona_id uuid;
  v_movimiento_id uuid;
begin
  select ubicacion_id, estado into v_ubicacion_id, v_estado
    from producciones where id = p_produccion_id for update;
  if not found then
    raise exception 'La producción no existe';
  end if;

  if not fn_puede_operar_ubicacion(v_ubicacion_id) then
    raise exception 'No tienes permiso para registrar consumo de insumos en esa producción';
  end if;

  if v_estado <> 'en_proceso' then
    raise exception 'El consumo de insumos se registra antes de cerrar la orden — esta ya está %', v_estado;
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad consumida debe ser mayor a cero';
  end if;

  if not exists (select 1 from insumos where id = p_insumo_id) then
    raise exception 'El insumo % no existe', p_insumo_id;
  end if;

  v_lote_id := null;
  for v_lote in
    select id, costo_unitario
    from insumo_lotes
    where insumo_id = p_insumo_id and ubicacion_id = v_ubicacion_id
    order by fecha_ingreso, created_at
    for update
  loop
    select l.cantidad_ingresada
        - coalesce((select sum(mi.cantidad) from movimientos_insumo mi
                     where mi.insumo_lote_id = v_lote.id and mi.tipo in ('consumo', 'merma')), 0)
        + coalesce((select sum(mi.cantidad) from movimientos_insumo mi
                     where mi.insumo_lote_id = v_lote.id and mi.tipo = 'devolucion'), 0)
      into v_saldo_lote
      from insumo_lotes l where l.id = v_lote.id;

    if v_saldo_lote > 0 then
      v_lote_id := v_lote.id;
      v_costo_unitario := v_lote.costo_unitario;
      exit;
    end if;
  end loop;

  if v_lote_id is null then
    raise exception 'No hay stock de este insumo en esta ubicación — recíbelo con recibir_insumo antes de registrar consumo';
  end if;

  if v_saldo_lote < p_cantidad then
    raise exception 'El lote más antiguo con saldo tiene % y pediste % — si de verdad necesitas cruzar de lote, registra el consumo en dos llamadas', v_saldo_lote, p_cantidad;
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into movimientos_insumo (
    insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, produccion_id, usuario_id, nota
  ) values (
    p_insumo_id, v_lote_id, v_ubicacion_id, 'consumo', p_cantidad, v_costo_unitario, p_produccion_id, v_persona_id, p_nota
  ) returning id into v_movimiento_id;

  -- D-47 + F3b: el costo de tela/avíos es lo real consumido MENOS lo devuelto.
  perform fn_recalcular_costo_insumos_produccion(p_produccion_id);

  return v_movimiento_id;
end;
$$;

comment on function retail.registrar_consumo_insumo(uuid, uuid, numeric, text) is
  'Consumo real de insumos al cortar (D-47, ADR-0090). Elige el lote más antiguo con saldo (sin partir entre lotes); el costo de tela/avíos de la orden es neto de devoluciones (ADR-0133 F3b).';

revoke execute on function retail.registrar_consumo_insumo(uuid, uuid, numeric, text) from public;
grant execute on function retail.registrar_consumo_insumo(uuid, uuid, numeric, text) to authenticated;

-- ---------- 4. anular_produccion: lo descontado vuelve al estante ----------
create or replace function retail.anular_produccion(p_produccion_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_orden producciones%rowtype;
  v_persona uuid;
  v_resto record;
begin
  select * into v_orden from producciones where id = p_produccion_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if not fn_puede_operar_ubicacion(v_orden.ubicacion_id) then
    raise exception 'No tienes permiso sobre las órdenes de ese Taller';
  end if;
  if v_orden.estado <> 'en_proceso' then
    raise exception 'Solo se anula una orden en proceso — una cerrada se revierte';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  -- Cada (insumo, lote) con neto > 0 vuelve entero, al costo con que salió.
  for v_resto in
    select mi.insumo_id, mi.insumo_lote_id, mi.costo_unitario,
           sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end) as neto
    from movimientos_insumo mi
    where mi.produccion_id = p_produccion_id and mi.tipo in ('consumo', 'devolucion')
    group by mi.insumo_id, mi.insumo_lote_id, mi.costo_unitario
    having sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end) > 0
  loop
    insert into movimientos_insumo (
      insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, produccion_id, usuario_id, motivo, nota
    ) values (
      v_resto.insumo_id, v_resto.insumo_lote_id, v_orden.ubicacion_id, 'devolucion', v_resto.neto, v_resto.costo_unitario,
      p_produccion_id, v_persona, 'anulacion_orden', nullif(btrim(p_motivo), '')
    );
  end loop;

  update producciones
    set estado = 'anulada',
        nota = concat_ws(' · ', nota, nullif(btrim(p_motivo), ''))
    where id = p_produccion_id;

  perform fn_recalcular_costo_insumos_produccion(p_produccion_id);
end;
$$;

comment on function retail.anular_produccion(uuid, text) is
  'Anula una orden en proceso. Lo que tenía descontado de insumos vuelve a su lote (ADR-0133 F3b); el motivo se concatena a la nota.';

revoke execute on function retail.anular_produccion(uuid, text) from public;
grant execute on function retail.anular_produccion(uuid, text) to authenticated;
