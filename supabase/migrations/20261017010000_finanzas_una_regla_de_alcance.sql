-- ============================================================================
-- 20261017010000_finanzas_una_regla_de_alcance.sql — CAYLA V2 (auditoría de Finanzas 2026-10-16, G16; ADR-0433, actividad 8)
--
-- EL PROBLEMA PRIMERO. Dos funciones hermanas, que leen el MISMO diario, decidían distinto quién ve «todas las tiendas y la empresa»:
--   · `fn_asientos`, `fn_diario_ubicaciones`, `fn_campanas_reporte`, `fn_presupuesto_vs_real`, `fn_cuentas_dinero_*`… preguntan
--     `fn_ve_finanzas_de_todo()` (líder, o un rol a medida con Configuración, Cierre de mes o CAYLA Global), como decidió Felipe en
--     ADR-0253 (2026-09-28): «todo, como el líder», no «solo su tienda».
--   · `fn_diario`, `fn_estado_resultados`, `fn_balance_por_tienda`, `fn_balance_general` y `fn_gastos_fuera_de_lo_normal` se quedaron
--     con `fn_es_lider()`: la migración 20260928220000 cambió unas y dejó estas (la quinta no estaba en el informe: la encontró el
--     candado estructural de la prueba, que busca por lo que hace la función y no por una lista).
-- Resultado: quien cierra el mes congela el diario ENTERO (la empresa incluida), pero al abrir el Estado de resultados esa misma cuenta
-- no ve «De la empresa» ni el consolidado, y el Balance por tienda mide la utilidad de UNA sola tienda (le pasa `v_ubics[1]` a la
-- función del Estado de resultados). Números distintos para el mismo mes según quién mira, sin ningún error. Hoy no se nota: el rol
-- «Producción» tiene Cierre de mes (1 persona activa) y ningún mes está cerrado. Se nota en cuanto se cierre el primero, y la actividad
-- 9 (que hace que el Estado de resultados lea el diario congelado) lo necesita resuelto.
--
-- CÓMO. Un solo predicado, `fn_ve_finanzas_de_todo()`, en las cinco funciones, con reemplazos anclados sobre la definición VIVA (cada
-- texto ancla aparece una vez o la migración aborta; si el texto nuevo ya está, no toca nada). Lo vigila
-- `scripts/pruebas/finanzas_alcance_coherente.mjs`: ninguna función que reparta el alcance con `fn_diario_ubicaciones()` puede
-- preguntar `fn_es_lider()` por su cuenta.
--
-- QUÉ NO CAMBIA (dicho de frente):
--   · Un encargado con «Reportes financieros» sigue viendo SOLO su tienda: `fn_diario_ubicaciones()` le devuelve su sede y
--     `v_todo` queda falso. Pedir otra tienda sigue dando 42501 (caso C de la prueba).
--   · `fn_exigir_lider_balance()` NO se toca: «El Balance de CAYLA entera y sus saldos de arranque los ve el líder» es una puerta
--     explícita de Felipe (no entró en ADR-0253). Sigue siendo de `fn_es_lider()`.
--   · `fn_resumen_finanzas` y `fn_por_pagar_consolidado` también preguntan `fn_es_lider()`, pero no leen el diario ni reparten el alcance
--     con `fn_diario_ubicaciones()`: igualarlas es otra decisión (Felipe) y queda en el backlog.
--   · Quien tiene Configuración, Cierre de mes o CAYLA Global YA veía el Estado de resultados tienda por tienda (la lista de sedes de
--     `fn_diario_ubicaciones()` es toda la empresa para ellos). Lo único que suma esta migración es lo que faltaba para que cuadre con
--     el diario que congelan: «De la empresa» y el consolidado.
--   · EFECTO A NOMBRAR (lo midió la revisión): `fn_presupuesto_vs_real` y `fn_presupuesto_propuesta` leen `fn_estado_resultados`, así que
--     para esas mismas cuentas «Presupuesto vs real» deja de mostrar en CERO el gasto real de «De la empresa» y de CAYLA (subestimado) y pasa a
--     mostrar el del líder; y «Proponer desde el promedio de 3 meses» (Configuración) recibe además la línea de la empresa. Es la misma
--     decisión de ADR-0253 («todo, como el líder»), vista desde otra pantalla. Lo fija el caso B5b de la prueba.
--   · Producción hoy (medido el 2026-10-16, solo lectura): un solo rol tiene alguno de estos módulos (Cierre de mes), con 1 persona y 0
--     terminales; ningún rol tiene Configuración ni CAYLA Global.
--
-- Producción: sin `alter` de tablas en uso y sin políticas (ADR-0195, «Políticas y deadlocks»): se pega entera, de una vez.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.anclar(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición viva.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ── 1. El diario, el Estado de resultados y el Balance por tienda: «ve todo» es la pregunta de las demás ──────────────────
select pg_temp.anclar('retail.fn_diario(date, date, uuid)',
  $v$v_lider boolean := retail.fn_es_lider();$v$,
  $n$v_lider boolean := retail.fn_ve_finanzas_de_todo();$n$);

select pg_temp.anclar('retail.fn_estado_resultados(date, date, uuid)',
  $v$v_lider boolean := retail.fn_es_lider();$v$,
  $n$v_lider boolean := retail.fn_ve_finanzas_de_todo();$n$);

select pg_temp.anclar('retail.fn_balance_por_tienda(date)',
  $v$v_lider boolean := retail.fn_es_lider();$v$,
  $n$v_lider boolean := retail.fn_ve_finanzas_de_todo();$n$);

-- ── 2. El Balance de UNA tienda: quien ve todo puede pedir cualquiera (no cambia nada para nadie hoy; iguala la pregunta) ───────
select pg_temp.anclar('retail.fn_balance_general(date, uuid)',
  $v$if not coalesce(retail.fn_es_lider(), false) and not (p_ubicacion_id = any (retail.fn_diario_ubicaciones())) then$v$,
  $n$if not coalesce(retail.fn_ve_finanzas_de_todo(), false) and not (p_ubicacion_id = any (retail.fn_diario_ubicaciones())) then$n$);

-- ── 3. Los gastos fuera de lo normal: lo de la empresa lo ve quien ve todo (la quinta hermana, no estaba en el informe) ──────
select pg_temp.anclar('retail.fn_gastos_fuera_de_lo_normal(uuid, boolean, date)',
  $v$v_lider boolean := coalesce(retail.fn_es_lider(), false);$v$,
  $n$v_lider boolean := coalesce(retail.fn_ve_finanzas_de_todo(), false);$n$);

notify pgrst, 'reload schema';
