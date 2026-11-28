-- ============================================================================
-- 20261128162000 — «Liberar» en Existencias ya no suelta la prenda de un apartado con adelanto, y un apartado trabado ya no
--                  frena el vencimiento diario de todas las sedes (auditoría 2026-11-28, N.º 2 y N.º 45)
--
-- EL PROBLEMA PRIMERO. Cuando un cliente aparta con adelanto (un APT, ADR-0166), cada prenda queda como un apartado de Existencias
-- ligado a su separación. Existencias ▸ Apartados le mostraba «Liberar» a quien la apartó, y `liberar_apartado` no miraba si la
-- prenda era de una separación: con un clic la prenda quedaba libre para venderse a otro cliente mientras la separación seguía
-- abierta, con su adelanto en custodia. Después, entregar, liberar o vencer ese APT fallaba con «el apartado de la clienta quedó
-- inconsistente» y el adelanto no se podía devolver sin SQL a mano (N.º 2; ADR-0166 ya avisaba del riesgo).
-- Y como el barrido diario (`fn_vencer_apartados_de_todas`, `/api/apartados/vencer`) corría todo en una sola transacción, ese APT
-- trabado deshacía la corrida entera: no vencía ningún APT ni ningún apartado simple de ninguna sede, cada día (N.º 45).
--
-- CONTRATO (Liskov)
--   PROMETE: (a) `liberar_apartado` rechaza la prenda de un apartado con adelanto (o ligada a una venta) con «Esta prenda es del
--            apartado APT-…: se libera desde Apartados.» (`P0001`, hint `apartado_de_separacion`), sin mover stock;
--            (b) `listar_apartados` devuelve `puede_liberar = false` en esas filas, así la pantalla no ofrece el botón;
--            (c) `fn_apartados_de_separaciones(sede)` (nueva, de lectura) dice de qué APT es cada prenda, para que Existencias lo
--            rotule y enlace a Apartados;
--            (d) el vencimiento de cada APT se aísla: si uno falla, se deshace solo ese APT (sus prendas siguen apartadas y él
--            sigue abierto), se avisa con `raise warning` (id y código, nunca el nombre del cliente) y los demás vencen igual.
--            `fn_vencer_apartados_de_todas` suma al resumen `fallidas`, `fallidas_ids` (APT) y `simples_fallidos_ids`; la ruta
--            del cron lo manda a Sentry. Lo mismo para cada apartado simple vencido.
--   ASUME:   la prenda de un APT siempre tiene `apartados.separacion_id` o su fila en `separacion_items` (las dos se escriben juntas
--            en `separar_prendas` y `editar_separacion`; medido en local: 0 filas distintas).
--   FALLA:   `P0001` en `liberar_apartado` como arriba; el barrido no falla por un APT trabado (lo cuenta).
--   NO HACE: no repara los APT que ya quedaron trabados en producción (eso es decidir con Felipe qué pasa con su adelanto: ver la
--            consulta de lectura en el informe); no cambia la firma de ninguna función que la web llame; no toca los apartados de
--            un pedido entre tiendas (`separacion_pedidos`), que siguen su propio camino.
--
-- ESTADOS QUE NO DEBEN EXISTIR
--   · Una separación abierta con una prenda ya liberada: `liberar_apartado` ya no puede producirlo.
--   · Un barrido que deja todo sin vencer por un solo APT: cada APT va en su propio bloque `begin … exception`.
--
-- DECIDÍ preguntar en la base (`liberar_apartado`) y además en la lectura (`listar_apartados`), no solo esconder el botón: la base
--        es la que manda (principio 2) y la pantalla solo deja de ofrecer lo que la base rechazaría.
-- DECIDÍ una pieza nueva con el resumen (`fn_vencer_separaciones_resumen`), en vez de cambiar lo que devuelve `fn_vencer_separaciones_de`:
--        cambiarle el tipo obliga a borrarla y recrearla; así la regla del vencimiento sigue en un solo lugar y las dos de antes la llaman.
-- DESCARTÉ sumar una columna a `listar_apartados` para el código del APT: obliga a borrarla y recrearla (la misma razón que
--        20261015011000 dio para los pedidos web); va en `fn_apartados_de_separaciones`, como `fn_apartados_de_pedidos_web`.
-- SE ROMPE SI alguien reescribe entera `liberar_apartado` o `listar_apartados` sin el bloque «auditoría 2026-11-28»: vuelve el N.º 2.
--        `pnpm pruebas:separaciones` lo detecta.
--
-- CÓMO SE PEGA. Una sola parte: solo funciones (`create or replace`, dos por reemplazo anclado), sin `alter` de tablas, sin políticas,
-- sin datos. Antes de tocar nada, compara la huella (md5) de las dos funciones del barrido con la de `main`, y los reemplazos frenan
-- si su ancla no aparece exactamente una vez: si producción difiere, aborta sin aplicar nada. Pegarla dos veces no cambia nada.
-- VOLVER ATRÁS. Pegar las definiciones de 20260920160000 (con el parche de 20260923100000) y de 20261016003000. No hay datos que deshacer.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Candado: las dos funciones del barrido se reescriben enteras, así que tienen que ser la de `main` (20261016003000) o ya la de aquí.
do $g$
declare
  r record;
begin
  for r in
    select * from (values
      ('retail.fn_vencer_apartados_de_todas()', '8cf3ac428dfec8e17c3b317c95fda70a', 'simples_fallidos_ids'),
      ('retail.fn_vencer_separaciones_de(uuid)', '15d9bcaebad05b18a0e178b26645ac62', 'fn_vencer_separaciones_resumen')
    ) as t(firma, huella, marca)
  loop
    if to_regprocedure(r.firma) is null then
      raise exception '% no existe en esta base: pega antes 20261016003000.', r.firma;
    end if;
    if (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure(r.firma)) <> r.huella
       and (select position(r.marca in p.prosrc) from pg_proc p where p.oid = to_regprocedure(r.firma)) = 0 then
      raise exception '% cambió desde que se escribió esta migración (su huella no es la de main): regenera la migración desde su definición real.', r.firma;
    end if;
  end loop;
end $g$;

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

-- (a) liberar_apartado: la prenda de un apartado con adelanto (o ligada a una venta) no se suelta desde Existencias. Va después de
--     «ya estaba cerrado» para que un doble clic sobre algo ya cerrado siga diciendo eso, y antes de mover stock.
select pg_temp.reemplazar(
  'retail.liberar_apartado(uuid, text)',
  $v$    raise exception 'Ese apartado ya estaba cerrado';
  end if;$v$,
  $n$    raise exception 'Ese apartado ya estaba cerrado';
  end if;
  -- Auditoría 2026-11-28 (N.º 2): la prenda de un apartado con adelanto es de la separación del cliente, que ya pagó una parte.
  -- Soltarla aquí dejaba la separación abierta sin su prenda y trababa su entrega, su devolución y el vencimiento de todas las sedes.
  if a.separacion_id is not null or a.venta_id is not null
     or exists (select 1 from separacion_items si where si.apartado_id = a.id) then
    raise exception 'Esta prenda es %: se libera desde Apartados.',
      coalesce('del apartado ' || (select s.codigo from separaciones s
                                    where s.id = coalesce(a.separacion_id,
                                                          (select si.separacion_id from separacion_items si where si.apartado_id = a.id limit 1))),
               'de un apartado')
      using errcode = 'P0001', hint = 'apartado_de_separacion';
  end if;$n$,
  1);

-- (b) listar_apartados: `puede_liberar` dice lo mismo que el candado de arriba, para que la pantalla no ofrezca lo que la base rechaza.
select pg_temp.reemplazar(
  'retail.listar_apartados(uuid)',
  '(fn_es_lider() or exists (select 1 from retail.fn_terminal_actual()) or a.creado_por is not distinct from (select pe.id from personas pe where pe.auth_user_id = auth.uid()))',
  '(a.separacion_id is null and a.venta_id is null and not exists (select 1 from separacion_items si where si.apartado_id = a.id) -- auditoría 2026-11-28 (N.º 2): lo de un apartado con adelanto se libera desde Apartados
          and (fn_es_lider() or exists (select 1 from retail.fn_terminal_actual()) or a.creado_por is not distinct from (select pe.id from personas pe where pe.auth_user_id = auth.uid())))',
  1);

-- (c) De qué apartado con adelanto es cada prenda apartada de una sede: Existencias la rotula con su código y enlaza a Apartados en vez
--     de ofrecer «Liberar». Misma forma y mismo permiso que `fn_apartados_de_pedidos_web` (20261015011000).
create or replace function retail.fn_apartados_de_separaciones(p_ubicacion_id uuid)
returns table (apartado_id uuid, separacion_id uuid, separacion_codigo text)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select a.id, s.id, s.codigo
    from retail.apartados a
    join retail.separaciones s
      on s.id = coalesce(a.separacion_id, (select si.separacion_id from retail.separacion_items si where si.apartado_id = a.id limit 1))
   where a.ubicacion_id = p_ubicacion_id
     and a.estado = 'abierto'
     and coalesce(retail.fn_puede_operar_ubicacion(p_ubicacion_id), false);
$$;
revoke all on function retail.fn_apartados_de_separaciones(uuid) from public, anon;
grant execute on function retail.fn_apartados_de_separaciones(uuid) to authenticated;

-- (d) El vencimiento de los apartados con adelanto de una sede, cada uno aislado. La regla (2 días de gracia, lo que una caja está
--     entregando se salta) es la de 20261016003000, sin cambios.
create or replace function retail.fn_vencer_separaciones_resumen(p_ubicacion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c_gracia_dias constant integer := 2;
  v_hoy date := fn_hoy_lima();
  s separaciones%rowtype;
  v_ap uuid;
  v_n integer := 0;
  v_fallidas uuid[] := '{}';
begin
  for s in
    select * from separaciones
     where ubicacion_id = p_ubicacion_id and estado = 'abierta' and vence_el + c_gracia_dias < v_hoy
     order by vence_el
     for update skip locked            -- si una caja la está entregando ahora mismo, no se pisa
  loop
    -- Cada apartado en su propio bloque: si uno falla, se deshace solo ese (sus prendas siguen apartadas y él sigue abierto) y los
    -- demás vencen igual. Antes, uno trabado deshacía la corrida de todas las sedes (auditoría 2026-11-28, N.º 45).
    begin
      for v_ap in select apartado_id from separacion_items where separacion_id = s.id loop
        perform fn_cerrar_apartado_de_separacion(v_ap, 'clienta_no_vino', null);
      end loop;
      update separaciones
         set estado = 'liberada', liberada_en = now(), liberada_por = null, liberada_motivo = 'vencio'
       where id = s.id;
      v_n := v_n + 1;
    exception when others then
      -- relleno-a-proposito: ese apartado queda abierto y sin vencer hasta que alguien lo arregle; se avisa aquí (warning con su id) y
      -- en el resumen (`fallidas_ids`), que el cron manda a Sentry. Lleva id y código, nunca el nombre del cliente.
      raise warning 'Vencer apartados: el apartado % (id %) no se pudo vencer y sigue abierto: % [%]', s.codigo, s.id, sqlerrm, sqlstate;
      v_fallidas := v_fallidas || s.id;
    end;
  end loop;
  return jsonb_build_object('liberadas', v_n, 'fallidas', cardinality(v_fallidas), 'fallidas_ids', to_jsonb(v_fallidas));
end;
$$;
revoke all on function retail.fn_vencer_separaciones_resumen(uuid) from public, anon, authenticated;

-- La de siempre (la llaman la pantalla, vía `fn_vencer_separaciones`, y antes el barrido): misma firma, mismo número, ahora sin caerse.
create or replace function retail.fn_vencer_separaciones_de(p_ubicacion_id uuid)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  -- La regla vive en fn_vencer_separaciones_resumen; aquí solo se devuelve cuántos vencieron, como antes.
  return (retail.fn_vencer_separaciones_resumen(p_ubicacion_id) ->> 'liberadas')::integer;
end;
$$;
revoke all on function retail.fn_vencer_separaciones_de(uuid) from public, anon, authenticated;

-- El barrido diario (Vercel, `/api/apartados/vencer`), con la llave de servicio. Mismo alcance que 20261016003000; ahora cada apartado
-- (con adelanto o simple) va aislado y el resumen dice cuáles no se pudieron vencer.
create or replace function retail.fn_vencer_apartados_de_todas()
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c_gracia_dias constant integer := 2;
  v_hoy date := fn_hoy_lima();
  v_ub uuid;
  v_r jsonb;
  v_sep integer := 0;
  v_sep_fallidas jsonb := '[]'::jsonb;
  v_simples integer := 0;
  v_simples_fallidos uuid[] := '{}';
  v_ap uuid;
begin
  for v_ub in
    select distinct s.ubicacion_id from separaciones s
     where s.estado = 'abierta' and s.vence_el + c_gracia_dias < v_hoy
     order by 1
  loop
    v_r := retail.fn_vencer_separaciones_resumen(v_ub);
    v_sep := v_sep + (v_r ->> 'liberadas')::integer;
    v_sep_fallidas := v_sep_fallidas || (v_r -> 'fallidas_ids');
  end loop;

  for v_ap in
    select a.id from apartados a
     where a.estado = 'abierto' and a.vence_el is not null and a.vence_el + c_gracia_dias < v_hoy
       and a.separacion_id is null and a.venta_id is null
       and not exists (select 1 from separacion_pedidos sp where sp.apartado_id = a.id or sp.apartado_origen_id = a.id)
       and not exists (select 1 from pedido_web_lineas l where l.apartado_id = a.id)
     order by a.vence_el, a.id
     for update skip locked
  loop
    begin
      perform fn_cerrar_apartado_de_separacion(v_ap, 'clienta_no_vino', null);
      v_simples := v_simples + 1;
    exception when others then
      -- relleno-a-proposito: ese apartado simple queda abierto hasta la próxima corrida o hasta que alguien lo libere; se avisa
      -- aquí (warning con su id) y en el resumen (`simples_fallidos_ids`), que el cron manda a Sentry.
      raise warning 'Vencer apartados: el apartado simple % no se pudo vencer y sigue abierto: % [%]', v_ap, sqlerrm, sqlstate;
      v_simples_fallidos := v_simples_fallidos || v_ap;
    end;
  end loop;

  return jsonb_build_object(
    'apartados_con_adelanto', v_sep,
    'apartados_simples', v_simples,
    'fallidas', jsonb_array_length(v_sep_fallidas) + cardinality(v_simples_fallidos),
    'fallidas_ids', v_sep_fallidas,
    'simples_fallidos_ids', to_jsonb(v_simples_fallidos));
end;
$$;
revoke all on function retail.fn_vencer_apartados_de_todas() from public, anon, authenticated;
grant execute on function retail.fn_vencer_apartados_de_todas() to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'tienda_web') then
    revoke all on function retail.fn_vencer_apartados_de_todas() from tienda_web;
    revoke all on function retail.fn_vencer_separaciones_de(uuid) from tienda_web;
    revoke all on function retail.fn_vencer_separaciones_resumen(uuid) from tienda_web;
    revoke all on function retail.fn_apartados_de_separaciones(uuid) from tienda_web;
  end if;
end $$;

reset lock_timeout;
