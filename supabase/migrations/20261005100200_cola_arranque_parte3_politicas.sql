-- ============================================================================
-- 20261005100200_cola_arranque_parte3_politicas.sql — CAYLA V2 (ADR-0334, Felipe 2026-10-04)
-- «Cerrar la cola de arranque»: PARTE 3 de 3 — quién puede LEER las dos tablas nuevas. Solo políticas, y al final.
--
-- POR QUÉ SOLA: en Supabase cada `create policy` toma en exclusiva las tablas de `auth` y `storage` hasta el final de la
-- transacción, y el SQL Editor corre todo lo pegado en una. Mezclada con el `alter table` de la parte 1 chocaba con el Asesor de
-- seguridad del panel (`40P01 deadlock detected`, CLAUDE.md «Políticas y deadlocks»). Aquí no hay nada más que políticas.
--
-- QUIÉN LEE: quien opera esa sede (la misma regla que `prendas_por_regularizar`): la lista de Ventas sin registrar dice «cerrada
-- el 15-oct por un líder» a quien la mira. Escribir NO se permite a nadie desde el navegador: solo `cerrar_cola_arranque`.
--
-- PRODUCCIÓN: pegar con OK de Felipe, tras las partes 1 y 2. Ya lleva `retail.`. Se puede pegar dos veces.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $p$
begin
  if not exists (select 1 from pg_policies where schemaname = 'retail' and tablename = 'cierres_cola_arranque' and policyname = 'cierres_cola_arranque_select') then
    create policy cierres_cola_arranque_select on retail.cierres_cola_arranque for select
      using (retail.fn_puede_operar_ubicacion(ubicacion_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'retail' and tablename = 'cola_arranque_plazo' and policyname = 'cola_arranque_plazo_select') then
    create policy cola_arranque_plazo_select on retail.cola_arranque_plazo for select
      using (retail.fn_puede_operar_ubicacion(ubicacion_id));
  end if;
end
$p$;

grant select on retail.cierres_cola_arranque to authenticated;
grant select on retail.cola_arranque_plazo to authenticated;

select retail.fn_rls_una_vez_por_consulta();

-- Validación final.
do $v$
begin
  if (select count(*) from pg_policies where schemaname = 'retail' and policyname in ('cierres_cola_arranque_select', 'cola_arranque_plazo_select')) <> 2 then
    raise exception 'cola de arranque: faltan las políticas de lectura';
  end if;
end
$v$;
