-- ============================================================================
-- 20261015182000_cumpleanos_precio_sin_centimos.sql — CAYLA V2 (Felipe 2026-10-15, ADR-0403 «Actualización 2026-10-15»)
--
-- EL PROBLEMA PRIMERO. El descuento en % ya deja el precio sin céntimos sueltos (ADR-0403, 2026-10-14), pero el 10 % de
-- cumpleaños del club se quedó con su propia cuenta, exacta al céntimo: una blusa de S/ 59.90 se cobraba a S/ 53.91. Felipe,
-- al verlo en la caja: «no me redondea como el otro descuento, haz que también lo redondee para que no salgan esos céntimos
-- de más».
--
-- LA REGLA. La de ADR-0403, sin cambiarle nada: sobre lo que la prenda ya cobraba sin el club (precio − su campaña o su
-- descuento a mano), el % deja el precio final BAJADO AL MÚLTIPLO DE S/ 0.10 de abajo, y la parte del club es lo que falta
-- para llegar ahí. S/ 59.90 al 10 % → 53.91 exacto → 53.90: el club pone 6.00. En cascada (CL-11): 79.90 con su campaña de
-- 20 % (16.00) → 63.90 al 10 % → 57.51 → 57.50, el club pone 6.40. Es `retail.fn_descuento_campana(lo que cobraba, %)`, la
-- misma función que ya usan la campaña y los topes del 15 y del 35 %; la caja hace la MISMA cuenta en
-- `descuentoClubLinea` (apps/web/lib/club-cumple-canje-reglas.ts, que llama a `descuentoUnitarioPorPorcentaje`).
--
-- QUÉ TOCA. Solo `registrar_venta`, con dos reemplazos ANCLADOS sobre su definición VIVA (ADR-0288: se redefinió muchas
-- veces y copiar un cuerpo viejo pisaría lo que vino después). Ninguna tabla, política ni disparador.
--   1. La cuenta: `v_club_calc` pasa de `round((precio − descuento) × pct / 100, 2)` a `fn_descuento_campana(precio −
--      descuento, pct)`.
--   2. LA TRANSICIÓN: el chequeo también acepta la cuenta vieja (con el mismo céntimo de holgura). Una caja con Vender abierto
--      desde antes de publicar la web sigue mandando 5.99 (la pantalla nunca se recarga sola: ADR-0422) y, sin esto, cada
--      canje suyo se rechazaría con `cumple_descuento_distinto` hasta que alguien aprete F5. Con esto, el orden de publicar
--      deja de importar si la base va primero. La cuenta vieja nunca le cobra a la clienta menos que el 10 % del cartel (se
--      redondea al céntimo más cercano), así que aceptarla no regala ni quita nada que no se regalara hasta ayer. Se quita
--      con su propia migración cuando ninguna caja vieja quede abierta (BACKLOG de este día).
--
-- QUÉ NO CAMBIA. El cumpleaños sigue siendo una vez al año, en su mes, sobre toda la compra; quién puede canjear, el monto
-- de `club_canjes` (la suma de lo que mandó la caja) y el comprobante (la suma exacta de las líneas). El vale de aniversario
-- es un monto en soles repartido al céntimo: no es un % y no se toca (ADR-0403: un monto no se redondea).
--
-- CÓMO SE PEGA. Una sola parte (solo una función: sin `alter` de tablas ni políticas, ADR-0195). Idempotente: si el texto
-- nuevo ya está, no hace nada. Si un ancla no aparece exactamente una vez, se detiene sin tocar nada. Dentro de los textos
-- entre comillas no hay ningún `select … into` (ADR-0288).
--
-- PRODUCCIÓN: pegar con OK de Felipe (cambia lo que cobra la caja) ANTES de publicar la web. Con la base nueva y la caja vieja,
-- pasa (transición); con la caja nueva y la base vieja, el canje se rechazaría en casi toda prenda (`cumple_descuento_distinto`,
-- la diferencia llega a 9 céntimos y la holgura es de 1).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- El reemplazo anclado (el mismo de 20261014173000): si el texto nuevo ya está, no hace nada; si el ancla no aparece
-- exactamente `p_veces` veces, se detiene sin tocar nada.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 1. La cuenta del cumpleaños: la regla única del %
-- ----------------------------------------------------------------------------
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$v_club_calc := round(((v_item ->> 'precio_unitario')::numeric - v_descuento) * v_club_pct / 100, 2);$v$,
  $v$v_club_calc := retail.fn_descuento_campana((v_item ->> 'precio_unitario')::numeric - v_descuento, v_club_pct);$v$,
  1);

-- ----------------------------------------------------------------------------
-- 2. La transición: una caja abierta desde antes todavía manda la cuenta vieja
-- ----------------------------------------------------------------------------
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$if abs(v_club - v_club_calc) > 0.01 then$v$,
  $v$if abs(v_club - v_club_calc) > 0.01
         and abs(v_club - round(((v_item ->> 'precio_unitario')::numeric - v_descuento) * v_club_pct / 100, 2)) > 0.01 then  -- transición 20261015182000: la cuenta vieja, de una caja sin recargar$v$,
  1);

comment on function retail.fn_descuento_campana(numeric, numeric) is
  'Descuento por unidad de un %: el precio final baja al múltiplo de S/ 0.10 de abajo y el descuento es lo que falta (S/ 89.90 con 20 % → 71.92 exacto → 71.90, descuenta 18.00). 0 % o vacío no descuenta; 100 % regala. Misma cuenta que descuentoUnitarioPorPorcentaje en la caja; la usan la campaña, los topes del 15 y del 35 % y, desde 20261015182000, el cumpleaños del club (sobre lo que la prenda cobraba sin él).';

-- ---------- Validación final: si algo no quedó como se espera, se aborta TODO ----------
do $$
declare
  v_def text := pg_get_functiondef('retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)'::regprocedure);
begin
  if position('v_club_calc := retail.fn_descuento_campana(' in v_def) = 0 then
    raise exception 'registrar_venta no quedó con la cuenta nueva del cumpleaños';
  end if;
  if position('v_club_calc := round(' in v_def) > 0 then
    raise exception 'registrar_venta todavía calcula el cumpleaños con la cuenta vieja';
  end if;
  if position('transición 20261015182000' in v_def) = 0 then
    raise exception 'registrar_venta no quedó con la transición del cumpleaños';
  end if;
  -- La regla, con los ejemplos del encabezado: 59.90 al 10 % → 6.00; la cascada 63.90 al 10 % → 6.40.
  if retail.fn_descuento_campana(59.90, 10) <> 6.00 or retail.fn_descuento_campana(79.90 - 16.00, 10) <> 6.40 then
    raise exception 'fn_descuento_campana no es la del precio sin céntimos (ADR-0403): pega antes 20261014173000';
  end if;
end;
$$;
