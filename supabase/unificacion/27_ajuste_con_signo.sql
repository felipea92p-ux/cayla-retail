-- ============================================================================
-- 27 — El ajuste puede bajar, y el stock deja de poder ser negativo
-- Correr en cayla-DYNAMIC (SQL Editor). Todo en el cajón `retail`.
-- Gemelo de `supabase/migrations/0045_ajuste_con_signo.sql`.
--
-- ⚠ ESTE ARCHIVO ES MÁS GRANDE EN PRODUCCIÓN QUE EN LOCAL, y hay que saber por
-- qué: local tiene `stock_cantidad_no_negativa` desde
-- `0010_stock_concurrencia.sql:14`; **producción NUNCA lo tuvo**. No está en
-- `unificacion/05_operacion.sql` ni en ningún archivo posterior. O sea que hoy,
-- en la base con la que factura CAYLA, `retail.stock.cantidad` puede irse a
-- negativo sin que nada lo impida. Nadie lo notó porque ninguna ruta escribía
-- un negativo — hasta ahora, que vamos a habilitar los ajustes con signo.
--
-- QUÉ ARREGLA
--   1. Contar hacia abajo es imposible. La rama `ajuste` de
--      `retail.fn_aplicar_movimiento` propone la fila con el DELTA:
--
--        insert into stock (variante_id, sede_id, cantidad)
--          values (m.variante_id, m.sede_id, m.cantidad)   -- ← propone -2
--          on conflict (...) do update set cantidad = stock.cantidad + excluded.cantidad
--
--      Postgres evalúa los CHECK sobre la fila PROPUESTA, antes de detectar el
--      conflicto. En local eso revienta contra `stock_cantidad_no_negativa`
--      (verificado el 2026-09-09). En PRODUCCIÓN, donde ese CHECK no existe,
--      pasa algo peor que un error: el `insert` entra, el `do update` suma, y
--      todo parece funcionar — hasta que un ajuste negativo sobre una variante
--      SIN fila previa crea una fila de stock negativa en silencio.
--      Es el mismo bug que ADR-0020 encontró en `recalcular_stock()`.
--
--   2. `retail.stock` y `retail.stock_almacen` sin red de no-negatividad.
--
--   3. `retail.movimientos.cantidad` sin ningún check de signo: hoy una
--      `entrada` de -5 o una `salida` de 0 se aceptan sin chistar.
--
-- POR QUÉ IMPORTA
--   Un conteo físico es la única forma de que el inventario vuelva a ser verdad:
--   "el sistema dice 5, en la percha hay 3". Sin ajustes con signo eso solo se
--   registra mintiendo — una `salida` con `motivo='merma'`, que afirma que la
--   prenda se perdió cuando el equivocado era el sistema. El censo del catálogo
--   real descansa sobre este archivo.
--
-- ORDEN OBLIGATORIO: pegar DESPUÉS de
--   `26_ultima_venta_en_aplicar_movimiento.sql`, porque los dos reemplazan el
--   cuerpo de `retail.fn_aplicar_movimiento` y éste incluye lo de aquél.
--   (Si se pegan al revés, se pierde `ultima_venta` otra vez.)
--
-- CÓMO SE REVIERTE
--   alter table retail.stock drop constraint stock_cantidad_no_negativa;
--   alter table retail.stock_almacen drop constraint stock_almacen_cantidad_no_negativa;
--   alter table retail.movimientos drop constraint movimientos_cantidad_coherente;
--   y volver a pegar `26_ultima_venta_en_aplicar_movimiento.sql`.
-- ============================================================================

-- ============================================================================
-- PASO 0 · PRE-FLIGHT — CORRER ESTO SOLO, LEER EL RESULTADO, Y RECIÉN SEGUIR
-- ============================================================================
-- Si alguna fila da > 0, NO seguir: el `validate` de abajo va a fallar. Se mira
-- caso por caso con Felipe y se corrige con movimientos, nunca borrando.
--
--   select 'stock negativo' as que, count(*) from retail.stock where cantidad < 0
--   union all
--   select 'stock_almacen negativo', count(*) from retail.stock_almacen where cantidad < 0
--   union all
--   select 'movimientos en cero', count(*) from retail.movimientos where cantidad = 0
--   union all
--   select 'movimientos negativos que no son ajuste', count(*)
--     from retail.movimientos where cantidad < 0 and tipo <> 'ajuste';
--
-- Si hubiera stock negativo, esta consulta dice cuál y de quién es:
--   select v.sku, s.cantidad, se.codigo
--   from retail.stock s
--   join retail.variantes v on v.id = s.variante_id
--   join public.sedes se on se.id = s.sede_id
--   where s.cantidad < 0;
-- ============================================================================

-- ---------- 1. las redes de seguridad ----------
-- `not valid` + `validate` separados a propósito: si hay una fila histórica
-- sucia, la guarda queda puesta para todo lo NUEVO y el `validate` falla
-- ruidosamente señalando el problema, en vez de que el `alter` entero se caiga
-- y quedemos sin ninguna protección.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stock_cantidad_no_negativa') then
    alter table retail.stock add constraint stock_cantidad_no_negativa check (cantidad >= 0) not valid;
  end if;
end $$;
alter table retail.stock validate constraint stock_cantidad_no_negativa;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stock_almacen_cantidad_no_negativa') then
    alter table retail.stock_almacen add constraint stock_almacen_cantidad_no_negativa check (cantidad >= 0) not valid;
  end if;
end $$;
alter table retail.stock_almacen validate constraint stock_almacen_cantidad_no_negativa;

alter table retail.movimientos drop constraint if exists movimientos_cantidad_coherente;
alter table retail.movimientos add constraint movimientos_cantidad_coherente
  check (cantidad <> 0 and (tipo = 'ajuste' or cantidad > 0)) not valid;
alter table retail.movimientos validate constraint movimientos_cantidad_coherente;

-- ---------- 2. fn_aplicar_movimiento: las dos ramas `ajuste` sin proponer negativos ----------
-- Cuerpo idéntico a `26_ultima_venta_en_aplicar_movimiento.sql` salvo las dos
-- ramas `ajuste` (piso y almacén), que pasan al patrón
-- asegurar → bloquear → verificar → sumar:
--   1. `insert ... values (.., 0) on conflict do nothing` — un 0 nunca viola el CHECK;
--   2. `for update` sobre una fila que YA existe: sin carrera entre dos ajustes
--      simultáneos (proponer el absoluto calculado en memoria habría sido más
--      corto pero deja esa carrera abierta cuando la fila todavía no existía);
--   3. si `actual + delta < 0`, aborta diciendo QUÉ sede y CUÁNTO hay;
--   4. `update ... set cantidad = cantidad + delta`, donde el CHECK se evalúa
--      sobre el valor final.
-- Para un ajuste POSITIVO el comportamiento observable no cambia en nada.
create or replace function retail.fn_aplicar_movimiento(p_movimiento_id uuid)
returns void language plpgsql security definer set search_path = retail, public
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

-- ============================================================================
-- VERIFICACIÓN (correr a mano después de pegar)
-- ============================================================================
-- 1. Las tres redes están puestas y validadas:
--   select conname, convalidated from pg_constraint
--   where conname in ('stock_cantidad_no_negativa','stock_almacen_cantidad_no_negativa',
--                     'movimientos_cantidad_coherente');
--   -- las tres deben decir convalidated = true.
--
-- 2. La función tiene el patrón nuevo y conserva ultima_venta:
--   select pg_get_functiondef('retail.fn_aplicar_movimiento(uuid)'::regprocedure) like '%ultima_venta = case%' as tiene_ultima_venta,
--          pg_get_functiondef('retail.fn_aplicar_movimiento(uuid)'::regprocedure) like '%dejaría el stock en negativo%' as tiene_guarda_ajuste;
--   -- las dos deben dar true.
--
-- 3. Prueba viva (en una transacción que se revierte, con una variante real):
--   begin;
--     -- subir 3 y bajarlos: el neto debe quedar igual que al empezar
--     select retail.registrar_movimiento('<variante>', '<sede>', 'ajuste',  3, 'prueba');
--     select retail.registrar_movimiento('<variante>', '<sede>', 'ajuste', -3, 'prueba');
--     select cantidad from retail.stock where variante_id='<variante>' and sede_id='<sede>';
--   rollback;
--
-- 4. Que la red muerda: un ajuste imposible debe fallar con mensaje en castellano.
--   begin;
--     select retail.registrar_movimiento('<variante>', '<sede>', 'ajuste', -99999, 'prueba');
--     -- debe decir: "El ajuste dejaría el stock en negativo en la sede ..."
--   rollback;
-- ============================================================================
