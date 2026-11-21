with w as (
  select h.hoy,
         ((h.hoy - 28)::timestamp at time zone 'America/Lima') as desde_ts,
         ((h.hoy - 14)::timestamp at time zone 'America/Lima') as desde14_ts,
         ((h.hoy - 56)::timestamp at time zone 'America/Lima') as hist_ts,
         (h.hoy::timestamp at time zone 'America/Lima') as hasta_ts
    from (select (now() at time zone 'America/Lima')::date as hoy) h
),
pol as (
  select 21::numeric as objetivo, 10::numeric as urgente, 28::numeric as guarda, 56::numeric as sobra_dias, 14::numeric as k,
         10::numeric as min_traslado, 3::numeric as min_acabado, 0.5::numeric as tope_sin_registrar, 14::numeric as dias_frenada,
         greatest(make_date(extract(year from w.hoy)::int, 12, 1) - w.hoy, 0)::numeric as dias_antes_dic,
         greatest(make_date(extract(year from w.hoy)::int, 12, 25) - greatest(w.hoy, make_date(extract(year from w.hoy)::int, 12, 1)), 0)::numeric as dias_dic,
         (w.hoy between make_date(extract(year from w.hoy)::int, 10, 15) and make_date(extract(year from w.hoy)::int, 12, 24)) as navidad
    from w
),
cat as (
  select c.id, coalesce(c.categoria_padre_id, c.id) as madre_id, (coalesce(c.familia, '') = 'indumentaria') as indumentaria
    from retail.categorias c
   where retail.fn_categoria_entra_a_motores(c.id)
),
tallerprov as (select pv.id from retail.proveedores pv where retail.fn_es_proveedor_taller(pv.id)),
tallerprod as (select distinct p.producto_id from retail.producciones p where not p.es_muestra and p.producto_id is not null),
ubi as (
  select u.id, replace(u.nombre, 'Tienda ', '') as sede, u.tipo
    from retail.ubicaciones u
   where u.activo and u.tipo in ('tienda', 'taller')
),
tienda as (
  select u.id, u.sede,
         least(28, greatest(1, w.hoy - coalesce((select min((v.created_at at time zone 'America/Lima')::date)
                                                   from retail.ventas v
                                                  where v.ubicacion_id = u.id and v.estado = 'completada' and not v.es_prueba), w.hoy)))::numeric as dias,
         (select max((v.created_at at time zone 'America/Lima')::date) from retail.ventas v
           where v.ubicacion_id = u.id and v.estado = 'completada' and not v.es_prueba and v.created_at < w.hasta_ts) as ultima_venta
    from ubi u cross join w
   where u.tipo = 'tienda'
),
cobradas as (
  select vi.id as venta_item_id, vi.variante_id, vi.cantidad, v.ubicacion_id,
         (v.created_at >= w.desde_ts) as en28, (v.created_at >= w.desde14_ts) as en14
    from retail.ventas v
    join retail.venta_items vi on vi.venta_id = v.id
    cross join w
   where v.estado = 'completada' and not v.es_prueba
     and v.created_at >= w.hist_ts and v.created_at < w.hasta_ts
     and not exists (select 1 from retail.movimientos m where m.venta_item_id = vi.id and m.motivo = 'cuarentena_liquidada')
     and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
),
llevadas as (
  select l.ubicacion_id, l.en28, l.en14, l.variante_id,
         greatest(l.cantidad
                  - coalesce((select sum(c.cantidad) from retail.cambios c where c.venta_item_id = l.venta_item_id), 0)
                  - coalesce((select sum(di.cantidad) from retail.devolucion_items di join retail.devoluciones d on d.id = di.devolucion_id
                               where di.venta_item_id = l.venta_item_id and d.estado = 'aprobada'), 0), 0)::numeric as u
    from cobradas l
  union all
  select l.ubicacion_id, l.en28, l.en14, coalesce(cs.variante_id, c.variante_nueva_id), coalesce(cs.cantidad, c.cantidad)::numeric
    from cobradas l
    join retail.cambios c on c.venta_item_id = l.venta_item_id
    left join retail.cambio_salidas cs on cs.cambio_id = c.id
),
vend as (
  select x.ubicacion_id, x.en28, x.en14, c.madre_id, coalesce(va.color_codigo, '') as col, coalesce(va.talla_id::text, '') as tal,
         x.u, 0::numeric as sr, x.u as u_prenda,
         (case when pr.id in (select producto_id from tallerprod) or (c.indumentaria and pr.proveedor_id in (select id from tallerprov)) then x.u else 0 end)::numeric as u_taller,
         x.u as u_celda
    from llevadas x
    join retail.variantes va on va.id = x.variante_id
    join retail.productos pr on pr.id = va.producto_id
    join cat c on c.id = pr.categoria_id
   where x.u > 0 and x.variante_id <> '22222222-2222-4222-8222-222222222222'::uuid and not pr.es_prueba
  union all
  select v.ubicacion_id, (v.created_at >= w.desde_ts), (v.created_at >= w.desde14_ts), c.madre_id,
         coalesce(p.color_codigo, ''), coalesce(p.talla_id::text, ''), 1::numeric, 1::numeric, 0::numeric, 0::numeric, 1::numeric
    from retail.prendas_por_regularizar p
    join retail.venta_items vi on vi.id = p.venta_item_id
    join retail.ventas v on v.id = vi.venta_id
    join cat c on c.id = p.categoria_id
    cross join w
   where p.estado in ('pendiente', 'cerrada_sin_prenda') and v.estado = 'completada' and not v.es_prueba
     and v.created_at >= w.hist_ts and v.created_at < w.hasta_ts
     and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
),
v_cat as (select ubicacion_id, madre_id, sum(u) as v, sum(sr) as sr, sum(u_celda) as v_reg,
                 coalesce(sum(u) filter (where en14), 0) as v14
            from vend where en28 group by 1, 2),
v_cell as (select ubicacion_id, madre_id, col, tal, sum(u_celda) as v_reg, sum(u_prenda) as v_prenda from vend where en28 and u_celda > 0 group by 1, 2, 3, 4),
v14 as (select ubicacion_id, sum(u) as u, sum(sr) as sr from vend where en14 group by 1),
h_cell as (select madre_id, col, tal, sum(u_celda) as v_reg, sum(u_taller) as v_taller, sum(u_prenda) as v_prenda from vend where u_celda > 0 group by 1, 2, 3),
h_cat as (select madre_id, sum(v_reg) as v_reg from h_cell group by 1),
st as (
  select s.ubicacion_id, c.madre_id, coalesce(va.color_codigo, '') as col, coalesce(va.talla_id::text, '') as tal,
         sum(greatest(case when sb.tipo is distinct from 'cuarentena' then (s.cantidad - s.cantidad_apartada) - coalesce(dz.c, 0) else 0 end, 0))::numeric as disp,
         sum(s.cantidad)::numeric as fisico,
         sum(case when pr.id in (select producto_id from tallerprod) or (c.indumentaria and pr.proveedor_id in (select id from tallerprov)) then s.cantidad else 0 end)::numeric as de_taller
    from retail.stock s
    join retail.variantes va on va.id = s.variante_id
    join retail.productos pr on pr.id = va.producto_id
    join cat c on c.id = pr.categoria_id
    join ubi u on u.id = s.ubicacion_id
    left join retail.sububicaciones sb on sb.id = s.sububicacion_id
    left join lateral (select sum(d.cantidad - d.cantidad_apartada) as c from retail.stock_dueno d
                        where d.variante_id = s.variante_id and d.ubicacion_id = s.ubicacion_id
                          and d.sububicacion_id is not distinct from s.sububicacion_id) dz on true
   where s.cantidad > 0 and s.variante_id <> '22222222-2222-4222-8222-222222222222'::uuid and not pr.es_prueba
   group by 1, 2, 3, 4
),
tr as (
  select t.ubicacion_destino_id as ubicacion_id, c.madre_id, coalesce(va.color_codigo, '') as col, coalesce(va.talla_id::text, '') as tal,
         sum(ti.cantidad)::numeric as n
    from retail.transferencias t
    join retail.transferencia_items ti on ti.transferencia_id = t.id
    join retail.variantes va on va.id = ti.variante_id
    join retail.productos pr on pr.id = va.producto_id
    join cat c on c.id = pr.categoria_id
   where t.estado = 'en_transito' and not pr.es_prueba
   group by 1, 2, 3, 4
),
pr_cell as (
  select c.madre_id, coalesce(va.color_codigo, '') as col, coalesce(va.talla_id::text, '') as tal,
         sum(greatest(pl.cantidad_plan - coalesce(pl.cantidad_buenas, 0), 0))::numeric as n
    from retail.producciones p
    join retail.produccion_lineas pl on pl.produccion_id = p.id
    join retail.variantes va on va.id = pl.variante_id
    join retail.productos pr on pr.id = va.producto_id
    join cat c on c.id = pr.categoria_id
   where p.estado = 'en_proceso' and not p.es_muestra and coalesce(p.ingreso_al_stock, 'movimiento') = 'movimiento' and not pr.es_prueba
   group by 1, 2, 3
),
envio_item as (
  select d.ubicacion_destino_id as ubicacion_id, di.categoria_id, di.cantidad,
         coalesce((select sum(c.contadas) from retail.despacho_conteos c where c.despacho_item_id = di.id), 0) as contadas,
         coalesce((select sum(r.cantidad) from retail.despacho_recibidos r where r.despacho_item_id = di.id), 0) as en_stock
    from retail.despacho_items di
    join retail.despachos d on d.id = di.despacho_id
   where d.estado in ('en_camino', 'abierto')
),
viene0 as (
  select o.ubicacion_destino_id as ubicacion_id, i.categoria_id, 'pedido'::text as clase,
         greatest(i.cantidad - coalesce((select sum(di.cantidad) from retail.despacho_items di join retail.despachos d on d.id = di.despacho_id
                                          where di.orden_compra_item_id = i.id and d.estado in ('en_camino', 'abierto', 'cerrado')), 0), 0)::numeric as n
    from retail.orden_compra_items i
    join retail.ordenes_compra o on o.id = i.orden_compra_id
   where o.estado = 'generada'
     and not exists (select 1 from retail.compra_papel_llegadas l where l.papel_id = o.papel_id)
  union all
  select e.ubicacion_id, e.categoria_id, 'pedido', greatest(e.cantidad - greatest(e.contadas, e.en_stock), 0)::numeric from envio_item e
  union all
  select e.ubicacion_id, e.categoria_id, 'por_registrar', greatest(e.contadas - e.en_stock, 0)::numeric from envio_item e
  union all
  select d.ubicacion_destino_id, c.categoria_id, 'por_registrar',
         greatest(c.contadas - coalesce((select sum(r.cantidad) from retail.despacho_recibidos r
                                          where r.despacho_id = c.despacho_id and r.despacho_item_id is null
                                            and r.extra_posicion is not distinct from c.extra_posicion), 0), 0)::numeric
    from retail.despacho_conteos c
    join retail.despachos d on d.id = c.despacho_id
   where d.estado = 'abierto' and c.despacho_item_id is null
  union all
  select d.ubicacion_destino_id, coalesce(di.categoria_id, dc.categoria_id), 'por_registrar', p.cantidad::numeric
    from retail.despacho_pendientes p
    join retail.despachos d on d.id = p.despacho_id
    left join retail.despacho_items di on di.id = p.despacho_item_id
    left join lateral (select c.categoria_id from retail.despacho_conteos c
                        where c.despacho_id = p.despacho_id and c.despacho_item_id is not distinct from p.despacho_item_id
                          and c.extra_posicion is not distinct from p.extra_posicion limit 1) dc on true
   where p.estado = 'pendiente' and d.estado = 'cerrado'
),
ped as (
  select x.ubicacion_id, c.madre_id,
         coalesce(sum(x.n) filter (where x.clase = 'pedido'), 0)::numeric as n,
         coalesce(sum(x.n) filter (where x.clase = 'por_registrar'), 0)::numeric as por_registrar
    from viene0 x
    join cat c on c.id = x.categoria_id
   where x.n > 0
   group by 1, 2
),
celdas as (
  select madre_id, col, tal from h_cell
  union select madre_id, col, tal from st
  union select madre_id, col, tal from tr
  union select madre_id, col, tal from pr_cell
),
madres as (select madre_id from celdas union select madre_id from v_cat union select madre_id from ped),
pos as (
  select t.id as ubicacion_id, t.sede, t.dias, ce.madre_id, ce.col, ce.tal,
         coalesce(vc.v_reg, 0) as v_reg, coalesce(vc.v_prenda, 0) as v_prenda, coalesce(vk.v, 0) as v_cat, coalesce(vk.v_reg, 0) as v_cat_reg,
         case when coalesce(hk.v_reg, 0) > 0 then coalesce(hc.v_reg, 0) / hk.v_reg else 0 end as pi,
         coalesce(s.disp, 0) as disp, coalesce(x.n, 0) as transito
    from tienda t
    cross join celdas ce
    left join v_cell vc on vc.ubicacion_id = t.id and vc.madre_id = ce.madre_id and vc.col = ce.col and vc.tal = ce.tal
    left join v_cat vk on vk.ubicacion_id = t.id and vk.madre_id = ce.madre_id
    left join h_cell hc on hc.madre_id = ce.madre_id and hc.col = ce.col and hc.tal = ce.tal
    left join h_cat hk on hk.madre_id = ce.madre_id
    left join st s on s.ubicacion_id = t.id and s.madre_id = ce.madre_id and s.col = ce.col and s.tal = ce.tal
    left join tr x on x.ubicacion_id = t.id and x.madre_id = ce.madre_id and x.col = ce.col and x.tal = ce.tal
),
ritmo as (
  select p.*,
         case when p.v_cat <= 0 then 0
              when p.v_cat_reg > 0 then (p.v_reg * p.v_cat / p.v_cat_reg + pol.k * p.pi * p.v_cat / p.dias) / (p.dias + pol.k)
              else p.pi * p.v_cat / p.dias end as lam
    from pos p cross join pol
),
oferta as (
  select s.madre_id, s.col, s.tal, 1 as clase, s.disp as n
    from st s join ubi u on u.id = s.ubicacion_id and u.tipo = 'taller'
   where s.disp > 0
  union all
  select p.madre_id, p.col, p.tal, 2, p.n from pr_cell p where p.n > 0
),
peso as (
  select o.madre_id, o.col, o.tal, o.clase, o.n, r.ubicacion_id, r.sede,
         case when sum(r.lam) over c > 0 then r.lam / sum(r.lam) over c
              when sum(r.v_cat / r.dias) over c > 0 then (r.v_cat / r.dias) / sum(r.v_cat / r.dias) over c
              else 0 end as w
    from oferta o
    join ritmo r on r.madre_id = o.madre_id and r.col = o.col and r.tal = o.tal
  window c as (partition by o.madre_id, o.col, o.tal, o.clase)
),
reparto as (
  select p.*,
         (floor(p.n * p.w) + case when row_number() over (partition by p.madre_id, p.col, p.tal, p.clase order by (p.n * p.w - floor(p.n * p.w)) desc, p.w desc, p.sede)
                                       <= round(sum(p.n * p.w) over (partition by p.madre_id, p.col, p.tal, p.clase)) - sum(floor(p.n * p.w)) over (partition by p.madre_id, p.col, p.tal, p.clase)
                                  then 1 else 0 end)::numeric as toca
    from peso p
),
celx as (
  select r.*, coalesce(a.toca, 0) as del_taller_llega, coalesce(b.toca, 0) as cosiendo_llega
    from ritmo r
    left join reparto a on a.clase = 1 and a.ubicacion_id = r.ubicacion_id and a.madre_id = r.madre_id and a.col = r.col and a.tal = r.tal
    left join reparto b on b.clase = 2 and b.ubicacion_id = r.ubicacion_id and b.madre_id = r.madre_id and b.col = r.col and b.tal = r.tal
),
cx as (
  select ubicacion_id, madre_id, sum(disp) as hay, sum(transito) as transito, sum(del_taller_llega) as del_taller, sum(cosiendo_llega) as cosiendo
    from celx group by 1, 2
),
cs0 as (
  select t.id as ubicacion_id, t.sede, t.dias, m.madre_id,
         coalesce(vk.v, 0) as v28, coalesce(vk.sr, 0) as sr28, coalesce(vk.v14, 0) as v14, coalesce(vk.v, 0) / t.dias as lam,
         coalesce(cx.hay, 0) as hay, coalesce(cx.transito, 0) as transito,
         coalesce(cx.del_taller, 0) as del_taller, coalesce(cx.cosiendo, 0) as cosiendo,
         coalesce(pd.n, 0) as pedido, coalesce(pd.por_registrar, 0) as por_registrar
    from tienda t
    cross join madres m
    left join v_cat vk on vk.ubicacion_id = t.id and vk.madre_id = m.madre_id
    left join cx on cx.ubicacion_id = t.id and cx.madre_id = m.madre_id
    left join ped pd on pd.ubicacion_id = t.id and pd.madre_id = m.madre_id
),
cs1a as (
  select c.*,
         (c.hay + c.por_registrar + c.transito + c.pedido + c.del_taller + c.cosiendo) as tiene,
         (c.v28 > 0 and c.sr28 >= pol.tope_sin_registrar * c.v28) as ciega,
         (c.v28 >= 3 and c.v14 = 0 and c.hay > 0) as frenada,
         greatest(round(c.v28 * pol.objetivo / c.dias - c.hay - c.por_registrar - c.transito - c.pedido - c.del_taller - c.cosiendo), 0) as falta0,
         floor(greatest(c.hay + c.por_registrar - c.v28 * pol.guarda / c.dias, 0)) as sobra
    from cs0 c cross join pol
),
cs1 as (select a.*, case when a.ciega or a.frenada then 0 else a.falta0 end as falta from cs1a a),
don as (
  select c.madre_id, c.sede as origen, c.sobra as n, sum(c.sobra) over (partition by c.madre_id order by c.sobra desc, c.sede) as hasta
    from cs1 c where c.sobra > 0
),
rec as (
  select c.madre_id, c.ubicacion_id, c.sede, c.falta as n, sum(c.falta) over (partition by c.madre_id order by c.falta desc, c.sede) as hasta
    from cs1 c where c.falta > 0
),
mov as (
  select q.*, (q.n < pol.min_traslado) as chico from (
    select d.madre_id, d.origen, r.ubicacion_id, r.sede as destino,
           (least(d.hasta, r.hasta) - greatest(d.hasta - d.n, r.hasta - r.n)) as n
      from don d
      join rec r on r.madre_id = d.madre_id
     where least(d.hasta, r.hasta) > greatest(d.hasta - d.n, r.hasta - r.n)
  ) q cross join pol
),
cs2 as (
  select c.*,
         coalesce((select sum(m.n) from mov m where m.ubicacion_id = c.ubicacion_id and m.madre_id = c.madre_id), 0) as recibe,
         coalesce((select sum(m.n) from mov m where m.origen = c.sede and m.madre_id = c.madre_id), 0) as da
    from cs1 c
),
rep as (
  select x.ubicacion_id, x.sede, x.madre_id, x.col, x.tal, x.lam, x.v_reg, x.v_prenda, x.pi, x.disp, x.transito, x.del_taller_llega, x.cosiendo_llega,
         greatest(x.lam * pol.objetivo - x.disp - x.transito - x.del_taller_llega - x.cosiendo_llega, 0) as g,
         (c.falta - c.recibe) as por_comprar
    from celx x
    join cs2 c on c.ubicacion_id = x.ubicacion_id and c.madre_id = x.madre_id
    cross join pol
),
rep1 as (
  select r.*, case when sum(r.g) over c1 > 0 then r.g * r.por_comprar / sum(r.g) over c1 else 0 end as q
    from rep r
  window c1 as (partition by r.ubicacion_id, r.madre_id)
),
rep2 as (
  select r.*,
         (floor(r.q) + case when row_number() over (partition by r.ubicacion_id, r.madre_id order by (r.q - floor(r.q)) desc, r.g desc, r.v_reg desc, r.pi desc, r.col, r.tal)
                                 <= round(sum(r.q) over (partition by r.ubicacion_id, r.madre_id)) - sum(floor(r.q)) over (partition by r.ubicacion_id, r.madre_id)
                                 and r.q > floor(r.q) then 1 else 0 end)::numeric as comprar
    from rep1 r
),
origen as (
  select ce.madre_id, ce.col, ce.tal,
         coalesce(hc.v_taller, 0) + coalesce(sx.de_taller, 0) as de_taller,
         coalesce(hc.v_prenda, 0) + coalesce(sx.fisico, 0) as conocidas
    from celdas ce
    left join h_cell hc on hc.madre_id = ce.madre_id and hc.col = ce.col and hc.tal = ce.tal
    left join (select madre_id, col, tal, sum(de_taller) as de_taller, sum(fisico) as fisico from st group by 1, 2, 3) sx
           on sx.madre_id = ce.madre_id and sx.col = ce.col and sx.tal = ce.tal
),
origen_cat as (
  select m.madre_id, coalesce(sum(o.de_taller) / nullif(sum(o.conocidas), 0), 0) >= 0.5 as taller
    from madres m left join origen o on o.madre_id = m.madre_id group by 1
),
celf as (
  select r.*, coalesce(o.de_taller / nullif(o.conocidas, 0), 0) >= 0.5 as del_taller
    from rep2 r
    left join origen o on o.madre_id = r.madre_id and o.col = r.col and o.tal = r.tal
),
cs3 as (
  select c.*, oc.taller,
         coalesce(d.comprar, 0) + (case when oc.taller then 0 else c.falta - c.recibe - coalesce(d.total, 0) end) as comprar,
         coalesce(d.producir, 0) + (case when oc.taller then c.falta - c.recibe - coalesce(d.total, 0) else 0 end) as producir
    from cs2 c
    join origen_cat oc on oc.madre_id = c.madre_id
    left join (select ubicacion_id, madre_id,
                      coalesce(sum(comprar) filter (where not del_taller), 0) as comprar,
                      coalesce(sum(comprar) filter (where del_taller), 0) as producir,
                      sum(comprar) as total
                 from celf group by 1, 2) d on d.ubicacion_id = c.ubicacion_id and d.madre_id = c.madre_id
),
red as (
  select m.id as madre_id, m.nombre, m.prefijo, m.familia,
         sum(c.v28) as v28, sum(c.sr28) as sr28, sum(c.v14) as v14, sum(c.lam) as lam, sum(c.hay) as hay_tiendas, sum(c.transito) as transito,
         bool_or(c.falta0 > 0 and c.ciega) as registra,
         bool_or(c.falta0 > 0 and c.frenada and not c.ciega) as revisa,
         sum(c.v28 * (select objetivo from pol) / c.dias) as pide_objetivo,
         sum(c.v28 * (select sobra_dias from pol) / c.dias) as pide_sobra,
         coalesce((select sum(s.disp) from st s join ubi u on u.id = s.ubicacion_id and u.tipo = 'taller' where s.madre_id = m.id), 0) as hay_taller,
         coalesce((select sum(p.n) from ped p where p.madre_id = m.id), 0) as pedido,
         coalesce((select sum(p.por_registrar) from ped p where p.madre_id = m.id), 0) as por_registrar,
         coalesce((select sum(p.n) from pr_cell p where p.madre_id = m.id), 0) as cosiendo,
         sum(c.falta) as falta, sum(c.recibe) as mover, sum(c.comprar) as comprar, sum(c.producir) as producir,
         sum(c.sobra) as sobra, bool_or(c.taller) as taller
    from cs3 c
    join retail.categorias m on m.id = c.madre_id
   group by m.id, m.nombre, m.prefijo, m.familia
),
redv as (
  select r.*,
         (r.hay_tiendas + r.hay_taller + r.por_registrar + r.transito + r.pedido + r.cosiendo) as tiene,
         case when r.lam > 0 then round((r.hay_tiendas + r.hay_taller + r.por_registrar + r.transito + r.pedido + r.cosiendo) / r.lam) end as dias
    from red r
),
nombres as (
  select ce.madre_id, ce.col, ce.tal,
         coalesce(co.nombre, 'Sin color') as color, co.hex, coalesce(ta.valor, 'Sin talla') as talla,
         coalesce(array_position(array['XXS','XS','S','S/M','M','M/L','L','XL','XXL','2XL','XXXL','3XL','4XL'], upper(btrim(ta.valor)))::numeric,
                  case when btrim(ta.valor) ~ '^[0-9]+([.][0-9]+)?$' then 100 + btrim(ta.valor)::numeric end, 5000) as talla_orden
    from celdas ce
    left join retail.colores co on co.codigo = ce.col
    left join retail.tallas ta on ta.id::text = ce.tal
),
motor as (
  select jsonb_build_object(
    'hoy', (select hoy from w),
    'politica', (select to_jsonb(p) from pol p),
    'tiendas', (select jsonb_agg(jsonb_build_object(
        'sede', t.sede, 'dias', t.dias, 'ultima_venta', t.ultima_venta,
        'dias_sin_venta', case when t.ultima_venta is null then null else ((select hoy from w) - 1) - t.ultima_venta end,
        'recibe', coalesce((select sum(c.recibe) from cs3 c where c.ubicacion_id = t.id), 0),
        'da', coalesce((select sum(c.da) from cs3 c where c.ubicacion_id = t.id), 0),
        'v28', coalesce((select sum(c.v28) from cs3 c where c.ubicacion_id = t.id), 0),
        'sr28', coalesce((select sum(c.sr28) from cs3 c where c.ubicacion_id = t.id), 0),
        'por_semana', round(coalesce((select sum(c.lam) from cs3 c where c.ubicacion_id = t.id), 0) * 7),
        'hay', coalesce((select sum(c.hay) from cs3 c where c.ubicacion_id = t.id), 0),
        'por_registrar', coalesce((select sum(c.por_registrar) from cs3 c where c.ubicacion_id = t.id), 0),
        'viene', coalesce((select sum(c.transito + c.pedido + c.del_taller) from cs3 c where c.ubicacion_id = t.id), 0),
        'cosiendo', coalesce((select sum(c.cosiendo) from cs3 c where c.ubicacion_id = t.id), 0),
        'con_prenda_14', (select case when v.u > 0 then round(100 * (v.u - v.sr) / v.u) end from v14 v where v.ubicacion_id = t.id),
        'comprar', coalesce((select sum(c.comprar) from cs3 c where c.ubicacion_id = t.id), 0),
        'producir', coalesce((select sum(c.producir) from cs3 c where c.ubicacion_id = t.id), 0),
        'sobra', coalesce((select sum(c.sobra) from cs3 c where c.ubicacion_id = t.id), 0)
      ) order by t.sede) from tienda t),
    'categorias', (select jsonb_agg(jsonb_build_object(
        'cat', r.nombre, 'prefijo', r.prefijo, 'familia', r.familia, 'del_taller', r.taller,
        'v28', r.v28, 'sr28', r.sr28, 'v14', r.v14, 'lam', round(r.lam, 4), 'por_semana', round(r.lam * 7, 1),
        'hay', r.hay_tiendas + r.hay_taller, 'hay_taller', r.hay_taller, 'por_registrar', r.por_registrar,
        'transito', r.transito, 'pedido', r.pedido, 'cosiendo', r.cosiendo, 'tiene', r.tiene,
        'alcanza_dias', r.dias, 'mover', r.mover, 'sobra', r.sobra,
        'comprar', r.comprar,
        'producir', r.producir,
        'veredicto', case when r.comprar > 0 and r.producir > 0 then 'compra_y_produce'
                          when r.comprar > 0 then 'compra'
                          when r.producir > 0 then 'produce'
                          when r.mover > 0 then 'mueve'
                          when r.registra then 'registra'
                          when r.revisa then 'revisa'
                          when r.lam = 0 then 'no_se_vende'
                          when (r.hay_tiendas + r.hay_taller + r.por_registrar) > r.pide_sobra then 'sobra'
                          when r.hay_tiendas < r.pide_objetivo then 'espera'
                          else 'no_compres' end,
        'sedes', (select jsonb_object_agg(c.sede, jsonb_build_object(
              'v28', c.v28, 'sr28', c.sr28, 'v14', c.v14, 'lam', round(c.lam, 4), 'por_semana', round(c.lam * 7, 1), 'hay', c.hay, 'por_registrar', c.por_registrar,
              'viene', c.transito + c.pedido + c.del_taller, 'cosiendo', c.cosiendo, 'tiene', c.tiene,
              'dias', case when c.lam > 0 then round(c.tiene / c.lam) end,
              'comprar', c.comprar,
              'producir', c.producir,
              'recibe', c.recibe, 'da', c.da, 'sobra', c.sobra, 'pediria', c.falta0,
              'veredicto', case when c.comprar > 0 and c.producir > 0 then 'compra_y_produce'
                                when c.comprar > 0 then 'compra'
                                when c.producir > 0 then 'produce'
                                when c.recibe > 0 then 'mueve'
                                when c.falta0 > 0 and c.ciega then 'registra'
                                when c.falta0 > 0 and c.frenada then 'revisa'
                                when c.lam = 0 and c.tiene > 0 then 'no_se_vende'
                                when c.lam = 0 then 'nada'
                                when (c.hay + c.por_registrar) * c.dias > c.v28 * (select sobra_dias from pol) then 'sobra'
                                when c.hay * c.dias < c.v28 * (select objetivo from pol) then 'espera'
                                else 'no_compres' end))
                    from cs3 c where c.madre_id = r.madre_id)
      ) order by r.v28 desc, r.nombre) from redv r where r.v28 > 0 or r.tiene > 0),
    'lista', coalesce((select jsonb_agg(jsonb_build_object(
        'accion', case when q.del_taller then 'producir' else 'comprar' end,
        'cat', q.nombre, 'color', q.color, 'hex', q.hex, 'talla', q.talla,
        'tru', q.tru, 'aqp', q.aqp, 'lim', q.lim, 'total', q.total, 'v28', q.v28, 'hay', q.hay,
        'urgente', q.urgente
      ) order by q.cat_v28 desc, q.nombre, q.total desc, q.color, q.talla_orden)
      from (select r.nombre, r.v28 as cat_v28, n.color, n.hex, n.talla, n.talla_orden, bool_or(f.del_taller) as del_taller,
                   coalesce(sum(f.comprar) filter (where f.sede = 'TRU'), 0) as tru,
                   coalesce(sum(f.comprar) filter (where f.sede = 'AQP'), 0) as aqp,
                   coalesce(sum(f.comprar) filter (where f.sede = 'LIM'), 0) as lim,
                   sum(f.comprar) as total, sum(f.v_reg) as v28, sum(f.disp + f.transito) as hay,
                   coalesce(bool_or(f.comprar > 0 and (k.hay + k.por_registrar) * k.dias < k.v28 * (select urgente from pol)), false) as urgente
              from celf f
              join cs3 k on k.ubicacion_id = f.ubicacion_id and k.madre_id = f.madre_id
              join redv r on r.madre_id = f.madre_id
              join nombres n on n.madre_id = f.madre_id and n.col = f.col and n.tal = f.tal
             group by r.nombre, r.v28, n.color, n.hex, n.talla, n.talla_orden
            having sum(f.comprar) > 0) q), '[]'::jsonb),
    'traslados', coalesce((select jsonb_agg(jsonb_build_object(
        'de', q.de, 'a', q.a, 'cat', q.nombre, 'color', q.color, 'hex', q.hex, 'talla', q.talla, 'n', q.n, 'chico', q.chico
      ) order by q.orden, q.de, q.a, q.nombre, q.n desc, q.color, q.talla_orden)
      from (
        select 1 as orden, 'Taller'::text as de, p.sede as a, mc.nombre, n.color, n.hex, n.talla, n.talla_orden, sum(p.toca) as n, false as chico
          from reparto p
          join retail.categorias mc on mc.id = p.madre_id
          join nombres n on n.madre_id = p.madre_id and n.col = p.col and n.tal = p.tal
         where p.clase = 1 and p.toca > 0
         group by 2, 3, 4, 5, 6, 7, 8
        union all
        select 2, m.origen, m.destino, mc.nombre, null, null, null, null, m.n, m.chico
          from mov m join retail.categorias mc on mc.id = m.madre_id
      ) q), '[]'::jsonb),
    'acabados', coalesce((select jsonb_agg(jsonb_build_object(
        'sede', q.sede, 'cat', q.nombre, 'color', q.color, 'hex', q.hex, 'talla', q.talla, 'vendidas', q.v_prenda, 'se_compra', q.se_compra
      ) order by q.v_prenda desc, q.nombre, q.color, q.talla_orden, q.sede)
      from (select f.sede, r.nombre, n.color, n.hex, n.talla, n.talla_orden, f.v_prenda, (f.comprar > 0) as se_compra
              from celf f
              join redv r on r.madre_id = f.madre_id
              join nombres n on n.madre_id = f.madre_id and n.col = f.col and n.tal = f.tal
             where f.v_prenda >= (select min_acabado from pol) and (f.disp + f.transito + f.del_taller_llega) = 0
             order by f.v_prenda desc limit 60) q), '[]'::jsonb),
    'viene', coalesce((select jsonb_agg(jsonb_build_object('tipo', q.tipo, 'cat', q.nombre, 'destino', q.destino, 'n', q.n) order by q.nombre, q.tipo, q.destino)
      from (
        select 'pedido'::text as tipo, mc.nombre, coalesce(u.sede, 'Sin tienda') as destino, sum(p.n) as n
          from ped p join retail.categorias mc on mc.id = p.madre_id left join ubi u on u.id = p.ubicacion_id group by 1, 2, 3
        union all
        select 'por_registrar', mc.nombre, coalesce(u.sede, 'Sin tienda'), sum(p.por_registrar)
          from ped p join retail.categorias mc on mc.id = p.madre_id left join ubi u on u.id = p.ubicacion_id group by 1, 2, 3
        union all
        select 'traslado', mc.nombre, u.sede, sum(x.n)
          from tr x join retail.categorias mc on mc.id = x.madre_id join ubi u on u.id = x.ubicacion_id group by 1, 2, 3
        union all
        select 'cosiendo', mc.nombre, 'Taller', sum(p.n)
          from pr_cell p join retail.categorias mc on mc.id = p.madre_id group by 1, 2, 3
      ) q where q.n > 0), '[]'::jsonb),
    'control', jsonb_build_object(
        'v28', (select coalesce(sum(r.v28), 0) from redv r),
        'hay', (select coalesce(sum(r.hay_tiendas + r.hay_taller), 0) from redv r),
        'comprar', (select coalesce(sum(c.comprar), 0) from cs3 c),
        'producir', (select coalesce(sum(c.producir), 0) from cs3 c),
        'mover', (select coalesce(sum(m.n), 0) from mov m),
        'por_registrar', (select coalesce(sum(p.por_registrar), 0) from ped p),
        'pedido', (select coalesce(sum(p.n), 0) from ped p))
  ) as m
)
select m as motor from motor
