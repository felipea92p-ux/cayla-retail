-- ============================================================================
-- 20261028003000_retirar_funciones_sin_llamador.sql — CAYLA V2 · Retiro de dos funciones de la base que nadie llama (ADR-0545)
--
-- EL CAMBIO. Dos funciones de `retail` quedaron sin ningún llamador y se retiran:
--   · `fn_costo_historial(uuid)` — el costo histórico de una prenda. Ninguna pantalla la llama (la web usa `fn_costo_historial_efectivo`,
--     ADR-0515, que ya trae la última corrección de cada fila) y ninguna otra función, vista, política o disparador la nombra. Además era
--     legible por cualquier colaborador: era el pendiente «costo de PRENDAS sin candado» de ADR-0183 y de la revisión de Producción.
--   · `ajustar_insumo_por_conteo(uuid, uuid, numeric, text)` — ajuste de insumos del Taller por conteo, de antes del módulo de Producción
--     actual (ADR-0090). Ninguna pantalla la llama, ninguna prueba la usa y ninguna función la nombra.
--
-- CÓMO SE VERIFICÓ (solo lectura, producción, 2026-10-27): ambas existen con esa firma; `pg_depend`, `pg_trigger` y los DEFAULT de columnas no
-- las referencian; ninguna función de `retail` ni de `public` las nombra por palabra completa; ninguna vista ni política las nombra; y
-- `pg_stat_statements` no registra ninguna llamada a `fn_costo_historial` (las 6 que coinciden por prefijo son DDL de `fn_costo_historial_efectivo`).
-- En el código: `git grep` solo las encuentra en los tipos generados (`packages/database/src/types.ts`), que esta rama actualiza.
--
-- QUÉ NO TOCA. Ninguna tabla, ningún dato, ningún movimiento. `fn_costo_historial_efectivo` y `registrar_consumo_insumo` siguen igual.
-- Se pueden recrear desde sus migraciones de origen (20260916090000 y 20260917145000) si alguna vez hicieran falta.
--
-- ORDEN. Primero la web publicada con esta rama (ya no nombra `ajustar_insumo_por_conteo` en los tipos), después esta migración: antes de
-- eso ninguna web las llama, así que el orden no rompe nada. No hay `create policy`/`alter table`: no entra en la regla de partes (ADR-0195).
--
-- NO SE PEGA EN PRODUCCIÓN desde aquí: es una migración local. Felipe lo decide antes de pegarla (cambio de esquema en producción).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

drop function if exists retail.fn_costo_historial(uuid);
drop function if exists retail.ajustar_insumo_por_conteo(uuid, uuid, numeric, text);
