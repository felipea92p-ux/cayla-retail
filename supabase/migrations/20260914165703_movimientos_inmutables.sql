-- ============================================================================
-- 20260914165703_movimientos_inmutables.sql — CAYLA V2
--
-- CONTEXTO: `movimientos` es la única fuente desde la que se puede reconstruir
-- el stock (`recalcular_stock`). Toda la documentación la presenta como una
-- tabla que "nunca se edita y nunca se borra" — pero eso lo sostenía la
-- costumbre, no la base: no había ni un disparador ni una policy de UPDATE o
-- DELETE. Se salvaba por OMISIÓN (nadie escribió la policy), no por decisión,
-- y esa omisión no cubre al dueño de la tabla ni a las funciones
-- `security definer`, que se saltan las policies por definición.
-- Es el hueco P-04 de `docs/datos/13-PROMESAS-INCUMPLIDAS.md` y la decisión
-- D-22 de `docs/datos/DECISIONES-2026-09-12.md`.
--
-- CAMBIA: un disparador `before update or delete` que siempre rechaza, más el
-- retiro de los permisos de tabla que `authenticated` tenía sobre esta tabla
-- (UPDATE y DELETE concedidos, verificado contra la base local antes de
-- escribir esto).
--
-- POR QUÉ NO ROMPE NADA — verificado, no razonado. Se le preguntó a la base
-- qué funciones del schema `retail` actualizan o borran movimientos:
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'retail'
--     and (p.prosrc ~* 'update\s+(retail\.)?movimientos'
--       or p.prosrc ~* 'delete\s+from\s+(retail\.)?movimientos');
-- Devolvió CERO filas. Ninguna función toca el pasado, así que el candado no
-- le quita nada a nadie: vuelve imposible lo que ya nadie hacía. El INSERT no
-- se toca — registrar_venta, registrar_movimiento y el resto siguen igual.
--
-- CÓMO SE CORRIGE UN ERROR A PARTIR DE ACÁ: no borrando, escribiendo lo
-- contrario. Un movimiento de corrección con el signo opuesto y su motivo. El
-- stock queda bien y el historial muestra las dos cosas — el error y quién lo
-- corrigió. Igual que un contador, que revierte un asiento en vez de borrarlo.
--
-- LA PUERTA DE ATRÁS, a propósito (D-11): este candado frena a la aplicación y
-- a las funciones, NO a Felipe desde el SQL Editor — el dueño de la tabla
-- puede desactivar su propio disparador un minuto, corregir y reactivarlo.
-- Imposible por accidente, posible a propósito y con rastro.
--
-- SE ROMPE SI: alguien escribe una RPC nueva que necesite corregir una fila de
-- `movimientos` en vez de compensarla con otra. Si eso pasa, la pregunta no es
-- cómo saltarse el disparador — es por qué esa operación no se puede expresar
-- como un movimiento nuevo.
--
-- LO QUE ESTA MIGRACIÓN NO HACE, a propósito: `alter table ... force row level
-- security`, la tercera pieza de D-22. Eso haría que las policies apliquen
-- también al dueño, y las funciones `security definer` que insertan
-- movimientos (venta, transferencia, conteo) tendrían que pasarlas — es un
-- cambio con riesgo real de romper flujos legítimos y necesita su propia
-- prueba. Queda anotado en `docs/BACKLOG.md`.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.fn_historial_es_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'El historial de movimientos no se edita ni se borra. Para corregir un error, '
    'registra un movimiento de corrección con el signo contrario y su motivo — '
    'así el stock queda bien y queda constancia de qué pasó.';
end;
$$;

comment on function retail.fn_historial_es_inmutable() is
  'Rechaza cualquier UPDATE o DELETE sobre movimientos. D-22: la historia es la '
  'única fuente desde la que se reconstruye el stock, y no puede depender de la '
  'buena fe. Se corrige escribiendo lo contrario, nunca borrando.';

drop trigger if exists movimientos_inmutables on retail.movimientos;

create trigger movimientos_inmutables
  before update or delete on retail.movimientos
  for each row execute function retail.fn_historial_es_inmutable();

-- Defensa en profundidad: el disparador ya bloquea por fila, pero el permiso
-- de tabla no tenía por qué estar concedido. `anon` no lo tenía; `authenticated`
-- sí (UPDATE y DELETE). TRUNCATE se revoca aunque hoy no esté concedido, porque
-- la seguridad por fila NO se aplica a TRUNCATE: vaciaría la tabla entera
-- saltándose todas las policies.
revoke update, delete, truncate on retail.movimientos from authenticated, anon;
