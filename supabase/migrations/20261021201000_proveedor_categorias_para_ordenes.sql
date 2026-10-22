-- Qué categorías maneja cada proveedor, para que «Nueva orden de compra» ofrezca primero lo suyo (2026-10-21, decisión de Felipe
-- después del informe `docs/pantallas/compras-ordenes-nueva.md`, tarea #6). Una sola parte, función de LECTURA, sin políticas.
--
-- POR QUÉ. Al elegir un proveedor, la orden mostraba TODO el catálogo (45 categorías y ~100 marcas mezcladas) aunque ese proveedor
-- solo trae unas pocas. Felipe: «el proveedor debería prefiltrar las categorías y marcas que maneja». Las marcas ya tienen su
-- vínculo (`marca_proveedores`, ~100 filas). Las categorías NO: no existe un vínculo proveedor↔categoría, y Felipe decidió que no se
-- cree uno a mano («sale de sus marcas y su historial»).
--
-- DECIDÍ: derivar el par (proveedor, categoría) de lo que ya existe, en una función de lectura, sin tabla nueva. Cuatro fuentes:
--   1. `productos` con proveedor: lo que ya se le puso a ese proveedor en el catálogo (sin rechazados ni pruebas).
--   2. `productos` SIN proveedor cuya marca la trae UN solo proveedor: la prenda es de ese proveedor aunque nadie lo escribió. Una
--      marca que traen dos proveedores no se atribuye a ninguno (sería adivinar).
--   3. `orden_compra_items` de órdenes `generada`: lo que se le pidió antes. Una orden anulada deja de contar sola (el par se
--      deriva, no se guarda: no hay nada que desactualizar).
--   4. `compra_items` de comprobantes `vigente`: lo que se le compró de verdad (categoría de la línea, o la del producto).
--   Guardar una orden ES el recuerdo de que ese proveedor ahora maneja esa categoría: no hace falta una casilla «Recordar».
-- DESCARTÉ: una tabla `proveedor_categorias` (una segunda verdad que alguien tendría que mantener; ~115 proveedores a capturar) y
-- leer `productos` crudo en el navegador (crece con el catálogo y no ve las órdenes: RLS sin políticas).
-- UNA FILA POR PROVEEDOR (con sus categorías en un arreglo) y no una por par: PostgREST corta toda lectura en 1.000 filas sin avisar
-- (`max_rows`), y los pares pueden llegar a ~5.900 (115 proveedores × 52 categorías); un proveedor por fila nunca pasa de ~115. Lo
-- encontró la revisión independiente del 2026-10-21.
-- SE ROMPE SI: muy pocos proveedores tienen alguna categoría derivada el día 1 (hay ~410 productos para ~115 proveedores y
-- `productos.proveedor_id` es opcional; medido el 2026-10-21 en solo lectura: 50 de 113 proveedores activos): el prefiltro se sentiría
-- roto para el resto. La web lo cubre mostrando TODO a un proveedor sin categorías («primera vez con este proveedor»), y la consulta de
-- cobertura del informe mide cuántos son. O si los proveedores pasan de 1.000 (la lectura volvería a cortarse).
--
-- PRODUCCIÓN. Una sola parte: crea UNA función (no toma candados sobre tablas ni sobre `auth`/`storage`; sin políticas). Re-pegable.
-- La web se puede publicar ANTES: sin esta función (PGRST202) la pantalla se ve como hoy, con todo el catálogo.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_proveedor_categorias()
returns table (proveedor_id uuid, categorias uuid[])
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  -- La misma puerta que el resto de Órdenes de compra: solo lo lee quien tiene el módulo.
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Ver las órdenes de compra necesita el módulo «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;

  return query
  select x.proveedor_id, array_agg(distinct x.categoria_id)
    from (
      -- 1. Lo que ya se le puso a ese proveedor en el catálogo.
      select p.proveedor_id, p.categoria_id
        from retail.productos p
       where p.proveedor_id is not null
         and p.estado_alta <> 'rechazado'
         and not p.es_prueba
      union all
      -- 2. Prendas sin proveedor cuya marca la trae un solo proveedor.
      select u.proveedor_id, p.categoria_id
        from retail.productos p
        join (
          select mp.marca_id, (array_agg(mp.proveedor_id))[1] as proveedor_id
            from retail.marca_proveedores mp
           group by mp.marca_id
          having count(*) = 1
        ) u on u.marca_id = p.marca_id
       where p.proveedor_id is null
         and p.estado_alta <> 'rechazado'
         and not p.es_prueba
      union all
      -- 3. Lo que se le pidió en órdenes que siguen vigentes.
      select o.proveedor_id, i.categoria_id
        from retail.ordenes_compra o
        join retail.orden_compra_items i on i.orden_compra_id = o.id
       where o.estado = 'generada'
      union all
      -- 4. Lo que se le compró (comprobantes vigentes): la categoría de la línea, o la de su producto.
      select c.proveedor_id, coalesce(ci.categoria_id, pr.categoria_id)
        from retail.compras c
        join retail.compra_items ci on ci.compra_id = c.id
        left join retail.productos pr on pr.id = ci.producto_id
       where c.estado = 'vigente'
    ) x
   where x.proveedor_id is not null
     and x.categoria_id is not null
   group by x.proveedor_id;
end;
$$;
revoke all on function retail.fn_proveedor_categorias() from public, anon;
grant execute on function retail.fn_proveedor_categorias() to authenticated;
comment on function retail.fn_proveedor_categorias() is
  'Por proveedor, las categorías que maneja (en un arreglo), derivadas de lo que ya existe: productos, marcas de un solo proveedor, órdenes generadas y comprobantes vigentes. Una fila por proveedor (la lectura no pasa del tope de 1.000 filas). Solo con el módulo Órdenes de compra. Para el prefiltro de Nueva orden (Felipe 2026-10-21).';
