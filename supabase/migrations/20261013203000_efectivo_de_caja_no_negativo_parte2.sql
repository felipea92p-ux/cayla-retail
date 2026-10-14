-- ============================================================================
-- 20261013203000_efectivo_de_caja_no_negativo_parte2.sql — CAYLA V2 (/chaos 2026-10-13, decisión de Felipe 2026-10-13)
--
-- Parte 2 de «el efectivo de una caja abierta nunca queda bajo cero» (la parte 1 explica el problema y crea la regla). Aquí,
-- los disparadores que la llaman, uno por cada forma de sacar efectivo del cajón:
--   · `caja_movimientos`: un egreso (retiro, depósito, gasto en efectivo, devolución de un apartado, préstamo a otra sede, ajuste
--     de faltante, pago a proveedor);
--   · `devoluciones`: una devolución aprobada con reembolso en efectivo;
--   · `cambios`: un cambio cuya diferencia se le devuelve a la clienta en efectivo;
--   · `ventas`: una venta anulada (su efectivo deja de esperarse);
--   · `venta_pagos`: un pago borrado o cambiado (corregir el pago de una venta: el efectivo que pasa a tarjeta deja de esperarse).
-- Todos son de restricción, DIFERIDOS: corren al confirmar la transacción, cuando la operación ya tomó todos sus candados, y miran
-- el resultado final (corregir un pago borra y vuelve a insertar: a mitad de camino el esperado puede verse en negativo).
--
-- CONTRATO (Liskov)
--   PROMETE: lo de la parte 1, en cada uno de esos caminos. Nada más: un ingreso, una venta o un reembolso por otro medio no
--            disparan nada.
--   ASUME:   la parte 1 (20261013202000).
--   NO HACE: no toca funciones, datos ni políticas.
--
-- CÓMO SE PEGA. Una sola parte, DESPUÉS de la parte 1, fuera de horario (crear un disparador toma un candado breve de la tabla).
-- `create or replace` no vale para un disparador de restricción, y `drop trigger` toma en exclusiva las tablas de `auth` y
-- `storage` (ADR-0195): cada uno se crea solo si no existe. Idempotente.
-- ============================================================================
set lock_timeout = '3s';

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'caja_movimientos_efectivo_no_negativo' and tgrelid = 'retail.caja_movimientos'::regclass) then
    create constraint trigger caja_movimientos_efectivo_no_negativo
      after insert or update of tipo, monto, caja_id on retail.caja_movimientos
      deferrable initially deferred
      for each row when (new.tipo = 'egreso')
      execute function retail.trg_efectivo_de_caja();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'devoluciones_efectivo_no_negativo' and tgrelid = 'retail.devoluciones'::regclass) then
    create constraint trigger devoluciones_efectivo_no_negativo
      after insert or update of estado, reembolso_monto, reembolso_metodo, caja_id on retail.devoluciones
      deferrable initially deferred
      for each row when (new.estado = 'aprobada' and new.reembolso_metodo = 'efectivo')
      execute function retail.trg_efectivo_de_caja();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'cambios_efectivo_no_negativo' and tgrelid = 'retail.cambios'::regclass) then
    create constraint trigger cambios_efectivo_no_negativo
      after insert or update of diferencia, metodo_pago_diferencia, caja_id on retail.cambios
      deferrable initially deferred
      for each row when (new.diferencia < 0 and new.metodo_pago_diferencia = 'efectivo')
      execute function retail.trg_efectivo_de_caja();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'ventas_efectivo_no_negativo' and tgrelid = 'retail.ventas'::regclass) then
    create constraint trigger ventas_efectivo_no_negativo
      after update of estado on retail.ventas
      deferrable initially deferred
      for each row when (new.estado = 'anulada' and old.estado is distinct from 'anulada')
      execute function retail.trg_efectivo_de_caja();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'venta_pagos_efectivo_no_negativo' and tgrelid = 'retail.venta_pagos'::regclass) then
    create constraint trigger venta_pagos_efectivo_no_negativo
      after delete or update of metodo, monto, venta_id on retail.venta_pagos
      deferrable initially deferred
      for each row when (old.metodo = 'efectivo')
      execute function retail.trg_efectivo_de_caja();
  end if;
end;
$$;
