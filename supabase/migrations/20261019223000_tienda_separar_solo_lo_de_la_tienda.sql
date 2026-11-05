-- ============================================================================
-- 20261019223000_tienda_separar_solo_lo_de_la_tienda.sql — CAYLA V2 · Tienda online (ADR-0458)
-- «Separar» solo separa lo que hay en la tienda de recojo. Cada tienda maneja lo suyo.
--
-- EL PROBLEMA PRIMERO. Hasta hoy `tienda_separar` aceptaba una prenda si quedaba en CUALQUIER tienda de la web
-- (`fn_tienda_libre(variante, v_sedes)` con todas las sedes): la ficha decía «No hay en Trujillo. Igual puedes separarla ahí: la
-- tienda puede traerla de Arequipa» y la tienda de recojo recibía un pedido de algo que no tenía. Esa promesa nunca fue aprobada por
-- las tiendas (Felipe, 2026-10-19: «no es algo que esté aprobado; que cada tienda maneje lo suyo»). La web ya no la ofrece (ficha:
-- «Agotada» + el aviso «Avísame»; bolsa: «Se agotó en Trujillo»); esta migración hace que la BASE tampoco la acepte, para que una
-- bolsa guardada de antes, una pestaña vieja o una llamada directa no separen lo que la tienda no tiene.
--
-- ANALOGÍA CAYLA. Era como tomar un pedido en el mostrador de Trujillo de una blusa que solo está en el almacén de Arequipa, con la
-- promesa de que «alguien la trae». Ahora cada mostrador toma pedidos solo de lo que tiene en su piso y su almacén.
--
-- QUÉ HACE. Dos reemplazos anclados:
--   1. `tienda_separar`: la cuenta de «hay» mira solo la tienda de recojo (`array[p_ubicacion_id]`) y no todas las de la web; el
--      mensaje dice «esa tienda». El HINT sigue siendo `tienda_separar_agotada` (la web ya lo entiende). Nada más cambia: sigue sin
--      reservar ni tocar el stock (eso es confirmar), con la regla de «hay» de la ficha (`fn_tienda_libre`: ni la Cuarentena, ni lo
--      apartado, ni el Taller).
--   2. `tienda_look`: la talla de cada prenda de un look dice «hay» según la tienda elegida (antes, según todas las de la web: el
--      look ofrecía una talla que la bolsa luego no dejaba agregar). Sin tienda elegida, como antes.
-- `tienda_bolsa` no se toca: ya devuelve, por tienda, si alcanza y si hay; es la web la que ahora lee solo la tienda elegida.
--
-- DECIDÍ: el reemplazo es anclado y no una función completa, como el de 20261017175000: la función es larga y tiene seis capas de
--   otras decisiones (Club, topes, marca, precio); reescribirla entera arriesga pisar una. Antes compara el md5 con el de producción
--   del 2026-10-19 y con el de este archivo; si es otro, se detiene sin tocar nada.
-- DECIDÍ: el HINT no cambia. Un hint nuevo obligaría a publicar la web y la base en un orden; con el mismo, cualquier orden sirve.
-- DESCARTÉ: dejar el traslado entre tiendas como opción de la tienda («que cada sede decida si trae»). Nadie lo aprobó y habría que
--   modelar quién acepta, cuándo llega y qué pasa si no llega; si un día se aprueba, es un diseño aparte con su pedido y su plazo.
--
-- SE ROMPE SI: alguien vuelve a pasar `v_sedes` a `fn_tienda_libre` en `tienda_separar`: la web diría «Agotada» y la base aceptaría el
--   pedido (lo vigila `pnpm pruebas:tienda-bolsa`, escenario «solo separa lo que hay en la tienda de recojo»).
--
-- PRODUCCIÓN. Una sola parte, idempotente (se puede pegar dos veces): un `create or replace function` por el reemplazo anclado y
-- un `comment`; no toma tablas en exclusiva ni toca políticas (sin riesgo de 40P01). Sin `select … into` dentro de un texto entre
-- comillas. El orden con la publicación de la web no importa: la web nueva no deja agregar lo que no hay en la tienda, y la base
-- nueva rechaza lo que la web vieja deje pasar con su hint de siempre.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. La guarda: si alguien cambió `tienda_separar`, no se toca nada ----------
do $$
declare
  v_separar text := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('retail.tienda_separar(uuid, uuid, jsonb, uuid)'));
  v_look text := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('retail.tienda_look(uuid, uuid)'));
begin
  if v_separar is null or v_separar not in ('f20e2fd55c98e519c90be7f7aa333c37', '03cd966d59530bb53817f22523728553') then
    raise exception 'tienda_separar tiene otro cuerpo (md5 %): no es el de producción del 2026-10-19 ni el de este archivo. Reescribe el reemplazo desde su definición real antes de pegar.',
      coalesce(v_separar, 'ninguno');
  end if;
  if v_look is null or v_look not in ('37602740955c3b0ddd923d00ad1fe528', '5a1820ecb1be1d91b52d7100009a4979') then
    raise exception 'tienda_look tiene otro cuerpo (md5 %): no es el de producción del 2026-10-19 ni el de este archivo. Reescribe el reemplazo desde su definición real antes de pegar.',
      coalesce(v_look, 'ninguno');
  end if;
end $$;

-- ---------- 1. «Separar» cuenta solo lo que hay en la tienda de recojo ----------
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está. Se mira primero porque, una vez aplicado, el ancla vieja ya no aparece y el conteo abortaría.
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_anclado(
  'retail.tienda_separar(uuid, uuid, jsonb, uuid)',
  $v$    -- Que quede en alguna tienda de la web (la que la recibe la trae con un traslado), con la regla de «hay» de la ficha. No
    -- reserva nada: eso es confirmar.
    v_libres := retail.fn_tienda_libre(r.variante_id, v_sedes);
    if v_libres < r.cantidad then
      raise exception 'Una prenda de tu bolsa se agotó en las tiendas.'
$v$,
  $v$    -- Que quede en ESA tienda (20261019223000, ADR-0458: cada tienda maneja lo suyo, la tienda no trae de otra), con la regla de «hay»
    -- de la ficha. No reserva nada: eso es confirmar.
    v_libres := retail.fn_tienda_libre(r.variante_id, array[p_ubicacion_id]);
    if v_libres < r.cantidad then
      raise exception 'Una prenda de tu bolsa se agotó en esa tienda.'
$v$
);

-- ---------- 2. La talla de un look dice «hay» según la tienda elegida ----------
select pg_temp.reemplazar_anclado(
  'retail.tienda_look(uuid, uuid)',
  $v$  v_sedes := retail.fn_tienda_sedes_web();
  return jsonb_build_object('sede', v_catalogo -> 'sede', 'look', retail.fn_tienda_looks_json(v_catalogo, v_sedes, p_id, true) -> 0);$v$,
  $v$  v_sedes := retail.fn_tienda_sedes_web();
  -- 20261019223000 (ADR-0458): cada tienda maneja lo suyo. Con una tienda elegida (una de la web), «hay» es lo de ESA tienda.
  if (v_catalogo ->> 'sede') is not null and (v_catalogo ->> 'sede')::uuid = any (v_sedes) then
    v_sedes := array[(v_catalogo ->> 'sede')::uuid];
  end if;
  return jsonb_build_object('sede', v_catalogo -> 'sede', 'look', retail.fn_tienda_looks_json(v_catalogo, v_sedes, p_id, true) -> 0);$v$
);

-- ---------- 3. El comentario de «Separar» dice lo mismo ----------
do $$
declare
  v_comentario text := obj_description(to_regprocedure('retail.tienda_separar(uuid, uuid, jsonb, uuid)'), 'pg_proc');
begin
  if v_comentario is not null then
    execute format(
      'comment on function retail.tienda_separar(uuid, uuid, jsonb, uuid) is %L',
      replace(v_comentario, 'quedan en alguna tienda de la web según fn_tienda_libre', 'quedan en ESA tienda según fn_tienda_libre (cada tienda maneja lo suyo, ADR-0458)')
    );
  end if;
end $$;
