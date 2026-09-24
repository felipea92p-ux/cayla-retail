-- ============================================================================
-- 20260923235300_anular_venta_mismo_dia.sql — CAYLA V2 (PL-29)
--
-- DECISIÓN (Felipe, plano maestro PL-29): anular una venta exige el MISMO día calendario de
-- Lima en que se vendió, además de la caja abierta. Se compara `ventas.created_at`, sin
-- columna nueva en `cajas`.
--
-- EL HUECO. `anular_venta` solo pedía que la caja de la venta siguiera abierta. Una caja que
-- queda abierta de un día para otro (nadie la cerró) dejaba anular hoy la venta de ayer:
-- el stock vuelve, el comprobante pendiente se marca «no emitido» y la venta desaparece de
-- un día que ya se contó. A partir del día siguiente, lo que corresponde es Cambio o
-- Devolución, que dejan rastro propio.
--
-- CÓMO. `anular_venta` se parcha EN VIVO en producción (su huella no es la de ningún archivo:
-- ver 20260922224300 y 20260923100000), así que NO se copia entera: se toma la definición
-- viva y se agrega el candado justo después del de la caja, con un ancla de UNA línea que
-- tiene que aparecer exactamente una vez (si no, aborta todo). El texto nuevo usa `\n`
-- explícitos (E'...') para que el parche no dependa de los saltos de línea del archivo.
-- Se puede pegar dos veces: si el candado ya está, no hace nada.
--
-- Huella verificada ANTES (2026-09-23), igual en local y en producción:
--   md5(regexp_replace(pg_get_functiondef('retail.anular_venta(uuid,text,jsonb)'::regprocedure), '\s+', '', 'g'))
--   = 15f8f2744770bc475bb7606c5cff2322
--
-- CÓMO SE DESHACE: volver a aplicar la definición de producción guardada antes de pegar
-- (misma huella de arriba), o quitar las 3 líneas del bloque «PL-29» con el mismo mecanismo.
-- Prueba: `pnpm pruebas:anular-venta-mismo-dia`.
-- ============================================================================

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void language plpgsql as $f$
declare v_def text; v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then return; end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception 'anular venta mismo día: en % se esperaban % apariciones de «%» y hay %', p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- El `end if;` que ya seguía al ancla cierra el `if` nuevo.
select pg_temp.reemplazar(
  'retail.anular_venta(uuid, text, jsonb)',
  'raise exception ''La caja de esta venta ya cerró — a partir de ahí, usa Cambio o Devolución'';',
  'raise exception ''La caja de esta venta ya cerró — a partir de ahí, usa Cambio o Devolución'';'
    || E'\n  end if;'
    || E'\n  -- PL-29: solo el mismo día calendario de Lima en que se vendió.'
    || E'\n  if (v_venta.created_at at time zone ''America/Lima'')::date <> fn_hoy_lima() then'
    || E'\n    raise exception ''Esta venta es de un día anterior — solo se anula el mismo día; usa Cambio o Devolución'';',
  1
);

-- Validación: si el candado no quedó exactamente una vez, se deshace todo.
do $v$
declare v_def text := pg_get_functiondef('retail.anular_venta(uuid, text, jsonb)'::regprocedure);
begin
  if (length(v_def) - length(replace(v_def, '-- PL-29:', ''))) / length('-- PL-29:') <> 1 then
    raise exception 'anular venta mismo día: el candado PL-29 no quedó exactamente una vez';
  end if;
end;
$v$;
