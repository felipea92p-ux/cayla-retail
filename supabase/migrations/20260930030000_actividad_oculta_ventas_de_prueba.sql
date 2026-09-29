-- ============================================================================
-- 20260930030000_actividad_oculta_ventas_de_prueba.sql — CAYLA V2
--
-- DECISIÓN (Felipe, 2026-09-29): el panel de Actividad no muestra las ventas archivadas como prueba.
--
-- EL PROBLEMA. Una venta de prueba se archiva con `ventas.es_prueba = true` (ADR-0159) y desaparece del Historial de
-- ventas, de Existencias y de Finanzas. Pero `fn_actividad` no mira esa marca: el panel «Actividad · Punto de venta» y
-- el Inicio siguen contando «vendió 1 prenda por S/ 59.90 · B001-000001» de una venta que solo fue para
-- entender el sistema, y confunden a quien lee el día de una tienda.
--
-- POR QUÉ NO SE BORRAN LAS FILAS. `retail.actividad` es de solo agregar (ADR-0207): un disparador rechaza `UPDATE` y
-- `DELETE` a propósito, y quedaría sin rastro de quién vendió qué, incluso de una boleta que la SUNAT ya aceptó. La
-- fila queda intacta; lo que cambia es qué muestra el lector. Es la misma regla que el resto del ERP: «archivar con
-- marca de prueba, nunca borrar» (D-54).
--
-- QUÉ CAMBIA. `fn_actividad` y `fn_actividad_personas` dejan fuera toda fila de `tabla = 'ventas'` cuyo `registro_id`
-- sea una venta con `es_prueba`. Es por la venta, no por la fila: la venta registrada y su anulación desaparecen
-- juntas, hayan nacido antes o después de marcarla. Las demás tablas (cajas, cambios…) no se tocan. Quien solo tiene
-- filas ocultas tampoco aparece en el filtro «Persona» (elegirlo mostraría una lista vacía).
--
-- CÓMO. Las dos funciones se parchan EN VIVO, sin copiar el archivo viejo: se toma la definición que hay en la base y
-- se le agrega una línea antes de un ancla que tiene que aparecer exactamente UNA vez (si no, aborta todo). Mismo
-- mecanismo que `20260923235300_anular_venta_mismo_dia.sql`. Se puede pegar dos veces: si la línea ya está, no hace nada.
-- `create or replace function` no toma los bloqueos de `auth`/`storage` (ADR-0195): se pega en una sola parte.
--
-- Huellas de las definiciones ANTES (2026-09-29, producción):
--   md5(regexp_replace(pg_get_functiondef('retail.fn_actividad(text,uuid,uuid,timestamptz,timestamptz,timestamptz,bigint,integer)'::regprocedure), '\s+', '', 'g'))
--     = 137ac0bc64bb3fa4575e2d61209f611a
--   md5(regexp_replace(pg_get_functiondef('retail.fn_actividad_personas(uuid,text)'::regprocedure), '\s+', '', 'g'))
--     = 124e966853f99d765a5ac6a40eb2ffe8
--
-- CÓMO SE DESHACE: volver a aplicar esas dos definiciones (quitar la línea «ADR-0159/0278» de cada una).
-- Prueba: `pnpm pruebas:actividad-oculta-ventas-de-prueba`.
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
    raise exception 'actividad oculta ventas de prueba: en % se esperaban % apariciones de «%» y hay %', p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- La línea nueva va justo antes del filtro por módulo, con la misma sangría que las demás condiciones del `where`.
-- `coalesce(…, false)`: una fila sin tabla o sin registro nunca se oculta por accidente.
select pg_temp.reemplazar(
  'retail.fn_actividad(text, uuid, uuid, timestamptz, timestamptz, timestamptz, bigint, integer)',
  'and (p_modulo is null or a.modulo = p_modulo)',
  'and not coalesce(a.tabla = ''ventas'' and a.registro_id in (select v.id::text from retail.ventas v where v.es_prueba), false) -- ADR-0159/0278'
    || E'\n     and (p_modulo is null or a.modulo = p_modulo)',
  1
);

select pg_temp.reemplazar(
  'retail.fn_actividad_personas(uuid, text)',
  'and (p_modulo is null or a.modulo = p_modulo)',
  'and not coalesce(a.tabla = ''ventas'' and a.registro_id in (select v.id::text from retail.ventas v where v.es_prueba), false) -- ADR-0159/0278'
    || E'\n     and (p_modulo is null or a.modulo = p_modulo)',
  1
);

-- Validación: la línea tiene que estar exactamente una vez en cada función, o se deshace todo.
do $v$
declare
  v_firma text;
  v_def text;
begin
  foreach v_firma in array array[
    'retail.fn_actividad(text, uuid, uuid, timestamptz, timestamptz, timestamptz, bigint, integer)',
    'retail.fn_actividad_personas(uuid, text)'
  ] loop
    v_def := pg_get_functiondef(v_firma::regprocedure);
    if (length(v_def) - length(replace(v_def, '-- ADR-0159/0278', ''))) / length('-- ADR-0159/0278') <> 1 then
      raise exception 'actividad oculta ventas de prueba: la línea de %  no quedó exactamente una vez', v_firma;
    end if;
  end loop;
end;
$v$;
