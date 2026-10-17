-- ============================================================================
-- 20261017025000_tienda_probador.sql — CAYLA V2 · Tienda online · «Arma el tuyo» (ADR-0434, actividad 4)
--
-- EL PROBLEMA PRIMERO. El probador de la tienda (`/looks/arma`) dibuja cada prenda a escala con su recorte, deja cambiarla de color y
-- suma lo que cuesta el look. El catálogo (`tienda_catalogo`) ya dice qué se ve, cómo se llama y en qué colores, pero no trae lo que el
-- probador necesita: el largo, los recortes y, sobre todo, el precio y el stock de CADA COLOR. Con el precio del modelo, una campaña
-- solo en el negro haría que la falda beige del look dijera el precio del negro y que la bolsa cobrara el del beige: el mismo error que
-- ya se corrigió en los looks de CAYLA (20261015032000).
--
-- ANALOGÍA CAYLA. En la tienda, la vendedora que arma un look en el probador mira la etiqueta de la prenda en el color que descolgó,
-- no la del perchero de al lado. Y sabe si queda ese color en su tienda o hay que pedirlo a otra.
--
-- QUÉ HACE. `retail.tienda_probador(p_sede)`: por prenda publicada y vendible (la misma regla del catálogo) que tiene largo —el propio
-- o el típico de su categoría (20261017015000)— y al menos un recorte listo (20261017003000):
--   · `largo`: el propio o el típico (la tienda no necesita saber cuál);
--   · `recortes`: los listos, en el orden de sus fotos, cada uno con el color de su foto (null = la foto no tiene color: «todos los
--     colores»; el sistema no sabe cuál es), el nombre de ese color y su proporción (ancho sobre alto);
--   · `colores`: por COLOR que se ofrece en la tienda elegida, lo que vale (el resumen por color de `fn_tienda_precios`, la regla única
--     del precio, la misma de la ficha, los looks y la bolsa) y su nivel en cada tienda de la web y en todas (`fn_tienda_disponible` y
--     `fn_tienda_nivel`, la regla única de «hay»: nunca la cifra de 4 o más).
-- Y `combina`: con qué colores se lleva bien cada color de esas prendas (`colores.combina_con`), para «Sorpréndeme».
-- {sede, prendas: [{id, largo, recortes: [{color, color_nombre, url, proporcion}], colores: [{codigo, precio, precio_final, desde,
--  campana, stock: {total, sedes}}]}], combina: {codigo: [codigos]}}.
--
-- DECIDÍ: solo lo que el catálogo no tiene. El nombre, la categoría, el hex de cada color y si la prenda se ve los sigue diciendo
--   `tienda_catalogo`, que la tienda ya guarda medio minuto; la tienda junta las dos respuestas, y una prenda o un color que una de las
--   dos no trae no entra al probador. Así el probador no arma el catálogo entero por dentro (lo que hace `tienda_looks`: 1,6 s de media
--   en producción, medido el 2026-10-16) y el precio sigue saliendo de la misma pieza que la ficha, los looks y la bolsa. Es igual para
--   todos los que miran la misma tienda: la tienda lo guarda como el catálogo (`lecturaCompartida`).
-- DESCARTÉ: el precio del modelo que trae el catálogo (el error de arriba); y preguntar la ficha (`tienda_ficha`) de cada prenda que se
--   pone, que es un viaje a la base por toque desde el celular. Las tallas de cada prenda las pide la hoja de tallas al abrirse
--   (actividad 6), no esta lectura: serían miles de filas para cada visita y solo se usan al agregar a la bolsa.
-- SE ROMPE SI: alguien cambia `fn_tienda_precios` o `fn_tienda_disponible` y deja esta función con otra regla: `pnpm pruebas:tienda-
--   probador` cruza su precio y su nivel con los de la ficha y el look, de la misma prenda en la misma tienda.
--
-- PRODUCCIÓN. NO está aplicada: se pega con el OK de Felipe antes de fusionar su PR (el probador se publica escondido, ADR-0434). Solo
-- una función y sus permisos, sin políticas ni `alter` de tablas: se pega entera y se puede volver a correr.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Lo que da por hecho (si falta, no se pega nada).
do $$
begin
  if to_regprocedure('retail.fn_tienda_precios(uuid[], uuid, boolean)') is null or to_regprocedure('retail.fn_tienda_disponible(uuid[], uuid[])') is null
     or to_regprocedure('retail.fn_tienda_nivel(integer, integer)') is null or to_regprocedure('retail.fn_tienda_sede_elegida(uuid, uuid[])') is null then
    raise exception 'Faltan las reglas del precio y de «hay» de la tienda: pega antes 20261015012000_tienda_ficha_y_niveles_por_tienda.sql.';
  end if;
  if to_regclass('retail.foto_recortes') is null then
    raise exception 'Faltan los recortes del probador: pega antes 20261017003000_foto_recortes.sql.';
  end if;
  if to_regclass('retail.vitrina_largos_tipicos') is null then
    raise exception 'Faltan los largos del probador: pega antes 20261017015000_vitrina_largos_del_probador.sql.';
  end if;
end
$$;

create or replace function retail.tienda_probador(p_sede uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public
as $fn$
declare
  v_sedes uuid[] := retail.fn_tienda_sedes_web();
  v_umbral integer := retail.fn_tienda_umbral();
  v_sede uuid;
  v_ids uuid[];
begin
  v_sede := retail.fn_tienda_sede_elegida(p_sede, v_sedes);

  -- Las prendas del probador: publicadas y vendibles (lo mismo que mira el catálogo), con largo y con al menos un recorte listo de una
  -- foto del almacén público (la misma condición de foto que el catálogo).
  v_ids := array(
    select vp.producto_id
      from retail.vitrina_productos vp
      join retail.productos p on p.id = vp.producto_id
      left join retail.vitrina_largos_tipicos lt on lt.categoria_id = p.categoria_id
     where vp.publicado
       and coalesce(vp.largo_cm, lt.largo_cm) is not null
       and exists (
         select 1
           from retail.producto_fotos pf
           join retail.foto_recortes r
             on r.foto = substring(split_part(pf.url, '?', 1) from '/storage/v1/object/public/retail-productos-fotos/(.+)$')
          where pf.producto_id = vp.producto_id
            and pf.url ~ '^https?://[^/?#]+/storage/v1/object/public/retail-productos-fotos/'
            and r.estado = 'listo')
       and retail.fn_vitrina_publicable(vp.producto_id));

  return (
    with pv as materialized (
      -- Lo que se ofrece de esas prendas en la tienda elegida, con el resumen por COLOR (el que cobra la bolsa).
      select * from retail.fn_tienda_precios(v_ids, v_sede, true)
       where color_codigo is not null
    ),
    del_color as (
      select distinct on (pv.producto_id, pv.color_codigo)
             pv.producto_id, pv.color_codigo, pv.resumen_precio, pv.resumen_final, pv.resumen_desde, pv.resumen_campana
        from pv
       order by pv.producto_id, pv.color_codigo
    ),
    -- Lo libre de cada color en cada tienda de la web, solo de sus tallas que se ofrecen (la regla única de «hay»).
    disponible as (
      select x.producto_id, x.color_codigo, d.ubicacion_id, sum(d.disponible)::integer as n
        from retail.fn_tienda_disponible(v_ids, v_sedes) d
        join pv x on x.variante_id = d.variante_id
       group by x.producto_id, x.color_codigo, d.ubicacion_id
    ),
    recortes as (
      select pf.producto_id, pf.color_codigo, co.nombre as color_nombre, f.base || r.recorte as url, r.proporcion,
             pf.es_principal, pf.orden, pf.created_at, pf.id
        from retail.producto_fotos pf
        cross join lateral (
          select substring(pf.url from '^(https?://[^/?#]+/storage/v1/object/public/retail-productos-fotos/)') as base,
                 substring(split_part(pf.url, '?', 1) from '/storage/v1/object/public/retail-productos-fotos/(.+)$') as archivo
        ) f
        join retail.foto_recortes r on r.foto = f.archivo and r.estado = 'listo'
        left join retail.colores co on co.codigo = pf.color_codigo
       where pf.producto_id = any (v_ids)
         and f.base is not null
    )
    select jsonb_build_object(
      'sede', v_sede,
      'prendas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', p.id,
                 'largo', coalesce(vp.largo_cm, lt.largo_cm)::integer,
                 'recortes', (
                   select jsonb_agg(jsonb_build_object('color', r.color_codigo, 'color_nombre', r.color_nombre, 'url', r.url, 'proporcion', r.proporcion)
                                    order by r.es_principal desc, r.orden, r.created_at, r.id)
                     from recortes r
                    where r.producto_id = p.id),
                 'colores', (
                   select jsonb_agg(jsonb_build_object(
                            'codigo', dc.color_codigo,
                            'precio', dc.resumen_precio,
                            'precio_final', dc.resumen_final,
                            'desde', dc.resumen_desde,
                            'campana', dc.resumen_campana,
                            'stock', jsonb_build_object(
                              'total', retail.fn_tienda_nivel(coalesce((
                                select sum(d.n) from disponible d where d.producto_id = p.id and d.color_codigo = dc.color_codigo), 0)::integer, v_umbral),
                              'sedes', coalesce((
                                select jsonb_object_agg(s.id::text, retail.fn_tienda_nivel(coalesce(d.n, 0), v_umbral))
                                  from unnest(v_sedes) as s (id)
                                  left join disponible d on d.producto_id = p.id and d.color_codigo = dc.color_codigo and d.ubicacion_id = s.id), '{}'::jsonb)))
                          order by dc.color_codigo)
                     from del_color dc
                    where dc.producto_id = p.id)
               ) order by vp.publicado_en desc, p.referencia, p.id)
          from retail.productos p
          join retail.vitrina_productos vp on vp.producto_id = p.id
          left join retail.vitrina_largos_tipicos lt on lt.categoria_id = p.categoria_id
         where p.id = any (v_ids)
           -- Sin un color que se ofrezca en esa tienda, no hay nada que ponerse.
           and exists (select 1 from del_color dc where dc.producto_id = p.id)), '[]'::jsonb),
      'combina', coalesce((
        select jsonb_object_agg(co.codigo, to_jsonb(co.combina_con))
          from retail.colores co
         where co.codigo in (select dc.color_codigo from del_color dc)
           and cardinality(co.combina_con) > 0), '{}'::jsonb)
    )
  );
end;
$fn$;

comment on function retail.tienda_probador(uuid) is
  'Tienda online, «Arma el tuyo» (ADR-0434, actividad 4): por prenda publicada con largo (propio o típico) y algún recorte listo, su largo, sus recortes (con el color de su foto o null) y, por color que se ofrece en la tienda elegida, su precio (fn_tienda_precios por color, la regla única) y su nivel en cada tienda de la web (fn_tienda_disponible + fn_tienda_nivel); y con qué colores combina cada uno (colores.combina_con). El nombre, la categoría y si se ve los da tienda_catalogo. {sede, prendas, combina}. Solo la llama tienda_web.';

revoke all on function retail.tienda_probador(uuid) from public, anon, authenticated;
grant execute on function retail.tienda_probador(uuid) to tienda_web;

-- Validación final: solo tienda_web la llama.
do $$
begin
  if has_function_privilege('anon', 'retail.tienda_probador(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.tienda_probador(uuid)', 'EXECUTE')
     or not has_function_privilege('tienda_web', 'retail.tienda_probador(uuid)', 'EXECUTE') then
    raise exception 'tienda probador: tienda_probador tiene que ser solo de tienda_web';
  end if;
end;
$$;

reset lock_timeout;
