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
--        · `fn_tienda_sede_elegida(tienda, tiendas)` — LA regla de la tienda elegida: una tienda de la web; cualquier otra (escondida,
--          un id cualquiera o ninguna) se lee como «Todas» (para el precio y el stock) o «cualquier tienda» (para una espera de
--          «Avísame»): la misma regla al anotar una espera y al leerla.
--        · `fn_tienda_disponible(productos, tiendas)` — cuánto hay libre por talla y tienda: LA cifra de stock de ADR-0270
--          (`fn_existencias_base.disponible`: piso + almacén + lo que no tiene lugar, sin Cuarentena y sin lo apartado; lo apartado
--          incluye las reservas de los pedidos web, ADR-0408 DECIDÍ 4). Solo tallas activas y solo tiendas de la web: el Taller
--          y una tienda escondida no cuentan.
--        · `fn_tienda_libre(prenda, tiendas)` — la misma cifra para UNA prenda en esas tiendas (la suma de `fn_tienda_disponible`):
--          no es otra regla, es la forma corta para quien pregunta por una sola talla («Separar», «Avísame»).
--        · `fn_tienda_precio_talla(prendas, tienda)` — LA regla del precio de la tienda: por prenda (talla y color), su precio en
--          la tienda elegida (`fn_precio_en_sede`) o, con «Todas», el MAYOR entre las tiendas de la web (sin ninguna, el de la
--          grilla), con la campaña de la caja encima (ADR-0403: la de mayor %, y el precio baja al S/ 0.10 de abajo), y si se OFRECE
--          (activa y con precio en esa tienda: una talla a S/ 0 es de empaque, ADR-0384, y no se ofrece en la web).
--        · `fn_tienda_precios(productos, tienda, por_color)` — lo que se ofrece de esos modelos, cada talla con su precio (el de
--          `fn_tienda_precio_talla`), y el resumen que dibuja la tarjeta: el del MODELO o, con `por_color`, el del modelo en un
--          COLOR (una prenda de un look). La regla del resumen (la de la actividad 3) se escribe una sola vez para los dos.
--
-- UN SOLO PRECIO (integración de la tienda, 2026-10-15). Todo lo que en la tienda dice cuánto cuesta una prenda —la ficha y el
-- catálogo (aquí), la bolsa y «Separar» (20261015021000), «Arma tu look» (20261015032000) y el total del look en el ERP
-- (20261015031000)— lee `fn_tienda_precio_talla`. Antes la bolsa tenía su propia cuenta (`fn_bolsa_web_precios`: hoy solo un nombre
-- viejo que le pasa la pregunta a esta) y el look tomaba el precio del MODELO aunque la prenda del look fuera de un solo color: con
-- una campaña en el negro, la falda beige del look decía «Desde» el precio del negro, y la bolsa le cobraba el del beige. Ahora la
-- prenda del look vale lo de su color, que es lo que se ofrece de ella. Lo vigila `pnpm pruebas:tienda-ficha` (sección 9: la ficha,
-- el catálogo, la bolsa y el look dicen el mismo precio con y sin precio propio de la tienda, con campaña del modelo y de la categoría
-- y con «Todas», y romper esta pieza a propósito los cambia a los cuatro juntos; sección 10: ofrecen las mismas tallas).
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
--   · Lo que se ofrece y a qué precio lo dice `fn_tienda_precio_talla`: la ficha, el catálogo, la bolsa, «Separar» y el look no
--     pueden decir dos precios de la misma prenda en la misma tienda, ni ofrecer una talla que la ficha no ofrece.
--
-- DECIDÍ: el nivel como dato (`"hay"` o un número de 0 a 3), no como texto («Hay», «Última»): las palabras son de la pantalla y
--   la base garantiza la regla. Los niveles de todas las tiendas en la misma respuesta (no una lectura por tienda): la ficha muestra
--   la tabla completa con la tienda elegida resaltada, como la maqueta.
-- DESCARTÉ: sumar `stock` aquí a mano (sería la séptima suma distinta de ADR-0270); filtrar en la base por la tienda elegida (la
--   tienda necesita lo que hay en las otras para decir «N más en otras tiendas» y «Otra tienda» en la talla); devolver la cifra y
--   que la tienda la esconda (la cifra viajaría igual).
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe, después de 20261014225000 y 20261014231000). Una sola parte,
-- re-ejecutable: solo `create or replace function`, `comment`, `revoke` y `grant`, y un `drop function if exists` de la firma vieja
-- de `fn_tienda_precios` (uuid[], uuid[]), que solo existe en las bases locales: la nueva recibe la tienda elegida y si el resumen va
-- por color (con otros parámetros, `create or replace` dejaría las dos; borrar una función no toma las tablas de `auth` ni de
-- `storage`). Sin tablas, sin políticas ni disparadores (ADR-0195). Ningún `select … into` dentro de un texto entre comillas
-- (ADR-0288). Prueba: `pnpm pruebas:tienda-ficha`.
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

-- La tienda elegida: una de la web (`p_sedes`, las de fn_tienda_sedes_web); cualquier otra —escondida, un id cualquiera o ninguna—
-- es null: «Todas» para el precio y el stock, «cualquier tienda» para una espera de «Avísame». La misma regla al elegir, al anotar
-- y al leer: una espera anotada en una tienda que después se esconde se lee como «cualquier tienda», que es como se anotaría hoy.
create or replace function retail.fn_tienda_sede_elegida(p_sede uuid, p_sedes uuid[])
returns uuid
language sql
immutable
set search_path = retail, public
as $$
  select case when p_sede = any (coalesce(p_sedes, '{}'::uuid[])) then p_sede end
$$;

comment on function retail.fn_tienda_sede_elegida(uuid, uuid[]) is
  'Tienda online (ADR-0408): LA regla de la tienda elegida. La tienda si es una de la web (p_sedes, de fn_tienda_sedes_web); si no (escondida, un id cualquiera o ninguna), null = «Todas» (precio y stock) o «cualquier tienda» (una espera de «Avísame», al anotarla y al leerla). Interna.';

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

-- ---------- 3. El precio: LA regla de toda la tienda ----------
-- Por cada prenda pedida (talla y color): su precio de lista en la tienda elegida (`p_sede`, leída con fn_tienda_sede_elegida: el de
-- esa tienda, fn_precio_en_sede) o, con «Todas», el MAYOR entre las tiendas de la web (Felipe, ADR-0408 act. 2026-10-14 (c): al elegir
-- su tienda el precio baja o se queda, nunca sube); sin ninguna tienda en la web, el de la grilla. Encima, la campaña de la caja: la de
-- mayor % de esa talla (empate: por nombre) y lo que descuenta (fn_descuento_campana: el precio baja al S/ 0.10 de abajo, ADR-0403).
-- Una campaña que no llega a bajar nada no se nombra: el pedido web exige que un descuento traiga su campaña y que la campaña traiga
-- descuento. `se_ofrece`: la talla está activa y tiene precio en esa tienda (una a S/ 0 es de empaque, ADR-0384: no se ofrece en la
-- web). Si el modelo se ve en la web lo dice quien llama (la Vitrina): aquí solo el precio.
create or replace function retail.fn_tienda_precio_talla(p_variantes uuid[], p_sede uuid)
returns table (
  variante_id uuid, producto_id uuid, color_codigo text, talla_id uuid, se_ofrece boolean,
  precio_lista numeric, descuento numeric, precio numeric,
  etiqueta_id uuid, campana text, pct numeric, hasta date
)
language sql
stable
set search_path = retail, public
as $$
  with web as (
    select retail.fn_tienda_sedes_web() as sedes
  ),
  -- Las tiendas cuyo precio cuenta: la elegida o, con «Todas», todas las de la web.
  precio_de as (
    select case when retail.fn_tienda_sede_elegida(p_sede, w.sedes) is not null then array[p_sede] else w.sedes end as sedes
      from web w
  ),
  base as (
    select v.id, v.producto_id, v.color_codigo, v.talla_id, v.activo,
           case when coalesce(cardinality(d.sedes), 0) = 0 then v.precio
                else (select max(retail.fn_precio_en_sede(v.id, s.id)) from unnest(d.sedes) as s (id)) end as precio_lista
      from retail.variantes v
      cross join precio_de d
     where v.id = any (coalesce(p_variantes, '{}'::uuid[]))
  ),
  -- `coalesce(…, '{}')`: con la lista vacía la regla no devuelve nada (con null devolvería las campañas de TODO el catálogo).
  la_campana as (
    select distinct on (x.variante_id) x.variante_id, x.etiqueta_id, x.etiqueta_nombre, x.descuento_pct
      from retail.fn_campanas_por_variante(retail.fn_hoy_lima(), 0, coalesce(p_variantes, '{}'::uuid[])) x
     order by x.variante_id, x.descuento_pct desc, x.etiqueta_nombre, x.etiqueta_id
  ),
  con_campana as (
    select b.id, b.producto_id, b.color_codigo, b.talla_id, b.activo, b.precio_lista, c.etiqueta_id, c.etiqueta_nombre,
           c.descuento_pct, coalesce(retail.fn_descuento_campana(b.precio_lista, c.descuento_pct), 0) as descuento
      from base b
      left join la_campana c on c.variante_id = b.id
  )
  select x.id, x.producto_id, x.color_codigo, x.talla_id, x.activo and coalesce(x.precio_lista, 0) > 0,
         x.precio_lista, x.descuento, x.precio_lista - x.descuento,
         case when x.descuento > 0 then x.etiqueta_id end,
         case when x.descuento > 0 then x.etiqueta_nombre end,
         case when x.descuento > 0 then x.descuento_pct end,
         case when x.descuento > 0 then e.vigente_hasta end
    from con_campana x
    left join retail.etiquetas e on e.id = x.etiqueta_id
$$;

comment on function retail.fn_tienda_precio_talla(uuid[], uuid) is
  'Tienda online (ADR-0408): LA regla del precio de la tienda. Por prenda (talla y color): su precio de lista en la tienda elegida (fn_precio_en_sede) o, con «Todas» (o una tienda que no es de la web), el mayor entre las tiendas de la web (sin ninguna, el de la grilla); la campaña de la caja encima (la de mayor %, fn_descuento_campana, ADR-0403; una que no baja nada no se nombra); y si se ofrece (activa y con precio > 0 en esa tienda, ADR-0384). La leen fn_tienda_precios (ficha, catálogo y looks), tienda_bolsa y tienda_separar. Interna.';

-- Lo que se OFRECE de los modelos pedidos (cada talla activa con precio en la tienda elegida: `se_ofrece` de fn_tienda_precio_talla)
-- con su precio y su campaña, y, repetido en cada fila, el resumen que dibuja la tarjeta: el del MODELO o, con `p_por_color`, el del
-- modelo en ese COLOR (una prenda de un look: lo que se ofrece de ella es solo su color, y su precio es el de esas tallas). La regla del
-- resumen (la de la actividad 3), escrita una sola vez para los dos: el precio es el de su talla más cara; con campaña en todas sus
-- tallas y el mismo %, el precio de campaña sin «Desde»; si no, lo menos que se paga por una talla con campaña y `desde`; la campaña
-- que da ese precio. La firma de antes (con la lista de tiendas en vez de la elegida) se borra: con otros parámetros quedarían dos.
drop function if exists retail.fn_tienda_precios(uuid[], uuid[]);
create or replace function retail.fn_tienda_precios(p_producto_ids uuid[], p_sede uuid, p_por_color boolean default false)
returns table (
  variante_id uuid, producto_id uuid, color_codigo text, talla_id uuid,
  precio numeric, precio_final numeric, campana jsonb,
  resumen_precio numeric, resumen_final numeric, resumen_desde boolean, resumen_campana jsonb
)
language sql
stable
set search_path = retail, public
as $$
  with f as (
    select t.variante_id as id, t.producto_id, t.color_codigo, t.talla_id, t.precio_lista as precio, t.precio as final, t.pct,
           t.campana as nombre_campana,
           case when t.pct is null then null
                else jsonb_build_object('id', t.etiqueta_id, 'nombre', t.campana, 'pct', t.pct, 'hasta', t.hasta) end as campana,
           -- El grupo del resumen: el modelo, o el modelo en ese color.
           case when p_por_color then t.color_codigo end as color_del_grupo
      from retail.fn_tienda_precio_talla(array(select v.id from retail.variantes v
                                                 where v.producto_id = any (coalesce(p_producto_ids, '{}'::uuid[])) and v.activo),
                                         p_sede) t
     where t.se_ofrece
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
           first_value(f.campana) over (partition by f.producto_id, f.color_del_grupo
                                        order by f.pct is null, f.final, f.pct desc, f.nombre_campana) as m_campana
      from f
    window m as (partition by f.producto_id, f.color_del_grupo)
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

comment on function retail.fn_tienda_precios(uuid[], uuid, boolean) is
  'Tienda online (ADR-0408): lo que se ofrece de esos modelos (fn_tienda_precio_talla, la regla única del precio), por talla con su precio y su campaña, y el resumen que dibuja la tarjeta (precio, precio final, «Desde», campaña): el del modelo o, con p_por_color, el del modelo en ese color (una prenda de un look). La leen tienda_catalogo, tienda_ficha, los looks de la tienda y el total del look en el ERP. Interna.';

revoke all on function retail.fn_tienda_nivel(integer, integer) from public, anon, authenticated;
revoke all on function retail.fn_tienda_umbral() from public, anon, authenticated;
revoke all on function retail.fn_tienda_sedes_web() from public, anon, authenticated;
revoke all on function retail.fn_tienda_disponible(uuid[], uuid[]) from public, anon, authenticated;
revoke all on function retail.fn_tienda_libre(uuid, uuid[]) from public, anon, authenticated;
revoke all on function retail.fn_tienda_sede_elegida(uuid, uuid[]) from public, anon, authenticated;
revoke all on function retail.fn_tienda_precio_talla(uuid[], uuid) from public, anon, authenticated;
revoke all on function retail.fn_tienda_precios(uuid[], uuid, boolean) from public, anon, authenticated;

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
  v_sede := retail.fn_tienda_sede_elegida(p_sede, v_sedes);
  v_ids := array(select vp.producto_id from retail.vitrina_productos vp
                  where vp.publicado and retail.fn_vitrina_publicable(vp.producto_id));

  return (
    with pv as materialized (
      select * from retail.fn_tienda_precios(v_ids, v_sede)
    ),
    modelos as (
      select distinct on (pv.producto_id)
             pv.producto_id as id, pv.resumen_precio as precio, pv.resumen_final as final, pv.resumen_desde as desde,
             pv.resumen_campana as campana
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
  v_sede := retail.fn_tienda_sede_elegida(p_sede, v_sedes);
  v_ids := array[p_producto];

  return (
    with pv as materialized (
      select * from retail.fn_tienda_precios(v_ids, v_sede)
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
          'precio', r.resumen_precio,
          'precio_final', r.resumen_final,
          'desde', r.resumen_desde,
          'campana', r.resumen_campana,
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
          cross join lateral (select pv.resumen_precio, pv.resumen_final, pv.resumen_desde, pv.resumen_campana from pv limit 1) r
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
                           'retail.fn_tienda_sede_elegida(uuid, uuid[])', 'retail.fn_tienda_precio_talla(uuid[], uuid)',
                           'retail.fn_tienda_precios(uuid[], uuid, boolean)'] loop
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
  -- Un solo precio: la firma vieja de fn_tienda_precios (con la lista de tiendas) no queda al lado de la nueva.
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_tienda_precios') <> 1 then
    raise exception 'tienda ficha: quedó más de una fn_tienda_precios (la de antes, con la lista de tiendas, se borra)';
  end if;
end;
$$;

reset lock_timeout;
notify pgrst, 'reload schema';
