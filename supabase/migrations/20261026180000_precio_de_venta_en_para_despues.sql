-- ADR-0393 (actualización 2026-10-26) · El precio de venta también se cambia desde «Para después», después de identificar la prenda.
--
-- EL PROBLEMA PRIMERO. Al contar «5 blusas» sin decir cuáles, la tarjeta «Costos y precios» del paso Cerrar no puede ofrecer el precio de
-- venta de nadie: no se sabe qué prenda es (20261024225000: solo prendas ya identificadas en el envío, y solo con el envío ABIERTO). Está
-- bien. Pero el envío se cierra, la prenda se identifica después en «Para después» → «Hacer ahora», y ahí ya no hay dónde cambiar su
-- precio: `cambiar_precio_en_recepcion` responde «El precio se cambia mientras el envío está abierto, antes de cerrarlo». Quien identifica
-- la prenda es justo quien sabe a cuánto se vende, y tendría que ir a Catálogo ▸ Productos (que no todo el que recibe ve).
--
-- QUÉ HACE (una sola parte, re-pegable). Dos reemplazos anclados en `cambiar_precio_en_recepcion`:
--   1. El envío puede estar ABIERTO (como antes) o CERRADO (nuevo). En camino o anulado sigue rechazándose (`precio_envio_no_abierto`).
--   2. La prenda tiene que ser «de este envío». Con el envío abierto, la que se separó al contarlo (como antes). Con el envío CERRADO,
--      la puerta es MÁS ESTRECHA que «cualquier prenda que alguna vez llegó por este envío»:
--        · una prenda que sigue en «Para después» (un pendiente «detalle» todavía pendiente: se sabe qué prenda es, faltan sus tallas), o
--        · una que entró al stock por este envío hace menos de una hora (la que acaba de identificarse con «Hacer ahora»: el precio se
--          cambia justo después de meterla, y la puerta se cierra sola).
--      Pasada la hora, o resuelto y vendido, el precio se cambia en Catálogo ▸ Productos como siempre.
--   3. `validar_precio_en_recepcion(envío, prenda, precio, alcance)` (nueva, de lectura): dice si ese precio se podría guardar y, si no, POR QUÉ,
--      sin guardar nada. La pantalla la pregunta antes de pedir la confirmación, y el motivo sale junto al campo del precio. Para no repetir
--      las reglas (y que un día digan cosas distintas) corre la función real DENTRO de una subtransacción que siempre se deshace: lo escrito
--      (el precio, su rastro, la marca de transacción) vuelve atrás, y lo que la función real rechazaría llega tal cual. Una marca de
--      transacción (`retail.precio_validando`, que solo esta función enciende y apaga) salta únicamente la pregunta «¿es de este envío?»: una
--      prenda que se acaba de identificar todavía no lo es, y su precio igual se puede preguntar (el piso del costo, el tope, la tienda).
-- Todo lo demás de la función queda igual: módulo Recibir, el responsable del combo, la sede del envío, que no lo hayas comprado tú, el
-- tope de S/ 5 000, no bajar del costo (sin decir cuánto cuesta), «todas las sedes» o «solo esta», y el rastro en el historial de la prenda.
--
-- LO QUE NUNCA DEBE EXISTIR (y quién lo impide):
--   · Cambiar el precio de una prenda que no pasó por este envío, o que pasó hace tiempo → los dos candados de arriba; el rechazo es el
--     mismo de siempre (`precio_prenda_ajena`).
--   · Cambiar el precio con el envío en camino o anulado → `precio_envio_no_abierto`.
--   · Un precio bajo el costo o fuera de rango → igual que antes (la función no se tocó ahí).
--
-- CONTRATO (el de 20261024225000, con estas dos diferencias)
--   PROMETE: con el módulo Recibir, la sede del envío y quien firma (que no hizo la orden), una prenda de un envío cerrado que sigue
--            «para después» o que entró hace menos de una hora cambia de precio, para todas las sedes o solo la de este envío.
--   NO HACE: no mete nada al stock ni toca lo contado; no deja cambiar el precio de lo que entró hace más de una hora.
--
-- DESCARTÉ:
--   · Dejar el precio de cualquier prenda de cualquier envío cerrado: quien tiene Recibir en una sede podría llamar a la función contra una
--     prenda recibida hace meses, y hoy solo llega a las de los envíos abiertos. Es una decisión de permisos de Felipe, no de esta pantalla.
--   · Poner el precio dentro de `resolver_pendiente_envio` (la puerta del stock): mezclaría dinero de venta con movimiento de inventario
--     en la función más delicada de la recepción. El precio va en su propia llamada, como en el cierre.
--   · Exigir que la prenda siga pendiente: la que se identifica con tallas entra al stock en el acto, deja de estar pendiente, y justo
--     entonces es cuando se pone el precio.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261024225000. Sin tablas, políticas ni disparadores, sin
-- `alter table`, y sin `select … into` dentro de textos entre comillas (ADR-0288). Cada reemplazo aborta sin tocar nada si la definición
-- viva cambió, y no hace nada si ya está. Se puede pegar dos veces.

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Reemplazo anclado (el mismo de 20261013173000): falla si la función viva cambió, y es re-ejecutable.
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

-- 1. El envío: abierto o cerrado.
select pg_temp.reemplazar(
  'retail.cambiar_precio_en_recepcion(uuid,uuid,numeric,text)',
  $v$  if v_despacho.estado <> 'abierto' then
    raise exception 'El precio se cambia mientras el envío está abierto, antes de cerrarlo' using hint = 'precio_envio_no_abierto';
  end if;$v$,
  $v$  -- ADR-0393 (2026-10-26): también con el envío CERRADO (desde «Para después»); en camino o anulado, no.
  if v_despacho.estado not in ('abierto', 'cerrado') then
    raise exception 'El precio se cambia cuando el envío ya se está recibiendo' using hint = 'precio_envio_no_abierto';
  end if;$v$,
  1);

-- 2. La prenda: la separada al contarlo (abierto), o la que sigue «para después» / entró hace menos de una hora (cerrado).
select pg_temp.reemplazar(
  'retail.cambiar_precio_en_recepcion(uuid,uuid,numeric,text)',
  $v$  if not exists (
    select 1
      from retail.despacho_conteos k, jsonb_array_elements(k.separado -> 'prendas') p
     where k.despacho_id = v_despacho.id and p ->> 'producto_id' = p_producto_id::text
  ) then$v$,
  $v$  if not (
    -- `validar_precio_en_recepcion` pregunta por una prenda que quizá todavía no es de este envío: allí, y solo allí, no se exige.
    coalesce(current_setting('retail.precio_validando', true), '') = 'on'
    or case when v_despacho.estado = 'abierto' then exists (
      select 1
        from retail.despacho_conteos k, jsonb_array_elements(k.separado -> 'prendas') p
       where k.despacho_id = v_despacho.id and p ->> 'producto_id' = p_producto_id::text
    ) else (
      -- ADR-0393 (2026-10-26): con el envío cerrado, la puerta es más estrecha que «cualquier prenda que llegó por aquí».
      exists (
        select 1 from retail.despacho_pendientes x
         where x.despacho_id = v_despacho.id and x.tipo = 'detalle' and x.estado = 'pendiente' and x.producto_id = p_producto_id
      ) or exists (
        select 1
          from retail.despacho_recibidos r
          join retail.variantes vr on vr.id = r.variante_id
         where r.despacho_id = v_despacho.id and vr.producto_id = p_producto_id and r.creado_en > now() - interval '1 hour'
      )
    ) end
  ) then$v$,
  1);

-- 3. ¿Se podría guardar este precio? Sin guardar nada, con el motivo de la función real.
create or replace function retail.validar_precio_en_recepcion(
  p_despacho_id uuid, p_producto_id uuid, p_precio numeric, p_alcance text
) returns jsonb
language plpgsql volatile security definer set search_path = retail, public, extensions as $fn$
declare
  v_estado text;
  v_msg text;
  v_hint text;
begin
  perform set_config('retail.precio_validando', 'on', true);
  begin
    perform retail.cambiar_precio_en_recepcion(p_despacho_id, p_producto_id, p_precio, p_alcance);
    -- Pasó todas las reglas: se deshace lo que la función real escribió (el precio y su rastro) con una excepción propia.
    raise exception 'Precio válido' using errcode = 'P0001', hint = 'precio_validado';
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
    perform set_config('retail.precio_validando', 'off', true);
    if v_hint = 'precio_validado' then
      return jsonb_build_object('ok', true);
    end if;
    return jsonb_build_object('ok', false, 'codigo', v_estado, 'hint', nullif(v_hint, ''), 'motivo', v_msg);
  end;
end;
$fn$;
comment on function retail.validar_precio_en_recepcion(uuid, uuid, numeric, text) is
  'Felipe 2026-10-26: ¿se podría guardar este precio de venta desde la recepción? {ok: true} o {ok: false, codigo, hint, motivo} con el motivo '
  'de cambiar_precio_en_recepcion, que corre dentro de una subtransacción que siempre se deshace: no guarda nada. Las mismas reglas porque es '
  'la misma función; salta solo la pregunta «¿es de este envío?» (marca retail.precio_validando). Módulo Recibir, el responsable del combo.';
revoke all on function retail.validar_precio_en_recepcion(uuid, uuid, numeric, text) from public, anon;
grant execute on function retail.validar_precio_en_recepcion(uuid, uuid, numeric, text) to authenticated;

-- 4. Comprobación: si algo no quedó, la migración no se da por aplicada.
do $$
declare
  v_def text := pg_get_functiondef('retail.cambiar_precio_en_recepcion(uuid,uuid,numeric,text)'::regprocedure);
begin
  if position('not in (''abierto'', ''cerrado'')' in v_def) = 0 then
    raise exception 'cambiar_precio_en_recepcion no acepta un envío cerrado';
  end if;
  if position('interval ''1 hour''' in v_def) = 0 or position('x.tipo = ''detalle''' in v_def) = 0 then
    raise exception 'cambiar_precio_en_recepcion no limita la prenda de un envío cerrado';
  end if;
  if position('retail.precio_validando' in v_def) = 0 then
    raise exception 'cambiar_precio_en_recepcion no deja preguntar el precio de una prenda que todavía no es del envío';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = 'retail.validar_precio_en_recepcion(uuid,uuid,numeric,text)'::regprocedure)
     or has_function_privilege('anon', 'retail.validar_precio_en_recepcion(uuid,uuid,numeric,text)', 'execute')
     or not has_function_privilege('authenticated', 'retail.validar_precio_en_recepcion(uuid,uuid,numeric,text)', 'execute') then
    raise exception 'validar_precio_en_recepcion: security definer, la ejecuta authenticated y no anon';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = 'retail.cambiar_precio_en_recepcion(uuid,uuid,numeric,text)'::regprocedure)
     or has_function_privilege('anon', 'retail.cambiar_precio_en_recepcion(uuid,uuid,numeric,text)', 'execute')
     or not has_function_privilege('authenticated', 'retail.cambiar_precio_en_recepcion(uuid,uuid,numeric,text)', 'execute') then
    raise exception 'cambiar_precio_en_recepcion: security definer, la ejecuta authenticated y no anon';
  end if;
end;
$$;

reset lock_timeout;
