-- Proveedores ▸ ficha: qué prendas le compré a este proveedor, cuánto gasté y cuánto de eso ya se vendió.
--
-- POR QUÉ. La ficha del proveedor solo sabía de facturas (`compra_items`), y en producción las 9 facturas vigentes no
-- tienen líneas con unidades: lo que de verdad entró a la tienda entró como `movimientos` de tipo 'entrada' (carga
-- inicial y recepciones). Felipe 2026-10-24: «compré = entradas de inventario valorizadas al costo de la prenda, y cuando
-- haya facturas con líneas se usan esas».
--
-- QUÉ CUENTA COMO «COMPRADO» (una sola vez, nunca dos):
--   · una entrada con `compra_item_id` → la línea de factura manda: unidades y costo_unitario de la factura (solo si la
--     compra está vigente), y el proveedor es el de la factura;
--   · una entrada sin factura con motivo 'carga_inicial' o 'recepcion' → unidades de la entrada al costo VIGENTE de la
--     variante (`variantes.costo`; el histórico por compra no existe todavía), y el proveedor es el de la prenda
--     (`productos.proveedor_id`);
--   · no cuentan 'cambio', 'anulacion_venta', 'devolucion' ni nada hecho por Producción: no son compras a un proveedor.
--
-- QUÉ NO HACE. No escribe nada: es solo lectura. No mezcla insumos del Taller (son otro negocio, ADR-0111).
--
-- QUIÉN LA LEE. Con la misma llave que el resto de la plata de la ficha: `fn_ve_plata_de_proveedores()`.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe): una sola parte, sin políticas, re-pegable; la base ANTES que la web.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_proveedor_prendas(p_proveedor_id uuid)
returns table (
  producto_id uuid,
  referencia text,
  codigo text,
  marca text,
  categoria text,
  unidades_compradas integer,
  gasto numeric,
  costo_promedio numeric,
  unidades_vendidas integer,
  ingreso_vendido numeric,
  costo_vendido numeric,
  stock_actual integer,
  primera_entrada date,
  ultima_venta date,
  con_factura boolean
)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
begin
  if not retail.fn_ve_plata_de_proveedores() then
    raise exception 'Lo que le compraste a un proveedor necesita Proveedores, Facturas de compra, Por pagar o Notas de crédito en tu rol.' using errcode = '42501';
  end if;
  return query
    with entradas as (
      select v.producto_id as pid,
             m.cantidad as uds,
             m.cantidad * coalesce(ci.costo_unitario, v.costo) as plata,
             m.created_at::date as dia,
             (ci.id is not null) as de_factura
      from retail.movimientos m
      join retail.variantes v on v.id = m.variante_id
      join retail.productos p on p.id = v.producto_id
      left join retail.compra_items ci on ci.id = m.compra_item_id
      left join retail.compras c on c.id = ci.compra_id
      where m.tipo = 'entrada'
        and m.produccion_id is null
        and (
          (ci.id is not null and c.proveedor_id = p_proveedor_id and c.estado = 'vigente')
          or (ci.id is null and m.motivo in ('carga_inicial', 'recepcion') and p.proveedor_id = p_proveedor_id)
        )
    ),
    compradas as (
      select pid, sum(uds)::integer as uds, sum(plata) as plata, min(dia) as primera, bool_or(de_factura) as con_factura
      from entradas group by pid
    ),
    vendidas as (
      select v.producto_id as pid, sum(vi.cantidad)::integer as uds,
             sum(vi.cantidad * (vi.precio_unitario - vi.descuento_unitario - coalesce(vi.descuento_club_unitario, 0))) as ingreso,
             sum(vi.cantidad * vi.costo_unitario) as costo,
             max(ve.created_at)::date as ultima
      from retail.venta_items vi
      join retail.ventas ve on ve.id = vi.venta_id and ve.estado = 'completada' and not ve.es_prueba
      join retail.variantes v on v.id = vi.variante_id
      where v.producto_id in (select pid from compradas)
      group by v.producto_id
    ),
    en_stock as (
      select v.producto_id as pid, sum(s.cantidad)::integer as uds
      from retail.stock s
      join retail.variantes v on v.id = s.variante_id
      where v.producto_id in (select pid from compradas)
      group by v.producto_id
    )
    select pr.id, pr.referencia, pr.codigo, ma.nombre, ca.nombre,
           c.uds, round(c.plata, 2), round(c.plata / nullif(c.uds, 0), 2),
           coalesce(ve.uds, 0), round(coalesce(ve.ingreso, 0), 2), round(coalesce(ve.costo, 0), 2),
           coalesce(st.uds, 0), c.primera, ve.ultima, c.con_factura
    from compradas c
    join retail.productos pr on pr.id = c.pid
    left join retail.marcas ma on ma.id = pr.marca_id
    left join retail.categorias ca on ca.id = pr.categoria_id
    left join vendidas ve on ve.pid = c.pid
    left join en_stock st on st.pid = c.pid
    order by c.plata desc nulls last, pr.referencia;
end;
$function$;

revoke all on function retail.fn_proveedor_prendas(uuid) from public, anon;
grant execute on function retail.fn_proveedor_prendas(uuid) to authenticated;
comment on function retail.fn_proveedor_prendas(uuid) is
  'Ficha de proveedor (2026-10-24): por prenda, lo comprado (entradas de inventario al costo de la prenda; las líneas de factura mandan cuando existen), lo vendido, su margen real y lo que queda. Solo lectura; la llave es fn_ve_plata_de_proveedores().';
