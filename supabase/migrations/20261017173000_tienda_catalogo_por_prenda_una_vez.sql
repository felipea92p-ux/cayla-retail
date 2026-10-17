-- ============================================================================
-- 20261017173000_tienda_catalogo_por_prenda_una_vez.sql — CAYLA V2 · Tienda online (ADR-0408), optimización de carga (2026-10-17)
--
-- EL PROBLEMA PRIMERO. Con el precio calculado una vez (20261017171000) y la revisión de cada prenda sin volver a planearse
-- (20261017172000), lo que más le quedaba a `tienda_catalogo` era su propio armado: 283 ms de los ~1,9 s medidos en producción el
-- 17-oct (`pg_stat_xact_user_functions`, tiempo propio). Para CADA una de las 298 prendas, el JSON se armaba con subconsultas que
-- recorrían enteras las tablas intermedias de la llamada: las 1 773 tallas con su precio (para saber sus colores), todas las fotos
-- (para la foto de cada color y las dos primeras) y todo el stock por tienda (para el total y para cada tienda). 298 × miles de filas.
--
-- ANALOGÍA CAYLA. Para escribir la etiqueta de cada prenda, la vendedora volvía a revisar el almacén completo buscando sus colores, sus
-- fotos y su stock. Se ordena el almacén una vez por prenda y después cada etiqueta se escribe mirando solo su caja.
--
-- QUÉ HACE. Reescribe `tienda_catalogo` para que lo de cada prenda (sus colores con su foto, sus dos fotos, su stock total y por tienda,
-- Lo nuevo y Más vendidos) se arme UNA vez, agrupado por prenda, y se junte por su id. Lo que devuelve es exactamente lo mismo: mismas
-- claves, mismos valores, mismo orden de prendas, de colores y de fotos, `[]` y `{}` donde antes. Medido contra los datos de producción
-- con una copia temporal (sin tocar la viva): el JSON nuevo es idéntico byte a byte al de hoy con «Todas» y con cada tienda de la web.
--
-- DECIDÍ: un reemplazo entero con candado de md5 (el patrón de ADR-0404): si la función viva no es la que se midió, se detiene sin
--   tocar nada; si ya tiene el armado nuevo, la vuelve a escribir igual (se puede pegar dos veces). La firma, el dueño, los permisos
--   (solo `tienda_web`) y el comentario no cambian (`create or replace`).
-- DESCARTÉ: guardar el JSON del catálogo en una tabla y refrescarla (un dato derivado que se queda viejo: lo prohíbe el principio 4; la
--   tienda ya lo comparte 30 s entre visitas, `lib/catalogo-servidor.ts`), e índices sobre las tablas (la lentitud estaba en recorrer las
--   tablas intermedias de la llamada, que no tienen índices).
--
-- SE ROMPE SI: alguien vuelve a armar lo de cada prenda con subconsultas que recorren todo (vuelve la lentitud, no un error) o cambia lo
--   que devuelve sin querer. Lo vigila `pnpm pruebas:tienda-rapida` (sección 3: compara el JSON contra la versión de antes, tal cual,
--   con prendas de prueba en varios colores, fotos, campañas y stock en varias tiendas, con «Todas», con una tienda y sin tiendas en la
--   web), además de lo que ya probaban `pruebas:tienda-inicio`, `pruebas:vitrina-web`, `pruebas:tienda-ficha` y `pruebas:vitrina-looks`.
--
-- PRODUCCIÓN. Se aplica con el OK de Felipe (2026-10-17) después de 20261017172000. Una sola parte, sin políticas, disparadores ni
-- `alter` de tablas (ADR-0195); ningún texto entre comillas lleva la palabra con que se guarda una consulta en una variable (ADR-0288).
-- ============================================================================
set lock_timeout = '3s';

do $candado$
declare
  v_def text := pg_get_functiondef('retail.tienda_catalogo(uuid)'::regprocedure);
begin
  if position('colores_de as (' in v_def) > 0 then
    raise notice 'tienda_catalogo ya arma lo de cada prenda una sola vez: se vuelve a escribir igual.';
  elsif md5(v_def) <> 'c88267810363f873024446590c1bc49b' then
    raise exception 'tienda_catalogo cambió desde que se midió (md5 %). No se tocó nada.', md5(v_def);
  end if;
end
$candado$;

create or replace function retail.tienda_catalogo(p_sede uuid default null::uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'retail', 'public'
as $function$
declare
  v_sedes uuid[] := retail.fn_tienda_sedes_web();
  v_umbral integer := retail.fn_tienda_umbral();
  v_sede uuid;
  v_ids uuid[];
begin
  v_sede := retail.fn_tienda_sede_elegida(p_sede, v_sedes);
  v_ids := array(select vp.producto_id from retail.vitrina_productos vp
                  where vp.publicado and retail.fn_vitrina_publicable(vp.producto_id));

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
        'categoria', case when c.id is null then null else jsonb_build_object('nombre', c.nombre, 'prefijo', c.prefijo) end,
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
  );
end;
$function$;

reset lock_timeout;
