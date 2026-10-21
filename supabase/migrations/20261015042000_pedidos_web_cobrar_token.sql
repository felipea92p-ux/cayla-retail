-- ============================================================================
-- 20261015042000_pedidos_web_cobrar_token.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 9: el pago que se anota con su
-- marca sigue a lo que se anota (como Ventas, Caja e Inventario, 20261013200000 / 20261014162000 / 20261014194000)
--
-- EL PROBLEMA PRIMERO. «Registrar pago» manda un `p_token` para que un doble clic o un reintento tras una red caída no anote el
-- pago dos veces: `registrar_pago_pedido_web` busca el token y, si ya existe, devuelve el pago que guardó el primero. Pero solo
-- miraba el TOKEN, no lo que venía con él. Si la respuesta se pierde (la base SÍ guardó S/ 50 en efectivo), la persona corrige a
-- S/ 30 y vuelve a tocar: el mismo token devuelve el pago de S/ 50 y la hoja anunciaría «S/ 30». Es el defecto que /chaos
-- encontró el 2026-10-13 en Vender y el 2026-10-14 en los fondos; esta función nació después y no usaba la pieza.
--
-- LO QUE HACE (la misma pieza, sin otra regla):
--   1. `registrar_pago_pedido_web` anota la HUELLA de su token (`fn_intento_con_huella`) antes de buscarlo: el mismo token con
--      otro pedido, monto, medio o n.º de operación se rechaza (`token_reusado`); con la misma huella sigue como siempre. Los
--      montos van como texto en la huella: `jsonb` no admite NaN, y un NaN tiene que llegar a su mensaje («Escribe el monto»).
--   2. `fn_resolver_intento` sabe revisar `registrar_pago_pedido_web`: la hoja le pregunta qué pasó con el pago que quedó en duda
--      (`hecho`, con lo que guardó, o `no_llego`). Se revisa en la tienda del pedido (el candado de siempre:
--      `fn_puede_operar_ubicacion`).
--
-- CONTRATO (Liskov)
--   PROMETE: con el mismo token y la misma huella, `registrar_pago_pedido_web` devuelve lo mismo que antes; con otra huella,
--            `token_reusado`; con un token que la hoja dio por no llegado, `intento_descartado`. `fn_resolver_intento` responde
--            por la operación nueva sin cambiar lo que respondía por las demás.
--   ASUME:   `intentos_con_token`, `fn_intento_con_huella` y `fn_resolver_intento` (20261013200000, con lo que le sumaron
--            20261014162000, 20261014194000 y 20261014221000), y `registrar_pago_pedido_web` (20261015000000).
--   NO HACE: no toca tablas ni políticas, ni `anular_pago_pedido_web` (no lleva token: anular dos veces el mismo pago ya lo
--            rechaza la base, «Ese pago ya estaba anulado»).
--
-- POR QUÉ APARTE DE 20261015041000. Esta necesita las piezas de 20261013200000. En producción y en el CI están; una base local
-- atrasada (la compartida no las tenía el 2026-10-14) falla aquí con un mensaje claro, y la 041000 se aplica igual.
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe). Una sola parte, solo funciones, después de
-- `20261015000000_pedidos_web_cobros.sql`. Reemplazos ANCLADOS: las anclas de `fn_resolver_intento` son las líneas que usan los
-- fondos (20261014194000), que están una sola vez en la versión de producción y en la de `main`. Si algo cambió, aborta sin
-- cambiar nada. Idempotente. Sin `select … into` dentro de textos entre comillas.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Sin las piezas del token que sigue al contenido, esta migración no tiene sobre qué apoyarse: lo dice claro y no toca nada.
do $$
begin
  if to_regprocedure('retail.fn_intento_con_huella(text, uuid, text)') is null
     or to_regprocedure('retail.fn_resolver_intento(text, uuid)') is null then
    raise exception 'Falta «el token sigue al contenido» (20261013200000 y siguientes): aplícalas antes que esta.';
  end if;
end;
$$;

-- Reemplaza un texto en la definición VIVA de una función, solo si aparece las veces esperadas; si ya está reemplazado, no hace
-- nada (la misma pieza de 20261014194000, con su misma firma: `supabase start` corre todo en una sesión y `pg_temp` dura toda ella).
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

-- ---------- 1. El pago anota la huella de su token ----------
select pg_temp.reemplazar('retail.registrar_pago_pedido_web(uuid, numeric, text, text, uuid)',
$v$  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('pedido_web_pagos:' || p_token::text, 0));$v$,
$n$  -- El token sigue al contenido (ADR-0408 act. 9, como Ventas y Caja): el mismo token con otro pago se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('registrar_pago_pedido_web', p_token, md5(jsonb_build_array(
    p_pedido_id, p_monto::text, p_medio, p_numero_operacion)::text));
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('pedido_web_pagos:' || p_token::text, 0));$n$,
1);

-- ---------- 2. fn_resolver_intento revisa el pago de un pedido web ----------
select pg_temp.reemplazar('retail.fn_resolver_intento(text, uuid)',
$v$'registrar_cambio', 'separar_pedido_para_apartar'$v$,
$n$'registrar_cambio', 'separar_pedido_para_apartar', 'registrar_pago_pedido_web'$n$,
1);
select pg_temp.reemplazar('retail.fn_resolver_intento(text, uuid)',
$v$    else -- registrar_cambio$v$,
$n$    elsif p_operacion = 'registrar_pago_pedido_web' then
      -- ADR-0408 (actividad 9): el pago de un pedido web. Se revisa en la tienda del pedido, como lo demás de una tienda.
      for v_id, v_ubicacion, v_datos in
        select g.id, w.ubicacion_id,
               jsonb_build_object('pago_id', g.id, 'codigo', w.codigo, 'monto', g.monto, 'medio', g.medio, 'estado_pago', g.estado,
                                  'estado_pedido', w.estado, 'falta', w.total - w.pagado, 'creado_en', g.registrado_en)
          from retail.pedido_web_pagos g join retail.pedidos_web w on w.id = g.pedido_id
         where g.token_cliente = p_token
      loop
        exit;
      end loop;
    else -- registrar_cambio$n$,
1);

-- ---------- 3. Comprobación ----------
do $$
begin
  if position('fn_intento_con_huella(''registrar_pago_pedido_web''' in
              pg_get_functiondef('retail.registrar_pago_pedido_web(uuid, numeric, text, text, uuid)'::regprocedure)) = 0 then
    raise exception 'registrar_pago_pedido_web no quedó anotando la huella de su token';
  end if;
  if position('p_operacion = ''registrar_pago_pedido_web''' in pg_get_functiondef('retail.fn_resolver_intento(text, uuid)'::regprocedure)) = 0 then
    raise exception 'fn_resolver_intento no quedó sabiendo revisar el pago de un pedido web';
  end if;
end;
$$;

reset lock_timeout;
notify pgrst, 'reload schema';
