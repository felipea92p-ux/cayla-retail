-- ============================================================================
-- 20261013195000_anular_venta_misma_sede.sql — CAYLA V2 (Felipe 2026-10-13)
--
-- LA REGLA. Una venta la anula alguien de la tienda donde se vendió, o un líder: la misma regla que ya sigue
-- `corregir_pagos_venta` («Esta venta es de otra tienda: la corrige alguien de esa tienda o un líder») y que siguen
-- `crear_devolucion` y `registrar_cambio`. `anular_venta` es la cuarta puerta sobre una venta ya cobrada y queda con
-- la misma regla, escrita igual, para que las cuatro respondan lo mismo.
--
-- CONTRATO (Liskov)
--   PROMETE: `anular_venta` sobre una venta de otra tienda responde 42501 con hint `venta_de_otra_sede` antes de mirar
--            nada más, salvo que quien la anula sea líder. Una cuenta sin tienda de partida tampoco anula (el `coalesce`
--            a `false`: comparar con NULL no puede dejar pasar). Lo demás de la función queda igual.
--   ASUME:   `fn_es_lider()` y `fn_ubicacion_actual_persona()` (las mismas que usa `corregir_pagos_venta`).
--   NO HACE: no toca tablas, políticas ni disparadores.
--
-- CÓMO SE PEGA. Una sola parte, solo funciones. Reemplazo ANCLADO sobre la definición viva (ADR-0288): el ancla es una
-- línea de código que aparece una sola vez en local y en producción (verificado el 2026-10-13); si no está exactamente
-- una vez, se detiene sin tocar nada. Idempotente: pegarla dos veces no duplica nada. Sin `select … into` dentro de un
-- texto entre comillas (ADR-0288).
-- ============================================================================
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_misma_sede(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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

select pg_temp.reemplazar_misma_sede(
  'retail.anular_venta(uuid, text, jsonb)',
  $v$  if v_venta.estado = 'anulada' then$v$,
  $v$  -- La venta la anula alguien de su tienda o un líder, igual que `corregir_pagos_venta`.
  if not coalesce(retail.fn_es_lider() or v_venta.ubicacion_id = retail.fn_ubicacion_actual_persona(), false) then
    raise exception 'Esta venta es de otra tienda: la anula alguien de esa tienda o un líder.'
      using errcode = '42501', hint = 'venta_de_otra_sede';
  end if;
  if v_venta.estado = 'anulada' then$v$,
  1);
