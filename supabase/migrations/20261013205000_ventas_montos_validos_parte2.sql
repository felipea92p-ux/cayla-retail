-- ============================================================================
-- 20261013205000_ventas_montos_validos_parte2.sql — CAYLA V2 (/chaos 2026-10-13, decisiones de Felipe 2026-10-13)
--
-- Parte 2 de «montos válidos en Ventas y Caja» (la parte 1 explica el problema y pone los candados en las tablas). Aquí, las
-- funciones dicen QUÉ corregir antes de que el candado de la tabla rebote con un mensaje técnico:
--   · `fn_monto_valido(n)`: no nulo, ni NaN ni infinito. Queda lista para las funciones de los demás módulos (Producción,
--     Finanzas, Compras), que tienen el mismo hueco y lo cierran con su /chaos.
--   · `abrir_caja` y `cerrar_caja`: el monto de apertura, lo contado y lo trasladado tienen que ser montos de verdad. `cerrar_caja`
--     con lo contado en blanco (NULL) cerraba la caja con las cifras vacías: ahora pide escribirlo.
--   · `registrar_movimiento_caja`: el monto de una entrada o salida.
--   · `aprobar_devolucion`: el reembolso es de cero o más (−500 en efectivo SUBÍA el cajón en 500) y su medio es uno de los cinco
--     de la pantalla.
--
-- CONTRATO (Liskov)
--   PROMETE: esas funciones rechazan con P0001 y un `hint` estable (`monto_invalido`, `reembolso_invalido`,
--            `reembolso_metodo_invalido`) lo que antes guardaban o rebotaba en un CHECK. Lo válido pasa igual que antes.
--   ASUME:   la parte 1 (20261013204000).
--   NO HACE: no toca tablas ni políticas.
--
-- CÓMO SE PEGA. Una sola parte, solo funciones, DESPUÉS de la parte 1. Reemplazos ANCLADOS sobre la definición viva (ADR-0288):
-- cada ancla es una línea de código que aparece una sola vez, en local y en producción (verificado el 2026-10-13). Idempotente.
-- Sin `select … into` dentro de un texto entre comillas.
-- ============================================================================
set lock_timeout = '3s';

create or replace function retail.fn_monto_valido(p_monto numeric)
returns boolean
language sql
immutable
set search_path = retail, public
as $$
  -- NaN es mayor que cualquier número y 'Infinity' existe desde Postgres 14: los dos pasan un `>= 0`. NULL no es un monto.
  select p_monto is not null and abs(p_monto) < 'Infinity'::numeric;
$$;

comment on function retail.fn_monto_valido(numeric) is '¿Es un monto de verdad? No nulo, ni NaN ni infinito (los dos pasan un >= 0).';
revoke all on function retail.fn_monto_valido(numeric) from public, anon;
grant execute on function retail.fn_monto_valido(numeric) to authenticated;

create or replace function pg_temp.reemplazar_montos(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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

select pg_temp.reemplazar_montos(
  'retail.abrir_caja(uuid, numeric, text)',
  $v$  if p_monto_apertura < 0 then$v$,
  $v$  if not retail.fn_monto_valido(p_monto_apertura) then
    raise exception 'Escribe con cuánto efectivo abre el cajón.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if p_monto_apertura < 0 then$v$,
  1);

select pg_temp.reemplazar_montos(
  'retail.cerrar_caja(uuid, numeric, numeric, text, text, uuid)',
  $v$  if p_monto_real < 0 then$v$,
  $v$  if not retail.fn_monto_valido(p_monto_real) then
    raise exception 'Escribe cuánto efectivo contaste en el cajón.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if p_traslado_monto is not null and not retail.fn_monto_valido(p_traslado_monto) then
    raise exception 'El monto que trasladas tiene que ser un número.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if p_monto_real < 0 then$v$,
  1);

select pg_temp.reemplazar_montos(
  'retail.registrar_movimiento_caja(uuid, text, numeric, text, text, boolean, uuid)',
  $v$  if p_monto <= 0 then$v$,
  $v$  if not retail.fn_monto_valido(p_monto) then
    raise exception 'Escribe el monto de la entrada o la salida.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if p_monto <= 0 then$v$,
  1);

select pg_temp.reemplazar_montos(
  'retail.aprobar_devolucion(uuid, numeric, text, uuid)',
  $v$  if coalesce(p_reembolso_monto, 0) > v_valor_pagado then$v$,
  $v$  if p_reembolso_monto is not null and (not retail.fn_monto_valido(p_reembolso_monto) or p_reembolso_monto < 0) then
    raise exception 'El reembolso tiene que ser un monto de cero o más.' using errcode = 'P0001', hint = 'reembolso_invalido';
  end if;
  if p_reembolso_metodo is not null and p_reembolso_metodo not in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia') then
    raise exception 'Elige cómo se le devuelve la plata: efectivo, tarjeta, Yape, Plin o transferencia.'
      using errcode = 'P0001', hint = 'reembolso_metodo_invalido';
  end if;
  if coalesce(p_reembolso_monto, 0) > 0 and p_reembolso_metodo is null then
    raise exception 'Elige cómo se le devuelve la plata.' using errcode = 'P0001', hint = 'reembolso_metodo_invalido';
  end if;
  if coalesce(p_reembolso_monto, 0) > v_valor_pagado then$v$,
  1);
