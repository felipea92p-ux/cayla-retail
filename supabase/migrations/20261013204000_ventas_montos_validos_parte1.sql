-- ============================================================================
-- 20261013204000_ventas_montos_validos_parte1.sql — CAYLA V2 (/chaos 2026-10-13, decisiones de Felipe 2026-10-13)
--
-- EL PROBLEMA PRIMERO. Tres huecos de los montos de Ventas y Caja que /chaos encontró el 2026-10-13:
--   1. `'NaN'::numeric` pasa todos los CHECK `>= 0` y `> 0` (en Postgres NaN es MAYOR que cualquier número), y `'Infinity'` también:
--      una apertura de caja en NaN, un cierre en NaN, un egreso en NaN quedaban guardados, y desde ahí cualquier suma que los toque
--      (el esperado de la caja, el total del día) da NaN. Solo por la API (la pantalla no lo manda), pero la base tiene que cuidarlo.
--   2. El «recibido» del efectivo no tenía tope: S/ 1 000 000 recibidos por una venta de S/ 79.90 dejaban un vuelto de un millón en
--      el ticket y en la cuenta del cajón. Felipe fijó el tope del vuelto en S/ 500 (2026-10-13).
--   3. `aprobar_devolucion` guardaba un reembolso negativo (−500 en efectivo SUBÍA el esperado de la caja en 500) o con un medio
--      inventado.
--
-- LA DECISIÓN. Candados en las tablas (el último guardián, sea cual sea la función que escriba):
--   · `<tabla>_montos_finitos` en cada tabla de dinero de Ventas y Caja: ninguna de sus columnas numéricas es NaN ni infinita.
--   · El «recibido» (venta_pagos y separacion_pagos): efectivo, cubre el monto y el vuelto no pasa de S/ 500.
--   · Devoluciones: el reembolso es ≥ 0 (y finito); su medio es uno de los cinco de la pantalla; un reembolso > 0 lleva su medio.
--   Los mensajes en castellano los da la parte 2 (las funciones validan antes y dicen qué corregir); esto es el respaldo.
--
-- CONTRATO (Liskov)
--   PROMETE: ninguna fila nueva o editada viola esos candados. Las filas viejas no se tocan: cada CHECK nace `not valid` y se valida
--            solo si ninguna fila lo viola (en producción, ninguna, el 2026-10-13); si alguna lo viola, avisa y el candado vale para
--            lo nuevo.
--   ASUME:   las columnas de esas tablas a la fecha.
--   NO HACE: no toca funciones (parte 2), datos ni políticas.
--
-- CÓMO SE PEGA. Una sola parte con SOLO `alter table` (ADR-0195: sin políticas, sin funciones), fuera de horario: cada alter toma
-- un candado breve de su tabla. Cada candado se agrega solo si no existe. Idempotente.
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

-- 1. Ningún monto es NaN ni infinito (los dos pasan los `>= 0`: en Postgres NaN es mayor que todo número, y desde Postgres 14 un
--    `numeric` acepta 'Infinity'). `abs(x) < 'Infinity'` es falso para NaN, +∞ y −∞, y NULL (un monto vacío) sigue valiendo.
select pg_temp.candado('cajas', 'cajas_montos_finitos',
  $c$abs(monto_apertura) < 'Infinity' and abs(monto_cierre_sistema) < 'Infinity' and abs(monto_cierre_real) < 'Infinity'
     and abs(diferencia) < 'Infinity' and abs(monto_fondo) < 'Infinity' and abs(monto_apertura_esperado) < 'Infinity'
     and abs(fondo_requerido) < 'Infinity'$c$);
select pg_temp.candado('caja_movimientos', 'caja_movimientos_montos_finitos', $c$abs(monto) < 'Infinity'$c$);
select pg_temp.candado('caja_traslados', 'caja_traslados_montos_finitos', $c$abs(monto) < 'Infinity'$c$);
select pg_temp.candado('venta_pagos', 'venta_pagos_montos_finitos', $c$abs(monto) < 'Infinity' and abs(recibido) < 'Infinity'$c$);
select pg_temp.candado('venta_items', 'venta_items_montos_finitos',
  $c$abs(precio_unitario) < 'Infinity' and abs(descuento_unitario) < 'Infinity' and abs(costo_unitario) < 'Infinity'
     and abs(descuento_club_unitario) < 'Infinity'$c$);
select pg_temp.candado('ventas', 'ventas_montos_finitos', $c$abs(descuento_pct) < 'Infinity'$c$);
select pg_temp.candado('cambios', 'cambios_montos_finitos', $c$abs(diferencia) < 'Infinity'$c$);
select pg_temp.candado('separaciones', 'separaciones_montos_finitos', $c$abs(total) < 'Infinity' and abs(adelanto) < 'Infinity'$c$);
select pg_temp.candado('separacion_items', 'separacion_items_montos_finitos', $c$abs(precio_unitario) < 'Infinity' and abs(descuento_unitario) < 'Infinity'$c$);
select pg_temp.candado('separacion_pagos', 'separacion_pagos_montos_finitos', $c$abs(monto) < 'Infinity' and abs(recibido) < 'Infinity'$c$);
select pg_temp.candado('separacion_abonos', 'separacion_abonos_montos_finitos', $c$abs(monto) < 'Infinity'$c$);
select pg_temp.candado('separacion_ediciones', 'separacion_ediciones_montos_finitos', $c$abs(total_antes) < 'Infinity' and abs(total_despues) < 'Infinity'$c$);
select pg_temp.candado('comprobantes', 'comprobantes_montos_finitos',
  $c$abs(subtotal) < 'Infinity' and abs(igv) < 'Infinity' and abs(total) < 'Infinity' and abs(anticipo_deducido) < 'Infinity'$c$);
select pg_temp.candado('proformas', 'proformas_montos_finitos', $c$abs(subtotal) < 'Infinity' and abs(igv) < 'Infinity' and abs(total) < 'Infinity'$c$);
select pg_temp.candado('devoluciones', 'devoluciones_montos_finitos', $c$abs(reembolso_monto) < 'Infinity'$c$);

-- 2. El «recibido»: lo que la clienta entregó en efectivo cubre lo que se cobra, y el vuelto no pasa de S/ 500 (Felipe, 2026-10-13).
select pg_temp.candado('venta_pagos', 'venta_pagos_recibido_con_tope',
  $c$recibido is null or (metodo = 'efectivo' and recibido >= monto and recibido - monto <= 500)$c$);
select pg_temp.candado('separacion_pagos', 'separacion_pagos_recibido_con_tope',
  $c$recibido is null or (metodo = 'efectivo' and recibido >= monto and recibido - monto <= 500)$c$);

-- 3. El reembolso de una devolución: no negativo, con uno de los cinco medios de la pantalla, y con medio si hay plata.
select pg_temp.candado('devoluciones', 'devoluciones_reembolso_valido', $c$reembolso_monto is null or reembolso_monto >= 0$c$);
select pg_temp.candado('devoluciones', 'devoluciones_reembolso_metodo_valido',
  $c$reembolso_metodo is null or reembolso_metodo in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia')$c$);
select pg_temp.candado('devoluciones', 'devoluciones_reembolso_con_metodo', $c$coalesce(reembolso_monto, 0) = 0 or reembolso_metodo is not null$c$);
