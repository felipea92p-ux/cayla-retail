-- ============================================================================
-- 20261113200000 — «Quién eres» en un solo viaje: `retail.fn_mi_sesion()` (ADR-0657, innovar «cambiar de módulo» #15, paso 1)
--
-- EL PROBLEMA. Cada render del servidor (los `layout.tsx` de 54 de los 60 módulos y cada precarga de un enlace del menú) llama a
-- `requirePersonaActualV2` (`apps/web/lib/persona-actual.ts`), que hace SEIS llamadas a la base en paralelo: `fn_persona_actual_resumen`,
-- `fn_mi_terminal`, `fn_mis_modulos`, `fn_mi_persona_id`, `fn_es_admin` y `fn_mi_pantalla_principal`. En producción (pg_stat_statements,
-- 22 h del 2026-11-12/13) cada una corrió ~6.375 veces, entre 8 y 34 ms de media: ~38.000 llamadas al día solo para saber quién mira. Seis
-- viajes son seis peticiones a PostgREST, seis transacciones con su `set role` y su sesión, y seis veces las mismas preguntas por dentro:
-- «¿es una terminal?» se preguntaba cuatro veces, «¿quién es la persona?» dos, «¿es líder?» y «¿es admin?» en dos funciones distintas.
--
-- ANALOGÍA CAYLA. Al entrar a una tienda, la vendedora iba seis veces a la oficina a preguntar «¿cómo me llamo en el sistema?», «¿soy una
-- tablet?», «¿qué módulos veo?», «¿quién soy?», «¿soy admin?», «¿dónde aterrizo?», y en cada viaje la oficina volvía a buscar su ficha.
-- Ahora va una vez, la oficina saca la ficha una sola vez y le devuelve las seis respuestas en un sobre.
--
-- QUÉ HACE. `retail.fn_mi_sesion()` (puerta: `security definer`, la llama `authenticated`) devuelve en un jsonb lo mismo que las seis:
--   { "resumen": [filas de fn_persona_actual_resumen], "terminal": texto|null, "modulos": [{clave, completo}], "persona_id": uuid|null,
--     "es_admin": bool, "pantalla_principal": texto|null }
-- Por dentro, «¿es líder?», «¿es admin?» y «¿qué rol tiene?» se calculan UNA vez (CTE materializado) y sirven a la vez para `es_admin` y
-- para los módulos, que salen de la misma regla que `fn_mis_modulos` (`fn_modulos_de`, 20261113195000). El resto se pregunta a las mismas
-- funciones de siempre, una vez cada una: la regla de cada respuesta sigue viviendo en un solo lugar.
--   · `resumen` va como lista: la web conserva lo de `.maybeSingle()` (una fila = la persona; ninguna = sin acceso; dos = error).
--   · `es_admin` = `fn_es_admin()`, calculada solo si es líder: `fn_es_admin` exige todo lo de `fn_es_lider` más `personas.rol = 'admin'`.
-- Las seis funciones NO se tocan ni se borran: la web publicada antes de esta migración las sigue llamando, y la nueva vuelve a ellas si
-- `fn_mi_sesion` todavía no existe en la base (PGRST202) o falla.
--
-- MISMAS RESPUESTAS. Comparado con `pnpm pruebas:mi-sesion` en una copia local: las cuentas de `apps/web/tema/cuentas.mjs` (admin,
-- integrante, terminal de ventas, terminal administrativa, rol personalizado) y once casos raros (líder sin admin, líder sin sede, terminal
-- desactivada, terminal de una sede cerrada, cuenta sin fila, sin sesión, persona cesada, colaborador pendiente, rol archivado, rol limitado,
-- persona y terminal a la vez): fn_mi_sesion = las seis, igualdad de jsonb, cuenta por cuenta. La prueba corre en el CI.
--
-- DECIDÍ: componer las funciones que ya existen (una llamada a cada una) y compartir solo la identidad que se repetía, en vez de reescribir
--   todo en una sola consulta: así una regla (quién es líder, qué sede le toca) no queda copiada en dos lugares.
-- DESCARTÉ: guardar la respuesta 60 s por sesión (paso 2 de la propuesta #15): cambiaría cuándo se ve un cambio de rol; espera a Felipe.
--   Y ampliar `fn_persona_actual_resumen`: cambiar su forma rompería a la web publicada que la lee.
-- SE ROMPE SI: alguien cambia una de las seis y no esta (la respuesta de la web dependería de qué camino tomó): lo frena
--   `pnpm pruebas:mi-sesion`, que compara las dos con las cuentas de arriba.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (esperar el OK de Felipe). DESPUÉS de 20261113195000 (usa `fn_modulos_de`). Pegar ESTE archivo tal cual en el
-- SQL Editor, de una vez. Solo `create or replace function`, permisos y comentario: no toca tablas, políticas ni `drop trigger`
-- (CLAUDE.md «Políticas y deadlocks»). `lock_timeout` 3 s. Idempotente. La web puede publicarse antes o después: sin la función, hace las
-- seis llamadas de siempre.
-- PARA VOLVER ATRÁS: `revoke execute on function retail.fn_mi_sesion() from authenticated;` (la web vuelve sola a las seis).
-- CAÍDA EXTERNA. Nada llama a la red; si la base no responde, la web manda a /sin-base como siempre (ADR-0450).
-- ============================================================================

set search_path = retail, public, extensions;

-- La guarda: todo lo que compone existe (si falta algo, no se crea nada).
do $guarda$
begin
  if to_regprocedure('retail.fn_modulos_de(boolean,boolean,uuid)') is null then
    raise exception 'Falta retail.fn_modulos_de: pega antes 20261113195000.';
  end if;
  if to_regprocedure('retail.fn_persona_actual_resumen()') is null or to_regprocedure('retail.fn_mi_terminal()') is null
     or to_regprocedure('retail.fn_mi_persona_id()') is null or to_regprocedure('retail.fn_es_admin()') is null
     or to_regprocedure('retail.fn_es_lider()') is null or to_regprocedure('retail.fn_mi_rol_id()') is null
     or to_regprocedure('retail.fn_mi_pantalla_principal()') is null then
    raise exception 'Falta alguna de las funciones de identidad que fn_mi_sesion compone.';
  end if;
end
$guarda$;

set lock_timeout = '3s';

create or replace function retail.fn_mi_sesion()
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with lider as materialized (
    select retail.fn_es_lider() as es_lider
  ), yo as materialized (
    select l.es_lider,
           case when l.es_lider then retail.fn_es_admin() else false end as es_admin,
           case when l.es_lider then null::uuid else retail.fn_mi_rol_id() end as rol_id
      from lider l
  )
  select jsonb_build_object(
    'resumen', coalesce((select jsonb_agg(to_jsonb(r)) from retail.fn_persona_actual_resumen() r), '[]'::jsonb),
    'terminal', retail.fn_mi_terminal(),
    'modulos', coalesce((select jsonb_agg(jsonb_build_object('clave', m.clave, 'completo', m.completo))
                           from retail.fn_modulos_de(yo.es_lider, yo.es_admin, yo.rol_id) m), '[]'::jsonb),
    'persona_id', retail.fn_mi_persona_id(),
    'es_admin', yo.es_admin,
    'pantalla_principal', retail.fn_mi_pantalla_principal()
  )
  from yo;
$$;

comment on function retail.fn_mi_sesion() is
  'Las seis respuestas de identidad del marco de la web en un viaje (fn_persona_actual_resumen, fn_mi_terminal, fn_mis_modulos, fn_mi_persona_id, fn_es_admin, fn_mi_pantalla_principal), con «¿es líder?», «¿es admin?» y el rol calculados una vez. Puerta security definer; misma respuesta que las seis (pnpm pruebas:mi-sesion). ADR-0657.';

revoke all on function retail.fn_mi_sesion() from public, anon;
grant execute on function retail.fn_mi_sesion() to authenticated, service_role;

reset lock_timeout;
