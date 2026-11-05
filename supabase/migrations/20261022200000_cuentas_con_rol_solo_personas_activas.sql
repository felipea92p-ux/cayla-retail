-- ============================================================================
-- 20261022200000_cuentas_con_rol_solo_personas_activas.sql — CAYLA V2 · ADR-0161 (Roles y accesos), act. 2026-10-22
--
-- YA ESTÁ EN PRODUCCIÓN — NO SE VUELVE A PEGAR. Esta migración no escribe nada nuevo: copia a `main` la versión de
-- `retail.fn_cuentas_con_rol()` que corre en producción. ORIGEN: se aplicó en producción el 2026-10-08 con `apply_migration`
-- (versión registrada 20261008010408, `cuentas_con_rol_solo_personas_activas`) desde la rama
-- `claude/user-removal-dynamic-retail-8ba721` (commit e47c681c3, su ADR-0003, «La lista de cuentas del modal “Asignar rol” solo
-- ofrece personas activas»). Esa rama nació de una base vieja (2026-07-23, esquema V1), no tiene PR y nunca llegó a `main`, y su
-- archivo no se puede traer tal cual. La deriva del 2026-10-14 la vio como «otra versión» sin saber de dónde venía; el
-- 2026-10-22 se encontró el origen (buscando por el nombre de la migración, no por el cuerpo). Esta
-- migración NO se registra en `supabase_migrations.schema_migrations` de producción (allá la versión es 20261008010408 y
-- 20261022200000 no existe), igual que el precedente 20261014172000. El cuerpo de abajo es el de `pg_proc.prosrc` de producción,
-- carácter por carácter (963 caracteres; md5 exacto a9df80f61c921cd8170e1ef44e5d80cc; md5 del cuerpo normalizado como en
-- `scripts/migraciones/deriva.sql` b6a16dec874857d57ce37305df3d9af5; leídos el 2026-10-22 con una consulta de solo lectura), y
-- es el mismo del ADR-0003 de esa rama.
--
-- EL PROBLEMA PRIMERO. «Roles y accesos» lista las cuentas (personas y terminales) para asignarles un rol. En `main` la lista
-- trae a toda persona que tenga fila en `retail.colaboradores` o en `retail.colaboradores_suspendidos`, aunque en Dynamic ya
-- esté dada de baja (`public.personas.estado <> 'activo'`): una persona que ya no trabaja en CAYLA seguiría apareciendo para
-- darle un rol. Producción las deja fuera. Mientras `main` no lo diga, el CI y las bases locales prueban una lista distinta de
-- la que ven en las tiendas, y una migración que recree la función desde `main` le devolvería a esa lista las personas dadas de
-- baja sin que nadie lo decida.
--
-- QUÉ CAMBIA FRENTE A `main`: solo dos `where p.estado = 'activo'` (la rama de colaboradores y la de suspendidos). Las
-- terminales no tienen persona detrás: no se filtran. La firma, las siete columnas, `stable`, `security definer`, el
-- `search_path`, el candado (`fn_exigir_lider_de_roles()`) y los permisos (solo `authenticated` la ejecuta) no cambian. Tampoco
-- el `comment on function`: producción no tiene ninguno, y esta migración no agrega uno para no apartarse de lo que corre allá.
--
-- QUÉ NO ARREGLA. No toca qué se hace con una persona dada de baja que todavía tiene fila de colaborador (eso es de
-- Colaboradores, no de esta lista).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: no se pega, ya está. Si alguien la pega igual, es un `create or replace` de una función que ya
-- tiene este mismo cuerpo, más un `revoke`/`grant` que ya están: deja todo igual. Sin políticas ni `drop trigger`.
-- Cómo se verifica (solo lectura; debe dar 963 y a9df80f61c921cd8170e1ef44e5d80cc):
--   select length(prosrc), md5(prosrc) from pg_proc where oid = 'retail.fn_cuentas_con_rol()'::regprocedure;
--
-- SE ROMPE SI:
--   · alguien vuelve a pegar `20260923030000_roles_por_modulo.sql` (por ejemplo, para reparar otra función de roles): su
--     `create or replace` devuelve a la lista a las personas dadas de baja, en silencio. Lo vigila
--     `pnpm pruebas:arreglos-en-vivo-roles-observatorio` (el caso de la persona inactiva sale rojo contra una base así);
--   · Dynamic deja de escribir `public.personas.estado` con el valor `'activo'` para quien trabaja: la lista saldría vacía.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.fn_cuentas_con_rol()
returns table (tipo text, id uuid, nombre text, ubicacion_nombre text, rol_id uuid, es_lider boolean, estado text)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $fn$
begin
  perform retail.fn_exigir_lider_de_roles();
  return query
    select 'persona'::text, p.id, (p.nombres || ' ' || p.apellidos)::text, u.nombre::text, c.rol_id, c.rol = 'lider', c.estado::text
      from retail.colaboradores c
      join public.personas p on p.id = c.persona_id
      left join retail.ubicaciones u on u.id = c.ubicacion_asignada_id
      where p.estado = 'activo'
    union all
    select 'persona', p.id, p.nombres || ' ' || p.apellidos, u.nombre, s.rol_id, s.rol = 'lider', 'suspendido'
      from retail.colaboradores_suspendidos s
      join public.personas p on p.id = s.persona_id
      left join retail.ubicaciones u on u.id = s.ubicacion_asignada_id
      where p.estado = 'activo'
    union all
    select 'terminal', t.id, t.nombre, u.nombre, t.rol_id, false, case when t.activo then 'activo' else 'desactivada' end
      from retail.terminales t
      join retail.ubicaciones u on u.id = t.ubicacion_id
    order by 1, 3;
end;
$fn$;

revoke all on function retail.fn_cuentas_con_rol() from public, anon;
grant execute on function retail.fn_cuentas_con_rol() to authenticated;
