-- Pruebas de retail.etiquetar_variantes (20260919010000) — se corren con
-- `node scripts/pruebas/etiquetar_variantes.mjs`, que levanta un Postgres
-- EFÍMERO y aislado (no toca Docker ni la base compartida) y lo destruye al terminar.
--
-- El fixture copia solo lo que la función toca, con las llaves y candados reales de
-- producción (docs/datos/generado/retail_constraints.json): variante_etiquetas con su
-- PK compuesta y FKs, etiquetas con su CHECK de estado, y `fn_es_lider` tal cual está
-- en producción. Cada escenario corre en su propia transacción con ROLLBACK.
\set ON_ERROR_STOP on
\set QUIET on

create role authenticated nologin;
create schema auth; create schema retail; create schema extensions;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;

create table public.personas (id uuid primary key default gen_random_uuid(), auth_user_id uuid, estado text not null default 'activo');
create table retail.colaboradores (persona_id uuid primary key references public.personas (id), rol text not null);
create table retail.variantes (id uuid primary key default gen_random_uuid(), activo boolean not null default true);
create table retail.etiquetas (
  id uuid primary key default gen_random_uuid(), nombre text not null,
  activo boolean not null default true,
  estado text not null default 'aprobado' check (estado in ('pendiente', 'aprobado', 'rechazado'))
);
create table retail.variante_etiquetas (
  variante_id uuid not null references retail.variantes (id) on delete cascade,
  etiqueta_id uuid not null references retail.etiquetas (id),
  created_at timestamptz not null default now(),
  primary key (variante_id, etiqueta_id)
);

CREATE OR REPLACE FUNCTION retail.fn_es_lider()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'retail', 'public', 'extensions'
AS $function$
  select exists (
    select 1 from public.personas p
    join retail.colaboradores c on c.persona_id = p.id
    where p.auth_user_id = auth.uid() and p.estado = 'activo' and c.rol = 'lider'
  );
$function$;

\i supabase/migrations/20260919010000_etiquetar_variantes.sql

-- ---------- datos comunes ----------
insert into public.personas (id, auth_user_id) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),   -- Felipe, líder
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');   -- Micaela, colaboradora
insert into retail.colaboradores values ('11111111-1111-4111-8111-111111111111', 'lider'), ('22222222-2222-4222-8222-222222222222', 'integrante');
insert into retail.etiquetas (id, nombre, estado, activo) values
  ('e0000000-0000-4000-8000-00000000000a', 'Black Friday', 'aprobado', true),
  ('e0000000-0000-4000-8000-00000000000b', 'Hecho a mano', 'aprobado', true),
  ('e0000000-0000-4000-8000-00000000000c', 'Propuesta',    'pendiente', true),
  ('e0000000-0000-4000-8000-00000000000d', 'Vieja',        'aprobado', false);
insert into retail.variantes (id, activo) values
  ('a0000000-0000-4000-8000-000000000001', true), ('a0000000-0000-4000-8000-000000000002', true),
  ('a0000000-0000-4000-8000-000000000003', true), ('a0000000-0000-4000-8000-000000000004', false);
grant usage on schema retail, auth to authenticated;
grant select on all tables in schema retail to authenticated;  -- como en producción: cualquiera con sesión lee
grant execute on function retail.etiquetar_variantes(jsonb) to authenticated;

-- ---------- ayudas ----------
create function pg_temp.como_lider() returns void language sql as $$ select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true) $$;
create function pg_temp.como_colaboradora() returns void language sql as $$ select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true) $$;
create function pg_temp.n(p_etiqueta text) returns int language sql as $$ select count(*)::int from retail.variante_etiquetas where etiqueta_id = ('e0000000-0000-4000-8000-00000000000' || p_etiqueta)::uuid $$;
create function pg_temp.falla_con(p_sql text, p_frase text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return sqlerrm like '%' || p_frase || '%';
end $$;
create function pg_temp.ok(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FALLÓ: %', p_nombre; end if;
  raise notice '  ✓ %', p_nombre;
end $$;

\set A '''e0000000-0000-4000-8000-00000000000a'''
\set B '''e0000000-0000-4000-8000-00000000000b'''
\set C '''e0000000-0000-4000-8000-00000000000c'''
\set D '''e0000000-0000-4000-8000-00000000000d'''
\set V1 '''a0000000-0000-4000-8000-000000000001'''
\set V2 '''a0000000-0000-4000-8000-000000000002'''
\set V3 '''a0000000-0000-4000-8000-000000000003'''
\set V4 '''a0000000-0000-4000-8000-000000000004'''

\echo
\echo 'etiquetar_variantes — escenarios'
-- Los avisos (✓) salen por stderr; las filas que devuelven los select no interesan.
\o /dev/null

-- 1. Agrega a varias variantes y cuenta lo que REALMENTE cambió
begin; select pg_temp.como_lider(); set local role authenticated;
select pg_temp.ok('1. agrega a 3 variantes y devuelve agregadas=3',
  (retail.etiquetar_variantes(jsonb_build_array(jsonb_build_object('etiqueta_id', :A, 'agregar', jsonb_build_array(:V1, :V2, :V3)))) ->> 'agregadas')::int = 3 and pg_temp.n('a') = 3);
rollback;

-- 2. Idempotente: repetir no duplica ni falla, y dice 0 cambios reales
begin; select pg_temp.como_lider(); set local role authenticated;
select retail.etiquetar_variantes(jsonb_build_array(jsonb_build_object('etiqueta_id', :A, 'agregar', jsonb_build_array(:V1, :V2))));
select pg_temp.ok('2. repetir es idempotente (agregadas=0, siguen 2)',
  (retail.etiquetar_variantes(jsonb_build_array(jsonb_build_object('etiqueta_id', :A, 'agregar', jsonb_build_array(:V1, :V2)))) ->> 'agregadas')::int = 0 and pg_temp.n('a') = 2);
rollback;

-- 3. NO pisa las demás etiquetas de la variante (el defecto de actualizar_variantes_etiquetas)
begin; select pg_temp.como_lider(); set local role authenticated;
select retail.etiquetar_variantes(jsonb_build_array(jsonb_build_object('etiqueta_id', :B, 'agregar', jsonb_build_array(:V1))));
select retail.etiquetar_variantes(jsonb_build_array(jsonb_build_object('etiqueta_id', :A, 'agregar', jsonb_build_array(:V1))));
select pg_temp.ok('3. agregar A no borra B en la misma variante', pg_temp.n('a') = 1 and pg_temp.n('b') = 1);
rollback;

-- 4. Quitar suelta solo esa etiqueta
begin; select pg_temp.como_lider(); set local role authenticated;
select retail.etiquetar_variantes(jsonb_build_array(jsonb_build_object('etiqueta_id', :A, 'agregar', jsonb_build_array(:V1, :V2))));
select retail.etiquetar_variantes(jsonb_build_array(jsonb_build_object('etiqueta_id', :B, 'agregar', jsonb_build_array(:V1))));
select pg_temp.ok('4. quitar A de V1 deja B y deja A en V2',
  (retail.etiquetar_variantes(jsonb_build_array(jsonb_build_object('etiqueta_id', :A, 'quitar', jsonb_build_array(:V1)))) ->> 'quitadas')::int = 1
  and pg_temp.n('a') = 1 and pg_temp.n('b') = 1);
rollback;

-- 5. Quitar lo que no estaba no falla
begin; select pg_temp.como_lider(); set local role authenticated;
select pg_temp.ok('5. quitar lo que no estaba devuelve quitadas=0',
  (retail.etiquetar_variantes(jsonb_build_array(jsonb_build_object('etiqueta_id', :A, 'quitar', jsonb_build_array(:V1)))) ->> 'quitadas')::int = 0);
rollback;

-- 6. Agregar y quitar y a la vez la misma prenda: contradicción, se rechaza
begin; select pg_temp.como_lider(); set local role authenticated;
select pg_temp.ok('6. la misma variante en agregar y quitar se rechaza',
  pg_temp.falla_con($q$select retail.etiquetar_variantes('[{"etiqueta_id":"e0000000-0000-4000-8000-00000000000a","agregar":["a0000000-0000-4000-8000-000000000001"],"quitar":["a0000000-0000-4000-8000-000000000001"]}]'::jsonb)$q$, 'agregarse y quitarse a la vez'));
rollback;

-- 7. Etiqueta pendiente no llega a ninguna prenda
begin; select pg_temp.como_lider(); set local role authenticated;
select pg_temp.ok('7. etiqueta pendiente no se puede aplicar y no deja filas',
  pg_temp.falla_con($q$select retail.etiquetar_variantes('[{"etiqueta_id":"e0000000-0000-4000-8000-00000000000c","agregar":["a0000000-0000-4000-8000-000000000001"]}]'::jsonb)$q$, 'aprobada y activa') and pg_temp.n('c') = 0);
rollback;

-- 8. Etiqueta desactivada: no se aplica, pero SÍ se puede soltar
begin;
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:V1, :D);
select pg_temp.como_lider(); set local role authenticated;
select pg_temp.ok('8a. etiqueta inactiva no se puede aplicar',
  pg_temp.falla_con($q$select retail.etiquetar_variantes('[{"etiqueta_id":"e0000000-0000-4000-8000-00000000000d","agregar":["a0000000-0000-4000-8000-000000000002"]}]'::jsonb)$q$, 'aprobada y activa'));
select pg_temp.ok('8b. pero sí se puede quitar de una prenda',
  (retail.etiquetar_variantes(jsonb_build_array(jsonb_build_object('etiqueta_id', :D, 'quitar', jsonb_build_array(:V1)))) ->> 'quitadas')::int = 1 and pg_temp.n('d') = 0);
rollback;

-- 9. Una variante inactiva en el lote rechaza TODO el lote (nada a medias)
begin; select pg_temp.como_lider(); set local role authenticated;
select pg_temp.ok('9. con una variante inactiva no se etiqueta ninguna del lote',
  pg_temp.falla_con($q$select retail.etiquetar_variantes('[{"etiqueta_id":"e0000000-0000-4000-8000-00000000000a","agregar":["a0000000-0000-4000-8000-000000000001","a0000000-0000-4000-8000-000000000004"]}]'::jsonb)$q$, 'ya no está disponible') and pg_temp.n('a') = 0);
rollback;

-- 10. Todo o nada entre etiquetas: si el 2.º cambio falla, el 1.º no queda
begin; select pg_temp.como_lider(); set local role authenticated;
select pg_temp.ok('10. si falla el 2.º cambio, el 1.º tampoco se aplica',
  pg_temp.falla_con($q$select retail.etiquetar_variantes('[{"etiqueta_id":"e0000000-0000-4000-8000-00000000000a","agregar":["a0000000-0000-4000-8000-000000000001"]},{"etiqueta_id":"e0000000-0000-4000-8000-00000000000c","agregar":["a0000000-0000-4000-8000-000000000002"]}]'::jsonb)$q$, 'aprobada y activa') and pg_temp.n('a') = 0);
rollback;

-- 11. Una colaboradora no etiqueta
begin; select pg_temp.como_colaboradora(); set local role authenticated;
select pg_temp.ok('11. una colaboradora no puede etiquetar',
  pg_temp.falla_con($q$select retail.etiquetar_variantes('[{"etiqueta_id":"e0000000-0000-4000-8000-00000000000a","agregar":["a0000000-0000-4000-8000-000000000001"]}]'::jsonb)$q$, 'Solo un Líder') and pg_temp.n('a') = 0);
rollback;

-- 12. Sin sesión tampoco
begin; select set_config('request.jwt.claim.sub', '', true); set local role authenticated;
select pg_temp.ok('12. sin sesión no etiqueta',
  pg_temp.falla_con($q$select retail.etiquetar_variantes('[{"etiqueta_id":"e0000000-0000-4000-8000-00000000000a","agregar":["a0000000-0000-4000-8000-000000000001"]}]'::jsonb)$q$, 'Solo un Líder'));
rollback;

-- 13. Formas inválidas dan una frase legible, no un error crudo de Postgres
begin; select pg_temp.como_lider(); set local role authenticated;
select pg_temp.ok('13a. etiqueta con uuid mal formado', pg_temp.falla_con($q$select retail.etiquetar_variantes('[{"etiqueta_id":"no-soy-uuid","agregar":[]}]'::jsonb)$q$, 'no es válida'));
select pg_temp.ok('13b. prenda con uuid mal formado', pg_temp.falla_con($q$select retail.etiquetar_variantes('[{"etiqueta_id":"e0000000-0000-4000-8000-00000000000a","agregar":["xx"]}]'::jsonb)$q$, 'no es válida'));
select pg_temp.ok('13c. cambios que no son una lista', pg_temp.falla_con($q$select retail.etiquetar_variantes('{"a":1}'::jsonb)$q$, 'No hay cambios'));
select pg_temp.ok('13d. agregar que no es lista', pg_temp.falla_con($q$select retail.etiquetar_variantes('[{"etiqueta_id":"e0000000-0000-4000-8000-00000000000a","agregar":"x"}]'::jsonb)$q$, 'no es válida'));
rollback;

-- 14. Etiqueta inexistente
begin; select pg_temp.como_lider(); set local role authenticated;
select pg_temp.ok('14. etiqueta que ya no existe', pg_temp.falla_con($q$select retail.etiquetar_variantes('[{"etiqueta_id":"e0000000-0000-4000-8000-0000000000ff","quitar":["a0000000-0000-4000-8000-000000000001"]}]'::jsonb)$q$, 'ya no existe'));
rollback;

-- 15. Topes anti-accidente
begin; select pg_temp.como_lider(); set local role authenticated;
select pg_temp.ok('15a. más de 50 cambios se rechaza',
  pg_temp.falla_con($q$select retail.etiquetar_variantes((select jsonb_agg(jsonb_build_object('etiqueta_id', 'e0000000-0000-4000-8000-00000000000a', 'quitar', '[]'::jsonb)) from generate_series(1, 51)))$q$, 'demasiadas etiquetas'));
select pg_temp.ok('15b. más de 2000 prendas por etiqueta se rechaza',
  pg_temp.falla_con($q$select retail.etiquetar_variantes(jsonb_build_array(jsonb_build_object('etiqueta_id', 'e0000000-0000-4000-8000-00000000000a', 'quitar', (select jsonb_agg(gen_random_uuid()) from generate_series(1, 2001)))))$q$, 'demasiadas prendas'));
rollback;

-- 16. Duplicados dentro de la lista no rompen ni cuentan doble
begin; select pg_temp.como_lider(); set local role authenticated;
select pg_temp.ok('16. la misma prenda repetida en la lista cuenta una vez',
  (retail.etiquetar_variantes(jsonb_build_array(jsonb_build_object('etiqueta_id', :A, 'agregar', jsonb_build_array(:V1, :V1, :V1)))) ->> 'agregadas')::int = 1 and pg_temp.n('a') = 1);
rollback;

\echo
\echo '  16 escenarios (21 comprobaciones) en verde.'
