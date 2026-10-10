-- ============================================================================
-- 20261010100200_venta_cobra_precio_de_sede.sql — CAYLA V2 (Felipe, 2026-10-09; sigue a 20261010100000)
--
-- EL PROBLEMA. `registrar_venta` compara el precio que manda la caja con `variantes.precio` (el candado de
-- 20260914215059: el precio lo fija el catálogo, no la caja). Con precio propio por tienda, en Arequipa la caja manda el
-- precio de Arequipa y el candado lo rechazaría («el precio cambió») — o, peor, si la pantalla mostrara el general, se
-- cobraría el general donde no corresponde.
--
-- LO QUE HACE. Un reemplazo ANCLADO de una línea: el precio contra el que se compara pasa a ser
-- `fn_precio_en_sede(variante, p_ubicacion_id)` — el de esa tienda si tiene uno, si no el general (el mismo de siempre).
-- Todo lo demás de la venta se calcula sobre `precio_unitario`, que ya es ese precio: la campaña se aplica sobre el precio
-- de la tienda, el club y los topes de descuento también. Sin precio propio, la venta es idéntica a la de antes.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, sin tablas ni políticas. Se pega DESPUÉS de 20261010100000 y ANTES (o junto)
-- de publicar la web nueva: con la web vieja y sin precios propios puestos, nada cambia. Falla sin tocar nada si la
-- `registrar_venta` viva no es la revisada. Prueba: `pnpm pruebas:precio-sede` y `pnpm pruebas:registrar-venta`.
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

-- El ancla no lleva la palabra que abre la consulta ni la que la cierra: el SQL Editor no la confunde con una tabla nueva
-- (CLAUDE.md, «El SQL Editor agrega líneas por su cuenta»).
select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proname = 'registrar_venta'),
  $v$v.precio, p.referencia, coalesce(v.codigo, v.sku, 'sin código')$v$,
  $v$retail.fn_precio_en_sede(v.id, p_ubicacion_id), p.referencia, coalesce(v.codigo, v.sku, 'sin código')$v$,
  1);
