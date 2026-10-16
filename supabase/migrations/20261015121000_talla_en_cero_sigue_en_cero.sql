-- ============================================================================
-- 20261015121000_talla_en_cero_sigue_en_cero.sql — CAYLA V2 (Felipe, 2026-10-15; ADR-0370 y ADR-0384, para la tienda online ADR-0408)
--
-- EL PROBLEMA PRIMERO. El precio propio de una tienda es de la PRENDA (`precios_sede_prenda`, 20261011100000): vale para todas sus
-- tallas. Una prenda de Empaque tiene a propósito una talla a S/ 0 en la grilla —la bolsa de obsequio (ADR-0377, ADR-0384)—, y
-- `fn_precio_en_sede` le ponía el precio de la tienda también a esa talla: con la bolsa a S/ 2.50 en Lima, la de obsequio pasaba a
-- cobrarse S/ 2.50 en la caja de Lima.
--
-- LA REGLA (Felipe, 2026-10-15). La primera versión de esta migración (sin pegar) dejaba en S/ 0 en toda tienda CUALQUIER talla en 0,
-- también la de una prenda de ropa. Felipe la corrigió el mismo día: «el precio de la prenda siempre debe ser el mismo de la tienda»
-- (en la web, con «Todas», se ve el mayor). Quedó así:
--   · La talla de OBSEQUIO —la que vale S/ 0 en la grilla, en una categoría que admite el 0 (`fn_categoria_admite_precio_cero`,
--     ADR-0384: Empaque)— vale S/ 0 en TODA tienda: el precio de una tienda no alcanza a lo que se regala. De ella habla el nombre del
--     archivo.
--   · Todo lo demás —la ropa, también la talla que su ficha deja en S/ 0 (la que propuso el conteo «en 0 para que la complete el
--     Líder»)— vale el precio de la prenda en esa tienda: en la tienda con precio propio se vende, se aparta y se cambia a ese precio, y
--     la web la ofrece ahí (y con «Todas», al mayor). Sin precio propio, el de la grilla: en una tienda sin él, la talla en 0 sigue sin
--     precio, no se vende (`venta_sin_precio`, ADR-0384) ni se ofrece en la web hasta que tenga precio.
-- La regla vive en `fn_precio_en_sede`, la que leen la caja (`registrar_venta` y su candado), Apartados, Cambios
-- (`fn_precio_para_cambio`), Proformas, Regularizar y la tienda online (`fn_tienda_precio_talla`). Lo demás que mira el precio de una
-- tienda se pone de acuerdo con ella, con la misma pregunta: «¿es la talla de obsequio?» = `v.precio = 0 and
-- retail.fn_categoria_admite_precio_cero(<categoría de la prenda>)`.
--   1. `fn_precio_en_sede` — la regla (reemplazo anclado sobre su definición real).
--   2. `fn_precios_en_sede` — lo que leen Vender (y su «Agregar bolsa»), Existencias, Apartados, Cambios, Proformas, Frescura y el
--      Inicio de Almacén: las variantes que en esa tienda valen OTRO precio que el de su grilla. Sale de `fn_precio_en_sede`, así que la
--      talla de obsequio no aparece (la pantalla la muestra y la caja la manda a S/ 0) y la de ropa en 0 aparece con el precio de la
--      tienda (la pantalla la deja entrar al ticket a ese precio, `sinPrecioParaVender` mira el precio que se cobra).
--   3. `fn_productos_filtro` — el filtro y el orden por precio de Catálogo ▸ Productos, con la misma regla (escrita ahí para no llamar
--      una función por cada variante; `pruebas:precio-sede` exige que las dos digan lo mismo en cada variante).
--   4. `poner_precio_sede` — el precio de una tienda alcanza a las tallas activas menos la de obsequio: «ya es el precio de la prenda»,
--      el piso del costo y el historial miran esas, y devuelve cuántas cubre. A una prenda de ropa con TODAS sus tallas en 0 sí se le
--      pone (en esa tienda pasa a venderse a ese precio); a una de Empaque con todas sus tallas de obsequio, no (no cambiaría nada): lo
--      dice en palabras.
--   5. `quitar_precio_sede` y `fn_precio_sede_depurar` — lo mismo al quitarlo: la talla de obsequio no se anota, y «quedó igual a la
--      grilla» se mira en las tallas que alcanza (una talla de ropa en 0 no está «igual»: quitarlo la dejaría sin precio en esa tienda).
--      Una prenda sin ninguna talla que alcanzar (una bolsa que quedó solo con su talla de obsequio) guarda su precio de tienda sin
--      efecto, como con todas las tallas apagadas: vuelve a valer si una talla recibe precio.
--   6. `fn_precios_sede_producto` — «cuántas tallas cubre» cuenta esas.
-- La web no cambia: lee `fn_precios_en_sede`. El piso del precio en la hoja de la ficha (`costoMaximoGuardado`) cuenta las mismas tallas
-- en el mismo commit (con la categoría GUARDADA de la prenda, la que mira la base).
--
-- QUÉ NO HACE. No toca datos: ninguna fila de `precios_sede_prenda` se archiva ni se crea. No cambia el precio de ninguna talla con
-- precio. No toca `registrar_venta` ni las demás funciones que cobran: leen `fn_precio_en_sede` y la regla les llega sola. No cambia
-- `fn_categoria_admite_precio_cero` (ADR-0384): la usa.
--
-- PRODUCCIÓN. Pide `fn_categoria_admite_precio_cero` (20261012190000, en producción desde el 2026-10-12): si falta, se detiene sin tocar
-- nada. **Cambia la caja de hoy SOLO en la talla de obsequio**: frente a lo que corre hoy en producción (el precio de la tienda para
-- todas las tallas), la ropa sigue igual y la talla de obsequio de una prenda con precio propio en alguna tienda pasa a cobrarse S/ 0
-- en esa tienda. Lo dice, antes de pegar, esta consulta de solo lectura (cada fila: una talla que hoy se cobra al precio de la tienda y
-- después se cobra S/ 0; sin filas, la caja no cambia):
--     select u.nombre as tienda, pr.referencia as prenda, v.sku, v.activo, ps.precio as hoy_se_cobra, v.precio as despues_se_cobra
--       from retail.precios_sede_prenda ps
--       join retail.ubicaciones u on u.id = ps.ubicacion_id
--       join retail.productos pr on pr.id = ps.producto_id
--       join retail.variantes v on v.producto_id = ps.producto_id
--      where ps.archivado_en is null and v.precio = 0 and retail.fn_categoria_admite_precio_cero(pr.categoria_id)
--      order by 1, 2, 3;
-- `registrar_venta` llama a `fn_precio_en_sede` en cada línea de cada venta, y Vender lee `fn_precios_en_sede`, que cambia en este mismo
-- pegado: lo que muestra y lo que cobra la base siguen iguales. Una caja abierta con la lista vieja en memoria la relee sola en 10 s
-- (`usePreciosEnVivo`); si alguien cobra antes la de obsequio al precio viejo, la base rechaza la línea («el precio cambió») y nada se
-- cobra mal. No depende de la tienda online (`fn_precio_en_sede` existe desde 20261011100000) ni necesita una web nueva.
-- Una sola parte, re-ejecutable, `lock_timeout = 3s`: solo reemplazos ANCLADOS de funciones (sin tablas, políticas ni disparadores,
-- ADR-0195); si un trozo no está exactamente como se espera, se detiene sin tocar nada, y al final comprueba que las seis funciones
-- quedaron con la regla. Ningún texto de ancla lleva la palabra con la que se guarda una consulta en una variable (ADR-0288). Pruebas:
-- `pnpm pruebas:precio-sede` (escenarios 24-31, con sus mutantes), `pruebas:registrar-venta`, `pruebas:cambio-sin-precio`,
-- `pruebas:tienda-ficha` (sección 10, con su mutante), `pruebas:tienda-bolsa` y `pruebas:vitrina-looks`.
-- SE ROMPE SI: alguien vuelve a escribir el precio de una tienda en una función nueva sin pasar por `fn_precio_en_sede` (el guardián
-- 13 de `pruebas:precio-sede` mira las que cobran), o si alguien decide «¿es de obsequio?» en una de las seis sin
-- `fn_categoria_admite_precio_cero` (los escenarios 24-31 cruzan las seis con una bolsa y con ropa).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.fn_categoria_admite_precio_cero(uuid)') is null then
    raise exception 'Falta retail.fn_categoria_admite_precio_cero: pega antes 20261012190000_precio_cero_solo_empaque.sql.';
  end if;
end
$$;

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
  $v$  -- La talla de OBSEQUIO —S/ 0 en la grilla, en una categoría que admite el 0 (Empaque, fn_categoria_admite_precio_cero, ADR-0384)—
  -- vale S/ 0 en TODA tienda: el precio de una tienda es de la prenda y no alcanza a lo que se regala. Todo lo demás, también la ropa
  -- con una talla en S/ 0 en su ficha, vale el de la prenda en esa tienda o, sin él, la grilla (20261015121000, Felipe 2026-10-15).
  select case when v.precio = 0 and retail.fn_categoria_admite_precio_cero(pr.categoria_id) then v.precio
              else coalesce(
                (select ps.precio from retail.precios_sede_prenda ps
                  where ps.producto_id = v.producto_id and ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null),
                v.precio) end
    from retail.variantes v
    join retail.productos pr on pr.id = v.producto_id
   where v.id = p_variante_id;$v$,
  1);

comment on function retail.fn_precio_en_sede(uuid, uuid) is
  'EL precio de una variante en una tienda (ADR-0370): el propio de la prenda en esa tienda (precios_sede_prenda) o, si no tiene, el de la grilla (variantes.precio). La talla de obsequio (0 en la grilla, en una categoría que admite el 0: fn_categoria_admite_precio_cero) vale 0 en toda tienda; la ropa con una talla en 0 vale el de la tienda (2026-10-15). La leen la caja, Apartados, Cambios, Proformas, Regularizar y la tienda online.';

-- ---------- 2. Lo que leen las pantallas de una tienda ----------

select pg_temp.reemplazar('retail.fn_precios_en_sede(uuid)',
  $v$  select v.id, ps.precio
    from retail.precios_sede_prenda ps
    join retail.variantes v on v.producto_id = ps.producto_id and v.precio <> ps.precio
   where ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null and auth.uid() is not null;$v$,
  $v$  -- Las variantes que en esta tienda valen OTRO precio que el de su grilla, con ese precio: el de fn_precio_en_sede (una sola regla).
  -- La talla de obsequio (que sigue en S/ 0 en toda tienda) no aparece, así que la pantalla la muestra y la cobra a S/ 0; la ropa con
  -- una talla en S/ 0 aparece con el precio de la tienda (20261015121000).
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
           -- la talla de obsequio (S/ 0 en una categoría que admite el 0) sigue en S/ 0; las demás, también la ropa con una talla en
           -- S/ 0, el de la prenda en esa tienda o la grilla (20261015121000). `pruebas:precio-sede` exige que las dos digan lo mismo
           -- en cada variante.
           case when v.precio = 0 and retail.fn_categoria_admite_precio_cero(p.categoria_id) then v.precio
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
  $v$  -- El precio de una tienda alcanza a las tallas activas menos la de obsequio (S/ 0 en una categoría que admite el 0, ADR-0384), que
  -- sigue en S/ 0 en toda tienda (fn_precio_en_sede, 20261015121000). La ropa con una talla en S/ 0 sí: en esta tienda pasa a venderse
  -- a este precio. «Igual a la grilla», el piso del costo y lo que se anota miran las tallas que alcanza.
  for v_activas, v_cubre, v_igual_grilla, v_costo_max in
    select count(*)::integer, (count(*) filter (where x.alcanza))::integer,
           coalesce(bool_and(x.precio = v_precio) filter (where x.alcanza), false),
           max(x.costo) filter (where x.alcanza)
      from (select v.precio, v.costo, not (v.precio = 0 and retail.fn_categoria_admite_precio_cero(pr.categoria_id)) as alcanza
              from retail.variantes v
              join retail.productos pr on pr.id = v.producto_id
             where v.producto_id = p_producto_id and v.activo) x
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
  $v$  -- tienda no puede quedar por debajo de lo que cuesta CUALQUIERA de las tallas activas que alcanza (todas menos la de obsequio). Quedar justo en$v$,
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
    select v.id, v.precio from retail.variantes v
      join retail.productos pr on pr.id = v.producto_id
     where v.producto_id = p_producto_id and v.activo
       and not (v.precio = 0 and retail.fn_categoria_admite_precio_cero(pr.categoria_id))
     order by v.id
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
  $v$  -- Las tallas que el precio de la tienda alcanzaba: todas menos la de obsequio, que nunca lo tuvo (20261015121000).
  for v_var in
    select v.id, v.precio from retail.variantes v
      join retail.productos pr on pr.id = v.producto_id
     where v.producto_id = p_producto_id and v.activo
       and not (v.precio = 0 and retail.fn_categoria_admite_precio_cero(pr.categoria_id))
     order by v.id
  loop
    perform retail.fn_precio_sede_anotar(v_var.id, p_ubicacion_id, v_vig.precio, true, v_var.precio, false, p_motivo, v_actor);$v$,
  1);

select pg_temp.reemplazar('retail.fn_precio_sede_depurar(uuid)',
  $v$       and exists (select 1 from retail.variantes v where v.producto_id = p_producto_id and v.activo)
       and not exists (select 1 from retail.variantes v where v.producto_id = p_producto_id and v.activo and v.precio <> ps.precio)$v$,
  $v$       -- Las tallas que el precio de la tienda alcanza: todas menos la de obsequio, que sigue en S/ 0 en toda tienda (20261015121000).
       -- Una talla de ropa en S/ 0 cuenta y no está «igual»: quitar el precio la dejaría sin precio en esta tienda. Sin ninguna talla
       -- que alcanzar, el precio de la tienda queda guardado y sin efecto (como con todas las tallas apagadas): vuelve a valer si una
       -- talla recibe precio.
       and exists (select 1 from retail.variantes v
                     join retail.productos pr on pr.id = v.producto_id
                    where v.producto_id = p_producto_id and v.activo
                      and not (v.precio = 0 and retail.fn_categoria_admite_precio_cero(pr.categoria_id)))
       and not exists (select 1 from retail.variantes v
                         join retail.productos pr on pr.id = v.producto_id
                        where v.producto_id = p_producto_id and v.activo and v.precio <> ps.precio
                          and not (v.precio = 0 and retail.fn_categoria_admite_precio_cero(pr.categoria_id)))$v$,
  1);

select pg_temp.reemplazar('retail.fn_precio_sede_depurar(uuid)',
  $v$      select v.id, v.precio from retail.variantes v where v.producto_id = p_producto_id and v.activo order by v.id$v$,
  $v$      select v.id, v.precio from retail.variantes v
        join retail.productos pr on pr.id = v.producto_id
       where v.producto_id = p_producto_id and v.activo
         and not (v.precio = 0 and retail.fn_categoria_admite_precio_cero(pr.categoria_id))
       order by v.id$v$,
  1);

-- ---------- 6. La ficha: cuántas tallas cubre ----------

select pg_temp.reemplazar('retail.fn_precios_sede_producto(uuid)',
  $v$         (select count(*)::integer from retail.variantes v where v.producto_id = ps.producto_id and v.activo),$v$,
  $v$         -- Las tallas activas que alcanza: todas menos la de obsequio, que no toma el precio de la tienda (20261015121000).
         (select count(*)::integer from retail.variantes v
            join retail.productos pr on pr.id = v.producto_id
           where v.producto_id = ps.producto_id and v.activo
             and not (v.precio = 0 and retail.fn_categoria_admite_precio_cero(pr.categoria_id))),$v$,
  1);

-- ---------- 7. Comprobación final: las seis que deciden quedaron con la regla, y la séptima sale de la primera ----------

do $$
declare
  v_f text;
begin
  foreach v_f in array array['retail.fn_precio_en_sede(uuid, uuid)', 'retail.poner_precio_sede(uuid, uuid, numeric, text)',
                             'retail.quitar_precio_sede(uuid, uuid, text)', 'retail.fn_precio_sede_depurar(uuid)',
                             'retail.fn_precios_sede_producto(uuid)'] loop
    if position('fn_categoria_admite_precio_cero(pr.categoria_id)' in pg_get_functiondef(v_f::regprocedure)) = 0 then
      raise exception '% no quedó con la regla de la talla de obsequio (20261015121000).', v_f;
    end if;
  end loop;
  if position('fn_categoria_admite_precio_cero(p.categoria_id)' in
              pg_get_functiondef((select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                   where n.nspname = 'retail' and p.proname = 'fn_productos_filtro'))) = 0 then
    raise exception 'fn_productos_filtro no quedó con la regla de la talla de obsequio (20261015121000).';
  end if;
  if position('retail.fn_precio_en_sede(v.id, ps.ubicacion_id)' in pg_get_functiondef('retail.fn_precios_en_sede(uuid)'::regprocedure)) = 0 then
    raise exception 'fn_precios_en_sede no quedó saliendo de fn_precio_en_sede (20261015121000).';
  end if;
end
$$;
