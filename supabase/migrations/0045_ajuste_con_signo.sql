-- ============================================================================
-- 0045 — El ajuste puede bajar, y el stock sigue sin poder ser negativo
--
-- QUÉ ARREGLA
--   Hoy es IMPOSIBLE registrar un conteo físico menor a lo que dice el sistema.
--   No por la pantalla (`MovimientoModal.tsx:148` tiene `min={1}`, que es solo
--   un síntoma) sino por la base: la rama `ajuste` de `fn_aplicar_movimiento`
--   propone la fila con el DELTA y confía en que el `on conflict do update` lo
--   sume a la fila existente:
--
--       insert into stock (variante_id, sede_id, cantidad)
--         values (m.variante_id, m.sede_id, m.cantidad)   -- ← propone -2
--         on conflict (...) do update set cantidad = stock.cantidad + excluded.cantidad
--
--   Postgres evalúa los CHECK sobre la fila PROPUESTA, ANTES de detectar el
--   conflicto. Así que `stock_cantidad_no_negativa` rechaza el ajuste negativo
--   aunque el resultado final fuera positivo. Verificado en local el 2026-09-09:
--
--       ERROR: new row for relation "stock" violates check constraint
--              "stock_cantidad_no_negativa"
--       DETAIL: Failing row contains (..., -2, ...)
--
--   Es EXACTAMENTE el mismo bug que ADR-0020 encontró en `recalcular_stock()`,
--   en otra rama de la misma familia de código. Aquel se descubrió sembrando
--   datos de demo; éste, intentando contar hacia abajo.
--
-- POR QUÉ IMPORTA AHORA
--   Un conteo físico es la única forma de que el inventario vuelva a ser verdad:
--   "el sistema dice 5, en la percha hay 3". Sin ajustes con signo eso solo se
--   puede registrar mintiendo — una `salida` con `motivo='merma'`, que afirma
--   que la prenda se perdió cuando en realidad el sistema estaba equivocado.
--   Todo el censo del catálogo real descansa sobre esta migración.
--
-- CÓMO SE ARREGLA
--   Se deja de proponer filas negativas. La rama `ajuste` ahora:
--     1. asegura que la fila exista con `insert ... values (.., 0) do nothing`
--        (un 0 nunca viola el CHECK);
--     2. la bloquea con `for update` y lee el valor real;
--     3. si `actual + delta < 0`, aborta con un mensaje que dice QUÉ variante y
--        en QUÉ sede — no un error de constraint que nadie entiende;
--     4. recién entonces hace `update ... set cantidad = cantidad + delta`,
--        donde el CHECK se evalúa sobre el valor final.
--   El `for update` sobre una fila que ya existe es lo que hace esto correcto
--   con dos personas ajustando a la vez (mismo criterio que la rama `salida`
--   desde `0010_stock_concurrencia.sql`). Proponer el absoluto calculado en
--   memoria y confiar en `do update set cantidad = excluded.cantidad` habría
--   sido más corto, pero deja una carrera cuando la fila todavía no existe: dos
--   ajustes simultáneos calcularían ambos sobre 0 y el segundo pisaría al
--   primero.
--
--   Para el ajuste POSITIVO el comportamiento observable no cambia en nada.
--
-- LAS REDES QUE FALTABAN
--   · `stock_almacen` no tiene `cantidad >= 0` — ni en local ni en producción.
--     Con ajustes negativos habilitados, el almacén se iría a negativo en
--     silencio. Se agrega.
--   · `movimientos.cantidad` no tiene NINGÚN check de signo: hoy una `entrada`
--     de -5 o una `salida` de 0 se aceptan sin chistar. Ahora `cantidad <> 0`
--     siempre, y solo el `ajuste` puede ser negativo — el signo deja de ser una
--     convención que hay que recordar y pasa a ser una regla de la base.
--   · Producción NUNCA tuvo `stock_cantidad_no_negativa`: existe solo en
--     `0010_stock_concurrencia.sql`, no en `unificacion/05_operacion.sql`. El
--     gemelo `unificacion/27_...` lo agrega allá.
--
--   Se usa `not valid` + `validate` por separado a propósito: si hay alguna fila
--   histórica sucia, la guarda queda puesta para todo lo NUEVO y el `validate`
--   falla ruidosamente señalando el problema, en vez de que el `alter` entero
--   se caiga y quedemos sin protección.
--
-- SE ROMPE SI: alguien necesitara registrar stock negativo a propósito (no
--   existe tal caso en retail: si hay menos de cero es un error de captura).
--
-- CÓMO SE REVIERTE: volver a pegar el bloque 4 de `0044_almacen_interno.sql` y
--   `alter table ... drop constraint` los tres checks.
-- ============================================================================

-- ---------- PRE-FLIGHT (correr y LEER antes de aplicar en producción) ----------
-- Si alguno devuelve > 0, el `validate` de abajo va a fallar. No se fuerza: se
-- mira fila por fila con Felipe y se corrige con movimientos, nunca borrando.
--
--   select 'stock negativo', count(*) from retail.stock where cantidad < 0
--   union all select 'stock_almacen negativo', count(*) from retail.stock_almacen where cantidad < 0
--   union all select 'movimientos en cero', count(*) from retail.movimientos where cantidad = 0
--   union all select 'movimientos negativos no-ajuste', count(*)
--     from retail.movimientos where cantidad < 0 and tipo <> 'ajuste';

-- ---------- 1. las redes de seguridad ----------
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stock_cantidad_no_negativa') then
    alter table stock add constraint stock_cantidad_no_negativa check (cantidad >= 0) not valid;
  end if;
end $$;
alter table stock validate constraint stock_cantidad_no_negativa;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stock_almacen_cantidad_no_negativa') then
    alter table stock_almacen add constraint stock_almacen_cantidad_no_negativa check (cantidad >= 0) not valid;
  end if;
end $$;
alter table stock_almacen validate constraint stock_almacen_cantidad_no_negativa;

-- Solo el ajuste lleva signo; todo lo demás es una cantidad positiva y el
-- sentido lo da el `tipo`. Un movimiento de cero no significa nada y ensucia.
alter table movimientos drop constraint if exists movimientos_cantidad_coherente;
alter table movimientos add constraint movimientos_cantidad_coherente
  check (cantidad <> 0 and (tipo = 'ajuste' or cantidad > 0)) not valid;
alter table movimientos validate constraint movimientos_cantidad_coherente;

-- ---------- 2. fn_aplicar_movimiento: las dos ramas `ajuste`, sin proponer negativos ----------
-- Cuerpo idéntico a `0044_almacen_interno.sql` salvo las dos ramas `ajuste`
-- (piso y almacén), que pasan al patrón asegurar-bloquear-verificar-sumar.
create or replace function fn_aplicar_movimiento(p_movimiento_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m movimientos%rowtype;
  v_actual integer;
  v_es_almacen boolean := false;
  v_contenedor_sede_id uuid;
begin
  select * into m from movimientos where id = p_movimiento_id;
  if not found then raise exception 'Movimiento % no existe', p_movimiento_id; end if;

  if m.contenedor_id is not null then
    select c.sede_id, (c.tipo = 'almacen') into v_contenedor_sede_id, v_es_almacen
      from contenedores c where c.id = m.contenedor_id;
    if v_contenedor_sede_id is null then
      raise exception 'El contenedor % no existe', m.contenedor_id;
    end if;
    if m.tipo = 'traslado' then
      if v_contenedor_sede_id <> coalesce(m.sede_destino_id, m.sede_id) then
        raise exception 'El contenedor % no pertenece a la sede destino del traslado', m.contenedor_id;
      end if;
      v_es_almacen := false;
    elsif v_contenedor_sede_id <> m.sede_id then
      raise exception 'El contenedor % no pertenece a la sede %', m.contenedor_id, m.sede_id;
    end if;
  end if;

  if v_es_almacen and m.tipo in ('entrada', 'salida', 'ajuste') then
    -- ===== rama ALMACÉN =====
    if m.tipo = 'salida' then
      select coalesce(cantidad, 0) into v_actual from stock_almacen
        where variante_id = m.variante_id and sede_id = m.sede_id for update;
      if coalesce(v_actual, 0) < m.cantidad then
        raise exception 'Stock insuficiente en el almacén de la sede % (hay %, se pidió %)',
          m.sede_id, coalesce(v_actual, 0), m.cantidad;
      end if;
    end if;

    if m.tipo = 'entrada' then
      insert into stock_almacen (variante_id, sede_id, cantidad, ultima_entrada)
        values (m.variante_id, m.sede_id, m.cantidad, m.created_at)
        on conflict (variante_id, sede_id) do update
          set cantidad = stock_almacen.cantidad + excluded.cantidad,
              ultima_entrada = excluded.ultima_entrada, updated_at = now();
    elsif m.tipo = 'salida' then
      update stock_almacen set cantidad = cantidad - m.cantidad, ultima_salida = m.created_at, updated_at = now()
        where variante_id = m.variante_id and sede_id = m.sede_id;
    elsif m.tipo = 'ajuste' then
      -- Asegurar-bloquear-verificar-sumar (ver cabecera).
      insert into stock_almacen (variante_id, sede_id, cantidad)
        values (m.variante_id, m.sede_id, 0)
        on conflict (variante_id, sede_id) do nothing;
      select cantidad into v_actual from stock_almacen
        where variante_id = m.variante_id and sede_id = m.sede_id for update;
      if v_actual + m.cantidad < 0 then
        raise exception 'El ajuste dejaría el almacén de la sede % en negativo para esa prenda (hay %, se ajusta %)',
          m.sede_id, v_actual, m.cantidad;
      end if;
      update stock_almacen set cantidad = cantidad + m.cantidad, updated_at = now()
        where variante_id = m.variante_id and sede_id = m.sede_id;
    end if;
    return;
  end if;

  -- ===== rama PISO / cruce entre sedes =====
  if m.tipo = 'salida' or m.tipo = 'traslado' then
    select coalesce(cantidad, 0) into v_actual from stock
      where variante_id = m.variante_id and sede_id = m.sede_id for update;
    if coalesce(v_actual, 0) < m.cantidad then
      raise exception 'Stock insuficiente en sede % (hay %, se pidió %)', m.sede_id, coalesce(v_actual, 0), m.cantidad;
    end if;
  end if;

  if m.tipo = 'entrada' then
    insert into stock (variante_id, sede_id, cantidad, ultima_entrada, contenedor_id)
      values (m.variante_id, m.sede_id, m.cantidad, m.created_at, m.contenedor_id)
      on conflict (variante_id, sede_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, ultima_entrada = excluded.ultima_entrada,
            contenedor_id = coalesce(excluded.contenedor_id, stock.contenedor_id), updated_at = now();

  elsif m.tipo = 'salida' then
    update stock set
      cantidad = cantidad - m.cantidad,
      ultima_salida = m.created_at,
      ultima_venta = case when m.motivo = 'venta' then m.created_at else ultima_venta end,
      updated_at = now()
      where variante_id = m.variante_id and sede_id = m.sede_id;

  elsif m.tipo = 'ajuste' then
    -- Asegurar-bloquear-verificar-sumar: un ajuste puede ser negativo (un conteo
    -- que encontró menos de lo que decía el sistema) y nunca puede dejar el
    -- stock bajo cero. Ver la cabecera para por qué no se propone el delta.
    insert into stock (variante_id, sede_id, cantidad)
      values (m.variante_id, m.sede_id, 0)
      on conflict (variante_id, sede_id) do nothing;
    select cantidad into v_actual from stock
      where variante_id = m.variante_id and sede_id = m.sede_id for update;
    if v_actual + m.cantidad < 0 then
      raise exception 'El ajuste dejaría el stock en negativo en la sede % (hay %, se ajusta %)',
        m.sede_id, v_actual, m.cantidad;
    end if;
    update stock set cantidad = cantidad + m.cantidad, updated_at = now()
      where variante_id = m.variante_id and sede_id = m.sede_id;

  elsif m.tipo = 'traslado' then
    if m.sede_destino_id is null then raise exception 'Traslado requiere sede_destino_id'; end if;
    update stock set cantidad = cantidad - m.cantidad, ultima_salida = m.created_at, updated_at = now()
      where variante_id = m.variante_id and sede_id = m.sede_id;
    insert into stock (variante_id, sede_id, cantidad, ultima_entrada, contenedor_id)
      values (m.variante_id, m.sede_destino_id, m.cantidad, m.created_at, m.contenedor_id)
      on conflict (variante_id, sede_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, ultima_entrada = excluded.ultima_entrada,
            contenedor_id = coalesce(excluded.contenedor_id, stock.contenedor_id), updated_at = now();
  end if;
end;
$$;
