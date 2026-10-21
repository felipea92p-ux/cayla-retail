-- ============================================================================
-- 20261017230000_tienda_web_topes_de_conexion.sql — CAYLA V2 · la tienda no puede dejar sin base al ERP (ADR-0450)
--
-- EL PROBLEMA PRIMERO. La base de producción es UNA (hasta la tarde del 17-oct, un Supabase Micro: 1 GB y 60 conexiones; esa tarde se
-- midió con `max_connections = 90` y `shared_buffers = 512MB`, un Small) y la comparten las cajas del ERP, Dynamic y la tienda online
-- pública. El 17-oct se cayó dos veces; no hay prueba de cuál de los tres la ahogó (el registro de
-- Postgres no dejó ningún error), pero hay un hecho: el usuario de la tienda (`tienda_web_prod`) no tenía ningún tope de conexiones.
-- Cada instancia de la tienda abre hasta 3 (`apps/tienda/lib/base.ts`, `max: 3`) y Vercel levanta tantas instancias como visitas
-- simultáneas haya: cuando la tienda se abra a todas las clientas, un pico de visitas se convertiría en un pico de conexiones, y las
-- conexiones de la base son pocas (90): las que ocupa la tienda son las que le faltan a las cajas.
--
-- ANALOGÍA CAYLA. La tienda en línea es la puerta de calle y el ERP es el mostrador. Si entran todas las clientas a la vez y no hay
-- tope de gente en la puerta, nadie puede llegar al mostrador a cobrar. Con un aforo en la puerta, lo que sobra espera afuera
-- («no pudimos cargar, reintenta»), pero el mostrador sigue atendiendo.
--
-- QUÉ HACE. A cada usuario que puede iniciar sesión y es miembro del rol `tienda_web` (hoy en producción: `tienda_web_prod`; en un
-- Postgres local, ninguno) le fija:
--   · `connection limit 20`: como mucho 20 conexiones a la vez. Es un tope, no una reserva. MEDIDO en producción el 2026-10-17 a las 18:15
--     (Lima), recién reiniciada la base y sin tráfico: `tienda_web_prod` ya tenía 11 conexiones abiertas (el grupo de Supavisor en modo
--     sesión mantiene las suyas aunque nadie navegue), `authenticator` (PostgREST, el ERP) 16 y el sistema ~12, de 90 permitidas (un Supabase
--     Small). Un tope de 12 habría dejado a la tienda en el borde desde el primer minuto; 20 le da holgura sobre lo que ya usa y deja ~30
--     conexiones libres para las cajas del ERP, Auth y Dynamic. Si la tienda lo alcanza, la conexión 21 recibe «too many connections for
--     role»: `leerConRespaldo` lo convierte en «no se pudo cargar» y la página se puede reintentar (el catálogo guardado 30 s absorbe casi
--     todo, ADR-0426). AJUSTAR con datos antes de abrir la tienda a todas: `select usename, count(*) from pg_stat_activity group by 1
--     order by 2 desc` durante la prueba de carga; el valor correcto es «el máximo de un día bueno + holgura», y se cambia con
--     `alter role tienda_web_prod connection limit N`. Y si se sube el tamaño del servidor, sube también `max_connections`: revisar.
--   · `statement_timeout = 5s`: ya era el de la tienda en producción (ADR-0408, 20261015215000); aquí queda escrito en el repo para
--     que un usuario nuevo de la tienda no nazca sin él.
--   · `idle_in_transaction_session_timeout = 10s`: una conexión que abrió una transacción y se quedó sin hablar (un proceso que murió
--     a medias) se cierra sola a los 10 s; si no, retiene una de las 20 para siempre.
-- No toca ningún otro rol: ni `authenticator`/`authenticated` (el ERP), ni `postgres`, ni el que usa Dynamic.
--
-- DECIDÍ: recorrer los miembros de `tienda_web` que heredan (y no están en una lista de roles intocables) en vez de nombrar `tienda_web_prod`: ese usuario lo crea Felipe a mano con su
--   contraseña (no está en las migraciones) y un renombre o un segundo usuario (uno de prueba de carga) heredaría el tope sin tocar
--   esto. Y en CI/local, donde no existe, el bucle no recorre nada y la migración no falla.
-- DESCARTÉ: poner el tope en el pooler (Supavisor) solamente: se configura en el panel, no queda en el repo ni lo prueba el CI, y
--   no protege de una conexión directa. Se puede sumar, pero este tope es el que la base hace cumplir sola (principio 2).
--   Subir el `statement_timeout`: el 15-oct se vio qué pasa (una página que tarda 24 s en vez de fallar).
--
-- ES UN CAMBIO DE PRODUCCIÓN (CLAUDE.md: confirmar antes): Felipe pidió pegarla el 2026-10-17 y se pegó ese día, con el 20 medido (arriba).
-- Una sola parte, idempotente; `alter role` no toma las tablas de `auth` ni `storage` (CLAUDE.md, «Políticas y deadlocks»), así que
-- no choca con el Asesor de seguridad del panel.
-- ============================================================================
set lock_timeout = '3s';

-- CUIDADO (lo encontró `pnpm pruebas:base-resiliencia`): en Postgres 16+, quien crea un rol queda como miembro suyo (con ADMIN OPTION, sin
-- heredar ni poder usarlo). `tienda_web` lo creó `postgres`, así que `postgres` aparece entre sus «miembros que pueden entrar», y un tope de
-- 20 conexiones puesto a `postgres` dejaría al administrador sin poder abrir la consola. Por eso el bucle solo toma las membresías que
-- HEREDAN (las de `create role … in role tienda_web`), nunca a un superusuario ni a un rol de Supabase o del ERP (lista de abajo), aunque
-- alguien los sumara a `tienda_web` mañana.
do $$
declare
  v_usuario text;
  v_nunca constant text[] := array[
    'postgres', 'authenticator', 'authenticated', 'anon', 'service_role', 'tienda_web', 'dashboard_user', 'pgbouncer',
    'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin', 'supabase_read_only_user', 'supabase_replication_admin',
    'supabase_etl_admin', 'supabase_functions_admin', 'supabase_realtime_admin', 'supabase_privileged_role'
  ];
begin
  for v_usuario in
    select u.rolname
      from pg_roles u
      join pg_auth_members m on m.member = u.oid and m.inherit_option
      join pg_roles g on g.oid = m.roleid and g.rolname = 'tienda_web'
     where u.rolcanlogin
       and not u.rolsuper
       and u.rolname <> all (v_nunca)
       and u.rolname not like 'pg\_%'
       and u.rolname not like 'supabase\_%'
  loop
    execute format('alter role %I connection limit 20', v_usuario);
    execute format('alter role %I set statement_timeout = %L', v_usuario, '5s');
    execute format('alter role %I set idle_in_transaction_session_timeout = %L', v_usuario, '10s');
    raise notice 'tienda_web_topes_de_conexion: topes puestos a %', v_usuario;
  end loop;
end
$$;
