-- ============================================================================
-- APARTAR STOCK: reservar una prenda sin restarla del conteo físico (ADR-0094)
--
-- EL PROBLEMA. Hallazgo de mayor prioridad de la sesión "Anatomía del Producto"
-- (24 preguntas con Felipe, rehecha sobre este worktree — la primera vez se diseñó
-- por error contra el V1 equivocado, sede_id/contenedor_id, worktree distinto): hoy
-- una prenda "apartada" para una clienta (la deja pagada a medias, o solo pedida por
-- WhatsApp) sigue contando como disponible en `stock.cantidad` — cualquier otra venta
-- en cualquier sede puede vendérsela también. No hay forma de reservarla sin
-- restarla del conteo físico real (que seguiría siendo correcto: la prenda sigue
-- físicamente en la tienda, solo que no se puede vender).
--
-- LA SOLUCIÓN. `cantidad_apartada` es un segundo número sobre la misma fila de
-- `stock`, nunca una tabla nueva (principio 1 — núcleo mínimo: esto vive donde ya
-- vive la verdad de inventario, no en un módulo aparte). `disponible` pasa a ser
-- `cantidad - cantidad_apartada`, no `cantidad`. El conteo físico (`conteo_contar`/
-- `cerrar_conteo`/`previsualizar_cierre_conteo`) sigue leyendo `cantidad` tal cual —
-- lo apartado sigue estando físicamente en la tienda, el censo no cambia.
--
-- SOLO EL MECANISMO, TODAVÍA NO LA PANTALLA. Esta migración deja `apartado`/
-- `liberacion_apartado` como tipos de movimiento reales, con motor y RPC listos —
-- pero `apps/web/lib/ventas-v2.ts` (la pantalla de Vender) está asignada a otra
-- sesión en curso y no se toca acá. Sin UI, `cantidad_apartada` queda en 0 para
-- TODA fila real hasta que una sesión futura la conecte — ver el pendiente que
-- queda en BACKLOG.md.
--
-- DECISIÓN QUE SÍ ES ESTRUCTURAL, DENTRO DE ESTE MISMO ARCHIVO: `salida` (la rama
-- que ejecuta cada venta real, vía `registrar_venta`/`registrar_cambio`) pasa a
-- validar contra `disponible`, no contra `cantidad` a secas. Sin este cambio,
-- `cantidad_apartada` sería un contador decorativo — subiría, pero no evitaría
-- vender la prenda apartada, que es exactamente el bug que esta tarea existe para
-- cerrar. Es seguro hacerlo ahora, sin pantalla: hasta que exista una forma real de
-- apartar, `cantidad_apartada` es 0 en cada fila real, así que
-- `disponible = cantidad - 0 = cantidad` — cero cambio de comportamiento hoy, el
-- candado se activa solo el día que alguien realmente aparte algo.
--
-- LO QUE ESTA MIGRACIÓN DELIBERADAMENTE NO TOCA (queda anotado en BACKLOG.md, no
-- silencioso): las ramas `ajuste` y `traslado` de `fn_aplicar_movimiento` siguen sin
-- validar contra `cantidad_apartada`. Un ajuste de conteo que baje `cantidad` por
-- debajo de `cantidad_apartada`, o un traslado que saque de una fila con apartados
-- activos, van a chocar con el CHECK de abajo y abortar la transacción — comportamiento
-- correcto en el sentido de "nunca deja un estado imposible", pero la frase que hoy
-- vería quien cierra un conteo sería el error crudo de Postgres, no una explicación de
-- negocio. Es una decisión de producto (¿se libera el apartado solo? ¿se bloquea el
-- ajuste?) que le toca decidir a quien conecte la pantalla, no algo para resolver
-- adivinando aquí.
-- ============================================================================

-- ---------- 1. stock gana cantidad_apartada, con las mismas dos redes que ya
-- protegen cantidad: nunca negativo, nunca más de lo que físicamente hay ----------
alter table retail.stock add column cantidad_apartada integer not null default 0;
alter table retail.stock add constraint stock_cantidad_apartada_no_negativa
  check (cantidad_apartada >= 0);
alter table retail.stock add constraint stock_cantidad_apartada_no_excede_cantidad
  check (cantidad_apartada <= cantidad);

-- ---------- 2. movimientos.tipo gana los dos tipos nuevos ----------
alter table retail.movimientos drop constraint movimientos_tipo_check;
alter table retail.movimientos add constraint movimientos_tipo_check
  check (tipo in ('entrada', 'salida', 'ajuste', 'traslado', 'apartado', 'liberacion_apartado'));

-- ---------- 3. el motor: fn_aplicar_movimiento, copia completa de
-- 20260914230000_inventario_piso_almacen.sql:91-183 + 2 ramas nuevas + salida
-- consciente de lo apartado ----------
create or replace function retail.fn_aplicar_movimiento(p_movimiento_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  m movimientos%rowtype;
  v_actual integer;
  v_apartada integer;
  v_ubic_a uuid; v_sub_a uuid; v_ubic_b uuid; v_sub_b uuid;
begin
  select * into m from movimientos where id = p_movimiento_id;
  if not found then
    raise exception 'El movimiento % no existe', p_movimiento_id;
  end if;

  if m.tipo = 'entrada' then
    insert into stock (variante_id, ubicacion_id, sububicacion_id, cantidad)
      values (m.variante_id, m.ubicacion_id, m.sububicacion_id, m.cantidad)
      on conflict (variante_id, ubicacion_id, sububicacion_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, updated_at = now();

  elsif m.tipo = 'salida' then
    -- `sububicacion_id is not distinct from` en vez de `=`: con `=`, la
    -- primera salida en una ubicación sin sububicaciones (sububicacion_id
    -- NULL en ambos lados) fallaría con "stock insuficiente: hay 0" aunque
    -- el stock exista — `NULL = NULL` nunca es verdadero en SQL.
    --
    -- Valida contra DISPONIBLE (cantidad - cantidad_apartada), no contra
    -- cantidad a secas — ver cabecera de esta migración: es lo que hace que
    -- apartar signifique algo de verdad y no solo un contador.
    select cantidad, cantidad_apartada into v_actual, v_apartada from stock
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id
      for update;
    if v_actual is null or (v_actual - coalesce(v_apartada, 0)) < m.cantidad then
      raise exception 'Stock insuficiente: hay % disponible (% en total, % apartado) y se pide sacar %',
        coalesce(v_actual, 0) - coalesce(v_apartada, 0), coalesce(v_actual, 0), coalesce(v_apartada, 0), m.cantidad;
    end if;
    update stock set cantidad = cantidad - m.cantidad, updated_at = now()
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id;

  elsif m.tipo = 'ajuste' then
    insert into stock (variante_id, ubicacion_id, sububicacion_id, cantidad)
      values (m.variante_id, m.ubicacion_id, m.sububicacion_id, 0)
      on conflict (variante_id, ubicacion_id, sububicacion_id) do nothing;
    select cantidad into v_actual from stock
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id
      for update;
    if v_actual + m.cantidad < 0 then
      raise exception 'El ajuste dejaría stock negativo: hay % y el ajuste es %', v_actual, m.cantidad;
    end if;
    update stock set cantidad = cantidad + m.cantidad, updated_at = now()
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id;

  elsif m.tipo = 'traslado' then
    if m.ubicacion_destino_id is null then
      raise exception 'Traslado requiere ubicacion_destino_id';
    end if;

    -- Bloquea origen y destino siempre en el mismo orden relativo (no
    -- "origen primero, destino después" literal): la reposición interna va
    -- a ser mucho más frecuente que las transferencias entre sedes, y sin
    -- un orden determinístico, dos movimientos en sentidos opuestos entre
    -- las mismas dos sububicaciones podrían formar un ciclo de espera real.
    if (m.ubicacion_id, coalesce(m.sububicacion_id, '00000000-0000-0000-0000-000000000000'))
       <= (m.ubicacion_destino_id, coalesce(m.sububicacion_destino_id, '00000000-0000-0000-0000-000000000000'))
    then
      v_ubic_a := m.ubicacion_id; v_sub_a := m.sububicacion_id;
      v_ubic_b := m.ubicacion_destino_id; v_sub_b := m.sububicacion_destino_id;
    else
      v_ubic_a := m.ubicacion_destino_id; v_sub_a := m.sububicacion_destino_id;
      v_ubic_b := m.ubicacion_id; v_sub_b := m.sububicacion_id;
    end if;
    perform 1 from stock where variante_id = m.variante_id and ubicacion_id = v_ubic_a
      and sububicacion_id is not distinct from v_sub_a for update;
    perform 1 from stock where variante_id = m.variante_id and ubicacion_id = v_ubic_b
      and sububicacion_id is not distinct from v_sub_b for update;

    select cantidad into v_actual from stock
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id;
    if v_actual is null or v_actual < m.cantidad then
      raise exception 'Stock insuficiente en origen: hay % y se pide trasladar %', coalesce(v_actual, 0), m.cantidad;
    end if;
    update stock set cantidad = cantidad - m.cantidad, updated_at = now()
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id;
    insert into stock (variante_id, ubicacion_id, sububicacion_id, cantidad)
      values (m.variante_id, m.ubicacion_destino_id, m.sububicacion_destino_id, m.cantidad)
      on conflict (variante_id, ubicacion_id, sububicacion_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, updated_at = now();

  elsif m.tipo = 'apartado' then
    -- Misma fila, mismo `for update` que salida/ajuste — el candado de
    -- concurrencia es el lock de Postgres sobre esta fila, no una columna
    -- de versión ni un mutex aparte (principio 1: nada nuevo si Postgres ya
    -- lo resuelve).
    select cantidad, cantidad_apartada into v_actual, v_apartada from stock
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id
      for update;
    if v_actual is null or (v_actual - coalesce(v_apartada, 0)) < m.cantidad then
      raise exception 'No hay stock disponible para apartar: hay % disponible (% en total, % ya apartado) y se pide apartar %',
        coalesce(v_actual, 0) - coalesce(v_apartada, 0), coalesce(v_actual, 0), coalesce(v_apartada, 0), m.cantidad;
    end if;
    update stock set cantidad_apartada = cantidad_apartada + m.cantidad, updated_at = now()
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id;

  elsif m.tipo = 'liberacion_apartado' then
    select cantidad_apartada into v_apartada from stock
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id
      for update;
    if v_apartada is null or v_apartada < m.cantidad then
      raise exception 'No se puede liberar % — solo hay % apartado en esta fila', m.cantidad, coalesce(v_apartada, 0);
    end if;
    update stock set cantidad_apartada = cantidad_apartada - m.cantidad, updated_at = now()
      where variante_id = m.variante_id and ubicacion_id = m.ubicacion_id
        and sububicacion_id is not distinct from m.sububicacion_id;
  end if;
end;
$$;

-- ---------- 4. reconstrucción completa: recalcular_stock() también tiene que
-- replayear apartado/liberacion_apartado, o un recalculo real borraría cada
-- reserva activa sin avisar (rompe principio 4 — movimientos es la única fuente
-- de verdad, stock es un snapshot derivado completo, no parcial) ----------
create or replace function retail.recalcular_stock()
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  delete from stock;
  insert into stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada)
  select variante_id, ubicacion_id, sububicacion_id,
    sum(delta_cantidad)::integer, sum(delta_apartada)::integer
  from (
    select variante_id, ubicacion_id, sububicacion_id, cantidad as delta_cantidad, 0 as delta_apartada from movimientos where tipo = 'entrada'
    union all
    select variante_id, ubicacion_id, sububicacion_id, -cantidad, 0 from movimientos where tipo = 'salida'
    union all
    select variante_id, ubicacion_id, sububicacion_id, cantidad, 0 from movimientos where tipo = 'ajuste'
    union all
    select variante_id, ubicacion_id, sububicacion_id, -cantidad, 0 from movimientos where tipo = 'traslado'
    union all
    select variante_id, ubicacion_destino_id, sububicacion_destino_id, cantidad, 0 from movimientos where tipo = 'traslado'
    union all
    select variante_id, ubicacion_id, sububicacion_id, 0, cantidad from movimientos where tipo = 'apartado'
    union all
    select variante_id, ubicacion_id, sububicacion_id, 0, -cantidad from movimientos where tipo = 'liberacion_apartado'
  ) t
  group by variante_id, ubicacion_id, sububicacion_id
  having sum(delta_cantidad) <> 0 or sum(delta_apartada) <> 0;
end;
$$;

-- ---------- 5. RPC: registrar_movimiento gana los dos tipos nuevos, en la
-- MISMA firma de 7 parámetros de 20260914230000 (docs/BACKLOG.md ya documenta
-- que esa función vive con dos sobrecargas ambiguas en producción, 6 y 7
-- parámetros — no se agrava acá con una tercera; se extiende la vigente) ----------
create or replace function retail.registrar_movimiento(
  p_variante_id uuid, p_ubicacion_id uuid, p_tipo text, p_cantidad integer,
  p_motivo text default null, p_nota text default null, p_sububicacion_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_id uuid; v_persona uuid; v_sub uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para registrar movimientos en esa ubicación';
  end if;
  if p_tipo not in ('entrada', 'salida', 'ajuste', 'apartado', 'liberacion_apartado') then
    raise exception 'registrar_movimiento es para entrada/salida/ajuste/apartado/liberacion_apartado sueltos. Traslados van por transferir()/mover_interno(), ventas por registrar_venta(), etc.';
  end if;
  -- un ajuste (o un apartado/liberación) sin sububicación explícita, en una
  -- ubicación que separa piso/almacén, no tiene un default seguro: las tres
  -- operan sobre UNA fila exacta, no tienen un "de dónde sale" implícito como
  -- entrada/salida — mejor exigir la decisión que adivinar mal y crear una
  -- fila fantasma con sububicacion_id null (el bug histórico de ADR-0031).
  if p_tipo in ('ajuste', 'apartado', 'liberacion_apartado') and p_sububicacion_id is null and exists (
    select 1 from sububicaciones where ubicacion_id = p_ubicacion_id and tipo in ('piso_venta', 'almacen_tienda')
  ) then
    raise exception 'Esta ubicación separa piso y almacén — indica a cuál corresponde el movimiento';
  end if;
  v_sub := coalesce(p_sububicacion_id,
    case p_tipo
      when 'entrada' then fn_sububicacion_por_defecto(p_ubicacion_id, 'entrada')
      when 'salida' then fn_sububicacion_por_defecto(p_ubicacion_id, 'venta')
    end);
  select id into v_persona from personas where auth_user_id = auth.uid();
  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, nota)
    values (p_variante_id, p_ubicacion_id, v_sub, p_tipo, p_cantidad, p_motivo, v_persona, p_nota)
    returning id into v_id;
  perform fn_aplicar_movimiento(v_id);
  return v_id;
end;
$$;
