-- ============================================================================
-- 20261009230000_listado_productos_respeta_foto_principal.sql — CAYLA V2
--
-- PROBLEMA (Felipe, 2026-10-09): la Blusa Alba Rayas (CMS-0013) tenía tres fotos del color VIN —la vieja en orden 0 y la
-- nueva en orden 1 y 2, marcada principal— y Catálogo ▸ Productos seguía mostrando la vieja. No era caché: la lista
-- (`fn_productos_listado`) y `fn_productos` eligen la foto con
--     order by (pf.color_codigo is null), pf.orden
-- que ignora `es_principal`. La ficha, `fn_analisis_sede`, `fn_resumen_variantes` y `fn_piso_plan_lectura` sí la ponen
-- primero; por eso cada pantalla podía mostrar una foto distinta de la misma prenda.
--
-- ARREGLO: la misma regla que `fotoDeVariante` (lib/producto-fotos-reglas.ts) y `fn_analisis_sede`: la de SU color antes
-- que la general y, dentro de las candidatas, la principal antes que el orden.
--
-- CÓMO. Reemplazo anclado en vivo (debe aparecer exactamente una vez); se puede pegar dos veces. Sin tablas ni políticas
-- (ADR-0195) ni `select … into` dentro de un texto entre comillas (ADR-0288).
--
-- Huellas verificadas ANTES (2026-10-09), iguales en local y en producción:
--   md5(pg_get_functiondef(fn_productos))         = 080a75e5f0ce160bab4e949bf236c65c
--   md5(pg_get_functiondef(fn_productos_listado)) = 5674e6970aed1ab123af7d80365e793f
--
-- CÓMO SE DESHACE: el mismo reemplazo al revés (quitar `pf.es_principal desc, `).
--
-- EN PRODUCCIÓN desde el 2026-10-09 (MCP `apply_migration`, versión 20261009230000). Huellas DESPUÉS, iguales en local y en
-- producción: fn_productos = de6ac046582defaf4ce223d6122d1fec · fn_productos_listado = 63ca8449357d29849770f0f6fab4ad1c.
-- ============================================================================

set lock_timeout = '3s';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void language plpgsql as $f$
declare v_def text; v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then return; end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception 'listado respeta foto principal: en % se esperaban % apariciones de «%» y hay %', p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar(
  'retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer, text, uuid, uuid)',
  'order by (pf.color_codigo is null), pf.orden',
  'order by (pf.color_codigo is null), pf.es_principal desc, pf.orden',
  1
);

select pg_temp.reemplazar(
  'retail.fn_productos_listado(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, text, integer, integer)',
  'order by (pf.color_codigo is null), pf.orden',
  'order by (pf.color_codigo is null), pf.es_principal desc, pf.orden',
  1
);

-- Validación: las dos quedaron con la principal primero.
do $v$
begin
  if position('pf.es_principal desc, pf.orden' in pg_get_functiondef('retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer, text, uuid, uuid)'::regprocedure)) = 0
     or position('pf.es_principal desc, pf.orden' in pg_get_functiondef('retail.fn_productos_listado(text, uuid, uuid, uuid, text[], text[], uuid[], text, text, text, numeric, numeric, text, uuid, text, integer, integer)'::regprocedure)) = 0 then
    raise exception 'listado respeta foto principal: el orden no quedó como se esperaba';
  end if;
end;
$v$;

notify pgrst, 'reload schema';
