-- ============================================================================
-- 20260928170000_unir_clientas.sql — CAYLA V2 · Clientas, paso 2 del acta (parte 4/5)
--
-- «UNIR FICHAS» (D-99): la clienta que primero dejó su celular y después, en otra visita, dio su
-- DNI queda con DOS fichas — el índice único `clientas_dni_unico` frena el choque cuando el DNI se
-- repite, pero nada frena que se repita el celular. `unir_clientas` junta las dos en UNA.
--
-- LA TRANSACCIÓN (principio 9, Jim Gray — «la unidad es todo o nada»). Mover las ventas, las
-- separaciones y los pedidos no atendidos de la ficha que se va, completar los datos que le
-- falten a la que se queda, dejar el rastro en `clientas_fusiones` y anonimizar a la perdedora:
-- las CINCO cosas pasan en la misma llamada a esta función, que es una sola transacción de
-- Postgres. Si cualquier paso falla (una FK que no cuadra, un candado que se dispara), NINGUNO se
-- aplica — nunca queda una fusión a medias con las ventas movidas pero la ficha perdedora todavía
-- visible, o viceversa.
--
-- CONCURRENCIA (antes de decir «listo», pregunta 1). Dos personas uniendo la MISMA pareja de
-- fichas a la vez, o unos segundos apartados: se bloquean las dos filas con `for update` desde el
-- principio (mismo criterio que `apartar_stock`) — la segunda llamada espera a que la primera
-- termine y, al despertar, ya encuentra a la perdedora archivada/fusionada y se detiene con un
-- mensaje claro en vez de fusionar dos veces o pisar el trabajo de la primera.
--
-- EL ORDEN QUE EVITA UNA COLISIÓN TRANSITORIA DE DNI. Si la ficha que se queda no tenía DNI y la
-- que se va sí, completar primero a la que se queda (mientras la otra TODAVÍA tiene ese DNI)
-- dejaría un instante con DOS filas con el mismo DNI — y `clientas_dni_unico` lo rechazaría ahí
-- mismo, aunque las dos sentencias estén en la misma transacción (un índice único no espera al
-- COMMIT). Por eso el orden es: primero se vacía a la perdedora, después se completa a la que
-- gana.
--
-- «¿QUÉ PASA SI SE UNEN MAL?» Deshacer no existe — dos fichas fusionadas vuelven a ser una sola
-- persona, no hay forma automática de separarlas. Lo que SÍ queda: `retail.clientas_fusiones`
-- guarda la fila perdedora COMPLETA tal como estaba antes de anonimizarla, más cuántas ventas,
-- separaciones y pedidos se movieron — con eso se puede reconstruir la ficha a mano si la fusión
-- fue un error (crear una clienta nueva con esos mismos datos y devolverle sus ventas una por
-- una). No es un botón «deshacer», es la evidencia para hacerlo a mano.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.unir_clientas(
  p_mantener_id uuid,
  p_fusionar_id uuid,
  p_version_mantener_esperada integer default null,
  p_version_fusionar_esperada integer default null
)
returns retail.clientas
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_mantener retail.clientas;
  v_fusionar retail.clientas;
  v_snapshot jsonb;
  v_ventas integer;
  v_separaciones integer;
  v_pedidos integer;
begin
  v_persona := retail.fn_actor_persona_id(true);

  if p_mantener_id = p_fusionar_id then
    raise exception 'No puedes unir una ficha consigo misma.';
  end if;

  -- Bloquea las dos filas desde el principio: cierra la carrera de dos fusiones a la vez sobre la
  -- misma pareja (o sobre una pareja que se solapa).
  select * into v_mantener from retail.clientas where id = p_mantener_id for update;
  select * into v_fusionar from retail.clientas where id = p_fusionar_id for update;

  if v_mantener.id is null or v_fusionar.id is null then
    raise exception 'Una de las dos fichas ya no existe — actualiza la pantalla.';
  end if;
  if v_mantener.archivada_en is not null then
    raise exception 'La ficha que quieres conservar está archivada — reactívala primero, o une hacia la otra ficha.';
  end if;
  if v_fusionar.archivada_en is not null then
    raise exception 'Esa ficha ya está archivada o ya se unió a otra — no se puede volver a fusionar.';
  end if;

  if p_version_mantener_esperada is not null and v_mantener.version <> p_version_mantener_esperada then
    raise exception 'Alguien más cambió la ficha que ibas a conservar mientras decidías. Recarga para ver sus cambios.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;
  if p_version_fusionar_esperada is not null and v_fusionar.version <> p_version_fusionar_esperada then
    raise exception 'Alguien más cambió la ficha que ibas a unir mientras decidías. Recarga para ver sus cambios.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;

  -- Snapshot de la perdedora ANTES de tocar nada: es lo único con que se podría reconstruir a
  -- mano si esta fusión fue un error.
  v_snapshot := to_jsonb(v_fusionar);

  update retail.ventas set cliente_id = p_mantener_id where cliente_id = p_fusionar_id;
  get diagnostics v_ventas = row_count;

  update retail.separaciones set clienta_id = p_mantener_id where clienta_id = p_fusionar_id;
  get diagnostics v_separaciones = row_count;

  update retail.pedidos_no_atendidos set clienta_id = p_mantener_id where clienta_id = p_fusionar_id;
  get diagnostics v_pedidos = row_count;

  -- Primero se vacía a la perdedora (libera su DNI del índice único) y SOLO DESPUÉS se completa a
  -- la que gana — ver «EL ORDEN» en la cabecera. `nombre` al placeholder exacto que exige
  -- `clientas_anonimizada_sin_datos_personales` (nunca `null`: `nombre = 'Clienta anonimizada'`
  -- sobre NULL da NULL, no false, y ese CHECK lo habría dejado pasar — ver esa migración).
  update retail.clientas set
    dni = null, nombre = 'Clienta anonimizada', telefono_whatsapp = null, whatsapp_consentimiento_en = null,
    cumple_dia = null, cumple_mes = null, tallas = null,
    anonimizada = true,
    archivada_en = now(),
    archivada_por = v_persona,
    motivo_archivo = 'Se unió a otra ficha de clienta (unir_clientas)',
    fusionada_en_id = p_mantener_id
  where id = p_fusionar_id;

  update retail.clientas set
    dni = coalesce(dni, v_fusionar.dni),
    nombre = coalesce(nombre, v_fusionar.nombre),
    telefono_whatsapp = coalesce(telefono_whatsapp, v_fusionar.telefono_whatsapp),
    whatsapp_consentimiento_en = greatest(whatsapp_consentimiento_en, v_fusionar.whatsapp_consentimiento_en),
    cumple_dia = coalesce(cumple_dia, v_fusionar.cumple_dia),
    cumple_mes = coalesce(cumple_mes, v_fusionar.cumple_mes),
    tallas = coalesce(tallas, v_fusionar.tallas)
  where id = p_mantener_id;

  insert into retail.clientas_fusiones (
    clienta_mantiene_id, clienta_fusionada_id, ficha_fusionada,
    ventas_movidas, separaciones_movidas, pedidos_movidos, fusionada_por
  ) values (
    p_mantener_id, p_fusionar_id, v_snapshot, v_ventas, v_separaciones, v_pedidos, v_persona
  );

  perform retail.fn_actividad_anotar(
    'clientas', 'unir',
    'Unió dos fichas de clienta: ' || v_ventas || ' venta(s), ' || v_separaciones || ' apartado(s) y '
      || v_pedidos || ' pedido(s) pasaron a la ficha que quedó',
    v_persona, null, null, null, 'clientas', p_mantener_id::text, now(),
    jsonb_build_object('fusionada_id', p_fusionar_id, 'ventas_movidas', v_ventas,
                        'separaciones_movidas', v_separaciones, 'pedidos_movidos', v_pedidos),
    'vivo'
  );

  return (select c from retail.clientas c where c.id = p_mantener_id);
end;
$$;

comment on function retail.unir_clientas(uuid, uuid, integer, integer) is
  'D-99: junta dos fichas de la misma clienta (celular + DNI dado después) en UNA transacción — mueve ventas/separaciones/pedidos_no_atendidos y anonimiza a la perdedora. Rastro completo en clientas_fusiones (no hay deshacer automático). p_version_*_esperada: ADR-0193.';

revoke execute on function retail.unir_clientas(uuid, uuid, integer, integer) from public, anon;
grant execute on function retail.unir_clientas(uuid, uuid, integer, integer) to authenticated;

notify pgrst, 'reload schema';
