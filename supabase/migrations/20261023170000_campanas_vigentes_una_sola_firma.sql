-- ============================================================================
-- 20261023170000 — `campanas_vigentes` con UNA sola firma (ADR-0486, corrige 20261023162000)
--
-- EL PROBLEMA. 20261023162000 dejó dos funciones con el mismo nombre: `campanas_vigentes()` (sin sede) y `campanas_vigentes(uuid)` (con
--   sede). El candado «una sola firma por función» (`pnpm pruebas:una-sola-firma`, ADR-0009) no admite sobrecargas en `retail`: PostgREST
--   puede no saber a cuál llamar («function is not unique»). Funcionaba (la web siempre manda su nombre de parámetro), pero el repo no lo permite.
--
-- LO QUE HACE. `campanas_vigentes(p_ubicacion_id uuid default null)`: UNA función, con la sede opcional. Sin sede (null o sin argumento) sigue
--   dando solo las campañas que rigen en todas las sedes, igual que la sin argumentos que reemplaza; con sede, las de esa tienda. Después borra la
--   sin argumentos. La web actual la llama con `{ p_ubicacion_id }` y la vieja sin argumentos: las dos siguen resolviendo.
--
-- QUÉ NO HACE. No toca `campana_sedes`, `fn_campanas_en_sede` ni ninguna función que cobra: solo el nombre y los argumentos de la que lee la caja.
--
-- DESCARTÉ: editar 20261023162000. Ya está pegada en producción (2026-10-23, por el MCP de Supabase): su contenido no se reescribe, se corrige
--   con un archivo nuevo.
--
-- CÓMO SE PEGA. Este archivo tal cual en el SQL Editor de producción, de una vez. Idempotente, `lock_timeout` 3 s; solo `create or replace` y
--   `drop function` (que no toman las tablas de `auth` ni `storage`, ADR-0195). Va DESPUÉS de 20261023162000.
-- CAÍDA EXTERNA. Nada llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. La guarda: va después de 20261023162000 -----------------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('retail.fn_campanas_en_sede(date,integer,uuid[],uuid)') is null
     or to_regprocedure('retail.campanas_vigentes(uuid)') is null then
    raise exception 'Falta 20261023162000_campanas_por_sede.sql: pégala antes. No se aplicó nada.';
  end if;
end;
$$;

-- 1. Una sola función, con la sede opcional -------------------------------------------------------------------------------------

create or replace function retail.campanas_vigentes(p_ubicacion_id uuid default null)
returns table (variante_id uuid, etiqueta_id uuid, etiqueta_nombre text, descuento_pct numeric)
language sql
stable
set search_path to 'retail', 'public'
as $function$
  -- ADR-0486: sin sede (null), solo las campañas que rigen en todas las sedes.
  select distinct on (c.variante_id) c.variante_id, c.etiqueta_id, c.etiqueta_nombre, c.descuento_pct
  from retail.fn_campanas_en_sede(retail.fn_hoy_lima(), 0, null, p_ubicacion_id) c
  order by c.variante_id, c.descuento_pct desc, c.etiqueta_nombre, c.etiqueta_id
$function$;

comment on function retail.campanas_vigentes(uuid) is
  'ADR-0486. La campaña de mayor % que rige HOY (Lima) para cada variante EN esa sede. Un solo descuento por prenda: el mayor. Sin sede (null o sin argumento): solo las campañas que rigen en todas las sedes.';

-- La que no llevaba argumento ya no hace falta: `campanas_vigentes()` resuelve a esta, con la sede en null.
drop function if exists retail.campanas_vigentes();

revoke all on function retail.campanas_vigentes(uuid) from public, anon;
grant execute on function retail.campanas_vigentes(uuid) to authenticated;

-- 2. Comprobación: una sola firma, y la llamada sin argumentos sigue resolviendo -----------------------------------------------------

do $$
declare
  v_firmas integer;
begin
  v_firmas := (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'campanas_vigentes');
  if v_firmas <> 1 then
    raise exception 'campanas_vigentes quedó con % firmas (se esperaba 1). No se aplicó nada.', v_firmas;
  end if;
  perform 1 from retail.campanas_vigentes() limit 1;
end;
$$;
