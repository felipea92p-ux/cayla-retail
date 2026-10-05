-- ============================================================================
-- 20261005130100_pedidos_que_no_se_pierden_parte2_pedidos.sql — CAYLA V2 · ADR-0328, actividad 17 (Felipe, 2026-10-04)
-- Traslados: pedidos que no se pierden · PARTE 2 de 3: el pedido para un cliente se aparta en la sede que lo tiene.
--
-- EL PROBLEMA PRIMERO. Pedir una prenda a otra sede para un cliente (ADR-0233) no reservaba nada en esa sede: la caja de
-- allá podía venderla mientras el pedido esperaba, y nadie sabía si el pedido llevaba dos horas o tres días sin respuesta.
-- Felipe (ADR-0328, actividad 17): «la asesora pide y aparta la prenda de otra sede para el cliente que la espera; allá
-- la apartan; viaja en el próximo envío; se avisa al cliente al llegar», y los pedidos sin respuesta avisan a los líderes
-- de las dos tiendas a las 48 h.
--
-- QUÉ HACE.
--   · `pedir_prenda_para_apartar` (reemplazo ANCLADO, no se reescribe): además de Apartados la acepta Vender (desde «Dónde
--     más hay» la pide la asesora, que no siempre tiene Apartados); toma el candado del stock del ORIGEN antes de mirar lo
--     disponible (ADR-0190) y, al guardar el pedido, lo APARTA allá (`fn_reservar_pedido_en_origen`): almacén primero
--     (de ahí sale un traslado), si no el piso. Todo en la misma transacción: o queda pedido Y apartado, o nada.
--   · `enviar_pedido_para_apartar` (anclado): suelta esa reserva justo antes del traslado. Si alguien la había liberado a
--     mano, primero la vuelve a apartar (almacén primero). Si la prenda apartada está COLGADA, no la manda: «primero
--     súbela al almacén» (Felipe: lo colgado se envía en dos pasos), con su pista `pedido_en_piso`. Alrededor de su
--     `iniciar_traslado` pone y borra la marca `retail.salida_de_pedido_cliente` (local a la transacción): esa caja lleva la
--     prenda apartada para el cliente y no descuenta la lista «Para enviar» (parte 3).
--   · `subir_pedido_al_almacen` (nueva): el primer paso para un pedido colgado. Suelta la reserva del piso, sube la prenda
--     al almacén y la vuelve a apartar allí, en una transacción. Idempotente por estado: repetirla no sube dos veces. La
--     ofrecen Traslados y Apartados (donde vive su botón, ADR-0306) y Existencias.
--   · `cancelar_pedido_para_apartar` (anclado): «No la tengo» o «ya no la quiere» sueltan también la reserva del origen, y
--     desde ahora exigen ver Traslados, Apartados o Vender (antes bastaba operar una de las dos sedes, sin ningún módulo).
--   · La reserva se cierra con su propia nota en el libro (`fn_cerrar_reserva_de_pedido`): «sale en traslado hacia…»,
--     «se canceló el pedido…», «se sube al almacén…». No «se entrega a la clienta»: allá nadie la entregó, y el libro de
--     movimientos no se corrige después.
--   · `anular_traslado` (anclado): el pedido que viajaba vuelve a esperar Y se vuelve a apartar en el origen (la prenda
--     regresó a su almacén con la anulación). Si no se pudiera apartar, el pedido vuelve igual y la pantalla lo dice.
--   · `marcar_pedido_avisado` (nueva): la sede que pidió deja constancia de que le avisó al cliente cómo terminó: que
--     llegó o, desde el 2026-10-04, que no va a llegar.
--   · «No llegó» (decisión del 2026-10-04): cuando la otra sede dice «No la tengo» o el envío se cierra sin la prenda, la
--     tienda que pidió se entera en Vender y en su Inicio, con «Avisar al cliente que no llegó». Para eso el pedido guarda
--     de qué lado se cerró (`cancelado_desde`, parte 1): `cancelar_pedido_para_apartar` (anclado) lo anota con
--     `fn_lado_del_pedido` (la sede DESDE la que se opera, ADR-0292) y el disparador `trg_pedidos_al_llegar` (anclado)
--     anota 'traslado'. Lo que la tienda que pidió canceló ('pidio') no pide aviso: fue su decisión con el cliente.
--   · La reserva en el origen NO VENCE SOLA y la otra sede no conoce al cliente (decisión del 2026-10-04): se aparta SIN
--     fecha, a nombre de «Pedido de Trujillo» y con la tienda que pidió como contacto; ningún movimiento del libro de esa
--     sede lleva el nombre del cliente, y `fn_pedidos_con_cliente` no se lo da a la sede que envía. A los 7 días (desde que
--     se pidió o desde el último «Sí») se le pregunta a la tienda que pidió «¿sigue en pie?»: `confirmar_pedido_sigue_en_pie`
--     (nueva) guarda el «Sí»; «Cancelar» es el `cancelar_pedido_para_apartar` de siempre.
--   · Lecturas (prefijo `fn_`: el loader las trata como lectura): `fn_pedidos_por_atender` (liviana, para el número del
--     menú y el aviso de 48 h) y `fn_pedidos_con_cliente` (Traslados y Vender: los pedidos para un cliente con la prenda,
--     dónde está apartada en el origen y si ya se avisó).
--
-- CONTRATO DE LA RESERVA. PROMETE: mientras un pedido para un cliente está «pedido», su prenda está apartada en el origen
-- (salvo que alguien la libere a mano), sin fecha de vencimiento y sin el nombre del cliente. ASUME: el pedido es entre
-- tiendas y de UNA prenda (ADR-0233); quien sostiene el pedido es la tienda que pidió (se le pregunta a los 7 días).
--
-- ESTADO QUE DEJA DE SER POSIBLE: un pedido para un cliente esperando mientras la otra sede vende su prenda.
--
-- POR QUÉ ANCLADO. Las cuatro funciones existentes viven en producción y pudieron recibir parches; reescribirlas desde un
-- archivo los borraría. `pg_temp.anclar` cambia un texto que debe aparecer UNA sola vez y ABORTA si no (el cuerpo vivo
-- cambió: hay que regenerar el reemplazo); si el texto nuevo ya está, no hace nada (re-pegable). Ningún ancla contiene
-- `select … into` (ADR-0288: el SQL Editor lo confunde con un SELECT INTO que crea tabla).
--
-- CÓMO SE PEGA EN PRODUCCIÓN. DESPUÉS de la parte 1 (usa sus columnas) y ANTES de fusionar la web. Solo funciones:
-- `create or replace function`, `comment`, `revoke`, `grant`; ninguna política, ningún `alter table`, ningún `drop trigger`
-- (ADR-0195). Idempotente. Cómo se verifica después:
--   select proname from pg_proc where pronamespace = 'retail'::regnamespace and proname in
--     ('fn_reservar_pedido_en_origen', 'fn_cerrar_reserva_de_pedido', 'fn_soltar_reserva_de_origen', 'subir_pedido_al_almacen',
--      'marcar_pedido_avisado', 'fn_pedidos_por_atender', 'fn_pedidos_con_cliente', 'fn_pedidos_vuelven_a_esperar',
--      'fn_lado_del_pedido', 'confirmar_pedido_sigue_en_pie');   -- 10 filas
--   select position('fn_reservar_pedido_en_origen' in prosrc) > 0 from pg_proc where proname = 'pedir_prenda_para_apartar';
--   select position('fn_reservar_pedido_en_origen' in prosrc) > 0 from pg_proc where proname = 'enviar_pedido_para_apartar';
--   select position('Traslados, Apartados ni Vender' in prosrc) > 0 from pg_proc where proname = 'cancelar_pedido_para_apartar';
--   select position('fn_lado_del_pedido' in prosrc) > 0 from pg_proc where proname = 'cancelar_pedido_para_apartar';
--   select position('cancelado_desde = ''traslado''' in prosrc) > 0 from pg_proc where proname = 'trg_pedidos_al_llegar';
--
-- SE ROMPE SI alguien vuelve a pegar 20260927140000, 20260927160000 o 20260927210000 (recrean pedir/enviar/cancelar y el
-- disparador de llegada desde el archivo y borran las anclas: el pedido dejaría de apartar en el origen, y un «No la tengo»
-- dejaría de avisarse a la tienda que pidió), o si el CHECK de `apartados.cierre_motivo` deja de aceptar 'otro' (la
-- reserva de un pedido se cierra con ese motivo y su nota). Y un líder que cancela un pedido parado en una TERCERA sede
-- (solo por la API: la web lo muestra solo en las dos sedes del pedido) queda anotado como 'envia': la tienda que pidió
-- recibe un aviso de más, que es mejor que un cliente al que nadie le avisa.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Guarda: «de qué lado se cerró» lee la sede desde la que se opera (ADR-0292, 20260930170000). Sin ella, cancelar fallaría
-- recién en la tienda, al primer «No la tengo». Mejor no pegar nada.
do $g$
begin
  if to_regprocedure('retail.fn_ubicacion_de_la_operacion()') is null then
    raise exception 'Falta retail.fn_ubicacion_de_la_operacion() (20260930170000, ADR-0292): pégala antes que esta parte';
  end if;
end
$g$;

-- Reemplazo anclado: si el texto nuevo ya está, no hace nada; si el viejo no aparece EXACTAMENTE una vez, aborta.
create or replace function pg_temp.anclar(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición viva.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------------------------------------------------------------------------
-- 1. Apartar en el origen (interna: la llaman pedir, subir y anular; nadie desde la web)
-- ---------------------------------------------------------------------------
-- PROMETE: deja la prenda del pedido apartada en la sede que la tiene y devuelve el apartado (el mismo si ya estaba).
-- ASUME: el pedido es para un cliente y sigue «pedido»; quien llama ya validó permisos. Si nada alcanza, aborta.
-- p_sububicacion_id: obliga el lugar (subir al almacén lo usa); null = almacén primero, después el piso.
create or replace function retail.fn_reservar_pedido_en_origen(p_pedido_id uuid, p_sububicacion_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  pe separacion_pedidos%rowtype;
  v_sub uuid;
  v_hay boolean := false;
  v_mov uuid;
  v_ap uuid;
  v_persona uuid;
  v_sede text;
  r record;
begin
  select * into pe from separacion_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido no existe';
  end if;
  if pe.clienta_nombres is null then
    raise exception 'Solo un pedido para un cliente se aparta en la otra sede';
  end if;
  if pe.estado <> 'pedido' then
    return null;
  end if;
  if pe.apartado_origen_id is not null and exists (select 1 from apartados where id = pe.apartado_origen_id and estado = 'abierto') then
    return pe.apartado_origen_id;
  end if;

  -- ADR-0190: el stock de esa prenda en el origen, antes de mirar cuánto queda libre.
  perform fn_bloquear_en_orden(pe.ubicacion_origen_id, array[pe.variante_id]);

  -- Dónde: el almacén primero (un traslado sale de ahí), después el piso, y en una sede sin piso ni almacén, la fila sin
  -- lugar. Nunca Cuarentena ni otro lugar que no se vende.
  for r in
    select st.sububicacion_id
      from stock st
      left join sububicaciones s on s.id = st.sububicacion_id
     where st.variante_id = pe.variante_id
       and st.ubicacion_id = pe.ubicacion_origen_id
       and st.cantidad - st.cantidad_apartada >= pe.cantidad
       and (s.id is null or s.tipo in ('almacen_tienda', 'piso_venta'))
       and (p_sububicacion_id is null or st.sububicacion_id = p_sububicacion_id)
     order by case s.tipo when 'almacen_tienda' then 0 when 'piso_venta' then 1 else 2 end
     limit 1
  loop
    v_sub := r.sububicacion_id;
    v_hay := true;
  end loop;
  if not v_hay then
    raise exception '% ya no tiene libre esa prenda para apartarla para el cliente',
      coalesce((select nombre from ubicaciones where id = pe.ubicacion_origen_id), 'La otra sede')
      using hint = 'pedido_sin_stock_en_origen';
  end if;

  v_persona := fn_actor_persona_id(true);
  v_sede := coalesce((select nombre from ubicaciones where id = pe.ubicacion_id), 'otra sede');

  -- La reserva de siempre (ADR-0141): el movimiento «apartado» (que rechaza si no hay disponible) y su fila de apartados.
  -- Decisión del 2026-10-04: la sede que GUARDA la prenda no conoce al cliente (privacidad) y la reserva no vence sola. El
  -- apartado va a nombre de «Pedido de Trujillo», con la tienda que pidió como contacto y SIN fecha: la sostiene la tienda
  -- que pidió, a la que se le pregunta a los 7 días si sigue en pie. Ni el libro ni el Apartados de aquí llevan el nombre.
  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, nota)
    values (pe.variante_id, pe.ubicacion_origen_id, v_sub, 'apartado', pe.cantidad, 'apartado', v_persona,
            left('Apartado para un pedido de ' || v_sede || ': viaja en el próximo envío', 500))
    returning id into v_mov;
  perform fn_aplicar_movimiento(v_mov);

  insert into apartados (variante_id, ubicacion_id, sububicacion_id, cantidad, clienta_nombre, clienta_contacto, nota,
                         vence_el, creado_por, movimiento_id)
    values (pe.variante_id, pe.ubicacion_origen_id, v_sub, pe.cantidad, left('Pedido de ' || v_sede, 200), v_sede,
            'Viaja en el próximo envío. No vence: lo sostiene la tienda que pidió', null, v_persona, v_mov)
    returning id into v_ap;

  update separacion_pedidos set apartado_origen_id = v_ap where id = pe.id;
  return v_ap;
end;
$$;
revoke all on function retail.fn_reservar_pedido_en_origen(uuid, uuid) from public, anon, authenticated;

comment on function retail.fn_reservar_pedido_en_origen(uuid, uuid) is
  'ADR-0328 act. 17 (interna): aparta en la sede que ENVÍA la prenda de un pedido para un cliente («allá la apartan»). Almacén primero, después el piso. Sin fecha de vencimiento y a nombre de «Pedido de <sede que pidió>», sin el cliente (2026-10-04). Devuelve el apartado (el mismo si ya estaba abierto); null si el pedido ya no espera. Aborta (hint pedido_sin_stock_en_origen) si no alcanza.';

-- ---------------------------------------------------------------------------
-- 2. Cerrar y soltar la reserva del origen (internas: enviar, cancelar y subir al almacén)
-- ---------------------------------------------------------------------------
-- PROMETE: cierra el apartado abierto de la reserva de un pedido con un movimiento «liberación» cuya nota dice de qué
-- pedido era y qué pasó («Pedido de Tienda Trujillo: sale en el traslado»; nunca el nombre del cliente, 2026-10-04) y
-- `cierre_motivo` 'otro'; devuelve el movimiento.
-- ASUME: quien llama ya tomó el stock (fn_bloquear_en_orden) y el apartado sigue abierto; si no, aborta.
-- Por qué no `fn_cerrar_apartado_de_separacion`: su nota es la de una separación («se entrega a la clienta»), que aquí
-- sería falsa, y el libro de movimientos es append-only: no se corrige después.
create or replace function retail.fn_cerrar_reserva_de_pedido(p_apartado_id uuid, p_nota text, p_persona uuid)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  a apartados%rowtype;
  v_mov uuid;
begin
  select * into a from apartados where id = p_apartado_id for update;
  if not found or a.estado <> 'abierto' then
    raise exception 'La reserva % ya no está abierta: el pedido quedó inconsistente', p_apartado_id;
  end if;
  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, nota)
    values (a.variante_id, a.ubicacion_id, a.sububicacion_id, 'liberacion_apartado', a.cantidad, 'liberacion_apartado', p_persona,
            left(a.clienta_nombre || ': ' || p_nota, 500))
    returning id into v_mov;
  perform fn_aplicar_movimiento(v_mov);
  update apartados
     set estado = 'liberado', cerrado_por = p_persona, cerrado_en = now(), cierre_motivo = 'otro', movimiento_cierre_id = v_mov
   where id = a.id;
  return v_mov;
end;
$$;
revoke all on function retail.fn_cerrar_reserva_de_pedido(uuid, text, uuid) from public, anon, authenticated;

-- PROMETE: si el pedido tiene una reserva abierta en el origen, la suelta (movimiento «liberación» incluido); si no, nada.
-- Con p_para_enviar, se niega si la prenda apartada está colgada: lo colgado se sube primero (Felipe, dos pasos).
-- ASUME: quien llama tiene tomada la fila del pedido.
create or replace function retail.fn_soltar_reserva_de_origen(p_pedido_id uuid, p_para_enviar boolean)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  pe separacion_pedidos%rowtype;
  a apartados%rowtype;
  v_salida uuid;
begin
  select * into pe from separacion_pedidos where id = p_pedido_id;
  if not found or pe.apartado_origen_id is null then
    return;
  end if;
  -- ADR-0190: stock primero, después la fila del apartado.
  perform fn_bloquear_en_orden(pe.ubicacion_origen_id, array[pe.variante_id]);
  select * into a from apartados where id = pe.apartado_origen_id for update;
  if not found or a.estado <> 'abierto' then
    return;   -- alguien la liberó a mano: no hay nada que soltar
  end if;
  if p_para_enviar then
    v_salida := fn_sububicacion_por_defecto(pe.ubicacion_origen_id, 'traslado_salida');
    if v_salida is not null and a.sububicacion_id is distinct from v_salida then
      raise exception 'La prenda está colgada en el piso: primero súbela al almacén y después envíala'
        using hint = 'pedido_en_piso';
    end if;
  end if;
  perform fn_cerrar_reserva_de_pedido(a.id, case when p_para_enviar then 'sale en el traslado' else 'se canceló el pedido' end,
                                      fn_actor_persona_id(true));
end;
$$;
revoke all on function retail.fn_soltar_reserva_de_origen(uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Cuando se anula el traslado, el pedido vuelve a esperar y se vuelve a apartar (interna: anular_traslado)
-- ---------------------------------------------------------------------------
-- PROMETE: cada pedido que viajaba en ese traslado vuelve a «pedido» sin traslado y, si es para un cliente, se vuelve a
-- apartar en el origen. ASUME: la anulación ya devolvió la prenda al almacén del origen (anular_traslado). Si apartar
-- falla, NO frena la anulación: el pedido vuelve igual sin reserva (aviso en el log) y la lectura dice «sin_reserva».
create or replace function retail.fn_pedidos_vuelven_a_esperar(p_transferencia_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  pe separacion_pedidos%rowtype;
begin
  for pe in
    select * from separacion_pedidos
     where transferencia_id = p_transferencia_id and estado = 'en_camino'
     order by id
     for update
  loop
    -- ADR-0233 (como antes): el pedido que iba en este envío vuelve a esperar que lo envíen, con otro traslado.
    update separacion_pedidos set estado = 'pedido', transferencia_id = null, enviado_por = null where id = pe.id;
    -- ADR-0328 act. 17: y se vuelve a apartar allá (la prenda acaba de regresar a su almacén). Si no se pudiera, el
    -- pedido vuelve igual: la anulación no se frena por la reserva, y «Te piden» dice que no está apartada.
    if pe.clienta_nombres is not null then
      begin
        perform fn_reservar_pedido_en_origen(pe.id);
      exception when others then
        raise warning 'pedido %: volvió a esperar pero no se pudo apartar en el origen (%)', pe.id, sqlerrm;
      end;
    end if;
  end loop;
end;
$$;
revoke all on function retail.fn_pedidos_vuelven_a_esperar(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3b. De qué lado está quien cierra un pedido (interna: la usa cancelar; decisión del 2026-10-04)
-- ---------------------------------------------------------------------------
-- PROMETE: 'envia' si quien opera está en la sede que tiene la prenda, 'pidio' si está en la que la pidió. Lo que ya llegó
-- solo lo suelta la tienda que pidió ('pidio'). «Dónde está» es la sede DESDE la que se opera (`fn_ubicacion_de_la_operacion`,
-- ADR-0292: la de la terminal; la de `x-ubicacion` si la cuenta la puede operar; si no, la de partida): la misma que firma
-- la operación. ASUME: el pedido existe. Si la sede de la operación no es ninguna de las dos (un líder parado en una tercera,
-- solo por la API), decide por lo que la cuenta puede operar; si puede las dos, 'envia': a la tienda que pidió le llega un
-- aviso de más, que es mejor que un cliente al que nadie le avisa.
create or replace function retail.fn_lado_del_pedido(p_pedido_id uuid)
returns text
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case
           when pe.estado = 'llego' then 'pidio'
           when op.sede = pe.ubicacion_origen_id then 'envia'
           when op.sede = pe.ubicacion_id then 'pidio'
           when fn_puede_operar_ubicacion(pe.ubicacion_id) and not fn_puede_operar_ubicacion(pe.ubicacion_origen_id) then 'pidio'
           else 'envia'
         end
    from separacion_pedidos pe
   cross join (select fn_ubicacion_de_la_operacion() as sede) op
   where pe.id = p_pedido_id;
$$;
revoke all on function retail.fn_lado_del_pedido(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Las anclas sobre las funciones vivas
-- ---------------------------------------------------------------------------
-- 4a. Pedir: también desde Vender (la asesora que atiende), con el candado del origen y la reserva allá.
select pg_temp.anclar(
  'retail.pedir_prenda_para_apartar(uuid, uuid, uuid, integer, text, text, text, text, uuid)',
  $v$  if not fn_ve_modulo('apartados') then
    raise exception 'Tu rol no tiene el módulo Apartados' using errcode = '42501';$v$,
  $n$  -- ADR-0190 (ADR-0328 act. 17): un doble clic de verdad simultáneo espera al primero y devuelve SU pedido, en vez de
  -- chocar con la reserva que el primero acaba de hacer en el origen y avisar un error de algo que sí se guardó.
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('separacion_pedidos:' || p_token::text, 0));
    v_id := (select x.id from separacion_pedidos x where x.token_cliente = p_token);
    if v_id is not null then
      return v_id;
    end if;
  end if;
  if not (fn_ve_modulo('apartados') or fn_ve_modulo('vender')) then
    raise exception 'Tu rol no tiene Vender ni Apartados' using errcode = '42501';$n$
);
select pg_temp.anclar(
  'retail.pedir_prenda_para_apartar(uuid, uuid, uuid, integer, text, text, text, text, uuid)',
  $v$  if not exists (select 1 from variantes where id = p_variante_id and activo) then
    raise exception 'Esa prenda no existe o está descontinuada';
  end if;$v$,
  $n$  if not exists (select 1 from variantes where id = p_variante_id and activo) then
    raise exception 'Esa prenda no existe o está descontinuada';
  end if;
  -- ADR-0328 act. 17 (ADR-0190): el stock del origen queda tomado antes de mirar lo disponible y de apartarlo allá.
  perform fn_bloquear_en_orden(p_origen_id, array[p_variante_id]);$n$
);
select pg_temp.anclar(
  'retail.pedir_prenda_para_apartar(uuid, uuid, uuid, integer, text, text, text, text, uuid)',
  $v$  end;
  return v_id;
end;$v$,
  $n$  end;
  -- ADR-0328 act. 17: «allá la apartan». En la misma transacción: o queda pedido y apartado, o nada.
  perform fn_reservar_pedido_en_origen(v_id);
  return v_id;
end;$n$
);

-- 4b. Enviar: suelta la reserva justo antes del traslado (o se niega si está colgada).
select pg_temp.anclar(
  'retail.enviar_pedido_para_apartar(uuid, timestamptz, uuid)',
  $v$  v_tr := iniciar_traslado($v$,
  $n$  -- ADR-0328 act. 17: la reserva del origen se suelta para que el traslado se lleve ESA prenda. Si alguien la liberó a
  -- mano, primero se vuelve a apartar (almacén primero): si lo único libre está colgado, el freno de abajo lo dice con su
  -- pista (pedido_en_piso) en vez de un «Stock insuficiente» que nadie entiende. Y esa caja lleva la prenda apartada para
  -- el cliente, no una subida «para enviar» al mismo destino: la marca le dice al disparador de esa lista que no
  -- descuente nada (parte 3), y se borra apenas sale el traslado.
  perform fn_reservar_pedido_en_origen(pe.id);
  perform fn_soltar_reserva_de_origen(pe.id, true);
  perform set_config('retail.salida_de_pedido_cliente', 'si', true);
  v_tr := iniciar_traslado($n$
);
select pg_temp.anclar(
  'retail.enviar_pedido_para_apartar(uuid, timestamptz, uuid)',
  $v$  v_persona := fn_actor_persona_id(true);
  update separacion_pedidos set estado = 'en_camino', transferencia_id = v_tr, enviado_por = v_persona where id = pe.id;$v$,
  $n$  perform set_config('retail.salida_de_pedido_cliente', '', true);
  v_persona := fn_actor_persona_id(true);
  update separacion_pedidos set estado = 'en_camino', transferencia_id = v_tr, enviado_por = v_persona where id = pe.id;$n$
);

-- 4c. Cancelar: «No la tengo» / «ya no la quiere» sueltan también la reserva del origen (y exigen un módulo del pedido).
select pg_temp.anclar(
  'retail.cancelar_pedido_para_apartar(uuid, text)',
  $v$  if pe.apartado_id is not null and exists (select 1 from apartados where id = pe.apartado_id and estado = 'abierto') then$v$,
  $n$  -- ADR-0328 act. 17: cancelar ahora suelta también la prenda apartada en la otra sede. Lo hace quien ve un módulo donde
  -- vive el pedido (Traslados, Apartados o Vender: los que piden o envían), no cualquier cuenta que opere una de las sedes.
  if not (fn_ve_modulo('traslados') or fn_ve_modulo('apartados') or fn_ve_modulo('vender')) then
    raise exception 'Tu rol no tiene Traslados, Apartados ni Vender' using errcode = '42501';
  end if;
  -- Si todavía no salió, la prenda apartada en el origen vuelve a estar libre allá.
  perform fn_soltar_reserva_de_origen(pe.id, false);
  if pe.apartado_id is not null and exists (select 1 from apartados where id = pe.apartado_id and estado = 'abierto') then$n$
);
-- …y anota de qué lado se cerró (decisión del 2026-10-04): si fue la sede que la tenía («No la tengo»), la tienda que
-- pidió le avisa al cliente que no llegó.
select pg_temp.anclar(
  'retail.cancelar_pedido_para_apartar(uuid, text)',
  $v$  update separacion_pedidos
     set estado = 'cancelado', cancelado_por = v_persona, cancelado_motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = pe.id;$v$,
  $n$  update separacion_pedidos
     set estado = 'cancelado', cancelado_por = v_persona, cancelado_motivo = nullif(btrim(coalesce(p_motivo, '')), ''),
         cancelado_desde = fn_lado_del_pedido(pe.id)   -- ADR-0328 act. 17: «envia» = la tienda que pidió le avisa al cliente
   where id = pe.id;$n$
);

-- 4d. Anular el traslado: el pedido vuelve a esperar y se vuelve a apartar.
select pg_temp.anclar(
  'retail.anular_traslado(uuid, text, uuid)',
  $v$  update separacion_pedidos
     set estado = 'pedido', transferencia_id = null, enviado_por = null
   where transferencia_id = p_transferencia_id and estado = 'en_camino';$v$,
  $n$  perform fn_pedidos_vuelven_a_esperar(p_transferencia_id);   -- ADR-0328 act. 17: vuelve a esperar y se vuelve a apartar$n$
);

-- 4e. El envío se cerró sin la prenda (decisión del 2026-10-04): el pedido queda cancelado DESDE EL TRASLADO, y la tienda
--     que pidió le avisa al cliente que no llegó. Una reposición cancelada así también lo anota (nadie le avisa a nadie:
--     no tiene cliente).
select pg_temp.anclar(
  'retail.trg_pedidos_al_llegar()',
  $v$     set estado = 'cancelado', cancelado_motivo = 'La prenda no llegó en el traslado'$v$,
  $n$     set estado = 'cancelado', cancelado_motivo = 'La prenda no llegó en el traslado', cancelado_desde = 'traslado'$n$
);

-- ---------------------------------------------------------------------------
-- 5. Subir al almacén la prenda colgada de un pedido (el primer paso de dos)
-- ---------------------------------------------------------------------------
-- PROMETE: la prenda apartada para el pedido pasa del piso al almacén y queda apartada ahí, todo o nada. Si ya estaba en
-- el almacén, no hace nada (devuelve ya_estaba = true): repetirla no sube dos veces.
-- ASUME: la sede que la tiene separa piso y almacén; la llama quien opera esa sede, con Traslados, Apartados o Existencias
-- (el botón vive en Traslados y en Apartados: quien ve el módulo hace lo que hay en él, ADR-0306).
create or replace function retail.subir_pedido_al_almacen(p_pedido_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  pe separacion_pedidos%rowtype;
  a apartados%rowtype;
  v_piso uuid;
  v_alm uuid;
  v_persona uuid;
  v_sede text;
begin
  select * into pe from separacion_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido no existe';
  end if;
  if pe.clienta_nombres is null then
    raise exception 'Ese pedido es una reposición: se envía entero desde Traslados';
  end if;
  if not (fn_ve_modulo('traslados') or fn_ve_modulo('apartados') or fn_ve_modulo('existencias')) then
    raise exception 'Tu rol no tiene Traslados, Apartados ni Existencias' using errcode = '42501';
  end if;
  if not fn_puede_operar_ubicacion(pe.ubicacion_origen_id) then
    raise exception 'La sube la sede que tiene la prenda' using errcode = '42501';
  end if;
  if pe.estado <> 'pedido' then
    raise exception 'Ese pedido ya no espera que lo envíen (está %)', pe.estado;
  end if;
  v_piso := fn_sububicacion_por_defecto(pe.ubicacion_origen_id, 'venta');
  v_alm := fn_sububicacion_por_defecto(pe.ubicacion_origen_id, 'traslado_salida');
  if v_piso is null or v_alm is null then
    raise exception 'Esta sede no separa piso y almacén: el pedido se envía directo';
  end if;

  -- Sin reserva abierta (la liberaron a mano), se aparta primero donde esté.
  if pe.apartado_origen_id is null or not exists (select 1 from apartados where id = pe.apartado_origen_id and estado = 'abierto') then
    perform fn_reservar_pedido_en_origen(pe.id);
    select * into pe from separacion_pedidos where id = p_pedido_id;
  end if;
  perform fn_bloquear_en_orden(pe.ubicacion_origen_id, array[pe.variante_id]);
  select * into a from apartados where id = pe.apartado_origen_id for update;
  if a.sububicacion_id = v_alm then
    return jsonb_build_object('ya_estaba', true);
  end if;
  if a.sububicacion_id is distinct from v_piso then
    raise exception 'La prenda apartada no está en el piso ni en el almacén: revísala en Existencias';
  end if;

  v_persona := fn_actor_persona_id(true);
  v_sede := coalesce((select nombre from ubicaciones where id = pe.ubicacion_id), 'otra sede');
  -- Suelta la reserva del piso, sube la prenda y la vuelve a apartar en el almacén: nunca queda libre en medio.
  perform fn_cerrar_reserva_de_pedido(a.id, 'se sube al almacén para enviarla', v_persona);
  perform mover_interno(pe.ubicacion_origen_id, pe.variante_id, a.cantidad, v_piso, v_alm,
                        left('Pedido de ' || v_sede || ': se sube al almacén para enviarlo', 500));
  update separacion_pedidos set apartado_origen_id = null where id = pe.id;
  perform fn_reservar_pedido_en_origen(pe.id, v_alm);
  return jsonb_build_object('ya_estaba', false);
end;
$$;

comment on function retail.subir_pedido_al_almacen(uuid) is
  'ADR-0328 act. 17: primer paso para enviar un pedido cuya prenda está colgada en el origen. Suelta la reserva del piso, sube la prenda al almacén y la vuelve a apartar ahí, todo o nada. Traslados, Apartados o Existencias + operar el origen. Sin reserva (la liberaron a mano), la vuelve a apartar primero. Idempotente por estado (ya_estaba).';

-- ---------------------------------------------------------------------------
-- 6. Avisar al cliente cómo terminó su pedido: que llegó, o que no va a llegar
-- ---------------------------------------------------------------------------
-- PROMETE: deja la hora y quién le avisó al cliente; repetirla («Avisar otra vez») pisa la hora y quién: guarda el ÚLTIMO
-- aviso, no la historia (si Felipe la quiere, va en filas como `separacion_avisos`, ADR-0227). ASUME: el pedido ya llegó
-- o se cerró sin la prenda por la otra sede o el envío (decisión del 2026-10-04: también se le avisa que no llegó), y
-- quien avisa opera la sede que pidió, con Vender o Apartados.
create or replace function retail.marcar_pedido_avisado(p_pedido_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  pe separacion_pedidos%rowtype;
  v_en timestamptz := now();
begin
  select * into pe from separacion_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido no existe';
  end if;
  if pe.clienta_nombres is null then
    raise exception 'Ese pedido no es para un cliente';
  end if;
  if not (fn_ve_modulo('vender') or fn_ve_modulo('apartados')) then
    raise exception 'Tu rol no tiene Vender ni Apartados' using errcode = '42501';
  end if;
  if not fn_puede_operar_ubicacion(pe.ubicacion_id) then
    raise exception 'Le avisa la sede que pidió la prenda' using errcode = '42501';
  end if;
  -- El mismo par que el CHECK separacion_pedidos_aviso_con_cliente_y_llegada, dicho en palabras de la tienda.
  if pe.llego_en is null and not (pe.estado = 'cancelado' and pe.cancelado_desde in ('envia', 'traslado')) then
    if pe.estado = 'cancelado' then
      raise exception 'Ese pedido lo dieron de baja aquí: no hay que avisarle al cliente que no llegó';
    end if;
    raise exception 'La prenda todavía no llegó';
  end if;
  update separacion_pedidos set avisado_en = v_en, avisado_por = fn_actor_persona_id(true) where id = pe.id;
  return v_en;
end;
$$;

comment on function retail.marcar_pedido_avisado(uuid) is
  'ADR-0328 act. 17: la sede que pidió deja constancia de que le avisó al cliente cómo terminó su pedido (avisado_en, avisado_por): que llegó, o que no va a llegar (la otra sede no la tenía o el envío se cerró sin ella). Vender o Apartados + operar la sede que pidió.';

-- ---------------------------------------------------------------------------
-- 6b. «¿Sigue en pie?» (decisión del 2026-10-04): la tienda que pidió responde «Sí»
-- ---------------------------------------------------------------------------
-- PROMETE: guarda cuándo y quién dijo que el pedido sigue en pie; desde ahí se vuelven a contar 7 días hasta la próxima
-- pregunta (la cuenta la hace la web: `preguntarSiSigue`). No toca la reserva: sigue apartada allá, sin fecha. «No» es
-- `cancelar_pedido_para_apartar`, que la suelta. ASUME: el pedido es para un cliente y sigue esperando que lo envíen;
-- responde quien opera la sede que pidió, con Vender, Apartados o Traslados (los módulos donde vive el pedido).
create or replace function retail.confirmar_pedido_sigue_en_pie(p_pedido_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  pe separacion_pedidos%rowtype;
  v_en timestamptz := now();
begin
  select * into pe from separacion_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido no existe';
  end if;
  if pe.clienta_nombres is null then
    raise exception 'Ese pedido es una reposición: no hay cliente a quien preguntarle';
  end if;
  if not (fn_ve_modulo('vender') or fn_ve_modulo('apartados') or fn_ve_modulo('traslados')) then
    raise exception 'Tu rol no tiene Vender, Apartados ni Traslados' using errcode = '42501';
  end if;
  if not fn_puede_operar_ubicacion(pe.ubicacion_id) then
    raise exception 'Lo responde la sede que pidió la prenda' using errcode = '42501';
  end if;
  if pe.estado <> 'pedido' then
    raise exception 'Ese pedido ya no espera que lo envíen (está %)', pe.estado;
  end if;
  update separacion_pedidos set sigue_en_pie_en = v_en, sigue_en_pie_por = fn_actor_persona_id(true) where id = pe.id;
  return v_en;
end;
$$;

comment on function retail.confirmar_pedido_sigue_en_pie(uuid) is
  'ADR-0328 act. 17 (2026-10-04): la tienda que pidió una prenda a otra para un cliente dice que el pedido sigue en pie (se le pregunta a los 7 días; la reserva allá no vence sola). Guarda sigue_en_pie_en/por. Vender, Apartados o Traslados + operar la sede que pidió; solo mientras espera que lo envíen.';

-- ---------------------------------------------------------------------------
-- 7. Lecturas
-- ---------------------------------------------------------------------------
-- Lo que espera respuesta, liviano: una fila por pedido para un cliente y una por grupo de reposición, solo «pedido».
-- La usan el número del menú (lo que me piden) y el aviso de las 48 h (las dos direcciones).
create or replace function retail.fn_pedidos_por_atender(p_ubicacion_id uuid)
returns table (id uuid, direccion text, con_cliente boolean, created_at timestamptz, otra_sede text, otra_sede_id uuid, prendas integer)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(pe.grupo_id, pe.id),
         case when pe.ubicacion_origen_id = p_ubicacion_id then 'me_piden' else 'pedi' end,
         bool_or(pe.clienta_nombres is not null),
         min(pe.created_at),
         u.nombre,
         u.id,
         sum(pe.cantidad)::integer
    from separacion_pedidos pe
    join ubicaciones u on u.id = case when pe.ubicacion_origen_id = p_ubicacion_id then pe.ubicacion_id else pe.ubicacion_origen_id end
   where pe.estado = 'pedido'
     and (pe.ubicacion_id = p_ubicacion_id or pe.ubicacion_origen_id = p_ubicacion_id)
     and fn_puede_operar_ubicacion(p_ubicacion_id)
   group by coalesce(pe.grupo_id, pe.id), 2, u.nombre, u.id
   order by 4;
$$;

comment on function retail.fn_pedidos_por_atender(uuid) is
  'ADR-0328 act. 17: lo que espera respuesta entre sedes para p_ubicacion_id (me_piden / pedi), una fila por pedido para un cliente o por grupo de reposición, con su hora. Para el número del menú y el aviso de 48 h. Exige operar la sede.';

-- Los pedidos para un cliente de la sede, con la prenda, dónde está apartada en el origen y si ya se avisó. La sede que
-- ENVÍA no recibe el nombre ni el celular del cliente (decisión del 2026-10-04, privacidad): para ella es «un pedido de
-- Trujillo». Su forma cambió después de escrita (cancelado_desde y sigue_en_pie_en, 2026-10-04): se borra antes para que re-pegar esta parte no choque
-- con «cannot change return type» (`drop function` no toma los candados de auth/storage, ADR-0195).
drop function if exists retail.fn_pedidos_con_cliente(uuid);
create or replace function retail.fn_pedidos_con_cliente(p_ubicacion_id uuid)
returns table (
  id uuid, direccion text, otra_sede text, otra_sede_id uuid, variante_id uuid, producto text, color text, talla text,
  sku text, cantidad integer, cliente_nombres text, cliente_apellidos text, cliente_celular text, nota text, estado text,
  created_at timestamptz, creado_por_nombre text, llego_en timestamptz, guardada_hasta date, avisado_en timestamptz,
  reserva_en text, traslado_id uuid, traslado_numero integer, cancelado_motivo text, cancelado_desde text,
  sigue_en_pie_en timestamptz
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select pe.id,
         case when pe.ubicacion_id = p_ubicacion_id then 'pedi' else 'me_piden' end,
         u.nombre,
         u.id,
         pe.variante_id,
         p.referencia,
         co.nombre,
         ta.valor,
         coalesce(va.codigo, va.sku),
         pe.cantidad,
         -- El cliente solo lo ve la tienda que pidió: la que tiene la prenda guarda «un pedido de Trujillo».
         case when pe.ubicacion_id = p_ubicacion_id then pe.clienta_nombres end,
         case when pe.ubicacion_id = p_ubicacion_id then pe.clienta_apellidos end,
         case when pe.ubicacion_id = p_ubicacion_id then pe.clienta_celular end,
         pe.nota,
         pe.estado,
         pe.created_at,
         nullif(btrim(coalesce(per.nombres, '') || ' ' || coalesce(per.apellidos, '')), ''),
         pe.llego_en,
         ad.vence_el,
         pe.avisado_en,
         case
           when pe.estado <> 'pedido' then null
           when ao.id is null or ao.estado <> 'abierto' then 'sin_reserva'
           when so.tipo = 'almacen_tienda' then 'almacen'
           when so.tipo = 'piso_venta' then 'piso'
           else 'sin_lugar'
         end,
         pe.transferencia_id,
         t.numero,
         pe.cancelado_motivo,
         pe.cancelado_desde,
         pe.sigue_en_pie_en
    from separacion_pedidos pe
    join ubicaciones u on u.id = case when pe.ubicacion_id = p_ubicacion_id then pe.ubicacion_origen_id else pe.ubicacion_id end
    join variantes va on va.id = pe.variante_id
    join productos p on p.id = va.producto_id
    left join colores co on co.codigo = va.color_codigo
    left join tallas ta on ta.id = va.talla_id
    left join public.personas per on per.id = pe.creado_por
    left join apartados ad on ad.id = pe.apartado_id and ad.estado = 'abierto'
    left join apartados ao on ao.id = pe.apartado_origen_id
    left join sububicaciones so on so.id = ao.sububicacion_id
    left join transferencias t on t.id = pe.transferencia_id
   where pe.clienta_nombres is not null
     and (pe.ubicacion_id = p_ubicacion_id or pe.ubicacion_origen_id = p_ubicacion_id)
     and fn_puede_operar_ubicacion(p_ubicacion_id)
     and (pe.estado in ('pedido', 'en_camino', 'llego') or pe.created_at > now() - interval '7 days'
          -- «No llegó» sin avisar no se cae de la lista por viejo: un pedido que esperó 10 días y recién ahí recibió un
          -- «No la tengo» sigue pidiendo que alguien le avise al cliente (decisión del 2026-10-04).
          or (pe.estado = 'cancelado' and pe.cancelado_desde in ('envia', 'traslado') and pe.avisado_en is null))
   order by case pe.estado when 'llego' then 0 when 'pedido' then 1 when 'en_camino' then 2 else 3 end, pe.created_at desc
   limit 100;
$$;

comment on function retail.fn_pedidos_con_cliente(uuid) is
  'ADR-0328 act. 17: los pedidos para un cliente que la sede hizo (pedi) o le hicieron (me_piden), abiertos, lo cerrado de 7 días y lo que no llegó sin avisar al cliente, con la prenda, dónde está apartada en el origen (reserva_en: almacen | piso | sin_lugar | sin_reserva; null si ya no espera), de qué lado se cerró sin la prenda (cancelado_desde), el último «sigue en pie» y si ya se avisó al cliente. El nombre y el celular del cliente, solo a la sede que pidió (me_piden los trae null). Exige operar la sede.';

-- ---------------------------------------------------------------------------
-- 8. Permisos: nada para anon; authenticated, solo lo que llama la pantalla
-- ---------------------------------------------------------------------------
revoke all on function retail.subir_pedido_al_almacen(uuid) from public, anon;
revoke all on function retail.marcar_pedido_avisado(uuid) from public, anon;
revoke all on function retail.confirmar_pedido_sigue_en_pie(uuid) from public, anon;
revoke all on function retail.fn_pedidos_por_atender(uuid) from public, anon;
revoke all on function retail.fn_pedidos_con_cliente(uuid) from public, anon;
grant execute on function retail.subir_pedido_al_almacen(uuid) to authenticated;
grant execute on function retail.marcar_pedido_avisado(uuid) to authenticated;
grant execute on function retail.confirmar_pedido_sigue_en_pie(uuid) to authenticated;
grant execute on function retail.fn_pedidos_por_atender(uuid) to authenticated;
grant execute on function retail.fn_pedidos_con_cliente(uuid) to authenticated;

notify pgrst, 'reload schema';
