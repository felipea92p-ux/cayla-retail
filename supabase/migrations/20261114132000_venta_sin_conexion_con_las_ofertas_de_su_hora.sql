-- ============================================================================
-- 20261114132000 — Una venta sin conexión se mide con las ofertas de la hora en que se hizo, no con las de la hora en que sube (ADR-0655,
--                  Felipe 2026-11-14)
--
-- EL PROBLEMA. `registrar_venta` exige las campañas y las ofertas que rigen HOY (`fn_hoy_lima()`, el día en que la venta llega a la base). Una
--   venta hecha sin internet a las 23:50 la víspera del Black Friday sube a las 00:05: el Black Friday ya rige, la caja no lo dio (no regía) y
--   la base la rechaza (`venta_campana_omitida`, `venta_grupo_omitido`). Rechazada, la cola sin conexión la aparta hasta un «Descartar» a mano
--   (`lib/cola-offline.ts`): la plata está en el cajón y la prenda se fue, sin venta, sin movimiento de stock y sin comprobante. Le pasaba
--   también a las campañas de siempre. La tolerancia de 3 días cubría las que TERMINARON entre la venta y la subida, no las que EMPEZARON.
--
-- LO QUE HACE.
--   1. `fn_dia_de_la_venta()`: el día de Lima de la hora declarada de la venta (`x-momento`, la que la cola sin conexión ya manda y con la
--      que ya firma el responsable: «vale la hora de la venta», Felipe 2026-09-22). Sin esa hora, con una hora rota, futura o de hace más de
--      3 días (la tolerancia de las campañas), hoy: una venta en línea no cambia.
--   2. `registrar_venta` mide con ese día lo que exige (la campaña y la oferta de grupo que regían) y lo que acepta (con la misma tolerancia).
--   Es lo que hacen los líderes: Shopify POS sube la venta sin conexión con lo que se cobró y no la recalcula; Lightspeed dice que lo cobrado
--   sin conexión es lo final.
--
-- QUÉ NO HACE. No cambia el día de lo demás (el cumpleaños y el vale del Club siguen con hoy). Quien falseara la hora solo podría saltarse una
--   oferta que empezó hace 3 días o menos: le cobraría MÁS al cliente, nunca menos.
-- SE ROMPE SI: alguien cambia esas líneas de `registrar_venta` antes de pegar esto: el ancla no aparece y se detiene sin aplicar nada. Las suites
--   que deshacen los parches de la venta lo conocen (`DESHACER_DIA_VENTA` en `scripts/pruebas/registrar-venta-antes-de-precio-sede.mjs`).
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s; solo funciones. Va DESPUÉS de 20261114011000 (la caja cobra las ofertas de
--   grupo).
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:caja-ofertas-de-grupo` («Una venta sin conexión»); las suites que deshacen la venta, con `DESHACER_DIA_VENTA`.
-- ============================================================================

set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('retail.fn_exigir_ofertas_de_grupo(jsonb, uuid, date)') is null then
    raise exception 'Falta 20261114011000 (la caja cobra las ofertas de grupo): esta migración va después. No se aplicó nada.';
  end if;
end;
$$;

create or replace function retail.fn_dia_de_la_venta()
returns date
language plpgsql
stable
set search_path to 'retail', 'public'
as $function$
declare
  v_headers json;
  v_texto text;
  v_momento timestamptz;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  v_texto := nullif(trim(v_headers ->> 'x-momento'), '');
  if v_texto is null then
    return retail.fn_hoy_lima();
  end if;
  begin
    v_momento := v_texto::timestamptz;
  exception when others then
    return retail.fn_hoy_lima();
  end;
  -- Solo una hora pasada y cercana: la de una venta sin conexión, dentro de la tolerancia de las campañas (3 días).
  if v_momento > now() + interval '5 minutes' or v_momento < now() - interval '3 days' then
    return retail.fn_hoy_lima();
  end if;
  return least(retail.fn_hoy_lima(), (v_momento at time zone 'America/Lima')::date);
end;
$function$;

comment on function retail.fn_dia_de_la_venta() is
  'ADR-0655 (Felipe 2026-11-14). El día de Lima de la hora declarada de una venta sin conexión (x-momento), o hoy. registrar_venta mide con él las campañas y las ofertas de grupo que exige y acepta.';

revoke all on function retail.fn_dia_de_la_venta() from public, anon, authenticated;

create or replace function pg_temp.reemplazar_dia_venta(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text := pg_get_functiondef(p_firma::regprocedure);
  v_n integer;
begin
  if position(p_nuevo in v_def) > 0 then
    return; -- ya aplicado
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba %). No se aplicó nada.', p_firma, v_n, p_veces;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_dia_venta(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$  v_hoy date := fn_hoy_lima();$v$,
  $n$  v_hoy date := fn_hoy_lima();
  v_dia_venta date := retail.fn_dia_de_la_venta();  -- ADR-0655: las ofertas que regían a la hora de la venta (sin conexión), o hoy$n$,
1);

select pg_temp.reemplazar_dia_venta(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$perform retail.fn_exigir_ofertas_de_grupo(p_items, p_ubicacion_id, v_hoy);$v$,
  $n$perform retail.fn_exigir_ofertas_de_grupo(p_items, p_ubicacion_id, v_dia_venta);$n$,
1);

select pg_temp.reemplazar_dia_venta(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$fn_campanas_en_sede(v_hoy, 0, array[$v$,
  $n$fn_campanas_en_sede(v_dia_venta, 0, array[$n$,
1);

select pg_temp.reemplazar_dia_venta(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$fn_campanas_en_sede(v_hoy, c_tolerancia_campana, array[$v$,
  $n$fn_campanas_en_sede(v_dia_venta, c_tolerancia_campana, array[$n$,
1);
