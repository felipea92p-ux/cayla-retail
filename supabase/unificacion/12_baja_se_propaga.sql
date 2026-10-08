-- ============================================================================
-- UNIFICACIÓN retail → dynamic · PASO 12 (la baja en dynamic ES la baja en retail)
--
-- ⚠️ Este SQL se corre en el proyecto cayla-DYNAMIC (SQL Editor, a mano — igual
-- que los pasos 1-11). Es 100% de funciones, vistas y políticas: no toca datos,
-- no agrega columnas, no borra nada.
--
-- ── EL PROBLEMA ─────────────────────────────────────────────────────────────
--
-- Dar de baja a alguien en dynamic (fn_cesar_persona → personas.estado='inactivo')
-- no cambiaba nada en retail. Tres puntos ignoraban `estado`:
--
--   1. La vista retail.personas listaba a todos. Cualquier selector de personas
--      de retail (p. ej. «Asignar rol → Cuenta») mostraba a quien ya no está.
--   2. Los 4 candados (es_lider, es_supervisor, mi_sede, puede_operar_sede) leen
--      el rol con fn_rol_actual(), que NO mira `estado`. Quien conservaba su
--      login seguía siendo Líder / de su sede para todas las políticas RLS.
--   3. Cinco lecturas «para cualquier autenticado» (categorías, productos,
--      variantes —con costo—, plan de cuentas, proveedores) no distinguían a
--      un integrante activo de un ex-integrante con sesión viva.
--
-- ── LA DECISIÓN ─────────────────────────────────────────────────────────────
--
-- Una sola fuente de verdad: public.personas.estado, de dynamic. Retail NO guarda
-- copia ni un «estado propio» → no hay nada que sincronizar, y por tanto nada
-- que pueda quedar desfasado (principio 4). La baja se propaga porque retail lee
-- el mismo dato, no porque alguien la repita. Simétrico: si dynamic reactiva a la
-- persona (fn_reactivar_persona), retail la recupera solo — sin tocar retail.
--
-- Se corrige en el candado, no en cada política (principio 2): las ~40 políticas
-- y RPCs que usan los 4 candados quedan protegidas sin reescribirse.
--
-- ── DOS CUIDADOS ────────────────────────────────────────────────────────────
--
-- a) Los candados devuelven SIEMPRE true/false, nunca null (coalesce). Con null,
--    `if not retail.puede_operar_sede(x) then raise ...` NO salta (not null =
--    null → el if no entra) y el guard se queda mudo justo cuando hace falta.
--
-- b) El historial NO se esconde. Quien se fue sigue siendo autor de sus
--    movimientos, ventas y cajas (FKs a public.personas). retail.personas pasa a
--    ser «el equipo de hoy»; retail.personas_historial conserva a todos solo
--    para poner nombre a esa auditoría (ficha de producto → historial).
--
-- ── NO CUBRE (a propósito; ver informe de la sesión) ────────────────────────
--
--   Las RPCs abrir_caja, cerrar_caja, registrar_venta, recibir_lote,
--   registrar_gasto, recalcular_stock y fn_aplicar_movimiento no validan quién
--   llama (la 0012 del retail viejo sí lo hacía y el port no la trajo). Eso afecta
--   igual a un activo de otra sede y es un arreglo aparte.
--
-- ── CÓMO SE REVIERTE ────────────────────────────────────────────────────────
--
--   Bloque comentado al final: deja los candados, la vista y las 5 políticas
--   exactamente como estaban tras el paso 3 / 4 / 5 / 6.
-- ============================================================================


-- ── 1 · ¿La persona logueada está activa en dynamic? ────────────────────────
-- SECURITY DEFINER: lee public.personas saltándose su RLS (mismo patrón que
-- fn_rol_actual, que ya lo necesita para no recursar). Devuelve true/false,
-- nunca null: `exists` no devuelve null.
create or replace function retail.es_activa()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.personas p
    where p.auth_user_id = auth.uid() and p.estado = 'activo'
  );
$$;

comment on function retail.es_activa() is
  'true solo si el usuario logueado es una persona con estado=activo en dynamic. Una baja en dynamic la vuelve false en retail al instante.';


-- ── 2 · Los 4 candados: activa Y con el rol/sede que corresponde ────────────
create or replace function retail.es_lider()
returns boolean language sql stable set search_path = public
as $$ select coalesce(retail.es_activa() and public.fn_rol_actual() = 'admin', false); $$;

create or replace function retail.es_supervisor()
returns boolean language sql stable set search_path = public
as $$ select coalesce(retail.es_activa() and public.fn_rol_actual() = 'supervisor_sede', false); $$;

-- mi_sede() queda en null para una persona dada de baja: toda política del tipo
-- `sede_id = retail.mi_sede()` deja de coincidir con cualquier fila.
create or replace function retail.mi_sede()
returns uuid language sql stable set search_path = public
as $$ select case when retail.es_activa() then public.fn_sede_actual_persona() end; $$;

create or replace function retail.puede_operar_sede(p_sede_id uuid)
returns boolean language sql stable set search_path = public
as $$
  select coalesce(
    retail.es_activa()
      and (public.fn_rol_actual() = 'admin' or public.fn_sede_actual_persona() = p_sede_id),
    false
  );
$$;


-- ── 3 · Identidad del usuario actual: una persona de baja no tiene identidad ─
create or replace function retail.persona_actual()
returns table (id uuid, auth_user_id uuid, nombre text, sede_id uuid, rol text, email text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.auth_user_id, (p.nombres || ' ' || coalesce(p.apellidos, '')),
         p.sede_base_id, p.rol::text, p.email
  from public.personas p
  where p.auth_user_id = auth.uid() and p.estado = 'activo';
$$;


-- ── 4 · Vistas: el equipo de HOY vs. el historial completo ──────────────────
-- Mismas columnas que antes (create or replace exige conservarlas): solo cambia
-- el filtro. security_invoker: sigue respetando el RLS de public.personas.
create or replace view retail.personas
with (security_invoker = true) as
select p.id, p.auth_user_id,
       (p.nombres || ' ' || coalesce(p.apellidos, '')) as nombre,
       p.sede_base_id as sede_id,
       p.rol::text as rol,
       p.email, p.estado
from public.personas p
where p.estado = 'activo';

comment on view retail.personas is
  'El equipo de HOY: solo personas activas en dynamic. Úsala para selectores, asignaciones y para saber quién puede entrar. Para poner nombre a un historial usa retail.personas_historial.';

create or replace view retail.personas_historial
with (security_invoker = true) as
select p.id, p.auth_user_id,
       (p.nombres || ' ' || coalesce(p.apellidos, '')) as nombre,
       p.sede_base_id as sede_id,
       p.rol::text as rol,
       p.email, p.estado
from public.personas p;

comment on view retail.personas_historial is
  'Todas las personas, activas o no. SOLO para mostrar quién hizo algo en el pasado (movimientos, ventas, cajas); nunca para ofrecer a alguien en un selector.';

grant select on retail.personas_historial to authenticated;


-- ── 5 · Las 5 lecturas «cualquier autenticado» → solo activos ───────────────
-- `(select ...)` hace que Postgres evalúe la función UNA vez por consulta y no
-- una vez por fila (el catálogo tiene cientos de variantes).
drop policy if exists categorias_select on retail.categorias;
create policy categorias_select on retail.categorias
  for select using ((select retail.es_activa()));

drop policy if exists productos_select on retail.productos;
create policy productos_select on retail.productos
  for select using ((select retail.es_activa()));

drop policy if exists variantes_select on retail.variantes;
create policy variantes_select on retail.variantes
  for select using ((select retail.es_activa()));

drop policy if exists cuentas_select on retail.cuentas_contables;
create policy cuentas_select on retail.cuentas_contables
  for select using ((select retail.es_activa()));

drop policy if exists proveedores_select on retail.proveedores;
create policy proveedores_select on retail.proveedores
  for select using ((select retail.es_activa()));


-- ============================================================================
-- CÓMO VERIFICAS (pega esto DESPUÉS, en el SQL Editor)
-- ============================================================================
-- 1) Nadie de baja en el equipo de hoy (debe dar 0):
--      select count(*) from retail.personas where estado <> 'activo';
-- 2) El historial sí los conserva (debe dar ≥ 1 si hay bajas en dynamic):
--      select count(*) from retail.personas_historial where estado <> 'activo';
-- 3) Los candados nunca devuelven null (las 4 deben dar true o false, jamás vacío):
--      select retail.es_lider(), retail.es_supervisor(), retail.mi_sede(),
--             retail.puede_operar_sede(gen_random_uuid());
--    (en el SQL Editor corres como postgres, sin auth.uid(): es_lider/puede_operar_sede
--     dan false, que es lo correcto — «sin sesión» no es Líder.)
-- 4) En la app: entra con tu cuenta de Líder → Asignar rol → buscar la persona dada
--    de baja: ya no aparece. Si probaste con una cuenta de baja: login → aviso
--    «tu cuenta no está activa en el equipo».


-- ============================================================================
-- REVERSA (solo si algo sale mal; deja todo como tras los pasos 3-6)
-- ============================================================================
-- create or replace function retail.es_lider() returns boolean language sql stable set search_path = public
--   as $$ select public.fn_rol_actual() = 'admin'; $$;
-- create or replace function retail.es_supervisor() returns boolean language sql stable set search_path = public
--   as $$ select public.fn_rol_actual() = 'supervisor_sede'; $$;
-- create or replace function retail.mi_sede() returns uuid language sql stable set search_path = public
--   as $$ select public.fn_sede_actual_persona(); $$;
-- create or replace function retail.puede_operar_sede(p_sede_id uuid) returns boolean language sql stable set search_path = public
--   as $$ select public.fn_rol_actual() = 'admin' or public.fn_sede_actual_persona() = p_sede_id; $$;
-- create or replace function retail.persona_actual()
--   returns table (id uuid, auth_user_id uuid, nombre text, sede_id uuid, rol text, email text)
--   language sql stable security definer set search_path = public
--   as $$ select p.id, p.auth_user_id, (p.nombres || ' ' || coalesce(p.apellidos, '')), p.sede_base_id, p.rol::text, p.email
--         from public.personas p where p.auth_user_id = auth.uid(); $$;
-- create or replace view retail.personas with (security_invoker = true) as
--   select p.id, p.auth_user_id, (p.nombres || ' ' || coalesce(p.apellidos, '')) as nombre,
--          p.sede_base_id as sede_id, p.rol::text as rol, p.email, p.estado from public.personas p;
-- drop view if exists retail.personas_historial;
-- drop policy if exists categorias_select  on retail.categorias;        create policy categorias_select  on retail.categorias        for select using (auth.role() = 'authenticated');
-- drop policy if exists productos_select   on retail.productos;         create policy productos_select   on retail.productos         for select using (auth.role() = 'authenticated');
-- drop policy if exists variantes_select   on retail.variantes;         create policy variantes_select   on retail.variantes         for select using (auth.role() = 'authenticated');
-- drop policy if exists cuentas_select     on retail.cuentas_contables; create policy cuentas_select     on retail.cuentas_contables for select using (auth.role() = 'authenticated');
-- drop policy if exists proveedores_select on retail.proveedores;       create policy proveedores_select on retail.proveedores       for select using (auth.role() = 'authenticated');
-- drop function if exists retail.es_activa();
