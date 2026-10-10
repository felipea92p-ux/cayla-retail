-- ============================================================================
-- 20261010100500_precio_sede_sube_version_del_catalogo.sql — CAYLA V2 (ADR-0370; sigue a 20261010100000)
--
-- EL PROBLEMA. Toda pantalla abierta que muestra un precio se pone al día sola (`<PreciosEnVivo />`, 2026-10-08) cuando sube
-- la versión del catálogo (`retail.catalogo_version`, 20260923184300). Esa versión la sube un disparador en `variantes`,
-- `productos` y demás, pero NO en `precios_sede`: poner o quitar el precio de una tienda dejaba Apartados, Cambios,
-- Productos, Existencias o la ficha mostrando el precio de antes hasta que alguien recargara.
--
-- LO QUE HACE. El mismo disparador por SENTENCIA (`fn_catalogo_cambio`) en `precios_sede`. Con `create or replace trigger`,
-- nunca `drop trigger` (CLAUDE.md, «Políticas y deadlocks»). Re-ejecutable. Una sola parte, sin políticas.
-- Prueba: `pnpm pruebas:precio-sede` (escenario «poner un precio sube la versión del catálogo»).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace trigger catalogo_version_cambio
  after insert or update or delete or truncate on retail.precios_sede
  for each statement execute function retail.fn_catalogo_cambio();
