-- ============================================================================
-- recalcular_stock — arreglo: nunca pudo correr en una base con ventas
-- Correr en cayla-DYNAMIC. Solo toca `retail`. Ver
-- docs/adr/0020-recalcular-stock-neto.md.
--
-- Espejo de supabase/migrations/0042_recalcular_stock_neto.sql, con el prefijo
-- `retail.` que el SQL Editor de producción necesita (sin él busca en `public`,
-- que en el proyecto de Dynamic es el schema de Dynamic, no el de retail).
--
-- 100% seguro de correr: reemplaza el cuerpo de una función que hoy no puede
-- terminar. No toca tablas, ni datos, ni firmas — misma firma `()`, así que el
-- CREATE OR REPLACE sí reemplaza y no deja una sobrecarga fantasma (la lección
-- de ADR-0004). Verificación al final.
-- ============================================================================

-- POR QUÉ FALLABA: insertaba las salidas como `-sum(cantidad)` confiando en que
-- el `on conflict do update` las restara de la fila que ya había creado el paso
-- de entradas. Pero Postgres evalúa los CHECK sobre la fila PROPUESTA, ANTES de
-- detectar el conflicto — así que `stock_cantidad_no_negativa` rechazaba la
-- fila negativa antes de que el update llegara a existir. Reproducción mínima:
--
--   create temp table t (a int primary key, b int check (b >= 0));
--   insert into t values (1, 5);
--   insert into t values (1, -3) on conflict (a) do update set b = t.b + excluded.b;
--   -- ERROR: violates check constraint "t_b_check", aunque el resultado seria 2
--
-- EL ARREGLO: calcular el NETO por (variante, sede) en una sola pasada y recién
-- entonces escribir. Y no truncar: el `truncate` de la versión vieja borraba
-- además `stock_minimo` (el mínimo por sede de la RPC `fijar_stock_minimo`) y
-- `contenedor_id`, que no se derivan de `movimientos`.

-- ⚠ CUERPO PUESTO AL DÍA EL 2026-09-10. El que había acá era muy anterior al de
--   producción: no conocía `stock_almacen`, no tenía candado de Líder, no tenía el
--   arreglo de traslados ni el de `stock_minimo`. Producción los fue recibiendo a
--   mano y ninguno quedó escrito, así que **volver a pegar este archivo desarmaba
--   los cuatro de golpe**. Lo de abajo es el cuerpo vivo en producción, traído
--   desde la base con `pg_get_functiondef` (no transcrito a mano). Ver ADR-0026.
--
--   Los cuatro arreglos que este archivo perdía:
--     1. `es_lider() is not true` — recalcular el stock entero no es de cualquiera.
--     2. El traslado cuenta como PISO en ambas patas aunque traiga contenedor de
--        almacén; sin eso se restaba de piso y no de almacén: cantidad fantasma.
--     3. `stock_minimo is null` en el delete — una fila que existe solo para
--        guardar un mínimo configurado no es huérfana (mismo arreglo que `0053`).
--     4. `get diagnostics` + `raise notice` — decir cuántas filas tocó.

create or replace function retail.recalcular_stock()
returns void
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_piso integer; v_almacen integer;
begin
  if retail.es_lider() is not true then
    raise exception 'Solo un Líder puede recalcular el stock';
  end if;

  -- ===== PISO: todo lo que NO está enrutado a un contenedor 'almacen' =====
  -- Excepción: un traslado SIEMPRE cuenta como piso en ambos lados, aunque
  -- traiga un contenedor_id de almacén -- fn_aplicar_movimiento fuerza
  -- v_es_almacen=false para tipo='traslado' incondicionalmente. Sin esta
  -- excepción, ese traslado se restaría de piso pero no de almacén: cantidad
  -- fantasma duplicada.
  insert into retail.stock (variante_id, sede_id, cantidad, ultima_entrada, ultima_salida)
  select variante_id, sede_id, sum(delta), max(entrada_en), max(salida_en)
  from (
    select m.variante_id,
           m.sede_id,
           case when m.tipo in ('entrada', 'ajuste') then m.cantidad else -m.cantidad end as delta,
           case when m.tipo = 'entrada' then m.created_at end as entrada_en,
           case when m.tipo in ('salida', 'traslado') then m.created_at end as salida_en
    from retail.movimientos m
    left join retail.contenedores c on c.id = m.contenedor_id
    where m.tipo = 'traslado' or coalesce(c.tipo, '') <> 'almacen'
    union all
    select variante_id, sede_destino_id, cantidad, created_at, null
    from retail.movimientos
    where tipo = 'traslado' and sede_destino_id is not null
  ) neto
  group by variante_id, sede_id
  on conflict (variante_id, sede_id) do update
    set cantidad = excluded.cantidad,
        ultima_entrada = excluded.ultima_entrada,
        ultima_salida = excluded.ultima_salida;
  get diagnostics v_piso = row_count;

  update retail.stock s set ultima_venta = sub.max_fecha
  from (
    select variante_id, sede_id, max(created_at) as max_fecha
    from retail.movimientos where tipo = 'salida' and motivo = 'venta'
    group by variante_id, sede_id
  ) sub
  where s.variante_id = sub.variante_id and s.sede_id = sub.sede_id;

  -- Borde heredado de ADR-0020: no borrar una fila que solo existe para
  -- guardar un stock_minimo configurado (fijar_stock_minimo crea la fila con
  -- cantidad 0 antes de que exista ningún movimiento real en esa sede).
  delete from retail.stock s
  where s.stock_minimo is null
    and not exists (
      select 1 from retail.movimientos m
      left join retail.contenedores c on c.id = m.contenedor_id
      where m.variante_id = s.variante_id
        and (
          (m.sede_id = s.sede_id and (m.tipo = 'traslado' or coalesce(c.tipo, '') <> 'almacen'))
          or (m.tipo = 'traslado' and m.sede_destino_id = s.sede_id)
        )
    );

  -- ===== ALMACÉN: espejo, solo lo enrutado a un contenedor 'almacen' =====
  -- (un traslado nunca llega aquí -- ver la excepción de arriba)
  insert into retail.stock_almacen (variante_id, sede_id, cantidad, ultima_entrada, ultima_salida)
  select variante_id, sede_id, sum(delta), max(entrada_en), max(salida_en)
  from (
    select m.variante_id,
           m.sede_id,
           case when m.tipo in ('entrada', 'ajuste') then m.cantidad else -m.cantidad end as delta,
           case when m.tipo = 'entrada' then m.created_at end as entrada_en,
           case when m.tipo = 'salida' then m.created_at end as salida_en
    from retail.movimientos m
    join retail.contenedores c on c.id = m.contenedor_id and c.tipo = 'almacen'
    where m.tipo in ('entrada', 'salida', 'ajuste')
  ) neto
  group by variante_id, sede_id
  on conflict (variante_id, sede_id) do update
    set cantidad = excluded.cantidad,
        ultima_entrada = excluded.ultima_entrada,
        ultima_salida = excluded.ultima_salida;
  get diagnostics v_almacen = row_count;

  delete from retail.stock_almacen sa
  where not exists (
    select 1 from retail.movimientos m
    join retail.contenedores c on c.id = m.contenedor_id and c.tipo = 'almacen'
    where m.variante_id = sa.variante_id and m.sede_id = sa.sede_id
  );

  raise notice 'recalcular_stock: % filas de piso, % filas de almacén recalculadas.', v_piso, v_almacen;
end;
$$;

comment on function retail.recalcular_stock() is
  'Reconstruye `stock` y `stock_almacen` desde `movimientos` (la fuente de verdad). Neto por (variante, sede) antes de escribir (ADR-0020), ruteo por contenedor tipo almacen, y el traslado cuenta como piso en ambas patas. Solo Líder. Conserva stock_minimo y contenedor_id, que no se derivan de movimientos.';

-- ============================================================================
-- VERIFICACIÓN — correr DESPUÉS, en el mismo SQL Editor.
-- ============================================================================
-- (a) Que quede UNA sola función con ese nombre (lección de ADR-0004):
--
--     select oid::regprocedure from pg_proc
--     where proname = 'recalcular_stock' and pronamespace = 'retail'::regnamespace;
--     -- debe devolver exactamente 1 fila: retail.recalcular_stock()
--
-- (b) Que reconstruir NO cambie nada — si el stock está sano, recalcular no
--     debe mover ni una unidad.
--
--     OJO CON LA TABLA DE RESPALDO: tiene que ser REAL, no `temporary`. El SQL
--     Editor de Supabase corre cada ejecución en una conexión distinta del pool,
--     así que una tabla temporal muere al terminar la consulta y con ella la
--     única copia del estado previo — justo cuando aparece algo que investigar.
--     Pasó de verdad la primera vez que se corrió esto en producción
--     (2026-09-09): el conteo dio 2 diferencias y ya no había con qué compararlas.
--
--     create table retail._stock_antes_0020 as
--       select variante_id, sede_id, cantidad, stock_minimo from retail.stock;
--
--     select retail.recalcular_stock();
--
--     select vr.sku, se.codigo as sede, a.cantidad as antes, s.cantidad as ahora,
--            (select count(*) from retail.movimientos m
--              where m.variante_id = coalesce(a.variante_id, s.variante_id)
--                and (m.sede_id = coalesce(a.sede_id, s.sede_id)
--                     or m.sede_destino_id = coalesce(a.sede_id, s.sede_id))) as respaldo
--     from retail._stock_antes_0020 a
--     full join retail.stock s
--       on s.variante_id = a.variante_id and s.sede_id = a.sede_id
--     left join retail.variantes vr on vr.id = coalesce(a.variante_id, s.variante_id)
--     left join retail.sedes     se on se.id = coalesce(a.sede_id, s.sede_id)
--     where a.cantidad is distinct from s.cantidad
--        or a.stock_minimo is distinct from s.stock_minimo;
--     -- sin filas = todo cuadraba
--
--     Si devuelve filas, NO es que el arreglo esté mal: es que `stock` y
--     `movimientos` ya estaban desincronizados y la red de seguridad acaba de
--     hacer su trabajo por primera vez. La columna `respaldo` decide qué hacer:
--       · respaldo > 0  → la fila tiene historial; el valor NUEVO es el correcto.
--       · respaldo = 0  → había stock sin ningún movimiento detrás (típico de
--         datos migrados a mano). Esa fila se BORRÓ y hay que reponerla desde
--         `retail._stock_antes_0020`, que para eso quedó guardada.
--
--     Cuando termines de revisar: drop table retail._stock_antes_0020;
-- ============================================================================
