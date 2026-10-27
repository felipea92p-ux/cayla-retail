-- fn_campanas_en_sede vuelve a responder a las cuentas de la tienda (2026-10-24).
--
-- QUÉ PASÓ: la migración de las ofertas de una campaña (20261023232000, ADR-0496, PR #1310) se pegó en producción el
-- 2026-10-23 a las 18:59 (Lima). Reescribió `fn_campanas_en_sede` para que también lea `campana_reglas`,
-- `campana_regla_categorias` y `campana_regla_sedes`, y a esas tres tablas les quitó todo permiso a `authenticated`
-- (RLS encendido y sin políticas: «se leen solo por funciones security definer»). Pero `fn_campanas_en_sede` era, y
-- siguió siendo, security INVOKER: corre con los permisos de quien la llama. Desde ese minuto, toda cuenta que la llama
-- recibe `42501 permission denied for table campana_reglas`: Etiquetas de precio se cae entera («Esta pantalla no está
-- mostrando datos», p. ej. con Body Ludmi), y lo mismo le pasa a todo lo que pregunta «qué campaña rige hoy» desde la
-- web (Vender, Productos, Inventario, `fn_campanas_por_variante`, que delega en ella). En los registros de Postgres:
-- 14.177 errores entre el 2026-10-23 23:59 y el 2026-10-24 15:35 UTC. `registrar_venta`, `separar_prendas` y
-- `editar_separacion` son security definer y siguieron funcionando.
--
-- POR QUÉ ASÍ (y no dando permiso de lectura a las tablas): con `grant select` y RLS sin políticas la función dejaría de
-- fallar, pero leería CERO ofertas sin avisar, y la etiqueta y la pantalla de Vender dirían un precio distinto del que
-- cobra `registrar_venta` (que sí las ve). Una política nueva, además, toma las tablas de auth y storage (ADR-0195).
-- Volverla security definer es lo que la migración de las ofertas ya suponía, y es un `alter`: no toma esos candados.
--
-- QUÉ NO CAMBIA: la función filtra lo mismo que antes (campañas aprobadas, activas, vigentes y que rigen en la sede, con
-- `fn_campana_rige_en_sede`, que ya era security definer). Lo que devuelve —qué campaña y qué % alcanza a cada prenda—
-- lo ve cualquier cuenta de la tienda en Catálogo; `anon` sigue sin poder llamarla. El `search_path` ya venía fijado.
--
-- Idempotente: se puede pegar dos veces. Si se pega en una base sin la migración de las ofertas, también sirve.

set lock_timeout = '3s';

alter function retail.fn_campanas_en_sede(date, integer, uuid[], uuid) security definer;
alter function retail.fn_campanas_en_sede(date, integer, uuid[], uuid) set search_path to 'retail', 'public';
revoke all on function retail.fn_campanas_en_sede(date, integer, uuid[], uuid) from public, anon;
grant execute on function retail.fn_campanas_en_sede(date, integer, uuid[], uuid) to authenticated;
