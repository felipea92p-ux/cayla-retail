-- ============================================================================
-- 20261111152000 — Unir una recepción «sin aviso» con su compra aunque el envío de Compras ya se haya empezado a contar (ADR-0636, act. 2026-11-11)
--
-- EL PROBLEMA PRIMERO. Medido en producción el 2026-11-10/11: en Trujillo la mercadería llegó, se recibió «sin aviso» (ENV-007, ENV-005) y entró al
-- stock; después Compras registró la compra con su envío y alguien apretó «Recibir» en él. Quedaron ENV-009 (2 prendas contadas), ENV-010 (10) y
-- ENV-011 (0) en «Seguir recibiendo» para siempre: si se cierran contando, las prendas entran DOS veces. `unir_recepcion_con_compra` es la salida
-- correcta (anula el envío de Compras sin tocar el stock, la compra ya no se puede volver a mandar y su papel pasa al libro), pero se negaba con
-- `union_envio_con_conteo` en cuanto el envío de Compras tenía UNA prenda contada.
--
-- LA DECISIÓN (Felipe, 2026-11-11: «ya se recibió mercadería sin aviso, ¿cómo regularizamos esos envíos que Compras registró a destiempo?»).
-- Contar no mete stock: lo único que mete stock es recibir. Si el envío de Compras tiene prendas contadas pero NADA recibido, unir lo anula igual y
-- lo contado queda como historia del envío anulado, exactamente como `cancelar_recepcion_envio` (ADR-0605). Lo que ya se RECIBIÓ por el envío de
-- Compras sigue rechazándose (`union_envio_ya_recibido`): ahí sí habría stock doble y lo resuelve una persona.
--
-- QUÉ CAMBIA (dos reemplazos anclados, cada uno con su guarda):
--   · `unir_recepcion_con_compra`: se quita el rechazo `union_envio_con_conteo`; responde además `conteos_descartados` (prendas contadas en los
--     envíos que anuló), para que la pantalla y la Actividad lo digan.
--   · `fn_uniones_posibles`: una pareja cuyo envío de Compras solo está contado ya no sale como «no se puede» (`envio_con_conteo`).
-- QUÉ NO CAMBIA. Stock, `movimientos`, costos, el «llegó menos», el proveedor, la sede ni quién hizo la compra: todas las demás reglas siguen igual.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, sin políticas ni `alter table` (ADR-0195). Va DESPUÉS de 20261110011000 y 20261110022000 (ya en
--   producción el 2026-11-11). Si una de las dos funciones cambió desde entonces y no es la de esta migración, ABORTA sin cambiar nada.
-- VERIFICACIÓN (solo lectura):
--   select position('union_envio_con_conteo' in pg_get_functiondef('retail.unir_recepcion_con_compra(uuid,uuid,uuid)'::regprocedure)) = 0;
-- CÓMO SE DESHACE: volver a pegar la sección 7 de 20261110011000 y la función de 20261110022000. Las uniones ya hechas no se deshacen.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_unir(p_firma text, p_viejo text, p_nuevo text, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicada: no hace nada (se puede pegar dos veces).
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde el 2026-11-11 (el ancla aparece % veces): no se reemplaza. Regenera esta migración desde su definición real.', p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Unir: lo contado sin recibir no frena ----------
-- La variable nueva, en el bloque de declaraciones.
select pg_temp.reemplazar_unir(
  'retail.unir_recepcion_con_compra(uuid,uuid,uuid)',
  $v$  v_paso boolean := false;
  v_motivo text;
begin$v$,
  $n$  v_paso boolean := false;
  v_motivo text;
  v_descartadas integer := 0; -- conteos_descartados
begin$n$,
  'conteos_descartados'
);
-- El rechazo se cambia por la suma de lo que se descarta.
select pg_temp.reemplazar_unir(
  'retail.unir_recepcion_con_compra(uuid,uuid,uuid)',
  $v$    if exists (select 1 from retail.despacho_conteos k where k.despacho_id = v_propio.id and k.contadas > 0) then
      raise exception 'El envío de esa compra (%) ya tiene prendas contadas: no se une sola; revísalo con Compras', retail.fn_envio_numero_texto(v_propio.numero)
        using errcode = 'P0001', hint = 'union_envio_con_conteo';
    end if;$v$,
  $n$    -- ADR-0636 act. 2026-11-11: contar no mete stock. Lo contado sin recibir queda como historia del envío que se anula (como ADR-0605).
    v_descartadas := v_descartadas + coalesce((select sum(k.contadas) from retail.despacho_conteos k where k.despacho_id = v_propio.id), 0)::integer;$n$,
  'ADR-0636 act. 2026-11-11'
);
-- La respuesta (no la de «repetido»: esa no anuló nada ahora).
select pg_temp.reemplazar_unir(
  'retail.unir_recepcion_con_compra(uuid,uuid,uuid)',
  $v$  return jsonb_build_object('unido', true, 'repetido', false, 'papel_id', p_papel_id, 'despacho_id', p_despacho_id,
                            'paso_al_libro', v_paso, 'motivo', v_motivo,$v$,
  $n$  return jsonb_build_object('unido', true, 'repetido', false, 'papel_id', p_papel_id, 'despacho_id', p_despacho_id,
                            'paso_al_libro', v_paso, 'motivo', v_motivo, 'conteos_descartados', v_descartadas,$n$,
  '''conteos_descartados'', v_descartadas'
);
-- Y la Actividad lo dice.
select pg_temp.reemplazar_unir(
  'retail.unir_recepcion_con_compra(uuid,uuid,uuid)',
  $v$                         'prendas_recibidas', v_recibidas, 'envios_anulados', to_jsonb(v_anulados), 'envios_nuevos', to_jsonb(v_nuevos)),$v$,
  $n$                         'prendas_recibidas', v_recibidas, 'envios_anulados', to_jsonb(v_anulados), 'envios_nuevos', to_jsonb(v_nuevos),
                         'conteos_descartados', v_descartadas),$n$,
  '''conteos_descartados'', v_descartadas),'
);

-- ---------- 2. La lista de parejas: contado ya no es «no se puede» ----------
select pg_temp.reemplazar_unir(
  'retail.fn_uniones_posibles(uuid)',
  $v$                    when y.propio_recibido then 'envio_ya_recibido'
                    when y.propio_contado then 'envio_con_conteo' end as motivo$v$,
  $n$                    when y.propio_recibido then 'envio_ya_recibido' end as motivo -- ADR-0636 act. 2026-11-11: contado sin recibir se une$n$,
  'ADR-0636 act. 2026-11-11'
);

-- ---------- Comprobación ----------
do $comprueba$
declare
  v_def text := pg_get_functiondef('retail.unir_recepcion_con_compra(uuid,uuid,uuid)'::regprocedure);
begin
  if position('union_envio_con_conteo' in v_def) > 0 or position('conteos_descartados' in v_def) = 0
     or position('''envio_con_conteo''' in pg_get_functiondef('retail.fn_uniones_posibles(uuid)'::regprocedure)) > 0 then
    raise exception 'La migración 20261111152000 no quedó aplicada entera: revisa antes de seguir.';
  end if;
end $comprueba$;

reset lock_timeout;
