-- Tienda web: «lo nuevo» y «lo más vendido» vuelven a vivir en un solo lugar, sin perder velocidad (2026-11-09).
--
-- EL PROBLEMA PRIMERO. Producción corre una tienda_catalogo más rápida que la del repo (unos 350 ms con 487 prendas publicadas), pero
-- para ganar esa velocidad copió adentro la regla de «lo nuevo» y la de «lo más vendido» en vez de pedírselas a fn_tienda_lo_nuevo y
-- fn_tienda_mas_vendidos. «Novedades para ti» del club sigue leyendo fn_tienda_lo_nuevo: si alguien cambiara la regla en un lugar, el
-- catálogo y el club dirían cosas distintas sobre la misma prenda. La prueba que vigila eso (pnpm pruebas:tienda-club, N3) se pone en
-- rojo con la versión de producción, y por eso no entró en 20261109171000. Felipe eligió «una sola regla» (2026-11-09).
--
-- ANALOGÍA CAYLA. Es como tener la lista de «recién llegado» pegada en la vitrina y otra copia en la caja: el día que alguien saca una
-- prenda de una, la otra sigue diciendo que es nueva.
--
-- LO QUE SE MIDIÓ EN PRODUCCIÓN (2026-11-09, solo lectura). La copia no era más rápida por estar en el catálogo, sino porque las reglas
-- estaban mal escritas para este tamaño:
--   · fn_tienda_lo_nuevo: 56 ms y 19 491 bloques. Buscaba los movimientos talla por talla (3 233 búsquedas, 14 025 bloques) y preguntaba
--     la familia prenda por prenda (487 llamadas a fn_categoria_entra_a_motores, ~22 ms).
--   · fn_tienda_mas_vendidos: 33 ms y 16 886 bloques, por lo mismo.
--   · Escritas para leer los movimientos de una pasada y preguntar la familia una vez por categoría (53), dan 24 ms / 2 110 bloques y
--     21 ms / 1 557 bloques, y devuelven EXACTAMENTE lo mismo: comparadas fila por fila sobre 687 prendas, 0 diferencias.
--   · El catálogo entero, con las versiones nuevas cargadas aparte (pg_temp) y comparado con el de producción sobre los mismos datos:
--     el MISMO JSON (md5) con «Todas», cada sede (las tres tiendas y el Taller) y una que no existe (471 prendas); «lo nuevo» igual en las 295 prendas y
--     «más vendidos» en sus 20 puestos. Y la misma velocidad: 323, 334 y 332 ms contra 377, 315 y 333 ms del de hoy.
--
-- DECIDÍ: cada regla vive en su función, ahora escrita de una pasada, y tienda_catalogo es la versión rápida de producción pidiéndoselas.
-- DESCARTÉ: dejar la copia (no era más rápida una vez escritas bien las reglas, y son dos reglas que pueden separarse sin que nadie lo
--   note) y pasarle a las reglas lo que el catálogo ya calculó (la firma de la regla quedaría atada a una sola pantalla, sin ganar nada
--   medible: las dos preguntas juntas ya caben en el ruido de los ~330 ms del catálogo).
-- SE ROMPE SI: los movimientos pasan de cientos de miles. Hoy son 9 883 y cada pasada lee 259 bloques; con 250 000 serían ~6 500 por
--   regla, todavía menos que las 3 233 búsquedas de antes. Más allá, un índice parcial de llegadas y de ventas recientes.
--
-- QUÉ NO CAMBIA. Lo que ve el cliente en la tienda web: las mismas prendas, el mismo «nuevo» con sus días y el mismo puesto en «Más vendidos». Las dos
-- reglas siguen preguntando fn_es_llegada (qué es una llegada) y fn_categoria_entra_a_motores (qué familias quedan fuera), y conservan
-- su forma, su security, su search_path y sus permisos. Las tres funciones son de solo lectura.
--
-- CÓMO SE PEGA. Una sola parte, re-ejecutable: solo create or replace function y comment. Sin políticas ni alter. Va después de
-- 20261109171000 (que no toca estas funciones) y no depende de ella.
-- VERIFICACIÓN: el catálogo de cada tienda devuelve lo mismo antes y después de pegar (md5 de tienda_catalogo por sede, en el PR).
-- CAMINO DE VUELTA: pegar-en-produccion-vuelta-catalogo-una-regla-2026-11-09.sql deja las tres como estaban en producción.

set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('retail.fn_productos_por_etapa(uuid[])') is null
     or to_regprocedure('retail.fn_tienda_insignias_de(uuid[], uuid, uuid[])') is null
     or to_regprocedure('retail.fn_tienda_precios(uuid[], uuid, boolean)') is null
     or to_regprocedure('retail.fn_empresas_de_sede(uuid)') is null then
    raise exception 'Faltan piezas de la tienda (fn_productos_por_etapa, fn_tienda_insignias_de, fn_tienda_precios o fn_empresas_de_sede): pega antes las migraciones de la tienda de main.';
  end if;
end
$$;

-- ---------- 1. «Lo nuevo» ----------
-- La misma regla de 20261015013000 (primer ingreso a una tienda hace 30 días o menos, o fijado en la Vitrina; nunca lo quitado ni las
-- familias fuera de los motores), escrita para leer una vez las tallas pedidas y una vez las llegadas, y cruzarlas de un golpe.
create or replace function retail.fn_tienda_lo_nuevo(p_producto_ids uuid[])
returns table (producto_id uuid, dias integer, llego timestamptz)
language sql
stable
set search_path = retail, public
as $$
  with tallas as materialized (
    select v.id, v.producto_id
      from retail.variantes v
     where v.producto_id = any (coalesce(p_producto_ids, '{}'::uuid[]))
  ),
  -- Las llegadas a una tienda (fn_es_llegada: sin el Taller ni las devoluciones), en una pasada por movimientos.
  llegadas as materialized (
    select m.variante_id, m.created_at
      from retail.movimientos m
      join retail.ubicaciones u on u.id = m.ubicacion_id
     where retail.fn_es_llegada(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)
       and u.tipo = 'tienda'
  ),
  llegada as (
    select v.producto_id, min(m.created_at) as primera
      from llegadas m
      join tallas v on v.id = m.variante_id
     group by v.producto_id
  ),
  -- Las familias fuera de los motores (bolsas, empaque), preguntadas a su regla una vez por categoría y no una vez por prenda.
  sin_motores as materialized (
    select array(select c.id from retail.categorias c where not retail.fn_categoria_entra_a_motores(c.id)) as ids
  ),
  modelos as (
    select p.id, vp.en_lo_nuevo, ll.primera,
           retail.fn_hoy_lima() - (ll.primera at time zone 'America/Lima')::date as dias
      from retail.productos p
      join retail.vitrina_productos vp on vp.producto_id = p.id
      left join llegada ll on ll.producto_id = p.id
      cross join sin_motores sm
     where p.id = any (coalesce(p_producto_ids, '{}'::uuid[]))
       and coalesce(p.categoria_id <> all (sm.ids), true)
  )
  select m.id, case when m.dias between 0 and 30 then m.dias end, m.primera
    from modelos m
   where m.en_lo_nuevo = 'fijo'
      or (m.en_lo_nuevo = 'automatico' and m.dias between 0 and 30)
$$;

comment on function retail.fn_tienda_lo_nuevo(uuid[]) is
  'Tienda online (ADR-0408, DECIDÍ 7): LA regla de «nuevo». Los modelos en «Lo nuevo» — primer ingreso a una tienda (fn_es_llegada: sin el Taller ni las devoluciones) hace 30 días o menos, o fijados en la Vitrina; nunca los quitados ni las familias fuera de los motores — con hace cuántos días llegaron (solo hasta 30) y cuándo fue esa primera llegada (llego). Lee los movimientos de una pasada (20261109181000). Interna: la usan tienda_catalogo (solo los días) y fn_tienda_novedades («Novedades para ti»).';

-- ---------- 2. «Más vendidos» ----------
-- La misma regla de 20261015013000 (unidades vendidas en 30 días en toda la red, empate por nombre, puestos 1 a 20, sin las familias
-- fuera de los motores), escrita para sumar las ventas una vez por talla y cruzarlas de un golpe con las tallas pedidas.
create or replace function retail.fn_tienda_mas_vendidos(p_producto_ids uuid[])
returns table (producto_id uuid, puesto integer)
language sql
stable
set search_path = retail, public
as $$
  with tallas as materialized (
    select v.id, v.producto_id
      from retail.variantes v
     where v.producto_id = any (coalesce(p_producto_ids, '{}'::uuid[]))
  ),
  vendidas_talla as materialized (
    select m.variante_id, sum(m.cantidad) as unidades
      from retail.movimientos m
     where m.tipo = 'salida' and m.motivo = 'venta'
       and m.created_at >= now() - interval '30 days'
     group by m.variante_id
  ),
  vendidas as (
    select v.producto_id, sum(m.unidades) as unidades
      from vendidas_talla m
      join tallas v on v.id = m.variante_id
     group by v.producto_id
  ),
  sin_motores as materialized (
    select array(select c.id from retail.categorias c where not retail.fn_categoria_entra_a_motores(c.id)) as ids
  ),
  ranking as (
    select vd.producto_id, row_number() over (order by vd.unidades desc, p.referencia, p.id) as puesto
      from vendidas vd
      join retail.productos p on p.id = vd.producto_id
      cross join sin_motores sm
     where vd.unidades > 0
       and coalesce(p.categoria_id <> all (sm.ids), true)
  )
  select r.producto_id, r.puesto::integer from ranking r where r.puesto <= 20
$$;

comment on function retail.fn_tienda_mas_vendidos(uuid[]) is
  'Tienda online (ADR-0408): el puesto (1 a 20) de cada modelo en «Más vendidos» — unidades vendidas en 30 días en toda la red, la definición del orden de Catálogo ▸ Productos —, sin las familias fuera de los motores. Solo el puesto sale de la base, nunca las unidades. Suma las ventas de una pasada (20261109181000). Interna: la usa tienda_catalogo.';

-- ---------- 3. El catálogo ----------
-- La versión que producción corría (leída el 2026-11-09), con su copia de las dos reglas cambiada por la pregunta a cada una.
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
  -- fn_categoria_entra_a_motores (antes, una vez por prenda y por motor). Sin categoría o sin dato: entra.
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
    -- «Lo nuevo» y «Más vendidos» se le preguntan a SU regla, que vive en un solo lugar: «Novedades para ti» del club lee la misma
    -- (pnpm pruebas:tienda-club, N3). Cada una lee los movimientos de una pasada (20261109181000).
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
