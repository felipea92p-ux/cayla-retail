-- ============================================================================
-- 20261015012000_tienda_ficha_y_niveles_por_tienda.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 4: la ficha de la prenda
-- con cuánto hay en cada tienda, y el catálogo que filtra por la tienda elegida
--
-- EL PROBLEMA PRIMERO. Una clienta en Lima quiere saber si la blusa que vio está en Trujillo antes de separarla. El catálogo de la
-- actividad 3 le muestra el precio de la tienda que elige, pero no cuánto hay: «Ver lo que hay en Trujillo» cambiaba el precio y
-- seguía mostrando todo. Y la base no puede mandar a la web la cifra exacta: la competencia y cualquier curioso sabrían cuánto
-- tiene cada tienda (ADR-0408, DECIDÍ 6: «Hay» con 4 o más, 3, 2, «Última» o «—»; el número exacto de 4 o más nunca sale).
--
-- LO QUE HACE
--   1. `retail.tienda_ficha(p_producto, p_sede)`, para la tienda (rol `tienda_web`): un modelo publicado, con su precio (el de la
--      tienda elegida o, con «Todas», el mayor entre las tiendas de la web) y la campaña, sus colores, sus tallas en el orden de la
--      tienda, todas sus fotos del almacén público y, por cada talla de cada color, su precio y su NIVEL en cada tienda de la web.
--      `null` si el modelo no se ve en la web (oculto, descontinuado, de prueba o que no existe).
--   2. `retail.tienda_catalogo(p_sede)` suma a cada prenda su nivel en cada tienda de la web y el de todas juntas (`stock`), para
--      que la tienda filtre «lo que hay en Trujillo» y escriba la nota de la tarjeta («Quedan 2 en Lima», «Solo en Trujillo»…). La
--      campaña de la tarjeta trae además su id y su último día (la ficha cuenta lo que falta). El resto, igual que en la actividad 3.
--   3. Las piezas internas que comparten las dos (nadie de afuera las llama):
--        · `fn_tienda_nivel(cantidad, umbral)` — LA regla del nivel: 0 si no hay; el número si es el umbral o menos («Última» es el
--          1); «hay» si es más. El umbral es `configuracion_tienda_web.quedan_pocas_desde` (de 1 a 3, Configuración ▸ Tienda web),
--          y aquí también se acota a 1–3: la cifra de 4 o más no sale ni con un umbral mal guardado.
--        · `fn_tienda_umbral()`, `fn_tienda_sedes_web()` (las tiendas de la web, en el orden de `tienda_sedes`).
--        · `fn_tienda_disponible(productos, tiendas)` — cuánto hay libre por talla y tienda: LA cifra de stock de ADR-0270
--          (`fn_existencias_base.disponible`: piso + almacén + lo que no tiene lugar, sin Cuarentena y sin lo apartado; lo apartado
--          incluye las reservas de los pedidos web, ADR-0408 DECIDÍ 4). Solo tallas activas y solo tiendas de la web: el Taller
--          y una tienda escondida no cuentan.
--        · `fn_tienda_libre(prenda, tiendas)` — la misma cifra para UNA prenda en esas tiendas (la suma de `fn_tienda_disponible`):
--          no es otra regla, es la forma corta para quien pregunta por una sola talla («Separar», «Avísame»).
--        · `fn_tienda_precios(productos, tiendas)` — por talla: su precio en la(s) tienda(s) y la campaña de la caja (ADR-0403),
--          y el resumen del modelo que usa la tarjeta (el mismo cálculo de la actividad 3, ahora escrito una sola vez para el
--          catálogo y la ficha).
--
-- UNA SOLA REGLA DE «HAY» (integración de la tienda, 2026-10-15). Todo lo que en la tienda dice si una prenda HAY —la ficha y el
-- catálogo (aquí), la bolsa y «Separar» (20261015021000), «Arma tu look» (20261015032000), «Avísame» (20261015024000), las
-- esperas y «llegó» de «Mi cuenta» (20261015025000) y «Esperan una talla» del ERP (20261015030000)— lee `fn_tienda_disponible`
-- con las tiendas de `fn_tienda_sedes_web()`. Ninguna vuelve a sumar `stock` ni a decidir qué tiendas cuentan: así la ficha no
-- puede decir «hay» y el look «no hay» de la misma prenda. Lo vigila `pnpm pruebas:tienda-club` (sección R: una prenda en
-- Cuarentena o reservada por un pedido web dice «no hay» en todas a la vez, y romper esta función a propósito las rompe todas).
--
-- QUÉ SE GARANTIZA Y DÓNDE
--   · La cifra exacta de 4 o más no sale: todo nivel pasa por `fn_tienda_nivel`, que solo devuelve 0, 1, 2, 3 o «hay» (la prueba
--     revisa cada nivel de la respuesta con 7 unidades en la talla, y con el umbral en 1, 2 y 3).
--   · Lo que se cuenta es lo que una persona puede comprar hoy en esa tienda: la Cuarentena y lo apartado (una reserva de Apartados
--     o de un pedido web) no cuentan, el Taller no es una tienda y una talla retirada no se ofrece. Vender una prenda baja el nivel
--     en el mismo instante (la ficha se lee en cada visita).
--   · Una tienda que no se ve en la web no aparece ni cuenta para «todas»; un id cualquiera se lee como «Todas» (como el precio).
--   · La ficha de un modelo oculto, descontinuado o de prueba no se puede leer ni sabiendo su id.
--
-- DECIDÍ: el nivel como dato (`"hay"` o un número de 0 a 3), no como texto («Hay», «Última»): las palabras son de la pantalla y
--   la base garantiza la regla. Los niveles de todas las tiendas en la misma respuesta (no una lectura por tienda): la ficha muestra
--   la tabla completa con la tienda elegida resaltada, como la maqueta.
-- DESCARTÉ: sumar `stock` aquí a mano (sería la séptima suma distinta de ADR-0270); filtrar en la base por la tienda elegida (la
--   tienda necesita lo que hay en las otras para decir «N más en otras tiendas» y «Otra tienda» en la talla); devolver la cifra y
--   que la tienda la esconda (la cifra viajaría igual).
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe, después de 20261014225000 y 20261014231000). Una sola parte,
-- re-ejecutable: solo `create or replace function`, `comment`, `revoke` y `grant`; sin tablas, sin políticas ni disparadores
-- (ADR-0195). Ningún `select … into` dentro de un texto entre comillas (ADR-0288). Prueba: `pnpm pruebas:tienda-ficha`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Lo que esta migración da por hecho ----------
do $$
begin
  if to_regprocedure('retail.tienda_sedes()') is null or to_regclass('retail.configuracion_tienda_web') is null then
    raise exception 'Faltan las tiendas de la web: pega antes 20261014231000_tienda_web_sedes_y_plazos.sql.';
  end if;
  if to_regprocedure('retail.tienda_catalogo(uuid)') is null or to_regprocedure('retail.fn_vitrina_publicable(uuid)') is null then
    raise exception 'Falta la Vitrina web: pega antes 20261014225000_vitrina_web.sql.';
  end if;
  if to_regprocedure('retail.fn_existencias_base(uuid, uuid[])') is null then
    raise exception 'Falta retail.fn_existencias_base: pega antes 20260929010000_fn_existencias_una_sola_cifra.sql.';
  end if;
  if to_regprocedure('retail.fn_precio_en_sede(uuid, uuid)') is null
     or to_regprocedure('retail.fn_descuento_campana(numeric, numeric)') is null
     or to_regprocedure('retail.fn_campanas_por_variante(date, integer, uuid[])') is null then
    raise exception 'Faltan el precio por tienda o la regla de la campaña (20261011100000, 20260918170000, ADR-0403).';
  end if;
  if to_regprocedure('retail.fn_actividad_peso_talla(text)') is null then
    raise exception 'Falta retail.fn_actividad_peso_talla (el orden de las tallas): pega antes 20261002234500_actividad_productos.sql.';
  end if;
end
$$;

-- ---------- 1. El nivel: LA regla de lo que ve el cliente ----------
-- 0 = no hay («—»); 1 = «Última»; 2 y 3 = el número (solo hasta el umbral); «hay» = más que el umbral. El umbral se acota a 1–3
-- también aquí: aunque alguien guardara otro, la cifra de 4 o más nunca sale.
create or replace function retail.fn_tienda_nivel(p_cantidad integer, p_umbral integer)
returns jsonb
language sql
immutable
set search_path = retail, public
as $$
  select case
    when coalesce(p_cantidad, 0) <= 0 then to_jsonb(0)
    when p_cantidad <= greatest(1, least(3, coalesce(p_umbral, 3))) then to_jsonb(p_cantidad)
    else to_jsonb('hay'::text)
  end
$$;

comment on function retail.fn_tienda_nivel(integer, integer) is
  'Tienda online (ADR-0408, DECIDÍ 6): cuánto hay, como lo ve el cliente. 0 (no hay), el número si es el umbral o menos (1 = «Última») o "hay". El umbral se acota a 1–3: la cifra de 4 o más nunca sale. Interna: la usan tienda_catalogo y tienda_ficha.';

-- Desde cuántas unidades el cliente ve el número (Configuración ▸ Tienda web). Sin la fila, 3 (lo de la maqueta).
create or replace function retail.fn_tienda_umbral()
returns integer
language sql
stable
set search_path = retail, public
as $$
  select greatest(1, least(3, coalesce((select c.quedan_pocas_desde from retail.configuracion_tienda_web c where c.id), 3)))
$$;

comment on function retail.fn_tienda_umbral() is
  'Tienda online (ADR-0408): desde cuántas unidades el cliente ve el número en vez de «Hay» (configuracion_tienda_web.quedan_pocas_desde, acotado a 1–3; sin fila, 3). Interna.';

-- Las tiendas que se ven en la web, en el orden en que la web las muestra (el de tienda_sedes: por nombre web).
create or replace function retail.fn_tienda_sedes_web()
returns uuid[]
language sql
stable
set search_path = retail, public
as $$
  select coalesce(array(
    select (s.x ->> 'id')::uuid
      from jsonb_array_elements(coalesce(retail.tienda_sedes() -> 'sedes', '[]'::jsonb)) with ordinality as s (x, n)
     order by s.n), '{}'::uuid[])
$$;

comment on function retail.fn_tienda_sedes_web() is
  'Tienda online (ADR-0408): los id de las tiendas que se ven en la web, en el orden de tienda_sedes. Interna.';

-- ---------- 2. Cuánto hay libre por talla y tienda (LA cifra de ADR-0270) ----------
-- `disponible` de fn_existencias_base: físico − Cuarentena − apartado (Apartados y las reservas de los pedidos web). Solo tallas
-- activas, solo las tiendas pedidas y solo lo que tiene algo (lo que no sale es 0).
create or replace function retail.fn_tienda_disponible(p_producto_ids uuid[], p_sedes uuid[])
returns table (variante_id uuid, producto_id uuid, ubicacion_id uuid, disponible integer)
language sql
stable
set search_path = retail, public
as $$
  select e.variante_id, e.producto_id, e.ubicacion_id, e.disponible
    from retail.fn_existencias_base(null, coalesce(p_producto_ids, '{}'::uuid[])) e
   where e.ubicacion_id = any (coalesce(p_sedes, '{}'::uuid[]))
     and not e.talla_retirada
     and e.disponible > 0
$$;

comment on function retail.fn_tienda_disponible(uuid[], uuid[]) is
  'Tienda online (ADR-0408): LA regla de «hay» de toda la tienda. Lo libre por talla y tienda, de fn_existencias_base (ADR-0270: sin Cuarentena ni apartado, que incluye las reservas de los pedidos web), solo tallas activas y solo las tiendas pedidas (fn_tienda_sedes_web: sin el Taller ni las escondidas). La leen la ficha, el catálogo, la bolsa, «Separar», los looks, «Avísame», «Mi cuenta» y «Esperan una talla». Interna: la cifra exacta nunca sale a la web (pasa por fn_tienda_nivel).';

-- Lo libre de UNA prenda en esas tiendas: la suma de `fn_tienda_disponible` (no otra regla). Para quien pregunta por una sola talla.
create or replace function retail.fn_tienda_libre(p_variante_id uuid, p_sedes uuid[])
returns integer
language sql
stable
set search_path = retail, public
as $$
  select coalesce(sum(d.disponible), 0)::integer
    from retail.fn_tienda_disponible(array(select v.producto_id from retail.variantes v where v.id = p_variante_id), p_sedes) d
   where d.variante_id = p_variante_id
$$;

comment on function retail.fn_tienda_libre(uuid, uuid[]) is
  'Tienda online (ADR-0408): lo libre de una prenda (talla y color) en esas tiendas: la suma de fn_tienda_disponible, la regla única de «hay». La usan «Separar» y «Avísame». Interna.';

-- ---------- 3. El precio por talla y el de la tarjeta (una sola vez para el catálogo y la ficha) ----------
-- Por cada talla activa con precio de los modelos pedidos: su precio en `p_precio_de` (la tienda elegida, o el MAYOR entre las
-- tiendas de la web con «Todas»; sin ninguna tienda, el de la grilla) y la campaña de la caja (la de mayor % de esa talla, y el
-- precio que baja al S/ 0.10 de abajo, ADR-0403). Y, repetido en cada fila, el resumen del MODELO que dibuja la tarjeta (el de la
-- actividad 3): el precio es el de su talla más cara; con campaña en todas sus tallas y el mismo %, el precio de campaña sin
-- «Desde»; si no, lo menos que se paga por una talla con campaña y `desde`; la campaña que da ese precio.
create or replace function retail.fn_tienda_precios(p_producto_ids uuid[], p_precio_de uuid[])
returns table (
  variante_id uuid, producto_id uuid, color_codigo text, talla_id uuid,
  precio numeric, precio_final numeric, campana jsonb,
  modelo_precio numeric, modelo_final numeric, modelo_desde boolean, modelo_campana jsonb
)
language sql
stable
set search_path = retail, public
as $$
  with tallas as (
    select v.id, v.producto_id, v.color_codigo, v.talla_id,
           case when coalesce(cardinality(p_precio_de), 0) = 0 then v.precio
                else (select max(retail.fn_precio_en_sede(v.id, s.id)) from unnest(p_precio_de) as s (id)) end as precio
      from retail.variantes v
     where v.producto_id = any (coalesce(p_producto_ids, '{}'::uuid[]))
       and v.activo
  ),
  -- `coalesce(…, '{}')`: con la lista vacía la regla no devuelve nada (con null devolvería las campañas de TODO el catálogo).
  campana as (
    select distinct on (x.variante_id) x.variante_id, x.etiqueta_id, x.etiqueta_nombre, x.descuento_pct
      from retail.fn_campanas_por_variante(retail.fn_hoy_lima(), 0, coalesce((select array_agg(t.id) from tallas t), '{}'::uuid[])) x
     order by x.variante_id, x.descuento_pct desc, x.etiqueta_nombre, x.etiqueta_id
  ),
  -- Una talla a S/ 0 no se ofrece en la web (el precio 0 es solo de empaque, ADR-0384).
  f as (
    select t.id, t.producto_id, t.color_codigo, t.talla_id, t.precio,
           t.precio - retail.fn_descuento_campana(t.precio, ca.descuento_pct) as final,
           ca.descuento_pct as pct,
           ca.etiqueta_nombre as nombre_campana,
           case when ca.variante_id is null then null
                else jsonb_build_object('id', ca.etiqueta_id, 'nombre', ca.etiqueta_nombre, 'pct', ca.descuento_pct,
                                        'hasta', e.vigente_hasta) end as campana
      from tallas t
      left join campana ca on ca.variante_id = t.id
      left join retail.etiquetas e on e.id = ca.etiqueta_id
     where t.precio > 0
  ),
  w as (
    select f.*,
           max(f.precio) over m as m_precio,
           count(*) over m as m_tallas,
           count(f.pct) over m as m_con_campana,
           min(f.pct) over m as m_pct_menor,
           max(f.pct) over m as m_pct_mayor,
           max(f.final) over m as m_final_mayor,
           min(f.final) filter (where f.pct is not null) over m as m_final_menor_con_campana,
           -- La campaña que da lo menos que se paga (las tallas sin campaña, al final).
           first_value(f.campana) over (partition by f.producto_id
                                        order by f.pct is null, f.final, f.pct desc, f.nombre_campana) as m_campana
      from f
    window m as (partition by f.producto_id)
  )
  select w.id, w.producto_id, w.color_codigo, w.talla_id, w.precio, w.final, w.campana,
         w.m_precio, x.final,
         x.final < w.m_precio and not (w.m_con_campana = w.m_tallas and w.m_pct_menor = w.m_pct_mayor),
         case when x.final < w.m_precio then w.m_campana end
    from w
    cross join lateral (
      select case when w.m_con_campana = 0 then w.m_precio
                  when w.m_con_campana = w.m_tallas and w.m_pct_menor = w.m_pct_mayor then w.m_final_mayor
                  else w.m_final_menor_con_campana end as final
    ) x
$$;

comment on function retail.fn_tienda_precios(uuid[], uuid[]) is
  'Tienda online (ADR-0408): por talla activa con precio, su precio en la tienda (o el mayor entre las de la web) con la campaña de la caja (ADR-0403), y el resumen del modelo que dibuja la tarjeta (precio, precio final, «Desde», campaña). Una sola vez para tienda_catalogo y tienda_ficha. Interna.';

revoke all on function retail.fn_tienda_nivel(integer, integer) from public, anon, authenticated;
revoke all on function retail.fn_tienda_umbral() from public, anon, authenticated;
revoke all on function retail.fn_tienda_sedes_web() from public, anon, authenticated;
revoke all on function retail.fn_tienda_disponible(uuid[], uuid[]) from public, anon, authenticated;
revoke all on function retail.fn_tienda_libre(uuid, uuid[]) from public, anon, authenticated;
revoke all on function retail.fn_tienda_precios(uuid[], uuid[]) from public, anon, authenticated;

-- ---------- 4. El catálogo de la tienda, ahora con cuánto hay en cada tienda ----------
-- Lo mismo de la actividad 3 (lo publicado y vendible, al precio de la tienda elegida o, con «Todas», al mayor; la campaña de la
-- caja; colores y hasta dos fotos del almacén público), más `stock`: el nivel del modelo (todas sus tallas y colores) en cada
-- tienda de la web (`sedes`, por id) y en todas juntas (`total`). La campaña trae su id y su último día.
-- {sede, prendas: [{id, codigo, nombre, categoria, precio, precio_final, desde, campana, colores, fotos, stock}]}.
create or replace function retail.tienda_catalogo(p_sede uuid default null)
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
  if p_sede = any (v_sedes) then
    v_sede := p_sede;
  end if;
  v_ids := array(select vp.producto_id from retail.vitrina_productos vp
                  where vp.publicado and retail.fn_vitrina_publicable(vp.producto_id));

  return (
    with pv as materialized (
      select * from retail.fn_tienda_precios(v_ids, case when v_sede is not null then array[v_sede] else v_sedes end)
    ),
    modelos as (
      select distinct on (pv.producto_id)
             pv.producto_id as id, pv.modelo_precio as precio, pv.modelo_final as final, pv.modelo_desde as desde,
             pv.modelo_campana as campana
        from pv
       order by pv.producto_id
    ),
    -- Lo libre de cada modelo en cada tienda de la web (solo sus tallas que se ofrecen).
    disponible as (
      select d.producto_id, d.ubicacion_id, sum(d.disponible)::integer as n
        from retail.fn_tienda_disponible(v_ids, v_sedes) d
       where d.variante_id in (select pv.variante_id from pv)
       group by d.producto_id, d.ubicacion_id
    ),
    foto_ok as (
      select pf.producto_id, pf.color_codigo, pf.url, pf.es_principal, pf.orden, pf.created_at, pf.id
        from retail.producto_fotos pf
       where pf.producto_id = any (v_ids)
         and pf.url ~ '^https?://[^/?#]+/storage/v1/object/public/retail-productos-fotos/'
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
        'colores', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'codigo', co.codigo, 'nombre', co.nombre, 'hex', co.hex,
                   'foto', (select fo.url from foto_ok fo where fo.producto_id = m.id and fo.color_codigo = co.codigo
                             order by fo.es_principal desc, fo.orden, fo.created_at, fo.id limit 1))
                 order by co.orden, co.nombre)
            from retail.colores co
           where co.codigo in (select pv.color_codigo from pv where pv.producto_id = m.id)), '[]'::jsonb),
        'fotos', coalesce((
          select jsonb_agg(fo.url order by fo.n)
            from (select fo.url, row_number() over (order by fo.es_principal desc, fo.orden, fo.created_at, fo.id) as n
                    from foto_ok fo where fo.producto_id = m.id) fo
           where fo.n <= 2), '[]'::jsonb),
        'stock', jsonb_build_object(
          'total', retail.fn_tienda_nivel(coalesce((select sum(d.n) from disponible d where d.producto_id = m.id), 0)::integer, v_umbral),
          'sedes', coalesce((
            select jsonb_object_agg(s.id::text, retail.fn_tienda_nivel(coalesce(d.n, 0), v_umbral))
              from unnest(v_sedes) as s (id)
              left join disponible d on d.producto_id = m.id and d.ubicacion_id = s.id), '{}'::jsonb))
      ) order by vp.publicado_en desc, p.referencia, m.id), '[]'::jsonb))
    from modelos m
    join retail.productos p on p.id = m.id
    join retail.vitrina_productos vp on vp.producto_id = m.id
    left join retail.categorias c on c.id = p.categoria_id
  );
end;
$fn$;

comment on function retail.tienda_catalogo(uuid) is
  'Tienda online (ADR-0408, actividades 3 y 4): lo publicado en la Vitrina web al precio de la tienda elegida (o, con «Todas», al mayor entre las tiendas de la web; fn_precio_en_sede) y el de la campaña vigente (misma regla de la caja, ADR-0403), sus colores, hasta dos fotos y su nivel en cada tienda de la web (fn_tienda_nivel: nunca la cifra de 4 o más). {sede, prendas: [...]}. Solo la llama tienda_web.';

revoke all on function retail.tienda_catalogo(uuid) from public, anon, authenticated;
grant execute on function retail.tienda_catalogo(uuid) to tienda_web;

-- ---------- 5. La ficha de un modelo ----------
-- `null` si el modelo no se ve en la web. Si se ve:
-- {sede, umbral, sedes: [{id, nombre}] (las de la web, en su orden),
--  prenda: {id, codigo, nombre, descripcion, categoria, precio, precio_final, desde, campana,
--           colores: [{codigo, nombre, hex, foto}], tallas: [{id, nombre}] (en el orden de la tienda),
--           fotos: [{url, color}] (las del almacén público, la principal primero, hasta 12),
--           variantes: [{id, color, talla, precio, precio_final, campana, stock: {<tienda>: nivel}, total: nivel}]}}.
-- La descripción es la de la Vitrina o, si no tiene, la del catálogo.
create or replace function retail.tienda_ficha(p_producto uuid, p_sede uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public
as $fn$
declare
  v_sedes uuid[];
  v_umbral integer;
  v_sede uuid;
  v_ids uuid[];
begin
  if p_producto is null
     or not exists (select 1 from retail.vitrina_productos vp where vp.producto_id = p_producto and vp.publicado)
     or not retail.fn_vitrina_publicable(p_producto) then
    return null;
  end if;
  v_sedes := retail.fn_tienda_sedes_web();
  v_umbral := retail.fn_tienda_umbral();
  if p_sede = any (v_sedes) then
    v_sede := p_sede;
  end if;
  v_ids := array[p_producto];

  return (
    with pv as materialized (
      select * from retail.fn_tienda_precios(v_ids, case when v_sede is not null then array[v_sede] else v_sedes end)
    ),
    disponible as (
      select d.variante_id, d.ubicacion_id, d.disponible as n
        from retail.fn_tienda_disponible(v_ids, v_sedes) d
       where d.variante_id in (select pv.variante_id from pv)
    ),
    foto_ok as (
      select pf.color_codigo, pf.url, pf.es_principal, pf.orden, pf.created_at, pf.id
        from retail.producto_fotos pf
       where pf.producto_id = p_producto
         and pf.url ~ '^https?://[^/?#]+/storage/v1/object/public/retail-productos-fotos/'
    ),
    sedes as (
      select (s.x ->> 'id')::uuid as id, s.x ->> 'nombre' as nombre, s.n
        from jsonb_array_elements(coalesce(retail.tienda_sedes() -> 'sedes', '[]'::jsonb)) with ordinality as s (x, n)
    ),
    tallas as (
      select distinct pv.talla_id, t.valor
        from pv
        left join retail.tallas t on t.id = pv.talla_id
    )
    select case when not exists (select 1 from pv) then null else jsonb_build_object(
      'sede', v_sede,
      'umbral', v_umbral,
      'sedes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre) order by s.n) from sedes s), '[]'::jsonb),
      'prenda', (
        select jsonb_build_object(
          'id', p.id,
          'codigo', p.codigo,
          'nombre', p.referencia,
          'descripcion', coalesce(vp.descripcion_web, nullif(btrim(p.descripcion), '')),
          'categoria', case when c.id is null then null else jsonb_build_object('nombre', c.nombre, 'prefijo', c.prefijo) end,
          'precio', r.modelo_precio,
          'precio_final', r.modelo_final,
          'desde', r.modelo_desde,
          'campana', r.modelo_campana,
          'colores', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'codigo', co.codigo, 'nombre', co.nombre, 'hex', co.hex,
                     'foto', (select fo.url from foto_ok fo where fo.color_codigo = co.codigo
                               order by fo.es_principal desc, fo.orden, fo.created_at, fo.id limit 1))
                   order by co.orden, co.nombre)
              from retail.colores co
             where co.codigo in (select pv.color_codigo from pv)), '[]'::jsonb),
          'tallas', coalesce((
            select jsonb_agg(jsonb_build_object('id', ta.talla_id, 'nombre', ta.valor)
                             order by retail.fn_actividad_peso_talla(ta.valor), ta.valor)
              from tallas ta), '[]'::jsonb),
          'fotos', coalesce((
            select jsonb_agg(jsonb_build_object('url', fo.url, 'color', fo.color_codigo) order by fo.n)
              from (select fo.url, fo.color_codigo,
                           row_number() over (order by fo.es_principal desc, fo.orden, fo.created_at, fo.id) as n
                      from foto_ok fo) fo
             where fo.n <= 12), '[]'::jsonb),
          'variantes', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'id', x.variante_id,
                     'color', x.color_codigo,
                     'talla', x.talla_id,
                     'precio', x.precio,
                     'precio_final', x.precio_final,
                     'campana', x.campana,
                     'stock', coalesce((
                       select jsonb_object_agg(s.id::text, retail.fn_tienda_nivel(coalesce(d.n, 0), v_umbral))
                         from unnest(v_sedes) as s (id)
                         left join disponible d on d.variante_id = x.variante_id and d.ubicacion_id = s.id), '{}'::jsonb),
                     'total', retail.fn_tienda_nivel(
                       coalesce((select sum(d.n) from disponible d where d.variante_id = x.variante_id), 0)::integer, v_umbral))
                   order by co.orden, co.nombre, retail.fn_actividad_peso_talla(t.valor), t.valor, x.variante_id)
              from pv x
              left join retail.colores co on co.codigo = x.color_codigo
              left join retail.tallas t on t.id = x.talla_id), '[]'::jsonb))
          from retail.productos p
          join retail.vitrina_productos vp on vp.producto_id = p.id
          left join retail.categorias c on c.id = p.categoria_id
          cross join lateral (select pv.modelo_precio, pv.modelo_final, pv.modelo_desde, pv.modelo_campana from pv limit 1) r
         where p.id = p_producto)
    ) end
  );
end;
$fn$;

comment on function retail.tienda_ficha(uuid, uuid) is
  'Tienda online (ADR-0408, actividad 4): la ficha de un modelo publicado, al precio de la tienda elegida (o el mayor entre las de la web) con la campaña de la caja, sus colores, tallas, fotos y, por talla, su precio y su nivel en cada tienda de la web («hay», 3, 2, 1 o 0: nunca la cifra de 4 o más). null si el modelo no se ve en la web. Solo la llama tienda_web.';

revoke all on function retail.tienda_ficha(uuid, uuid) from public, anon, authenticated;
grant execute on function retail.tienda_ficha(uuid, uuid) to tienda_web;

-- ---------- 6. Validación final: si algo no quedó, se deshace todo ----------
do $$
declare
  f text;
begin
  foreach f in array array['retail.tienda_catalogo(uuid)', 'retail.tienda_ficha(uuid, uuid)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or not has_function_privilege('tienda_web', f, 'EXECUTE') then
      raise exception 'tienda ficha: % tiene que ser solo de tienda_web', f;
    end if;
  end loop;
  foreach f in array array['retail.fn_tienda_nivel(integer, integer)', 'retail.fn_tienda_umbral()', 'retail.fn_tienda_sedes_web()',
                           'retail.fn_tienda_disponible(uuid[], uuid[])', 'retail.fn_tienda_libre(uuid, uuid[])',
                           'retail.fn_tienda_precios(uuid[], uuid[])'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or has_function_privilege('tienda_web', f, 'EXECUTE') then
      raise exception 'tienda ficha: % es interna y nadie de afuera la llama', f;
    end if;
  end loop;
  -- La regla del nivel: nunca un número mayor que 3.
  if retail.fn_tienda_nivel(4, 3) <> to_jsonb('hay'::text) or retail.fn_tienda_nivel(7, 9) <> to_jsonb('hay'::text)
     or retail.fn_tienda_nivel(3, 3) <> to_jsonb(3) or retail.fn_tienda_nivel(0, 3) <> to_jsonb(0) then
    raise exception 'tienda ficha: fn_tienda_nivel no cumple la regla del nivel';
  end if;
end;
$$;

reset lock_timeout;
notify pgrst, 'reload schema';
