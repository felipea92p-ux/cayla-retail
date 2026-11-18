-- ============================================================================
-- 20261107201000_nacidas_al_recibir_se_van_con_la_ficha.sql — CAYLA V2 · ADR-0393 (act. 2026-11-07 b)
-- La anotación «esta combinación nació al recibir el envío X» se va con la prenda cuando la prenda se elimina.
--
-- EL PROBLEMA PRIMERO. `20261107191000` creó `variantes_nacidas_al_recibir` con su llave a `variantes` SIN cascada. Una prenda que
-- nació en Recibir y nunca se movió (se creó para contarla y el envío se dejó a medias) no tiene historia: Catálogo dice que se puede
-- eliminar, pero `eliminar_producto` chocaba con esa llave y la persona veía «otra parte del sistema todavía lo usa». Lo encontró la
-- prueba de deriva de `scripts/pruebas/eliminar_producto.mjs` (PR #1701).
--
-- QUÉ CAMBIA. La llave `variante_id` pasa a `on delete cascade`, como `producto_origen` (ADR-0292): en qué envío nació una
-- combinación es un dato que nace con la ficha y se va con ella. No es historia: lo que sí se recibió deja movimientos, `despacho_recibidos`
-- o `despacho_pendientes`, y eso sigue frenando el borrado. Desde Recibir nada se borra (quitar una combinación la archiva).
--
-- DESCARTÉ
--   · Tratarla como historia (frenar el borrado): una prenda sin una sola unidad quedaría imposible de eliminar por una nota interna.
--   · Borrarla a mano dentro de `eliminar_producto`: otro reemplazo anclado a una función viva por algo que la llave resuelve sola.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, idempotente, sin políticas: solo toca la llave de una tabla que leen las
-- funciones de Recibir. Agregar la llave toma un momento `variantes` (SHARE ROW EXCLUSIVE) mientras revisa las filas, que son pocas.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
declare
  v_nombre text;
  v_cascada boolean;
begin
  select c.conname, c.confdeltype = 'c'
    into v_nombre, v_cascada
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.contype = 'f'
     and c.conrelid = 'retail.variantes_nacidas_al_recibir'::regclass
     and c.confrelid = 'retail.variantes'::regclass
     and a.attname = 'variante_id'
   limit 1;

  if v_cascada then
    return; -- ya está aplicada
  end if;

  if v_nombre is not null then
    execute format('alter table retail.variantes_nacidas_al_recibir drop constraint %I', v_nombre);
  end if;

  alter table retail.variantes_nacidas_al_recibir
    add constraint variantes_nacidas_al_recibir_variante_id_fkey
    foreign key (variante_id) references retail.variantes (id) on delete cascade;
end;
$$;
