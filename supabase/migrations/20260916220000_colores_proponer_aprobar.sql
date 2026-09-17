-- ============================================================================
-- 20260916220000_colores_proponer_aprobar.sql — CAYLA V2 · módulo 02 (Loro)
--
-- EL PROBLEMA
--   Agregar un color al vocabulario cerrado (`/productos/colores`, ADR-0095)
--   exigía Líder — RLS (`colores_write_lider`) y el propio API route lo
--   bloqueaban igual. Durante el censo (16 al 20 de septiembre), quien
--   escanea una prenda de un color que falta no puede seguir: tiene que
--   avisar a un Líder y esperar. Con 16 colaboradores de tienda recién dados
--   de alta (BITÁCORA 2026-09-16) y el censo corriendo, eso frena piso.
--
-- LA DECISIÓN (Felipe, 2026-09-16 — ver memoria de la sesión)
--   Un solo mecanismo: cualquiera con sesión propone un color y queda
--   USABLE AL INSTANTE (nunca bloquea el censo); cualquiera de los Líderes
--   actuales lo aprueba después. No hay "fusionar": `colores_clave_unica`
--   (ADR-0024) ya impide que "azul"/"azul " convivan como dos filas — la
--   propuesta duplicada simplemente choca con el color que ya existe.
--
-- CÓMO SE HACE CUMPLIR
--   El estado real no lo decide el cliente (ni el API route, ni quien pegue
--   un insert a mano): lo decide un trigger que mira `retail.fn_es_lider()`
--   en el momento del insert. Así, RLS puede abrir INSERT a cualquier
--   autenticado sin volverse el agujero — un colaborador que intente forzar
--   `estado='aprobado'` a mano se lo pisa el trigger antes de guardar.
--   UPDATE (aprobar, editar, desactivar) sigue siendo solo Líder, sin
--   cambios: mismo candado de siempre.
-- ============================================================================

alter table retail.colores
  add column if not exists estado text not null default 'aprobado'
    check (estado in ('pendiente', 'aprobado')),
  add column if not exists propuesto_por uuid references public.personas (id),
  add column if not exists aprobado_por uuid references public.personas (id),
  add column if not exists aprobado_en timestamptz;

comment on column retail.colores.estado is
  'pendiente = propuesto por cualquiera, usable al instante, sin aprobar todavía. aprobado = los 30+ originales y todo lo que un Líder aprobó o agregó él mismo.';

-- ---------- el candado real: el estado lo decide el trigger, no quien inserta ----------
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

-- ---------- RLS: abre INSERT a cualquier autenticado; UPDATE sigue siendo solo Líder ----------
-- Mismo estilo que el resto del esquema (`colores_select`, `productos_write_lider`):
-- sin `TO authenticated` — la app entera conecta como ese rol de Postgres vía
-- PostgREST, pero acá se sigue el mismo patrón `auth.role() = 'authenticated'`
-- que ya usa `colores_select`, en vez de mezclar los dos estilos.
drop policy if exists colores_write_lider on retail.colores;

create policy colores_insert_autenticado on retail.colores
  for insert
  with check (auth.role() = 'authenticated');

create policy colores_update_lider on retail.colores
  for update
  using (retail.fn_es_lider())
  with check (retail.fn_es_lider());
