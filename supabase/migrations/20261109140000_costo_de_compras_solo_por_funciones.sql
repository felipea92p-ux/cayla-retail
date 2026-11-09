-- ============================================================================
-- 20261109140000_costo_de_compras_solo_por_funciones.sql — CAYLA V2 (Felipe, 2026-11-09; ADR-0631, actualización b)
-- El historial del costo de cada compra se lee solo por funciones, como el costo de cada prenda
--
-- LA REGLA. Desde `20260923193700` el costo de una prenda (`variantes.costo`) solo se lee por funciones que preguntan
--   `fn_puede_ver_dinero_de_compras()`. Esta migración hace lo mismo con su historial (`costo_historial`: lo que había, lo que llegó y a cuánto,
--   en qué quedó): la tienda ya no lo lee directo, solo por las funciones de siempre.
--   - Historial ▸ Costo usa `fn_costo_de_la_prenda`.
--   - Catálogo ▸ Costos usa `fn_costo_de_las_tallas` y `fn_variantes_con_costo_oficial`.
--   - Resumen, Balance y Estados financieros lo leen dentro de sus funciones.
--   Todas son `security definer` y preguntan el permiso donde corresponde.
--   Felipe eligió esta forma entre dos (la otra era sumar el permiso de dinero a la regla de la tabla) para que el mismo dato tenga un solo
--   camino.
--
-- QUÉ PROMETE. Una cuenta de la tienda (rol `authenticated`) no lee `retail.costo_historial` por la API: la base responde 42501. Lo que la
--   pantalla muestra no cambia.
--   ASUME: ninguna pantalla lee la tabla directo. Verificado el 2026-11-09:
--   - `apps/` no la nombra en ninguna consulta;
--   - las cinco funciones `security invoker` que la leen (`fn_producto_historia`, `fn_costo_variante_al`, `fn_bal_causas_mercaderia`,
--     `fn_asientos_produccion`, `fn_asientos_carga_inicial`) no se pueden llamar desde la tienda: corren dentro de funciones del sistema, con
--     el permiso de su dueño;
--   - las 20 pruebas de `scripts/pruebas/` que la tocan dan lo mismo con y sin el permiso.
--
-- QUÉ NO HACE. No cambia ningún dato ni ninguna función. `service_role` (scripts del servidor) la sigue leyendo. RLS queda encendido.
--
-- PRODUCCIÓN. Dos partes que se pegan POR SEPARADO, en orden (ADR-0195):
--   · PARTE 1 quita el permiso. No toma candados de otras tablas. Es la que cierra la lectura.
--   · PARTE 2, sola y después: quita la regla de lectura de la tabla, que ya no sirve. Así, si algún día alguien devuelve el permiso por error,
--     la tabla responde vacía en vez de mostrar el costo. Un `drop policy` toma en exclusiva las tablas de `auth` y `storage` hasta el final
--     del pegado, por eso va sola.
--   Las dos son re-ejecutables. La web no cambia: se puede pegar antes o después de publicar.
-- VERIFICACIÓN (solo lectura, después de las dos partes):
--     select has_table_privilege('authenticated', 'retail.costo_historial', 'select'),
--            (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'costo_historial');   → f | 0
-- CÓMO SE DESHACE:
--     grant select on retail.costo_historial to authenticated;
--   La regla de la PARTE 2 se vuelve a crear con su texto de `20260916090000_costo_promedio_ponderado.sql`.
-- ============================================================================

-- ============================== PARTE 1 · el permiso ==============================
set lock_timeout = '3s';

revoke select on retail.costo_historial from authenticated, anon;

reset lock_timeout;

-- ============================== PARTE 2 · la regla de lectura (sola, después) ==============================
set lock_timeout = '3s';

drop policy if exists costo_historial_select on retail.costo_historial;

reset lock_timeout;
