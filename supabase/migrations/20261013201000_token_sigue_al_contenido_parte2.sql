-- ============================================================================
-- 20261013201000_token_sigue_al_contenido_parte2.sql — CAYLA V2 (/chaos 2026-10-13, Felipe 2026-10-13)
--
-- Parte 2 de «el token sigue al contenido» (la parte 1 explica el problema y crea `intentos_con_token`,
-- `fn_intento_con_huella` y `fn_resolver_intento`). Aquí, las once funciones de Ventas y Caja que reciben un token
-- llaman a `fn_intento_con_huella` ANTES de buscar su token: con el mismo token y otro contenido, rechazan
-- (`token_reusado`) en vez de devolver lo que guardó el envío anterior.
--
-- La huella es el md5 de TODOS los parámetros menos el token, en el orden de la firma. `jsonb_build_array` deja cada
-- jsonb en su forma normal (el orden de las claves no cambia la huella; el orden de una lista sí, y es a propósito:
-- un reintento real manda exactamente lo mismo).
--
-- CONTRATO (Liskov)
--   PROMETE: cada una de las once funciones, con un token ya usado y otro contenido, responde `token_reusado` sin
--            escribir nada; con el mismo contenido, hace lo de siempre (devuelve lo que guardó). Con un token nulo,
--            nada cambia. Lo demás de cada función queda igual.
--   ASUME:   la parte 1 (20261013200000).
--   NO HACE: no toca tablas ni políticas. No cubre funciones de otros módulos con token (iniciar_traslado,
--            ajustar_inventario, registrar_compra, abrir_produccion…): van con su módulo.
--
-- CÓMO SE PEGA. Una sola parte, solo funciones, DESPUÉS de la parte 1. Reemplazos ANCLADOS sobre la definición viva
-- (ADR-0288): la llamada se inserta antes de la PRIMERA aparición del ancla, y el ancla tiene que aparecer exactamente
-- las veces esperadas (si no, se detiene sin tocar nada). Las anclas son líneas de código, nunca comentarios: en
-- producción varias funciones tienen comentarios distintos a los del repo (verificado el 2026-10-13: mismas cuentas en
-- local y en producción). Idempotente: si la llamada ya está, no hace nada. Sin `select … into` dentro de un texto
-- entre comillas (ADR-0288).
-- ============================================================================
set lock_timeout = '3s';

-- Inserta `p_bloque` antes de la primera aparición de `p_ancla`, que tiene que aparecer exactamente `p_veces` veces.
-- Si `p_marca` ya está en la función, no hace nada.
create or replace function pg_temp.insertar_antes(p_firma text, p_ancla text, p_veces integer, p_bloque text, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_ancla, ''))) / length(p_ancla);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_ancla, v_n;
  end if;
  execute overlay(v_def placing p_bloque || p_ancla from position(p_ancla in v_def) for length(p_ancla));
end;
$f$;

select pg_temp.insertar_antes(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$  if p_token is not null then$v$, 3,
  $v$  -- El token sigue al contenido: el mismo token con otra venta se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('registrar_venta', p_token, md5(jsonb_build_array(
    p_ubicacion_id, p_items, p_pagos, p_cliente_id, p_tipo_comprobante, p_cliente_tipo_doc, p_cliente_num_doc,
    p_cliente_nombre, p_codigo_descuento, p_nota, p_asesora_id, p_emisor, p_descuento_pct, p_autorizado_por,
    p_motivo_descuento, p_canjear_cumpleanos, p_canjear_aniversario)::text));
$v$,
  $v$fn_intento_con_huella('registrar_venta'$v$);

select pg_temp.insertar_antes(
  'retail.entregar_separacion(uuid, jsonb, uuid)',
  $v$  if p_token is not null then$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otro apartado u otros pagos se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('entregar_separacion', p_token, md5(jsonb_build_array(p_separacion_id, p_pagos)::text));
$v$,
  $v$fn_intento_con_huella('entregar_separacion'$v$);

select pg_temp.insertar_antes(
  'retail.registrar_movimiento_caja(uuid, text, numeric, text, text, boolean, uuid)',
  $v$  if p_token is not null then$v$, 2,
  $v$  -- El token sigue al contenido: el mismo token con otro movimiento se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('registrar_movimiento_caja', p_token, md5(jsonb_build_array(
    p_caja_id, p_tipo, p_monto, p_motivo, p_nota, p_es_ajuste)::text));
$v$,
  $v$fn_intento_con_huella('registrar_movimiento_caja'$v$);

select pg_temp.insertar_antes(
  'retail.registrar_ingreso_caja(uuid, text, numeric, text, text, uuid, uuid)',
  $v$  if p_token is not null then$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otra entrada de plata se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('registrar_ingreso_caja', p_token, md5(jsonb_build_array(
    p_caja_id, p_concepto, p_monto, p_nota, p_de_donde, p_sede_origen_id)::text));
$v$,
  $v$fn_intento_con_huella('registrar_ingreso_caja'$v$);

select pg_temp.insertar_antes(
  'retail.registrar_gasto(uuid, text, text, date, numeric, jsonb, text, uuid, uuid, text, uuid, uuid, uuid)',
  $v$  if p_token is not null then$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otro gasto se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('registrar_gasto', p_token, md5(jsonb_build_array(
    p_ubicacion_id, p_categoria, p_descripcion, p_fecha, p_monto_total, p_comprobante, p_medio_pago, p_caja_id,
    p_caja_movimiento_id, p_referencia, p_gasto_fijo_id, p_cuenta_id)::text));
$v$,
  $v$fn_intento_con_huella('registrar_gasto'$v$);

select pg_temp.insertar_antes(
  'retail.separar_prendas(uuid, jsonb, jsonb, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text, uuid)',
  $v$  if p_token is not null then$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otro apartado se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('separar_prendas', p_token, md5(jsonb_build_array(
    p_ubicacion_id, p_items, p_pagos, p_clienta_nombres, p_clienta_apellidos, p_clienta_celular, p_devolucion_medio,
    p_clienta_dni, p_devolucion_numero, p_devolucion_cci, p_comprobante_tipo, p_cliente_ruc, p_cliente_razon_social,
    p_asesora_id, p_clienta_id, p_nota)::text));
$v$,
  $v$fn_intento_con_huella('separar_prendas'$v$);

select pg_temp.insertar_antes(
  'retail.abonar_separacion(uuid, jsonb, boolean, uuid)',
  $v$  if p_token is not null then$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otro abono se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('abonar_separacion', p_token, md5(jsonb_build_array(p_separacion_id, p_pagos, p_esperar)::text));
$v$,
  $v$fn_intento_con_huella('abonar_separacion'$v$);

select pg_temp.insertar_antes(
  'retail.editar_separacion(uuid, uuid[], jsonb, uuid)',
  $v$  if p_token is not null then$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otra edición se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('editar_separacion', p_token, md5(jsonb_build_array(p_separacion_id, p_quitar, p_agregar)::text));
$v$,
  $v$fn_intento_con_huella('editar_separacion'$v$);

select pg_temp.insertar_antes(
  'retail.enviar_pedido_para_apartar(uuid, timestamp with time zone, uuid)',
  $v$  select * into pe from separacion_pedidos where id = p_pedido_id for update;$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otro pedido se rechaza (token_reusado). Sin esto, el traslado
  -- del primer pedido quedaba colgado del segundo.
  perform retail.fn_intento_con_huella('enviar_pedido_para_apartar', p_token, md5(jsonb_build_array(p_pedido_id, p_fecha_estimada_llegada)::text));
$v$,
  $v$fn_intento_con_huella('enviar_pedido_para_apartar'$v$);

select pg_temp.insertar_antes(
  'retail.registrar_cambio(uuid, uuid, uuid, integer, text, uuid, text, text)',
  $v$  if p_token is not null then$v$, 2,
  $v$  -- El token sigue al contenido: el mismo token con otro cambio se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('registrar_cambio', p_token, md5(jsonb_build_array(
    p_venta_item_id, p_ubicacion_id, p_variante_nueva_id, p_cantidad, p_metodo_pago_diferencia, p_motivo, p_condicion)::text));
$v$,
  $v$fn_intento_con_huella('registrar_cambio'$v$);

-- Apartar una prenda que llegó de otra tienda: busca su token (dentro de `p_datos`) ANTES de llamar a `separar_prendas`, así
-- que la huella tiene que ir aquí también; si no, otro pedido con el mismo token recibía el apartado del primero.
select pg_temp.insertar_antes(
  'retail.separar_pedido_para_apartar(uuid, jsonb)',
  $v$  if nullif(p_datos ->> 'p_token', '') is not null then$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otro pedido u otros datos se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('separar_pedido_para_apartar', nullif(p_datos ->> 'p_token', '')::uuid,
    md5(jsonb_build_array(p_pedido_id, p_datos - 'p_token')::text));
$v$,
  $v$fn_intento_con_huella('separar_pedido_para_apartar'$v$);
