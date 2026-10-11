-- ============================================================================
-- 20261011100100_apartar_cambiar_y_filtrar_con_el_precio_de_la_tienda.sql — CAYLA V2 (Felipe, 2026-10-10; sigue a 20261011100000)
--
-- TRES AGUJEROS DEL PRECIO DE TIENDA (auditoría del 2026-10-10, ADR-0370):
--
-- 1. APARTAR DESCUADRABA LA VENTA. `separar_prendas` lee el precio dos veces. La primera (el candado y el total) ya era la de la
--    tienda (20261010100300); la segunda —la que guarda `separacion_items.precio_unitario` y calcula la campaña— seguía en
--    `variantes.precio`. En TRU (69.90, grilla 79.90) el apartado cobraba 69.90 y guardaba la línea a 79.90: al entregar, la venta
--    quedaba con 79.90 en la línea y 69.90 en los pagos; al sumar otra prenda se cobraban S/ 10 de más; al devolver, el tope
--    pasaba lo pagado. Producción, 2026-10-10: 0 apartados así. Se corrige la segunda lectura.
--
-- 2. EL CAMBIO DE LA MISMA PRENDA COBRABA POR LA TIENDA (decisión de Felipe, 2026-10-10: «vale lo que pagó»). Comprada en TRU a
--    69.90 y cambiada de talla en Lima (79.90), la diferencia salía +S/ 10 por la misma falda; al revés, salían S/ 10 del cajón.
--    Ahora: si la prenda nueva es de la MISMA prenda (otra talla o color), su precio es el de la tienda DONDE SE COMPRÓ; si es otra
--    prenda, el de la tienda donde se cambia (es una venta nueva aquí). `fn_precio_para_cambio` es esa regla, y la pantalla de
--    Cambios calcula lo mismo (`lib/cambio-reemplazo-reglas.ts`).
--
-- 3. EL FILTRO Y EL ORDEN DEL CATÁLOGO USABAN LA GRILLA. En TRU, «Hasta S/ 70» no mostraba FAL-0008 (ahí cuesta 69.90) y el orden
--    por precio la ponía entre las de 79.90. `fn_productos_filtro` ya recibe la tienda: su precio pasa a ser el de esa tienda (sin
--    tienda, la grilla). El listado ordena y las facetas cuentan sobre ese mismo número, porque los dos leen este filtro.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, sin tablas ni políticas. Reemplazos ANCLADOS: fallan sin tocar nada si la función viva
-- no es la revisada. Las anclas no llevan la palabra que abre una consulta junto a la que la cierra (CLAUDE.md, «El SQL Editor
-- agrega líneas por su cuenta»). Pruebas: `pnpm pruebas:precio-sede`, `pnpm pruebas:separaciones`, `pnpm pruebas:registrar-cambio`,
-- `node scripts/pruebas/productos_listado_por_variante.mjs`.
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

select pg_temp.reemplazar(pg_temp.firma('separar_prendas'),
  $v$v.precio into v_precio from variantes v where v.id = v_item.variante_id$v$,
  $v$retail.fn_precio_en_sede(v.id, p_ubicacion_id) into v_precio from variantes v where v.id = v_item.variante_id$v$,
  1);

-- ---------- 2. Cambiar la misma prenda vale lo que pagó ----------

-- El precio de la prenda que se lleva en un cambio: el de la tienda donde se COMPRÓ si es la misma prenda (otra talla o color), el
-- de la tienda donde se cambia si es otra. Sin la línea o la variante, null (registrar_cambio lo rechaza con su propio mensaje).
create or replace function retail.fn_precio_para_cambio(p_venta_item_id uuid, p_variante_nueva_id uuid, p_ubicacion_id uuid)
returns numeric
language sql stable security definer set search_path = retail, public, extensions as $$
  select retail.fn_precio_en_sede(vn.id, case when vn.producto_id = vo.producto_id then ve.ubicacion_id else p_ubicacion_id end)
    from retail.venta_items vi
    join retail.ventas ve on ve.id = vi.venta_id
    join retail.variantes vo on vo.id = vi.variante_id
    join retail.variantes vn on vn.id = p_variante_nueva_id
   where vi.id = p_venta_item_id;
$$;
revoke all on function retail.fn_precio_para_cambio(uuid, uuid, uuid) from public, anon;
grant execute on function retail.fn_precio_para_cambio(uuid, uuid, uuid) to authenticated;

select pg_temp.reemplazar(pg_temp.firma('registrar_cambio'),
  $v$retail.fn_precio_en_sede(p_variante_nueva_id, p_ubicacion_id) into v_precio_nuevo from variantes where id = p_variante_nueva_id$v$,
  $v$retail.fn_precio_para_cambio(p_venta_item_id, p_variante_nueva_id, p_ubicacion_id) into v_precio_nuevo from variantes where id = p_variante_nueva_id$v$,
  1);

-- ---------- 3. El filtro del catálogo usa el precio de la tienda ----------

select pg_temp.reemplazar(pg_temp.firma('fn_productos_filtro'),
  $v$v.id as variante_id, v.producto_id, v.precio, v.color_codigo$v$,
  $v$v.id as variante_id, v.producto_id,
           coalesce((select ps.precio from retail.precios_sede_prenda ps
                      where ps.producto_id = v.producto_id and ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null),
                    v.precio) as precio,
           v.color_codigo$v$,
  1);
