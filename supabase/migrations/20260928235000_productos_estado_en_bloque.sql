-- ============================================================================
-- Productos ▸ Tabla: descontinuar y reactivar varias prendas de una vez, con la MISMA regla que «Editar» (ADR-0254)
-- ============================================================================
--
-- EL PROBLEMA. La Tabla de /productos cambiaba el estado de lo marcado con un `update productos set estado` directo
-- (ProductosAgrupados.tsx, RLS `productos_write_lider`). «Editar» (`catalogo_actualizar_producto`) hace lo mismo pero,
-- al REACTIVAR, revisa que la marca y el proveedor de la prenda sigan activos y se lleven entre sí
-- (`fn_validar_marca_proveedor`). Dos caminos, una regla: desde la Tabla una prenda volvía a «Activo» con una marca
-- dada de baja, justo lo que el candado de desactivar marcas quería impedir.
--
-- QUÉ HACE. `cambiar_estado_productos(p_producto_ids, p_estado)`:
--   · Solo 'activo' o 'descontinuado'.
--   · Quien no puede editar el catálogo recibe un mensaje claro (antes, la RLS dejaba el update en cero filas y la
--     pantalla decía «listo» sin cambiar nada).
--   · Al reactivar, cada prenda pasa por `fn_validar_marca_proveedor` y por la regla de la rechazada en el censo, y el
--     mensaje dice CUÁL prenda falló.
--   · TODO O NADA: si una falla, no cambia ninguna. Marcar 12 y que se reactiven 9 sin decir cuáles es peor que no
--     reactivar ninguna y decir cuál corregir.
--   · Devuelve cuántas cambiaron de verdad (las que ya estaban en ese estado no cuentan).
--
-- QUIÉN FIRMA. No firma aquí: el disparador `productos_registrar_cambio` ya anota cada cambio de estado en
-- `historial_producto_cambios` con `fn_actor_persona_id(true)` (el responsable del combo, ADR-0162).
--
-- SECURITY INVOKER a propósito, como `catalogo_actualizar_producto`: la RLS de `productos` sigue siendo el candado
-- real; el `fn_puede_editar_catalogo()` de arriba solo da el mensaje en palabras.
--
-- PARA PEGAR EN PRODUCCIÓN: trae `set search_path` y cada nombre con `retail.`. Crea una función nueva, no toca
-- tablas ni políticas: se pega sola, sin partes (regla de deadlocks, CLAUDE.md). La web nueva funciona sin ella
-- (cae al update directo de antes), así que el orden web/SQL no rompe nada.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.cambiar_estado_productos(p_producto_ids uuid[], p_estado text)
returns integer
language plpgsql
security invoker
set search_path = retail, public
as $$
declare
  v_fila record;
  v_cambiadas integer;
begin
  if p_estado is null or p_estado not in ('activo', 'descontinuado') then
    raise exception 'El estado tiene que ser «activo» o «descontinuado».' using hint = 'estado_invalido';
  end if;
  if p_producto_ids is null or cardinality(p_producto_ids) = 0 then
    raise exception 'No marcaste ninguna prenda.' using hint = 'sin_prendas';
  end if;
  if not retail.fn_puede_editar_catalogo() then
    raise exception 'No tienes permiso para cambiar el estado de las prendas del catálogo.' using hint = 'sin_permiso';
  end if;

  -- Se bloquean primero, en orden fijo por id: dos personas marcando prendas cruzadas no se esperan en círculo.
  perform 1 from retail.productos where id = any(p_producto_ids) order by id for update;

  if p_estado = 'activo' then
    for v_fila in
      select id, referencia, marca_id, proveedor_id, estado_alta
        from retail.productos
       where id = any(p_producto_ids) and estado is distinct from 'activo'
       order by referencia
    loop
      if v_fila.estado_alta = 'rechazado' then
        raise exception '«%» se rechazó al revisar un alta al vuelo y no se puede reactivar. Créala de nuevo con Nuevo producto.', v_fila.referencia
          using hint = 'rechazado_no_reactivable';
      end if;
      begin
        perform retail.fn_validar_marca_proveedor(v_fila.marca_id, v_fila.proveedor_id);
      exception when raise_exception then
        -- El mismo mensaje de «Editar», con el nombre de la prenda delante: con varias marcadas, hay que saber cuál.
        raise exception '«%»: %', v_fila.referencia, sqlerrm using hint = 'marca_proveedor_al_reactivar';
      end;
    end loop;
  end if;

  update retail.productos
     set estado = p_estado
   where id = any(p_producto_ids)
     and estado is distinct from p_estado;
  get diagnostics v_cambiadas = row_count;

  return v_cambiadas;
end;
$$;

comment on function retail.cambiar_estado_productos(uuid[], text) is
  'ADR-0254: descontinuar/reactivar varias prendas desde la Tabla de /productos. Todo o nada; al reactivar revisa marca y proveedor como catalogo_actualizar_producto. Devuelve cuántas cambiaron.';

revoke all on function retail.cambiar_estado_productos(uuid[], text) from public, anon;
grant execute on function retail.cambiar_estado_productos(uuid[], text) to authenticated;
