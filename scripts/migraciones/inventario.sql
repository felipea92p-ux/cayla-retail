-- ============================================================================
-- Inventario de objetos de un schema — la mitad "qué hay" del verificador.
--
-- PARA QUÉ. El repo tiene 74 scripts SQL entre `supabase/migrations/` y
-- `supabase/unificacion/`, y ninguna forma de saber cuáles corrieron en
-- producción: el historial de migraciones de Supabase no conoce la segunda
-- carpeta, y la primera se pega a mano en el SQL Editor. Eso ya cobró dos veces
-- —la 0030 costó un round-trip, y las 20/21/22 se descubrieron sin aplicar solo
-- porque una pantalla se rompió con la clienta esperando.
--
-- CÓMO SE USA
--   Producción: pega esta consulta entera en el SQL Editor del proyecto de
--     cayla-dynamic (donde vive el schema `retail`) y guarda el resultado en
--     `scripts/migraciones/inventario-produccion.json`.
--   Local: `pnpm migraciones:verificar` la corre solo contra el Postgres del
--     `supabase start`.
--
--   MIRA TRES SCHEMAS, y hace falta que sean tres:
--     · `retail`  — donde vive todo lo de `supabase/migrations/`. Se llama igual
--       en local y en producción: los archivos corren contra `public` y
--       `supabase/seed.sql` renombra el schema al terminar (ADR-0010).
--     · `public`  — en producción es el schema de Dynamic, y ahí es donde crean
--       sus tablas los scripts de `supabase/unificacion/` (`retail_sede_meta` y
--       compañía). En local está vacío de esto, y eso es correcto: esa carpeta
--       solo se pega en el proyecto de Dynamic.
--     · `storage` — para las políticas de fotos de `0015_fotos_stockmin.sql`.
--       Sin él, ese archivo saldría siempre como incompleto sin serlo.
--
-- DEVUELVE un solo JSON, para que copiarlo sea un gesto y no una tarea.
-- ============================================================================

with objetivo as (
  select unnest(array['retail', 'public', 'storage']) as esquema
)
select jsonb_pretty(jsonb_build_object(
  'esquemas', (select jsonb_agg(esquema order by esquema) from objetivo),
  'leido_en', now(),

  -- Nombre + cuántos argumentos. El conteo importa: `create or replace` con una
  -- firma distinta NO reemplaza, crea una SOBRECARGA (el bug que documentó
  -- ADR-0009). Dos filas con el mismo nombre es esa trampa, visible.
  'funciones', (
    select coalesce(jsonb_agg(jsonb_build_object('nombre', p.proname, 'args', p.pronargs) order by p.proname, p.pronargs), '[]'::jsonb)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname::text in (select esquema from objetivo)
  ),

  'tablas', (
    select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname::text in (select esquema from objetivo) and c.relkind in ('r', 'p')
  ),

  'columnas', (
    select coalesce(jsonb_agg(c.relname || '.' || a.attname order by c.relname, a.attname), '[]'::jsonb)
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname::text in (select esquema from objetivo)
      and c.relkind in ('r', 'p', 'v', 'm')
      and a.attnum > 0
      and not a.attisdropped
  ),

  -- Checks, únicos, llaves foráneas y primarias, todo junto: el archivo las pide
  -- por nombre con `add constraint X`, así que por nombre se buscan.
  'restricciones', (
    select coalesce(jsonb_agg(con.conname order by con.conname), '[]'::jsonb)
    from pg_constraint con
    join pg_namespace n on n.oid = con.connamespace
    where n.nspname::text in (select esquema from objetivo)
  ),

  'indices', (
    select coalesce(jsonb_agg(indexname order by indexname), '[]'::jsonb)
    from pg_indexes
    where schemaname::text in (select esquema from objetivo)
  ),

  'politicas', (
    select coalesce(jsonb_agg(tablename || '.' || policyname order by tablename, policyname), '[]'::jsonb)
    from pg_policies
    where schemaname::text in (select esquema from objetivo)
  )
)) as inventario;
