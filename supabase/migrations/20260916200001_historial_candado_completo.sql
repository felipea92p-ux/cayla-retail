-- ============================================================================
-- 20260916200001_historial_candado_completo.sql — CAYLA V2
--
-- RECONSTRUCCIÓN, NO EL ORIGINAL. En producción quedó registrada como
-- `historial_candado_completo` (versión 20260916200000), aplicada el 2026-09-16, y nunca
-- se subió al repo. Se detectó el 2026-09-18 al comparar `retail` por huella md5
-- (BACKLOG, "Comparación completa `retail`"). Reproduce lo que hoy existe en producción;
-- lo que el archivo original hubiera tocado además, no se ve desde afuera.
--
-- VERSIÓN. Producción la registró como 20260916200000, pero esa versión ya la usa
-- `numeracion_traslados_conteos` en el repo, y dos migraciones con el mismo timestamp
-- rompen `migration up` (`schema_migrations.version` es llave primaria). Por eso acá
-- lleva 20260916200001: ordena igual (después de `20260914165703_movimientos_inmutables`,
-- que trae el candado de UPDATE/DELETE) y no choca.
--
-- EL PROBLEMA. `movimientos` es el libro append-only (principio 4). Un trigger ya impide
-- UPDATE y DELETE, pero no TRUNCATE: `TRUNCATE ... CASCADE` (o truncar junto con las
-- tablas que lo referencian) vaciaba el libro sin quejarse. Un TRUNCATE a secas ya lo
-- frenan las llaves foráneas, así que solo el CASCADE estaba abierto.
--
-- QUÉ HACE. `fn_historial_sin_truncate` y un trigger `before truncate` en `movimientos`.
-- Solo cubre `movimientos`; `costo_historial` e `historial_producto_cambios` tampoco están
-- protegidas contra TRUNCATE en producción (ver BACKLOG).
--
-- IDEMPOTENTE: pegarla en producción no cambia nada (`create or replace` con cuerpo
-- idéntico, `create or replace trigger`).
--
-- SE ROMPE SI: alguien intenta vaciar `movimientos`. Sale un mensaje que dice qué hacer.
-- ============================================================================

set search_path = retail, public, extensions;

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

revoke all on function retail.fn_historial_sin_truncate() from public;
grant execute on function retail.fn_historial_sin_truncate() to authenticated;

create or replace trigger movimientos_sin_truncate
  before truncate on retail.movimientos
  for each statement execute function retail.fn_historial_sin_truncate();
