-- ============================================================================
-- 20261010100300_apartados_cambios_proformas_precio_de_sede.sql — CAYLA V2 (Felipe, 2026-10-09; sigue a 20261010100000)
--
-- EL PROBLEMA. Con precio propio por tienda, Vender ya cobra el de la tienda (20261010100200), pero otras cinco funciones
-- que fijan o comparan un precio seguían leyendo `variantes.precio`: en Arequipa una prenda se habría vendido a S/ 129.90
-- y apartado, cotizado o cambiado a S/ 119.90.
--
-- LO QUE HACE. Un reemplazo ANCLADO por función (falla sin tocar nada si la función viva no es la revisada; re-ejecutable):
--   · `separar_prendas`  (Apartados: separar)          → el precio de la tienda del apartado;
--   · `editar_separacion` (Apartados: sumar prendas)    → el de la tienda del apartado (`s.ubicacion_id`);
--   · `registrar_cambio` (la diferencia que se cobra o devuelve) → el de la prenda nueva en la tienda donde se cambia;
--   · `crear_proforma`   (cotizar)                      → el de la tienda de la proforma (su candado compara con ese);
--   · `regularizar_prenda` (Ventas sin registrar: el «precio oficial» y la diferencia) → el de la tienda de esa venta.
-- Sin precios propios, `fn_precio_en_sede` devuelve el general: todo queda idéntico a antes.
--
-- PRODUCCIÓN. Una sola parte, sin tablas ni políticas. Se pega DESPUÉS de 20261010100000. Las anclas no llevan la palabra
-- que abre una consulta junto a la que la cierra (CLAUDE.md, «El SQL Editor agrega líneas por su cuenta»).
-- Prueba: `pnpm pruebas:precio-sede`, `pnpm pruebas:separaciones`, `pnpm pruebas:registrar-cambio`,
-- `pnpm pruebas:prendas-por-regularizar`.
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

-- La firma completa de la única versión viva de cada función (si hubiera dos, la subconsulta falla: mejor que adivinar).
create or replace function pg_temp.firma(p_nombre text) returns text
language sql as $f$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'retail' and p.proname = p_nombre;
$f$;

select pg_temp.reemplazar(pg_temp.firma('separar_prendas'),
  $v$v.precio, p.referencia, coalesce(v.codigo, v.sku, 'sin código')$v$,
  $v$retail.fn_precio_en_sede(v.id, p_ubicacion_id), p.referencia, coalesce(v.codigo, v.sku, 'sin código')$v$,
  1);

select pg_temp.reemplazar(pg_temp.firma('editar_separacion'),
  $v$v.precio, p.referencia, v.sku$v$,
  $v$retail.fn_precio_en_sede(v.id, s.ubicacion_id), p.referencia, v.sku$v$,
  1);

select pg_temp.reemplazar(pg_temp.firma('registrar_cambio'),
  $v$precio into v_precio_nuevo from variantes where id = p_variante_nueva_id$v$,
  $v$retail.fn_precio_en_sede(p_variante_nueva_id, p_ubicacion_id) into v_precio_nuevo from variantes where id = p_variante_nueva_id$v$,
  1);

select pg_temp.reemplazar(pg_temp.firma('crear_proforma'),
  $v$v.precio, v.activo, concat_ws($v$,
  $v$retail.fn_precio_en_sede(v.id, p_ubicacion_id), v.activo, concat_ws($v$,
  1);

select pg_temp.reemplazar(pg_temp.firma('regularizar_prenda'),
  $v$v_var.precio$v$,
  $v$retail.fn_precio_en_sede(v_var.id, v_p.ubicacion_id)$v$,
  2);
