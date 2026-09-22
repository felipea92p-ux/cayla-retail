-- ============================================================================
-- PUENTE 2 (pegar en producción DESPUÉS de 20260923010000_terminales_sin_persona.sql y ANTES de 20260923030000) — ADR-0162
--
-- Crea en `retail.terminales` las estaciones que el puente 1 guardó aparte, con su MISMA cuenta de acceso (`auth_user_id`):
-- el aparato que ya había iniciado sesión sigue funcionando, ahora como terminal sin persona. La migración de roles
-- (20260923030000) les asigna después el rol según su tipo. Borra la tabla de paso solo cuando las 6 ya están creadas.
-- Re-ejecutable.
-- ============================================================================
set search_path to retail, public, extensions;

insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id, activo)
select t.ubicacion_id, t.nombre, t.tipo, t.auth_user_id, true
  from retail.terminales_por_convertir t
 where not exists (select 1 from retail.terminales x where x.auth_user_id = t.auth_user_id);

do $$
begin
  if exists (select 1 from retail.terminales_por_convertir t
              where not exists (select 1 from retail.terminales x where x.auth_user_id = t.auth_user_id)) then
    raise exception 'Alguna estación no quedó creada como terminal: revisar antes de seguir';
  end if;
end $$;

drop table retail.terminales_por_convertir;

select nombre, tipo, (select nombre from retail.ubicaciones u where u.id = t.ubicacion_id) as tienda from retail.terminales t order by 3, 2;
