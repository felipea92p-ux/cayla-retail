-- ============================================================================
-- 20261112211000_fusionar_productos_lecturas.sql — Fusionar productos duplicados, parte 4: lo que se lee después (ADR-0650)
-- ============================================================================
--
-- EL PROBLEMA. Un producto fusionado queda descontinuado, sin tallas propias (se mudaron al que quedó) y con su nombre
-- libre (20261112204000). Las listas de Productos ya no lo muestran (cuentan por variante), pero la alerta de «ya existe
-- uno parecido» de Nuevo y Editar producto (`buscar_productos_parecidos`) lo seguía ofreciendo: invitaba a abrir una
-- ficha vacía en vez de la que quedó, que con el mismo nombre ya aparece sola.
--
-- QUÉ CAMBIA. `buscar_productos_parecidos` deja fuera a los fusionados, igual que a los rechazados (y que el índice del
-- nombre único por marca). Reemplazo anclado sobre la definición viva, re-ejecutable: si el ancla no aparece una sola
-- vez, aborta sin tocar nada.
--
-- PARA PEGAR EN PRODUCCIÓN: una parte, solo una función. Necesita 20261112204000.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
declare
  v_def text := pg_get_functiondef('retail.buscar_productos_parecidos(text, uuid, uuid, boolean)'::regprocedure);
  v_viejo constant text := E'      and p.estado_alta <> \'rechazado\'\n';
  v_nuevo constant text := E'      and p.estado_alta <> \'rechazado\'\n      and p.fusionado_en_id is null\n';
begin
  if position(v_nuevo in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception '20261112211000: buscar_productos_parecidos cambió y el ancla no aparece una sola vez. Revisar antes de pegar.';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end;
$$;
