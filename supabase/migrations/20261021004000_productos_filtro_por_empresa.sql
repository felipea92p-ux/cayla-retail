-- ============================================================================
-- 20261021004000 — Catálogo ▸ Productos: filtro por empresa (CAYLA / CLAURE) (ADR-0467, sigue a ADR-0463)
--
-- QUÉ ES ESTO
--   Felipe (2026-10-20): un filtro adicional en Catálogo para ver solo los productos de CAYLA o solo los de CLAURE. La lista
--   (`fn_productos_listado`) y los conteos de cada opción (`fn_productos_facetas`) leen el MISMO filtro interno,
--   `fn_productos_filtro`, para que un conteo nunca contradiga a lo que sale en la lista (20261002200000). Por eso la empresa
--   se filtra AHÍ, una sola vez: las dos funciones de la pantalla solo le pasan el parámetro nuevo.
--
-- QUÉ CAMBIA
--   · `fn_productos_filtro` gana `p_empresa_id uuid default null` (al FINAL: quien la llame con los 15 de siempre sigue igual).
--     Con una empresa, las variantes de otras empresas ni entran a `visibles`, así que lista y conteos coinciden y los de las
--     demás píldoras se calculan DENTRO de esa empresa.
--   · `fn_productos_listado` y `fn_productos_facetas` ganan el mismo parámetro al final y se lo pasan.
--   · Sin empresa (null) devuelven EXACTAMENTE lo de antes.
--
-- LO QUE NO HACE
--   · No agrega una faceta «empresa» (el conteo por empresa dentro de la píldora): la píldora va sin números por ahora.
--   · No toca `fn_productos`, `fn_productos_resumen` ni Existencias (esa pantalla filtra en el navegador).
--
-- CÓMO. Reemplazo anclado por TEXTO sobre la definición viva (cada ancla debe aparecer EXACTAMENTE una vez, si no aborta sin tocar
--   nada), porque el parámetro nuevo cambia la firma: se crea la firma nueva, se borra la vieja y se vuelven a dar los permisos que
--   tenían (`filtro`: solo postgres; `listado` y `facetas`: authenticated y service_role, nunca anon). Se puede pegar dos veces: si la
--   firma nueva ya existe, no hace nada. Sin tablas ni políticas (ADR-0195) ni `select … into` dentro de un texto entre comillas
--   (ADR-0288). Una sola ejecución.
--   Huellas verificadas ANTES (2026-10-20), iguales en producción: fn_productos_filtro = d320a80f6dae9f142319b8b0d8514283 ·
--   fn_productos_facetas = d284a9b9a1e7b2560e90f46198e7633a · fn_productos_listado = 63ca8449357d29849770f0f6fab4ad1c
--   (el local viejo trae 5674e697… porque le falta 20261009230000; no importa: ninguna ancla está en la línea de la foto).
--
-- CÓMO SE DESHACE: la firma vieja se vuelve a crear con las definiciones de 20261002200000 / 20261002200100 / 20261009230000 y se
--   borra la nueva; la web manda `p_empresa_id` solo cuando hay una empresa elegida.
--
-- ORDEN DE PEGADO: después de 20261020225000 (la columna `productos.empresa_id`). La web nueva ya se degrada sola si la base aún no
--   tiene el parámetro (no manda la clave).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Cada ancla del texto vivo tiene que aparecer EXACTAMENTE una vez; si no, la función cambió desde que se escribió esto y no se toca nada.
create or replace function pg_temp.una_vez(p_def text, p_ancla text)
returns void language plpgsql as $f$
declare v_n integer;
begin
  v_n := (length(p_def) - length(replace(p_def, p_ancla, ''))) / length(p_ancla);
  if v_n <> 1 then
    raise exception 'filtro por empresa: se esperaba UNA aparición de «%» y hay %. La función cambió desde que se escribió esta migración: regenera el reemplazo desde su definición real.', p_ancla, v_n;
  end if;
end;
$f$;

do $migracion$
declare
  c_filtro_viejo  constant text := 'retail.fn_productos_filtro(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, boolean)';
  c_filtro_nuevo  constant text := 'retail.fn_productos_filtro(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, boolean, uuid)';
  c_listado_viejo constant text := 'retail.fn_productos_listado(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, text, integer, integer)';
  c_listado_nuevo constant text := 'retail.fn_productos_listado(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, text, integer, integer, uuid)';
  c_facetas_viejo constant text := 'retail.fn_productos_facetas(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid)';
  c_facetas_nuevo constant text := 'retail.fn_productos_facetas(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, uuid)';
  v_def text;
begin
  if to_regclass('retail.empresas') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'productos' and column_name = 'empresa_id') then
    raise exception 'Falta productos.empresa_id: pega antes 20261020225000_empresas_cayla_y_claure.sql';
  end if;

  -- 1. El filtro interno: la empresa se decide en `visibles`, antes de todo lo demás.
  if to_regprocedure(c_filtro_nuevo) is null then
    v_def := pg_get_functiondef(c_filtro_viejo::regprocedure);
    perform pg_temp.una_vez(v_def, 'p_con_stock boolean DEFAULT false)');
    perform pg_temp.una_vez(v_def, E'where p.id <> ''11111111-1111-4111-8111-111111111111''::uuid -- «Monto manual»: no es una prenda');
    v_def := replace(v_def, 'p_con_stock boolean DEFAULT false)', 'p_con_stock boolean DEFAULT false, p_empresa_id uuid DEFAULT NULL::uuid)');
    v_def := replace(v_def,
      E'where p.id <> ''11111111-1111-4111-8111-111111111111''::uuid -- «Monto manual»: no es una prenda',
      E'where p.id <> ''11111111-1111-4111-8111-111111111111''::uuid -- «Monto manual»: no es una prenda\n      and (p_empresa_id is null or p.empresa_id = p_empresa_id) -- ADR-0467: solo la empresa elegida');
    execute v_def;
  end if;

  -- 2. La lista de la pantalla.
  if to_regprocedure(c_listado_nuevo) is null then
    v_def := pg_get_functiondef(c_listado_viejo::regprocedure);
    perform pg_temp.una_vez(v_def, 'p_por_pagina integer DEFAULT 20)');
    perform pg_temp.una_vez(v_def, 'p_disponibilidad, p_ubicacion_id, p_disponibilidad in (''en_sede'', ''sin_sede''))');
    v_def := replace(v_def, 'p_por_pagina integer DEFAULT 20)', 'p_por_pagina integer DEFAULT 20, p_empresa_id uuid DEFAULT NULL::uuid)');
    v_def := replace(v_def,
      'p_disponibilidad, p_ubicacion_id, p_disponibilidad in (''en_sede'', ''sin_sede''))',
      'p_disponibilidad, p_ubicacion_id, p_disponibilidad in (''en_sede'', ''sin_sede''), p_empresa_id)');
    execute v_def;
  end if;

  -- 3. Los conteos de cada opción.
  if to_regprocedure(c_facetas_nuevo) is null then
    v_def := pg_get_functiondef(c_facetas_viejo::regprocedure);
    perform pg_temp.una_vez(v_def, 'p_ubicacion_id uuid DEFAULT NULL::uuid)');
    perform pg_temp.una_vez(v_def, 'p_disponibilidad, p_ubicacion_id, p_ubicacion_id is not null)');
    v_def := replace(v_def, 'p_ubicacion_id uuid DEFAULT NULL::uuid)', 'p_ubicacion_id uuid DEFAULT NULL::uuid, p_empresa_id uuid DEFAULT NULL::uuid)');
    v_def := replace(v_def,
      'p_disponibilidad, p_ubicacion_id, p_ubicacion_id is not null)',
      'p_disponibilidad, p_ubicacion_id, p_ubicacion_id is not null, p_empresa_id)');
    execute v_def;
  end if;

  -- 4. Las firmas viejas ya no sirven (con las dos a la vez, una llamada sin el parámetro sería ambigua).
  if to_regprocedure(c_filtro_viejo) is not null then drop function retail.fn_productos_filtro(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, boolean); end if;
  if to_regprocedure(c_listado_viejo) is not null then drop function retail.fn_productos_listado(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, text, integer, integer); end if;
  if to_regprocedure(c_facetas_viejo) is not null then drop function retail.fn_productos_facetas(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid); end if;

  -- 5. Los permisos de siempre: el filtro es interno (solo postgres); la lista y los conteos, para quien está conectado.
  execute 'revoke all on function ' || c_filtro_nuevo || ' from public, anon, authenticated, service_role';
  execute 'revoke all on function ' || c_listado_nuevo || ' from public, anon';
  execute 'revoke all on function ' || c_facetas_nuevo || ' from public, anon';
  execute 'grant execute on function ' || c_listado_nuevo || ' to authenticated, service_role';
  execute 'grant execute on function ' || c_facetas_nuevo || ' to authenticated, service_role';
end
$migracion$;

-- Recargar el esquema que ve PostgREST (las firmas cambiaron).
notify pgrst, 'reload schema';

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si no ves «QUEDÓ BIEN», el texto se pegó cortado o falta algo:
-- es seguro volver a pegarlo completo.
select '20261021004000 · filtro de empresa en Productos' as parte,
       case when to_regprocedure('retail.fn_productos_filtro(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, boolean, uuid)') is not null
             and to_regprocedure('retail.fn_productos_listado(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, text, integer, integer, uuid)') is not null
             and to_regprocedure('retail.fn_productos_facetas(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, uuid)') is not null
             and to_regprocedure('retail.fn_productos_filtro(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, boolean)') is null
             and to_regprocedure('retail.fn_productos_listado(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, text, integer, integer)') is null
             and to_regprocedure('retail.fn_productos_facetas(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid)') is null
             and not has_function_privilege('anon', 'retail.fn_productos_listado(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, text, integer, integer, uuid)', 'execute')
             and has_function_privilege('authenticated', 'retail.fn_productos_listado(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, text, integer, integer, uuid)', 'execute')
             and not has_function_privilege('authenticated', 'retail.fn_productos_filtro(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, boolean, uuid)', 'execute')
            then 'QUEDÓ BIEN' else 'REVISAR: falta una firma nueva, quedó una vieja o los permisos no son los de antes' end as resultado;
