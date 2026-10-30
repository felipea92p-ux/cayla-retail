-- ============================================================================
-- ⚠️ SOLO PARA PEGAR EN EL SQL EDITOR DE PRODUCCIÓN. NO es una migración local.
-- Sin timestamp a propósito: `db reset` la ignora. Toca `public.marcajes`, una tabla de DYNAMIC (la asistencia) que la
-- base local y el CI no tienen.
--
-- POR QUÉ (2026-10-30). La base quedó con la memoria comprometida al 103 % («Memory commitment: SEVERE», instancia Small de
-- 2 GB). La consulta que más tiempo de base gasta, lejos, es una lectura de Dynamic a `public.marcajes` (marcas de un tipo
-- desde una fecha): 45 797 llamadas desde el 17-oct, 993 ms de promedio, 12,6 horas de base en total, y cinco copias a la vez
-- en el momento de la alerta. La tabla tiene 11 108 filas vivas: no es volumen, es cómo están escritas sus 4 políticas.
-- Llaman `fn_rol_actual()`, `fn_persona_actual_id()`, `fn_sede_actual_persona()`, `fn_sede_actual_terminal()` y
-- `fn_persona_en_roster_terminal(persona_id)` sin envolver, así que Postgres las corre EN CADA FILA, y cada una vuelve a
-- leer `personas`/`terminales` (medido: 0,55 ms por fila; 663 ms para 30 días vistos desde una terminal).
--
-- QUÉ HACE. Las mismas 4 políticas, con el mismo nombre, el mismo rol y la MISMA regla, escritas para que cada función se
-- corra UNA vez por consulta (`(select fn())` → InitPlan):
--   · las cuatro funciones sin argumento se envuelven en `(select …)`;
--   · la de terminal dependía de la fila (`fn_persona_en_roster_terminal(persona_id)`): se reemplaza por la lista de las
--     personas de la terminal, armada una vez con la MISMA función (`fn_roster_terminal_actual()`, nueva), así que si Dynamic
--     cambia quién marca en una sede, esto lo sigue solo. Sin terminal, la lista sale vacía (igual que antes: falso).
--   · `analyze public.marcajes`: la estadística decía 792 filas cuando hay 11 108.
-- Medido en producción, en solo lectura y antes de escribir esto: con 8 identidades (las 4 terminales activas, un admin,
-- una integrante, una supervisora y una sesión sin cuenta), la regla vieja y la nueva devuelven EXACTAMENTE las mismas
-- filas (huella md5 de los ids, 7 días); tiempo total 811 ms → 92 ms. Con 30 días, desde una terminal: 663 ms → 4 ms.
--
-- QUÉ NO HACE. No cambia quién ve qué. No toca escritura (marcajes solo tiene políticas de SELECT). No agrega índice: con la
-- regla arreglada la consulta usa `idx_marcajes_vivas` y tarda milisegundos.
--
-- ⚠️ DYNAMIC. Estas políticas son de Dynamic. Si su repo vuelve a crear las políticas viejas en una migración futura, esto
-- se deshace en silencio: el mismo cambio tiene que quedar escrito en el repo de Dynamic.
--
-- CÓMO SE PEGA (regla de «Políticas y deadlocks», ADR-0195): DOS pegados separados, en orden. La PARTE 1 no toca
-- políticas; la PARTE 2 tiene SOLO políticas. Las dos se pueden repetir sin daño. Si una falla con `lock_timeout`, espera
-- un minuto y vuelve a pegar ESA parte.
-- ============================================================================


-- ============================================================================
-- PARTE 1 de 2 — la función de la lista de la terminal y la estadística. Pegar sola.
-- ============================================================================
set lock_timeout = '3s';

-- Las personas cuyas marcas ve la terminal de esta sesión, calculadas UNA vez por consulta. La regla de quién entra es
-- `fn_persona_en_roster_terminal`, sin copiarla: una sola fuente de verdad. Sin terminal (o terminal inactiva), vacía.
create or replace function public.fn_roster_terminal_actual()
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(p.id), '{}'::uuid[])
    from personas p
   where fn_sede_actual_terminal() is not null
     and p.estado = 'activo'
     and fn_persona_en_roster_terminal(p.id);
$$;

-- Los mismos permisos que las funciones de las que sale (`fn_persona_en_roster_terminal`).
revoke all on function public.fn_roster_terminal_actual() from public, anon;
grant execute on function public.fn_roster_terminal_actual() to authenticated, service_role;

analyze public.marcajes;


-- ============================================================================
-- PARTE 2 de 2 — las 4 políticas, mismas reglas, una evaluación por consulta. Pegar sola, DESPUÉS de la parte 1.
-- `alter policy` (no drop + create): no hay un instante sin política y conserva nombre y rol.
-- ============================================================================
set lock_timeout = '3s';

alter policy marcajes_select_admin_lider on public.marcajes
  using ((select public.fn_es_admin_o_lider()));

alter policy marcajes_select_propia on public.marcajes
  using (persona_id = (select public.fn_persona_actual_id()));

alter policy marcajes_select_supervisor on public.marcajes
  using ((select public.fn_rol_actual()) = 'supervisor_sede'::public.rol_usuario
         and sede_id = (select public.fn_sede_actual_persona()));

-- El `::uuid[]` no es decorativo: sin él, `any((select …))` se lee como «cualquiera de las filas de la subconsulta» y
-- compara uuid contra uuid[] (42883).
alter policy marcajes_select_terminal on public.marcajes
  using (persona_id = any((select public.fn_roster_terminal_actual())::uuid[]));


-- ============================================================================
-- CÓMO VERIFICAS (pegar aparte, solo lee).
-- 1) Las políticas quedaron con `(SELECT …)`:
--      select policyname, qual from pg_policies where schemaname = 'public' and tablename = 'marcajes';
-- 2) La consulta ya no tarda un segundo (en 10–15 min, con tráfico nuevo):
--      select calls, round(mean_exec_time) ms_prom from pg_stat_statements
--       where query like '%"public"."marcajes"."persona_id", "public"."marcajes"."timestamp_marca" FROM%';
--    El promedio acumulado baja despacio porque arrastra el historial; para verlo limpio:
--      select pg_stat_statements_reset();   (borra las estadísticas de TODAS las consultas: decídelo tú)
-- 3) En Supabase ▸ Observability ▸ Database, «Memory commitment» debería salir de SEVERE a medida que terminen las
--    consultas lentas.
-- 4) En Dynamic: una terminal sigue viendo a su equipo y una integrante sus propias marcas.
--
-- DESHACER (si algo se ve raro en Dynamic): pegar esto solo. Deja las políticas exactamente como estaban el 2026-10-30.
--   set lock_timeout = '3s';
--   alter policy marcajes_select_admin_lider on public.marcajes using (fn_es_admin_o_lider());
--   alter policy marcajes_select_propia      on public.marcajes using (persona_id = fn_persona_actual_id());
--   alter policy marcajes_select_supervisor  on public.marcajes
--     using ((fn_rol_actual() = 'supervisor_sede'::rol_usuario) and (sede_id = fn_sede_actual_persona()));
--   alter policy marcajes_select_terminal    on public.marcajes
--     using ((fn_sede_actual_terminal() is not null) and fn_persona_en_roster_terminal(persona_id));
-- La función `fn_roster_terminal_actual` puede quedarse: sin política que la llame, no hace nada.
-- ============================================================================
