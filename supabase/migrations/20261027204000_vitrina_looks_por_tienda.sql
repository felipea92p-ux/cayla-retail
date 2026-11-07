-- ============================================================================
-- 20261027204000_vitrina_looks_por_tienda.sql — CAYLA V2 · Vitrina web ▸ Looks (ADR-0468, ADR-0465)
-- El editor de looks dice en qué tiendas se completa cada look y qué prenda le falta a cada una (`fn_vitrina_looks_por_tienda`), y, al
-- armar uno, en qué tiendas hay cada prenda para elegirlas y avisar antes de guardar (`fn_vitrina_prendas_por_tienda`).
--
-- EL PROBLEMA PRIMERO. Vitrina web ▸ Looks dice «Se ven en la web: 3 de 3», pero en la tienda online solo sale 1: la web muestra un look
-- solo si TODAS sus prendas, en su color, están a la venta y libres en la MISMA tienda (ADR-0468), y el ERP cuenta «en cualquier tienda».
-- Felipe (2026-10-27) tenía 3 looks encendidos y solo veía uno; para saber por qué tuvo que pedirlo mirando la base. La pantalla no le
-- decía en qué tienda sale cada look ni qué prenda le falta.
--
-- ANALOGÍA CAYLA. El look es una lámina de percheros con 2 a 4 prendas y cada tienda es una vidriera: la lámina cuelga en una vidriera solo
-- si las prendas están ahí. Esta función es la libreta del encargado: por lámina y por vidriera, cuál prenda falta y por qué (no está en el
-- catálogo de esa tienda, no hay stock, o hay una talla libre pero no se ofrece en la web).
--
-- QUÉ HACE. `retail.fn_vitrina_looks_por_tienda()` (solo lectura) devuelve, para cada look, en cada tienda de la web, cada prenda con
-- `hay` y, si no hay, `motivo`:
--   · `no_se_ve`   — la prenda, en su color, no está en el catálogo de esa tienda (la regla de CLAURE solo en Lima, ADR-0465, o no publicada).
--   · `sin_stock`  — está en el catálogo pero ninguna talla de ese color está libre ahí (`fn_tienda_disponible`, la regla única de «hay»).
--   · `no_ofrecida`— hay una talla libre pero la web no la ofrece en esa tienda (`fn_tienda_precios`: sin precio, a S/ 0…). El caso de la
--                    Cartera Manuela en Arequipa: la única talla con stock no es la que se ofrece.
-- y, por look y tienda, `completo` (todas sus prendas con `hay`) y cuántas `faltan`. NO calcula qué look se ve: usa las MISMAS reglas que
-- `fn_tienda_looks_json` (la que arma la web), cada una llamada a su función, y una prueba exige que `completo` coincida con lo que
-- `tienda_looks(tienda)` realmente devuelve.
--
-- LA SEGUNDA FUNCIÓN. Felipe (2026-10-27): «no debería avisar o separar por filtro dentro de Nuevo look?». `fn_vitrina_prendas_por_tienda()` dice, de
-- CADA prenda que la web muestra en algún color, en qué tiendas hay (la misma regla de «hay»): con eso el editor filtra por tienda y avisa, en vivo, en
-- qué tiendas saldría el look con lo elegido, antes de guardarlo. Medido en producción (2026-10-27): para las 4619 combinaciones prenda-color-tienda,
-- 6,2 s con una subconsulta por fila y bastante menos juntando las tablas una vez (esta versión). Se pide al abrir la hoja, no con la lista.
--
-- DECIDÍ: una función nueva de lectura y no tocar `fn_vitrina_looks` (el editor): el editor la pide aparte, cuando la persona abre la
--   pestaña de looks; así la pantalla de siempre no se hace más lenta.
-- DECIDÍ: la visibilidad de cada prenda en cada tienda se lee UNA vez del catálogo de la tienda (`tienda_catalogo(tienda)`) y no con
--   `fn_vitrina_look_se_ve` fila por fila: esa función recorre el catálogo entero en cada llamada. Medido en producción (2026-10-27, 4
--   looks, 15 piezas, 3 tiendas): fila por fila 25,8 s; leyendo el catálogo una vez por tienda, 2,0 s.
-- DESCARTÉ: calcularlo en la pantalla del ERP con el inventario: sería una segunda regla de «hay» que se desfasa de la de la web, y el
--   ERP volvería a decir «se ve» donde la web dice que no.
-- DESCARTÉ: guardar en el look en qué tiendas está completo: un dato derivado que se queda viejo apenas cambia el stock (ADR-0468).
-- SE ROMPE SI: alguien cambia la regla de «hay» o de «ofrecida» de la web (`fn_tienda_looks_json`) y esta función no se entera: por eso
--   llama a las mismas funciones y `pnpm pruebas:vitrina-looks` («Por tienda del ERP») compara los dos resultados.
--
-- PRODUCCIÓN. Una sola parte, idempotente (se puede pegar dos veces): una función nueva, sin tocar tablas ni políticas (sin riesgo de
-- 40P01) y sin `select … into` dentro de un texto entre comillas. Pide el módulo `vitrina_web` como el editor. El orden con la web no
-- importa (la web no cambia). Requiere 20261021010000 (`fn_tienda_looks_json` por tienda).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $candado$
begin
  if to_regprocedure('retail.fn_tienda_disponible(uuid[], uuid[])') is null
     or to_regprocedure('retail.fn_tienda_precios(uuid[], uuid, boolean)') is null
     or to_regprocedure('retail.fn_tienda_sedes_web()') is null
     or to_regprocedure('retail.tienda_catalogo(uuid)') is null then
    raise exception 'Faltan las reglas de «hay» y de precio de la tienda: pega antes 20261015012000 y 20261021010000.';
  end if;
  if to_regclass('retail.vitrina_looks') is null or to_regclass('retail.vitrina_look_piezas') is null then
    raise exception 'Faltan las tablas de looks: pega antes 20261015031000_vitrina_looks.sql.';
  end if;
end
$candado$;

create or replace function retail.fn_vitrina_looks_por_tienda()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_res jsonb;
begin
  perform retail.fn_exigir_modulo('vitrina_web');

  with tiendas as (
    -- Las tiendas de la web, con su nombre (el mismo orden que usa la tienda: por nombre).
    select t.id, u.nombre
      from unnest(retail.fn_tienda_sedes_web()) as t (id)
      join retail.ubicaciones u on u.id = t.id
  ),
  cats as materialized (
    -- El catálogo de cada tienda, una vez: de aquí sale qué prenda en qué color se ve en esa tienda.
    select t.id as sede_id, retail.tienda_catalogo(t.id) as cat from tiendas t
  ),
  visto as materialized (
    select c.sede_id, (x ->> 'id')::uuid as producto_id, co ->> 'codigo' as color_codigo
      from cats c
     cross join lateral jsonb_array_elements(coalesce(c.cat -> 'prendas', '[]'::jsonb)) x
     cross join lateral jsonb_array_elements(coalesce(x -> 'colores', '[]'::jsonb)) co
  ),
  piezas as (
    select l.id as look_id, l.nombre as look, l.orden, l.creado_en, l.publicado,
           pz.posicion, pz.producto_id, pz.color_codigo
      from retail.vitrina_looks l
      join retail.vitrina_look_piezas pz on pz.look_id = l.id
  ),
  de_looks as (
    select coalesce(array_agg(distinct producto_id), '{}'::uuid[]) as ids from piezas
  ),
  ofrecido as materialized (
    -- Lo que la web ofrece en CADA tienda, a su precio (la regla única del precio y de las tallas: ninguna a S/ 0).
    select t.id as sede_id, o.variante_id
      from tiendas t
     cross join lateral retail.fn_tienda_precios((select ids from de_looks), t.id, true) o
  ),
  libres as materialized (
    -- Lo que hay libre en cada tienda (la regla única de «hay» de la ficha), con el color de cada talla.
    select d.variante_id, d.producto_id, d.ubicacion_id as sede_id, v.color_codigo
      from retail.fn_tienda_disponible((select ids from de_looks), array(select id from tiendas)) d
      join retail.variantes v on v.id = d.variante_id
  ),
  fila as (
    select p.look_id, p.look, p.orden, p.creado_en, p.publicado, p.posicion, p.producto_id, p.color_codigo,
           t.id as sede_id, t.nombre as tienda,
           exists (select 1 from visto s
                    where s.sede_id = t.id and s.producto_id = p.producto_id and s.color_codigo = p.color_codigo) as se_ve,
           exists (select 1 from libres l
                    where l.sede_id = t.id and l.producto_id = p.producto_id and l.color_codigo = p.color_codigo) as libre,
           exists (select 1 from libres l
                     join ofrecido o on o.variante_id = l.variante_id and o.sede_id = t.id
                    where l.sede_id = t.id and l.producto_id = p.producto_id and l.color_codigo = p.color_codigo) as ofrecida_y_libre
      from piezas p
     cross join tiendas t
  ),
  con_motivo as (
    select f.*,
           (f.se_ve and f.ofrecida_y_libre) as hay,
           case when not f.se_ve then 'no_se_ve'
                when not f.libre then 'sin_stock'
                when not f.ofrecida_y_libre then 'no_ofrecida'
           end as motivo
      from fila f
  ),
  por_look_tienda as (
    select m.look_id, m.look, m.orden, m.creado_en, m.publicado, m.sede_id, m.tienda,
           count(*) filter (where not m.hay) as faltan,
           jsonb_agg(jsonb_build_object('producto_id', m.producto_id, 'color', m.color_codigo, 'hay', m.hay, 'motivo', m.motivo)
                     order by m.posicion) as piezas
      from con_motivo m
     group by m.look_id, m.look, m.orden, m.creado_en, m.publicado, m.sede_id, m.tienda
  )
  select jsonb_build_object(
           'tiendas', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'nombre', t.nombre) order by t.nombre) from tiendas t), '[]'::jsonb),
           'looks', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', x.look_id,
                      'nombre', x.look,
                      'por_tienda', x.por_tienda)
                    order by x.orden, x.creado_en, x.look_id)
               from (
                 select p.look_id, p.look, p.orden, p.creado_en,
                        jsonb_agg(jsonb_build_object(
                          'sede', p.sede_id,
                          'tienda', p.tienda,
                          'completo', p.faltan = 0,
                          'faltan', p.faltan,
                          'piezas', p.piezas)
                        order by p.tienda) as por_tienda
                   from por_look_tienda p
                  group by p.look_id, p.look, p.orden, p.creado_en
               ) x), '[]'::jsonb))
    into v_res;
  return v_res;
end
$fn$;

revoke all on function retail.fn_vitrina_looks_por_tienda() from public, anon;
grant execute on function retail.fn_vitrina_looks_por_tienda() to authenticated;

create or replace function retail.fn_vitrina_prendas_por_tienda()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_res jsonb;
begin
  perform retail.fn_exigir_modulo('vitrina_web');

  with tiendas as (
    select t.id, u.nombre
      from unnest(retail.fn_tienda_sedes_web()) as t (id)
      join retail.ubicaciones u on u.id = t.id
  ),
  cats as materialized (
    select t.id as sede_id, retail.tienda_catalogo(t.id) as cat from tiendas t
  ),
  visto as materialized (
    -- Cada prenda en cada color que la web muestra en cada tienda (la regla de CLAURE solo en Lima, ADR-0465, ya viene en el catálogo).
    select c.sede_id, (x ->> 'id')::uuid as producto_id, co ->> 'codigo' as color_codigo
      from cats c
     cross join lateral jsonb_array_elements(coalesce(c.cat -> 'prendas', '[]'::jsonb)) x
     cross join lateral jsonb_array_elements(coalesce(x -> 'colores', '[]'::jsonb)) co
  ),
  ids as (
    select coalesce(array_agg(distinct producto_id), '{}'::uuid[]) as ids from visto
  ),
  ofrecido as materialized (
    select t.id as sede_id, o.variante_id
      from tiendas t
     cross join lateral retail.fn_tienda_precios((select ids from ids), t.id, true) o
  ),
  hay as materialized (
    -- Hay libre y se ofrece, en la misma talla (la regla de la ficha y de la tienda): una vez, juntando, y no una subconsulta por fila.
    select distinct d.ubicacion_id as sede_id, d.producto_id, v.color_codigo
      from retail.fn_tienda_disponible((select ids from ids), array(select id from tiendas)) d
      join retail.variantes v on v.id = d.variante_id
      join ofrecido o on o.variante_id = d.variante_id and o.sede_id = d.ubicacion_id
  ),
  por_prenda as (
    select s.producto_id, s.color_codigo, array_agg(distinct s.sede_id order by s.sede_id) as en
      from visto s
      join hay h on h.sede_id = s.sede_id and h.producto_id = s.producto_id and h.color_codigo = s.color_codigo
     group by s.producto_id, s.color_codigo
  )
  select jsonb_build_object(
           'tiendas', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'nombre', t.nombre) order by t.nombre) from tiendas t), '[]'::jsonb),
           -- Solo las que hay en alguna tienda: una prenda que no aparece aquí no hay en ninguna.
           'prendas', coalesce((select jsonb_agg(jsonb_build_object('producto_id', p.producto_id, 'color', p.color_codigo, 'en', to_jsonb(p.en))
                                                 order by p.producto_id, p.color_codigo) from por_prenda p), '[]'::jsonb))
    into v_res;
  return v_res;
end
$fn$;

revoke all on function retail.fn_vitrina_prendas_por_tienda() from public, anon;
grant execute on function retail.fn_vitrina_prendas_por_tienda() to authenticated;
