-- ============================================================================
-- 20261019221000_club_puntos_retira_cumple_vale_y_ligado.sql — CAYLA V2 · Club · puntos, actividad 11 de 12 (parte de base): el 10 % de cumpleaños, el vale de aniversario y el ligado retroactivo se retiran
-- Sigue a `20261019220000_club_puntos_conservacion.sql`. Cambia dos funciones: `registrar_venta` (una puerta) y `fn_ligar_ventas_por_documento`.
--
-- EL PROBLEMA. Felipe decidió (2026-10-19): los puntos REEMPLAZAN al 10 % de cumpleaños y al vale de aniversario (el cumpleaños pasa a ser
-- 100 puntos de regalo, sin bono de aniversario), y el historial y los puntos cuentan SOLO desde el registro: al registrar una ficha ya no se
-- le ligan las boletas anteriores con su mismo documento (CL-27). Mientras la base siga aceptando `p_canjear_cumpleanos` y
-- `p_canjear_aniversario`, una pestaña vieja de la caja (o un script) puede descontar un 10 % que ya no existe.
--
-- QUÉ HACE
--   1. `registrar_venta` RECHAZA `p_canjear_cumpleanos` y `p_canjear_aniversario` (hint `beneficio_retirado`), antes de tocar nada. Los
--      parámetros se quedan en la firma (cambiarla rompería a todo llamador y a la cola sin conexión); lo que ya no existe es lo que hacían.
--      El cupón del Club (`p_codigo_descuento`) y el descuento por campaña siguen como siempre.
--   2. `fn_ligar_ventas_por_documento` ya no liga nada y devuelve 0: la llaman `registrar_clienta`, `editar_clienta`, `registrarse_en_el_club`
--      y `tienda_registrar_cuenta`, y con 0 no anotan «ligar_ventas» en la actividad. Unir fichas (`unir_clientas`) NO cambia: sigue moviendo
--      las ventas que YA estaban ligadas a la ficha que se une.
--
-- DECIDÍ: NO borro las tablas ni los datos del 10 % y del vale (`club_canjes`, `club_aniversario_escala`, `configuracion_empresa.club_cumple_pct`):
--   son historia de lo que se canjeó (principio 4: nada se borra) y en producción no hay canjes reales (las fichas son de prueba). Tampoco
--   limpio las ramas de `registrar_venta` que ya no se alcanzan: el cupón nuevo comparte su estructura (reparto por prenda, regla de una sola
--   ventaja), y tocar el centro de las ventas para borrar código muerto es un riesgo que no compra nada. Queda anotado para una limpieza aparte.
-- DESCARTÉ: dejar que los parámetros viejos sigan funcionando «hasta que nadie los use»: un descuento que Felipe ya retiró no puede seguir
--   disponible para quien tenga una pestaña vieja abierta.
-- SE ROMPE SI: alguien vuelve a pegar esta migración DESPUÉS de una que recree `registrar_venta` o `fn_ligar_ventas_por_documento` sin su cambio
--   (se arregla volviendo a pegar esta). `pnpm pruebas:club-puntos-cobrar-cupon` y `pnpm pruebas:club-venta-ligada` lo marcan.
--
-- CÓMO SE PEGA: este archivo SOLO en el SQL Editor de producción, después de `20261019220000`. Idempotente. `lock_timeout` 3 s. Sin políticas ni
--   `drop trigger`. El reemplazo anclado va entre `$v$` y aborta sin tocar nada si la función cambió.
-- CAÍDA EXTERNA. Nada llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El ligado retroactivo se retira (CL-27) ----------
create or replace function retail.fn_ligar_ventas_por_documento(p_clienta_id uuid, p_tipo text, p_numero text)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  -- Retirado el 2026-10-19 (Felipe, programa de puntos): el historial y los puntos de una ficha cuentan solo desde su registro. Las boletas
  -- anteriores con el mismo documento NO se le ligan. Se conserva la función porque cuatro funciones la llaman (con 0 no anotan nada).
  return 0;
end;
$$;
comment on function retail.fn_ligar_ventas_por_documento(uuid, text, text) is
  'RETIRADA (2026-10-19, programa de puntos): ya no liga las boletas anteriores a una ficha nueva (CL-27): el historial y los puntos cuentan solo desde el registro. Devuelve siempre 0. La llaman registrar_clienta, editar_clienta, registrarse_en_el_club y tienda_registrar_cuenta.';
revoke all on function retail.fn_ligar_ventas_por_documento(uuid, text, text) from public, anon, authenticated;

-- ---------- 2. registrar_venta rechaza el 10 % y el vale de aniversario ----------
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
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$  p_canjear_aniversario := coalesce(p_canjear_aniversario, false);
$v$,
  $v$  p_canjear_aniversario := coalesce(p_canjear_aniversario, false);
  -- Programa de puntos (2026-10-19): el 10 % de cumpleaños y el vale de aniversario ya no existen (el cumpleaños regala 100 puntos). Los
  -- parámetros se quedan en la firma por compatibilidad, pero lo que hacían se retiró: se rechazan antes de tocar nada.
  if p_canjear_cumpleanos or p_canjear_aniversario then
    raise exception 'El descuento de cumpleaños y el vale de aniversario ya no existen: ahora el club da puntos y cupones. Quita el canje y vuelve a cobrar.'
      using errcode = '22023', hint = 'beneficio_retirado';
  end if;
$v$,
  1);

reset lock_timeout;
