-- ADR-0644 · La marca primero en Compras (Felipe 2026-11-11: «muchas veces no se conoce al proveedor sino la marca»).
--
-- Una sola función NUEVA, de solo lectura: dada una página de compras (comprobantes de Historial y Por pagar) o de papeles de «Mis compras»,
-- devuelve las marcas de cada una. Las pantallas las ponen como título de la fila y la razón social baja a la línea de abajo.
-- No toca ninguna función viva ni ninguna tabla: las listas siguen saliendo de `listar_compras`, `listar_compras_operativo`,
-- `listar_por_pagar` y `fn_mi_plata_compras` como hoy, y la pantalla le suma las marcas aparte. Si esta función no está (la web llegó antes
-- que la migración), las filas se ven como antes, con la razón social.
--
-- Por qué una función y no una lectura directa: `compra_items` solo la lee quien ve el dinero de Compras y `orden_compra_items` no tiene
-- políticas (solo se lee por funciones). La marca no es dinero: la ve quien ve cualquier pantalla de Compras.
--
-- De dónde sale la marca de una línea de comprobante: su `marca_id` (las que vienen de una orden «por categoría + marca», ADR-0362), o la de
-- su línea de orden, o la de su prenda del catálogo. De un papel de «Mis compras»: las líneas de sus órdenes.
--
-- Para pegar en producción: tal cual, en una sola pasada (no tiene políticas ni toca tablas en uso).

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.fn_marcas_de_compras(p_compras uuid[] default '{}', p_papeles uuid[] default '{}')
returns table (id uuid, marcas text[])
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not (retail.fn_ve_modulo('facturas_compra') or retail.fn_ve_modulo('por_pagar') or retail.fn_ve_modulo('fondos')
          or retail.fn_ve_modulo('ordenes_compra')) then
    raise exception 'No tienes acceso a Compras' using errcode = '42501', hint = 'marcas_sin_acceso';
  end if;
  -- Una página de la pantalla trae decenas de filas; un tope evita que alguien pida la base entera de una vez.
  if coalesce(cardinality(p_compras), 0) + coalesce(cardinality(p_papeles), 0) > 500 then
    raise exception 'Demasiadas compras a la vez' using errcode = '22023', hint = 'marcas_demasiadas';
  end if;

  return query
  select c.id, array_agg(distinct m.nombre order by m.nombre)
    from unnest(coalesce(p_compras, '{}')) as c(id)
    join retail.compra_items i on i.compra_id = c.id
    left join retail.orden_compra_items oi on oi.id = i.orden_compra_item_id
    left join retail.productos pr on pr.id = i.producto_id
    join retail.marcas m on m.id = coalesce(i.marca_id, oi.marca_id, pr.marca_id)
   group by c.id
  union all
  select p.id, array_agg(distinct m.nombre order by m.nombre)
    from unnest(coalesce(p_papeles, '{}')) as p(id)
    join retail.ordenes_compra o on o.papel_id = p.id
    join retail.orden_compra_items oi on oi.orden_compra_id = o.id
    join retail.marcas m on m.id = oi.marca_id
   group by p.id;
end $$;

comment on function retail.fn_marcas_de_compras(uuid[], uuid[]) is
  'ADR-0644: las marcas de cada compra (comprobante) o papel de Mis compras, para mostrarlas como título de la fila. Solo lectura.';

revoke all on function retail.fn_marcas_de_compras(uuid[], uuid[]) from public, anon;
grant execute on function retail.fn_marcas_de_compras(uuid[], uuid[]) to authenticated;
