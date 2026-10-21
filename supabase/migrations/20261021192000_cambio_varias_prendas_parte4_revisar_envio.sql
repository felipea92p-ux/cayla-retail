-- ============================================================================================================
-- 20261021192000_cambio_varias_prendas_parte4_revisar_envio.sql — CAYLA V2 · Cambios · una prenda por VARIAS (PARTE 4, ADR-0470)
--
-- EL PROBLEMA PRIMERO. Cuando se pierde la respuesta de un guardado (un corte de red justo al tocar «Confirmar cambio»), la pantalla se
-- congela y ofrece «Revisar si se guardó»: le pregunta a la base por el token del envío (`fn_resolver_intento`, ADR-0381 y el «token que
-- sigue al contenido»). Esa función solo conoce una lista de operaciones; `registrar_cambio_varias` (parte 2) no está en ella, y la
-- pregunta contestaría «No sé revisar …»: la clienta esperando y la colaboradora sin saber si el cambio quedó.
--
-- QUÉ HACE. Suma `registrar_cambio_varias` a la lista de operaciones de `fn_resolver_intento`. No hace falta una rama nueva: su fila
-- queda en `cambios.token_cliente`, igual que la de `registrar_cambio`, y la rama que revisa los cambios es la que atrapa lo demás.
-- Reemplazo anclado sobre la lista (formato de 20261015114000): si la lista cambió, se detiene sin tocar nada. La operación va AL FINAL de la tanda de
-- `separar_pedido_para_apartar` (después de `anular_pedido_web_pagado`), nunca entre `registrar_cambio` y `separar_pedido_para_apartar`: las migraciones
-- viejas (20261014194000 y 20261015042000) anclan en que esas dos sigan juntas y varias suites de Postgres las rehacen (el CI también).
--
-- DECIDÍ: la web manda el cambio por varias con su propia operación (`registrar_cambio_varias`) y no con la de `registrar_cambio`: la
-- marca de «no llegó» de `fn_resolver_intento` se guarda por (operación, token), y `fn_intento_con_huella` de la función de la parte 2
-- la lee con ese mismo nombre. Con otro nombre, un envío que llegara tarde podría guardarse después de que la pantalla dijo «no llegó».
--
-- SE ROMPE SI: otra migración reescribe `fn_resolver_intento` entera copiándola de una versión anterior (perdería la operación nueva):
-- `lib/intento-reglas.test.ts` compara la lista de la web con la última versión de la función y con estos reemplazos.
--
-- PRODUCCIÓN. Una parte, idempotente: un `create or replace` de una función; no toma tablas en exclusiva ni toca políticas. Requiere la
-- parte 2. El orden con la publicación de la web no importa: si la web llegara antes, «revisar» diría «No sé revisar …», un error claro.
-- ============================================================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

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

select pg_temp.reemplazar('retail.fn_resolver_intento(text, uuid)',
$v$'separar_pedido_para_apartar', 'registrar_pago_pedido_web', 'entregar_pedido_web', 'anular_pedido_web_pagado'$v$,
$n$'separar_pedido_para_apartar', 'registrar_pago_pedido_web', 'entregar_pedido_web', 'anular_pedido_web_pagado', 'registrar_cambio_varias'$n$,
1);

select 'Cambio por varias · parte 4 (revisar el envío)' as parte,
       case when pg_get_functiondef('retail.fn_resolver_intento(text, uuid)'::regprocedure) like '%''anular_pedido_web_pagado'', ''registrar_cambio_varias''%'
            then 'QUEDÓ BIEN' else 'REVISAR' end as resultado;
