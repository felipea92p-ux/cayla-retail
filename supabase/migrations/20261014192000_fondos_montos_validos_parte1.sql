-- ============================================================================
-- 20261014192000_fondos_montos_validos_parte1.sql — ADR-0362 fase 6 (/chaos 2026-10-14, Felipe 2026-10-14)
--
-- EL PROBLEMA PRIMERO. En Postgres `'NaN'::numeric` es mayor que cualquier número: pasa el `check (monto > 0)` de las tablas de
-- plata, y `round('NaN', 2)` lo deja igual. /chaos (2026-10-14, semilla 1014) mandó «NaN» por la API a `entregar_fondo` y a
-- `registrar_gasto_viaje` y los dos GUARDARON: una sola entrega así dejó en NaN el saldo del fondo, la caja de origen, la 1413 y
-- los totales del Diario (y con el fondo en NaN, su dueña pudo rendir). No era solo de la fase 6: `registrar_movimiento_dinero`
-- también guarda un aporte con NaN. Ventas y Caja lo cerraron el 2026-10-13 (20261013204000); esto es lo mismo para la plata de
-- Finanzas y de los fondos.
--
-- LA DECISIÓN (Felipe 2026-10-14). Un candado en cada tabla: ningún monto es NaN ni infinito (`abs(x) < 'Infinity'` es falso para
-- los dos). En la tabla y no solo en las funciones: así lo cumple también la función que venga. La parte 2 (20261014193000) hace
-- que las funciones del fondo digan QUÉ corregir antes de que el candado rebote con un mensaje técnico.
--
-- QUÉ CANDA
--   · movimientos_dinero (monto, comision) · gastos (monto_total, igv) · compra_pagos (monto) · gastos_viaje_ordenes (monto)
--   · rendiciones_fondo (sus nueve cifras) y rendicion_fondo_items (monto): nacieron en la fase 6.
--
-- CONTRATO (Liskov)
--   PROMETE: desde esta migración, un insert o un update que deje un monto NaN o infinito en esas tablas rebota con 23514. Lo
--            válido pasa igual que antes. La vigila `INV-17` de `scripts/chaos/invariantes.mjs` y `pruebas:fondos-entradas`.
--   ASUME:   las tablas de la fase 6 (20261013181000 … 20261013235000).
--   NO HACE: no toca funciones (parte 2), ni políticas, ni filas.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte, ANTES de la 2: `add constraint … not valid` y después `validate`,
-- tabla por tabla (son chicas); sin políticas ni `drop trigger` (ADR-0195), con `lock_timeout`. Si hubiera filas viejas que no lo
-- cumplen, el candado vale para lo nuevo y queda un aviso para corregirlas a mano (el mismo criterio que 20261013204000).
-- Idempotente.
-- ============================================================================
set lock_timeout = '3s';

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

select pg_temp.candado('movimientos_dinero', 'movimientos_dinero_montos_finitos',
  $c$abs(monto) < 'Infinity' and abs(comision) < 'Infinity'$c$);
select pg_temp.candado('gastos', 'gastos_montos_finitos', $c$abs(monto_total) < 'Infinity' and abs(igv) < 'Infinity'$c$);
select pg_temp.candado('compra_pagos', 'compra_pagos_montos_finitos', $c$abs(monto) < 'Infinity'$c$);
select pg_temp.candado('gastos_viaje_ordenes', 'gastos_viaje_ordenes_montos_finitos', $c$abs(monto) < 'Infinity'$c$);
select pg_temp.candado('rendiciones_fondo', 'rendiciones_fondo_montos_finitos',
  $c$abs(arrastre) < 'Infinity' and abs(entregado) < 'Infinity' and abs(devuelto) < 'Infinity' and abs(pagado) < 'Infinity'
     and abs(gastos) < 'Infinity' and abs(otros) < 'Infinity' and abs(saldo) < 'Infinity' and abs(efectivo) < 'Infinity'
     and abs(faltante) < 'Infinity'$c$);
select pg_temp.candado('rendicion_fondo_items', 'rendicion_fondo_items_montos_finitos', $c$abs(monto) < 'Infinity'$c$);

reset lock_timeout;
