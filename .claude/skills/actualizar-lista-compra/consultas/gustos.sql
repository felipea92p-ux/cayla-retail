with w as (
  select h.hoy,
         ((h.hoy - 28)::timestamp at time zone 'America/Lima') as desde_ts,
         (h.hoy::timestamp at time zone 'America/Lima') as hasta_ts,
         (date_trunc('week', (h.hoy - 1)::timestamp)::date - 49) as lunes0
    from (select (now() at time zone 'America/Lima')::date as hoy) h
),
cat as (
  select c.id, coalesce(c.categoria_padre_id, c.id) as madre_id
    from retail.categorias c
   where retail.fn_categoria_entra_a_motores(c.id)
),
ubi as (
  select u.id, replace(u.nombre, 'Tienda ', '') as sede, u.tipo
    from retail.ubicaciones u
   where u.activo and u.tipo in ('tienda', 'taller')
),
cobradas as (
  select vi.id as venta_item_id, vi.variante_id, vi.cantidad, u.sede,
         (v.created_at at time zone 'America/Lima')::date as dia, (v.created_at >= w.desde_ts) as en28
    from retail.ventas v
    join retail.venta_items vi on vi.venta_id = v.id
    join ubi u on u.id = v.ubicacion_id
    cross join w
   where v.estado = 'completada' and not v.es_prueba
     and v.created_at >= (w.lunes0::timestamp at time zone 'America/Lima') and v.created_at < w.hasta_ts
     and not exists (select 1 from retail.movimientos m where m.venta_item_id = vi.id and m.motivo = 'cuarentena_liquidada')
     and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
),
reg as (
  select l.sede, l.dia, l.en28, c.madre_id, coalesce(va.color_codigo, '') as col, coalesce(va.talla_id::text, '') as tal,
         pr.tejido_id, l.cantidad::numeric as u
    from cobradas l
    join retail.variantes va on va.id = l.variante_id
    join retail.productos pr on pr.id = va.producto_id
    join cat c on c.id = pr.categoria_id
   where l.variante_id <> '22222222-2222-4222-8222-222222222222'::uuid and not pr.es_prueba
),
sinreg as (
  select l.sede, l.dia, l.en28, c.madre_id, coalesce(p.color_codigo, '') as col, coalesce(p.talla_id::text, '') as tal
    from cobradas l
    join retail.prendas_por_regularizar p on p.venta_item_id = l.venta_item_id and p.estado in ('pendiente', 'cerrada_sin_prenda')
    join cat c on c.id = p.categoria_id
),
todas as (
  select sede, dia, en28, madre_id, col, tal, u from reg
  union all
  select sede, dia, en28, madre_id, col, tal, 1::numeric from sinreg
),
st as (
  select u.sede, coalesce(sb.tipo, '') as lugar, c.madre_id, coalesce(va.color_codigo, '') as col, coalesce(va.talla_id::text, '') as tal, pr.tejido_id,
         sum(greatest(case when sb.tipo is distinct from 'cuarentena' then (s.cantidad - s.cantidad_apartada) - coalesce(dz.c, 0) else 0 end, 0))::numeric as disp
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
   group by 1, 2, 3, 4, 5, 6
),
v_col as (
  select col, sum(u) as v,
         jsonb_build_array(coalesce(sum(u) filter (where sede = 'TRU'), 0), coalesce(sum(u) filter (where sede = 'AQP'), 0), coalesce(sum(u) filter (where sede = 'LIM'), 0)) as vs
    from todas where en28 group by 1
),
s_col as (
  select col, sum(disp) as h,
         jsonb_build_array(coalesce(sum(disp) filter (where sede = 'TRU'), 0), coalesce(sum(disp) filter (where sede = 'AQP'), 0), coalesce(sum(disp) filter (where sede = 'LIM'), 0), coalesce(sum(disp) filter (where sede = 'Taller'), 0)) as hs
    from st group by 1
),
v_tc as (
  select madre_id, col, sum(u) as v,
         jsonb_build_array(coalesce(sum(u) filter (where sede = 'TRU'), 0), coalesce(sum(u) filter (where sede = 'AQP'), 0), coalesce(sum(u) filter (where sede = 'LIM'), 0)) as vs
    from todas where en28 group by 1, 2
),
s_tc as (
  select madre_id, col, sum(disp) as h,
         jsonb_build_array(coalesce(sum(disp) filter (where sede = 'TRU'), 0), coalesce(sum(disp) filter (where sede = 'AQP'), 0), coalesce(sum(disp) filter (where sede = 'LIM'), 0), coalesce(sum(disp) filter (where sede = 'Taller'), 0)) as hs
    from st group by 1, 2
),
v_tt as (
  select madre_id, tal, sum(u) as v,
         jsonb_build_array(coalesce(sum(u) filter (where sede = 'TRU'), 0), coalesce(sum(u) filter (where sede = 'AQP'), 0), coalesce(sum(u) filter (where sede = 'LIM'), 0)) as vs
    from todas where en28 group by 1, 2
),
s_tt as (
  select madre_id, tal, sum(disp) as h,
         jsonb_build_array(coalesce(sum(disp) filter (where sede = 'TRU'), 0), coalesce(sum(disp) filter (where sede = 'AQP'), 0), coalesce(sum(disp) filter (where sede = 'LIM'), 0), coalesce(sum(disp) filter (where sede = 'Taller'), 0)) as hs
    from st group by 1, 2
),
v_te as (
  select coalesce(tejido_id::text, '') as tej, sum(u) as v,
         jsonb_build_array(coalesce(sum(u) filter (where sede = 'TRU'), 0), coalesce(sum(u) filter (where sede = 'AQP'), 0), coalesce(sum(u) filter (where sede = 'LIM'), 0)) as vs
    from reg where en28 group by 1
),
s_te as (
  select coalesce(tejido_id::text, '') as tej, sum(disp) as h,
         jsonb_build_array(coalesce(sum(disp) filter (where sede = 'TRU'), 0), coalesce(sum(disp) filter (where sede = 'AQP'), 0), coalesce(sum(disp) filter (where sede = 'LIM'), 0), coalesce(sum(disp) filter (where sede = 'Taller'), 0)) as hs
    from st group by 1
),
tc as (
  select coalesce(a.madre_id, b.madre_id) as madre_id, coalesce(a.col, b.col) as col, coalesce(a.v, 0) as v, coalesce(b.h, 0) as h,
         coalesce(a.vs, '[0,0,0]'::jsonb) as vs, coalesce(b.hs, '[0,0,0,0]'::jsonb) as hs
    from v_tc a full join s_tc b on b.madre_id = a.madre_id and b.col = a.col
),
tt as (
  select coalesce(a.madre_id, b.madre_id) as madre_id, coalesce(a.tal, b.tal) as tal, coalesce(a.v, 0) as v, coalesce(b.h, 0) as h,
         coalesce(a.vs, '[0,0,0]'::jsonb) as vs, coalesce(b.hs, '[0,0,0,0]'::jsonb) as hs
    from v_tt a full join s_tt b on b.madre_id = a.madre_id and b.tal = a.tal
),
piso_foto as (
  select u.sede, c.madre_id, e.fecha, bool_and(e.piso_cuadrado) as cuadrado, sum(e.prendas)::numeric as prendas
    from retail.espacio_piso e
    join ubi u on u.id = e.ubicacion_id
    join cat c on c.id = e.categoria_id
    cross join w
   where e.fecha >= w.hoy - 35
   group by 1, 2, 3
),
foto_dia as (select sede, fecha, bool_and(cuadrado) as cuadrado, sum(prendas) as prendas from piso_foto group by 1, 2),
fotos as (
  select sede, count(*) filter (where prendas > 0) as n, min(fecha) filter (where prendas > 0) as desde, max(fecha) as hasta,
         count(*) filter (where prendas > 0 and cuadrado) as n_cuadradas
    from foto_dia group by 1
),
piso_prom as (
  select p.sede, p.madre_id,
         case when max(f.n_cuadradas) > 0 then coalesce(sum(p.prendas) filter (where p.cuadrado), 0) / max(f.n_cuadradas)
              when max(f.n) > 0 then sum(p.prendas) / max(f.n) end as colgadas
    from piso_foto p join fotos f on f.sede = p.sede group by 1, 2
),
km_obs as (
  select c.madre_id, (o.elem ->> 0)::float8 as seg, ((o.elem ->> 1)::int = 1) as vendida, (o.elem ->> 2)::float8 as peso
    from retail.frescura_vara_cayla f
    join cat c on c.id = f.categoria_id
    cross join lateral jsonb_array_elements(f.observaciones) as o(elem)
),
km0 as (select madre_id, seg, coalesce(sum(peso) filter (where vendida), 0) as vend, sum(peso) as salen from km_obs where peso > 0 group by 1, 2),
km1 as (select k.*, sum(k.salen) over (partition by k.madre_id order by k.seg desc) as riesgo from km0 k),
km2 as (
  select k.madre_id, k.seg, k.vend,
         exp(sum(case when k.vend > 0 then ln(greatest(1 - k.vend / k.riesgo, 1e-12)) else 0 end) over (partition by k.madre_id order by k.seg)) as s,
         sum(case when k.vend > 0 then k.vend / k.riesgo else 0 end) over (partition by k.madre_id order by k.seg) as h
    from km1 k
),
km_fin as (select distinct on (madre_id) madre_id, seg as t_fin, s as s_fin, h as h_fin from km2 where vend > 0 order by madre_id, seg desc),
vara as (
  select k.madre_id,
         min(k.seg) filter (where k.s <= 0.5 + 1e-9) as p50,
         min(k.seg) filter (where k.s <= 0.25 + 1e-9) as p75,
         min(k.seg) filter (where k.s <= 0.1 + 1e-9) as p90,
         sum(k.vend) as vendidas
    from km2 k group by 1
),
vara_meta as (
  select c.madre_id, min(f.calculada_en) as calculada_en, sum(f.unidades) as unidades, max(f.ventana_dias) as ventana_dias
    from retail.frescura_vara_cayla f join cat c on c.id = f.categoria_id group by 1
),
lugar_hoy as (
  select sede, madre_id,
         coalesce(sum(disp) filter (where lugar = 'piso_venta'), 0) as piso,
         coalesce(sum(disp) filter (where lugar = 'almacen_tienda'), 0) as almacen
    from st where sede <> 'Taller' group by 1, 2
),
v_ts as (select sede, madre_id, sum(u) as v from todas where en28 group by 1, 2),
rot_k as (
  select sede, madre_id from lugar_hoy union select sede, madre_id from v_ts union select sede, madre_id from piso_prom
),
rot as (
  select k.sede, k.madre_id, coalesce(v.v, 0) as v, coalesce(l.piso, 0) as piso, coalesce(l.almacen, 0) as almacen, p.colgadas
    from rot_k k
    left join v_ts v on v.sede = k.sede and v.madre_id = k.madre_id
    left join lugar_hoy l on l.sede = k.sede and l.madre_id = k.madre_id
    left join piso_prom p on p.sede = k.sede and p.madre_id = k.madre_id
   where k.sede <> 'Taller'
),
/* Por modelo: lo cobrado con su prenda (lo «sin registrar» no sabe de qué modelo es) y lo que hay, por tienda. */
mod_v as (
  select va.producto_id, coalesce(va.color_codigo, '') as col, l.sede, sum(l.cantidad)::numeric as u
    from cobradas l
    join retail.variantes va on va.id = l.variante_id
    join retail.productos pr on pr.id = va.producto_id
    join cat c on c.id = pr.categoria_id
   where l.en28 and l.variante_id <> '22222222-2222-4222-8222-222222222222'::uuid and not pr.es_prueba
   group by 1, 2, 3
),
mod_s as (
  select va.producto_id, coalesce(va.color_codigo, '') as col, u.sede,
         sum(greatest(case when sb.tipo is distinct from 'cuarentena' then (s.cantidad - s.cantidad_apartada) - coalesce(dz.c, 0) else 0 end, 0))::numeric as disp
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
   group by 1, 2, 3
),
mod_k as (select producto_id from mod_v union select producto_id from mod_s),
mod_col as (
  select q.producto_id, jsonb_agg(jsonb_build_object('c', coalesce(co.nombre, 'Sin color'), 'x', co.hex) order by q.peso desc, q.col) as cols
    from (select producto_id, col, sum(peso) as peso, row_number() over (partition by producto_id order by sum(peso) desc, col) as n
            from (select producto_id, col, u as peso from mod_v union all select producto_id, col, disp from mod_s) z
           group by 1, 2) q
    left join retail.colores co on co.codigo = q.col
   where q.n <= 6 and q.peso > 0
   group by 1
)
select jsonb_build_object(
  'hoy', (select hoy from w),
  'registradas_28', coalesce((select sum(u) from reg where en28), 0),
  'sin_registrar_28', (select count(*) from sinreg where en28),
  'semanas', coalesce((select jsonb_agg(jsonb_build_object('semana', q.semana, 'dias', q.dias, 'parcial', q.semana + 7 > (select hoy from w),
                                   'v', jsonb_build_array(q.tru, q.aqp, q.lim)) order by q.semana)
      from (select date_trunc('week', t.dia::timestamp)::date as semana, count(distinct t.dia) as dias,
                   coalesce(sum(t.u) filter (where t.sede = 'TRU'), 0) as tru,
                   coalesce(sum(t.u) filter (where t.sede = 'AQP'), 0) as aqp,
                   coalesce(sum(t.u) filter (where t.sede = 'LIM'), 0) as lim
              from todas t group by 1) q), '[]'::jsonb),
  'dias', coalesce((select jsonb_agg(jsonb_build_object('dow', q.dow, 'v', jsonb_build_array(q.tru, q.aqp, q.lim)) order by q.dow)
      from (select extract(isodow from t.dia)::int as dow,
                   coalesce(sum(t.u) filter (where t.sede = 'TRU'), 0) as tru,
                   coalesce(sum(t.u) filter (where t.sede = 'AQP'), 0) as aqp,
                   coalesce(sum(t.u) filter (where t.sede = 'LIM'), 0) as lim
              from todas t where t.en28 group by 1) q), '[]'::jsonb),
  'colores', coalesce((select jsonb_agg(jsonb_build_object('c', coalesce(co.nombre, 'Sin color'), 'x', co.hex, 'f', co.familia_color,
                                   'v', coalesce(x.vs, '[0,0,0]'::jsonb), 'h', coalesce(x.hs, '[0,0,0,0]'::jsonb)) order by x.v desc, x.h desc)
      from (select coalesce(a.col, b.col) as col, coalesce(a.v, 0) as v, coalesce(b.h, 0) as h, a.vs, b.hs
              from v_col a full join s_col b on b.col = a.col) x
      left join retail.colores co on co.codigo = x.col
     where x.v > 0 or x.h > 0), '[]'::jsonb),
  'colores_tipo', coalesce((select jsonb_agg(jsonb_build_object('t', m.nombre, 'c', coalesce(co.nombre, 'Sin color'), 'x', co.hex, 'v', q.vs, 'h', q.hs) order by m.nombre, q.v desc, q.h desc)
      from (select t.*, row_number() over (partition by t.madre_id order by t.v desc, t.h desc, t.col) as n from tc t where t.v > 0 or t.h > 0) q
      join retail.categorias m on m.id = q.madre_id
      left join retail.colores co on co.codigo = q.col
     where q.n <= 12), '[]'::jsonb),
  'tallas_tipo', coalesce((select jsonb_agg(jsonb_build_object('t', q.nombre, 's', q.talla, 'o', q.o, 'v', q.vs, 'h', q.hs) order by q.nombre, q.o, q.talla)
      from (select m.nombre, coalesce(ta.valor, 'Sin talla') as talla, t.vs, t.hs,
                   coalesce(array_position(array['XXS','XS','S','S/M','M','M/L','L','XL','XXL','2XL','XXXL','3XL','4XL'], upper(btrim(ta.valor)))::numeric,
                            case when btrim(ta.valor) ~ '^[0-9]+([.][0-9]+)?$' then 100 + btrim(ta.valor)::numeric end, 5000) as o
              from tt t
              join retail.categorias m on m.id = t.madre_id
              left join retail.tallas ta on ta.id::text = t.tal
             where t.v > 0 or t.h > 0) q), '[]'::jsonb),
  'telas', coalesce((select jsonb_agg(jsonb_build_object('n', coalesce(te.nombre, 'Sin dato'), 'sin_dato', x.tej = '',
                                   'v', coalesce(x.vs, '[0,0,0]'::jsonb), 'h', coalesce(x.hs, '[0,0,0,0]'::jsonb)) order by x.v desc, x.h desc)
      from (select coalesce(a.tej, b.tej) as tej, coalesce(a.v, 0) as v, coalesce(b.h, 0) as h, a.vs, b.hs
              from v_te a full join s_te b on b.tej = a.tej) x
      left join retail.tejidos te on te.id::text = x.tej
     where x.v > 0 or x.h > 0), '[]'::jsonb),
  'fotos_piso', coalesce((select jsonb_agg(to_jsonb(f)) from fotos f), '[]'::jsonb),
  'rotacion', coalesce((select jsonb_agg(jsonb_build_object('sede', r.sede, 't', m.nombre, 'v', r.v, 'piso', r.piso, 'almacen', r.almacen,
                                    'colgadas', round(r.colgadas)) order by r.sede, r.v desc)
      from rot r join retail.categorias m on m.id = r.madre_id
     where r.v > 0 or r.piso > 0 or r.almacen > 0), '[]'::jsonb),
  'piso', coalesce((select jsonb_agg(jsonb_build_object('sede', u.sede,
                                 'cuadrado', retail.fn_ultimo_cuadre_piso(u.id) is not null,
                                 'cuadrado_el', (retail.fn_ultimo_cuadre_piso(u.id) at time zone 'America/Lima')::date,
                                 'fotos', coalesce(f.n, 0), 'fotos_cuadradas', coalesce(f.n_cuadradas, 0)) order by u.sede)
      from ubi u left join fotos f on f.sede = u.sede where u.tipo = 'tienda'), '[]'::jsonb),
  'vara', coalesce((select jsonb_agg(jsonb_build_object('t', m.nombre,
                                 'p50', round((v.p50 / 86400.0)::numeric, 1),
                                 'p75', round((coalesce(v.p75, case when v.p50 is not null and v.vendidas >= 10 and kf.t_fin > 0 and kf.h_fin > 0 and kf.s_fin > 0.25
                                                                    then kf.t_fin + ln(kf.s_fin / 0.25) / (kf.h_fin / kf.t_fin) end) / 86400.0)::numeric, 1),
                                 'p75_cola', (v.p75 is null),
                                 'p90', round((coalesce(v.p90, case when v.p50 is not null and v.vendidas >= 10 and kf.t_fin > 0 and kf.h_fin > 0 and kf.s_fin > 0.1
                                                                    then kf.t_fin + ln(kf.s_fin / 0.1) / (kf.h_fin / kf.t_fin) end) / 86400.0)::numeric, 1),
                                 'p90_cola', (v.p90 is null),
                                 'vendidas', round(v.vendidas::numeric), 'unidades', round(vm.unidades), 'ventana', vm.ventana_dias,
                                 'calculada', (vm.calculada_en at time zone 'America/Lima')::date,
                                 'vigente', (vm.calculada_en >= now() - interval '3 days')) order by v.p50 nulls last, m.nombre)
      from vara v
      join retail.categorias m on m.id = v.madre_id
      left join km_fin kf on kf.madre_id = v.madre_id
      left join vara_meta vm on vm.madre_id = v.madre_id), '[]'::jsonb),
  'modelos', coalesce((select jsonb_agg(jsonb_build_object('t', m.nombre, 'cod', pr.codigo, 'n', pr.referencia, 'marca', ma.nombre,
                                   'nuevo', pr.created_at >= (select desde_ts from w),
                                   'v', jsonb_build_array(coalesce((select sum(u) from mod_v x where x.producto_id = k.producto_id and x.sede = 'TRU'), 0),
                                                          coalesce((select sum(u) from mod_v x where x.producto_id = k.producto_id and x.sede = 'AQP'), 0),
                                                          coalesce((select sum(u) from mod_v x where x.producto_id = k.producto_id and x.sede = 'LIM'), 0)),
                                   'h', jsonb_build_array(coalesce((select sum(disp) from mod_s x where x.producto_id = k.producto_id and x.sede = 'TRU'), 0),
                                                          coalesce((select sum(disp) from mod_s x where x.producto_id = k.producto_id and x.sede = 'AQP'), 0),
                                                          coalesce((select sum(disp) from mod_s x where x.producto_id = k.producto_id and x.sede = 'LIM'), 0),
                                                          coalesce((select sum(disp) from mod_s x where x.producto_id = k.producto_id and x.sede = 'Taller'), 0)),
                                   'col', coalesce(mc.cols, '[]'::jsonb))
                                 order by m.nombre, pr.referencia)
      from mod_k k
      join retail.productos pr on pr.id = k.producto_id
      join cat c on c.id = pr.categoria_id
      join retail.categorias m on m.id = c.madre_id
      left join retail.marcas ma on ma.id = pr.marca_id
      left join mod_col mc on mc.producto_id = k.producto_id), '[]'::jsonb),
  'control', jsonb_build_object(
      'ventas_28', (select coalesce(sum(u), 0) from todas where en28),
      'stock', (select coalesce(sum(disp), 0) from st),
      'ventas_todas', (select coalesce(sum(u), 0) from todas))
) as gustos
