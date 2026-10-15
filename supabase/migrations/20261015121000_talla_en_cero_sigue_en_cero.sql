-- ============================================================================
-- 20261015121000_talla_en_cero_sigue_en_cero.sql — CAYLA V2 (Felipe, 2026-10-15; ADR-0370 y ADR-0384, para la tienda online ADR-0408)
--
-- EL PROBLEMA PRIMERO. El precio propio de una tienda es de la PRENDA (`precios_sede_prenda`, 20261011100000): vale para todas sus
-- tallas. Pero una prenda puede tener una talla a S/ 0 en la grilla —la bolsa de obsequio de Empaque (ADR-0384), o una prenda que
-- alguien propuso en el conteo «en 0 para que la complete el Líder»—, y `fn_precio_en_sede` le ponía el precio de la tienda también a
-- esa talla. Con la bolsa a S/ 2.50 en Lima, la de obsequio pasaba a cobrarse S/ 2.50 en la caja de Lima, y la tienda online la
-- ofrecía a ese precio (con «Todas», el mayor entre las tiendas: bastaba UNA tienda con precio propio para que la web la vendiera en
-- todas). Y la prenda de mercadería que se propuso en 0 dejaba de estar «sin precio» para la caja en esa tienda: el candado de
-- ADR-0384 (`venta_sin_precio`) miraba el precio de la tienda y la dejaba vender aunque nadie le hubiera puesto precio en su ficha.
--
-- LA REGLA (Felipe, 2026-10-15): «La talla de S/ 0 sigue en S/ 0». Si una talla vale 0 en la grilla (`variantes.precio = 0`), vale 0
-- en TODA tienda, sin importar el precio propio. Vive en `fn_precio_en_sede`, la que leen la caja (`registrar_venta` y su candado),
-- Apartados, Cambios, Proformas, Regularizar y la tienda online (`fn_tienda_precio_talla`: con 0, la talla no se ofrece en ninguna
-- tienda). Lo demás que mira el precio de la tienda se pone de acuerdo con ella:
--   1. `fn_precio_en_sede` — la regla (reemplazo anclado sobre su definición real).
--   2. `fn_precios_en_sede` — lo que leen Vender (y su «Agregar bolsa»), Existencias, Apartados, Cambios, Proformas, Frescura y el
--      Inicio de Almacén: las variantes que en esa tienda valen OTRO precio que el de su grilla. Ahora sale de `fn_precio_en_sede`, así
--      que la talla de obsequio no aparece y la pantalla la muestra (y la caja la manda) a S/ 0. Sin esto, Vender habría mostrado el
--      precio de la tienda y la base lo habría rechazado al cobrar («el precio cambió»).
--   3. `fn_productos_filtro` — el filtro y el orden por precio de Catálogo ▸ Productos, con la misma regla (escrita ahí para no llamar
--      una función por cada variante; `pruebas:precio-sede` exige que las dos digan lo mismo en cada variante).
--   4. `poner_precio_sede` — el precio de una tienda alcanza a las tallas activas CON precio: «ya es el precio de la prenda», el piso
--      del costo y el historial miran solo esas, y devuelve cuántas cubre. Una prenda con todas sus tallas en 0 no recibe precio de
--      tienda (no cambiaría nada): lo dice en palabras.
--   5. `quitar_precio_sede` y `fn_precio_sede_depurar` — lo mismo al quitarlo: la talla de 0 no se anota (su precio no cambia) y «quedó
--      igual a la grilla» se mira en las tallas con precio. Si una prenda queda sin ninguna talla con precio, su precio de tienda queda
--      guardado y sin efecto, como el de una prenda con todas sus tallas apagadas: vuelve a valer si una talla recibe precio.
--   6. `fn_precios_sede_producto` — «cuántas tallas cubre» cuenta solo esas.
-- La web no cambia: ya calculaba «el precio de la prenda» sin las tallas en 0 (`precioUnico`); el piso de la hoja (`costoMaximoGuardado`)
-- se pone de acuerdo en el mismo commit.
--
-- QUÉ NO HACE. No toca datos: ninguna fila de `precios_sede_prenda` se archiva ni se crea. No cambia el precio de ninguna talla con
-- precio. No toca `registrar_venta` ni las demás funciones que cobran: leen `fn_precio_en_sede` y la regla les llega sola.
--
-- PRODUCCIÓN. **Cambia la caja de hoy**: `fn_precio_en_sede` la llama `registrar_venta` en cada línea de cada venta. Solo cambia algo
-- en una talla a S/ 0 de una prenda con precio propio en alguna tienda (en producción, el 2026-10-12, la única prenda en 0 era la
-- Bolsa de Obsequio): esa talla pasa a cobrarse S/ 0 en esa tienda. No depende de la tienda online (`fn_precio_en_sede` existe desde
-- 20261011100000) y no necesita una web nueva: Vender lee `fn_precios_en_sede`, que cambia en este mismo pegado, así que lo que muestra
-- y lo que cobra la base siguen iguales. Una caja abierta con la lista vieja en memoria la relee sola en 10 s (`usePreciosEnVivo`); si
-- alguien cobra antes, la base rechaza la línea («el precio cambió») y nada se cobra mal.
-- Una sola parte, re-ejecutable, `lock_timeout = 3s`: solo reemplazos ANCLADOS de funciones (sin tablas, políticas ni disparadores,
-- ADR-0195); si un trozo no está exactamente como se espera, se detiene sin tocar nada. Ningún texto de ancla lleva la palabra con la
-- que se guarda una consulta en una variable (ADR-0288). Pruebas: `pnpm pruebas:precio-sede` (con su mutante), `pruebas:tienda-ficha`
-- (sección 10), `pruebas:tienda-bolsa` y `pruebas:vitrina-looks`.
-- SE ROMPE SI: alguien vuelve a escribir el precio de una tienda en una función nueva sin pasar por `fn_precio_en_sede` (el guardián
-- 13 de `pruebas:precio-sede` mira las que cobran).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- El reemplazo anclado (el mismo de 20261012190000): si el texto nuevo ya está, no hace nada; si el ancla no aparece exactamente
-- `p_veces` veces, se detiene sin tocar nada.
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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. La regla ----------

select pg_temp.reemplazar('retail.fn_precio_en_sede(uuid, uuid)',
  $v$  select coalesce(
    (select ps.precio from retail.precios_sede_prenda ps
      where ps.producto_id = v.producto_id and ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null),
    v.precio)
    from retail.variantes v where v.id = p_variante_id;$v$,
  $v$  -- La talla que vale S/ 0 en la grilla (la de obsequio, ADR-0384) vale S/ 0 en TODA tienda: el precio de una tienda es de la
  -- prenda y no alcanza a lo que se regala (20261015121000, Felipe 2026-10-15). Las demás: el de la prenda en esa tienda o la grilla.
  select case when v.precio = 0 then v.precio
              else coalesce(
                (select ps.precio from retail.precios_sede_prenda ps
                  where ps.producto_id = v.producto_id and ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null),
                v.precio) end
    from retail.variantes v where v.id = p_variante_id;$v$,
  1);

comment on function retail.fn_precio_en_sede(uuid, uuid) is
  'EL precio de una variante en una tienda (ADR-0370): el propio de la prenda en esa tienda (precios_sede_prenda) o, si no tiene, el de la grilla (variantes.precio). Una talla a 0 en la grilla vale 0 en toda tienda (2026-10-15). La leen la caja, Apartados, Cambios, Proformas, Regularizar y la tienda online.';

-- ---------- 2. Lo que leen las pantallas de una tienda ----------

select pg_temp.reemplazar('retail.fn_precios_en_sede(uuid)',
  $v$  select v.id, ps.precio
    from retail.precios_sede_prenda ps
    join retail.variantes v on v.producto_id = ps.producto_id and v.precio <> ps.precio
   where ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null and auth.uid() is not null;$v$,
  $v$  -- Las variantes que en esta tienda valen OTRO precio que el de su grilla, con ese precio: el de fn_precio_en_sede, así que la
  -- talla a S/ 0 (que sigue en S/ 0 en toda tienda, 20261015121000) no aparece y la pantalla la muestra y la cobra a S/ 0.
  select x.variante_id, x.precio
    from (select v.id as variante_id, v.precio as de_la_grilla, retail.fn_precio_en_sede(v.id, ps.ubicacion_id) as precio
            from retail.precios_sede_prenda ps
            join retail.variantes v on v.producto_id = ps.producto_id
           where ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null and auth.uid() is not null) x
   where x.precio <> x.de_la_grilla;$v$,
  1);

-- ---------- 3. El filtro y el orden del catálogo ----------

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proname = 'fn_productos_filtro'),
  $v$           coalesce((select ps.precio from retail.precios_sede_prenda ps
                      where ps.producto_id = v.producto_id and ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null),
                    v.precio) as precio,$v$,
  $v$           -- El precio en esa tienda con la regla de fn_precio_en_sede, escrita aquí para no llamar una función por cada variante:
           -- la talla a S/ 0 en la grilla sigue en S/ 0 (20261015121000); las demás, el de la prenda en esa tienda o la grilla.
           -- `pruebas:precio-sede` exige que las dos digan lo mismo en cada variante.
           case when v.precio = 0 then v.precio
                else coalesce((select ps.precio from retail.precios_sede_prenda ps
                                where ps.producto_id = v.producto_id and ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null),
                              v.precio) end as precio,$v$,
  1);

-- ---------- 4. Poner el precio de una tienda ----------

select pg_temp.reemplazar('retail.poner_precio_sede(uuid, uuid, numeric, text)',
  $v$  v_activas integer;
  v_igual_grilla boolean;$v$,
  $v$  v_activas integer;
  v_cubre integer;
  v_igual_grilla boolean;$v$,
  1);

select pg_temp.reemplazar('retail.poner_precio_sede(uuid, uuid, numeric, text)',
  $v$  for v_activas, v_igual_grilla, v_costo_max in
    select count(*)::integer, coalesce(bool_and(v.precio = v_precio), false), max(v.costo)
      from retail.variantes v where v.producto_id = p_producto_id and v.activo
  loop
    exit;
  end loop;
  if v_activas = 0 then
    raise exception 'Esta prenda no tiene tallas activas: actívala antes de ponerle precio.';
  end if;$v$,
  $v$  -- El precio de una tienda alcanza a las tallas activas CON precio en la grilla: la que vale S/ 0 (la de obsequio) sigue en S/ 0
  -- en toda tienda (fn_precio_en_sede, 20261015121000). «Igual a la grilla», el piso del costo y lo que se anota miran solo esas.
  for v_activas, v_cubre, v_igual_grilla, v_costo_max in
    select count(*)::integer, (count(*) filter (where v.precio > 0))::integer,
           coalesce(bool_and(v.precio = v_precio) filter (where v.precio > 0), false),
           max(v.costo) filter (where v.precio > 0)
      from retail.variantes v where v.producto_id = p_producto_id and v.activo
  loop
    exit;
  end loop;
  if v_activas = 0 then
    raise exception 'Esta prenda no tiene tallas activas: actívala antes de ponerle precio.';
  end if;
  if v_cubre = 0 then
    raise exception 'Todas las tallas de esta prenda valen 0 (se regalan): un precio de tienda no las cambia. Si se va a cobrar, ponle precio en la tabla de la prenda.';
  end if;$v$,
  1);

select pg_temp.reemplazar('retail.poner_precio_sede(uuid, uuid, numeric, text)',
  $v$  -- tienda no puede quedar por debajo de lo que cuesta CUALQUIERA de sus tallas activas (el precio vale para todas). Quedar justo en$v$,
  $v$  -- tienda no puede quedar por debajo de lo que cuesta CUALQUIERA de sus tallas activas con precio (vale para todas ellas). Quedar justo en$v$,
  1);

select pg_temp.reemplazar('retail.poner_precio_sede(uuid, uuid, numeric, text)',
  $v$  for v_var in
    select v.id, v.precio from retail.variantes v where v.producto_id = p_producto_id and v.activo order by v.id
  loop
    perform retail.fn_precio_sede_anotar(v_var.id, p_ubicacion_id,
      coalesce(v_vig.precio, v_var.precio), v_vig.id is not null, v_precio, true, v_motivo, v_actor);
  end loop;
  return v_activas;$v$,
  $v$  for v_var in
    select v.id, v.precio from retail.variantes v where v.producto_id = p_producto_id and v.activo and v.precio > 0 order by v.id
  loop
    perform retail.fn_precio_sede_anotar(v_var.id, p_ubicacion_id,
      coalesce(v_vig.precio, v_var.precio), v_vig.id is not null, v_precio, true, v_motivo, v_actor);
  end loop;
  return v_cubre;$v$,
  1);

-- ---------- 5. Quitarlo, a mano o solo ----------

select pg_temp.reemplazar('retail.quitar_precio_sede(uuid, uuid, text)',
  $v$  for v_var in
    select v.id, v.precio from retail.variantes v where v.producto_id = p_producto_id and v.activo order by v.id
  loop
    perform retail.fn_precio_sede_anotar(v_var.id, p_ubicacion_id, v_vig.precio, true, v_var.precio, false, p_motivo, v_actor);$v$,
  $v$  -- Solo las tallas con precio en la grilla: la de S/ 0 no cambia de precio (nunca tuvo el de la tienda, 20261015121000).
  for v_var in
    select v.id, v.precio from retail.variantes v where v.producto_id = p_producto_id and v.activo and v.precio > 0 order by v.id
  loop
    perform retail.fn_precio_sede_anotar(v_var.id, p_ubicacion_id, v_vig.precio, true, v_var.precio, false, p_motivo, v_actor);$v$,
  1);

select pg_temp.reemplazar('retail.fn_precio_sede_depurar(uuid)',
  $v$       and exists (select 1 from retail.variantes v where v.producto_id = p_producto_id and v.activo)
       and not exists (select 1 from retail.variantes v where v.producto_id = p_producto_id and v.activo and v.precio <> ps.precio)$v$,
  $v$       -- Solo las tallas con precio en la grilla: la de S/ 0 sigue en S/ 0 en toda tienda (20261015121000). Sin ninguna, el precio de
       -- la tienda queda guardado y sin efecto (como con todas las tallas apagadas): vuelve a valer si una talla recibe precio.
       and exists (select 1 from retail.variantes v where v.producto_id = p_producto_id and v.activo and v.precio > 0)
       and not exists (select 1 from retail.variantes v
                        where v.producto_id = p_producto_id and v.activo and v.precio > 0 and v.precio <> ps.precio)$v$,
  1);

select pg_temp.reemplazar('retail.fn_precio_sede_depurar(uuid)',
  $v$      select v.id, v.precio from retail.variantes v where v.producto_id = p_producto_id and v.activo order by v.id$v$,
  $v$      select v.id, v.precio from retail.variantes v where v.producto_id = p_producto_id and v.activo and v.precio > 0 order by v.id$v$,
  1);

-- ---------- 6. La ficha: cuántas tallas cubre ----------

select pg_temp.reemplazar('retail.fn_precios_sede_producto(uuid)',
  $v$         (select count(*)::integer from retail.variantes v where v.producto_id = ps.producto_id and v.activo),$v$,
  $v$         -- Las tallas activas con precio: la de S/ 0 no toma el precio de la tienda (20261015121000).
         (select count(*)::integer from retail.variantes v where v.producto_id = ps.producto_id and v.activo and v.precio > 0),$v$,
  1);
