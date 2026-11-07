-- ============================================================================
-- 20261031161000_tienda_precio_por_lotes.sql — CAYLA V2 · Tienda online (ADR-0408), optimización de carga (2026-10-31)
--
-- EL PROBLEMA PRIMERO. El 31-oct, con 440 prendas publicadas y 2 726 tallas, `tienda_catalogo` tardaba ~800 ms en producción y los looks
-- (`tienda_looks`, que lo arma por dentro) ~0,9–1,8 s; a las 10:18 de ese sábado, con las tiendas abiertas, la base llegó a 3,5 GB de
-- memoria comprometida en una máquina de 2 GB. Medido pieza por pieza contra la base viva (solo lectura):
--   · 346 ms: el precio de cada talla. `fn_tienda_precio_talla` le pregunta a `fn_precio_en_sede` talla por talla y tienda por tienda
--     (2 726 × 3 = 8 178 llamadas). Cada llamada es barata (~42 µs), pero lleva `security definer` y `set search_path`, y eso hace que
--     Postgres no pueda meterla dentro de la consulta: la ejecuta aparte, 8 178 veces. Las mismas cuentas hechas en una sola consulta
--     (un join contra los precios de tienda) tardaron 27 ms.
--   · ~145 ms: «¿la empresa de esta prenda se ve en esta tienda?» (`fn_tienda_empresa_se_ve`), una vez por prenda, cuando la lista de
--     empresas que se ven en la tienda (`fn_empresas_de_sede`) es la misma para todas.
--
-- ANALOGÍA CAYLA. Para poner los precios de la vitrina, la vendedora llamaba a cada tienda una vez por talla: 8 178 llamadas, cada una
-- corta. Ahora pide a cada tienda su lista de precios una vez y la cruza con las tallas. Y la lista de marcas que se exhiben en Lima se
-- lee una vez, no una vez por prenda.
--
-- QUÉ HACE.
--   1. `fn_precios_en_sedes(variantes[], sedes[])` (nueva): LA regla del precio por tienda, para muchas tallas y tiendas de una vez
--      (obsequio en S/ 0 → la excepción de la combinación en esa tienda → el precio de la prenda en esa tienda → la grilla; ADR-0370,
--      ADR-0384). Es SQL sin `security definer` ni `set search_path` a propósito: así Postgres la mete dentro de la consulta que la llama
--      y la resuelve con un join, en vez de una llamada por fila. Solo la llaman funciones `security definer` (como su dueño): nadie de
--      afuera la ejecuta.
--   2. `fn_precio_en_sede(variante, sede)` (Vender, Cambios, Apartados, la ficha…) pasa a preguntarle a esa misma regla por UNA talla en
--      UNA tienda. La regla sigue siendo una sola: si mañana cambia, cambia para la caja y para la web a la vez. La firma, el
--      `security definer`, el `search_path`, los permisos (`authenticated`) y lo que devuelve no cambian.
--   3. `fn_tienda_precio_talla` (la pieza común del precio de la tienda: catálogo, ficha, bolsa, looks, «Separar») calcula todos los
--      precios con UNA consulta a `fn_precios_en_sedes`; con «Todas», sigue siendo el mayor entre las tiendas de la web.
--   4. `tienda_catalogo` lee una vez las empresas que se ven en la tienda y filtra las prendas contra esa lista (lo mismo que
--      `fn_tienda_empresa_se_ve`, sin preguntarlo 440 veces).
-- Lo que devuelven las cuatro es exactamente lo mismo.
--
-- DECIDÍ: la regla del precio pasa a la forma por lotes y `fn_precio_en_sede` la usa (Felipe 2026-10-31, «también el precio»), en vez
--   de dejar `fn_precio_en_sede` tal cual y escribir aparte una copia por lotes para la tienda: dos copias de la regla terminan diciendo
--   precios distintos, y el repo ya lo prohíbe con pruebas (`pruebas:tienda-ficha`, «ninguna decide por su cuenta»). `fn_precio_en_sede`
--   se reemplaza entera con candado de md5 (patrón ADR-0404) y las otras dos con reemplazos anclados (si un ancla no aparece exactamente
--   una vez, se detiene sin tocar nada). Todo se puede pegar dos veces.
-- DESCARTÉ: índices (las tablas de la tienda pesan menos de 2 MB y la base 128 MB: la lentitud estaba en llamar a una función miles de
--   veces, no en buscar filas); quitarle el `security definer` o el `search_path` a `fn_precio_en_sede` (la llama `authenticated`
--   directamente y lee tablas sin permisos para él); guardar el catálogo armado en una tabla (dato derivado que se queda viejo,
--   principio 4).
--
-- SE ROMPE SI: alguien le pone `security definer` o `set search_path` a `fn_precios_en_sedes` (no da error: vuelve la lentitud, porque
--   Postgres deja de meterla en la consulta), o si alguien escribe la regla del precio en otro lado. Lo vigila
--   `pnpm pruebas:tienda-precio-por-lotes` (la regla nueva contra la de antes, talla por talla y tienda por tienda, con precio de
--   prenda, excepción de combinación, archivados, ropa en S/ 0 y obsequio; el catálogo y el precio de la tienda contra sus versiones de
--   antes; cero llamadas por fila en una carga; permisos; el doble pegado), además de las suites que ya cuidan el precio
--   (`pruebas:registrar-venta`, `pruebas:precio-sede`, `pruebas:precio-sede-variante`, `pruebas:tienda-ficha`, `pruebas:tienda-rapida`).
--   Un parche futuro a la regla del precio va en `fn_precios_en_sedes`, no en `fn_precio_en_sede`.
--
-- PRODUCCIÓN. Se aplica con el OK de Felipe. Una sola parte, sin políticas, disparadores ni `alter` de tablas (ADR-0195); ningún texto
-- entre comillas lleva la palabra con que se guarda una consulta en una variable (ADR-0288). Las tres funciones vivas se midieron el
-- 31-oct con estas huellas: `fn_precio_en_sede` 4c387dff…, `fn_tienda_precio_talla` 817108e3…, `tienda_catalogo` f2ac7474….
-- ============================================================================
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. No se tocó nada.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. La regla del precio por tienda, por lotes ----------
create or replace function retail.fn_precios_en_sedes(p_variantes uuid[], p_sedes uuid[])
 returns table (variante_id uuid, ubicacion_id uuid, precio numeric)
 language sql
 stable
as $function$
  -- LA regla del precio de una talla en una tienda (ADR-0370, ADR-0384), para muchas tallas y tiendas de una vez: una fila por talla y
  -- por tienda pedida. `fn_precio_en_sede` la usa para una sola. Sin `security definer` ni `set search_path` a propósito: así Postgres
  -- la mete dentro de la consulta que la llama (20261031161000). Por eso todo va con `retail.` delante.
  --
  -- La talla de OBSEQUIO —S/ 0 en la grilla, en una categoría que admite el 0 (Empaque, fn_categoria_admite_precio_cero, ADR-0384)—
  -- vale S/ 0 en TODA tienda: el precio de una tienda es de la prenda y no alcanza a lo que se regala. Todo lo demás, también la ropa
  -- con una talla en S/ 0 en su ficha, vale lo primero que haya de: la excepción de ESTA combinación en ESTA tienda (ADR-0370, act.
  -- 2026-10-28), el precio de la prenda en esa tienda, la grilla (20261015121000, Felipe 2026-10-15). Una sola vigente por combinación
  -- y por prenda en cada tienda: lo garantizan `precios_sede_variante_vigente_unico` y `precios_sede_prenda_vigente_unico`.
  select v.id, s.id,
         case when v.precio = 0 and retail.fn_categoria_admite_precio_cero(pr.categoria_id) then v.precio
              else coalesce(pv.precio, ps.precio, v.precio) end
    from retail.variantes v
    join retail.productos pr on pr.id = v.producto_id
    cross join unnest(p_sedes) as s (id)
    left join retail.precios_sede_variante pv
           on pv.variante_id = v.id and pv.ubicacion_id = s.id and pv.archivado_en is null
    left join retail.precios_sede_prenda ps
           on ps.producto_id = v.producto_id and ps.ubicacion_id = s.id and ps.archivado_en is null
   where v.id = any (p_variantes)
$function$;

revoke all on function retail.fn_precios_en_sedes(uuid[], uuid[]) from public, anon, authenticated;

comment on function retail.fn_precios_en_sedes(uuid[], uuid[]) is
  'La regla del precio de una talla en una tienda (obsequio en S/ 0 → excepción de la combinación → precio de la prenda en la tienda → grilla), para muchas tallas y tiendas de una vez: una fila por talla y tienda. fn_precio_en_sede la usa para una sola; la tienda online (fn_tienda_precio_talla) para todo el catálogo. Sin security definer ni search_path a propósito, para que Postgres la meta en la consulta (20261031161000). Solo la llaman funciones security definer.';

-- ---------- 2. fn_precio_en_sede pregunta a esa regla ----------
do $candado$
declare
  v_def text := pg_get_functiondef('retail.fn_precio_en_sede(uuid,uuid)'::regprocedure);
begin
  if position('retail.fn_precios_en_sedes(' in v_def) > 0 then
    raise notice 'fn_precio_en_sede ya pregunta a fn_precios_en_sedes: se vuelve a escribir igual.';
  elsif md5(v_def) <> '4c387dff06a6de9fa802f87c03eed16c' then
    raise exception 'fn_precio_en_sede cambió desde que se midió (md5 %). No se tocó nada: pasa el cambio a fn_precios_en_sedes.', md5(v_def);
  end if;
end
$candado$;

create or replace function retail.fn_precio_en_sede(p_variante_id uuid, p_ubicacion_id uuid)
 returns numeric
 language sql
 stable security definer
 set search_path to 'retail', 'public', 'extensions'
as $function$
  -- El precio de UNA talla en UNA tienda. La regla (obsequio, excepción de la combinación, precio de la prenda en la tienda, grilla) vive
  -- en fn_precios_en_sedes, la misma que usa la tienda online para todo el catálogo de una vez (20261031161000): un cambio de la regla
  -- se hace allá y vale para la caja y para la web a la vez.
  select x.precio from retail.fn_precios_en_sedes(array[p_variante_id], array[p_ubicacion_id]) as x;
$function$;

-- ---------- 3. El precio de la tienda, todo de una vez ----------
select pg_temp.reemplazar('retail.fn_tienda_precio_talla(uuid[], uuid)',
$v$  base as materialized (
    select v.id, v.producto_id, v.color_codigo, v.talla_id, v.activo,
           case when coalesce(cardinality(d.sedes), 0) = 0 then v.precio
                else (select max(retail.fn_precio_en_sede(v.id, s.id)) from unnest(d.sedes) as s (id)) end as precio_lista
      from retail.variantes v
      cross join precio_de d
$v$,
$n$  -- El precio de cada talla en cada tienda que cuenta, todos de una vez (fn_precios_en_sedes, la regla del precio por tienda, la misma
  -- de fn_precio_en_sede; 20261031161000). Con «Todas», el mayor entre las tiendas de la web.
  precio_en_tiendas as materialized (
    select x.variante_id, max(x.precio) as precio
      from precio_de d
      cross join lateral retail.fn_precios_en_sedes(coalesce(p_variantes, '{}'::uuid[]), d.sedes) as x
     group by x.variante_id
  ),
  base as materialized (
    select v.id, v.producto_id, v.color_codigo, v.talla_id, v.activo,
           case when coalesce(cardinality(d.sedes), 0) = 0 then v.precio else pt.precio end as precio_lista
      from retail.variantes v
      cross join precio_de d
      left join precio_en_tiendas pt on pt.variante_id = v.id
$n$,
1);

-- ---------- 4. El catálogo lee una vez las empresas que se ven en la tienda ----------
select pg_temp.reemplazar('retail.tienda_catalogo(uuid)',
$v$  v_ids uuid[];
begin
  v_sede := retail.fn_tienda_sede_elegida(p_sede, v_sedes);
  v_ids := array(select vp.producto_id from retail.vitrina_productos vp
                  where vp.publicado and retail.fn_vitrina_publicable(vp.producto_id)
                  and retail.fn_tienda_empresa_se_ve(vp.producto_id, v_sede));
$v$,
$n$  v_ids uuid[];
  v_empresas uuid[];
begin
  v_sede := retail.fn_tienda_sede_elegida(p_sede, v_sedes);
  -- Las empresas que se ven en esa tienda, leídas una vez por carga (antes, una vez por prenda; 20261031161000).
  v_empresas := array(select e.id from retail.fn_empresas_de_sede(v_sede) as e);
  v_ids := array(select vp.producto_id from retail.vitrina_productos vp
                  where vp.publicado and retail.fn_vitrina_publicable(vp.producto_id)
                  -- Lo mismo que la regla fn_tienda_empresa_se_ve para esta tienda, con la lista ya leída.
                  and exists (select 1 from retail.productos pe where pe.id = vp.producto_id and pe.empresa_id = any (v_empresas)));
$n$,
1);

-- ---------- 5. Comprobación ----------
do $$
declare
  v_precio text := pg_get_functiondef('retail.fn_precio_en_sede(uuid,uuid)'::regprocedure);
  v_talla text := pg_get_functiondef('retail.fn_tienda_precio_talla(uuid[], uuid)'::regprocedure);
  v_catalogo text := pg_get_functiondef('retail.tienda_catalogo(uuid)'::regprocedure);
begin
  if exists (select 1 from pg_proc p where p.oid = 'retail.fn_precios_en_sedes(uuid[], uuid[])'::regprocedure
              and (p.prosecdef or p.proconfig is not null or p.proisstrict or p.provolatile <> 's')) then
    raise exception 'fn_precios_en_sedes tiene que ser SQL stable, sin security definer, sin search_path y sin strict: si no, Postgres no la mete en la consulta';
  end if;
  if has_function_privilege('anon', 'retail.fn_precios_en_sedes(uuid[], uuid[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.fn_precios_en_sedes(uuid[], uuid[])', 'EXECUTE') then
    raise exception 'fn_precios_en_sedes no la llama nadie de afuera';
  end if;
  if not has_function_privilege('authenticated', 'retail.fn_precio_en_sede(uuid,uuid)', 'EXECUTE') then
    raise exception 'fn_precio_en_sede perdió su permiso para authenticated';
  end if;
  if position('retail.fn_precios_en_sedes(' in v_precio) = 0 or position('retail.fn_precios_en_sedes(' in v_talla) = 0
     or position('fn_precio_en_sede(' in v_talla) > 0 then
    raise exception 'el precio de la tienda y fn_precio_en_sede tienen que preguntar a fn_precios_en_sedes';
  end if;
  if position('v_empresas := array(' in v_catalogo) = 0 or position('fn_tienda_empresa_se_ve(' in v_catalogo) > 0 then
    raise exception 'tienda_catalogo tiene que leer las empresas una vez';
  end if;
end;
$$;

reset lock_timeout;
