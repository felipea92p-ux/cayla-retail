-- Grants a nivel de tabla (independiente de RLS, que es a nivel de fila — se necesitan
-- ambos). service_role: acceso total. authenticated: CRUD permitido, restringido de
-- verdad por las políticas RLS de 0003_rls.sql.

grant usage on schema public to authenticated, service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;
