-- ============================================================================
-- 20261016182000 — La hoja de cobro anota la máquina: `registrar_venta` guarda la cuenta elegida del cobro con tarjeta o QR
-- (ADR-0429; decisión 3 del ADR-0417; actividad 2 de 6)
--
-- EL PROBLEMA PRIMERO. Desde 20261016173000 la tarjeta y el QR se sellan en la máquina POR DEFECTO de la tienda. En Trujillo
-- y Arequipa hay dos máquinas para la tarjeta (Vendemás e Izipay): cuando la cajera cobra con la otra, el cobro quedaría en la
-- puente equivocada, el depósito de una máquina saldría corto y el de la otra largo. La hoja de cobro ya deja marcarla
-- (actividad 2 de la web); esta migración hace que lo marcado LLEGUE a la base.
--
-- CONTRATO (Liskov)
--   PROMETE: cada pago de `p_pagos` puede traer `cuenta_id` (la cuenta «por depositar» de la máquina marcada). Solo se mira
--            con tarjeta o QR; con cualquier otro medio se ignora. Lo que llega lo VALIDA el sello de siempre
--            (`fn_venta_pagos_sellar` → `fn_cuenta_sellada`): la puente de una máquina que opera en esa tienda con ese medio,
--            o un banco. Si no sirve, el cobro queda «sin cuenta» y la venta NO falla (regla de F3b: el sello nunca tumba
--            una venta). Sin `cuenta_id`, la máquina por defecto, como hasta hoy.
--   ASUME:   la web manda el id tal cual lo leyó de `fn_pos_maquinas_de_sede`; un texto que no es un uuid se trata como
--            «sin máquina» (no tumba la venta con un 22P02).
--   NO HACE: no cambia ningún otro candado de `registrar_venta`; no toca `corregir_pagos_venta` (una corrección de medio se
--            sella con la máquina por defecto).
--
-- CÓMO. Un reemplazo anclado sobre la función VIVA (`pg_temp.reemplazar`, el patrón de 20261014145000) en la única línea que
-- inserta en `venta_pagos`. El ancla es el `insert` entero de 20261001210700 (el mismo texto en producción y en el repo,
-- comprobado el 2026-10-16: aparece una vez en los dos). Aborta sin cambiar nada si no está exactamente una vez. Idempotente.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, después de 20261016173000. Solo una función: no toma ninguna tabla.
-- SE ROMPE SI: una migración futura recrea `registrar_venta` desde un texto del repo anterior a esta: el `cuenta_id` vuelve
-- a ignorarse en silencio y la hoja seguiría marcando una máquina que no llega. `pruebas:pos-maquinas` lo vigila.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

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

-- `registrar_venta` tiene una sola firma (la de 18 parámetros desde el club); si alguien le agregara una sobrecarga, la
-- subconsulta devolvería más de una fila y la migración se detendría sola.
select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_venta'),
$v$    insert into venta_pagos (venta_id, metodo, monto, recibido, referencia)
      values (
        v_venta_id, v_pago ->> 'metodo', (v_pago ->> 'monto')::numeric,
        case when v_pago ->> 'metodo' = 'efectivo' then nullif(v_pago ->> 'recibido', '')::numeric end,
        case when v_pago ->> 'metodo' in ('yape', 'plin', 'transferencia')
             then nullif(left(regexp_replace(coalesce(v_pago ->> 'referencia', ''), '[^0-9A-Za-z]', '', 'g'), 40), '') end
      );$v$,
$n$    insert into venta_pagos (venta_id, metodo, monto, recibido, referencia, cuenta_dinero_id)
      values (
        v_venta_id, v_pago ->> 'metodo', (v_pago ->> 'monto')::numeric,
        case when v_pago ->> 'metodo' = 'efectivo' then nullif(v_pago ->> 'recibido', '')::numeric end,
        case when v_pago ->> 'metodo' in ('yape', 'plin', 'transferencia')
             then nullif(left(regexp_replace(coalesce(v_pago ->> 'referencia', ''), '[^0-9A-Za-z]', '', 'g'), 40), '') end,
        -- ADR-0429: la máquina que cobró (la cuenta «por depositar» que marcó la hoja), solo con tarjeta o QR. El sello la
        -- valida contra la tienda; si no sirve o no es un uuid, el cobro queda «sin cuenta» y la venta sigue.
        case when v_pago ->> 'metodo' in ('tarjeta', 'qr')
              and (v_pago ->> 'cuenta_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then (v_pago ->> 'cuenta_id')::uuid end
      );$n$, 1);
