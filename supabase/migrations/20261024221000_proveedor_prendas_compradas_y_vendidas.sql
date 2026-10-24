-- Proveedores ▸ qué prendas le compré a cada proveedor, cuánto gasté y cuánto de eso ya se vendió: la ficha de UNO
-- (`fn_proveedor_prendas`) y el ranking de TODOS (`fn_proveedores_rendimiento`), las dos sobre la misma cuenta.
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
-- UNA SOLA CUENTA. `fn_proveedor_prendas_base` (sin permiso para nadie: solo la llaman las dos de arriba, que sí exigen la llave)
-- calcula por (proveedor, prenda); la ficha la filtra y el ranking la suma. Si una misma prenda se le compró a dos proveedores
-- (una factura de otro), su stock y sus ventas se muestran enteros en los dos: es la prenda, no el proveedor, la que se vendió.
--
-- QUÉ NO HACE. No escribe nada: es solo lectura. No mezcla insumos del Taller (son otro negocio, ADR-0111).
--
-- QUIÉN LA LEE. Con la misma llave que el resto de la plata de la ficha: `fn_ve_plata_de_proveedores()`.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe): una sola parte, sin políticas, re-pegable; la base ANTES que la web.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_proveedor_prendas_base(p_proveedor_id uuid default null)
returns table (
  proveedor_id uuid,
  producto_id uuid,
  unidades_compradas integer,
  gasto numeric,
  primera_entrada date,
  con_factura boolean,
  unidades_vendidas integer,
  ingreso_vendido numeric,
  costo_vendido numeric,
  ultima_venta date,
  stock_actual integer
)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
  with entradas as (
    select case when ci.id is not null then c.proveedor_id else p.proveedor_id end as prov,
           v.producto_id as pid,
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
        (ci.id is not null and c.estado = 'vigente')
        or (ci.id is null and m.motivo in ('carga_inicial', 'recepcion'))
      )
  ),
  compradas as (
    select prov, pid, sum(uds)::integer as uds, sum(plata) as plata, min(dia) as primera, bool_or(de_factura) as con_factura
    from entradas
    where prov is not null and (p_proveedor_id is null or prov = p_proveedor_id)
    group by prov, pid
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
  select c.prov, c.pid, c.uds, c.plata, c.primera, c.con_factura,
         coalesce(ve.uds, 0), coalesce(ve.ingreso, 0), coalesce(ve.costo, 0), ve.ultima, coalesce(st.uds, 0)
  from compradas c
  left join vendidas ve on ve.pid = c.pid
  left join en_stock st on st.pid = c.pid;
$function$;
revoke all on function retail.fn_proveedor_prendas_base(uuid) from public, anon, authenticated;

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
    select pr.id, pr.referencia, pr.codigo, ma.nombre, ca.nombre,
           b.unidades_compradas, round(b.gasto, 2), round(b.gasto / nullif(b.unidades_compradas, 0), 2),
           b.unidades_vendidas, round(b.ingreso_vendido, 2), round(b.costo_vendido, 2),
           b.stock_actual, b.primera_entrada, b.ultima_venta, b.con_factura
    from retail.fn_proveedor_prendas_base(p_proveedor_id) b
    join retail.productos pr on pr.id = b.producto_id
    left join retail.marcas ma on ma.id = pr.marca_id
    left join retail.categorias ca on ca.id = pr.categoria_id
    order by b.gasto desc nulls last, pr.referencia;
end;
$function$;

revoke all on function retail.fn_proveedor_prendas(uuid) from public, anon;
grant execute on function retail.fn_proveedor_prendas(uuid) to authenticated;
comment on function retail.fn_proveedor_prendas(uuid) is
  'Ficha de proveedor (2026-10-24): por prenda, lo comprado (entradas de inventario al costo de la prenda; las líneas de factura mandan cuando existen), lo vendido, su margen real y lo que queda. Solo lectura; la llave es fn_ve_plata_de_proveedores().';

-- El ranking: una fila por proveedor al que se le compró algo. «Sin vender» = prendas de las que no se vendió ni una unidad, y su plata
-- = lo que queda en estantes de ellas al costo de la prenda. El stock que se cuenta nunca pasa de lo comprado (lo demás entró por otra vía).
create or replace function retail.fn_proveedores_rendimiento()
returns table (
  proveedor_id uuid,
  nombre text,
  prendas integer,
  unidades_compradas integer,
  gasto numeric,
  unidades_vendidas integer,
  ingreso_vendido numeric,
  costo_vendido numeric,
  plata_en_stock numeric,
  prendas_sin_venta integer,
  plata_sin_venta numeric
)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
begin
  if not retail.fn_ve_plata_de_proveedores() then
    raise exception 'El rendimiento de los proveedores necesita Proveedores, Facturas de compra, Por pagar o Notas de crédito en tu rol.' using errcode = '42501';
  end if;
  return query
    select pv.id, pv.nombre,
           count(*)::integer,
           sum(b.unidades_compradas)::integer,
           round(sum(b.gasto), 2),
           sum(b.unidades_vendidas)::integer,
           round(sum(b.ingreso_vendido), 2),
           round(sum(b.costo_vendido), 2),
           round(sum(least(b.stock_actual, b.unidades_compradas) * (b.gasto / nullif(b.unidades_compradas, 0))), 2),
           (count(*) filter (where b.unidades_vendidas = 0))::integer,
           round(coalesce(sum(least(b.stock_actual, b.unidades_compradas) * (b.gasto / nullif(b.unidades_compradas, 0))) filter (where b.unidades_vendidas = 0), 0), 2)
    from retail.fn_proveedor_prendas_base(null) b
    join retail.proveedores pv on pv.id = b.proveedor_id
    group by pv.id, pv.nombre
    order by sum(b.gasto) desc nulls last, pv.nombre;
end;
$function$;

revoke all on function retail.fn_proveedores_rendimiento() from public, anon;
grant execute on function retail.fn_proveedores_rendimiento() to authenticated;
comment on function retail.fn_proveedores_rendimiento() is
  'Lista de proveedores (2026-10-24): por proveedor, gasto, vendido, margen, plata en estantes y plata en prendas que no se vendieron. La misma cuenta que fn_proveedor_prendas. Solo lectura; llave: fn_ve_plata_de_proveedores().';
