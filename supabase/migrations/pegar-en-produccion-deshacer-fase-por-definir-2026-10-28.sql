-- ============================================================================
-- pegar-en-produccion-deshacer-fase-por-definir-2026-10-28.sql — CAYLA V2 (ADR-0550, DESCARTADA)
--
-- QUÉ DESHACE. La migración `20261028034000_produccion_fase_afuera_por_definir.sql` se pegó en producción el 2026-10-28 y después se decidió NO fusionar su PR (#1422):
-- otra sesión construyó lo mismo con otro diseño («Pendiente de registrar», ADR-0537 act. b: una fase de servicio sin proveedor que no cobra nada y SÍ se opera). Las dos usan
-- «servicio con proveedor nulo» con significados opuestos: el bloqueo de esta (`fase_por_definir`) impediría operar lo que la otra permite. Este script devuelve las tres funciones y el
-- candado a lo que eran antes, para que producción quede igual que `main` (más lo que ya traía de la otra sesión: fechas pasadas, ADR-0537 act. a).
--
-- SEGURO SI no hay una fase de servicio sin proveedor (0 de 28 el 2026-10-28): el candado viejo no la admitiría y el `add constraint` se detendría sin cambiar nada.
-- CÓMO SE PEGA: UNA sola parte (un `alter` de `produccion_fases`, sin políticas). Idempotente: lo que ya está deshecho no se toca.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Cambia `p_nuevo` por `p_viejo` en la función viva; `p_nuevo` tiene que aparecer exactamente una vez. Si no aparece (ya deshecho), no hace nada.
create or replace function pg_temp.deshacer_anclado(p_firma text, p_nuevo text, p_viejo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, p_nuevo, ''))) / length(p_nuevo);
  if v_n = 0 then
    return;
  end if;
  if v_n <> 1 then
    raise exception '% cambió: el texto a deshacer aparece % veces (se esperaba 1). No se tocó nada.', p_firma, v_n;
  end if;
  execute replace(v_def, p_nuevo, p_viejo);
end;
$f$;

-- 1. El candado, como estaba (un servicio lleva proveedor y tarifa, o en el ploteo un fijo por orden).
alter table retail.produccion_fases drop constraint if exists produccion_fases_quien;
alter table retail.produccion_fases add constraint produccion_fases_quien check (
  case when quien = 'servicio'
    then proveedor_id is not null and (tarifa_prenda is not null or (clave = 'ploteo' and fijo_orden > 0))
    else proveedor_id is null and tarifa_prenda is null and fecha_prometida is null and cantidad_minima is null
  end
);

-- 2. fn_produccion_fases_normalizar: ya no acepta `por_definir`.
select pg_temp.deshacer_anclado(
  'retail.fn_produccion_fases_normalizar(jsonb)',
  $v$if v_quien = 'por_definir' then
      v_quien := 'servicio';
    end if;
    v_salida := v_salida || jsonb_build_object($v$,
  $v$v_salida := v_salida || jsonb_build_object($v$
);
select pg_temp.deshacer_anclado(
  'retail.fn_produccion_fases_normalizar(jsonb)',
  $v$if v_quien not in ('taller', 'servicio', 'por_definir') then$v$,
  $v$if v_quien not in ('taller', 'servicio') then$v$
);

-- 3. fn_produccion_operar_fase: fuera el bloqueo `fase_por_definir`.
select pg_temp.deshacer_anclado(
  'retail.fn_produccion_operar_fase(uuid)',
  $v$if v_f.quien = 'servicio' and v_f.proveedor_id is null then
    raise exception 'Falta definir quién hace «%»: elige el proveedor y su tarifa antes de seguir', retail.fn_fase_nombre(v_f.clave) using hint = 'fase_por_definir';
  end if;
  return query select v_f.id, v_f.produccion_id, v_f.ubicacion_id, v_f.clave, v_f.secuencia, v_f.quien,$v$,
  $v$return query select v_f.id, v_f.produccion_id, v_f.ubicacion_id, v_f.clave, v_f.secuencia, v_f.quien,$v$
);

-- 4. abrir_orden_produccion: la actividad de apertura, como estaba.
select pg_temp.deshacer_anclado(
  'retail.abrir_orden_produccion(jsonb, jsonb, jsonb)',
  $v$retail.fn_fase_nombre(f ->> 'clave') || coalesce(' con ' || pr.nombre, ' (por definir)')$v$,
  $v$retail.fn_fase_nombre(f ->> 'clave') || ' con ' || pr.nombre$v$
);
select pg_temp.deshacer_anclado(
  'retail.abrir_orden_produccion(jsonb, jsonb, jsonb)',
  $v$left join retail.proveedores_produccion pr on pr.id = nullif(f ->> 'proveedor_id', '')::uuid$v$,
  $v$join retail.proveedores_produccion pr on pr.id = (f ->> 'proveedor_id')::uuid$v$
);

reset lock_timeout;
