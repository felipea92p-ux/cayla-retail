-- Proveedores ▸ qué prendas le compré a cada proveedor, cuánto gasté y cuánto de eso ya se vendió: la ficha de UNO
-- (`fn_proveedor_prendas`), el ranking de TODOS (`fn_proveedores_rendimiento`) y las filas para el análisis «Lo que quizá no ves»
-- (`fn_proveedores_prendas`), las tres sobre la misma cuenta (`fn_proveedor_prendas_base`).
--
-- POR QUÉ. La ficha del proveedor solo sabía de facturas (`compra_items`), y en producción las 9 facturas vigentes no tienen líneas con
-- unidades: lo que de verdad entró a la tienda entró como `movimientos` de tipo 'entrada' (carga inicial y recepciones), y ni así alcanza:
-- parte de la mercadería llegó sin quedar como entrada (Textil Anqori: 87 entradas, pero 115 en stock y 19 vendidas). Felipe 2026-10-24:
-- «compré = el mayor entre las entradas y (vendido + stock actual), marcado como "estimado" cuando difiera; y cuando haya facturas con
-- líneas se usan esas».
--
-- QUÉ CUENTA COMO «COMPRADO» (una sola vez, nunca dos):
--   · una entrada con `compra_item_id` → la línea de factura manda, EXACTA: unidades y costo_unitario de la factura (solo si la compra
--     está vigente), y el proveedor es el de la factura;
--   · lo demás, prenda a prenda (cada variante): el mayor entre sus entradas sin factura (motivo 'carga_inicial' o 'recepcion') y
--     (lo vendido + el stock actual de esa variante). Las unidades de entrada valen al costo vigente de la variante (`variantes.costo`;
--     el histórico por compra no existe todavía) y las que se reconstruyen (lo que sobra sobre las entradas) también. Esas son
--     `unidades_estimadas`: la pantalla las marca «estimado». El proveedor es el de la prenda (`productos.proveedor_id`);
--   · no cuentan 'cambio', 'anulacion_venta', 'devolucion' ni nada hecho por Producción: no son compras a un proveedor.
--
-- QUÉ NO HACE. No escribe nada: es solo lectura. No mezcla insumos del Taller (son otro negocio, ADR-0111).
--
-- UNA SOLA CUENTA. `fn_proveedor_prendas_base` (sin permiso para nadie: solo la llaman las otras, que sí exigen la llave) calcula por
-- (proveedor, prenda). Si una misma prenda se le compró a dos proveedores (una factura de otro), su stock y sus ventas se muestran
-- enteros en los dos: es la prenda, no el proveedor, la que se vendió.
--
-- QUIÉN LA LEE. Con la misma llave que el resto de la plata de la ficha: `fn_ve_plata_de_proveedores()`.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe): una sola parte, sin políticas, re-pegable; la base ANTES que la web.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Las funciones son nuevas (aún no están en producción): se recrean si ya existían con otra forma de salida.
drop function if exists retail.fn_proveedores_prendas();
drop function if exists retail.fn_proveedores_rendimiento();
drop function if exists retail.fn_proveedor_prendas(uuid);
drop function if exists retail.fn_proveedor_prendas_base(uuid);

create or replace function retail.fn_proveedor_prendas_base(p_proveedor_id uuid default null)
returns table (
  proveedor_id uuid,
  producto_id uuid,
  unidades_compradas integer,
  unidades_estimadas integer,
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
  with de_factura as (
    -- Exactas: la línea de una factura vigente.
    select c.proveedor_id as prov, v.producto_id as pid,
           sum(m.cantidad)::integer as uds, 0 as est, sum(m.cantidad * ci.costo_unitario) as plata, min(m.created_at::date) as primera, true as con_factura
    from retail.movimientos m
    join retail.compra_items ci on ci.id = m.compra_item_id
    join retail.compras c on c.id = ci.compra_id and c.estado = 'vigente'
    join retail.variantes v on v.id = m.variante_id
    where m.tipo = 'entrada' and m.produccion_id is null
      and (p_proveedor_id is null or c.proveedor_id = p_proveedor_id)
    group by c.proveedor_id, v.producto_id
  ),
  entradas_sin_factura as (
    select m.variante_id as vid, sum(m.cantidad)::integer as uds, min(m.created_at::date) as primera
    from retail.movimientos m
    where m.tipo = 'entrada' and m.produccion_id is null and m.compra_item_id is null
      and m.motivo in ('carga_inicial', 'recepcion')
    group by m.variante_id
  ),
  vendidas_v as (
    select vi.variante_id as vid, sum(vi.cantidad)::integer as uds
    from retail.venta_items vi
    join retail.ventas ve on ve.id = vi.venta_id and ve.estado = 'completada' and not ve.es_prueba
    group by vi.variante_id
  ),
  stock_v as (
    select s.variante_id as vid, sum(s.cantidad)::integer as uds from retail.stock s group by s.variante_id
  ),
  por_variante as (
    -- El mayor entre las entradas y (vendido + stock): lo que sobra sobre las entradas es estimado.
    select p.proveedor_id as prov, v.producto_id as pid,
           greatest(coalesce(e.uds, 0), coalesce(vv.uds, 0) + coalesce(sv.uds, 0)) as comprado,
           greatest(coalesce(vv.uds, 0) + coalesce(sv.uds, 0) - coalesce(e.uds, 0), 0) as estimado,
           v.costo as costo, coalesce(e.primera, v.created_at::date) as primera
    from retail.variantes v
    join retail.productos p on p.id = v.producto_id and p.proveedor_id is not null
      and p.id <> '11111111-1111-4111-8111-111111111111' -- la «Prenda sin registrar» (centinela, ADR-0179) no es una compra
    left join entradas_sin_factura e on e.vid = v.id
    left join vendidas_v vv on vv.vid = v.id
    left join stock_v sv on sv.vid = v.id
    where p_proveedor_id is null or p.proveedor_id = p_proveedor_id
  ),
  sin_factura as (
    select prov, pid, sum(comprado)::integer as uds, sum(estimado)::integer as est, sum(comprado * costo) as plata, min(primera) as primera, false as con_factura
    from por_variante where comprado > 0 group by prov, pid
  ),
  compradas as (
    select prov, pid, sum(uds)::integer as uds, sum(est)::integer as est, sum(plata) as plata, min(primera) as primera, bool_or(con_factura) as con_factura
    from (select * from de_factura union all select * from sin_factura) t
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
  select c.prov, c.pid, c.uds, c.est, c.plata, c.primera, c.con_factura,
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
  unidades_estimadas integer,
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
           b.unidades_compradas, b.unidades_estimadas, round(b.gasto, 2), round(b.gasto / nullif(b.unidades_compradas, 0), 2),
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
  'Ficha de proveedor (2026-10-24): por prenda, lo comprado (el mayor entre las entradas y vendido + stock; lo que sobra es estimado; las líneas de factura mandan cuando existen), lo vendido, su margen real y lo que queda. Solo lectura; la llave es fn_ve_plata_de_proveedores().';

-- El ranking: una fila por proveedor al que se le compró algo. «Sin vender» = prendas de las que no se vendió ni una unidad, y su plata
-- = lo que queda en estantes de ellas al costo de la prenda. El stock que se cuenta nunca pasa de lo comprado.
create or replace function retail.fn_proveedores_rendimiento()
returns table (
  proveedor_id uuid,
  nombre text,
  prendas integer,
  unidades_compradas integer,
  unidades_estimadas integer,
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
           sum(b.unidades_estimadas)::integer,
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

-- El análisis «Lo que quizá no ves»: las mismas filas por (proveedor, prenda) de TODOS los proveedores, para que la web juzgue con reglas
-- puras y probadas (lib/proveedor-analisis-reglas.ts). Son unos cientos de filas: no hace falta resumirlas aquí.
create or replace function retail.fn_proveedores_prendas()
returns table (
  proveedor_id uuid,
  proveedor text,
  producto_id uuid,
  referencia text,
  codigo text,
  marca text,
  categoria text,
  unidades_compradas integer,
  unidades_estimadas integer,
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
    raise exception 'El análisis de los proveedores necesita Proveedores, Facturas de compra, Por pagar o Notas de crédito en tu rol.' using errcode = '42501';
  end if;
  return query
    select b.proveedor_id, pv.nombre, pr.id, pr.referencia, pr.codigo, ma.nombre, ca.nombre,
           b.unidades_compradas, b.unidades_estimadas, round(b.gasto, 2), round(b.gasto / nullif(b.unidades_compradas, 0), 2),
           b.unidades_vendidas, round(b.ingreso_vendido, 2), round(b.costo_vendido, 2),
           b.stock_actual, b.primera_entrada, b.ultima_venta, b.con_factura
    from retail.fn_proveedor_prendas_base(null) b
    join retail.proveedores pv on pv.id = b.proveedor_id
    join retail.productos pr on pr.id = b.producto_id
    left join retail.marcas ma on ma.id = pr.marca_id
    left join retail.categorias ca on ca.id = pr.categoria_id
    order by pv.nombre, b.gasto desc nulls last, pr.referencia;
end;
$function$;

revoke all on function retail.fn_proveedores_prendas() from public, anon;
grant execute on function retail.fn_proveedores_prendas() to authenticated;
comment on function retail.fn_proveedores_prendas() is
  'Análisis de proveedores (2026-10-24): una fila por (proveedor, prenda) con lo comprado, lo vendido y lo que queda. Solo lectura; llave: fn_ve_plata_de_proveedores().';
