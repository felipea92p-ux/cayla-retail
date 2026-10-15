-- ============================================================================
-- 20261015021000_tienda_bolsa_y_separar.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 7: la bolsa y «Separar»
--
-- EL PROBLEMA PRIMERO. El cliente junta prendas en su bolsa (agregar NO separa nada: propuesta f), elige UNA tienda donde
-- recoge todo y toca «Separar». La bolsa vive en su navegador (una cookie que solo guarda qué prendas y cuántas): ahí no hay
-- ni un precio ni un stock en que se pueda confiar. Lo que el cliente ve en la bolsa y lo que el pedido guarda los tiene que
-- decir la base, y con la misma regla: el precio de tienda de la sede donde recoge (`fn_precio_en_sede`, ADR-0408 act. c) con
-- la campaña encima, como la caja (ADR-0403). Si el precio cambió entre que lo vio y que tocó «Separar», no se separa nada:
-- se le muestra el precio nuevo y vuelve a decidir.
--
-- QUÉ HACE
--   1. Dos piezas internas, que nadie de afuera ejecuta:
--        · `fn_bolsa_web_precios(variantes, precio_de)`: el precio de cada prenda (talla y color) en la web: el de la tienda
--          (o, si son varias, el MAYOR entre ellas: la regla de «Todas» del catálogo) y la campaña vigente de la caja (la de
--          mayor descuento, `fn_campanas_por_variante` + `fn_descuento_campana`). La usan la bolsa Y «Separar»: una sola regla.
--        · `fn_bolsa_web_prenda(variante)`: cómo se ve una prenda en la bolsa y en «Mis pedidos» (nombre, categoría para su
--          silueta, color, talla y la foto de su color o, si no tiene, la principal: propuesta c).
--   2. `tienda_bolsa(lineas, sede)` (solo `tienda_web`, solo lee): lo que la página de la bolsa necesita de cada prenda:
--      si todavía se puede separar, su precio en la tienda elegida (o, sin tienda, el mayor de la web), y en cada tienda de la
--      web si alcanza para lo que lleva, si hay alguna y si se vende ahí. Nunca la cifra: solo «alcanza / hay / no hay»
--      (ADR-0408, DECIDÍ 6). Una prenda que ya no se puede separar vuelve SIN nombre ni foto: alguien que inventa un id en su
--      cookie no aprende nada de lo que no está publicado.
--   3. `tienda_separar(usuario_web_id, ubicacion_id, lineas, token)` (solo `tienda_web`): «Separar». Recibe la cuenta que el
--      servidor de la tienda ya validó con `getUser()`, la tienda donde recoge y lo que el cliente VIO
--      ([{variante_id, cantidad, precio}]); vuelve a calcular cada precio y lo compara; exige que la prenda siga en la
--      Vitrina, que se venda en esa tienda y que quede en alguna tienda de la web; y llama a `crear_pedido_web` (el motor,
--      20261014235000), que crea el pedido «por confirmar» SIN tocar el stock. Con su `token`: dos toques (doble clic, la red
--      que se corta y se reintenta) devuelven el MISMO pedido. Y en la MISMA transacción cierra las esperas de «Avísame» de esa
--      cuenta por las prendas que separó (`esperas_web`, 20261015024000: `quitada_en` y el pedido que la cerró): ya no las espera.
--
-- «HAY» ES LA REGLA DE LA FICHA (integración de la tienda, 2026-10-15): lo libre en las tiendas de la web sale de
--   `fn_tienda_disponible` / `fn_tienda_libre` con `fn_tienda_sedes_web()` (20261015012000), la misma pieza de la ficha, el catálogo,
--   los looks y «Avísame»: la bolsa no puede decir «alcanza» de lo que la ficha dice que no hay. Nada de sumar `stock` aquí.
--
-- REGLAS (lo que la base no deja que pase)
--   · Un precio que no cuadra con el de la base no se guarda: `tienda_separar_precio`, y no se escribe nada.
--   · Lo que ya no está en la Vitrina no se separa (`tienda_separar_no_publicada`), lo que no se vende en esa tienda tampoco
--     (`tienda_separar_no_se_vende`) y lo que se agotó en todas las tiendas de la web tampoco (`tienda_separar_agotada`).
--     El detalle (`detail`) dice qué prenda: la página la marca.
--   · Solo se recoge en una tienda que se ve en la web (`tienda_separar_tienda`).
--   · La misma marca nunca crea dos pedidos, y la marca de otro cliente no devuelve su pedido (`pedido_web_token`).
--
-- DECIDÍ: validar en la base y no en la tienda (principio 2: la cookie la escribe el navegador). Comparar el precio que el
--   cliente vio, y no recalcularlo en silencio: si una campaña terminó a medianoche, que lo vea antes de separar.
-- DESCARTÉ: guardar la bolsa en la base (una tabla por cliente): agregar no compromete nada (propuesta f), así que no hay
--   nada que la base tenga que custodiar hasta «Separar»; y una bolsa en la base pide limpiar las abandonadas.
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe). Va después de 20261014225000 (Vitrina), 20261014231000
-- (tiendas de la web), 20261014235000 (el motor del pedido web) y 20261015012000 (la regla de «hay»). Solo crea funciones: sin
-- tablas, sin políticas, sin disparadores; se pega entera y se puede volver a pegar. Ningún `select … into` dentro de un texto
-- entre comillas. «Separar» escribe en `esperas_web`, que nace en 20261015024000: se pegan en la misma tanda (Postgres no revisa
-- la tabla al crear la función; hasta pegar esa, «Separar» falla sin escribir nada). Prueba: `pnpm pruebas:tienda-bolsa` (y el
-- cierre de las esperas, `pnpm pruebas:tienda-club`).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Lo que esta migración da por hecho ----------
do $$
begin
  if to_regprocedure('retail.fn_tienda_disponible(uuid[], uuid[])') is null or to_regprocedure('retail.fn_tienda_libre(uuid, uuid[])') is null
     or to_regprocedure('retail.fn_tienda_sedes_web()') is null then
    raise exception 'Falta la regla de «hay» de la tienda: pega antes 20261015012000_tienda_ficha_y_niveles_por_tienda.sql.';
  end if;
  if to_regprocedure('retail.crear_pedido_web(uuid, uuid, jsonb, uuid)') is null then
    raise exception 'Falta el motor del pedido web: pega antes 20261014235000_pedidos_web_modelo.sql.';
  end if;
end
$$;

-- ---------- 1. El precio de cada prenda en la web (una sola regla para la bolsa y para «Separar») ----------
-- `p_precio_de`: las tiendas cuyo precio cuenta. Una (la de recojo): su precio. Varias («Todas»): el mayor. Ninguna (no hay
-- tiendas en la web): el de la grilla, como el catálogo. La campaña va encima, talla por talla, con la regla de la caja.
create or replace function retail.fn_bolsa_web_precios(p_variantes uuid[], p_precio_de uuid[])
returns table (variante_id uuid, precio_lista numeric, descuento numeric, etiqueta_id uuid, campana text, pct numeric, precio numeric)
language sql
stable
set search_path = retail, public
as $$
  with base as (
    select v.id,
           case when coalesce(cardinality(p_precio_de), 0) = 0 then v.precio
                else (select max(retail.fn_precio_en_sede(v.id, s.id)) from unnest(p_precio_de) as s (id)) end as precio_lista
      from retail.variantes v
     where v.id = any (coalesce(p_variantes, '{}'::uuid[]))
  ),
  -- `coalesce(…, '{}')`: con la lista vacía la regla no devuelve nada (con null devolvería las campañas de TODO el catálogo).
  campana as (
    select distinct on (x.variante_id) x.variante_id, x.etiqueta_id, x.etiqueta_nombre, x.descuento_pct
      from retail.fn_campanas_por_variante(retail.fn_hoy_lima(), 0, coalesce(p_variantes, '{}'::uuid[])) x
     order by x.variante_id, x.descuento_pct desc, x.etiqueta_nombre, x.etiqueta_id
  ),
  con_campana as (
    select b.id, b.precio_lista, c.etiqueta_id, c.etiqueta_nombre, c.descuento_pct,
           coalesce(retail.fn_descuento_campana(b.precio_lista, c.descuento_pct), 0) as descuento
      from base b
      left join campana c on c.variante_id = b.id
  )
  -- Una campaña que no llega a bajar nada (un % chico sobre un precio chico) no se nombra: el pedido exige que el descuento
  -- traiga su campaña y que la campaña traiga descuento.
  select x.id, x.precio_lista, x.descuento,
         case when x.descuento > 0 then x.etiqueta_id end,
         case when x.descuento > 0 then x.etiqueta_nombre end,
         case when x.descuento > 0 then x.descuento_pct end,
         x.precio_lista - x.descuento
    from con_campana x;
$$;

comment on function retail.fn_bolsa_web_precios(uuid[], uuid[]) is
  'Tienda online (ADR-0408, act. 7): el precio web de cada prenda: el de la tienda (o el mayor entre varias; sin tiendas, el de la grilla) con la campaña de la caja encima (ADR-0403). Interna: la usan tienda_bolsa y tienda_separar.';

-- ---------- 2. Cómo se ve una prenda en la bolsa y en «Mis pedidos» ----------
-- La foto: la de su color y, si su color no tiene, la principal del modelo (propuesta c). Solo las del almacén público.
create or replace function retail.fn_bolsa_web_prenda(p_variante_id uuid)
returns jsonb
language sql
stable
set search_path = retail, public
as $$
  select jsonb_build_object(
    'producto_id', p.id,
    'nombre', p.referencia,
    'categoria', case when c.id is null then null else jsonb_build_object('nombre', c.nombre, 'prefijo', c.prefijo) end,
    'color', jsonb_build_object('codigo', v.color_codigo, 'nombre', co.nombre, 'hex', co.hex),
    'talla', t.valor,
    'foto', (select pf.url
               from retail.producto_fotos pf
              where pf.producto_id = p.id
                and pf.url ~ '^https?://[^/?#]+/storage/v1/object/public/retail-productos-fotos/'
              order by (pf.color_codigo is not distinct from v.color_codigo) desc, pf.es_principal desc, pf.orden, pf.created_at, pf.id
              limit 1))
  from retail.variantes v
  join retail.productos p on p.id = v.producto_id
  left join retail.categorias c on c.id = p.categoria_id
  left join retail.colores co on co.codigo = v.color_codigo
  left join retail.tallas t on t.id = v.talla_id
  where v.id = p_variante_id;
$$;

comment on function retail.fn_bolsa_web_prenda(uuid) is
  'Tienda online (ADR-0408, act. 7): una prenda como la ve el cliente {producto_id, nombre, categoria, color, talla, foto}. Interna: la usan tienda_bolsa y tienda_mis_pedidos.';

-- ---------- 3. La bolsa (solo lee) ----------
-- `p_lineas`: lo que guarda la cookie, [{variante_id, cantidad}]. Se toma solo lo que tiene forma de prenda (hasta 20 filas, la
-- misma prenda dos veces se suma). `p_sede`: la tienda elegida para recoger; si no es una de la web, es «Todas».
create or replace function retail.tienda_bolsa(p_lineas jsonb, p_sede uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public
as $fn$
declare
  v_sedes uuid[];
  v_sede uuid;
begin
  -- Las tiendas que la web muestra (Configuración ▸ Tienda web): las de las píldoras y las de «¿En qué tienda lo recoges?».
  v_sedes := retail.fn_tienda_sedes_web();
  if p_sede = any (v_sedes) then
    v_sede := p_sede;
  end if;

  return (
    with crudo as (
      -- El `case` primero: un id mal escrito no llega al cast (Postgres no promete en qué orden mira el `where`).
      select e.n,
             case when jsonb_typeof(e.x) = 'object'
                       and e.x ->> 'variante_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (e.x ->> 'variante_id')::uuid end as variante_id,
             case when jsonb_typeof(e.x) = 'object' and jsonb_typeof(e.x -> 'cantidad') = 'number'
                       and (e.x ->> 'cantidad') ~ '^[0-9]{1,2}$'
                  then (e.x ->> 'cantidad')::integer end as cantidad
        from jsonb_array_elements(case when jsonb_typeof(p_lineas) = 'array' then p_lineas else '[]'::jsonb end)
             with ordinality as e (x, n)
    ),
    entrada as (
      select min(c.n) as n, c.variante_id, least(sum(c.cantidad), 20)::integer as cantidad
        from crudo c
       where c.variante_id is not null and c.cantidad between 1 and 20
       group by c.variante_id
       order by min(c.n)
       limit 20
    ),
    precios as (
      select pr.*
        from retail.fn_bolsa_web_precios(array(select en.variante_id from entrada en),
                                         case when v_sede is not null then array[v_sede] else v_sedes end) pr
    ),
    -- Lo libre de cada prenda en cada tienda de la web: la regla de «hay» de la ficha (fn_tienda_disponible).
    libres as (
      select x.variante_id, x.ubicacion_id, x.disponible
        from retail.fn_tienda_disponible(array(select distinct v.producto_id
                                                 from retail.variantes v
                                                where v.id in (select en.variante_id from entrada en)), v_sedes) x
       where x.variante_id in (select en.variante_id from entrada en)
    ),
    lineas as (
      select en.n, en.variante_id, en.cantidad,
             coalesce(v.activo, false) and coalesce(vp.publicado, false)
               and coalesce(retail.fn_vitrina_publicable(v.producto_id), false) and coalesce(pr.precio_lista, 0) > 0 as se_puede,
             pr.precio_lista, pr.precio, pr.campana, pr.pct
        from entrada en
        left join retail.variantes v on v.id = en.variante_id
        left join retail.vitrina_productos vp on vp.producto_id = v.producto_id
        left join precios pr on pr.variante_id = en.variante_id
    )
    select jsonb_build_object(
      'sede', v_sede,
      'sedes', coalesce(retail.tienda_sedes() -> 'sedes', '[]'::jsonb),
      'lineas', coalesce((
        select jsonb_agg(
                 case when not l.se_puede
                      then jsonb_build_object('variante_id', l.variante_id, 'cantidad', l.cantidad, 'disponible', false)
                      else jsonb_build_object('variante_id', l.variante_id, 'cantidad', l.cantidad, 'disponible', true)
                           || retail.fn_bolsa_web_prenda(l.variante_id)
                           || jsonb_build_object(
                                'precio_lista', l.precio_lista,
                                'precio', l.precio,
                                'campana', case when l.pct is null then null else jsonb_build_object('nombre', l.campana, 'pct', l.pct) end,
                                'en_sedes', coalesce((
                                  select jsonb_object_agg(s.id::text, jsonb_build_object(
                                           'alcanza', coalesce(li.disponible, 0) >= l.cantidad,
                                           'hay', coalesce(li.disponible, 0) > 0,
                                           'se_vende', retail.fn_variante_permitida_en_sede(l.variante_id, s.id)))
                                    from unnest(v_sedes) as s (id)
                                    left join libres li on li.variante_id = l.variante_id and li.ubicacion_id = s.id), '{}'::jsonb),
                                'alcanza_en_total',
                                  coalesce((select sum(li.disponible) from libres li where li.variante_id = l.variante_id), 0) >= l.cantidad)
                 end
                 order by l.n)
          from lineas l), '[]'::jsonb))
  );
end;
$fn$;

comment on function retail.tienda_bolsa(jsonb, uuid) is
  'Tienda online (ADR-0408, act. 7): la bolsa del cliente. {sede, sedes, lineas: [{variante_id, cantidad, disponible, …prenda, precio_lista, precio, campana, en_sedes: {<sede>: {alcanza, hay, se_vende}}, alcanza_en_total}]}. Nunca la cifra del stock. Solo la llama tienda_web.';

-- ---------- 4. «Separar» ----------
create or replace function retail.tienda_separar(p_usuario_web_id uuid, p_ubicacion_id uuid, p_lineas jsonb, p_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_tope constant integer := 20;  -- el mismo tope de cordura de crear_pedido_web: una bolsa lleva hasta 20 prendas
  v_cuenta uuid;
  v_clienta uuid;
  v_existente retail.pedidos_web%rowtype;
  v_sedes uuid[];
  v_unidades integer := 0;
  v_para_el_motor jsonb := '[]'::jsonb;
  v_separadas uuid[] := '{}';
  v_resumen jsonb;
  r record;
  p record;
  v_libres integer;
begin
  -- La cuenta: el servidor de la tienda ya preguntó al proyecto de clientes quién es (getUser) y manda su id. Su fila queda tomada
  -- (como en «Avísame», 20261015024000): «Separar» cierra sus esperas, y un «Avísame» de la misma cuenta a la vez espera su turno.
  for v_cuenta, v_clienta in
    select w.id, w.clienta_id from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id for no key update
  loop
    exit;
  end loop;
  if v_clienta is null then
    raise exception 'Tu cuenta no está lista para separar.' using errcode = '22023', hint = 'tienda_sin_cuenta';
  end if;
  if p_token is null then
    raise exception 'Falta la marca de este «Separar».' using errcode = '22023', hint = 'tienda_separar_marca';
  end if;

  -- El mismo toque dos veces (doble clic, la red que se corta y se reintenta): el MISMO pedido, sin volver a revisar nada. Es
  -- el mismo candado que toma `crear_pedido_web` con esa marca (en la misma transacción no se espera a sí mismo).
  perform pg_advisory_xact_lock(hashtextextended('pedidos_web:' || p_token::text, 0));
  select * into v_existente from retail.pedidos_web w where w.token_cliente = p_token;
  if found then
    if v_existente.clienta_id <> v_clienta then
      raise exception 'Esa marca de «Separar» es de otro cliente.' using errcode = '22023', hint = 'pedido_web_token';
    end if;
    return jsonb_build_object('codigo', v_existente.codigo, 'ya_estaba', true);
  end if;

  v_sedes := retail.fn_tienda_sedes_web();
  if p_ubicacion_id is null or not (p_ubicacion_id = any (v_sedes)) then
    raise exception 'Esa tienda no recibe pedidos de la web ahora.' using errcode = '22023', hint = 'tienda_separar_tienda';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La bolsa está vacía.' using errcode = '22023', hint = 'pedido_web_bolsa_vacia';
  end if;
  if jsonb_array_length(p_lineas) > c_tope then
    raise exception 'Un pedido web lleva hasta % prendas.', c_tope using errcode = '22023', hint = 'pedido_web_muchas_prendas';
  end if;

  -- Cada prenda, con el precio que el cliente VIO. El `case` primero: un dato mal escrito no llega al cast.
  for r in
    select e.n,
           case when jsonb_typeof(e.x) = 'object'
                     and e.x ->> 'variante_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (e.x ->> 'variante_id')::uuid end as variante_id,
           case when jsonb_typeof(e.x) = 'object' and jsonb_typeof(e.x -> 'cantidad') = 'number'
                     and (e.x ->> 'cantidad') ~ '^[0-9]{1,2}$'
                then (e.x ->> 'cantidad')::integer end as cantidad,
           case when jsonb_typeof(e.x) = 'object' and jsonb_typeof(e.x -> 'precio') = 'number'
                     and (e.x ->> 'precio') ~ '^[0-9]{1,7}(\.[0-9]{1,2})?$'
                then (e.x ->> 'precio')::numeric end as precio
      from jsonb_array_elements(p_lineas) with ordinality as e (x, n)
     order by e.n
  loop
    if r.variante_id is null or r.cantidad is null or r.cantidad not between 1 and c_tope or r.precio is null then
      raise exception 'La prenda % de la bolsa viene mal escrita.', r.n
        using errcode = '22023', hint = 'pedido_web_linea_invalida', detail = r.n::text;
    end if;
    -- La misma prenda dos veces: la bolsa la junta en una sola fila (con su cantidad).
    if exists (select 1 from jsonb_array_elements(p_lineas) with ordinality as o (x, n)
                where o.n < r.n and jsonb_typeof(o.x) = 'object' and lower(o.x ->> 'variante_id') = r.variante_id::text) then
      raise exception 'La prenda % de la bolsa está repetida.', r.n
        using errcode = '22023', hint = 'pedido_web_linea_invalida', detail = r.n::text;
    end if;
    v_unidades := v_unidades + r.cantidad;
    if v_unidades > c_tope then
      raise exception 'Un pedido web lleva hasta % prendas.', c_tope using errcode = '22023', hint = 'pedido_web_muchas_prendas';
    end if;

    -- Sigue en la Vitrina y se puede vender (activa, con precio en esa tienda).
    if not exists (select 1
                     from retail.variantes v
                     join retail.vitrina_productos vp on vp.producto_id = v.producto_id
                    where v.id = r.variante_id and v.activo and vp.publicado and retail.fn_vitrina_publicable(v.producto_id)) then
      raise exception 'Una prenda de tu bolsa ya no está en la tienda online.'
        using errcode = '22023', hint = 'tienda_separar_no_publicada', detail = r.variante_id::text;
    end if;
    if not retail.fn_variante_permitida_en_sede(r.variante_id, p_ubicacion_id) then
      raise exception 'Una prenda de tu bolsa no se vende en esa tienda.'
        using errcode = '22023', hint = 'tienda_separar_no_se_vende', detail = r.variante_id::text;
    end if;

    -- El precio de ESA tienda, con la campaña de hoy: tiene que ser el que el cliente vio.
    select x.* into p from retail.fn_bolsa_web_precios(array[r.variante_id], array[p_ubicacion_id]) x;
    if p.precio_lista is null or p.precio_lista <= 0 then
      raise exception 'Una prenda de tu bolsa ya no está en la tienda online.'
        using errcode = '22023', hint = 'tienda_separar_no_publicada', detail = r.variante_id::text;
    end if;
    if p.precio <> r.precio then
      raise exception 'El precio de una prenda de tu bolsa cambió.'
        using errcode = '22023', hint = 'tienda_separar_precio', detail = r.variante_id::text;
    end if;

    -- Que quede en alguna tienda de la web (la que la recibe la trae con un traslado), con la regla de «hay» de la ficha. No
    -- reserva nada: eso es confirmar.
    v_libres := retail.fn_tienda_libre(r.variante_id, v_sedes);
    if v_libres < r.cantidad then
      raise exception 'Una prenda de tu bolsa se agotó en las tiendas.'
        using errcode = '22023', hint = 'tienda_separar_agotada', detail = r.variante_id::text;
    end if;

    -- Para el motor: una unidad por elemento, con el precio ya calculado por la base.
    for i in 1 .. r.cantidad loop
      v_para_el_motor := v_para_el_motor || jsonb_build_array(jsonb_build_object(
        'variante_id', r.variante_id, 'precio_lista', p.precio_lista, 'descuento', p.descuento,
        'descuento_etiqueta_id', p.etiqueta_id));
    end loop;
    v_separadas := v_separadas || r.variante_id;
  end loop;

  v_resumen := retail.crear_pedido_web(v_clienta, p_ubicacion_id, v_para_el_motor, p_token);

  -- Lo que separó ya no lo espera: sus esperas de «Avísame» por esas prendas (en esa tienda, en otra o en cualquiera) se cierran
  -- con este pedido, en la misma transacción (si algo falla, siguen abiertas). Las de otras prendas quedan hasta que las quite.
  update retail.esperas_web e
     set quitada_en = now(), pedido_web_id = (v_resumen ->> 'pedido_id')::uuid
   where e.cuenta_web_id = v_cuenta
     and e.quitada_en is null
     and e.variante_id = any (v_separadas);

  return jsonb_build_object('codigo', v_resumen ->> 'codigo', 'ya_estaba', false);
end;
$fn$;

comment on function retail.tienda_separar(uuid, uuid, jsonb, uuid) is
  'Tienda online (ADR-0408, act. 7): «Separar». Valida la cuenta, la tienda de recojo (una de la web) y cada prenda (en la Vitrina, se vende ahí, quedan en alguna tienda de la web según fn_tienda_libre, la regla de «hay» de la ficha) con el precio que el cliente vio contra fn_bolsa_web_precios de esa tienda, llama a crear_pedido_web (no toca el stock) y cierra las esperas de «Avísame» de esa cuenta por esas prendas (esperas_web.pedido_web_id). La misma marca devuelve el mismo pedido. {codigo, ya_estaba}. Rechaza con hint: tienda_sin_cuenta, tienda_separar_marca, tienda_separar_tienda, tienda_separar_no_publicada, tienda_separar_no_se_vende, tienda_separar_precio, tienda_separar_agotada (detail = la prenda), pedido_web_*. Solo la llama tienda_web.';

-- ---------- 5. Quién ejecuta qué ----------
-- Postgres le da EXECUTE a PUBLIC a toda función nueva, y `0005_grants.sql` a `authenticated`: se quita a todos.
revoke all on function retail.fn_bolsa_web_precios(uuid[], uuid[]) from public, anon, authenticated;
revoke all on function retail.fn_bolsa_web_prenda(uuid) from public, anon, authenticated;
revoke all on function retail.tienda_bolsa(jsonb, uuid) from public, anon, authenticated;
revoke all on function retail.tienda_separar(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function retail.tienda_bolsa(jsonb, uuid) to tienda_web;
grant execute on function retail.tienda_separar(uuid, uuid, jsonb, uuid) to tienda_web;

-- ---------- 6. Si algo no quedó, se deshace todo ----------
do $$
begin
  if has_function_privilege('anon', 'retail.tienda_separar(uuid, uuid, jsonb, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.tienda_separar(uuid, uuid, jsonb, uuid)', 'EXECUTE')
     or not has_function_privilege('tienda_web', 'retail.tienda_separar(uuid, uuid, jsonb, uuid)', 'EXECUTE')
     or not has_function_privilege('tienda_web', 'retail.tienda_bolsa(jsonb, uuid)', 'EXECUTE') then
    raise exception 'tienda bolsa: tienda_bolsa y tienda_separar tienen que ser solo de tienda_web';
  end if;
  if has_function_privilege('tienda_web', 'retail.crear_pedido_web(uuid, uuid, jsonb, uuid)', 'EXECUTE')
     or has_function_privilege('tienda_web', 'retail.fn_bolsa_web_precios(uuid[], uuid[])', 'EXECUTE') then
    raise exception 'tienda bolsa: la tienda entra solo por sus tienda_*';
  end if;
end;
$$;

reset lock_timeout;
