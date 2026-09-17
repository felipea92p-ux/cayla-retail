-- ============================================================================
-- 20260917200000_fn_productos_dropea_sobrecarga_vieja.sql — CAYLA V2
--
-- INCIDENTE EN PRODUCCIÓN (2026-09-17, ~20:20): Felipe reportó `/productos`
-- caída con la pantalla de error genérica ("No se pudo cargar"). Causa raíz,
-- confirmada contra `cayla-dynamic` (no supuesta): `retail.fn_productos`
-- tenía DOS sobrecargas vivas a la vez —
--   · 9 parámetros, sin `p_orden` (la original, de `20260916100000_punto_reorden.sql`)
--   · 10 parámetros, con `p_orden` y `foto_url` (de `20260917190000_producto_fotos_por_color.sql`)
-- — porque `20260917180000_productos_ordenar_por_precio.sql` (el archivo cuyo
-- `DROP` limpiaba la sobrecarga de 9) nunca llegó a pegarse solo en el SQL
-- Editor; solo se aplicó `20260917190000`, cuyo propio `DROP` apuntaba a la
-- firma de 10 parámetros (que todavía no existía) — un `DROP ... IF EXISTS`
-- que no encontró nada que borrar. Mismo hueco que ya documentan ADR-0009/
-- 0004: agregar un parámetro sin dropear la firma vieja deja dos sobrecargas
-- conviviendo. `supabase.rpc("fn_productos", {...})` con parámetros nombrados
-- no puede elegir entre las dos y PostgREST responde con error de ambigüedad
-- — eso es lo que `exigir()` (`lib/resultado.ts`) atrapaba y lo que mostraba
-- el `error.tsx` de la sección.
--
-- Verificado antes de tocar nada: la sobrecarga de 10 parámetros YA tenía el
-- cuerpo completo y correcto (orden por precio + foto_url + punto de reorden
-- — `20260917190000` se escribió partiendo de la versión correcta de
-- `20260917180000`, no hacía falta reconstruir nada). El único problema era
-- la sobrecarga vieja sobrante — el fix es dropearla, sin recrear ni tocar
-- la que ya funciona.
--
-- APLICADA en producción con el MCP de Supabase (`apply_migration` contra
-- `vovjyyiafkxteijimpuy`, ok puntual de Felipe: "Si hazlo") antes que este
-- archivo — este .sql es el registro para el repo y para `db reset` local,
-- no el primer lugar donde corrió. Verificado después: `count(*) = 1`
-- sobrecarga, y `select count(*) from retail.fn_productos(p_pagina:=1,
-- p_por_pagina:=24)` devuelve filas reales (84) sin error.
-- ============================================================================

set search_path = retail, public, extensions;

drop function if exists retail.fn_productos(text, uuid, text, text, numeric, numeric, text, integer, integer);
