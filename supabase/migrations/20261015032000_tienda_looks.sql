-- ============================================================================
-- 20261015032000_tienda_looks.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 11: «Arma tu look» en la tienda
--
-- QUÉ HACE. La tienda lee los looks del ERP (Vitrina web ▸ Looks, 20261015031000) por la puerta angosta (rol `tienda_web`):
--   · `retail.tienda_looks(p_sede)`  — los looks que se ven, en su orden, con su lámina, sus prendas, el precio de cada una y el total.
--   · `retail.tienda_look(p_id, p_sede)` — uno, con «Look N de M» y las tallas de cada prenda para elegir (propuesta h: el look se
--     agrega completo eligiendo cada talla). Una talla dice solo si HAY o no (ADR-0408, DECIDÍ 6: la cifra nunca sale de la base).
--
-- EL PRECIO ES EL DE LA FICHA Y LA BOLSA, NO OTRO (integración de la tienda, 2026-10-15). Cada prenda del look es un modelo en UN color, y
-- vale lo que vale ese color en la tienda elegida: el resumen por color de `fn_tienda_precios` (20261015012000), que lee la regla única
-- del precio (`fn_tienda_precio_talla`: el precio de tienda de la sede elegida o, con «Todas», el mayor entre las de la web, con la
-- campaña de la caja encima, ADR-0403), con la MISMA regla de la tarjeta del catálogo (el de su talla más cara; «desde» cuando la
-- campaña no toca a todas sus tallas por igual). Antes tomaba el precio del MODELO del catálogo: con una campaña solo en el negro, la
-- falda beige del look decía «Desde» el precio del negro y la bolsa le cobraba el del beige. La tienda elegida es la del catálogo
-- (`tienda_catalogo`, que el look lee igual para decir qué se ve). El total del look es la suma de lo que se paga por cada prenda (con
-- «desde» si alguna lo lleva), y el ERP muestra el mismo total con «Todas» (20261015031000).
--
-- QUÉ TALLAS SE OFRECEN. Las que ofrece la ficha en esa tienda, ni una más: las de `fn_tienda_precios` (activas y con precio en esa tienda;
-- una talla a S/ 0 —la bolsa de obsequio, ADR-0384— no se ofrece en la web). Antes el look listaba toda talla activa de su color, también
-- las de S/ 0 que la ficha no ofrece.
--
-- QUÉ LOOK SE VE. Encendido en el ERP y con TODAS sus prendas a la vista en el catálogo de la tienda (en su color), con la misma pieza
-- que usa el ERP para decirlo (`fn_vitrina_look_se_ve`). Si una deja de verse (se ocultó, se descontinuó, se apagó su color o se
-- eliminó), el look entero no sale: ver «DECIDÍ» en 20261015031000.
--
-- QUÉ TALLA «HAY». De las que se ofrecen, la que tiene algo disponible en alguna tienda que se ve en la web, con LA regla de «hay» de la ficha
-- (`fn_tienda_disponible` con `fn_tienda_sedes_web()`, 20261015012000: lo físico menos lo dañado y lo apartado —un pedido web
-- confirmado también aparta—, de una talla que no se retiró, sin el Taller ni las tiendas escondidas). Es la misma pieza que dice el
-- total de la talla en la ficha: el look no puede decir «no hay» de lo que la ficha dice que hay (integración de la tienda,
-- 2026-10-15). En cualquier tienda de la web y no solo en la elegida: el cliente elige una tienda para recoger todo y lo que falta se
-- trae con un traslado (maqueta v4, «Prendas en dos tiendas»).
--
-- `fn_tienda_looks_json` es interna (no empieza con `tienda_`): solo la llaman las dos de arriba, como dueñas.
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe), después de 20261015012000 y 20261015031000. Solo funciones y
-- permisos: se pega entera y se puede volver a correr. Lee `tienda_catalogo`, `fn_tienda_precios`, `fn_tienda_sedes_web` y
-- `fn_tienda_disponible`. Prueba: `pnpm pruebas:vitrina-looks` (con `pnpm pruebas:tienda-puerta`, que vigila la puerta, y
-- `pnpm pruebas:tienda-ficha`, que cruza el precio del look con el de la ficha, el catálogo y la bolsa).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Lo que da por hecho (si falta, no se pega nada).
do $$
begin
  if to_regprocedure('retail.fn_tienda_disponible(uuid[], uuid[])') is null or to_regprocedure('retail.fn_tienda_sedes_web()') is null
     or to_regprocedure('retail.fn_tienda_precios(uuid[], uuid, boolean)') is null then
    raise exception 'Faltan las reglas de «hay» y del precio de la tienda: pega antes 20261015012000_tienda_ficha_y_niveles_por_tienda.sql.';
  end if;
  if to_regclass('retail.vitrina_looks') is null then
    raise exception 'Faltan los looks del ERP: pega antes 20261015031000_vitrina_looks.sql.';
  end if;
end
$$;

-- Los looks que se ven, con sus prendas (nombre, categoría, color y foto) tal como las da `p_catalogo` (= `tienda_catalogo(p_sede)`, que
-- también dice qué se ve y con qué tienda: su `sede`) y lo que vale cada una en SU color en esa tienda (`fn_tienda_precios` por color).
-- `p_id` null: todos; si no, ese (o ninguno). `p_sedes`: las tiendas de la web, para decir qué talla hay (solo con `p_con_tallas`).
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
  -- Encendido y con todas sus prendas a la vista: tantas prendas que se ven (en su color) como las que se guardaron.
  visibles as (
    select l.id, l.nombre, l.frase,
           row_number() over (order by l.orden, l.creado_en, l.id) as numero,
           count(*) over () as de
      from retail.vitrina_looks l
     where l.publicado
       and l.piezas = (select count(*) from retail.vitrina_look_piezas pz
                        where pz.look_id = l.id and retail.fn_vitrina_look_se_ve(p_catalogo, pz.producto_id, pz.color_codigo))
  ),
  -- Lo que se ofrece de las prendas de los looks y a qué precio, en la tienda del catálogo: la regla única del precio, con el resumen por
  -- COLOR (fn_tienda_precios). Las mismas tallas que ofrece la ficha (ninguna a S/ 0) y el precio que cobra la bolsa.
  ofrecido as (
    select o.*
      from retail.fn_tienda_precios(coalesce((select array_agg(distinct pz.producto_id) from retail.vitrina_look_piezas pz
                                               where p_id is null or pz.look_id = p_id), '{}'::uuid[]),
                                    (p_catalogo ->> 'sede')::uuid, true) o
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

-- «Arma tu look»: {sede: la tienda cuyo precio se usó (null = «Todas»), looks: [{id, nombre, frase, numero, de, total, total_final, desde,
-- piezas: [{posicion, x, y, ancho, giro, prenda: {id, nombre, categoria, precio, precio_final, desde, campana}, color, foto}]}]}.
create or replace function retail.tienda_looks(p_sede uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public
as $fn$
declare
  v_catalogo jsonb := retail.tienda_catalogo(p_sede);
begin
  return jsonb_build_object('sede', v_catalogo -> 'sede', 'looks', retail.fn_tienda_looks_json(v_catalogo, null, null, false));
end;
$fn$;

comment on function retail.tienda_looks(uuid) is
  'Tienda online (ADR-0408, actividad 11): los looks que se ven en «Arma tu look», con la lámina, el precio de cada prenda (lo que vale su color en esa tienda: fn_tienda_precios, la regla única del precio, el mismo de la ficha y la bolsa) y el total. {sede, looks: [...]}. Solo la llama tienda_web.';

-- Un look para elegir las tallas: {sede, look: {…lo de tienda_looks, y en cada prenda tallas: [{variante_id, talla, hay}]} | null}. null
-- si no existe o no se ve.
create or replace function retail.tienda_look(p_id uuid, p_sede uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public
as $fn$
declare
  v_catalogo jsonb;
  v_sedes uuid[];
begin
  v_catalogo := retail.tienda_catalogo(p_sede);
  if p_id is null then
    return jsonb_build_object('sede', v_catalogo -> 'sede', 'look', null);
  end if;
  v_sedes := retail.fn_tienda_sedes_web();
  return jsonb_build_object('sede', v_catalogo -> 'sede', 'look', retail.fn_tienda_looks_json(v_catalogo, v_sedes, p_id, true) -> 0);
end;
$fn$;

comment on function retail.tienda_look(uuid, uuid) is
  'Tienda online (ADR-0408, actividad 11): un look de «Arma tu look» con las tallas que la ficha ofrece de cada prenda en su color (solo si hay o no, nunca la cifra). {sede, look | null}. Solo la llama tienda_web.';

revoke all on function retail.tienda_looks(uuid) from public, anon, authenticated;
revoke all on function retail.tienda_look(uuid, uuid) from public, anon, authenticated;
grant execute on function retail.tienda_looks(uuid) to tienda_web;
grant execute on function retail.tienda_look(uuid, uuid) to tienda_web;

-- Validación final: solo tienda_web las llama, y la interna nadie.
do $$
begin
  if has_function_privilege('anon', 'retail.tienda_looks(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.tienda_looks(uuid)', 'EXECUTE')
     or not has_function_privilege('tienda_web', 'retail.tienda_looks(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'retail.tienda_look(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.tienda_look(uuid, uuid)', 'EXECUTE')
     or not has_function_privilege('tienda_web', 'retail.tienda_look(uuid, uuid)', 'EXECUTE') then
    raise exception 'tienda looks: tienda_looks y tienda_look tienen que ser solo de tienda_web';
  end if;
  if has_function_privilege('tienda_web', 'retail.fn_tienda_looks_json(jsonb, uuid[], uuid, boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.fn_tienda_looks_json(jsonb, uuid[], uuid, boolean)', 'EXECUTE') then
    raise exception 'tienda looks: fn_tienda_looks_json es interna';
  end if;
end;
$$;

reset lock_timeout;
