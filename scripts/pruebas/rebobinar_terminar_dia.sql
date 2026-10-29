-- Rebobina `retail.terminar_dia_compras` al estado de ANTES de 20261029170000 (la versión de un solo parámetro), para las pruebas que pegan migraciones
-- viejas de Compras simple en una base que ya trae la nueva (la del CI y la de producción solo tienen la de dos parámetros).
--
-- POR QUÉ. Esas pruebas (compras_simple_dia, plata, revisar, reabrir…) pegan migraciones de octubre que crean o PARCHAN `terminar_dia_compras(text)`
-- con un reemplazo anclado. En una base que ya pasó por 20261029170000 esa función de un parámetro no existe (el parche falla con «does not exist»)
-- o, si la recrea una migración vieja, queda al lado de la de dos parámetros y toda llamada con un argumento es ambigua («is not unique»).
-- La salida es: ANTES de pegar lo viejo se rebobina (este archivo) y DESPUÉS se pegan otra vez 20261029165000 y 20261029170000, que dejan solo la
-- de dos parámetros, como en producción.
--
-- Idempotente: sin la de dos parámetros (una base anterior a la migración) o con la de un parámetro ya puesta, no hace nada. Las cadenas son las mismas
-- de 20261029170000, al revés.
do $mig$
declare
  v_def text;
begin
  if to_regprocedure('retail.terminar_dia_compras(text)') is not null
     or to_regprocedure('retail.terminar_dia_compras(text,uuid)') is null then
    return;
  end if;
  v_def := pg_get_functiondef('retail.terminar_dia_compras(text,uuid)'::regprocedure);
  v_def := replace(v_def,
    $q$retail.terminar_dia_compras(p_decision text, p_cuenta_indicada_id uuid DEFAULT NULL::uuid)$q$,
    $q$retail.terminar_dia_compras(p_decision text)$q$);
  v_def := replace(v_def,
    $q$  -- La cuenta a la que devolvió (20261029170000): solo con «devuelve», y una a la que Compras pueda recibir (banco o caja fuerte).
  if v_decision = 'devuelve' and p_cuenta_indicada_id is not null
     and not exists (select 1 from retail.cuentas_dinero c
                      where c.id = p_cuenta_indicada_id and c.archivada_en is null and c.tipo in ('banco', 'caja_fuerte')) then
    raise exception 'Elige una cuenta de CAYLA de la lista' using errcode = 'P0001', hint = 'compra_cierre_cuenta';
  end if;

  insert into retail.compra_cierres (persona_id, fecha, decision, monto, cerrado_por, ronda_id, cuenta_indicada_id)$q$,
    $q$  insert into retail.compra_cierres (persona_id, fecha, decision, monto, cerrado_por, ronda_id)$q$);
  v_def := replace(v_def,
    $q$  values (v_actor, v_hoy, v_decision, abs(v_tiene), v_actor, v_ronda,
          case when v_decision = 'devuelve' then p_cuenta_indicada_id end)$q$,
    $q$  values (v_actor, v_hoy, v_decision, abs(v_tiene), v_actor, v_ronda)$q$);
  execute v_def;
  drop function retail.terminar_dia_compras(text, uuid);
  revoke all on function retail.terminar_dia_compras(text) from public, anon;
  grant execute on function retail.terminar_dia_compras(text) to authenticated;
end
$mig$;
