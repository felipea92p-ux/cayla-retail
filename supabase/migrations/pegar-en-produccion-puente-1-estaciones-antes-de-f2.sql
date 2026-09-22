-- ============================================================================
-- PUENTE 1 (pegar en producción ANTES de 20260923010000_terminales_sin_persona.sql) — ADR-0162
--
-- EL PROBLEMA. El 2026-09-22 se crearon en producción 6 «estaciones» con el modelo VIEJO del ADR-0160 (una persona de
-- Dynamic + `colaboradores.terminal`): Caja/Almacén de Trujillo, Arequipa y Lima. La F2 retira ese modelo y SE DETIENE si
-- las encuentra (no las pierde en silencio). Este puente las pasa al modelo nuevo SIN perder nada: la misma cuenta de
-- acceso (misma clave, el aparato no se vuelve a configurar), su tienda y su tipo.
--
-- QUÉ HACE (todo o nada):
--   1. Las copia a una tabla de paso `retail.terminales_por_convertir` (cuenta, tienda, tipo, nombre).
--   2. Anota en `colaboradores_historial` una «baja» de cada una con el motivo (queda la huella de que existieron).
--   3. Les quita el acceso como PERSONA (su fila en `colaboradores`): desde ahora entran como TERMINAL (puente 2).
-- Verificado el 2026-09-22: 0 ventas y 0 movimientos a su nombre. Re-ejecutable: si ya no hay estaciones, no hace nada.
-- ============================================================================
set search_path to retail, public, extensions;

create table if not exists retail.terminales_por_convertir (
  persona_id uuid primary key,
  auth_user_id uuid not null,
  ubicacion_id uuid not null,
  tipo text not null,
  nombre text not null
);

insert into retail.terminales_por_convertir (persona_id, auth_user_id, ubicacion_id, tipo, nombre)
select c.persona_id, p.auth_user_id, c.ubicacion_asignada_id, c.terminal,
       coalesce(nullif(btrim(regexp_replace(p.nombres, '^.*—\s*([^(]+?)\s*(\(.*)?$', '\1')), ''), p.nombres)
  from retail.colaboradores c join public.personas p on p.id = c.persona_id
 where c.terminal is not null and p.auth_user_id is not null
on conflict (persona_id) do nothing;

insert into retail.colaboradores_historial (persona_id, accion, por, rol, ubicacion_anterior_id, ubicacion_nueva_id, motivo)
select t.persona_id, 'baja', null, 'colaborador', t.ubicacion_id, null,
       'Estación convertida en terminal sin persona (ADR-0162): sigue entrando con la misma cuenta, ahora como aparato'
  from retail.terminales_por_convertir t
 where exists (select 1 from retail.colaboradores c where c.persona_id = t.persona_id and c.terminal is not null);

delete from retail.colaboradores c
 using retail.terminales_por_convertir t
 where c.persona_id = t.persona_id and c.terminal is not null;

select count(*) as estaciones_por_convertir from retail.terminales_por_convertir;
