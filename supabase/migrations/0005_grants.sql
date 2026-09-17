-- ============================================================================
-- 0005_grants.sql — CAYLA V2
--
-- Grants a nivel de tabla (independiente de RLS, que es a nivel de fila —
-- se necesitan ambos, mismo patrón que V1 0004_grants.sql). Como acá no
-- hay rename public→retail (V2 crea el schema `retail` directo desde
-- 0001), el GRANT USAGE va sobre `retail` desde el día 1 — más simple que
-- el mecanismo de V1, que existía para calzar con la unificación de
-- producción (que V2 local no tiene).
-- ============================================================================

grant usage on schema retail to anon, authenticated, service_role;

grant all on all tables in schema retail to service_role;
grant all on all sequences in schema retail to service_role;
grant all on all functions in schema retail to service_role;

grant select, insert, update, delete on all tables in schema retail to authenticated;
grant usage on all sequences in schema retail to authenticated;
grant execute on all functions in schema retail to authenticated;

alter default privileges in schema retail grant all on tables to service_role;
alter default privileges in schema retail grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema retail grant execute on functions to authenticated;
