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

create or replace function retail.recalcular_stock()
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  -- 1. El neto de cada par (variante, sede), en una sola pasada.
  insert into retail.stock (variante_id, sede_id, cantidad, ultima_entrada, ultima_salida)
  select variante_id, sede_id, sum(delta), max(entrada_en), max(salida_en)
  from (
    -- La sede donde ocurre el movimiento: entrada y ajuste suman (el ajuste
    -- trae su propio signo), salida y traslado restan.
    select variante_id,
           sede_id,
           case when tipo in ('entrada', 'ajuste') then cantidad else -cantidad end as delta,
           case when tipo = 'entrada' then created_at end as entrada_en,
           case when tipo in ('salida', 'traslado') then created_at end as salida_en
    from retail.movimientos
    union all
    -- La otra pata del traslado: la sede que RECIBE.
    select variante_id, sede_destino_id, cantidad, created_at, null
    from retail.movimientos
    where tipo = 'traslado' and sede_destino_id is not null
  ) neto
  group by variante_id, sede_id
  on conflict (variante_id, sede_id) do update
    set cantidad = excluded.cantidad,
        ultima_entrada = excluded.ultima_entrada,
        ultima_salida = excluded.ultima_salida;

  -- 2. Filas derivadas que ya no corresponden a ningún movimiento.
  delete from retail.stock s
  where not exists (
    select 1 from retail.movimientos m
    where m.variante_id = s.variante_id
      and (m.sede_id = s.sede_id or m.sede_destino_id = s.sede_id)
  );
end;
$$;

comment on function retail.recalcular_stock() is
  'Reconstruye `stock` desde `movimientos` (la fuente de verdad). Calcula el neto por (variante, sede) antes de escribir: proponer filas negativas chocaba con el CHECK antes del ON CONFLICT. Conserva stock_minimo y contenedor_id, que no se derivan de movimientos.';

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
