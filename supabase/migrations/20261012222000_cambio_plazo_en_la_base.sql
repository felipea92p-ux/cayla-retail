-- ============================================================================
-- 20261012222000_cambio_plazo_en_la_base.sql — CAYLA V2 (Ventas · Cambios)
--
-- EL PROBLEMA PRIMERO. El plazo de cambio (15 días, impreso en la boleta y el ticket: «Cambios dentro de 15 días») vivía SOLO en
-- la pantalla (`estadoPlazoCambio`, apps/web/lib/cambios-reglas.ts): fuera de plazo, Cambios no deja elegir la prenda. Pero una
-- pestaña abierta desde hace días o una llamada directa a `registrar_cambio` registraba igual un cambio de una compra de hace 90
-- días, con su prenda nueva saliendo del piso. Una regla que protege stock vive en la base; la pantalla solo la anticipa.
--
-- QUÉ HACE.
--   1. `retail.fn_dias_plazo_cambio()`: el número, en un solo lugar de la base (15). La web tiene el suyo (`DIAS_PLAZO_CAMBIO`) y
--      `lib/cambios-plazo-base.test.ts` falla si los dos dejan de coincidir.
--   2. `registrar_cambio` rechaza una compra fuera de plazo con la MISMA cuenta que la pantalla: días calendario de Lima desde el día
--      de la venta (el día 15 todavía se cambia; el 16 no). Sin excepción, igual que la pantalla: Cambios no tiene aprobación de un
--      líder (Devoluciones sí, y ahí fuera de plazo no bloquea: no se toca).
--
-- CÓMO. Reemplazo ANCLADO sobre la definición viva de `registrar_cambio` (20260923110500 y sus parches 20261011100200,
-- 20261012120100, 20261012201000): el candado entra justo después del de venta anulada, antes de escribir nada. Una respuesta que
-- se perdió (mismo token) sigue devolviendo el cambio ya guardado: ese chequeo va antes. Si el ancla no está exactamente una vez,
-- se detiene sin tocar nada; si ya está aplicada, no hace nada. Sin `select … into` entre comillas simples (ADR-0288).
--
-- SE ROMPE SI alguien cambia el plazo en un solo lado (la boleta impresa diría 15 y la base aceptaría otro número): la prueba de
-- la web lo atrapa.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: dos funciones (sin tablas, políticas ni disparadores, ADR-0195).
-- Se puede pegar dos veces.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.fn_dias_plazo_cambio()
returns integer
language sql
immutable
as $$
  select 15;
$$;

comment on function retail.fn_dias_plazo_cambio() is
  'Días calendario (de Lima) desde la venta en que una prenda todavía se cambia. Espejo de DIAS_PLAZO_CAMBIO de la web; una prueba exige que coincidan.';

revoke all on function retail.fn_dias_plazo_cambio() from public, anon;
grant execute on function retail.fn_dias_plazo_cambio() to authenticated;

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

select pg_temp.reemplazar(
  'retail.registrar_cambio(uuid,uuid,uuid,integer,text,uuid,text,text)',
  $v$    raise exception 'Esa venta está anulada — sus prendas ya volvieron al stock, no se pueden cambiar';
  end if;
$v$,
  $v$    raise exception 'Esa venta está anulada — sus prendas ya volvieron al stock, no se pueden cambiar';
  end if;

  -- El plazo de cambio, con la misma cuenta que la pantalla (estadoPlazoCambio): días calendario de Lima desde la venta.
  if retail.fn_hoy_lima() - ((select v.created_at from ventas v where v.id = v_item.venta_id) at time zone 'America/Lima')::date
       > retail.fn_dias_plazo_cambio() then
    raise exception 'Esa compra es del %: el plazo de cambio de % días ya venció.',
      to_char(((select v.created_at from ventas v where v.id = v_item.venta_id) at time zone 'America/Lima')::date, 'DD/MM/YYYY'),
      retail.fn_dias_plazo_cambio()
      using errcode = 'P0001', hint = 'cambio_fuera_de_plazo';
  end if;
$v$,
  1);

reset lock_timeout;
