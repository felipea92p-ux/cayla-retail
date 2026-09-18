-- ============================================================================
-- RESTAURAR `stock.ultima_venta` EN PRODUCCIÓN
-- Correr en cayla-DYNAMIC (SQL Editor). Todo en el cajón `retail`.
--
-- Gemelo de `supabase/migrations/0042_almacen_interno.sql`. A producción le
-- falta SOLO esto: la tabla `retail.stock_almacen`, el contenedor
-- `tipo='almacen'`, `bajar_a_piso`, `devolver_a_almacen` y la versión de
-- `recalcular_stock` con las dos bolsas ya se pegaron el 2026-09-03
-- (`12_almacen_interno.sql`). Lo que 0042 sube al riel numerado para el local,
-- acá ya estaba — menos esta línea.
--
-- QUÉ ARREGLA
--   `retail.stock.ultima_venta` existe como columna desde `05_operacion.sql:191`
--   pero NADIE la escribe. Cuando `12_almacen_interno.sql` reescribió
--   `retail.fn_aplicar_movimiento` para enrutar al almacén, partió de un cuerpo
--   anterior a `supabase/migrations/0011_stock_ultima_venta.sql` y perdió por el
--   camino esta línea de la rama `salida`:
--
--       ultima_venta = case when m.motivo = 'venta' then m.created_at else ultima_venta end
--
--   Verificación de que falta (correr ANTES de pegar, debe dar 0 filas):
--       select count(*) from retail.stock where ultima_venta is not null;
--
--   Efecto real hoy: `apps/web/lib/catalogo.ts:70-72` lee siempre null →
--   `apps/web/lib/inteligencia.ts:103` cae al fallback `creadaEn` → el indicador
--   "Días sin venta" mide en verdad la edad de la variante desde que se creó, y
--   "Estancado" marca todo el catálogo para siempre. Las alertas de rotación y
--   las sugerencias de traslado de `/comercial` trabajan sobre esa mentira.
--
--   Es la misma clase de cicatriz que ADR-0004 documenta para `recibir_lote`:
--   una reescritura de la unificación que copió una versión vieja del cuerpo.
--
-- QUÉ CAMBIA Y QUÉ NO
--   El cuerpo de abajo es IDÉNTICO a `12_almacen_interno.sql:155-249`
--   (validación contenedor↔sede, rama almacén, rama piso, traslado) salvo dos
--   cosas, ambas en la rama `salida` del piso:
--     1. se sella `ultima_venta` cuando `motivo = 'venta'`;
--     2. nada más.
--   El almacén, los traslados y las entradas quedan byte por byte como están.
--
-- POR QUÉ el `case` y no sellar en toda salida: bajar mercadería del almacén al
--   piso también es una `salida`. Sin el `case`, cada bajada reiniciaría el
--   contador de "días sin venta" sin que ninguna clienta haya comprado — que es
--   exactamente el bug que `0011` arregló en su día.
--
-- CÓMO SE REVIERTE: volver a pegar el bloque 4 de
--   `supabase/unificacion/12_almacen_interno.sql` tal cual está en git.
--   No toca datos ni esquema, solo el cuerpo de una función.
--
-- Idempotente: `create or replace` + un backfill con `update ... from`.
-- ============================================================================

-- ---------- 1. la función, con ultima_venta restaurado ----------
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
    -- ===== rama ALMACÉN (sin cambios respecto a 12_almacen_interno.sql) =====
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
        values (m.variante_id, m.sede_id, m.cantidad)
        on conflict (variante_id, sede_id) do update
          set cantidad = stock_almacen.cantidad + excluded.cantidad, updated_at = now();
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
    -- ↓↓↓ LA ÚNICA LÍNEA NUEVA DE TODO ESTE ARCHIVO ↓↓↓
    update stock set
      cantidad = cantidad - m.cantidad,
      ultima_salida = m.created_at,
      ultima_venta = case when m.motivo = 'venta' then m.created_at else ultima_venta end,
      updated_at = now()
      where variante_id = m.variante_id and sede_id = m.sede_id;

  elsif m.tipo = 'ajuste' then
    insert into stock (variante_id, sede_id, cantidad)
      values (m.variante_id, m.sede_id, m.cantidad)
      on conflict (variante_id, sede_id) do update
        set cantidad = stock.cantidad + excluded.cantidad, updated_at = now();

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

-- ---------- 2. backfill: recuperar la historia que ya está en movimientos ----------
-- Sin esto, la columna arranca vacía y "Días sin venta" seguiría mintiendo hasta
-- que cada prenda se venda una vez más. La verdad ya está escrita en
-- `movimientos` (append-only, principio 4) — solo hay que derivarla.
update retail.stock s set ultima_venta = sub.max_fecha
from (
  select variante_id, sede_id, max(created_at) as max_fecha
  from retail.movimientos
  where tipo = 'salida' and motivo = 'venta'
  group by variante_id, sede_id
) sub
where s.variante_id = sub.variante_id and s.sede_id = sub.sede_id;

-- ============================================================================
-- VERIFICACIÓN (correr a mano después de pegar)
-- ============================================================================
-- 1. El backfill llenó lo que había: debe dar tantas filas como pares
--    (variante, sede) con al menos una venta en el histórico.
--   select count(*) as con_ultima_venta from retail.stock where ultima_venta is not null;
--   select count(*) as pares_con_venta from (
--     select 1 from retail.movimientos where tipo='salida' and motivo='venta'
--     group by variante_id, sede_id) t;
--   -- los dos números deben coincidir.
--
-- 2. La función quedó con la línea nueva:
--   select pg_get_functiondef('retail.fn_aplicar_movimiento(uuid)'::regprocedure)
--     like '%ultima_venta = case when m.motivo%' as tiene_ultima_venta;
--   -- debe dar true.
--
-- 3. Prueba viva: registrar una venta real desde /vender y comprobar que
--    `ultima_venta` de esa variante+sede quedó con la fecha de hoy, y que una
--    bajada de almacén a piso (bajar_a_piso) NO la mueve.
-- ============================================================================
