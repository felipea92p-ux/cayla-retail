-- ============================================================================
-- 20260923152300_rls_todas_una_vez_por_consulta.sql — ADR-0176, opción B (Felipe 2026-09-22)
--
-- La opción A (`20260923143700_…`) arregló a mano las 4 políticas de venta que tumbaban Ventas ▸ Historial. Quedan
-- 92 políticas en `retail` que siguen llamando funciones de permisos UNA VEZ POR FILA (stock, movimientos, cajas,
-- transferencias, compras, el catálogo…). Con el volumen del sembrado de 90 días (24 mil movimientos, 5 mil filas
-- de stock) son las próximas pantallas en pasar los 8 s de `statement_timeout`.
--
-- Por qué una función y no 92 `alter policy` escritos a mano: varias migraciones de `main` que crean o cambian
-- políticas todavía NO están pegadas en producción (roles por módulo, separaciones, colaboradores delegables…).
-- Copiar el texto de hoy de cada política pisaría lo que esas migraciones cambien cuando se peguen. La función lee
-- las políticas VIGENTES en ese momento y reescribe solo la forma de llamar a las funciones, sin tocar qué permite
-- cada una. Es idempotente: se vuelve a correr al final de cualquier migración que cree políticas
-- (`select retail.fn_rls_una_vez_por_consulta();`) y no toca lo que ya está bien.
--
-- Las dos reglas, puramente de texto sobre la expresión deparseada (`pg_get_expr`):
--   1. Toda llamada `retail.fn_xxx()` SIN argumentos que no esté ya en un `SELECT` → `(SELECT retail.fn_xxx())`.
--      Sin argumentos, solo pueden depender de quién pregunta: Postgres la resuelve una vez (InitPlan).
--   2. `retail.fn_puede_operar_ubicacion(X)` → `COALESCE(((SELECT fn_es_lider()) OR (X = (SELECT
--      fn_ubicacion_actual_persona()))), false)`, que es el cuerpo de la función con sus dos piezas envueltas. El
--      `COALESCE(…, false)` es el mismo de la función: la equivalencia es exacta incluso si una política la negara.
--
-- Verificado en producción dentro de una transacción revertida: para cada política y cada cláusula (USING y WITH
-- CHECK), las filas donde la expresión vieja da verdadero son las mismas que con la nueva (huella md5 de los ctid),
-- como líder y como integrantes de distintas sedes y roles.
--
-- Qué NO se toca: `auth.role()`/`auth.uid()` (Postgres ya las incrusta, cuestan nada) ni las funciones con
-- argumentos constantes (no hay ninguna hoy).
-- ============================================================================

-- Reescritura pura del texto de una expresión de política. Aparte para poder comparar vieja contra nueva.
create or replace function retail.fn_rls_reescribir(p_expr text)
returns text
language sql
immutable
set search_path = pg_catalog
as $fn$
  select regexp_replace(
    regexp_replace(p_expr, '(?<!SELECT )retail\.(fn_\w+)\(\)', '(SELECT retail.\1())', 'g'),
    'retail\.fn_puede_operar_ubicacion\(([^()]*)\)',
    'COALESCE(((SELECT retail.fn_es_lider()) OR (\1 = (SELECT retail.fn_ubicacion_actual_persona()))), false)',
    'g'
  );
$fn$;

-- Reescribe todas las políticas de `retail` que todavía llaman funciones fila por fila. Devuelve cuántas cambió.
create or replace function retail.fn_rls_una_vez_por_consulta()
returns integer
language plpgsql
-- pg_catalog solo: así `pg_get_expr` califica todo (`retail.`, `public.`) y el texto se puede volver a ejecutar.
set search_path = pg_catalog
as $fn$
declare
  r record;
  v_using text;
  v_check text;
  v_sql text;
  v_n integer := 0;
begin
  for r in
    select p.polname, c.relname,
           pg_get_expr(p.polqual, p.polrelid) as q,
           pg_get_expr(p.polwithcheck, p.polrelid) as w
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'retail'
  loop
    v_using := retail.fn_rls_reescribir(r.q);
    v_check := retail.fn_rls_reescribir(r.w);
    continue when v_using is not distinct from r.q and v_check is not distinct from r.w;

    v_sql := format('alter policy %I on retail.%I', r.polname, r.relname);
    if v_using is distinct from r.q then v_sql := v_sql || format(' using (%s)', v_using); end if;
    if v_check is distinct from r.w then v_sql := v_sql || format(' with check (%s)', v_check); end if;
    execute v_sql;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;

-- Solo migraciones (dueño de las tablas): nadie desde la app puede reescribir políticas.
revoke all on function retail.fn_rls_reescribir(text) from public, anon, authenticated;
revoke all on function retail.fn_rls_una_vez_por_consulta() from public, anon, authenticated;

select retail.fn_rls_una_vez_por_consulta();

-- Candado: después de la pasada no queda nada por reescribir; si queda, la migración entera se deshace.
do $$
declare
  v_path text := current_setting('search_path');
  v_restantes text;
begin
  perform set_config('search_path', 'pg_catalog', true);
  select string_agg(c.relname || '.' || p.polname, ', ') into v_restantes
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'retail'
     and (retail.fn_rls_reescribir(pg_get_expr(p.polqual, p.polrelid)) is distinct from pg_get_expr(p.polqual, p.polrelid)
       or retail.fn_rls_reescribir(pg_get_expr(p.polwithcheck, p.polrelid)) is distinct from pg_get_expr(p.polwithcheck, p.polrelid));
  perform set_config('search_path', v_path, true);
  if v_restantes is not null then
    raise exception 'quedan políticas con funciones fila por fila: %', v_restantes;
  end if;
end $$;
