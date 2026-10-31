-- ============================================================================
-- 20261030235000_estados_financieros_ve_todo_quien_tiene_el_modulo.sql — CAYLA V2 (ADR-0585, actividad 1)
--
-- EL PROBLEMA PRIMERO. Felipe (2026-10-30), al rehacer Finanzas ▸ Reportes como «Estados financieros»: «puede ver todo del módulo
-- quien tenga dicho módulo asignado en roles y accesos». Hoy no es así:
--   · con «Reportes financieros» (la clave del módulo no se renombra) una cuenta ve solo SU tienda: `fn_diario_ubicaciones()` le
--     devuelve su sede, y el Estado de resultados, el diario, el Balance por tienda, el presupuesto y las campañas se topan ahí;
--   · el Flujo de efectivo y su proyección piden `fn_flujo_exigir_lider()`, y el Balance de CAYLA entera con su comprobación y sus
--     saldos de arranque, `fn_exigir_lider_balance()`: el encargado con el módulo abría la pestaña y leía «lo ve el líder».
--
-- POR QUÉ NO SE AMPLÍA `fn_ve_finanzas_de_todo()`. Sería una línea, pero esa regla es también la puerta de ESCRIBIR: `fn_gastos_puede`
-- la usa para `registrar_gasto` y los gastos fijos (20260928220000, 2d). Sumarle el módulo de reportes daría a quien solo debe MIRAR
-- el permiso de registrar gastos de cualquier tienda o de la empresa. Por eso nace una regla aparte, solo de lectura:
--   · `fn_ve_estados_financieros_de_todo()`: el líder, o una cuenta con el módulo que no es una terminal;
--   · `fn_ve_diario_de_todo()`: la de siempre (`fn_ve_finanzas_de_todo()`) o la de arriba. Es la que preguntan las doce lecturas que
--     reparten el alcance con `fn_diario_ubicaciones()`, para que las doce digan lo mismo (G16, ADR-0433: una sola regla de alcance);
--   · `fn_exigir_estados_financieros_de_todo()`: la puerta del flujo, la proyección y el Balance entero (con su comprobación y la lectura
--     de los saldos de arranque).
--
-- QUÉ NO CAMBIA (dicho de frente):
--   · Escribir: `registrar_saldo_inicial` sigue en `fn_exigir_lider_balance()` (solo el líder), y registrar gastos sigue en
--     `fn_gastos_puede` / `fn_ve_finanzas_de_todo()`. Esta migración no le da a nadie un permiso de escritura.
--   · Una TERMINAL (el aparato compartido del mostrador) con el módulo sigue viendo solo su tienda: el mismo criterio de ADR-0161 P6
--     que deja fuera de las terminales a Colaboradores, Roles, Actividad y CAYLA Global. CAYLA entera no se muestra en un aparato que
--     usa cualquiera en la tienda.
--   · Quien tiene Cierre de mes, Configuración o CAYLA Global sin este módulo: ve lo mismo que antes. El Balance entero y el flujo los
--     abre el módulo, no esos tres (caso B6 de la prueba).
--   · Sin el módulo: nada (casos D).
--   · `fn_resumen_finanzas` y `fn_por_pagar_consolidado` siguen preguntando `fn_es_lider()` (no reparten con `fn_diario_ubicaciones()`).
--     Igualarlas es otra decisión, en el backlog desde G16.
--   · `fn_flujo_exigir_lider()` queda sin llamadores y no se borra: una función plpgsql no registra quién la llama, y borrarla rompería en
--     silencio a quien la llame en una base que no sea esta.
--
-- CÓMO. Reemplazos anclados sobre la definición VIVA (cada texto ancla aparece una vez o la migración aborta sin tocar nada; si el texto
-- nuevo ya está, no toca nada), como 20261017033000. Lo vigila `scripts/pruebas/finanzas_alcance_coherente.mjs`.
--
-- Producción: sin `alter` de tablas en uso y sin políticas (ADR-0195, «Políticas y deadlocks»): se pega entera, de una vez.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ── 1. Las tres reglas nuevas ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function retail.fn_ve_estados_financieros_de_todo()
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(retail.fn_es_lider(), false)
      or (retail.fn_capacidad_por_modulos(array['reportes_financieros'])
          and not exists (select 1 from retail.fn_terminal_actual()));
$$;
comment on function retail.fn_ve_estados_financieros_de_todo() is
  'ADR-0585: ¿la cuenta ve los Estados financieros de CAYLA entera? El líder, o quien tiene el módulo (reportes_financieros) y no es una terminal. Solo LEER: no abre ninguna escritura.';

create or replace function retail.fn_ve_diario_de_todo()
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(retail.fn_ve_finanzas_de_todo(), false) or retail.fn_ve_estados_financieros_de_todo();
$$;
comment on function retail.fn_ve_diario_de_todo() is
  'ADR-0585: el alcance de las lecturas del diario (todas las tiendas, la empresa y el consolidado). Quien ve las finanzas de todo (ADR-0253) o los Estados financieros de todo. Solo LEER: escribir sigue en fn_ve_finanzas_de_todo().';

create or replace function retail.fn_exigir_estados_financieros_de_todo()
returns void
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_ve_estados_financieros_de_todo() then
    raise exception 'Esto es de CAYLA entera: lo ve quien tiene «Estados financieros» en su rol.' using errcode = '42501';
  end if;
end $$;
comment on function retail.fn_exigir_estados_financieros_de_todo() is
  'ADR-0585: la puerta del flujo de efectivo, su proyección y el Balance de CAYLA entera (con su comprobación y la lectura de los saldos de arranque).';

revoke all on function retail.fn_ve_estados_financieros_de_todo(), retail.fn_ve_diario_de_todo(),
  retail.fn_exigir_estados_financieros_de_todo() from public, anon;
grant execute on function retail.fn_ve_estados_financieros_de_todo(), retail.fn_ve_diario_de_todo(),
  retail.fn_exigir_estados_financieros_de_todo() to authenticated, service_role;

-- La puerta que queda solo para escribir los saldos de arranque: su mensaje ya no promete «tu tienda».
create or replace function retail.fn_exigir_lider_balance()
returns void
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not coalesce(retail.fn_es_lider(), false) then
    raise exception 'Los saldos de arranque los registra el líder.' using errcode = '42501';
  end if;
end $$;

-- ── 2. El reemplazo anclado (nombre propio: `pg_temp.anclar` ya existe con otra firma en la sesión del CLI) ─────────────────
create or replace function pg_temp.anclar_eeff(p_firma text, p_viejo text, p_nuevo text)
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

-- ── 3. Las doce lecturas que reparten con fn_diario_ubicaciones(): «ve todo» es fn_ve_diario_de_todo() ──────────────────────
select pg_temp.anclar_eeff(f, 'retail.fn_ve_finanzas_de_todo()', 'retail.fn_ve_diario_de_todo()')
from unnest(array[
  'retail.fn_diario_ubicaciones()',
  'retail.fn_asientos(date, date, uuid)',
  'retail.fn_diario(date, date, uuid)',
  'retail.fn_estado_resultados(date, date, uuid)',
  'retail.fn_balance_por_tienda(date)',
  'retail.fn_balance_general(date, uuid)',
  'retail.fn_campanas_reporte(uuid)',
  'retail.fn_presupuesto_vs_real(date, uuid, date)',
  'retail.fn_periodos_mes(date)',
  'retail.fn_gastos_fuera_de_lo_normal(uuid, boolean, date)',
  'retail.fn_planilla_provision(date, date, uuid)',
  'retail.fn_claure_ventas_en(date, date, uuid)'
]) f;

-- ── 4. El flujo y su proyección ───────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.anclar_eeff(f, 'retail.fn_flujo_exigir_lider()', 'retail.fn_exigir_estados_financieros_de_todo()')
from unnest(array['retail.fn_flujo_caja_real(date, date)', 'retail.fn_flujo_caja_proyeccion(integer)']) f;
-- Los dos parten de la plata que hay hoy (`fn_flujo_disponible`), que suma los saldos de `fn_cuentas_dinero_saldos`: sin esto, quien
-- tiene el módulo pasaba la puerta del flujo y caía en «Ver las cuentas necesita el módulo Cuentas y dinero». Solo LEER: esa función
-- la llaman únicamente dos lecturas (el flujo y el Resumen, medido el 2026-10-30), ninguna escritura.
select pg_temp.anclar_eeff('retail.fn_cuentas_dinero_saldos(date, uuid)',
  'v_lider boolean := retail.fn_ve_finanzas_de_todo();', 'v_lider boolean := retail.fn_ve_diario_de_todo();');
-- La proyección suma además lo que se debe (`fn_por_pagar_consolidado`), que pedía el líder o, con Cuentas y dinero, solo la tienda
-- propia. La misma regla: también la llaman solo dos lecturas (la proyección y el Resumen).
select pg_temp.anclar_eeff('retail.fn_por_pagar_consolidado(uuid, date, boolean)',
  'v_lider boolean := retail.fn_es_lider();', 'v_lider boolean := retail.fn_ve_estados_financieros_de_todo();');
-- Y los gastos fijos que vienen y el IGV de los meses, con candado de Gastos y de Impuestos. Mismo criterio: los llaman solo
-- lecturas (la proyección, el Resumen, la confianza y el panel de Impuestos), ninguna escritura.
select pg_temp.anclar_eeff('retail.fn_gastos_fijos_mes(date, uuid, boolean)',
  'v_lider boolean := retail.fn_ve_finanzas_de_todo();', 'v_lider boolean := retail.fn_ve_diario_de_todo();');
select pg_temp.anclar_eeff('retail.fn_impuestos_igv_meses(date, date)',
  'if not retail.fn_puede_ver_impuestos() then', 'if not (retail.fn_puede_ver_impuestos() or retail.fn_ve_estados_financieros_de_todo()) then');

-- ── 5. El Balance de CAYLA entera, su comprobación y la LECTURA de los saldos de arranque (registrarlos sigue siendo del líder) ──
select pg_temp.anclar_eeff(f, 'retail.fn_exigir_lider_balance()', 'retail.fn_exigir_estados_financieros_de_todo()')
from unnest(array[
  'retail.fn_balance_general(date, uuid)',
  'retail.fn_conciliacion_contable(date)',
  'retail.fn_saldos_iniciales()',
  'retail.fn_saldos_iniciales_propuesta(date)'
]) f;

-- ── 6. Lo que dice Roles y accesos del módulo ───────────────────────────────────────────────────────────────────────────────
-- Decía «…y el balance de su tienda»: con esta migración ya no es cierto. Y «Reportes» pasó a llamarse «Estados financieros» (Felipe
-- 2026-10-30); el módulo abre también el Resumen. La clave (`reportes_financieros`) no cambia.
update retail.modulos
   set nombre = 'Resumen y estados financieros',
       incluye = 'Ver el resumen y los estados financieros de CAYLA entera: lo que se ganó, dónde está la plata, cuánto vale y cuánto creció lo tuyo; el presupuesto y cómo rindieron las campañas'
 where clave = 'reportes_financieros';

comment on function retail.fn_diario_ubicaciones() is
  'Las ubicaciones cuyos números financieros ve la cuenta: todas para quien ve el diario de todo (fn_ve_diario_de_todo: el líder, ADR-0253 y, desde ADR-0585, quien tiene Estados financieros); la suya para una terminal con el módulo; ninguna sin él.';
