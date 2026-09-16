-- ============================================================================
-- SQL PENDIENTE DE PRODUCCIÓN · 2026-09-16 · Halcón (módulo 05) · D-22 completo
--
-- Medido contra producción (proyecto cayla-dynamic, schema retail) el 2026-09-16:
--   · movimientos: authenticated solo SELECT (desde 20260914165703); service_role
--     SELECT, INSERT, UPDATE, DELETE y TRUNCATE.
--   · stock: authenticated SELECT, INSERT, UPDATE, DELETE; service_role todo.
--   · fn_aplicar_movimiento y recalcular_stock: ejecutables por authenticated y
--     service_role.
--   · Disparadores de movimientos en modo 'O' (no se activan en modo réplica) y
--     ninguno contra TRUNCATE.
--   · Las 14 funciones que insertan movimientos son security definer de postgres.
--
-- Cómo pegar: en el SQL Editor de producción, UN bloque por vez y en orden.
-- Repetible: pegar dos veces no falla. Nada se borra.
-- ============================================================================


-- ---------- 0. PRE-FLIGHT — cada consulta tiene que dar 0 ----------
-- Si alguna no da 0, NO sigas.

-- 0a. Una función que corre como quien la llama y escribe stock/movimientos o
--     aplica stock: el retiro de permisos la rompería.
select count(*) as invoker_que_toca_nucleo -- 0
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'retail' and not p.prosecdef and p.prokind = 'f'
  and p.prorettype <> 'trigger'::regtype
  and (p.prosrc ~* 'fn_aplicar_movimiento|recalcular_stock'
    or p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(retail\.)?(stock|movimientos)\b');

-- 0b. (solo producción: el Postgres local no tiene pg_cron) Un proceso
--     automático que escriba esas tablas.
select count(*) as jobs_cron from cron.job where command ~* 'movimientos|stock'; -- 0


-- ---------- 1. Migración 20260916200000_historial_candado_completo ----------
begin;
-- 1. El disparador de UPDATE/DELETE se activa también en modo réplica.
alter table retail.movimientos enable always trigger movimientos_inmutables;

-- 2. TRUNCATE, directo o en cascada.
create or replace function retail.fn_historial_sin_truncate()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'El historial de movimientos no se vacía. Si hace falta limpiar datos de prueba, '
    'se descontinúan los productos y su stock se lleva a cero con movimientos de ajuste.';
end;
$$;

comment on function retail.fn_historial_sin_truncate() is
  'D-22: rechaza TRUNCATE sobre movimientos, también cuando llega en cascada desde variantes, ubicaciones o productos.';

drop trigger if exists movimientos_sin_truncate on retail.movimientos;
create trigger movimientos_sin_truncate
  before truncate on retail.movimientos
  for each statement execute function retail.fn_historial_sin_truncate();
alter table retail.movimientos enable always trigger movimientos_sin_truncate;

-- 3. Nadie fuera de las funciones escribe el libro ni la foto de stock.
revoke insert, update, delete, truncate on retail.movimientos from authenticated, anon, service_role;
revoke insert, update, delete, truncate on retail.stock from authenticated, anon, service_role;

-- 4. Aplicar un movimiento o reconstruir el stock solo desde dentro de una RPC.
--    Toda función nueva de retail nace ejecutable por authenticated (default ACL
--    del schema), así que el retiro tiene que ser explícito.
revoke execute on function retail.fn_aplicar_movimiento(uuid) from public, anon, authenticated, service_role;
revoke execute on function retail.recalcular_stock() from public, anon, authenticated, service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260916200000', 'historial_candado_completo')
on conflict (version) do nothing;
commit;


-- ---------- 2. COMPROBACIÓN — lo esperado está a la derecha ----------
select
  (select string_agg(tgname || '=' || tgenabled::text, ', ' order by tgname) from pg_trigger
     where tgrelid = 'retail.movimientos'::regclass and not tgisinternal
       and tgname in ('movimientos_inmutables', 'movimientos_sin_truncate'))           as candados,          -- movimientos_inmutables=A, movimientos_sin_truncate=A
  has_table_privilege('service_role', 'retail.movimientos', 'TRUNCATE')              as sr_truncate_mov,   -- false
  has_table_privilege('authenticated', 'retail.stock', 'UPDATE')                     as auth_update_stock, -- false
  has_function_privilege('authenticated', 'retail.fn_aplicar_movimiento(uuid)', 'execute') as auth_aplica, -- false
  has_function_privilege('authenticated', 'retail.recalcular_stock()', 'execute')    as auth_recalcula;    -- false

-- Después de pegar: vende una prenda en TRU desde la caja y registra una entrada
-- desde Inventario. Las dos tienen que funcionar igual que antes.
