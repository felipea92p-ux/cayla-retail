-- scripts/rendimiento/diagnostico-produccion.sql — cómo está de rápida la base de producción (ADR-0622). SOLO LECTURA.
--
-- Se pega en el SQL Editor de producción (proyecto cayla-dynamic) y se mira cada resultado. No escribe nada, no toma candados y no
-- reinicia las estadísticas. Sirve para decidir QUÉ optimizar con números reales (principio 12: medir antes de optimizar) y para
-- comparar antes/después de pegar una migración de rendimiento.
--
-- Cómo leerlo:
--   1. Las funciones de retail que más tiempo TOTAL le cuestan a la base (llamadas × media). Arriba de todo está lo que conviene
--      arreglar primero, aunque su media sea chica. `pg_stat_statements` acumula desde su último reinicio e incluye pruebas: mirar
--      la media y las llamadas, no un máximo suelto.
--   2. Las tablas de retail que se recorren enteras (seq_scan) muchas veces y ya son grandes: candidatas a un índice.
--   3. Cuánto de lo que se lee viene de memoria (debería ser > 99 %). Si baja, el cómputo de Supabase se quedó chico.
--   4. Conexiones abiertas ahora contra el máximo.

-- 1. Funciones de retail por tiempo total
select substring(query from '"?retail"?\."?([a-z0-9_]+)"?\s*\(') as funcion,
       sum(calls) as llamadas,
       round(sum(total_exec_time)) as ms_total,
       round((sum(total_exec_time) / nullif(sum(calls), 0))::numeric, 1) as ms_media,
       round(max(max_exec_time)) as ms_max
from pg_stat_statements
where query ~ 'retail"?\.'
group by 1
having substring(query from '"?retail"?\."?([a-z0-9_]+)"?\s*\(') is not null
order by ms_total desc
limit 40;

-- 2. Tablas de retail recorridas enteras
select relname as tabla, n_live_tup as filas, seq_scan, seq_tup_read, idx_scan,
       pg_size_pretty(pg_total_relation_size(relid)) as tamano
from pg_stat_user_tables
where schemaname = 'retail' and n_live_tup > 500
order by seq_tup_read desc
limit 25;

-- 3. Lecturas desde memoria
select round(100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2) as pct_desde_memoria
from pg_stat_database where datname = current_database();

-- 4. Conexiones
select count(*) as abiertas, current_setting('max_connections') as maximo,
       count(*) filter (where state = 'active') as trabajando
from pg_stat_activity;
