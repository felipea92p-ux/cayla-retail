-- ============================================================================
-- SQL PENDIENTE DE PRODUCCIÓN · 2026-09-16 · Colores: proponer/aprobar (ADR-0070)
--
-- Cómo pegar: en el SQL Editor de producción, UN bloque por vez y en orden.
-- Todos los bloques son repetibles: pegar dos veces no falla ni duplica nada.
-- Nada se borra. No toca ninguna otra tabla.
-- ============================================================================


-- ---------- 0. Columnas nuevas en retail.colores ----------
begin;
alter table retail.colores
  add column if not exists estado text not null default 'aprobado'
    check (estado in ('pendiente', 'aprobado')),
  add column if not exists propuesto_por uuid references public.personas (id),
  add column if not exists aprobado_por uuid references public.personas (id),
  add column if not exists aprobado_en timestamptz;

comment on column retail.colores.estado is
  'pendiente = propuesto por cualquiera, usable al instante, sin aprobar todavía. aprobado = los originales y todo lo que un Líder aprobó o agregó él mismo.';
commit;


-- ---------- 1. El trigger que decide el estado real ----------
begin;
create or replace function retail.fn_colores_estado_trigger()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
begin
  select id into v_persona from public.personas where auth_user_id = auth.uid();

  if tg_op = 'INSERT' then
    new.propuesto_por := v_persona;
    if retail.fn_es_lider() then
      new.estado := 'aprobado';
      new.aprobado_por := v_persona;
      new.aprobado_en := now();
    else
      new.estado := 'pendiente';
      new.aprobado_por := null;
      new.aprobado_en := null;
    end if;
  elsif tg_op = 'UPDATE' and new.estado = 'aprobado' and old.estado is distinct from 'aprobado' then
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
  end if;
  return new;
end;
$$;

drop trigger if exists colores_estado_biut on retail.colores;
create trigger colores_estado_biut
  before insert or update on retail.colores
  for each row execute function retail.fn_colores_estado_trigger();
commit;


-- ---------- 2. RLS: INSERT abierto a cualquier autenticado; UPDATE sigue siendo solo Líder ----------
begin;
drop policy if exists colores_write_lider on retail.colores;
drop policy if exists colores_insert_autenticado on retail.colores;
drop policy if exists colores_update_lider on retail.colores;

create policy colores_insert_autenticado on retail.colores
  for insert
  with check (auth.role() = 'authenticated');

create policy colores_update_lider on retail.colores
  for update
  using (retail.fn_es_lider())
  with check (retail.fn_es_lider());
commit;


-- ---------- 3. COMPROBACIÓN — lo esperado está a la derecha de cada columna ----------
select
  (select count(*) from retail.colores where estado not in ('pendiente','aprobado')) as estados_invalidos, -- 0
  (select count(*) from retail.colores where estado = 'aprobado')                    as colores_ya_aprobados, -- 32+
  (select count(*) from pg_trigger where tgname = 'colores_estado_biut')             as trigger_creado,     -- 1
  (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'colores'
     and policyname = 'colores_insert_autenticado')                                   as policy_insert,      -- 1
  (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'colores'
     and policyname = 'colores_update_lider')                                         as policy_update,      -- 1
  (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'colores'
     and policyname = 'colores_write_lider')                                          as policy_vieja;       -- 0
