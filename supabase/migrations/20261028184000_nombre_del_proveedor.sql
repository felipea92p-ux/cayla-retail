-- ADR-0556 (Felipe 2026-10-28): «Cómo lo llama el proveedor», un dato propio de la prenda.
--
-- EL PROBLEMA. El proveedor muchas veces ya le pone nombre a su prenda («Evaluna», «SS25 311») y las colaboradoras lo copian, porque así el
-- comprador sabe exactamente qué pedir. Pero no había dónde guardarlo: terminaba metido en el nombre («Krisstell Polo Evaluna») o en la
-- descripción, y si la prenda se llamaba de otra forma en la tienda (una flor, el estándar de ADR-0556), el dato del proveedor se perdía.
-- Ahora vive en su propia columna: si sirve como nombre, la pantalla lo ofrece primero («Polo Evaluna»); si no (un código, un «Blusa dama»),
-- queda igual guardado para compras.
--
-- Va en una función aparte (y no como un parámetro más de `crear_producto_con_stock_inicial` / `catalogo_actualizar_producto`) a propósito: esas
-- funciones son de las que preguntan el precio cero (ADR-0384) y se parchan solo con reemplazos anclados. Esta es chica, se llama después de crear o
-- de guardar la ficha, y si todavía no está en la base la pantalla sigue funcionando sin el dato (principio 9).
--
-- Se pega en producción tal cual. Sin políticas (ADR-0195): la columna se lee con el `select` de siempre de productos y se escribe solo por la función.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.productos add column if not exists nombre_proveedor text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'productos_nombre_proveedor_check' and conrelid = 'retail.productos'::regclass) then
    alter table retail.productos
      add constraint productos_nombre_proveedor_check
      check (nombre_proveedor is null or (btrim(nombre_proveedor) <> '' and char_length(nombre_proveedor) <= 80));
  end if;
end $$;

comment on column retail.productos.nombre_proveedor is
  'Cómo llama el proveedor a esta prenda («Evaluna», «SS25 311»), para que el comprador sepa qué pedir. Null = el proveedor no le puso nombre. '
  'No es el nombre de la tienda (`referencia`): ese puede ser el mismo o una flor (ADR-0556). Se escribe solo con fijar_nombre_proveedor.';

create or replace function retail.fijar_nombre_proveedor(p_producto_id uuid, p_nombre text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_nombre text := nullif(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')), '');
begin
  -- Quien ve Productos hace todo lo de Productos (ADR-0306); firma el responsable de turno, como todo lo que guarda (ADR-0161).
  if retail.fn_ve_modulo('productos') is not true then
    raise exception 'No tienes acceso a Productos.' using errcode = '42501', hint = 'sin_permiso';
  end if;
  perform retail.fn_actor_persona_id(true);

  if v_nombre is not null and char_length(v_nombre) > 80 then
    raise exception 'El nombre del proveedor es muy largo: 80 letras como máximo.' using hint = 'nombre_proveedor_largo';
  end if;

  update retail.productos set nombre_proveedor = v_nombre where id = p_producto_id;
  if not found then
    raise exception 'Esa prenda ya no existe. Recarga la pantalla.' using hint = 'producto_no_existe';
  end if;
end;
$$;

comment on function retail.fijar_nombre_proveedor(uuid, text) is
  'ADR-0556: guarda cómo llama el proveedor a la prenda (vacío = lo borra). Pide el módulo Productos y firma con el responsable de turno.';

revoke all on function retail.fijar_nombre_proveedor(uuid, text) from public;
grant execute on function retail.fijar_nombre_proveedor(uuid, text) to authenticated;
