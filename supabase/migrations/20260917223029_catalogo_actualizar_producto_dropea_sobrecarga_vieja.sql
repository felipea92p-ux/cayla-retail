-- ============================================================================
-- 20260917223029_catalogo_actualizar_producto_dropea_sobrecarga_vieja.sql — CAYLA V2
--
-- RECONSTRUCCIÓN, NO EL ORIGINAL. En producción quedó registrada como
-- `catalogo_actualizar_producto_dropea_sobrecarga_vieja` (versión 20260917223029),
-- aplicada el 2026-09-17, y nunca se subió al repo. Se detectó el 2026-09-18 al comparar
-- `retail` por huella md5 (BACKLOG, "Comparación completa `retail`").
--
-- EL PROBLEMA. `20260917100600_catalogo_rpc_ejes_nuevos` creó `catalogo_actualizar_producto`
-- con 12 parámetros (`p_tejido_id`, `p_patron_id`) y borró la de 10.
-- `20260917190000_producto_fotos_por_color` ordena DESPUÉS y vuelve a crear la de 10:
-- quedaron las dos sobrecargas. Una llamada con los 10 argumentos que
-- manda `ProductoForm` coincide con las dos ("is not unique"). Producción ya la había
-- limpiado; el repo y el Postgres local no. Mismo hueco que `registrar_movimiento`.
--
-- QUÉ HACE. Borra la de 10 parámetros. Queda la de 12, con defaults en todo lo que va
-- después de `p_variantes`, así que las llamadas de 10 argumentos resuelven a ella.
--
-- ORDEN. Va DESPUÉS de todas las migraciones que crean la firma de 12 y de la que
-- recrea la de 10 (`20260917210001`, `20260917220000` son las últimas). La versión es la
-- misma con que quedó registrada en producción.
--
-- IDEMPOTENTE: `drop function if exists`. Pegarla en producción no cambia nada.
--
-- SE ROMPE SI: una migración nueva vuelve a crear `catalogo_actualizar_producto` con la
-- lista de tipos de 10 parámetros. Parte siempre de la firma viva de 12.
-- ============================================================================

set search_path = retail, public, extensions;

drop function if exists retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text, integer, text, boolean, jsonb);
