-- ============================================================================
-- 20260928210000_huellas_catalogo_con_llave.sql — CAYLA V2 · Deriva diaria de producción contra main (ADR-0251)
--
-- EL PROBLEMA. El SQL de producción se pega a mano y Vercel publica `main` al fusionar: el 2026-09-27 se publicaron 6
-- cambios sin su SQL, y producción tenía arreglos en vivo que `main` no. `scripts/migraciones/deriva.sql` compara
-- huellas del catálogo de las dos bases, pero alguien tenía que acordarse de correrla. Felipe decidió (2026-09-28) que
-- la corra GitHub cada mañana, con una llave propia y sin guardar ninguna contraseña de la base en GitHub (el repo es
-- público).
--
-- QUÉ PROMETE.
--   · `retail.huellas_catalogo(p_llave)` devuelve la MISMA celda que `scripts/migraciones/deriva.sql` (huellas md5 del
--     catálogo de `retail`: funciones, permisos, políticas, disparadores, columnas, candados, índices y vistas). Ningún
--     dato de ninguna tabla. Solo con la llave correcta; sin ella, 42501 y la pista 'huellas_llave'. La llama la llave
--     pública (anon) de la web: es la ÚNICA función de retail que anon puede ejecutar, y sin la llave no devuelve nada.
--   · `retail.fn_huellas_nueva_llave()` crea (o cambia) la llave y la devuelve UNA vez. La base guarda solo su sha256:
--     la llave no queda escrita en ninguna parte de la base ni del repo. Solo la corre quien pega en el SQL Editor.
-- QUÉ ASUME. `pgcrypto` en el schema `extensions` (está: producción y la base local). Que el cuerpo de
--   `huellas_catalogo` es la consulta de `deriva.sql` al pie de la letra: lo vigila scripts/migraciones/deriva.test.mjs
--   (texto) y scripts/pruebas/huellas_catalogo.mjs (la salida de la función igual a la de deriva.sql).
--
-- DECIDÍ: una función con llave propia que solo devuelve huellas, llamada con la llave pública.
-- DESCARTÉ: (1) una cuenta de Postgres de solo lectura con contraseña en GitHub: si se filtra, lee el código SQL de
--   Dynamic y usa lo que PUBLIC puede allí; (2) una tarea programada en la Mac de Felipe: solo corre con la Mac prendida
--   y el aviso lo ve solo él. (Felipe, 2026-09-28, eligió esta entre las tres.)
-- SE ROMPE SI: (1) la llave se filtra: se leen las huellas (nada más) hasta que Felipe corra otra vez
--   `select retail.fn_huellas_nueva_llave();` y cambie el secreto de GitHub; (2) alguien cambia `deriva.sql` sin cambiar
--   esta función: la deriva diaria diría «distinto» de todo y la prueba del CI se pone roja antes; (3) producción no
--   responde: el workflow falla con «no se pudo leer producción» y el aviso dice «hoy NO se pudo comparar»; nunca queda
--   verde a ciegas (lo simula scripts/migraciones/deriva-diaria.test.mjs).
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Solo, en el SQL Editor, a cualquier hora: una tabla nueva (nadie la usa: sin políticas,
-- RLS encendido, sin permisos para anon ni authenticated), dos funciones, `revoke` y `grant`. Sin `drop trigger`, sin
-- políticas, sin `alter` de tablas en uso (ADR-0195). Se puede pegar dos veces. DESPUÉS, en el mismo SQL Editor:
--   select retail.fn_huellas_nueva_llave();
-- y la llave que devuelve va a GitHub ▸ Settings ▸ Secrets and variables ▸ Actions como el secreto DERIVA_LLAVE.
-- Cómo se verifica (solo lectura):
--   select to_regprocedure('retail.huellas_catalogo(text)') is not null as funcion,
--          has_function_privilege('anon', 'retail.huellas_catalogo(text)', 'EXECUTE') as anon_la_llama,
--          has_function_privilege('authenticated', 'retail.fn_huellas_nueva_llave()', 'EXECUTE') as auth_crea_llave, -- false
--          (select count(*) from retail.huellas_llave) as llaves;  -- 1 después de crear la llave
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create table if not exists retail.huellas_llave (
  id smallint primary key default 1 check (id = 1),
  llave_sha256 text not null check (llave_sha256 ~ '^[0-9a-f]{64}$'),
  creada_at timestamptz not null default now()
);
comment on table retail.huellas_llave is
  'El sha256 de la llave con que GitHub pide las huellas del catálogo cada mañana (ADR-0251). Una sola fila. La llave '
  'no se guarda: la devuelve fn_huellas_nueva_llave() una vez.';
alter table retail.huellas_llave enable row level security;
revoke all on retail.huellas_llave from public, anon, authenticated, service_role;

create or replace function retail.fn_huellas_nueva_llave()
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, extensions
as $$
declare
  v_llave text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into retail.huellas_llave (id, llave_sha256) values (1, encode(extensions.digest(v_llave, 'sha256'), 'hex'))
    on conflict (id) do update set llave_sha256 = excluded.llave_sha256, creada_at = now();
  return v_llave;
end;
$$;
comment on function retail.fn_huellas_nueva_llave() is
  'Crea o cambia la llave de las huellas del catálogo y la devuelve una sola vez (ADR-0251). Solo desde el SQL Editor.';
revoke all on function retail.fn_huellas_nueva_llave() from public, anon, authenticated, service_role;

create or replace function retail.huellas_catalogo(p_llave text)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions
as $$
declare
  v_huellas text;
begin
  if p_llave is null or not exists (
    select 1 from retail.huellas_llave k where k.llave_sha256 = encode(extensions.digest(p_llave, 'sha256'), 'hex')
  ) then
    raise exception using errcode = '42501', message = 'Llave de huellas inválida.', hint = 'huellas_llave';
  end if;
  -- Desde aquí, la consulta de scripts/migraciones/deriva.sql al pie de la letra (lo vigilan sus pruebas).
  select string_agg(g || E'\t' || k || E'\t' || left(md5(linea), 12), E'\n' order by g, k) into v_huellas
  from (
    select 'fn' g, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' k,
      p.prokind::text || '/' || lg.lanname || '/' || case when p.prosecdef then 'SD' else 'inv' end || '/' || p.provolatile::text
        || '|' || coalesce(array_to_string(p.proconfig, ';'), '-') || '|' || pg_get_function_result(p.oid)
        || '|' || md5(regexp_replace(regexp_replace(p.prosrc, $re$('(?:[^']|'')*')|--[^$re$ || chr(10) || $re$]*|/\*(?:[^*]|\*+[^*/])*\*+/$re$, '\1', 'g'), '\s+', '', 'g'))
        || '|' || coalesce((select string_agg(x, '' order by x) from (
             select case when a.grantee = 0 and has_schema_privilege('public', 'retail', 'USAGE') then 'P'
                         when r.rolname = 'anon' then 'a' when r.rolname = 'authenticated' then 'u' when r.rolname = 'service_role' then 's' end x
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a left join pg_roles r on r.oid = a.grantee
             where a.privilege_type = 'EXECUTE') z where x is not null), '-') linea
    from pg_proc p join pg_language lg on lg.oid = p.prolang
    where p.pronamespace = 'retail'::regnamespace
    union all
    select 'politica', tablename || '.' || policyname,
      cmd || '|' || permissive || '|' || array_to_string(array(select x from unnest(roles) x order by 1), ',')
        || '|' || coalesce(regexp_replace(qual, '\s+', ' ', 'g'), '-') || '|' || coalesce(regexp_replace(with_check, '\s+', ' ', 'g'), '-')
    from pg_policies where schemaname = 'retail'
    union all
    select 'disparador', c.relname || '.' || t.tgname,
      t.tgenabled::text || '|' || regexp_replace(pg_get_triggerdef(t.oid), '\s+', ' ', 'g')
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relnamespace = 'retail'::regnamespace and not t.tgisinternal
    union all
    select 'permiso', c.relname || '.' || coalesce(r.rolname, 'PUBLIC'),
      string_agg(a.privilege_type || case when a.is_grantable then '*' else '' end, ',' order by a.privilege_type)
    from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 's' else 'r' end::"char", c.relowner))) a
    left join pg_roles r on r.oid = a.grantee
    where c.relnamespace = 'retail'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
      and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'))
    group by 1, 2
    union all
    select 'rls', c.relname, c.relkind::text || '|' || c.relrowsecurity::text || '|' || c.relforcerowsecurity::text
    from pg_class c where c.relnamespace = 'retail'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
    union all
    select 'permiso_columna', c.relname || '.' || at.attname || '.' || coalesce(r.rolname, 'PUBLIC'), string_agg(x.privilege_type, ',' order by x.privilege_type)
    from pg_attribute at join pg_class c on c.oid = at.attrelid cross join lateral aclexplode(at.attacl) x left join pg_roles r on r.oid = x.grantee
    where c.relnamespace = 'retail'::regnamespace and at.attacl is not null and not at.attisdropped
      and (x.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'))
    group by 1, 2
    union all
    select 'schema', 'retail.' || coalesce(r.rolname, 'PUBLIC'), string_agg(x.privilege_type, ',' order by x.privilege_type)
    from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) x left join pg_roles r on r.oid = x.grantee
    where n.nspname = 'retail' and (x.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'))
    group by 1, 2
    union all
    select 'columna', c.relname || '.' || at.attname,
      format_type(at.atttypid, at.atttypmod) || '|' || at.attnotnull::text || '|' || coalesce(pg_get_expr(d.adbin, d.adrelid), '')
        || '|' || at.attgenerated::text || '|' || at.attidentity::text
    from pg_class c join pg_attribute at on at.attrelid = c.oid and at.attnum > 0 and not at.attisdropped
    left join pg_attrdef d on d.adrelid = c.oid and d.adnum = at.attnum
    where c.relnamespace = 'retail'::regnamespace and c.relkind in ('r', 'v', 'm', 'p')
    union all
    select 'candado', c.relname || '.' || co.conname, co.contype::text || '|' || regexp_replace(pg_get_constraintdef(co.oid), '\s+', ' ', 'g')
    from pg_constraint co join pg_class c on c.oid = co.conrelid
    where c.relnamespace = 'retail'::regnamespace
    union all
    select 'indice', c.relname, regexp_replace(regexp_replace(pg_get_indexdef(c.oid), '\m(extensions|public)\.', '', 'g'), '\s+', ' ', 'g')
    from pg_class c where c.relnamespace = 'retail'::regnamespace and c.relkind = 'i'
    union all
    select 'vista', c.relname, md5(regexp_replace(pg_get_viewdef(c.oid), '\s+', ' ', 'g'))
    from pg_class c where c.relnamespace = 'retail'::regnamespace and c.relkind in ('v', 'm')
  ) h;
  return v_huellas;
end;
$$;
comment on function retail.huellas_catalogo(text) is
  'Huellas md5 del catálogo de retail (la consulta de scripts/migraciones/deriva.sql), sin datos de tablas, solo con la '
  'llave de retail.huellas_llave. La llama GitHub cada mañana con la llave pública (ADR-0251).';
revoke all on function retail.huellas_catalogo(text) from public, anon, authenticated, service_role;
grant execute on function retail.huellas_catalogo(text) to anon;
