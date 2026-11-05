-- ============================================================================
-- 20261021010000_tienda_looks_por_tienda.sql — CAYLA V2 · Tienda online (ADR-0468)
-- «Arma tu look» es por tienda: un look se ve en una tienda solo si TODAS sus prendas, en su color, tienen algo ahí.
--
-- EL PROBLEMA PRIMERO. `tienda_looks(p_sede)` usaba la tienda elegida solo para el PRECIO. Qué look se veía lo decía el catálogo con
-- «se ve en la web» (publicada, vendible, color con tallas), que no mira cuánto hay en cada tienda. Resultado: con Lima elegida salía un
-- look cuya falda solo existe en Trujillo; el cliente armaba el look, elegía talla y la bolsa recién le decía «se agotó en Lima». El
-- catálogo ya esconde lo que no hay en la tienda elegida (`hayEnTienda`) y el probador también; los looks eran lo único global
-- (Felipe, 2026-10-20: «hay prendas que hay en una sede y en las otras no»). Desde ADR-0458 cada tienda maneja lo suyo y no trae de otra.
--
-- ANALOGÍA CAYLA. Era como exhibir en la vitrina de Lima un maniquí vestido con una falda que solo está en el almacén de Trujillo.
-- Ahora cada vitrina exhibe solo los maniquíes que puede vestir con lo que tiene.
--
-- QUÉ HACE. Reemplaza `fn_tienda_looks_json` (la interna que arma `tienda_looks` y `tienda_look`; nada más cambia: ni firma, ni
-- permisos, ni lo que devuelve):
--   · Con una tienda elegida, el look sale solo si cada una de sus prendas tiene, en SU color, alguna talla ofrecida y libre en ESA
--     tienda (`fn_tienda_disponible`, la regla única de «hay», sobre las tallas que ofrece la ficha, `fn_tienda_precios`).
--   · Sin tienda elegida (la web ya siempre elige una, ADR-0455: solo llega así cuando hay una única tienda en la web), el look sale si
--     está completo en AL MENOS UNA tienda de la web. Con una sola tienda es exactamente esa; con varias, un look cuyas prendas están
--     repartidas (la blusa solo en Trujillo, la falda solo en Arequipa) no se podría comprar junto en ningún lado: no se ofrece.
--   · Sin tiendas en la web no se sabe dónde hay nada: no se esconde ningún look (como `hayEnTienda`, que sin dato dice sí).
--   · «Look N de M» cuenta solo los que se ven en esa tienda. `tienda_look` (uno) sigue contando igual que la lista, así que un look que
--     en esa tienda no está completo devuelve `null` y la página dice «Este look ya no está».
--   El ERP (Vitrina web ▸ Looks, `fn_vitrina_looks_json`) no cambia: sigue diciendo si el look se ve en la web (con el criterio de «cualquier tienda», que es el suyo).
--
-- DECIDÍ: por color y no por modelo. La pieza de un look es un modelo EN UN COLOR; que haya negro en Lima no sirve si el look lleva beige.
-- DECIDÍ: sin tienda elegida = completo en alguna tienda, no «cada prenda en alguna». Es la lectura coherente con «cada tienda maneja
--   lo suyo» (ADR-0458); la web no la usa con varias tiendas («Todas» ya no existe, ADR-0455), pero la base no se queda sin respuesta.
-- DECIDÍ: `ofrecido` (los precios) se pide siempre para todas las prendas de los looks y no solo para las del look abierto: el
--   «Look N de M» y qué look se ve dependen de las otras prendas. Son decenas de modelos, no el catálogo entero.
-- DESCARTÉ: filtrar en la web con el stock del modelo del catálogo (no sabe del color y deja «N de M» con huecos); un parche anclado
--   (el filtro tiene que ir antes de numerar los looks, y eso mueve CTE de lugar: más seguro el reemplazo entero con candado).
--
-- SE ROMPE SI: alguien vuelve a decidir qué look se ve solo con `fn_vitrina_look_se_ve` (el look vuelve a salir en tiendas que no
--   lo pueden vestir). Lo vigila `pnpm pruebas:vitrina-looks` (sección «por tienda»).
--
-- PRODUCCIÓN. Una sola parte, idempotente: un `create or replace function` (sin políticas, disparadores ni `alter` de tablas: sin riesgo
-- de 40P01, ADR-0195). Candado: la función viva tiene que ser la de 20261015032000 (md5 de su definición, verificado en producción el
-- 2026-10-20) o ya esta; si es otra, no toca nada. Sin `select … into` en textos entre comillas (ADR-0288). Orden con la web: la web no
-- cambia, así que da igual.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $candado$
declare
  v_def text := pg_get_functiondef(to_regprocedure('retail.fn_tienda_looks_json(jsonb, uuid[], uuid, boolean)'));
begin
  if v_def is null then
    raise exception 'Falta fn_tienda_looks_json: pega antes 20261015032000_tienda_looks.sql.';
  end if;
  if position('hay_en as (' in v_def) > 0 then
    raise notice 'fn_tienda_looks_json ya mira cuánto hay por tienda: se vuelve a escribir igual.';
  elsif md5(v_def) <> '1047ba62b181a92a034034f7e5a9e8a5' then
    raise exception 'fn_tienda_looks_json tiene otro cuerpo (md5 %): no es el de 20261015032000. Reescribe esta migración desde su definición real.', md5(v_def);
  end if;
  if to_regprocedure('retail.fn_tienda_disponible(uuid[], uuid[])') is null or to_regprocedure('retail.fn_tienda_sedes_web()') is null then
    raise exception 'Faltan las reglas de «hay» de la tienda: pega antes 20261015012000_tienda_ficha_y_niveles_por_tienda.sql.';
  end if;
end
$candado$;

create or replace function retail.fn_tienda_looks_json(p_catalogo jsonb, p_sedes uuid[], p_id uuid, p_con_tallas boolean)
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  with cat as (
    select (x ->> 'id')::uuid as producto_id, x as prenda
      from jsonb_array_elements(coalesce(p_catalogo -> 'prendas', '[]'::jsonb)) x
  ),
  piezas as (
    select pz.look_id, pz.posicion, pz.producto_id, pz.color_codigo, pz.x, pz.y, pz.ancho, pz.giro, ct.prenda,
           (select co from jsonb_array_elements(coalesce(ct.prenda -> 'colores', '[]'::jsonb)) co
             where co ->> 'codigo' = pz.color_codigo limit 1) as color
      from retail.vitrina_look_piezas pz
      left join cat ct on ct.producto_id = pz.producto_id
  ),
  -- Las prendas de todos los looks: lo que se ofrece y lo que hay se pide para todas (qué look se ve y «Look N de M» dependen de todas).
  de_looks as (
    select coalesce(array_agg(distinct pz.producto_id), '{}'::uuid[]) as ids from retail.vitrina_look_piezas pz
  ),
  -- Lo que se ofrece de las prendas de los looks y a qué precio, en la tienda del catálogo: la regla única del precio, con el resumen por
  -- COLOR (fn_tienda_precios). Las mismas tallas que ofrece la ficha (ninguna a S/ 0) y el precio que cobra la bolsa.
  ofrecido as (
    select o.*
      from retail.fn_tienda_precios((select ids from de_looks), (p_catalogo ->> 'sede')::uuid, true) o
  ),
  -- Las tiendas de la web y, en cada una, qué prenda en qué color tiene alguna talla ofrecida y libre (la regla de «hay» de la ficha).
  tiendas_web as (
    select t.id from unnest(retail.fn_tienda_sedes_web()) as t (id)
  ),
  hay_en as (
    select distinct d.ubicacion_id as sede_id, o.producto_id, o.color_codigo
      from retail.fn_tienda_disponible((select ids from de_looks), array(select id from tiendas_web)) d
      join ofrecido o on o.variante_id = d.variante_id
  ),
  -- Los looks completos en cada tienda: ninguna de sus prendas, en su color, falta ahí.
  completo_en as (
    select l.id as look_id, t.id as sede_id
      from retail.vitrina_looks l
     cross join tiendas_web t
     where not exists (select 1 from retail.vitrina_look_piezas pz
                        where pz.look_id = l.id
                          and not exists (select 1 from hay_en h
                                           where h.sede_id = t.id and h.producto_id = pz.producto_id and h.color_codigo = pz.color_codigo))
  ),
  -- Encendido y con todas sus prendas a la vista: tantas prendas que se ven (en su color) como las que se guardaron. Y por tienda: con
  -- una tienda elegida, completo ahí; sin elegir, completo en alguna; sin tiendas en la web, no se esconde nada.
  visibles as (
    select l.id, l.nombre, l.frase,
           row_number() over (order by l.orden, l.creado_en, l.id) as numero,
           count(*) over () as de
      from retail.vitrina_looks l
     where l.publicado
       and l.piezas = (select count(*) from retail.vitrina_look_piezas pz
                        where pz.look_id = l.id and retail.fn_vitrina_look_se_ve(p_catalogo, pz.producto_id, pz.color_codigo))
       and (not exists (select 1 from tiendas_web)
            or exists (select 1 from completo_en c
                        where c.look_id = l.id
                          and (p_catalogo ->> 'sede' is null or c.sede_id = (p_catalogo ->> 'sede')::uuid)))
  ),
  precio_del_color as (
    select distinct on (o.producto_id, o.color_codigo) o.producto_id, o.color_codigo, o.resumen_precio, o.resumen_final,
           o.resumen_desde, o.resumen_campana
      from ofrecido o
     order by o.producto_id, o.color_codigo
  ),
  -- Las tallas que hay en alguna tienda de la web (la regla de «hay» de la ficha). Solo si se piden, y solo de las prendas de los looks.
  disponibles as (
    select distinct d.variante_id
      from retail.fn_tienda_disponible(case when p_con_tallas then coalesce((
             select array_agg(distinct pz.producto_id) from retail.vitrina_look_piezas pz where p_id is null or pz.look_id = p_id), '{}'::uuid[])
           else '{}'::uuid[] end, p_sedes) d
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id,
      'nombre', v.nombre,
      'frase', v.frase,
      'numero', v.numero,
      'de', v.de,
      'total', t.total,
      'total_final', t.total_final,
      'desde', t.desde,
      'piezas', (
        select jsonb_agg(
                 jsonb_build_object(
                   'posicion', x.posicion,
                   'x', x.x, 'y', x.y, 'ancho', x.ancho, 'giro', x.giro,
                   'prenda', jsonb_build_object(
                     'id', x.producto_id,
                     'nombre', x.prenda -> 'nombre',
                     'categoria', x.prenda -> 'categoria',
                     'precio', pr.resumen_precio,
                     'precio_final', pr.resumen_final,
                     'desde', pr.resumen_desde,
                     'campana', pr.resumen_campana),
                   'color', jsonb_build_object('codigo', x.color -> 'codigo', 'nombre', x.color -> 'nombre', 'hex', x.color -> 'hex'),
                   -- La foto de su color; si no tiene, la principal del modelo (propuesta c de la maqueta).
                   'foto', coalesce(x.color ->> 'foto', x.prenda -> 'fotos' ->> 0))
                 || case when p_con_tallas then jsonb_build_object('tallas', coalesce((
                      select jsonb_agg(jsonb_build_object(
                               'variante_id', o.variante_id,
                               'talla', coalesce(ta.valor, 'Única'),
                               'hay', o.variante_id in (select d.variante_id from disponibles d))
                             -- Letras (XS…XXL), números (26, 28…) y «Única»/«Estándar» al final.
                             order by
                               case when upper(coalesce(ta.valor, '')) = any (array['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL']) then 0
                                    when coalesce(ta.valor, '') ~ '^[0-9]+([.,][0-9]+)?$' then 1
                                    when ta.valor is null or lower(ta.valor) in ('única', 'unica', 'único', 'unico', 'estándar', 'estandar', 'std', 'u') then 3
                                    else 2 end,
                               array_position(array['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL'], upper(ta.valor)),
                               case when ta.valor ~ '^[0-9]+([.,][0-9]+)?$' then replace(ta.valor, ',', '.')::numeric end,
                               ta.valor, o.variante_id)
                        from ofrecido o
                        left join retail.tallas ta on ta.id = o.talla_id
                       where o.producto_id = x.producto_id and o.color_codigo = x.color_codigo), '[]'::jsonb))
                   else '{}'::jsonb end
               order by x.posicion)
          from piezas x
          left join precio_del_color pr on pr.producto_id = x.producto_id and pr.color_codigo = x.color_codigo
         where x.look_id = v.id)
    ) order by v.numero), '[]'::jsonb)
  from visibles v
  cross join lateral (
    select sum(pr.resumen_precio) as total,
           sum(pr.resumen_final) as total_final,
           coalesce(bool_or(pr.resumen_desde), false) as desde
      from piezas x
      left join precio_del_color pr on pr.producto_id = x.producto_id and pr.color_codigo = x.color_codigo
     where x.look_id = v.id
  ) t
  where p_id is null or v.id = p_id
$$;
revoke all on function retail.fn_tienda_looks_json(jsonb, uuid[], uuid, boolean) from public, anon, authenticated;

-- Validación final: la interna sigue siendo de nadie.
do $$
begin
  if has_function_privilege('tienda_web', 'retail.fn_tienda_looks_json(jsonb, uuid[], uuid, boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.fn_tienda_looks_json(jsonb, uuid[], uuid, boolean)', 'EXECUTE') then
    raise exception 'tienda looks: fn_tienda_looks_json es interna';
  end if;
end;
$$;

reset lock_timeout;
