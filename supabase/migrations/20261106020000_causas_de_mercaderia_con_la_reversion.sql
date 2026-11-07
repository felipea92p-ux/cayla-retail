-- ============================================================================
-- 20261106020000 — Las causas de la 201 ya saben contar una reversión del costo (puente entre #1655 y #1658)
--
-- EL PROBLEMA PRIMERO. `fn_bal_causas_mercaderia` la cambian dos PR abiertos y los dos ya están pegados en producción: las causas de esta tanda
-- (20261106001000 y 20261106002000) y la reversión del costo del Taller (20261105213000, de #1658). Producción tiene la suma de los dos, y cada PR
-- compara con producción lo que deja él solo: ninguno calza, el check «SQL pegado» de ambos sale rojo aunque no falte nada, y como ese check es
-- obligatorio en `main`, ninguno se puede fusionar antes que el otro.
--
-- LA DECISIÓN. Este PR trae el mismo cambio de esa función, con el mismo texto, y queda igual a producción. Una fila `origen = 'reversion'` no existe
-- hasta que entre #1658, así que aquí el `case` nunca toma su primera rama: nada cambia de cifra. Cuando #1658 se aplique encima, su reemplazo ve el
-- texto puesto y no hace nada. No se trae el resto de 20261105213000 (las columnas de `costo_historial`, `revertir_produccion`…): es de #1658.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución. Allá la función ya tiene este texto: no cambia nada, se pega para que sea verdad que todo lo del PR se
-- pegó. Sin políticas ni `drop trigger`. Si el ancla no aparece exactamente una vez, aborta entero. Pegarla dos veces no hace nada.
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

select pg_temp.reemplazar('retail.fn_bal_causas_mercaderia(date,date)',
  $v$-sum((h.stock_previo + h.cantidad_nueva) * h.costo_resultante - h.stock_previo * h.costo_anterior - h.cantidad_nueva * h.costo_unitario_nuevo)$v$,
  $n$-sum(case when h.origen = 'reversion'
                then (h.stock_previo - h.cantidad_nueva) * h.costo_resultante - h.stock_previo * h.costo_anterior + h.cantidad_nueva * h.costo_unitario_nuevo
                else (h.stock_previo + h.cantidad_nueva) * h.costo_resultante - h.stock_previo * h.costo_anterior - h.cantidad_nueva * h.costo_unitario_nuevo end)$n$,
  1);

reset lock_timeout;
