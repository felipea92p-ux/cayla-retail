-- ============================================================================
-- 20261015002000_finanzas_montos_y_textos_parte1.sql — CAYLA V2 (/chaos de Finanzas, ADR-0412, 2026-10-14) · PARTE 1 de 2
--
-- EL PROBLEMA PRIMERO. /chaos de Finanzas (2026-10-13, repetido el 2026-10-14 sobre main) encontró, solo por la API:
--   1. Un `NaN` que se guarda en el saldo inicial de una cuenta nueva (`crear_cuenta_dinero`), en el monto de un gasto fijo
--      (`guardar_gasto_fijo`), en el mínimo de caja (`guardar_parametros_finanzas`) y en el costo de un activo (`registrar_activo`).
--      En Postgres `NaN` es MAYOR que cualquier número y pasa todo `<= 0`. Un saldo inicial en `NaN` vuelve `NaN` el saldo de esa
--      cuenta para siempre, y con él el Balance y el Flujo de caja. La fase 6 de Compras ya cerró los movimientos de dinero, los gastos
--      y los pagos de compra (20261014192000); quedaban estas tablas.
--   2. Un gasto o un aporte de S/ 99 999 999 se guardaba sin aviso (en producción el gasto mayor es de S/ 850).
--   3. Una descripción de gasto de 5000 letras se guardaba entera.
--
-- LA DECISIÓN (Felipe 2026-10-14). Candados en las tablas, el último guardián sea cual sea la función que escriba:
--   · `<tabla>_montos_finitos` en las once tablas de Finanzas con montos que no lo tenían.
--   · `<tabla>_monto_con_tope`: un gasto y un movimiento de dinero llegan hasta S/ 1 000 000 (decisión de Felipe: frena un dedo pegado
--     en el 9 sin estorbar nada real de tres tiendas y un taller).
--   · `<tabla>_textos_con_tope`: la descripción de un gasto y de un gasto fijo hasta 200 letras, el motivo de anular un gasto hasta 300,
--     y el nombre de un activo hasta 120 y su serie hasta 60. En producción, lo más largo guardado mide 68, 45, 43 y 16 (2026-10-14):
--     nada queda fuera. El nombre de una cuenta (80), su número (40) y la referencia de un movimiento (200) ya tenían su tope desde
--     20260925110000; la pantalla no lo respetaba (ahora sí, `lib/finanzas-topes.ts`).
--
-- CONTRATO (Liskov)
--   PROMETE: ninguna fila nueva o editada viola esos candados. Cada uno nace `not valid` y se valida si ninguna fila vieja lo viola (en
--            producción, ninguna, el 2026-10-14); si alguna lo viola, avisa y el candado vale para lo nuevo.
--   ASUME:   las columnas de esas tablas a la fecha.
--   NO HACE: no toca funciones, datos ni políticas. La caja fuerte sin saldo negativo y el gasto anterior al inicio de Finanzas van en
--            la parte 2 (20261015003000).
--
-- CÓMO SE PEGA. Una sola parte con SOLO `alter table` (ADR-0195: sin políticas, sin funciones), mejor fuera de horario: cada alter toma
-- un candado breve de su tabla (`gastos` y `movimientos_dinero` las escribe la caja). Cada candado se agrega solo si no existe.
-- Idempotente. Antes de la parte 2.
-- ============================================================================
set lock_timeout = '3s';

-- Agrega un CHECK `not valid` si no existe y lo valida si ninguna fila lo viola.
create or replace function pg_temp.candado(p_tabla text, p_nombre text, p_expresion text)
returns void
language plpgsql
as $f$
begin
  if not exists (select 1 from pg_constraint where conname = p_nombre and conrelid = ('retail.' || p_tabla)::regclass) then
    execute format('alter table retail.%I add constraint %I check (%s) not valid', p_tabla, p_nombre, p_expresion);
  end if;
  begin
    execute format('alter table retail.%I validate constraint %I', p_tabla, p_nombre);
  exception when check_violation then
    raise notice 'retail.%: hay filas viejas que no cumplen % — el candado vale para lo nuevo; corrígelas y luego valida a mano.', p_tabla, p_nombre;
  end;
end;
$f$;

-- 1. Ningún monto es NaN ni infinito. `abs(x) < 'Infinity'` es falso para NaN, +∞ y −∞; NULL sigue valiendo.
select pg_temp.candado('cuentas_dinero', 'cuentas_dinero_montos_finitos', $c$abs(saldo_inicial) < 'Infinity'$c$);
select pg_temp.candado('gastos_fijos', 'gastos_fijos_montos_finitos', $c$abs(monto) < 'Infinity'$c$);
select pg_temp.candado('parametros_finanzas', 'parametros_finanzas_montos_finitos',
  $c$abs(minimo_caja) < 'Infinity' and abs(aviso_gasto_pct) < 'Infinity'$c$);
select pg_temp.candado('parametros_tributarios', 'parametros_tributarios_montos_finitos', $c$abs(valor) < 'Infinity'$c$);
select pg_temp.candado('activos_fijos', 'activos_fijos_montos_finitos',
  $c$abs(costo) < 'Infinity' and abs(valor_residual) < 'Infinity' and abs(tasa_anual) < 'Infinity' and abs(depreciacion_apertura) < 'Infinity'$c$);
select pg_temp.candado('presupuestos', 'presupuestos_montos_finitos', $c$abs(monto) < 'Infinity'$c$);
select pg_temp.candado('conciliaciones', 'conciliaciones_montos_finitos', $c$abs(saldo_banco) < 'Infinity'$c$);
select pg_temp.candado('saldos_iniciales', 'saldos_iniciales_montos_finitos', $c$abs(debe) < 'Infinity' and abs(haber) < 'Infinity'$c$);
select pg_temp.candado('diario_cerrado', 'diario_cerrado_montos_finitos', $c$abs(debe) < 'Infinity' and abs(haber) < 'Infinity'$c$);
select pg_temp.candado('periodo_cierres', 'periodo_cierres_montos_finitos',
  $c$abs(total_debe) < 'Infinity' and abs(total_haber) < 'Infinity'$c$);
select pg_temp.candado('dinero_revisados', 'dinero_revisados_montos_finitos', $c$abs(monto) < 'Infinity'$c$);

-- 2. Un gasto y un movimiento de dinero llegan hasta S/ 1 000 000 (Felipe 2026-10-14). El `NaN` lo deja pasar a propósito: Postgres mira
--    los candados por orden de nombre y `_monto_con_tope` va antes que `_montos_finitos`; sin esa salvedad, un `NaN` (que es mayor que
--    todo) rebotaría aquí con «pasa de S/ 1 000 000» en vez de «no es un número» (lo vigila `pruebas:fondos-entradas`).
select pg_temp.candado('gastos', 'gastos_monto_con_tope', $c$monto_total <= 1000000 or monto_total = 'NaN'$c$);
select pg_temp.candado('movimientos_dinero', 'movimientos_dinero_monto_con_tope', $c$monto <= 1000000 or monto = 'NaN'$c$);

-- 3. Los textos con tope (en letras, no en bytes: una «ñ» cuenta una).
select pg_temp.candado('gastos', 'gastos_textos_con_tope',
  $c$char_length(descripcion) <= 200 and char_length(motivo_anulacion) <= 300$c$);
select pg_temp.candado('gastos_fijos', 'gastos_fijos_textos_con_tope', $c$char_length(descripcion) <= 200$c$);
select pg_temp.candado('activos_fijos', 'activos_fijos_textos_con_tope', $c$char_length(nombre) <= 120 and char_length(serie) <= 60$c$);
