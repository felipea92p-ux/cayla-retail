-- ============================================================================
-- 39_movimientos_inmutables.sql — GEMELO DE PRODUCCIÓN de
-- supabase/migrations/20260914165703_movimientos_inmutables.sql (ADR-0042)
--
-- QUÉ HACE: vuelve imposible editar o borrar una fila de `retail.movimientos`
-- —la única fuente desde la que se reconstruye el stock— con un disparador que
-- siempre rechaza, y le retira a `authenticated`/`anon` los permisos de tabla
-- que hoy se lo permitirían. Cierra P-04 y la decisión D-22.
--
-- QUIÉN LO PEGA: solo Felipe, en el SQL Editor del proyecto de producción
-- (`vovjyyiafkxteijimpuy` — el proyecto de cayla-dynamic; retail vive ahí
-- dentro, en el schema `retail`). Decisión D-11.
--
-- ⚠️ POR QUÉ ESTE NO ES UNA COPIA DEL LOCAL. La base local corre **V2**
-- (32 tablas, `movimientos.venta_item_id`, `ubicacion_id`) y producción corre
-- el modelo **anterior** (45 tablas + 2 vistas, `movimientos.venta_id`,
-- `sede_id`, 56 funciones en `retail`). Este archivo solo toca lo que existe
-- igual en los dos: la tabla `movimientos` y sus permisos. No asume ni una
-- columna del modelo de V2.
--
-- ⚠️ NUMERACIÓN. Se usa `39` y no `36` a propósito: `docs/datos/` cita archivos
-- `36_candados_no_null.sql`, `37_registrar_venta_p_nota.sql` y
-- `38_backfill_migraciones_aplicadas.sql` que **no están en esta rama** (el
-- corte V1→V2 se llevó parte de la carpeta). Reutilizar uno de esos números
-- dejaría dos archivos distintos con el mismo nombre en la historia del
-- proyecto. Si al mirar producción resulta que el 39 ya se usó, renombrar.
--
-- SE PEGA EN CUATRO PASOS, no de un saque. El paso 1 no cambia nada: es la
-- pregunta que decide si los otros tres se pueden pegar.
-- ============================================================================


-- ============================================================================
-- PASO 1 · PRE-FLIGHT OBLIGATORIO — correr y LEER antes de seguir
-- No modifica nada. Si la consulta (a) devuelve aunque sea UNA fila, DETENERSE.
-- ============================================================================
--
-- (a) ¿Alguna función del proyecto actualiza o borra movimientos?
--
--     Un disparador frena TAMBIÉN a las funciones `security definer`, que son
--     las que se saltan las políticas por fila. Si alguna de las 56 funciones
--     de `retail` —o alguna de Dynamic en `public`— edita el pasado, este
--     candado la rompe en vivo, con las tiendas vendiendo.
--
--     Esta consulta mira TODOS los schemas, no solo `retail`: producción es un
--     proyecto compartido con Dynamic, y una función de `public` puede tocar
--     `retail.movimientos` igual. (La versión de este chequeo que circulaba en
--     `docs/datos/SQL-PENDIENTE-PRODUCCION.sql` solo miraba `retail` — acá se
--     amplía a propósito.)
--
--       select n.nspname as schema, p.proname as funcion
--       from pg_proc p
--       join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname not in ('pg_catalog', 'information_schema')
--         and (p.prosrc ~* 'update\s+(retail\.)?movimientos'
--           or p.prosrc ~* 'delete\s+from\s+(retail\.)?movimientos');
--
--     ESPERADO: 0 filas. (Contra la base local dio 0 el 2026-09-14, y contra
--     producción dio 0 el 2026-09-12 con la consulta angosta — pero eso fue
--     antes y con menos alcance, así que se vuelve a preguntar.)
--     SI DEVUELVE FILAS: no pegar nada. Avisar, y mirar caso por caso si esa
--     función debería estar corrigiendo el pasado o compensándolo.
--
-- (b) ¿Ya hay disparadores sobre la tabla?
--
--       select tgname from pg_trigger
--       where tgrelid = 'retail.movimientos'::regclass and not tgisinternal;
--
--     Si aparece `movimientos_inmutables`, este archivo ya se pegó: es
--     idempotente, volver a correrlo no hace daño.
--
-- (c) ¿Qué permisos hay hoy? (para saber qué se está quitando)
--
--       select grantee, privilege_type
--       from information_schema.role_table_grants
--       where table_schema = 'retail' and table_name = 'movimientos'
--         and grantee in ('authenticated', 'anon')
--       order by grantee, privilege_type;
--
--     Según el relevamiento del 2026-09-12, acá `authenticated` tiene UPDATE,
--     DELETE y **TRUNCATE**. El de TRUNCATE es el que más pesa: la seguridad
--     por fila NO se aplica a TRUNCATE — vaciaría la tabla entera saltándose
--     todas las políticas, y con ella el inventario de CAYLA.


-- ============================================================================
-- PASO 2 · El candado
-- ============================================================================

set search_path to retail, public;

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
  'buena fe. Se corrige escribiendo lo contrario, nunca borrando. ADR-0042.';

drop trigger if exists movimientos_inmutables on retail.movimientos;

create trigger movimientos_inmutables
  before update or delete on retail.movimientos
  for each row execute function retail.fn_historial_es_inmutable();


-- ============================================================================
-- PASO 3 · Los permisos que no tenían por qué estar
-- Se puede pegar por separado si el paso 1(c) mostró algo inesperado.
-- ============================================================================

revoke update, delete, truncate on retail.movimientos from authenticated, anon;

-- Y que las tablas nuevas de `retail` no nazcan con TRUNCATE concedido. Ojo:
-- esto aplica a lo que cree el rol `postgres` de aquí en adelante, no cambia
-- ninguna tabla existente. Si el dueño real de las tablas de `retail` no es
-- `postgres`, esta línea no hace nada — comprobarlo con:
--   select tableowner from pg_tables where schemaname='retail' limit 5;
alter default privileges for role postgres in schema retail
  revoke truncate on tables from authenticated, anon;


-- ============================================================================
-- PASO 4 · VERIFICACIÓN — correr después de pegar, y leerla
-- ============================================================================
--
-- (a) El candado existe:
--
--       select tgname, tgenabled from pg_trigger
--       where tgrelid = 'retail.movimientos'::regclass and not tgisinternal;
--
--     ESPERADO: una fila `movimientos_inmutables`, con `tgenabled = 'O'`.
--
-- (b) El candado FRENA de verdad — probado en rojo, no asumido.
--     Esto tiene que FALLAR con el mensaje en castellano:
--
--       begin;
--         update retail.movimientos set cantidad = cantidad
--         where id = (select id from retail.movimientos limit 1);
--       rollback;
--
--     (El `rollback` sobra porque nunca llega a tocar nada; está para que la
--     prueba no tenga ningún riesgo.)
--
-- (c) Los permisos quedaron como deben:
--
--       select grantee, privilege_type
--       from information_schema.role_table_grants
--       where table_schema = 'retail' and table_name = 'movimientos'
--         and grantee in ('authenticated', 'anon')
--       order by grantee, privilege_type;
--
--     ESPERADO: solo INSERT y SELECT para `authenticated`. Nada para `anon`.
--
-- (d) Y que las tiendas siguen vendiendo: registrar una venta real desde la
--     pantalla. El INSERT no se toca, pero eso se comprueba, no se supone.


-- ============================================================================
-- CÓMO SE REVIERTE (si algo que no vimos escribía en el pasado)
-- ============================================================================
--
--   drop trigger if exists movimientos_inmutables on retail.movimientos;
--   grant update, delete on retail.movimientos to authenticated;
--
-- No hace falta tocar la función: sin disparador que la llame, no hace nada.
-- NO se repone TRUNCATE a propósito — ningún flujo del sistema lo necesita.
--
-- LA SALIDA DE EMERGENCIA, abierta a propósito (D-11): el candado frena a la
-- aplicación y a las funciones, no a Felipe. Para corregir algo a mano sin
-- desarmar el candado:
--
--   begin;
--     alter table retail.movimientos disable trigger movimientos_inmutables;
--     -- … la corrección, con su motivo anotado …
--     alter table retail.movimientos enable trigger movimientos_inmutables;
--   commit;
--
-- Imposible por accidente, posible a propósito y con rastro.


-- ============================================================================
-- PASO 5 · Dejar constancia (la convención del repo)
-- Sin esto, el estado de producción vuelve a ser una suposición.
-- Si `retail.migraciones_aplicadas` no tiene estas columnas, ajustar el insert
-- en vez de saltearlo.
-- ============================================================================

insert into retail.migraciones_aplicadas (archivo, aplicada_at, nota)
values (
  '39_movimientos_inmutables.sql',
  now(),
  'ADR-0042: disparador que rechaza UPDATE/DELETE sobre movimientos + retiro de UPDATE/DELETE/TRUNCATE a authenticated y anon. Pre-flight de funciones que editan el pasado: 0 filas.'
)
on conflict (archivo) do nothing;
