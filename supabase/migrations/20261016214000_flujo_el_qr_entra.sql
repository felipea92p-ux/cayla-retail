-- ============================================================================
-- 20261016214000_flujo_el_qr_entra.sql — CAYLA V2 (auditoría de Finanzas 2026-10-16, causa raíz G05; ADR-0433, actividad 3)
--
-- EL PROBLEMA PRIMERO. `fn_flujo_lado` decide de qué lado cae cada categoría del Flujo de caja: «entra» (lo cobrado y la plata del dueño),
-- «ajuste» (lo que solo cambia de lugar) y «sale» para TODO lo demás. Ese «todo lo demás» es un comodín: cuando 20261002130000 agregó
-- el QR como medio de cobro (hoy el 21 % de lo cobrado) nadie lo anotó en la lista de «entra», y el QR cayó en «sale» con signo POSITIVO.
-- Efecto, medido en producción con `fn_flujo_caja_real('2026-10-01','2026-10-16')`: «Salió» −10 257.86 donde lo real es −2 948.90 y
-- «Entró» 47 651.66 donde lo real es 60 858.42, y los «días de caja» del Resumen salen 87 en vez de ~52 (la salida diaria que los divide
-- resta los S/ 13 mil de QR de lo que gastas). El descuadre del Flujo sigue en 0 porque «entró» y «salió» se compensan: el error era
-- invisible para la identidad que la pantalla vigila.
--
-- CÓMO. El QR entra a la lista de «entra». Una sola función, la misma de siempre, sin tocar `fn_flujo_lineas` (que ya emitía la
-- categoría `qr`), ni la proyección ni las pantallas: todo lo que lee el lado lo lee de aquí.
-- Lo que NO se hace aquí, a propósito:
--   · `pago_planilla` y `pago_sunat` (movimientos de dinero de 20261016002000, hoy con 0 filas) caen en «entre cuentas» y no se cuentan
--     como salida. Clasificarlos como «sale» sin tocar la proyección contaría dos veces la planilla (la proyección ya le suma la de
--     Dynamic a la salida diaria): va junto con la proyección, en la actividad 4.
--   · Una lista cerrada con un lado «desconocido»: pediría un cuarto lado en tres lectores y una pantalla, y un categoría desconocida
--     quedaría fuera de entró, salió y ajustes sin que nada la nombre. La defensa es otra: la suite `flujo_caja` recorre los medios de
--     cobro que acepta `venta_pagos` y exige que cada uno entre por «entra»; un medio nuevo sin su lugar aquí falla en el CI.
-- Idempotente (create or replace; conserva los permisos). Verificado: `scripts/pruebas/flujo_caja.mjs` (casos 1b y 1c).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- De qué lado va cada categoría. «ajuste» = lo que no es entrar ni salir: plata que cambia de lugar y diferencias de caja.
create or replace function retail.fn_flujo_lado(p_categoria text) returns text
language sql immutable set search_path = retail, public, extensions as $$
  select case
    when p_categoria in ('efectivo', 'yape', 'plin', 'tarjeta', 'transferencia', 'qr', 'dueno_pone', 'reembolsos', 'otros_ingresos') then 'entra'
    when p_categoria in ('entre_cuentas', 'faltantes_caja', 'aperturas_caja') then 'ajuste'
    else 'sale'
  end;
$$;

revoke all on function retail.fn_flujo_lado(text) from public, anon, authenticated;
