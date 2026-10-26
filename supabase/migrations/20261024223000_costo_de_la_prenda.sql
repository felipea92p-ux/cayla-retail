-- ============================================================================
-- 20261024223000_costo_de_la_prenda.sql
-- La pestaña «Costo» del Historial de la prenda: cuánto cuesta hoy y qué compras lo movieron (Felipe, 2026-10-24)
--
-- EL PROBLEMA PRIMERO. Desde ADR-0067 cada compra y cada cierre del Taller que entra prendas con costo deja una fila por
-- variante en `costo_historial` (cuántas había y a cuánto, cuántas llegaron y a cuánto, en cuánto quedó). Pero nadie lo
-- muestra: el Historial (`fn_historial_prenda`) solo lee `historial_producto_cambios`, y `fn_costo_historial` es por
-- variante, sin ninguna pantalla. Felipe quiere ver, por PRENDA, cuándo y cuánto cambió el costo y cuántas prendas había
-- con el costo anterior y cuántas llegaron con el nuevo (maqueta: docs/maquetas/costo-historial-2026-10/v2-escalera-amigable.html).
--
-- QUÉ PROMETE. `fn_costo_de_la_prenda(p_producto_id)` devuelve un jsonb, o null si la cuenta no ve el dinero de compras
-- (`fn_puede_ver_dinero_de_compras`, la misma regla que esconde el costo en el Historial):
--   { compras: [ { fecha, origen, llegaron, costo_llegaron, ya_habia, costo_antes, costo_despues, documento, proveedor,
--                  persona } … del más viejo al más nuevo ],
--     hoy:     { stock, costo },
--     inicio:  { fecha, costo } }
--   · Una «compra» es lo que se escribió junto: las filas de `costo_historial` de una misma transacción (mismo `created_at`).
--     Una recepción contra dos facturas del mismo proveedor es UNA compra con los dos documentos.
--   · Todo es de la PRENDA, no de una variante: `ya_habia` es el stock de todas sus variantes justo antes; `costo_antes` y
--     `costo_despues`, lo que vale ese stock dividido entre sus prendas, antes y después. Como el valor se suma, la cuenta
--     que muestra la pantalla cierra exacta: ya_habia × costo_antes + llegaron × costo_llegaron = (ya_habia + llegaron) ×
--     costo_despues (salvo el redondeo a céntimos de cada variante, que ya hace `fn_recalcular_costo_variante`).
--   · El stock de una variante que NO llegó en esa compra se reconstruye desde `movimientos` (la fuente de verdad,
--     principio 4): entradas suman, salidas restan, ajustes con su signo; traslados y apartados no cambian el total. El de
--     las que llegaron es el `stock_previo` que usó el cálculo real.
--   · El costo de una variante antes de su primera compra es el DECLARADO: el `costo_anterior` de su primera fila, o su
--     costo de hoy si nunca tuvo compras (un costo declarado solo se edita para corregirlo, 20260927190000: el arreglo vale
--     desde el principio).
--
-- QUÉ NO HACE. No escribe nada ni cambia ninguna función existente. No muestra los errores de costo arreglados (actividad 3)
-- ni cuántas quedan hoy de cada compra (actividad 4).
--
-- PARA PEGAR EN PRODUCCIÓN: trae `set search_path` y el prefijo `retail.`; no toca políticas (sin riesgo de deadlock, ADR-0195).
-- CÓMO SE DESHACE: drop function if exists retail.fn_costo_de_la_prenda(uuid);
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.fn_costo_de_la_prenda(p_producto_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
  with vars as (
    select v.id, v.costo from retail.variantes v where v.producto_id = p_producto_id
  ),
  filas as (
    select ch.created_at, ch.variante_id, ch.stock_previo, ch.costo_anterior, ch.cantidad_nueva, ch.costo_unitario_nuevo,
           ch.costo_resultante, ch.origen, ch.usuario_id, m.lote_id, m.compra_item_id, m.produccion_id
      from retail.costo_historial ch
      join retail.movimientos m on m.id = ch.movimiento_id
     where ch.variante_id in (select id from vars)
  ),
  -- Una variante puede llegar dos veces en la misma compra (dos facturas): se juntan. La primera fila es la de menor
  -- stock_previo (cada línea suma al stock antes de calcular la siguiente) y la última, la de mayor.
  por_variante as (
    select created_at, variante_id,
           sum(cantidad_nueva) as llegan,
           sum(cantidad_nueva * costo_unitario_nuevo) as valor_llega,
           (array_agg(stock_previo order by stock_previo))[1] as stock_previo,
           (array_agg(costo_anterior order by stock_previo))[1] as costo_anterior,
           (array_agg(costo_resultante order by stock_previo desc))[1] as costo_resultante
      from filas
     group by created_at, variante_id
  ),
  eventos as (
    select f.created_at,
           case when bool_or(f.origen = 'produccion') then 'produccion' else 'compra' end as origen,
           (select string_agg(distinct d.doc, ' · ')
              from filas f2
              left join retail.compra_items ci on ci.id = f2.compra_item_id
              left join retail.compras cp on cp.id = ci.compra_id
              left join retail.lotes lo on lo.id = f2.lote_id
              left join retail.producciones pr on pr.id = f2.produccion_id
              cross join lateral (select coalesce(
                  nullif(btrim(concat_ws('-', cp.serie, cp.numero)), ''),
                  case when pr.id is not null then 'Orden ' || coalesce(pr.numero::text, '') end,
                  nullif(btrim(lo.numero_guia), '')) as doc) d
             where f2.created_at = f.created_at) as documento,
           (select string_agg(distinct pv.nombre, ' · ')
              from filas f2
              left join retail.compra_items ci on ci.id = f2.compra_item_id
              left join retail.compras cp on cp.id = ci.compra_id
              left join retail.lotes lo on lo.id = f2.lote_id
              join retail.proveedores pv on pv.id = coalesce(cp.proveedor_id, lo.proveedor_id)
             where f2.created_at = f.created_at) as proveedor,
           (array_agg(f.usuario_id) filter (where f.usuario_id is not null))[1] as usuario_id
      from filas f
     group by f.created_at
  ),
  -- El costo declarado de cada variante (antes de su primera compra).
  declarado as (
    select v.id,
           coalesce((select f.costo_anterior from filas f where f.variante_id = v.id order by f.created_at, f.stock_previo limit 1),
                    v.costo, 0) as costo
      from vars v
  ),
  -- Cada compra × cada variante de la prenda: cuántas había, a cuánto, cuántas llegaron y en cuánto quedó.
  cruce as (
    select e.created_at, v.id as variante_id,
           coalesce(pv.stock_previo, greatest(0, (
             select coalesce(sum(case m.tipo when 'entrada' then m.cantidad when 'salida' then -m.cantidad
                                             when 'ajuste' then m.cantidad else 0 end), 0)
               from retail.movimientos m
              where m.variante_id = v.id and m.created_at < e.created_at)))::numeric as stock_antes,
           coalesce(pv.costo_anterior,
                    (select f.costo_resultante from filas f
                      where f.variante_id = v.id and f.created_at < e.created_at
                      order by f.created_at desc, f.stock_previo desc limit 1),
                    d.costo) as costo_antes,
           coalesce(pv.llegan, 0) as llegan,
           coalesce(pv.valor_llega, 0) as valor_llega,
           pv.costo_resultante
      from eventos e
     cross join vars v
      join declarado d on d.id = v.id
      left join por_variante pv on pv.created_at = e.created_at and pv.variante_id = v.id
  ),
  compras as (
    select e.created_at, e.origen, e.documento, e.proveedor,
           nullif(btrim(coalesce(per.nombres, '') || ' ' || coalesce(per.apellidos, '')), '') as persona,
           sum(c.llegan)::int as llegaron,
           round(sum(c.valor_llega) / nullif(sum(c.llegan), 0), 2) as costo_llegaron,
           sum(c.stock_antes)::int as ya_habia,
           round(sum(c.stock_antes * c.costo_antes) / nullif(sum(c.stock_antes), 0), 2) as costo_antes,
           round(sum((c.stock_antes + c.llegan) * coalesce(c.costo_resultante, c.costo_antes))
                 / nullif(sum(c.stock_antes + c.llegan), 0), 2) as costo_despues
      from eventos e
      join cruce c on c.created_at = e.created_at
      left join public.personas per on per.id = e.usuario_id
     group by e.created_at, e.origen, e.documento, e.proveedor, per.nombres, per.apellidos
  ),
  hoy as (
    select coalesce(sum(s.cantidad), 0)::int as stock,
           round(sum(s.cantidad * v.costo) / nullif(sum(s.cantidad), 0), 2) as costo
      from vars v
      left join retail.stock s on s.variante_id = v.id
  )
  select case when retail.fn_puede_ver_dinero_de_compras() then jsonb_build_object(
    'compras', coalesce((select jsonb_agg(jsonb_build_object(
        'fecha', c.created_at, 'origen', c.origen, 'llegaron', c.llegaron, 'costo_llegaron', c.costo_llegaron,
        'ya_habia', c.ya_habia, 'costo_antes', c.costo_antes, 'costo_despues', c.costo_despues,
        'documento', c.documento, 'proveedor', c.proveedor, 'persona', c.persona) order by c.created_at)
      from compras c), '[]'::jsonb),
    'hoy', (select jsonb_build_object('stock', h.stock, 'costo', h.costo) from hoy h),
    'inicio', jsonb_build_object(
      'fecha', (select p.created_at from retail.productos p where p.id = p_producto_id),
      'costo', (select round(avg(d.costo) filter (where d.costo > 0), 2) from declarado d))
  ) end;
$$;

revoke all on function retail.fn_costo_de_la_prenda(uuid) from public, anon;
grant execute on function retail.fn_costo_de_la_prenda(uuid) to authenticated;

comment on function retail.fn_costo_de_la_prenda(uuid) is
  'Pestaña «Costo» del Historial (2026-10-24): cuánto cuesta hoy la prenda y cada compra o cierre del Taller que movió su costo, a nivel prenda (todas sus variantes). Null si la cuenta no ve el dinero de compras.';
