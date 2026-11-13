-- ============================================================================
-- 20261027140000 — Una terminal ya no llena el registro de errores al abrir una pantalla (ADR-0533)
--
-- EL PROBLEMA. Cada carga de pantalla (`requirePersonaActualV2`, `apps/web/lib/persona-actual.ts`) pregunta dos cosas en paralelo:
--   · «¿quién es la persona de esta sesión?» → `fn_actor_persona_id(false)`, para proponerla en el combo «Responsable»;
--   · «¿a qué módulo aterriza mi rol?» → `fn_mi_pantalla_principal()`, que por dentro llama a la misma función.
-- En una TERMINAL (la tablet de la tienda, que no es una persona) `fn_actor_persona_id` rechaza con «Elige quién hace esta operación»
-- (42501, `responsable_requerido`) porque no hay responsable elegido: es su candado de siempre y está bien para operar. Pero acá se
-- pregunta una LECTURA y la web ya descarta la respuesta de una terminal (`!terminal && …`): el rechazo no sirve de nada y queda
-- escrito como ERROR en el registro de Postgres. En 24 h (2026-10-26/27): 4 258 errores de este tipo, ~48 por hora aun de madrugada, que
-- tapan los errores de verdad (un permiso que falta, un tiempo agotado) cuando se mira el panel de Supabase.
--
-- LO QUE HACE.
--   1. `retail.fn_mi_persona_id()`: la persona de la cuenta (`public.personas.auth_user_id = auth.uid()`) o NULL. Sin cuenta, o en una
--      terminal, NULL — sin rechazar. Es EXACTAMENTE lo que `fn_actor_persona_id(false)` devuelve a una persona (`v_yo`, sin mirar
--      encabezados) y lo que la web ya usa de una terminal (nada).
--   2. `retail.fn_mi_pantalla_principal()` pasa a leer esa función en vez de `fn_actor_persona_id(false)`. Misma respuesta para una
--      persona; para una terminal, NULL en vez de un rechazo.
--
-- LO QUE NO HACE. No toca `fn_actor_persona_id`: sigue rechazando a una terminal sin responsable, con `p_de_tienda` true o false
-- (lo prueba `pnpm pruebas:terminal-sin-responsable`, que ni se enteró). Esa función firma todas las operaciones de tienda y se usa para
-- comparar «tú contra tú» en permisos; cambiarle el comportamiento cambiaría un permiso. No agrega ningún permiso a nadie: la función
-- nueva solo devuelve el id de la propia cuenta, que la persona ya podía leer.
--
-- DESCARTÉ: cambiar `fn_actor_persona_id(false)` para que devuelva NULL en una terminal. Una función de permisos (`fn_alcanzo_a`,
--   «no te quites a ti mismo») que hoy rechaza pasaría a comparar contra NULL: cambia una decisión de seguridad para callar un registro.
-- DESCARTÉ: que la web pregunte primero si es terminal y después el resto. Es una espera más en cada pantalla de TODAS las cuentas, para
--   ahorrarle el ruido a unas pocas terminales.
--
-- PRODUCCIÓN (esperar el OK de Felipe). Pegar ESTE archivo tal cual en el SQL Editor de producción, de una vez, ANTES de publicar la web
-- (la web nueva llama a `fn_mi_persona_id`; si la base aún no la tiene, usa el camino de antes y sigue funcionando). Solo `create or
-- replace function` y permisos: no toma tablas ni políticas (CLAUDE.md «Políticas y deadlocks»). Idempotente. `lock_timeout` 3 s.
--   Comprobado en producción el 2026-10-27 (solo lectura): `fn_mi_pantalla_principal` tiene el cuerpo de 20260925220000 sin cambios.
-- CAÍDA EXTERNA. Nada llama a la red; si la base no responde, la web ya manda a /sin-base (ADR-0450).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. La guarda: las funciones de las que depende existen -----------------------------------------------------------------------

do $$
begin
  if to_regprocedure('retail.fn_terminal_actual()') is null
     or to_regprocedure('retail.fn_actor_persona_id(boolean)') is null
     or to_regprocedure('retail.fn_mi_pantalla_principal()') is null then
    raise exception 'Faltan fn_terminal_actual, fn_actor_persona_id o fn_mi_pantalla_principal: no se aplicó nada.';
  end if;
end;
$$;

-- 1. La persona de mi cuenta, sin rechazar ----------------------------------------------------------------------------------------

create or replace function retail.fn_mi_persona_id()
returns uuid
language sql stable security definer set search_path = retail, public, extensions
as $$
  -- Una terminal no es una persona: NULL, sin rechazar. Sin sesión (`auth.uid()` NULL) tampoco hay fila.
  select p.id
    from public.personas p
   where p.auth_user_id = auth.uid()
     and not exists (select 1 from retail.fn_terminal_actual());
$$;

comment on function retail.fn_mi_persona_id() is
  'ADR-0533. El id de la persona de esta cuenta, o NULL (sin sesión, o una terminal). Lectura pura, nunca rechaza: es lo que fn_actor_persona_id(false) da a una persona, sin su candado de responsable para la terminal.';

revoke all on function retail.fn_mi_persona_id() from public, anon;
grant execute on function retail.fn_mi_persona_id() to authenticated, service_role;

-- 2. Mi pantalla principal lee esa función ---------------------------------------------------------------------------------------

create or replace function retail.fn_mi_pantalla_principal() returns text
language sql stable security definer set search_path = retail, public, extensions
as $$
  select r.pantalla_principal
    from retail.colaboradores c join retail.roles r on r.id = c.rol_id
   where c.persona_id = retail.fn_mi_persona_id();
$$;

revoke all on function retail.fn_mi_pantalla_principal() from public, anon;
grant execute on function retail.fn_mi_pantalla_principal() to authenticated, service_role;

-- 3. Comprobación ---------------------------------------------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('retail.fn_mi_persona_id()') is null then
    raise exception 'fn_mi_persona_id no quedó creada';
  end if;
  if (select pg_get_functiondef('retail.fn_mi_pantalla_principal()'::regprocedure)) not like '%fn_mi_persona_id()%' then
    raise exception 'fn_mi_pantalla_principal no quedó leyendo fn_mi_persona_id';
  end if;
  if has_function_privilege('anon', 'retail.fn_mi_persona_id()', 'execute') then
    raise exception 'anon no debe poder ejecutar fn_mi_persona_id';
  end if;
end;
$$;
