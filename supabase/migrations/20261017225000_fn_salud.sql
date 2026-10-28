-- ============================================================================
-- 20261017225000_fn_salud.sql — CAYLA V2 · «¿responde la base?» (ADR-0450)
--
-- EL PROBLEMA PRIMERO. El 17-oct la base de producción se cayó dos veces (16:41 y ~17:04, hora de Lima) y nos enteramos por las
-- colaboradoras: ninguna pieza del sistema le preguntaba a Postgres si estaba vivo. El único sondeo que había (`/auth/v1/health`)
-- lo contesta el servicio de Auth sin tocar la base, y siguió diciendo «bien» con Postgres muerto.
--
-- QUÉ HACE. Una función de una línea, `retail.fn_salud()`, que devuelve `true` y no lee ninguna tabla: lo único que prueba es que
-- un proceso de Postgres aceptó la conexión del pool de PostgREST y corrió una consulta. Es lo que llama `/api/salud` del ERP
-- (la pantalla «Sin conexión con la base» y el vigía de GitHub, ADR-0450) por la llave pública, como `anon`.
--
-- ANALOGÍA CAYLA. Tocar el timbre de la bodega: no se entra a contar nada, solo se sabe si hay alguien que abre.
--
-- DECIDÍ: función propia y no una existente de `anon` (`fn_club_textos_legales`): el sondeo no debe depender de una pantalla del
--   Club que mañana se retire, y una función de «salud» se reconoce a la primera en el diccionario.
--   `security invoker` y `search_path` vacío: no hace nada que necesite permisos ni resuelva nombres. `stable`: PostgREST la atiende
--   en una transacción de solo lectura.
-- DESCARTÉ: leer una tabla con la llave de servicio (pondría la llave más poderosa en una ruta pública), y una consulta contra una
--   tabla como `anon` esperando el 42501 (funciona, pero deja un «permission denied» en el registro de Postgres por cada pregunta).
--
-- NO TOCA NADA EXISTENTE: es una función nueva. Idempotente: pegarla dos veces deja lo mismo. Una sola parte, sin políticas ni
-- `alter` de tablas (CLAUDE.md, «Políticas y deadlocks»).
-- ============================================================================
set lock_timeout = '3s';

create or replace function retail.fn_salud()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select true $$;

revoke all on function retail.fn_salud() from public;
grant execute on function retail.fn_salud() to anon, authenticated, service_role;

comment on function retail.fn_salud() is
  'ADR-0450: «¿responde la base?». Devuelve true sin leer ninguna tabla; la llama /api/salud (pantalla «Sin conexión con la base» y vigía de GitHub). Pública a propósito: no devuelve ningún dato.';
