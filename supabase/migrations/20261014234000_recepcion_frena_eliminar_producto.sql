-- ============================================================================
-- 20261014234000_recepcion_frena_eliminar_producto.sql — CAYLA V2 (ADR-0393; sigue a 20261013173000 y 20261014210000)
--
-- EL PROBLEMA. `despacho_pendientes` (20261013172000) cita a `productos`, y la prueba de deriva de `eliminar_producto.mjs` exige
-- que toda tabla que cita a una prenda esté clasificada: o se borra con la ficha, o es historia y frena el borrado. Lo recibido
-- (`despacho_recibidos`) ya frena por su movimiento con lote (renglón 18), pero un pendiente no deja movimiento: «18 Aurora sin
-- tallas» anotadas al cerrar un envío no están en el stock. Sin este renglón, Catálogo ▸ Productos diría «se puede eliminar» y la
-- llave lo frenaría con un «otra parte del sistema todavía lo usa» que no dice qué. Y el borrador de un envío que se está contando
-- (`despacho_conteos.separado`) nombra la prenda sin llave: eliminarla dejaría ese borrador apuntando a nada, y al cerrar la
-- tienda leería «Una de las prendas ya no existe».
--
-- LA DECISIÓN. Las dos son HISTORIA y NO se borran (`borrable = false`): lo que una sede contó al recibir es un hecho (los
-- pendientes no se borran nunca, disparador `despacho_pendientes_fija`), y una prenda con prendas físicas esperando en el almacén
-- no se elimina: se desactiva. Renglones 23 y 24 de `fn_producto_historia`, con un reemplazo ANCLADO junto al renglón 22 (mismo
-- patrón que 20261010100400). Re-ejecutable; falla sin tocar nada si la función viva cambió.
--
-- DESCARTÉ: contar solo los pendientes abiertos, porque uno resuelto o anulado igual cita la prenda con su llave y el borrado
-- chocaría con ella; y `on delete cascade` en la llave, porque borraría lo que la tienda contó (nunca se borra historia).
-- SE ROMPE SI: nace otra tabla de la recepción que cita a `productos` o `variantes`: la prueba de deriva lo marca.
--
-- PRODUCCIÓN. Una sola parte, sin tablas ni políticas; solo cambia una función de lectura (STABLE) que únicamente llaman funciones
-- `security definer` (por eso lee las tablas de la recepción, que no se leen directo). Prueba: `pnpm pruebas:eliminar-producto` y
-- el caso E1 de `pnpm pruebas:pendientes-de-envio`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function pg_temp.anclar(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición viva.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.anclar(
  'retail.fn_producto_historia(uuid)',
  $v$        + (select count(*) from retail.precios_sede_prenda x where x.producto_id = p_producto_id), false$v$,
  $n$        + (select count(*) from retail.precios_sede_prenda x where x.producto_id = p_producto_id), false
      -- ADR-0393: lo que una sede contó al recibir un envío y todavía no entró al stock (o volvió al borrador al reabrir); y lo
      -- separado en el borrador de un envío que se está contando, que nombra la prenda sin llave. Historia de la recepción.
      union all select 23, 'prendas anotadas al recibir un envío', count(*), false
        from retail.despacho_pendientes x where x.producto_id = p_producto_id
      union all select 24, 'prendas separadas en un envío que se está contando', count(*), false
        from retail.despacho_conteos k
        join retail.despachos d on d.id = k.despacho_id and d.estado = 'abierto'
       where k.separado -> 'prendas' @> jsonb_build_array(jsonb_build_object('producto_id', p_producto_id))$n$
);

-- Comprobación: si algo no quedó, la migración no se da por aplicada.
do $$
declare
  v_def text := pg_get_functiondef('retail.fn_producto_historia(uuid)'::regprocedure);
begin
  if position('from retail.despacho_pendientes x where x.producto_id = p_producto_id' in v_def) = 0
     or position($t$k.separado -> 'prendas' @> jsonb_build_array(jsonb_build_object('producto_id', p_producto_id))$t$ in v_def) = 0 then
    raise exception 'fn_producto_historia no quedó con los renglones de la recepción (23 y 24)';
  end if;
end;
$$;

reset lock_timeout;
