-- ============================================================================
-- 20260916200000_historial_candado_completo.sql — CAYLA V2 · módulo 05 (Halcón)
--
-- EL PROBLEMA
--   Desde 20260914165703 nadie desde una tienda edita ni borra el libro de
--   movimientos. Quedaban abiertas, medidas en producción el 2026-09-16:
--   1. TRUNCATE. service_role conserva TRUNCATE sobre movimientos, la seguridad
--      por fila no aplica a TRUNCATE y el disparador actual es por fila, así que
--      no se activa. Un `truncate ... cascade` sobre variantes o ubicaciones
--      vacía el libro de TRU, AQP y el Taller de un golpe, y recalcular_stock
--      reconstruye cero.
--   2. Modo réplica. Los disparadores estaban en modo normal ('O'): con
--      `set session_replication_role = replica` no se activan y el UPDATE o
--      DELETE pasa.
--   3. Stock que se infla sin libro. authenticated podía ejecutar
--      fn_aplicar_movimiento y recalcular_stock. Una sesión cualquiera volvía a
--      aplicar cinco veces una entrada de 12 blusas: la tienda muestra 60
--      prendas que no existen y ninguna fila del libro lo explica.
--   4. stock escribible. authenticated tenía INSERT, UPDATE y DELETE sobre
--      stock, y service_role todo. Lo frenaba que no existe una policy de
--      escritura: omisión, no decisión. La primera policy de UPDATE que alguien
--      agregue dejaría cambiar la cifra de una tienda sin movimiento.
--
-- POR QUÉ NO ROMPE NADA — medido en producción, no razonado:
--   · Las 14 funciones que insertan movimientos o aplican stock (registrar_venta,
--     registrar_movimiento ×2, recibir_lote, recibir_compras, cerrar_conteo,
--     iniciar_traslado, confirmar_traslado, cerrar_traslado_con_diferencia,
--     mover_interno, registrar_cambio, aprobar_devolucion, cerrar_produccion,
--     revertir_produccion) son security definer de postgres: el retiro de
--     permisos a authenticated y service_role no las toca. anular_venta (en main)
--     también es security definer.
--   · Ninguna función de retail hace UPDATE o DELETE sobre movimientos, y las 5
--     FK que apuntan a movimientos son NO ACTION.
--   · La app nunca llama fn_aplicar_movimiento ni recalcular_stock, no usa
--     service_role y solo LEE stock y movimientos.
--   · No hay trabajos de pg_cron que escriban esas tablas.
--
-- LO QUE A PROPÓSITO NO SE HACE: FORCE ROW LEVEL SECURITY. En producción el
--   dueño de la tabla y de las funciones (postgres) y service_role tienen
--   BYPASSRLS: forzar RLS no le aplica a nadie que pueda escribir. Sería un
--   candado escrito en un documento, no en la base.
--
-- CÓMO SE CORRIGE UN ERROR: igual que antes, escribiendo el movimiento
--   contrario con su motivo. La salida de emergencia sigue siendo del dueño
--   (ALTER TABLE ... DISABLE TRIGGER), que deja rastro como DDL.
--
-- SE ROMPE SI: una integración futura (un script, Dynamic, una Edge Function)
--   escribe stock o movimientos con la llave de service_role en vez de llamar a
--   una RPC. Va a fallar con "permission denied", y eso es lo correcto: la
--   pregunta es qué RPC le falta, no cómo devolverle el permiso.
-- ============================================================================

-- 1. El disparador de UPDATE/DELETE se activa también en modo réplica.
alter table retail.movimientos enable always trigger movimientos_inmutables;

-- 2. TRUNCATE, directo o en cascada.
create or replace function retail.fn_historial_sin_truncate()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'El historial de movimientos no se vacía. Si hace falta limpiar datos de prueba, '
    'se descontinúan los productos y su stock se lleva a cero con movimientos de ajuste.';
end;
$$;

comment on function retail.fn_historial_sin_truncate() is
  'D-22: rechaza TRUNCATE sobre movimientos, también cuando llega en cascada desde variantes, ubicaciones o productos.';

drop trigger if exists movimientos_sin_truncate on retail.movimientos;
create trigger movimientos_sin_truncate
  before truncate on retail.movimientos
  for each statement execute function retail.fn_historial_sin_truncate();
alter table retail.movimientos enable always trigger movimientos_sin_truncate;

-- 3. Nadie fuera de las funciones escribe el libro ni la foto de stock.
revoke insert, update, delete, truncate on retail.movimientos from authenticated, anon, service_role;
revoke insert, update, delete, truncate on retail.stock from authenticated, anon, service_role;

-- 4. Aplicar un movimiento o reconstruir el stock solo desde dentro de una RPC.
--    Toda función nueva de retail nace ejecutable por authenticated (default ACL
--    del schema), así que el retiro tiene que ser explícito.
revoke execute on function retail.fn_aplicar_movimiento(uuid) from public, anon, authenticated, service_role;
revoke execute on function retail.recalcular_stock() from public, anon, authenticated, service_role;
