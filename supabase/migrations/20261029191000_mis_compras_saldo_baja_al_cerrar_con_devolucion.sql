-- ============================================================================
-- Mis compras · el saldo de la compradora baja AL CERRAR con devolución (ADR-0574, actividad 1 de 7).
--
-- EL PROBLEMA PRIMERO. Una compradora cierra su ronda y elige «Lo devuelvo» (S/ 1,400.00). Desde ese momento ya decidió que esa plata no es suya,
-- pero «Tienes para comprar» seguía mostrando S/ 1,400.00 hasta que Compras la recibía en caja y movía el fondo (`recibir_cierre_compras` →
-- `devolver_fondo`). Con razón preguntó: «ya devolví, ¿por qué me sigue apareciendo que tengo 1,400?». Y era peor: mientras no se recibía, la plata
-- parecía gastable para una ronda nueva.
--
-- QUÉ HACE. `fn_mi_plata_tiene` (lo que tiene para comprar, en un solo lugar) resta lo que ya decidió devolver y Compras todavía no recibió:
-- cierres con `decision = 'devuelve'` y `resuelto_en` nulo. Cuando Compras recibe, el fondo baja por `devolver_fondo` y el cierre queda resuelto,
-- así que la resta sale y el fondo la reemplaza: el saldo no vuelve a moverse. Si la ronda se reabre, su cierre se archiva y la resta desaparece
-- (lo que tiene vuelve a ser lo de antes). «Le deben» (puso de su bolsillo) no cambia: su saldo negativo es justo lo que CAYLA le debe.
--
-- No mueve plata ni toca los libros: es una lectura. Solo funciones, sin tablas, políticas ni disparadores (ADR-0195). Idempotente: pegada dos veces
-- no cambia nada (el reemplazo se reconoce a sí mismo).
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

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

select pg_temp.reemplazar('retail.fn_mi_plata_tiene(uuid)',
$v$       - coalesce((select sum(g.monto) from retail.compra_gastos g where g.persona_id = p_persona and g.estado = 'por_completar'), 0);$v$,
$v$       - coalesce((select sum(g.monto) from retail.compra_gastos g where g.persona_id = p_persona and g.estado = 'por_completar'), 0)
       -- Lo que ya decidió devolver al cerrar y Compras todavía no recibió: deja de ser suyo desde que lo decide (ADR-0574).
       - coalesce((select sum(k.monto) from retail.compra_cierres k where k.persona_id = p_persona and k.decision = 'devuelve' and k.resuelto_en is null), 0);$v$, 1);

-- La pantalla arma «Tienes para comprar» con las cifras que manda `fn_mi_plata_compras` (la misma cuenta que la función de arriba): le suma la de lo que
-- ya decidió devolver. Una web que todavía no la lee sigue mostrando lo de antes, y una base que todavía no la manda deja la cuenta como era.
select pg_temp.reemplazar('retail.fn_mi_plata_compras()',
$v$    'gastos_por_completar', coalesce((select sum(g.monto) from retail.compra_gastos g where g.persona_id = v_persona and g.estado = 'por_completar'), 0),$v$,
$v$    'gastos_por_completar', coalesce((select sum(g.monto) from retail.compra_gastos g where g.persona_id = v_persona and g.estado = 'por_completar'), 0),
    'devolucion_por_entregar', coalesce((select sum(k.monto) from retail.compra_cierres k where k.persona_id = v_persona and k.decision = 'devuelve' and k.resuelto_en is null), 0),$v$, 1);
