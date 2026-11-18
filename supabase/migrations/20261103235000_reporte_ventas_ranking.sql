-- Ventas ▸ Reportes ▸ Ranking de prendas: la lectura (Felipe, 2026-11-03; maqueta docs/maquetas/reportes-ventas-2026-11/).
--
-- `retail.fn_reporte_ventas_ranking(...)` devuelve, en UN jsonb, el ranking de lo que más se vende en un rango de fechas, con sus filtros:
-- tienda, categoría, marca, talla, color y búsqueda; por MODELO o por COLOR Y TALLA; ordenado por unidades o por soles; paginado. Trae además lo que
-- el ranking necesita para leerse: el total de lo filtrado y el de todo el período (para decir «es el 12 % de lo vendido»), los diez primeros
-- (para «unos pocos sostienen la venta»), cuánto se vendió en el período anterior del MISMO largo (para «vs el período anterior»), lo que queda en
-- las tiendas y las tallas y los colores que más se llevan CON ESOS MISMOS filtros.
-- Hermana de las tres lecturas de «Ventas del mes» (20261103230000, 232000 y 233000): MISMA regla de qué cuenta como venta (completadas, sin
-- pruebas, días de Lima), MISMA puerta (módulo `reportes_ventas`, 42501) y MISMA forma de ver (INVOKER: el líder lee todas las tiendas y quien
-- tiene el módulo, la suya).
--
-- QUÉ ENTRA AL RANKING. Solo lo que es un modelo registrado y de una familia que entra a los motores (`fn_categoria_entra_a_motores`, ADR-0377):
--   · la bolsa de obsequio y el empaque NO entran (son una venta real, pero no una prenda que se ordene por ventas);
--   · la «prenda sin registrar» del mostrador (producto sin categoría) NO es un modelo: no se puede decir CUÁL se vendió. Se cuenta aparte
--     (`sin_registrar`), para que la pantalla diga cuántas faltan en vez de esconderlas: en octubre de 2026 eran el 38 % de lo vendido.
-- El ranking nunca devuelve costo ni margen (eso es del líder, dentro de Análisis, ADR-0328).
--
-- LA BARRA. `mayor` es la fila que más vendió (la primera de todas, no de la página), para que la barra de cada fila se mida contra ella en cualquier página.
-- LA PRIMERA VENTA. `primera_venta` es el día de la primera venta que la cuenta ve: la pantalla no compara contra un período anterior que empezó
-- ANTES de que se vendiera (comparar un mes entero con unos pocos días da porcentajes de miles), igual que «Ventas del mes».
-- «QUEDAN». Lo que hay hoy en las TIENDAS (no el almacén ni el taller) de las prendas de cada fila; con una tienda elegida, en esa tienda. Con talla o
-- color filtrados, solo de esas variantes. En «por color y talla», de esa variante.
-- Límites: el rango no pasa de 400 días, se muestran hasta 50 filas por página, y un valor que no es de la lista (nivel, orden) es 22023.
-- Sin `security definer` ni `set search_path` (ver la cabecera de 20261103230000). Pegado en producción: un `create or replace function` y dos permisos.
set lock_timeout = '3s';

create or replace function retail.fn_reporte_ventas_ranking(
  p_desde date,
  p_hasta date,
  p_ubicacion uuid default null,
  p_categoria uuid default null,
  p_marca uuid default null,
  p_talla uuid default null,
  p_color text default null,
  p_busqueda text default null,
  p_nivel text default 'modelo',
  p_orden text default 'unidades',
  p_pagina int default 0,
  p_por_pagina int default 10
)
returns jsonb
language plpgsql
stable
as $fn$
declare
  v_dias int;
  v_ant_desde date;
  v_ant_hasta date;     -- fin (exclusivo) del período anterior = el inicio de este
  v_q text;
  v_res jsonb;
begin
  if p_desde is null or p_hasta is null or p_hasta <= p_desde then
    raise exception 'El rango de fechas no es válido.' using errcode = '22023';
  end if;
  if p_hasta - p_desde > 400 then
    raise exception 'El rango no puede pasar de 400 días.' using errcode = '22023';
  end if;
  if p_nivel not in ('modelo', 'variante') or p_orden not in ('unidades', 'soles') then
    raise exception 'El nivel o el orden del ranking no es válido.' using errcode = '22023';
  end if;
  if p_pagina is null or p_pagina < 0 or p_por_pagina is null or p_por_pagina < 1 or p_por_pagina > 50 then
    raise exception 'La página o su tamaño no son válidos.' using errcode = '22023';
  end if;
  if not coalesce(retail.fn_ve_modulo('reportes_ventas'), false) then
    raise exception 'Tu rol no ve los Reportes de ventas.' using errcode = '42501';
  end if;

  v_dias := p_hasta - p_desde;
  v_ant_hasta := p_desde;
  v_ant_desde := p_desde - v_dias;
  v_q := nullif(lower(btrim(coalesce(p_busqueda, ''))), '');

  with ventanas(k, d, h) as (
    values ('actual', p_desde, p_hasta), ('anterior', v_ant_desde, v_ant_hasta)
  ),
  det as (
    select w.k, i.cantidad, i.subtotal, va.producto_id, va.color_codigo, va.talla_id,
           pr.categoria_id, pr.marca_id, pr.referencia, pr.codigo
    from ventanas w
    join retail.ventas vt
      on vt.created_at >= (w.d::timestamp at time zone 'America/Lima')
     and vt.created_at <  (w.h::timestamp at time zone 'America/Lima')
    join retail.venta_items i on i.venta_id = vt.id
    join retail.variantes va on va.id = i.variante_id
    join retail.productos pr on pr.id = va.producto_id
    where vt.estado = 'completada' and not vt.es_prueba
      and (p_ubicacion is null or vt.ubicacion_id = p_ubicacion)
  ),
  sinreg as (
    select coalesce(sum(cantidad), 0) as unidades, coalesce(round(sum(subtotal), 2), 0) as vendido
    from det where k = 'actual' and categoria_id is null
  ),
  cats as (select c.id from retail.categorias c where retail.fn_categoria_entra_a_motores(c.id)),
  base as (select d.* from det d join cats on cats.id = d.categoria_id),
  total_per as (
    select coalesce(sum(cantidad), 0) as unidades, coalesce(round(sum(subtotal), 2), 0) as vendido
    from base where k = 'actual'
  ),
  f as (
    select * from base
    where (p_categoria is null or categoria_id = p_categoria)
      and (p_marca is null or marca_id = p_marca)
      and (p_talla is null or talla_id = p_talla)
      and (p_color is null or color_codigo = p_color)
      and (v_q is null or position(v_q in lower(referencia)) > 0 or position(v_q in lower(coalesce(codigo, ''))) > 0)
  ),
  g as (
    select k, producto_id,
           case when p_nivel = 'variante' then color_codigo end as color_codigo,
           case when p_nivel = 'variante' then talla_id end as talla_id,
           sum(cantidad) as u, sum(subtotal) as v
    from f
    group by k, producto_id, case when p_nivel = 'variante' then color_codigo end, case when p_nivel = 'variante' then talla_id end
  ),
  act as (
    select a.producto_id, a.color_codigo, a.talla_id, a.u, a.v, coalesce(b.u, 0) as u_ant, coalesce(b.v, 0) as v_ant
    from g a
    left join g b
      on b.k = 'anterior' and b.producto_id = a.producto_id
     and b.color_codigo is not distinct from a.color_codigo and b.talla_id is not distinct from a.talla_id
    where a.k = 'actual'
  ),
  clasif as (
    select a.*,
           row_number() over (
             order by (case when p_orden = 'soles' then a.v else a.u end)::numeric desc, a.v desc, a.u desc, pr.referencia, a.color_codigo, a.talla_id
           ) as pos
    from act a join retail.productos pr on pr.id = a.producto_id
  ),
  top10 as (
    select coalesce(sum(u), 0) as u, coalesce(round(sum(v), 2), 0) as v from clasif where pos <= 10
  ),
  pagina as (
    select * from clasif where pos > p_pagina * p_por_pagina and pos <= (p_pagina + 1) * p_por_pagina
  ),
  st as (
    select s.variante_id, sum(s.cantidad) as q
    from retail.stock s join retail.ubicaciones u on u.id = s.ubicacion_id
    where u.tipo = 'tienda' and (p_ubicacion is null or s.ubicacion_id = p_ubicacion)
    group by s.variante_id
  ),
  filas as (
    select pg.pos, pg.producto_id, pg.color_codigo, pg.talla_id, pg.u, pg.v, pg.u_ant, pg.v_ant,
           pr.referencia, pr.codigo, ca.nombre as categoria, ca.prefijo as categoria_prefijo, ca.familia as categoria_familia,
           ma.nombre as marca, co.nombre as color_nombre, co.hex as color_hex, ta.valor as talla,
           (select dom.hex from (
              select co2.hex, sum(f2.cantidad) as uu
              from f f2 join retail.colores co2 on co2.codigo = f2.color_codigo
              where f2.k = 'actual' and f2.producto_id = pg.producto_id
              group by co2.hex order by uu desc, co2.hex limit 1) dom) as color_principal_hex,
           (select coalesce(sum(st.q), 0)
            from retail.variantes va join st on st.variante_id = va.id
            where va.producto_id = pg.producto_id
              and (p_nivel = 'modelo' or (va.color_codigo = pg.color_codigo and va.talla_id = pg.talla_id))
              and (p_talla is null or va.talla_id = p_talla)
              and (p_color is null or va.color_codigo = p_color)) as stock
    from pagina pg
    join retail.productos pr on pr.id = pg.producto_id
    left join retail.categorias ca on ca.id = pr.categoria_id
    left join retail.marcas ma on ma.id = pr.marca_id
    left join retail.colores co on co.codigo = pg.color_codigo
    left join retail.tallas ta on ta.id = pg.talla_id
  ),
  tallas_s as (
    select ta.valor, sum(f.cantidad) as u
    from f join retail.tallas ta on ta.id = f.talla_id
    where f.k = 'actual'
    group by ta.valor
  ),
  colores_s as (
    select co.codigo, co.nombre, co.hex, sum(f.cantidad) as u
    from f join retail.colores co on co.codigo = f.color_codigo
    where f.k = 'actual'
    group by co.codigo, co.nombre, co.hex
    order by u desc, co.codigo
    limit 8
  )
  select jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'anterior', jsonb_build_object('desde', v_ant_desde, 'hasta', v_ant_hasta),
    'total', (select jsonb_build_object('unidades', coalesce(sum(u), 0), 'vendido', coalesce(round(sum(v), 2), 0)) from act),
    'total_periodo', (select jsonb_build_object('unidades', unidades, 'vendido', vendido) from total_per),
    'sin_registrar', (select jsonb_build_object('unidades', unidades, 'vendido', vendido) from sinreg),
    'primera_venta', (select min((vt.created_at at time zone 'America/Lima')::date) from retail.ventas vt
                      where vt.estado = 'completada' and not vt.es_prueba and (p_ubicacion is null or vt.ubicacion_id = p_ubicacion)),
    'cuantos', (select count(*) from act),
    'primeros_diez', (select jsonb_build_object('unidades', u, 'vendido', v) from top10),
    'mayor', (select jsonb_build_object('unidades', u, 'vendido', round(v, 2)) from clasif where pos = 1),
    'filas', (select coalesce(jsonb_agg(jsonb_build_object(
        'pos', pos, 'producto_id', producto_id, 'nombre', referencia, 'codigo', codigo,
        'categoria', categoria, 'categoria_prefijo', categoria_prefijo, 'categoria_familia', categoria_familia, 'marca', marca,
        'color_codigo', color_codigo, 'color_nombre', color_nombre, 'color_hex', coalesce(color_hex, color_principal_hex), 'talla', talla,
        'unidades', u, 'vendido', round(v, 2), 'unidades_ant', u_ant, 'vendido_ant', round(v_ant, 2), 'stock', stock) order by pos), '[]'::jsonb) from filas),
    'tallas', (select coalesce(jsonb_agg(jsonb_build_object('talla', valor, 'unidades', u) order by u desc, valor), '[]'::jsonb) from tallas_s),
    'colores', (select coalesce(jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre, 'hex', hex, 'unidades', u) order by u desc, codigo), '[]'::jsonb) from colores_s)
  ) into v_res;

  return v_res;
end
$fn$;

revoke all on function retail.fn_reporte_ventas_ranking(date, date, uuid, uuid, uuid, uuid, text, text, text, text, int, int) from public, anon;
grant execute on function retail.fn_reporte_ventas_ranking(date, date, uuid, uuid, uuid, uuid, text, text, text, text, int, int) to authenticated;

comment on function retail.fn_reporte_ventas_ranking(date, date, uuid, uuid, uuid, uuid, text, text, text, text, int, int) is
  'Ventas ▸ Reportes ▸ Ranking de prendas: lo que más se vende en un rango, con filtros, por modelo o por color y talla, contra el período anterior del mismo largo. Invoker; exige el módulo reportes_ventas.';
