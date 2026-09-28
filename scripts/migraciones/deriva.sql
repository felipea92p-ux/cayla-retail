-- Huellas del schema `retail` para comparar producción con `main` (scripts/migraciones/deriva.mjs).
-- Solo lee el catálogo: ninguna tabla, ningún dato. Devuelve UNA celda con una línea por objeto: «grupo<TAB>clave<TAB>huella».
-- Se corre igual en las dos bases (la local armada con las migraciones de main, y producción) y se comparan las celdas.
--
-- Lo que se normaliza, y por qué (si no, todo sale distinto sin serlo):
--   · Cuerpo de función: sin comentarios (`--` y `/* */`) y sin espacios. En producción muchos cuerpos llegaron sin los
--     comentarios del repo (auditoría del 2026-09-27: 61 funciones distintas solo por eso).
--   · EXECUTE a PUBLIC en funciones de retail: solo cuenta si PUBLIC puede entrar al schema. Hoy no puede (ni en main ni en
--     producción), y producción le quitó EXECUTE a PUBLIC en bloque: sin esta regla, 107 funciones salían distintas sin
--     que nadie pudiera llamarlas de más.
--   · Índices: el schema de la clase de operadores (`extensions.gin_trgm_ops` vs `gin_trgm_ops`) depende del search_path
--     de quien pregunta, no del índice.
--   · Y por lo mismo, todo lo que Postgres escribe con nombres (tipos, valores por defecto, candados, disparadores,
--     vistas) se escribe con UN search_path fijo, el mismo que usa `retail.huellas_catalogo` en producción
--     (20260928210000). Sin esta línea, la misma base da huellas distintas según quién pregunte (el SQL Editor, el MCP o
--     psql tienen search_path distintos).
set search_path = pg_catalog, extensions;
select string_agg(g || E'\t' || k || E'\t' || left(md5(linea), 12), E'\n' order by g, k) as huellas
from (
  select 'fn' g, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' k,
    p.prokind::text || '/' || lg.lanname || '/' || case when p.prosecdef then 'SD' else 'inv' end || '/' || p.provolatile::text
      || '|' || coalesce(array_to_string(p.proconfig, ';'), '-') || '|' || pg_get_function_result(p.oid)
      || '|' || md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
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
