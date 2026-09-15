-- ============================================================================
-- 20260915150000_movimientos_insert_solo_rpc.sql — CAYLA V2
--
-- CONTEXTO: `movimientos` es el ledger append-only del que se reconstruye
-- `stock` (`recalcular_stock`). El 2026-09-14
-- (`20260914165703_movimientos_inmutables.sql`) se bloqueó UPDATE/DELETE con
-- un trigger + revoke, verificado contra `pg_proc` real. Ese mismo día se
-- dejó el INSERT sin tocar a propósito, con el razonamiento de que la policy
-- `movimientos_insert` (`0004_rls.sql`) era una "segunda capa" detrás de las
-- funciones `security definer`. No lo es: sin `FORCE ROW LEVEL SECURITY`
-- (confirmado abajo que sigue sin activarse), esas funciones —dueño
-- `postgres`— se saltan esa policy por completo. La policy es la ÚNICA
-- puerta real para un insert directo del cliente
-- (`supabase.from('movimientos').insert(...)`), y hoy deja pasar a cualquier
-- colaborador autenticado con acceso a la ubicación. Un insert así crea una
-- fila real en el ledger sin que `stock` se entere — el efecto sobre `stock`
-- no vive en un trigger, vive adentro de `fn_aplicar_movimiento`, que nadie
-- llama si el insert no pasó por una de las 12 funciones verificadas abajo.
--
-- CAMBIA: revoca el privilegio INSERT sobre `retail.movimientos` a
-- `authenticated`/`anon` a nivel de tabla. Sin ese privilegio, Postgres
-- rechaza el INSERT antes de evaluar ninguna policy — así que
-- `movimientos_insert` queda documentada como la regla que aplicaría SI
-- alguna vez se le vuelve a dar el privilegio a alguien, no como protección
-- activa hoy.
--
-- POR QUÉ NO ROMPE NADA — verificado contra producción
-- (proyecto vovjyyiafkxteijimpuy) el 2026-09-15, no razonado:
--
-- 1) Qué función de `retail` inserta en movimientos, dueña o invitada:
--      select p.proname, p.prosecdef as security_definer, pg_get_userbyid(p.proowner) as owner
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'retail' and p.prosrc ~* 'insert\s+into\s+(retail\.)?movimientos'
--      order by p.proname;
--    Devolvió 12 filas (aprobar_devolucion, cerrar_conteo, cerrar_produccion,
--    mover_interno, recibir_compras, recibir_lote, registrar_cambio,
--    registrar_movimiento ×2 firmas, registrar_venta, revertir_produccion,
--    transferir) — TODAS security_definer = true, TODAS dueño `postgres`.
--    Ninguna depende del privilegio que se revoca acá.
--
-- 2) Si el dueño se salta la RLS de la tabla (sin esto, el punto 1 no alcanza):
--      select relrowsecurity, relforcerowsecurity from pg_class
--      where oid = 'retail.movimientos'::regclass;
--    -> relrowsecurity=true, relforcerowsecurity=false. Sin FORCE, el dueño
--    de las 12 funciones (`postgres`) se salta RLS: esas funciones ni
--    siquiera pasan hoy por la policy, dependen solo de ser dueñas.
--
-- 3) Qué privilegios tiene `authenticated` hoy sobre la tabla:
--      select grantee, privilege_type from information_schema.role_table_grants
--      where table_schema = 'retail' and table_name = 'movimientos';
--    -> `authenticated`: INSERT, SELECT (UPDATE/DELETE ya los sacó la
--    migración de ayer). `anon`: ninguno. Tras esta migración, `authenticated`
--    queda solo con SELECT.
--
-- 4) Qué pantalla del código toca `movimientos` directo (no por RPC):
--      grep -rn "\.from(.movimientos.)" apps/web
--    -> un solo resultado, `lib/compras.ts:330`, y es un `.select(...)`
--    (lectura de recepciones para el detalle de una factura), no un insert.
--    Cero pantallas dependen de insertar directo.
--
-- CÓMO SE CORRIGE UN ERROR A PARTIR DE ACÁ: igual que dice
-- `20260914165703_movimientos_inmutables.sql` — un movimiento de corrección
-- con el signo contrario, nunca editando ni insertando a mano desde la app.
-- Si hiciera falta un insert manual real (recuperar un incidente, por
-- ejemplo), se hace desde el SQL Editor conectado como `postgres` (dueño, se
-- salta todo esto) — no hace falta una puerta de atrás nueva.
--
-- SE ROMPE SI: alguien escribe una pantalla o script nuevo que inserte en
-- `movimientos` sin pasar por una función `security definer` — le va a salir
-- `permission denied for table movimientos`. La respuesta correcta no es
-- devolver el privilegio: es escribir esa operación como RPC (o reusar
-- `registrar_movimiento`), igual que las otras 12.
--
-- LO QUE ESTA MIGRACIÓN NO HACE: no activa `FORCE ROW LEVEL SECURITY` (punto
-- 2) — sigue sin hacer falta mientras alcance el revoke de tabla, y
-- activarlo es el cambio de mayor riesgo que la migración de ayer ya dejó
-- anotado aparte en BACKLOG. Tampoco toca `retail.transferencias`, que tiene
-- la misma forma de policy (`transferencias_insert` en `0004_rls.sql`) y es
-- el siguiente candidato obvio — verificarla es otro paso, no este.
-- ============================================================================

set search_path = retail, public, extensions;

revoke insert on retail.movimientos from authenticated, anon;

comment on policy movimientos_insert on retail.movimientos is
  'Ya NO es la protección activa contra un insert directo del cliente — desde '
  '20260915150000_movimientos_insert_solo_rpc.sql esa protección es el REVOKE '
  'de INSERT a authenticated/anon a nivel de tabla (Postgres rechaza el '
  'INSERT antes de llegar a evaluar esta policy). Queda como la regla que '
  'aplicaría SI alguna vez se le vuelve a dar el privilegio a alguien — no '
  'borrarla asumiendo que ya no importa.';
