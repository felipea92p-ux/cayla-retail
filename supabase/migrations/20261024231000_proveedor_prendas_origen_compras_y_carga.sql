-- Proveedores ▸ lo que le compré: DOS ORÍGENES que nunca se suman a escondidas (ADR-0502, actualización 2026-10-24 (b)).
--
-- POR QUÉ. Hoy todo el inventario vino por cargas iniciales («muchas veces hasta se distorsionaron los costos porque no había una correcta
-- comunicación con el área de compras», Felipe), y Compras entra en uso en unos días. La ficha tiene que poder decir qué llegó por medio de
-- Compras (con costo real) y qué viene de la carga (estimado, costo por confirmar). Reemplaza las funciones de 20261024221000 (ya pegada).
--
-- LOS DOS ORÍGENES (por prenda y por proveedor):
--   · COMPRAS (exacto): entradas con motivo 'recepcion'.
--       - Con factura (`compra_item_id`, compra vigente): proveedor de la factura y costo de la LÍNEA.
--       - Sin factura (un envío sin guía): proveedor del lote (`lotes.proveedor_id`) y costo de `costo_historial.costo_unitario_nuevo` de ese
--         movimiento; se cuentan aparte como «sin factura» (`unidades_sin_factura`).
--     Se atribuyen al proveedor de la factura o del lote, no al habitual de la prenda.
--   · CARGA INICIAL (estimado): solo para prendas cuyo habitual (`productos.proveedor_id`) es el proveedor, por variante:
--     greatest(entradas 'carga_inicial', vendido NETO + stock − todo lo recibido por 'recepcion'), al costo de la CARGA: el `costo_anterior`
--     del PRIMER registro de `costo_historial` de la variante o, si nunca cambió, `variantes.costo`. No el costo vigente: al recibir se
--     PROMEDIA `variantes.costo` (ADR-0362) y mezclaría el costo distorsionado con el real.
--   · No cuentan 'cambio', 'anulacion_venta', 'devolucion' ni nada de Producción.
-- VENDIDAS NETAS desde `movimientos` (salidas motivo venta o cambio, menos entradas motivo cambio, devolucion o anulacion_venta), para que
-- cuadren con el stock; el ingreso y el costo de lo vendido siguen saliendo de `venta_items` (ventas completadas, no de prueba).
-- TALLER APARTE: `fn_proveedor_es_taller` reconoce a «CAYLA SAC» (la producción propia) por su nombre; las lecturas lo marcan (`es_taller`) y
-- la web lo deja fuera del ranking y de los veredictos. Un solo lugar donde cambiarlo cuando exista el tipo de proveedor «Taller».
--
-- QUÉ NO HACE. No escribe nada: es solo lectura. Misma llave: `fn_ve_plata_de_proveedores()`.
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe): una sola parte, sin políticas, re-pegable; la base ANTES que la web.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

drop function if exists retail.fn_proveedores_prendas();
drop function if exists retail.fn_proveedores_rendimiento();
drop function if exists retail.fn_proveedor_prendas(uuid);
drop function if exists retail.fn_proveedor_prendas_base(uuid);

create or replace function retail.fn_proveedor_es_taller(p_proveedor_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
  select exists (select 1 from retail.proveedores p where p.id = p_proveedor_id and lower(btrim(p.nombre)) = 'cayla sac');
$function$;
revoke all on function retail.fn_proveedor_es_taller(uuid) from public, anon, authenticated;

create or replace function retail.fn_proveedor_prendas_base(p_proveedor_id uuid default null)
returns table (
  proveedor_id uuid,
  producto_id uuid,
  unidades_compradas integer,
  unidades_compras integer,
  unidades_sin_factura integer,
  unidades_carga integer,
  unidades_estimadas integer,
  gasto numeric,
  gasto_compras numeric,
  gasto_carga numeric,
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
  with costo_inicial as (
    select distinct on (ch.variante_id) ch.variante_id as vid, ch.costo_anterior as costo
    from retail.costo_historial ch
    order by ch.variante_id, ch.created_at, ch.id
  ),
  recepciones as (
    select m.id as mid, m.variante_id as vid, v.producto_id as pid, m.cantidad,
           (ci.id is not null) as de_factura,
           case when ci.id is not null then c.proveedor_id else l.proveedor_id end as prov,
           coalesce(ci.costo_unitario, ch.costo_unitario_nuevo, ci0.costo, v.costo) as costo,
           m.created_at::date as dia
    from retail.movimientos m
    join retail.variantes v on v.id = m.variante_id
    left join retail.compra_items ci on ci.id = m.compra_item_id
    left join retail.compras c on c.id = ci.compra_id
    left join retail.lotes l on l.id = m.lote_id
    left join lateral (
      select h.costo_unitario_nuevo from retail.costo_historial h where h.movimiento_id = m.id order by h.created_at limit 1
    ) ch on true
    left join costo_inicial ci0 on ci0.vid = m.variante_id
    where m.tipo = 'entrada' and m.motivo = 'recepcion' and m.produccion_id is null
      and (ci.id is null or c.estado = 'vigente')
  ),
  recibido_v as (
    select vid, sum(cantidad)::integer as uds from recepciones group by vid
  ),
  compras as (
    select prov, pid, sum(cantidad)::integer as uds, sum(cantidad) filter (where not de_factura)::integer as sin_factura,
           sum(cantidad * costo) as plata, min(dia) as primera, bool_or(de_factura) as con_factura
    from recepciones
    where prov is not null and (p_proveedor_id is null or prov = p_proveedor_id)
    group by prov, pid
  ),
  carga_ent as (
    select m.variante_id as vid, sum(m.cantidad)::integer as uds, min(m.created_at::date) as primera
    from retail.movimientos m
    where m.tipo = 'entrada' and m.motivo = 'carga_inicial' and m.produccion_id is null
    group by m.variante_id
  ),
  vendido_neto_v as (
    select m.variante_id as vid,
           sum(case when m.tipo = 'salida' and m.motivo in ('venta', 'cambio') then m.cantidad
                    when m.tipo = 'entrada' and m.motivo in ('cambio', 'devolucion', 'anulacion_venta') then -m.cantidad
                    else 0 end)::integer as uds
    from retail.movimientos m
    where (m.tipo = 'salida' and m.motivo in ('venta', 'cambio')) or (m.tipo = 'entrada' and m.motivo in ('cambio', 'devolucion', 'anulacion_venta'))
    group by m.variante_id
  ),
  stock_v as (
    select s.variante_id as vid, sum(s.cantidad)::integer as uds from retail.stock s group by s.variante_id
  ),
  carga_v as (
    select p.proveedor_id as prov, v.producto_id as pid,
           greatest(coalesce(e.uds, 0), coalesce(vn.uds, 0) + coalesce(sv.uds, 0) - coalesce(rv.uds, 0), 0) as uds,
           coalesce(ci0.costo, v.costo) as costo, coalesce(e.primera, v.created_at::date) as primera
    from retail.variantes v
    join retail.productos p on p.id = v.producto_id and p.proveedor_id is not null
      and p.id <> '11111111-1111-4111-8111-111111111111' -- la «Prenda sin registrar» (centinela, ADR-0179) no es una compra
    left join carga_ent e on e.vid = v.id
    left join vendido_neto_v vn on vn.vid = v.id
    left join stock_v sv on sv.vid = v.id
    left join recibido_v rv on rv.vid = v.id
    left join costo_inicial ci0 on ci0.vid = v.id
    where p_proveedor_id is null or p.proveedor_id = p_proveedor_id
  ),
  carga as (
    select prov, pid, sum(uds)::integer as uds, sum(uds * costo) as plata, min(primera) as primera
    from carga_v where uds > 0 group by prov, pid
  ),
  pares as (
    select prov, pid from compras union select prov, pid from carga
  ),
  vendidas as (
    select v.producto_id as pid, sum(vi.cantidad * (vi.precio_unitario - vi.descuento_unitario - coalesce(vi.descuento_club_unitario, 0))) as ingreso,
           sum(vi.cantidad * vi.costo_unitario) as costo, max(ve.created_at)::date as ultima
    from retail.venta_items vi
    join retail.ventas ve on ve.id = vi.venta_id and ve.estado = 'completada' and not ve.es_prueba
    join retail.variantes v on v.id = vi.variante_id
    where v.producto_id in (select pid from pares)
    group by v.producto_id
  ),
  vendidas_netas as (
    select v.producto_id as pid, sum(vn.uds)::integer as uds
    from vendido_neto_v vn join retail.variantes v on v.id = vn.vid
    where v.producto_id in (select pid from pares)
    group by v.producto_id
  ),
  en_stock as (
    select v.producto_id as pid, sum(sv.uds)::integer as uds
    from stock_v sv join retail.variantes v on v.id = sv.vid
    where v.producto_id in (select pid from pares)
    group by v.producto_id
  )
  select pa.prov, pa.pid,
         coalesce(co.uds, 0) + coalesce(ca.uds, 0),
         coalesce(co.uds, 0), coalesce(co.sin_factura, 0), coalesce(ca.uds, 0), coalesce(ca.uds, 0),
         coalesce(co.plata, 0) + coalesce(ca.plata, 0), coalesce(co.plata, 0), coalesce(ca.plata, 0),
         least(co.primera, ca.primera), coalesce(co.con_factura, false),
         greatest(coalesce(vnn.uds, 0), 0), coalesce(ve.ingreso, 0), coalesce(ve.costo, 0), ve.ultima, coalesce(st.uds, 0)
  from pares pa
  left join compras co on co.prov = pa.prov and co.pid = pa.pid
  left join carga ca on ca.prov = pa.prov and ca.pid = pa.pid
  left join vendidas ve on ve.pid = pa.pid
  left join vendidas_netas vnn on vnn.pid = pa.pid
  left join en_stock st on st.pid = pa.pid;
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
  unidades_compras integer,
  unidades_sin_factura integer,
  unidades_carga integer,
  unidades_estimadas integer,
  gasto numeric,
  gasto_compras numeric,
  gasto_carga numeric,
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
           b.unidades_compradas, b.unidades_compras, b.unidades_sin_factura, b.unidades_carga, b.unidades_estimadas,
           round(b.gasto, 2), round(b.gasto_compras, 2), round(b.gasto_carga, 2), round(b.gasto / nullif(b.unidades_compradas, 0), 2),
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
  'Ficha de proveedor (2026-10-24 b): por prenda, lo comprado en dos orígenes (Compras exacto con costo de factura o lote; Carga inicial estimada al costo de la carga), lo vendido neto, su margen y lo que queda. Solo lectura; llave: fn_ve_plata_de_proveedores().';

-- El ranking: una fila por proveedor. `plata_sin_venta` es DINERO: solo con lo de origen Compras (costo real); lo de la carga se cuenta en
-- unidades (`prendas_sin_venta`). `es_taller` lo marca para que la web lo ponga aparte.
create or replace function retail.fn_proveedores_rendimiento()
returns table (
  proveedor_id uuid,
  nombre text,
  es_taller boolean,
  prendas integer,
  unidades_compradas integer,
  unidades_compras integer,
  unidades_sin_factura integer,
  unidades_carga integer,
  unidades_estimadas integer,
  gasto numeric,
  gasto_compras numeric,
  gasto_carga numeric,
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
    select pv.id, pv.nombre, retail.fn_proveedor_es_taller(pv.id),
           count(*)::integer,
           sum(b.unidades_compradas)::integer,
           sum(b.unidades_compras)::integer,
           sum(b.unidades_sin_factura)::integer,
           sum(b.unidades_carga)::integer,
           sum(b.unidades_estimadas)::integer,
           round(sum(b.gasto), 2),
           round(sum(b.gasto_compras), 2),
           round(sum(b.gasto_carga), 2),
           sum(b.unidades_vendidas)::integer,
           round(sum(b.ingreso_vendido), 2),
           round(sum(b.costo_vendido), 2),
           round(sum(least(b.stock_actual, b.unidades_compradas) * (b.gasto / nullif(b.unidades_compradas, 0))), 2),
           (count(*) filter (where b.unidades_vendidas = 0))::integer,
           round(coalesce(sum(least(b.stock_actual, b.unidades_compras) * (b.gasto_compras / nullif(b.unidades_compras, 0))) filter (where b.unidades_vendidas = 0), 0), 2)
    from retail.fn_proveedor_prendas_base(null) b
    join retail.proveedores pv on pv.id = b.proveedor_id
    group by pv.id, pv.nombre
    order by sum(b.gasto) desc nulls last, pv.nombre;
end;
$function$;

revoke all on function retail.fn_proveedores_rendimiento() from public, anon;
grant execute on function retail.fn_proveedores_rendimiento() to authenticated;
comment on function retail.fn_proveedores_rendimiento() is
  'Lista de proveedores (2026-10-24 b): por proveedor, gasto por origen (Compras / Carga inicial), vendido neto, plata en estantes y plata sin vender (solo origen Compras). La misma cuenta que fn_proveedor_prendas. Solo lectura; llave: fn_ve_plata_de_proveedores().';

create or replace function retail.fn_proveedores_prendas()
returns table (
  proveedor_id uuid,
  proveedor text,
  es_taller boolean,
  producto_id uuid,
  referencia text,
  codigo text,
  marca text,
  categoria text,
  unidades_compradas integer,
  unidades_compras integer,
  unidades_sin_factura integer,
  unidades_carga integer,
  unidades_estimadas integer,
  gasto numeric,
  gasto_compras numeric,
  gasto_carga numeric,
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
    select b.proveedor_id, pv.nombre, retail.fn_proveedor_es_taller(pv.id), pr.id, pr.referencia, pr.codigo, ma.nombre, ca.nombre,
           b.unidades_compradas, b.unidades_compras, b.unidades_sin_factura, b.unidades_carga, b.unidades_estimadas,
           round(b.gasto, 2), round(b.gasto_compras, 2), round(b.gasto_carga, 2), round(b.gasto / nullif(b.unidades_compradas, 0), 2),
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
  'Análisis de proveedores (2026-10-24 b): una fila por (proveedor, prenda) con los dos orígenes, lo vendido neto y lo que queda. Solo lectura; llave: fn_ve_plata_de_proveedores().';
