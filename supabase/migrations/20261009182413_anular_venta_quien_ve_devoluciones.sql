-- ============================================================================
-- 20261009182413_anular_venta_quien_ve_devoluciones.sql — CAYLA V2
--
-- DECISIÓN (Felipe, 2026-10-09): la cuenta de caja (rol «Terminal de ventas») tiene que
-- poder anular una venta. Hasta hoy `anular_venta` abría con `if not fn_es_lider()`, así que
-- solo un líder anulaba: en la tienda, la cajera que se equivocó al cobrar tenía que esperar
-- a que un líder entrara con su cuenta.
--
-- REGLA QUE SE APLICA (ADR-0161 / ADR-0306): «Anular venta» es un botón DENTRO de
-- Devoluciones, no un módulo. Quien ve Devoluciones hace todo lo que hay ahí, salvo lo que
-- es «siempre solo del líder». Anular deja de ser de líder y pasa a ser de quien ve el
-- módulo (`fn_ve_modulo('devoluciones')`, que también es verdadero para el líder).
-- Hoy lo ven los roles «Terminal de ventas» (las tres cajas) e «Integrante».
--
-- LO QUE NO CAMBIA (los candados que hacen segura la anulación siguen todos):
--   · motivo obligatorio y firma del responsable del combo (`fn_actor_persona_id(true)`);
--   · la caja de la venta sigue abierta;
--   · solo el mismo día de Lima en que se vendió (PL-29);
--   · sin comprobante enviado o aceptado por SUNAT (si ya salió, es Cambio o Devolución);
--   · sin cambio ni devolución previa en la venta.
-- Sigue siendo SOLO del líder: aprobar/rechazar devoluciones, anular un comprobante y
-- marcarlo «no emitido» (funciones aparte, no se tocan).
--
-- CÓMO. `anular_venta` se parcha en vivo (ver 20260923235300): se toma la definición viva y
-- se cambia SOLO el candado de líder, con un ancla que debe aparecer exactamente una vez.
-- Se puede pegar dos veces: si el candado nuevo ya está, no hace nada. No toca políticas ni
-- tablas (sin riesgo de deadlock, ADR-0195), y no hay `select … into` en texto entre comillas
-- (ADR-0288).
--
-- Huella verificada ANTES (2026-10-09, producción):
--   md5(pg_get_functiondef('retail.anular_venta(uuid,text,jsonb)'::regprocedure))
--   = 3a7331230e11c4ba12336c3391219796
--
-- CÓMO SE DESHACE: el mismo reemplazo al revés (volver a `if not fn_es_lider() then` con su
-- mensaje «Solo un líder puede anular una venta»).
--
-- EN PRODUCCIÓN desde el 2026-10-09 (MCP `apply_migration`, versión 20261009182413). El archivo lleva esa misma versión: nació
-- como 202610091200xx/1210xx y chocó con `20261009120000_corregir_pagos_venta.sql` de otra rama.
-- ============================================================================

set lock_timeout = '3s';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void language plpgsql as $f$
declare v_def text; v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then return; end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception 'anular venta quien ve devoluciones: en % se esperaban % apariciones de «%» y hay %', p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar(
  'retail.anular_venta(uuid, text, jsonb)',
  E'if not fn_es_lider() then\n    raise exception ''Solo un líder puede anular una venta'';',
  E'if not fn_ve_modulo(''devoluciones'') then\n    raise exception ''Para anular una venta necesitas el módulo Devoluciones'' using errcode = ''42501'';',
  1
);

-- Validación: el candado de líder ya no está y el nuevo quedó exactamente una vez.
do $v$
declare v_def text := pg_get_functiondef('retail.anular_venta(uuid, text, jsonb)'::regprocedure);
begin
  if position('Solo un líder puede anular una venta' in v_def) > 0 then
    raise exception 'anular venta quien ve devoluciones: el candado de líder sigue ahí';
  end if;
  if (length(v_def) - length(replace(v_def, 'fn_ve_modulo(''devoluciones'')', ''))) / length('fn_ve_modulo(''devoluciones'')') <> 1 then
    raise exception 'anular venta quien ve devoluciones: el candado nuevo no quedó exactamente una vez';
  end if;
end;
$v$;
