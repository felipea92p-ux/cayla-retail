-- ============================================================================
-- 20261112153000 — Una compra de «Mis compras» no sale en Recibir hasta que Compras la manda (ADR-0362 decisión 48, ADR-0480)
--
-- EL PROBLEMA PRIMERO. Felipe, 2026-11-12: «cuando Compras registra compras, en Recibir mercadería aparecen aunque Compras aún no ha realizado
-- el envío». Una orden con tienda de destino nació (ADR-0362, decisión 48) para decir «el PROVEEDOR la entrega directo en esa tienda, sin guía
-- nuestra»: por eso `fn_ordenes_directas_por_recibir` la ofrece en Recibir con «Sin guía · Llegó esta orden». Pero «Compré ropa» (ADR-0480,
-- `registrar_compra_rapida`) arma una orden por tienda con la tienda como destino para decir otra cosa: «estas prendas son PARA esa tienda»; la
-- mercadería viaja después en un envío de Compras. La lista no distingue los dos casos y ofrece la compra desde el minuto en que se registra.
-- Medido en producción el 2026-11-12 (solo lectura): las 48 órdenes de compra vivas salen de «Mis compras» (ninguna de entrega directa del
-- proveedor); cada una estuvo en Recibir 15,5 h en promedio (hasta 71 h) antes de su envío, y 3 veces una tienda pulsó «Llegó esta orden» en una
-- de ellas (los tres envíos, anulados después).
--
-- LA DECISIÓN. Una orden que salió de un papel de «Mis compras» (`ordenes_compra.papel_id` no nulo) viaja SIEMPRE con un envío de Compras:
--   1. `fn_ordenes_directas_por_recibir` la deja fuera: la tienda la ve recién cuando Compras arma su envío (`fn_envios_por_recibir`, sin cambios).
--   2. `recibir_orden_sin_envio` («Llegó esta orden») la rechaza con `orden_viaja_con_envio`, aunque se llame directo por la URL o la RPC: si la
--      mercadería llega antes que el envío, se recibe por «¿Llegó algo sin aviso?» y se une con su compra (ADR-0636, paso 2), que es el camino
--      que no la deja entrar dos veces al stock.
-- QUÉ NO CAMBIA. Las órdenes del escritorio (`papel_id` nulo) con tienda de destino siguen saliendo «Sin guía» como antes; stock, movimientos,
--   dinero, el aviso de compras pagadas de «sin aviso» (`fn_compras_pagadas_hacia`) y Órdenes de compra.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, solo funciones: sin tablas, políticas ni disparadores (ADR-0195), con `lock_timeout`. Reemplazo
--   ANCLADO: si un ancla no aparece exactamente una vez en la función viva, ABORTA sin cambiar nada (medido el 2026-11-12: una vez cada una;
--   md5 de la definición viva: lista dd27858c…, recibir f4748470…). Sin `select … into` dentro de textos (ADR-0288). Orden con la web: da igual.
-- VERIFICACIÓN (solo lectura): las dos funciones llevan 'ADR-0480: viaja con su envío' en su definición.
-- CÓMO SE DESHACE: volver a pegar la definición de cada una que da `pg_get_functiondef` ANTES de pegar esto (o quitar los dos agregados).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_viaja_con_envio(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position('ADR-0480: viaja con su envío' in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: se esperaba 1 aparición de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 1. La lista de «Sin guía»: solo las órdenes que no salieron de «Mis compras».
select pg_temp.reemplazar_viaja_con_envio(
  'retail.fn_ordenes_directas_por_recibir(uuid)',
  $v$o.estado = 'generada' and not exists$v$,
  $n$o.estado = 'generada' and o.papel_id is null /* ADR-0480: viaja con su envío de Compras, no se recibe sin guía */ and not exists$n$);

-- 2. «Llegó esta orden»: la base la rechaza también, para que la URL o la RPC directa no salten la lista.
select pg_temp.reemplazar_viaja_con_envio(
  'retail.recibir_orden_sin_envio(uuid,uuid)',
  $v$if v_orden.ubicacion_destino_id is null then$v$,
  $n$if exists (select 1 from retail.ordenes_compra oc where oc.id = p_orden_id and oc.papel_id is not null) then
    -- ADR-0480: viaja con su envío de Compras. Si llegó antes que el envío, se recibe «sin aviso» y se une con su compra (ADR-0636).
    raise exception 'Esta compra la manda Compras con su envío: cuando lo mande, sale aquí para recibir. Si ya llegó, usa «¿Llegó algo sin aviso?»'
      using hint = 'orden_viaja_con_envio';
  end if;
  if v_orden.ubicacion_destino_id is null then$n$);

do $comprueba$
declare
  v text;
begin
  foreach v in array array['retail.fn_ordenes_directas_por_recibir(uuid)', 'retail.recibir_orden_sin_envio(uuid,uuid)'] loop
    if position('ADR-0480: viaja con su envío' in pg_get_functiondef(v::regprocedure)) = 0 then
      raise exception 'La migración 20261112153000 no quedó aplicada en %: revisa antes de seguir.', v;
    end if;
  end loop;
end $comprueba$;

reset lock_timeout;
