-- ============================================================================
-- 20261011100100_apartar_con_el_precio_de_la_tienda.sql — CAYLA V2 (Felipe, 2026-10-10; ADR-0370, sigue a 20261011100000)
--
-- APARTAR DESCUADRABA LA VENTA. `separar_prendas` lee el precio dos veces. La primera (el candado y el total) ya era la de la tienda
-- (20261010100300); la segunda —la que guarda `separacion_items.precio_unitario` y calcula la campaña— seguía en `variantes.precio`.
-- En TRU (69.90, prenda 79.90) el apartado cobraba 69.90 y guardaba la línea a 79.90: al entregar, la venta quedaba con 79.90 en la
-- línea y 69.90 en los pagos; al sumar otra prenda se cobraban S/ 10 de más; al devolver, el tope pasaba lo pagado. Producción,
-- 2026-10-10: 0 apartados así. Se corrige la segunda lectura.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, sin tablas ni políticas. Se puede pegar ANTES de publicar la web nueva (Apartados ya
-- manda el precio de la tienda). Reemplazo ANCLADO: falla sin tocar nada si la función viva no es la revisada. Ningún texto de ancla
-- lleva la palabra con que se guarda una consulta en una variable (CLAUDE.md, «El SQL Editor agrega líneas por su cuenta»).
-- Pruebas: `pnpm pruebas:precio-sede`, `pnpm pruebas:separaciones`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

create or replace function pg_temp.firma(p_nombre text) returns text
language sql as $f$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'retail' and p.proname = p_nombre;
$f$;

-- ---------- 1. Apartar guarda la línea al precio de la tienda ----------

-- La segunda lectura es la única «select v.precio » de la función (comprobado en producción el 2026-10-10); la marca del comentario
-- hace el reemplazo re-ejecutable (la primera lectura ya dice «fn_precio_en_sede(v.id, p_ubicacion_id)»).
select pg_temp.reemplazar(pg_temp.firma('separar_prendas'),
  $v$select v.precio $v$,
  $v$select /* precio de la tienda en la línea (20261011100100) */ retail.fn_precio_en_sede(v.id, p_ubicacion_id) $v$,
  1);
