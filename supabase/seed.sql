-- ============================================================================
-- SEED LOCAL — corre SOLO en `supabase db reset` / `supabase start`.
-- Nunca se pega en producción (ver CLAUDE.md §"Cómo aplicar SQL a producción").
--
-- POR QUÉ EXISTE ESTE ARCHIVO
-- Producción no vive en su propio proyecto: vive dentro del proyecto de
-- cayla-dynamic, en un schema llamado `retail`. Por eso la app pide
-- `db: { schema: "retail" }`. Pero las migraciones se escriben SIN prefijo para
-- que corran limpias contra el Postgres local — y eso las deja en `public`.
-- Resultado hasta hoy: la app NUNCA pudo correr contra local, porque pedía un
-- schema que en local no existía. Cada pantalla nueva se verificaba contra
-- producción, o no se verificaba.
--
-- La solución es renombrar el schema DESPUÉS de migrar, no antes: las
-- migraciones siguen escribiéndose sin prefijo (una sola forma de escribirlas,
-- como manda CLAUDE.md) y el local termina con la misma forma que producción.
-- Cero divergencia en el código de la app entre local y producción.
--
-- CÓMO SE REVIERTE: borrar este archivo y `supabase db reset`. No toca nada
-- fuera del Postgres local.
-- ============================================================================

-- ==================== 1. public → retail ====================
alter schema public rename to retail;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;

-- Las 32 funciones del repo llevan `set search_path = public` escrito en su
-- definición. Renombrar el schema NO reescribe ese texto: quedarían apuntando a
-- un `public` vacío y toda RPC fallaría con "relation does not exist". Se
-- corrigen en bloque para no depender de que alguien recuerde hacerlo una por
-- una cada vez que se agrega una función nueva.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proconfig::text like '%search_path%'
  loop
    execute format('alter function %s set search_path = retail, public, extensions', f.sig);
  end loop;
end $$;

-- Supabase solo auto-expone lo que se crea en `public`. Como `retail` es un
-- schema propio, los permisos van explícitos — RLS sigue siendo quien decide
-- qué fila ve cada quien, esto solo abre la puerta del schema.
grant usage on schema retail to anon, authenticated, service_role;
grant all on all tables in schema retail to anon, authenticated, service_role;
grant all on all sequences in schema retail to anon, authenticated, service_role;
grant execute on all functions in schema retail to anon, authenticated, service_role;

set search_path to retail, public, extensions;

-- ==================== 2. Usuario para entrar ====================
-- Las sedes NO se siembran aquí: ya las crean las migraciones (0001 las tiendas
-- y el Taller, 0008 los almacenes, 0020 el corporativo). Por eso todo lo de
-- abajo las busca por `codigo` en vez de traer ids inventados — un id fijo aquí
-- chocaría con el que generó la migración y dejaría el seed a medias.

-- Credenciales de desarrollo, a propósito obvias y sin valor fuera de esta
-- máquina: felipe@cayla.local / cayla-local
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-4222-8222-000000000001',
  'authenticated', 'authenticated', 'felipe@cayla.local',
  extensions.crypt('cayla-local', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
) on conflict (id) do nothing;

-- GoTrue exige la identidad además del usuario: sin esta fila el login con
-- correo y contraseña devuelve "credenciales inválidas" aunque el usuario exista.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  '22222222-2222-4222-8222-000000000002',
  '22222222-2222-4222-8222-000000000001',
  '22222222-2222-4222-8222-000000000001',
  '{"sub":"22222222-2222-4222-8222-000000000001","email":"felipe@cayla.local","email_verified":true}'::jsonb,
  'email', now(), now(), now()
) on conflict (id) do nothing;

insert into personas (auth_user_id, nombre, sede_id, rol)
select '22222222-2222-4222-8222-000000000001', 'Felipe Alvarez', id, 'lider'
from sedes where codigo = 'AQP'
on conflict (auth_user_id) do nothing;

-- ==================== 3. Series de comprobantes ====================
-- Sin serie registrada no se puede emitir nada (es así también en producción:
-- SUNAT las asigna por punto de emisión). Se siembran para AQP para que la
-- pantalla de Facturación sea probable de punta a punta.
insert into series_comprobantes (sede_id, tipo, serie)
select id, t.tipo, t.serie
from sedes, (values ('boleta', 'B001'), ('factura', 'F001')) as t(tipo, serie)
where sedes.codigo = 'AQP'
on conflict (sede_id, tipo) do nothing;

-- El catálogo (productos/variantes/stock) NO se siembra aquí a propósito: son
-- 300-900 SKUs reales que se cargan por la pantalla de Recibir mercadería
-- (docs/GUIA-CARGA-CATALOGO.md). Un catálogo de juguete en el seed haría que
-- Inteligencia mienta.
