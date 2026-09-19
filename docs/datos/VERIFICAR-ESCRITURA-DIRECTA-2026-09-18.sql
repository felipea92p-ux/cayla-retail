-- VERIFICAR-ESCRITURA-DIRECTA-2026-09-18.sql — SOLO LECTURA. No modifica nada.
--
-- PARA QUÉ: medir, tabla por tabla, quién puede escribir DIRECTO desde el navegador
-- (supabase.from('x').insert(...)) saltándose las funciones RPC donde viven las reglas de
-- negocio (precio, stock, caja abierta, ser líder).
--
-- CÓMO SE LEE — hay DOS puertas y se necesitan las dos abiertas para que alguien pase:
--   1. El PERMISO DE TABLA (grant). `0005_grants.sql` se lo dio a `authenticated` sobre TODAS
--      las tablas de retail, y a las nuevas también (alter default privileges).
--   2. La POLÍTICA de RLS. Con RLS encendido y SIN política de escritura, Postgres rechaza.
--      Con una política que solo exige "operar en esta ubicación", deja pasar a cualquier
--      colaborador.
-- Un `grant select` posterior (como el de 0010_facturacion.sql) NO quita lo que 0005 ya dio:
-- solo AGREGA. Por eso muchas tablas se ven seguras y lo son únicamente por la segunda puerta.
--
-- ESTADO que devuelve por tabla:
--   EXPUESTA  → permiso abierto + política que deja escribir a cualquier colaborador.
--   solo líder→ permiso abierto + política que exige líder.
--   BLOQUEADA → permiso abierto pero sin política de escritura: RLS rechaza. Depende de UNA
--               sola capa; si alguien crea una política "for all" por error, se abre.
--
-- LÍMITE HONESTO: "solo líder" se infiere buscando fn_es_lider / fn_puede_registrar_compras
-- en el texto de la política. Es una heurística, no un análisis completo de cada expresión.
-- Pegar en el SQL Editor de producción con el schema `retail` (ya va calificado).

with esc as (
  select c.oid, c.relname,
         concat_ws('', case when has_table_privilege('authenticated', c.oid, 'INSERT') then 'I' end,
                       case when has_table_privilege('authenticated', c.oid, 'UPDATE') then 'U' end,
                       case when has_table_privilege('authenticated', c.oid, 'DELETE') then 'D' end) as puede
  from pg_class c
  where c.relnamespace = 'retail'::regnamespace and c.relkind = 'r'
    and (has_table_privilege('authenticated', c.oid, 'INSERT')
      or has_table_privilege('authenticated', c.oid, 'UPDATE')
      or has_table_privilege('authenticated', c.oid, 'DELETE'))
), pol as (
  select tablename,
         string_agg(cmd || ':' || policyname, ', ' order by cmd) as politicas,
         bool_or(coalesce(with_check, qual) ~* 'fn_es_lider|fn_puede_registrar_compras') as pide_lider
  from pg_policies
  where schemaname = 'retail' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    and (roles && array['authenticated'::name, 'public'::name])
  group by 1
)
select e.relname as tabla,
       e.puede as "permiso (I/U/D)",
       case when p.tablename is null then 'BLOQUEADA por RLS (sin política de escritura)'
            when p.pide_lider then 'solo líder (por política)'
            else 'EXPUESTA: cualquier colaborador de la ubicación' end as estado,
       coalesce(p.politicas, '-') as politicas
from esc e left join pol p on p.tablename = e.relname
order by (p.tablename is null), (not coalesce(p.pide_lider, false)) desc, 1;
