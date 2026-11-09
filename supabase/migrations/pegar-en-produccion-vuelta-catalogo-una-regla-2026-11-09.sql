-- CAMINO DE VUELTA de 20261109181000_tienda_catalogo_una_sola_regla.sql (2026-11-09). NO es una migración: se pega solo si hace falta
-- volver atrás, y el CLI y el CI de migraciones no lo corren.
--
-- QUÉ HACE. Deja fn_tienda_lo_nuevo, fn_tienda_mas_vendidos y tienda_catalogo exactamente como estaban en producción antes de
-- 20261109181000: las dos reglas escritas talla por talla (las de 20261015013000) y el catálogo con su propia copia de las dos reglas
-- (leído de producción con pg_get_functiondef el 2026-11-09). Una sola parte, re-ejecutable, solo create or replace y comment.
--
-- CUÁNDO. Si después de pegar 20261109181000 la tienda web muestra algo distinto o tarda más de lo medido (unos 350 ms el catálogo).
-- VERIFICACIÓN: el mismo md5 del catálogo por sede del PR, que debe volver al de antes de pegar.

set lock_timeout = '3s';


CREATE OR REPLACE FUNCTION retail.fn_tienda_lo_nuevo(p_producto_ids uuid[])
 RETURNS TABLE(producto_id uuid, dias integer, llego timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'retail', 'public'
AS $function$
  with llegada as (
    select v.producto_id, min(m.created_at) as primera
      from retail.movimientos m
      join retail.variantes v on v.id = m.variante_id
      join retail.ubicaciones u on u.id = m.ubicacion_id
     where v.producto_id = any (coalesce(p_producto_ids, '{}'::uuid[]))
       and u.tipo = 'tienda'
       and retail.fn_es_llegada(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)
     group by v.producto_id
  ),
  modelos as (
    select p.id, vp.en_lo_nuevo, ll.primera,
           retail.fn_hoy_lima() - (ll.primera at time zone 'America/Lima')::date as dias
      from retail.productos p
      join retail.vitrina_productos vp on vp.producto_id = p.id
      left join llegada ll on ll.producto_id = p.id
     where p.id = any (coalesce(p_producto_ids, '{}'::uuid[]))
       and retail.fn_categoria_entra_a_motores(p.categoria_id)
  )
  select m.id, case when m.dias between 0 and 30 then m.dias end, m.primera
    from modelos m
   where m.en_lo_nuevo = 'fijo'
      or (m.en_lo_nuevo = 'automatico' and m.dias between 0 and 30)
$function$;

comment on function retail.fn_tienda_lo_nuevo(uuid[]) is
  'Tienda online (ADR-0408, DECIDÍ 7): LA regla de «nuevo». Los modelos en «Lo nuevo» — primer ingreso a una tienda (fn_es_llegada: sin el Taller ni las devoluciones) hace 30 días o menos, o fijados en la Vitrina; nunca los quitados ni las familias fuera de los motores — con hace cuántos días llegaron (solo hasta 30) y cuándo fue esa primera llegada (llego). Interna: la usan tienda_catalogo (solo los días) y fn_tienda_novedades («Novedades para ti»: lo que llegó desde la visita anterior).';

CREATE OR REPLACE FUNCTION retail.fn_tienda_mas_vendidos(p_producto_ids uuid[])
 RETURNS TABLE(producto_id uuid, puesto integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'retail', 'public'
AS $function$
  with vendidas as (
    select v.producto_id, sum(m.cantidad) as unidades
      from retail.movimientos m
      join retail.variantes v on v.id = m.variante_id
     where m.tipo = 'salida' and m.motivo = 'venta'
       and m.created_at >= now() - interval '30 days'
       and v.producto_id = any (coalesce(p_producto_ids, '{}'::uuid[]))
     group by v.producto_id
  ),
  ranking as (
    select vd.producto_id, row_number() over (order by vd.unidades desc, p.referencia, p.id) as puesto
      from vendidas vd
      join retail.productos p on p.id = vd.producto_id
     where vd.unidades > 0
       and retail.fn_categoria_entra_a_motores(p.categoria_id)
  )
  select r.producto_id, r.puesto::integer from ranking r where r.puesto <= 20
$function$;

comment on function retail.fn_tienda_mas_vendidos(uuid[]) is
  'Tienda online (ADR-0408): el puesto (1 a 20) de cada modelo en «Más vendidos» — unidades vendidas en 30 días en toda la red, la definición del orden de Catálogo ▸ Productos —, sin las familias fuera de los motores. Solo el puesto sale de la base, nunca las unidades. Interna: la usa tienda_catalogo.';

CREATE OR REPLACE FUNCTION retail.tienda_catalogo(p_sede uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public'
AS $function$
declare
  v_sedes uuid[] := retail.fn_tienda_sedes_web();
  v_umbral integer := retail.fn_tienda_umbral();
  v_sede uuid;
  v_ids uuid[];
  v_empresas uuid[];
  v_sin_motores uuid[];
  v_en_taller uuid[];
begin
  v_sede := retail.fn_tienda_sede_elegida(p_sede, v_sedes);
  -- Las empresas que se ven en esa tienda, leídas una vez por carga (antes, una vez por prenda; 20261031161000).
  v_empresas := array(select e.id from retail.fn_empresas_de_sede(v_sede) as e);
  -- Las categorías que NO entran a los motores (bolsas, cajas, empaque), preguntadas una vez por categoría a la regla
  -- fn_categoria_entra_a_motores (antes, una vez por prenda y por motor; 20261107191000). Sin categoría o sin dato: entra.
  v_sin_motores := array(select c.id from retail.categorias c where not retail.fn_categoria_entra_a_motores(c.id));
  -- Las prendas publicadas que todavía no llegan a una tienda (etapa «en_produccion» o «terminada», ADR-0614), preguntadas JUNTAS a
  -- fn_productos_por_etapa (antes, una llamada por prenda, y cada una recorre stock y movimientos: ~10 ms por prenda con orden en el Taller).
  v_en_taller := array(
    select e.producto_id
      from retail.fn_productos_por_etapa(
             array(select distinct o.producto_id
                     from retail.producciones o
                     join retail.vitrina_productos vq on vq.producto_id = o.producto_id and vq.publicado
                    where o.estado <> 'anulada')) e
     where e.etapa in ('en_produccion', 'terminada'));
  -- Las prendas que se ven. Lo barato primero, en una sola pasada por las tablas, y la regla fn_vitrina_publicable (que por prenda
  -- abre cinco funciones) solo para la prenda que la pasada no deja en claro (una con orden en el Taller, sin precio en su ficha...).
  -- La pasada solo dice «sí» cuando la regla dice «sí» con seguridad (cada condición de abajo es una negación de un «no» de
  -- fn_vitrina_por_que_no); nunca dice «no»: lo que no tiene claro lo decide la regla.
  v_ids := array(
    select vp.producto_id
      from retail.vitrina_productos vp
      join retail.productos pe on pe.id = vp.producto_id and pe.empresa_id = any (v_empresas)
     where vp.publicado
       and pe.id <> all (v_en_taller)
       and ((pe.estado = 'activo' and pe.estado_alta is distinct from 'rechazado' and pe.es_prueba is not true
             and pe.id <> '11111111-1111-4111-8111-111111111111'
             and coalesce(pe.categoria_id <> all (v_sin_motores), true)
             and exists (select 1 from retail.variantes va where va.producto_id = pe.id and va.activo and va.precio > 0))
            or retail.fn_vitrina_publicable(vp.producto_id)));

  return (
    with pv as materialized (
      select * from retail.fn_tienda_precios(v_ids, v_sede)
    ),
    modelos as materialized (
      select distinct on (pv.producto_id)
             pv.producto_id as id, pv.resumen_precio as precio, pv.resumen_final as final, pv.resumen_desde as desde,
             pv.resumen_campana as campana
        from pv
       order by pv.producto_id
    ),
    disponible as materialized (
      select d.producto_id, d.ubicacion_id, sum(d.disponible)::integer as n
        from retail.fn_tienda_disponible(v_ids, v_sedes) d
       where d.variante_id in (select pv.variante_id from pv)
       group by d.producto_id, d.ubicacion_id
    ),
    -- Los movimientos que hablan de «lo nuevo» (la llegada a una tienda) y de «lo más vendido» (la venta de los últimos 30 días),
    -- leídos UNA vez y juntos. Antes cada motor (fn_tienda_lo_nuevo y fn_tienda_mas_vendidos) recorría a su manera los movimientos
    -- de cada talla de cada prenda: ~3 200 búsquedas por motor, ~14 000 bloques cada uno.
    mov as materialized (
      select m.variante_id, m.ubicacion_id, m.created_at, m.cantidad,
             retail.fn_es_llegada(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id) as llegada,
             (m.tipo = 'salida' and m.motivo = 'venta' and m.created_at >= now() - interval '30 days') as venta
        from retail.movimientos m
       where retail.fn_es_llegada(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)
          or (m.tipo = 'salida' and m.motivo = 'venta' and m.created_at >= now() - interval '30 days')
    ),
    por_prenda as materialized (
      select va.producto_id,
             min(mo.created_at) filter (where mo.llegada and u.tipo = 'tienda') as primera,
             sum(mo.cantidad) filter (where mo.venta) as unidades
        from mov mo
        join retail.variantes va on va.id = mo.variante_id
        left join retail.ubicaciones u on u.id = mo.ubicacion_id
       where va.producto_id = any (v_ids)
       group by va.producto_id
    ),
    -- Lo mismo que fn_tienda_lo_nuevo: lo fijo, y lo automático que llegó a una tienda hace entre 0 y 30 días.
    nuevo as (
      select p.id as producto_id, case when x.dias between 0 and 30 then x.dias end as dias
        from retail.productos p
        join retail.vitrina_productos vp on vp.producto_id = p.id
        left join por_prenda pp on pp.producto_id = p.id
        cross join lateral (select retail.fn_hoy_lima() - (pp.primera at time zone 'America/Lima')::date as dias) x
       where p.id = any (v_ids)
         and coalesce(p.categoria_id <> all (v_sin_motores), true)
         and (vp.en_lo_nuevo = 'fijo' or (vp.en_lo_nuevo = 'automatico' and x.dias between 0 and 30))
    ),
    -- Lo mismo que fn_tienda_mas_vendidos: las 20 prendas con más unidades vendidas en 30 días.
    vendidos as (
      select r.producto_id, r.puesto::integer as puesto
        from (select pp.producto_id,
                     row_number() over (order by pp.unidades desc, p.referencia, p.id) as puesto
                from por_prenda pp
                join retail.productos p on p.id = pp.producto_id
               where pp.unidades > 0
                 and coalesce(p.categoria_id <> all (v_sin_motores), true)) r
       where r.puesto <= 20
    ),
    insignias_de as (select * from retail.fn_tienda_insignias_de(v_ids, v_sede, v_sedes)),
    foto_ok as materialized (
      select pf.producto_id, pf.color_codigo, pf.url, pf.es_principal, pf.orden, pf.created_at, pf.id
        from retail.producto_fotos pf
       where pf.producto_id = any (v_ids)
         and pf.url ~ '^https?://[^/?#]+/storage/v1/object/public/retail-productos-fotos/'
    ),
    -- Lo de cada prenda se arma UNA vez, agrupado por prenda, y se junta por su id (20261017173000). Antes, cada prenda recorría
    -- enteras `pv`, `foto_ok` y `disponible` en subconsultas propias.
    -- La foto de cada color: la principal, luego por orden, fecha e id (la misma elección de antes).
    foto_de_color as (
      select distinct on (fo.producto_id, fo.color_codigo) fo.producto_id, fo.color_codigo, fo.url
        from foto_ok fo
       order by fo.producto_id, fo.color_codigo, fo.es_principal desc, fo.orden, fo.created_at, fo.id
    ),
    -- Los colores de la prenda que se ofrecen (los de sus tallas en `pv`), en el orden del catálogo de colores.
    colores_de as (
      select x.producto_id,
             jsonb_agg(jsonb_build_object('codigo', co.codigo, 'nombre', co.nombre, 'hex', co.hex, 'foto', fc.url)
                       order by co.orden, co.nombre) as colores
        from (select distinct pv.producto_id, pv.color_codigo from pv) x
        join retail.colores co on co.codigo = x.color_codigo
        left join foto_de_color fc on fc.producto_id = x.producto_id and fc.color_codigo = co.codigo
       group by x.producto_id
    ),
    -- Sus dos primeras fotos, con el mismo orden de la foto de cada color.
    fotos_de as (
      select f.producto_id, jsonb_agg(f.url order by f.n) as fotos
        from (select fo.producto_id, fo.url,
                     row_number() over (partition by fo.producto_id
                                        order by fo.es_principal desc, fo.orden, fo.created_at, fo.id) as n
                from foto_ok fo) f
       where f.n <= 2
       group by f.producto_id
    ),
    total_de as (
      select d.producto_id, sum(d.n)::integer as n from disponible d group by d.producto_id
    ),
    -- El nivel («0», la cifra o «hay») de cada cantidad que aparece, preguntado UNA vez por cantidad a la regla fn_tienda_nivel
    -- (antes, una vez por prenda y por tienda: ~1 800 llamadas para ~30 cantidades distintas).
    niveles as materialized (
      select c.n, retail.fn_tienda_nivel(c.n, v_umbral) as nivel
        from (select 0 as n
              union select d.n from disponible d
              union select t.n from total_de t) c
    ),
    -- El nivel en cada tienda de la web, también las que no tienen nada (nivel de 0).
    sedes_de as (
      select m.id as producto_id,
             jsonb_object_agg(s.id::text, nv.nivel) as sedes
        from modelos m
        cross join unnest(v_sedes) as s (id)
        left join disponible d on d.producto_id = m.id and d.ubicacion_id = s.id
        join niveles nv on nv.n = coalesce(d.n, 0)
       group by m.id
    )
    select jsonb_build_object('sede', v_sede, 'prendas', coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id,
        'codigo', p.codigo,
        'nombre', p.referencia,
        'categoria_familia', c.familia,
        'categoria', case when c.id is null then null else jsonb_build_object('nombre', c.nombre, 'prefijo', c.prefijo) end,
        -- ADR-0465: de qué empresa es la prenda (CAYLA o CLAURE), para su tarjeta, solo en una tienda donde operan dos o más empresas (Lima).
        'empresa', case when cardinality(v_empresas) > 1
                        then (select jsonb_build_object('clave', em.clave, 'nombre', em.nombre) from retail.empresas em where em.id = p.empresa_id) end,
        'precio', m.precio,
        'precio_final', m.final,
        'desde', m.desde,
        'campana', m.campana,
        'colores', coalesce(cd.colores, '[]'::jsonb),
        'fotos', coalesce(fd.fotos, '[]'::jsonb),
        'stock', jsonb_build_object(
          'total', nt.nivel,
          'sedes', coalesce(sd.sedes, '{}'::jsonb)),
        'nuevo', case when ln.producto_id is not null then jsonb_build_object('dias', ln.dias) end,
        'insignias', coalesce(ins.insignias, '[]'::jsonb),
        'vendidos', mv.puesto
      ) order by vp.publicado_en desc, p.referencia, m.id), '[]'::jsonb))
    from modelos m
    join retail.productos p on p.id = m.id
    join retail.vitrina_productos vp on vp.producto_id = m.id
    left join retail.categorias c on c.id = p.categoria_id
    left join colores_de cd on cd.producto_id = m.id
    left join fotos_de fd on fd.producto_id = m.id
    left join total_de td on td.producto_id = m.id
    left join niveles nt on nt.n = coalesce(td.n, 0)
    left join sedes_de sd on sd.producto_id = m.id
    left join nuevo ln on ln.producto_id = m.id
    left join vendidos mv on mv.producto_id = m.id
    left join insignias_de ins on ins.producto_id = m.id
  );
end;
$function$;
