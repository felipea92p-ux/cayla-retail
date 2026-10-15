-- ============================================================================
-- 20261015032000_tienda_looks.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 11: «Arma tu look» en la tienda
--
-- QUÉ HACE. La tienda lee los looks del ERP (Vitrina web ▸ Looks, 20261015031000) por la puerta angosta (rol `tienda_web`):
--   · `retail.tienda_looks(p_sede)`  — los looks que se ven, en su orden, con su lámina, sus prendas, el precio de cada una y el total.
--   · `retail.tienda_look(p_id, p_sede)` — uno, con «Look N de M» y las tallas de cada prenda para elegir (propuesta h: el look se
--     agrega completo eligiendo cada talla). Una talla dice solo si HAY o no (ADR-0408, DECIDÍ 6: la cifra nunca sale de la base).
--
-- EL PRECIO ES EL DE `tienda_catalogo`, NO OTRO. Cada prenda vale exactamente lo que dice el catálogo de la tienda para esa tienda: el
-- precio de tienda de la sede elegida (`fn_precio_en_sede`) o, con «Todas», el mayor entre las tiendas de la web, con la campaña de la
-- caja encima (ADR-0403), y «desde» cuando la campaña no toca a todas sus tallas por igual. Para que no haya dos reglas, estas funciones
-- LLAMAN a `tienda_catalogo` y toman de ahí cada prenda: si mañana cambia la regla del precio, el look cambia con ella. El total del look
-- es la suma de lo que se paga por cada prenda (con «desde» si alguna lo lleva).
--
-- QUÉ LOOK SE VE. Encendido en el ERP y con TODAS sus prendas a la vista en el catálogo de la tienda (en su color), con la misma pieza
-- que usa el ERP para decirlo (`fn_vitrina_look_se_ve`). Si una deja de verse (se ocultó, se descontinuó, se apagó su color o se
-- eliminó), el look entero no sale: ver «DECIDÍ» en 20261015031000.
--
-- QUÉ TALLA «HAY». La que tiene algo disponible en alguna tienda que se ve en la web, con la cifra única de Existencias
-- (`fn_existencias_base`: lo físico menos lo dañado y lo apartado —un pedido web confirmado también aparta—, de una talla que no se
-- retiró). En cualquier tienda de la web y no solo en la elegida: el cliente elige una tienda para recoger todo y lo que falta se trae
-- con un traslado (maqueta v4, «Prendas en dos tiendas»).
--
-- `fn_tienda_looks_json` es interna (no empieza con `tienda_`): solo la llaman las dos de arriba, como dueñas.
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe), después de 20261015031000. Solo funciones y permisos: se pega
-- entera y se puede volver a correr. Lee `tienda_catalogo` y `tienda_sedes` (plpgsql: Postgres no las revisa al crearla).
-- Prueba: `pnpm pruebas:vitrina-looks` (con `pnpm pruebas:tienda-puerta`, que vigila la puerta).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Los looks que se ven, con sus prendas tal como las da `p_catalogo` (= `tienda_catalogo(p_sede)`). `p_id` null: todos; si no, ese
-- (o ninguno). `p_sedes`: las tiendas de la web, para decir qué talla hay (solo con `p_con_tallas`).
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
  -- Las tallas que hay en alguna tienda de la web (la cifra única de Existencias). Solo si se piden, y solo de las prendas de los looks.
  disponibles as (
    select distinct e.variante_id
      from retail.fn_existencias_base(null, case when p_con_tallas then coalesce((
             select array_agg(distinct pz.producto_id) from retail.vitrina_look_piezas pz where p_id is null or pz.look_id = p_id), '{}'::uuid[])
           else '{}'::uuid[] end) e
     where e.ubicacion_id = any (coalesce(p_sedes, '{}'::uuid[]))
       and not e.talla_retirada
       and e.disponible > 0
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
                     'precio', x.prenda -> 'precio',
                     'precio_final', x.prenda -> 'precio_final',
                     'desde', x.prenda -> 'desde',
                     'campana', x.prenda -> 'campana'),
                   'color', jsonb_build_object('codigo', x.color -> 'codigo', 'nombre', x.color -> 'nombre', 'hex', x.color -> 'hex'),
                   -- La foto de su color; si no tiene, la principal del modelo (propuesta c de la maqueta).
                   'foto', coalesce(x.color ->> 'foto', x.prenda -> 'fotos' ->> 0))
                 || case when p_con_tallas then jsonb_build_object('tallas', coalesce((
                      select jsonb_agg(jsonb_build_object(
                               'variante_id', va.id,
                               'talla', coalesce(ta.valor, 'Única'),
                               'hay', va.id in (select d.variante_id from disponibles d))
                             -- Letras (XS…XXL), números (26, 28…) y «Única»/«Estándar» al final.
                             order by
                               case when upper(coalesce(ta.valor, '')) = any (array['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL']) then 0
                                    when coalesce(ta.valor, '') ~ '^[0-9]+([.,][0-9]+)?$' then 1
                                    when ta.valor is null or lower(ta.valor) in ('única', 'unica', 'único', 'unico', 'estándar', 'estandar', 'std', 'u') then 3
                                    else 2 end,
                               array_position(array['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL'], upper(ta.valor)),
                               case when ta.valor ~ '^[0-9]+([.,][0-9]+)?$' then replace(ta.valor, ',', '.')::numeric end,
                               ta.valor, va.id)
                        from retail.variantes va
                        left join retail.tallas ta on ta.id = va.talla_id
                       where va.producto_id = x.producto_id and va.color_codigo = x.color_codigo and va.activo), '[]'::jsonb))
                   else '{}'::jsonb end
               order by x.posicion)
          from piezas x
         where x.look_id = v.id)
    ) order by v.numero), '[]'::jsonb)
  from visibles v
  cross join lateral (
    select sum((x.prenda ->> 'precio')::numeric) as total,
           sum((x.prenda ->> 'precio_final')::numeric) as total_final,
           coalesce(bool_or((x.prenda ->> 'desde')::boolean), false) as desde
      from piezas x
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
  'Tienda online (ADR-0408, actividad 11): los looks que se ven en «Arma tu look», con la lámina, el precio de cada prenda (el de tienda_catalogo para esa tienda) y el total. {sede, looks: [...]}. Solo la llama tienda_web.';

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
  v_sedes := array(select (s ->> 'id')::uuid from jsonb_array_elements(coalesce(retail.tienda_sedes() -> 'sedes', '[]'::jsonb)) s);
  return jsonb_build_object('sede', v_catalogo -> 'sede', 'look', retail.fn_tienda_looks_json(v_catalogo, v_sedes, p_id, true) -> 0);
end;
$fn$;

comment on function retail.tienda_look(uuid, uuid) is
  'Tienda online (ADR-0408, actividad 11): un look de «Arma tu look» con las tallas de cada prenda (solo si hay o no, nunca la cifra). {sede, look | null}. Solo la llama tienda_web.';

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
