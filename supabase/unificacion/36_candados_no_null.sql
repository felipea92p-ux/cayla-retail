-- ============================================================================
-- 36 — Un candado que no sabe devuelve false, no NULL
-- Correr en cayla-DYNAMIC (SQL Editor). Todo en el cajón `retail`.
--
-- ⚠ PRODUCCIÓN YA LO TIENE. Verificado contra la base el 2026-09-10: las tres
--   funciones de abajo ya están endurecidas allá. Este archivo existe por dos
--   motivos, no para volver a aplicarlo:
--     1. El arreglo estaba vivo en producción y en NINGÚN archivo del repo —
--        alguien lo pegó a mano y nunca quedó escrito. `03_candados.sql` seguía
--        con la versión sin `coalesce`, así que volver a pegarlo lo deshacía en
--        silencio. Ese archivo ya quedó corregido; éste deja el paso explícito
--        y con fecha, para cualquier base que haya recibido la versión vieja.
--     2. Para que exista un lugar donde esté escrito POR QUÉ, que es lo que se
--        perdió cuando el parche se aplicó sin archivo.
--
-- QUÉ ARREGLA
--   `es_lider()` devolvía `public.fn_rol_actual() = 'admin'` a secas. Si
--   `fn_rol_actual()` devuelve NULL —una sesión sin rol, un usuario sin fila en
--   `personas`— la comparación no da false: da **NULL**.
--
--   Y ahí está el agujero, porque el patrón que usan todas las RPC del repo es:
--
--       if not retail.es_lider() then
--         raise exception 'Solo un líder puede …';
--       end if;
--
--   `not NULL` es NULL, que **no es true**, así que el `raise` NO se dispara y la
--   función sigue de largo. El candado se abre solo, exactamente para el caso que
--   debía cerrar. (En una policy de RLS, NULL deniega — por eso el agujero es de
--   las RPC, no de las políticas, y por eso no se ve mirando RLS.)
--
--   `mi_sede()` NO lleva `coalesce` a propósito: devuelve un uuid, y ahí NULL sí
--   es la respuesta correcta —«no tengo sede»— y quien la llama ya compara.
--
-- Es la misma disciplina que `migrations/0023_rls_helpers_security_definer.sql`
-- practica en local desde el 03-09: allí `fn_es_lider()` siempre tuvo su
-- `coalesce(..., false)`. Lo único que faltaba era que este lado lo dijera.
--
-- 100% idempotente y sin riesgo: son tres `create or replace` de misma firma (no
-- crean sobrecarga, ADR-0009/0026) y no tocan ni una fila.
-- ============================================================================

create or replace function retail.es_lider()
returns boolean language sql stable set search_path = public
as $$ select coalesce(public.fn_rol_actual() = 'admin', false); $$;

create or replace function retail.es_supervisor()
returns boolean language sql stable set search_path = public
as $$ select coalesce(public.fn_rol_actual() = 'supervisor_sede', false); $$;

create or replace function retail.puede_operar_sede(p_sede_id uuid)
returns boolean language sql stable set search_path = public
as $$ select coalesce(public.fn_rol_actual() = 'admin', false)
       or coalesce(public.fn_sede_actual_persona() = p_sede_id, false); $$;

-- El resumen que SÍ se ve: el SQL Editor no siempre muestra los `raise notice`,
-- pero una tabla de resultados no se puede perder. Las tres deben decir `ok`.
select
  p.proname as candado,
  case when position('coalesce' in p.prosrc) > 0 then 'ok' else 'REVISAR' end as devuelve_false_si_no_sabe
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'retail'
  and p.proname in ('es_lider', 'es_supervisor', 'puede_operar_sede')
order by p.proname;
