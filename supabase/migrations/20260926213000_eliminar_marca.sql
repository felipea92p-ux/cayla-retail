-- ============================================================================
-- 20260926213000_eliminar_marca.sql — CAYLA V2 (Catálogo ▸ Marcas ▸ Eliminar)
--
-- EL PROBLEMA. Una marca creada por error («Cayla 2», 2026-09-26: se tecleó al dar de alta un producto) solo se
-- podía DESACTIVAR. Desactivar no la quita: queda en «Desactivadas» para siempre, sigue ocupando su nombre (crear
-- otra igual dice «existe pero está desactivada») y no hay cómo dejar el catálogo limpio. Felipe pidió poder
-- eliminarla.
--
-- LA DECISIÓN (Felipe, 2026-09-26): Eliminar existe, pero SOLO cuando ningún producto tiene esa marca — ni activo ni
-- descontinuado ni archivado como prueba. La regla del repo es no borrar lo que tiene historia (`movimientos` es
-- inmutable, ADR-0159 archiva en vez de borrar): una marca sin ningún producto no tiene historia que perder —
-- `productos` y `marca_proveedores` son las ÚNICAS tablas que la citan (verificado en producción, pg_constraint) y
-- ambas con NO ACTION —, así que borrarla no rompe nada. Una marca con productos se sigue desactivando.
--
-- ESTADO IMPOSIBLE. «Un producto cuya marca ya no existe». No depende de esta función: `productos_marca_fk` lo
-- impide sola. Si el conteo de abajo fallara, el DELETE fallaría con violación de llave en vez de dejar un producto
-- huérfano. El conteo existe para decirlo en castellano.
--
-- POR QUÉ UNA FUNCIÓN Y NO DOS DELETE DESDE LA PANTALLA. Hay que borrar los vínculos con proveedores y luego la
-- marca: desde el cliente serían dos llamadas, y si la segunda falla la marca queda viva pero sin proveedor
-- («no se puede usar en ningún producto»). Aquí es todo o nada.
--
-- CONCURRENCIA. La fila de la marca se toma `for update` ANTES de contar: un alta de producto con esa marca
-- (su llave foránea toma la misma fila `for key share`) espera a que esto termine, o ya se ve al contar. Si el alta
-- gana, aquí se rechaza; si esto gana, el alta falla con «la marca ya no existe» y no queda nada a medias.
--
-- LO QUE NO DEJA RASTRO. La fila borrada no guarda quién ni cuándo (`marcas` no tiene historial propio). Sí queda el
-- rastro de los productos que alguna vez la tuvieron: `historial_producto_cambios` (marca_id anterior → nuevo, en
-- texto, sin llave foránea), que hoy ninguna pantalla resuelve a nombre. Por eso Eliminar es solo para marcas sin
-- productos; una con productos se desactiva y su nombre sigue legible.
--
-- PRODUCCIÓN. Solo crea una función: sin `alter` ni políticas (ADR-0195), se pega en UNA parte, antes que la web.
-- Prefijo `retail.` escrito. Re-ejecutable. Prueba: `pnpm pruebas:eliminar-marca`.
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.eliminar_marca(p_marca_id uuid)
returns text
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_marca retail.marcas;
  v_productos integer;
begin
  if not retail.fn_puede_editar_catalogo() then
    raise exception 'No tienes permiso para eliminar marcas.';
  end if;
  -- El candado del combo «Responsable» (ADR-0161): alguien presente en la tienda hace la operación.
  perform retail.fn_actor_persona_id(true);

  select * into v_marca from retail.marcas where id = p_marca_id for update;
  if v_marca.id is null then
    raise exception 'Esa marca ya no existe. Recarga la pantalla.' using hint = 'marca_invalida';
  end if;

  -- Cualquier estado cuenta: un producto descontinuado (o archivado como prueba) sigue teniendo su marca en la ficha
  -- y en la venta que ya se hizo.
  select count(*) into v_productos from retail.productos where marca_id = p_marca_id;
  if v_productos > 0 then
    raise exception 'No se puede eliminar «%»: % producto(s) la tienen (cuentan también los descontinuados). Cámbiales la marca en Productos primero; si solo quieres que no aparezca al crear prendas, desactívala.',
      v_marca.nombre, v_productos
      using hint = 'marca_con_productos';
  end if;

  delete from retail.marca_proveedores where marca_id = p_marca_id;
  delete from retail.marcas where id = p_marca_id;

  return v_marca.nombre;
end;
$$;

comment on function retail.eliminar_marca(uuid) is
  'Catálogo ▸ Marcas ▸ Eliminar: borra una marca y sus vínculos con proveedores, todo o nada, SOLO si ningún producto (de cualquier estado) la tiene. Con productos se rechaza: esa se desactiva. Devuelve el nombre de la marca eliminada.';

revoke execute on function retail.eliminar_marca(uuid) from public, anon;
grant execute on function retail.eliminar_marca(uuid) to authenticated;
