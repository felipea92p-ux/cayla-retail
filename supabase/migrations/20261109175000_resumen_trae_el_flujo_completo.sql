-- ============================================================================
-- 20261109175000 — El Resumen de Finanzas trae el flujo de caja completo, para no calcularlo dos veces (rendimiento, ADR-0622)
--
-- EL PROBLEMA PRIMERO. Una carga de Finanzas ▸ Resumen calculaba `fn_flujo_caja_proyeccion(6)` DOS veces (~2,2 s cada una en producción,
-- 2026-11-09): una dentro de `fn_resumen_finanzas`, a la que le quitaba los cobros día a día para achicar la respuesta, y otra la página,
-- que sí necesita esos cobros para «Tu caja en las próximas dos semanas» (`getFlujoProximo`). En una base de 2 núcleos, cada cálculo de
-- más es memoria y tiempo que otra pantalla no tiene.
--
-- LO QUE CAMBIA. `fn_resumen_finanzas` devuelve la proyección entera, con sus cobros. La web (`flujoDelResumen`) la usa cuando viene
-- completa y deja de pedirla aparte; si viene sin cobros (una base sin esta migración), la pide como antes: el orden de publicación no
-- importa. Nada más: el resto del resumen, sus permisos y `fn_flujo_caja_proyeccion` no cambian.
--
-- IDÉNTICO. El flujo del resumen es exactamente `fn_flujo_caja_proyeccion(6)`: `pnpm pruebas:resumen-finanzas` lo exige (antes exigía
-- lo mismo menos los cobros).
--
-- ANTES DE PEGAR. Una sola parte: solo `create or replace function` (un reemplazo anclado), sin políticas ni `alter`. Frena si el texto
-- viejo no aparece exactamente una vez y no hace nada si ya está el nuevo: se puede pegar dos veces. Termina con «QUEDÓ BIEN».
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

select pg_temp.reemplazar('retail.fn_resumen_finanzas(uuid,boolean)',
$a$  -- F6 · Las próximas 6 semanas, los días de caja y la semana bajo el mínimo: son de CAYLA entera. Sin los cobros día a día
  -- (son para Escenarios; aquí basta el total de cada semana).
  v_t0 := clock_timestamp();
  if v_todas then
    begin
      v_sec := retail.fn_flujo_caja_proyeccion(6) - 'cobros';$a$,
$n$  -- F6 · Las próximas 6 semanas, los días de caja y la semana bajo el mínimo: son de CAYLA entera. CON los cobros día a día desde
  -- 20261109175000: la página de Resumen los necesita para «Tu caja en las próximas dos semanas» y antes volvía a pedir la proyección entera
  -- aparte (~2 s más por carga); ahora usa esta. Pesa unos KB más en la respuesta.
  v_t0 := clock_timestamp();
  if v_todas then
    begin
      v_sec := retail.fn_flujo_caja_proyeccion(6);$n$, 1);

do $comprobar$
declare v_def text := pg_get_functiondef('retail.fn_resumen_finanzas(uuid,boolean)'::regprocedure);
begin
  if position('fn_flujo_caja_proyeccion(6) - ''cobros''' in v_def) > 0 or position('CON los cobros día a día desde' in v_def) = 0 then
    raise exception '20261109175000: fn_resumen_finanzas no quedó con el flujo completo.';
  end if;
end
$comprobar$;

select '20261109175000 · QUEDÓ BIEN: el Resumen trae el flujo de caja completo' as resultado;
