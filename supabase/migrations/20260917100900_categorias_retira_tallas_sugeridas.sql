-- ============================================================================
-- 20260917100900 — categorias.tallas_sugeridas se retira
--
-- Superseded por retail.categoria_tallas (20260917100400), ya con el
-- backfill hecho. Ninguna pantalla la lee más (NuevoProductoForm.tsx,
-- ProductoForm.tsx y sus dos páginas ya se migraron a `ejes.tallas` —
-- 20260917100600 en adelante). Una sola fuente de verdad (principio 4):
-- dejar las dos vivas habría sido exactamente el tipo de "dos mecanismos
-- escribiendo la misma idea" que el diseño de esta sesión quiso evitar.
-- ============================================================================

alter table retail.categorias drop column if exists tallas_sugeridas;
