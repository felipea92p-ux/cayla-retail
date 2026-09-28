-- ============================================================================
-- 20260928190100_clientas_politicas_por_modulo.sql — CAYLA V2 · Clientas · PARTE 2 de 2 (SOLO políticas, sola)
-- ADR-0249, «Actualización 2026-09-28». Lee primero la PARTE 1 (20260928190000_clientas_por_modulo_y_anonimizar_todo.sql):
-- ahí están el problema, las decisiones y por qué hay dos archivos.
--
-- QUÉ CAMBIA.
--   1. `clientas_select` (la lectura directa de la tabla por la API): de «cualquier sesión»
--      (`(select auth.role()) = 'authenticated'`) a `(select retail.fn_ve_modulo('clientas'))`, la misma pregunta que ya
--      hacen sus 11 funciones desde la PARTE 1. `fn_ve_modulo` incluye al líder y al admin en su primera línea: no se repite
--      `fn_es_lider()`. Envuelta en `(select …)`: Postgres la evalúa una vez por consulta, no una por fila (ADR-0176).
--      Sigue sin políticas de INSERT, UPDATE ni DELETE: la tabla se escribe solo por sus funciones.
--   2. `clientas_fusiones_select` se BORRA. En producción nunca existió (el paso 2 se pegó sin ella, a propósito): en main
--      la creaba 20260928140000, y con esto main queda igual que producción. La tabla queda con RLS encendido y sin
--      políticas; desde la PARTE 1, además, sin permisos para la API (la leen y escriben solo funciones security definer).
--
-- DECIDÍ: la política pregunta por el módulo, igual que las funciones: una sola regla para las dos puertas de la ficha.
-- DESCARTÉ: dejar la lectura directa abierta y proteger solo las funciones: la misma ficha (DNI, celular, cumpleaños) se
--   leería por `/rest/v1/clientas` sin pasar por ellas. Y crear una política propia para `clientas_fusiones`: nadie de la
--   API la lee (la pantalla no la consulta), así que una política es una puerta más sin nadie que la use.
-- SE ROMPE SI (revisado el 2026-09-28 en `apps/web` y en producción, solo lectura, retail.roles + retail.rol_modulos):
--   · Lo que la web lee DIRECTO de `clientas` y pasa por esta política: Ventas ▸ Historial (el nombre de la clienta, embed
--     `cliente:clientas ( nombre )` en lib/ventas-historial.ts), Facturación ▸ Comprobantes (el WhatsApp de la clienta para
--     enviar el comprobante, lib/comprobantes.ts → getExtrasDeComprobantes) y /clientas (que ya exige el módulo). Un rol con
--     Historial o Facturación y SIN Clientas vería la venta sin el nombre de la clienta y el comprobante sin el botón de
--     WhatsApp: no un error, un dato que falta. HOY NO PASA: en producción, los roles con Historial o Facturación son
--     Integrante y Terminal de ventas, y los dos tienen Clientas; Terminal Almacén y Gestión & Visión no tienen ninguno de
--     los tres; el líder lo ve todo. Si Felipe crea un rol así, el arreglo es leer ese nombre y ese WhatsApp por una función
--     `security definer` que devuelva solo esos dos datos, no reabrir esta política.
--   · Las funciones `security definer` que leen `clientas` por dentro (`fn_ventas_del_dia`, `separar_prendas`) corren como
--     `postgres`, dueña de la tabla, y no pasan por la política: no cambian. Ninguna vista de `retail` lee `clientas`.
--   · Depende de `retail.fn_ve_modulo` (20260923030000), que producción tiene desde el 2026-09-23, y de que `authenticated`
--     pueda ejecutarla (la usan todas las políticas por módulo): si no, la tabla daría error en vez de 0 filas.
--
-- CÓMO SE PEGA: SOLA en el SQL Editor (una política toma en exclusiva las tablas de `auth` y `storage` hasta el final de la
-- transacción: no se mezcla con ningún `alter`; CLAUDE.md, «Políticas y deadlocks»). Recomendado DESPUÉS de la PARTE 1,
-- pero no depende de ella. `lock_timeout` de 3 s: si algo la bloquea, falla limpio y se vuelve a pegar. Idempotente.
--
-- VERIFICACIÓN (solo lectura):
--   select tablename, policyname, qual from pg_policies
--    where schemaname = 'retail' and tablename in ('clientas', 'clientas_fusiones');
--   → UNA fila: clientas | clientas_select | ( SELECT retail.fn_ve_modulo('clientas'::text) AS fn_ve_modulo)
--
-- CÓMO SE DESHACE (sin pérdida de datos; solo, en su propio pegado, con las mismas precauciones):
--   drop policy if exists clientas_select on retail.clientas;
--   create policy clientas_select on retail.clientas for select using ((select auth.role()) = 'authenticated');
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

drop policy if exists clientas_fusiones_select on retail.clientas_fusiones;

drop policy if exists clientas_select on retail.clientas;
create policy clientas_select on retail.clientas
  for select using ((select retail.fn_ve_modulo('clientas')));
