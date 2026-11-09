-- scripts/pruebas/_antes_catalogo_una_regla.sql — el cuerpo de main ANTES de 20261109181000 (una sola regla) de tienda_catalogo, que las
-- suites de la tienda vuelven a pegar con reemplazos anclados. Solo lo usa _deshacer_catalogo_una_regla.mjs, dentro de una transacción
-- que se deshace. Generado con pg_get_functiondef desde una base con main al 2026-11-09 (beb1e9e7f).

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
begin
  v_sede := retail.fn_tienda_sede_elegida(p_sede, v_sedes);
  -- Las empresas que se ven en esa tienda, leídas una vez por carga (antes, una vez por prenda; 20261031161000).
  v_empresas := array(select e.id from retail.fn_empresas_de_sede(v_sede) as e);
  v_ids := array(select vp.producto_id from retail.vitrina_productos vp
                  where vp.publicado and retail.fn_vitrina_publicable(vp.producto_id)
                  -- Lo mismo que la regla fn_tienda_empresa_se_ve para esta tienda, con la lista ya leída.
                  and exists (select 1 from retail.productos pe where pe.id = vp.producto_id and pe.empresa_id = any (v_empresas)));

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
    nuevo as (select * from retail.fn_tienda_lo_nuevo(v_ids)),
    vendidos as (select * from retail.fn_tienda_mas_vendidos(v_ids)),
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
      select d.producto_id, sum(d.n) as n from disponible d group by d.producto_id
    ),
    -- El nivel en cada tienda de la web, también las que no tienen nada (nivel de 0).
    sedes_de as (
      select m.id as producto_id,
             jsonb_object_agg(s.id::text, retail.fn_tienda_nivel(coalesce(d.n, 0), v_umbral)) as sedes
        from modelos m
        cross join unnest(v_sedes) as s (id)
        left join disponible d on d.producto_id = m.id and d.ubicacion_id = s.id
       group by m.id
    )
    select jsonb_build_object('sede', v_sede, 'prendas', coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id,
        'codigo', p.codigo,
        'nombre', p.referencia,
        'categoria_familia', c.familia,
        'categoria', case when c.id is null then null else jsonb_build_object('nombre', c.nombre, 'prefijo', c.prefijo) end,
        -- ADR-0465: de qué empresa es la prenda (CAYLA o CLAURE), para su tarjeta, solo en una tienda donde operan dos o más empresas (Lima).
        'empresa', case when (select count(*) from retail.fn_empresas_de_sede(v_sede)) > 1
                        then (select jsonb_build_object('clave', em.clave, 'nombre', em.nombre) from retail.empresas em where em.id = p.empresa_id) end,
        'precio', m.precio,
        'precio_final', m.final,
        'desde', m.desde,
        'campana', m.campana,
        'colores', coalesce(cd.colores, '[]'::jsonb),
        'fotos', coalesce(fd.fotos, '[]'::jsonb),
        'stock', jsonb_build_object(
          'total', retail.fn_tienda_nivel(coalesce(td.n, 0)::integer, v_umbral),
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
    left join sedes_de sd on sd.producto_id = m.id
    left join nuevo ln on ln.producto_id = m.id
    left join vendidos mv on mv.producto_id = m.id
    left join insignias_de ins on ins.producto_id = m.id
  );
end;
$function$;
