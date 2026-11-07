-- ============================================================================
-- 20261101210000_produccion_ingreso_al_stock_legible.sql
-- La columna `producciones.ingreso_al_stock` (20261031171000, ADR-0551 C) se puede leer desde la cuenta. Va en una migración propia porque la anterior ya está pegada
-- en producción (2026-11-01) y una migración que ya está en `main` o en producción no se edita.
--
-- EL PROBLEMA PRIMERO. `producciones` tiene el candado de dinero (20260923193700): la cuenta NO lee la tabla entera, solo las columnas con un `grant select (columna)`
-- explícito (los costos se leen por funciones, ADR-0400). Una columna nueva nace SIN ese permiso. La lista de órdenes del Taller (`getOrdenesProduccion`) pide
-- `ingreso_al_stock` directo con `.from("producciones").select(…)`: sin este permiso, esa pantalla se caería con «permission denied for table producciones».
-- Lo detectó `pnpm pruebas:candado-dinero-produccion` («toda columna que no es de dinero es legible por authenticated»), no la prueba del cierre, que corre como dueño.
--
-- QUÉ PROMETE. La cuenta lee `ingreso_al_stock` (`movimiento` o `ya_estaba`): no es dinero, solo dice cómo entró al stock lo producido. NO le da escribirla: se escribe solo por
-- `marcar_orden_ya_en_stock` (security definer, solo un líder).
--
-- ORDEN PARA PRODUCCIÓN. Se pega ANTES de fusionar (la web nueva ya pide la columna). Una sola parte, idempotente: `grant` repetido no hace nada ni toma los bloqueos de `auth`.
-- PARA COMPROBAR: select has_column_privilege('authenticated', 'retail.producciones', 'ingreso_al_stock', 'select');  → true
-- CÓMO SE DESHACE. revoke select (ingreso_al_stock) on retail.producciones from authenticated;  (la lista de órdenes de la web nueva dejaría de cargar).
-- ============================================================================

set search_path = retail, public, extensions;

grant select (ingreso_al_stock) on retail.producciones to authenticated;
