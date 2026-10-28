-- ============================================================================
-- 20261012214000_pago_produccion_token_tras_candado.sql — CAYLA V2 (Compras · Por pagar de Producción)
--
-- EL PROBLEMA PRIMERO. Un comprobante de insumos del Taller por S/ 1.000; la encargada hace doble clic en «Pagar S/ 300»
-- y salen dos llamadas con el MISMO token. `registrar_pago_comprobante_produccion` (20260921110000) miraba el token
-- ANTES de bloquear el comprobante: las dos llamadas lo miran a la vez, ninguna ve el pago de la otra (todavía no
-- existe), la segunda espera el candado, ve saldo de sobra (700) e inserta otra vez. Quedaban S/ 600 pagados por un pago
-- de S/ 300, y la plata de más salía del Taller. Compras ya lo hacía bien (`registrar_pago_compras_medios` mira el token
-- después del candado); Producción no.
--
-- QUÉ HACE. Mueve la pregunta «¿este token ya pagó?» a DESPUÉS del `select … for update` del comprobante. Con eso, la
-- segunda llamada espera a que la primera termine y, como en READ COMMITTED cada consulta toma una foto nueva, al
-- mirar el token ya ve el pago de la primera y devuelve el mismo grupo sin repetirlo. Nada más cambia: mismas
-- validaciones, mismos mensajes, misma respuesta.
--
-- CÓMO. Reemplazo ANCLADO sobre la definición viva (la función ya la reescribieron 20260923100000 y 20260925150000;
-- copiar un cuerpo viejo pisaría la cuenta de dinero): el bloque del token se quita de arriba y se agrega tras el
-- candado. Si alguno de los dos trozos no está exactamente una vez, se detiene SIN tocar nada. Es idempotente: si el
-- token ya se mira después del candado, no hace nada. Los anclajes no incluyen comentarios (un pegado por la
-- herramienta de Supabase los quita) ni un `select … into` entre comillas simples (ADR-0288).
--
-- SE ROMPE SI una migración posterior redefine la función copiando 20260921110000: vuelve el orden viejo. La prueba
-- `pnpm pruebas:produccion-punta-a-punta` lo vigila (dos sesiones, mismo token: un solo pago).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: solo una función (sin tablas, políticas ni
-- disparadores, ADR-0195). Se puede pegar dos veces.
-- ============================================================================

set lock_timeout = '3s';

do $do$
declare
  c_firma constant text := 'retail.registrar_pago_comprobante_produccion(uuid,jsonb,date,uuid)';
  c_token constant text := $a$  if p_token is not null and exists (select 1 from retail.comprobantes_produccion_pagos where grupo_id = p_token) then
    return p_token;
  end if;
$a$;
  c_candado constant text := $a$where id = p_comprobante_id for update;
  if not found then
    raise exception 'Ese comprobante no existe. Recarga la pantalla.';
  end if;
$a$;
  v_def text;
  v_n_token integer;
  v_n_candado integer;
begin
  v_def := pg_get_functiondef(c_firma::regprocedure);
  v_n_token := (length(v_def) - length(replace(v_def, c_token, ''))) / length(c_token);
  v_n_candado := (length(v_def) - length(replace(v_def, c_candado, ''))) / length(c_candado);

  if v_n_token <> 1 or v_n_candado <> 1 then
    raise exception '% cambió desde que se escribió esta migración: se esperaba 1 vez la pregunta del token (hay %) y 1 vez el candado del comprobante (hay %). Regenera el reemplazo desde su definición real.',
      c_firma, v_n_token, v_n_candado;
  end if;

  -- Ya aplicada: el token se mira después del candado.
  if position(c_token in v_def) > position(c_candado in v_def) then
    return;
  end if;

  -- El comentario viejo se iría a describir otra línea: se quita si está (en producción puede no estar).
  v_def := replace(v_def, E'  -- Reintento honesto: el primer envío sí llegó. Se devuelve el pago que ya existe sin repetirlo.\n', '');
  v_def := replace(v_def, c_token, '');
  v_def := replace(v_def, c_candado, c_candado
    || E'  -- Reintento honesto, mirado CON el comprobante bloqueado: si el primer envío llegó (o la llamada gemela terminó\n'
    || E'  -- mientras esta esperaba el candado), se devuelve el pago que ya existe sin repetirlo.\n'
    || c_token);
  execute v_def;
end
$do$;

reset lock_timeout;
