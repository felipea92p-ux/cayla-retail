-- ============================================================================
-- 0039 — `personas.estado`: que local y producción hablen el mismo idioma
--
-- EL PROBLEMA (encontrado por la super auditoría, 2026-09-05)
-- Hay 4 personas con `estado = 'inactivo'` y `auth_user_id` vivo en producción:
-- pueden iniciar sesión hoy y operar su sede de siempre. Nada lo impide, porque
-- `lib/persona.ts` nunca leyó el estado de la persona. Verificado en vivo:
--   select estado, (auth_user_id is not null) as login, count(*)
--   from public.personas group by 1,2;
--   -- activo+login = 24 · inactivo+login = 4 · el resto sin login
--
-- POR QUÉ HACE FALTA ESTA MIGRACIÓN Y NO BASTA CON ARREGLAR EL FRONTEND
-- La misma idea se llama de dos formas distintas según dónde corra la app:
--   producción  → `retail.personas` (vista sobre dynamic) expone `estado text`
--                 con valores 'activo' / 'inactivo'
--   local       → la tabla `personas` de `0001_init.sql:31` tiene `activo boolean`
-- Un `select ... , estado` funciona en producción y revienta en local; un
-- `select ... , activo` hace exactamente lo contrario. Es el mismo patrón de
-- migración dual que la auditoría encontró diez veces (ADR-0011): dos formas de
-- decir lo mismo, y el código obligado a elegir un entorno.
--
-- LA DECISIÓN: gana el vocabulario de producción. Dynamic es la fuente de la
-- identidad (ADR-0012), así que es local el que se adapta, nunca al revés.
-- `activo` NO se borra — se conserva sincronizado, porque hay datos vivos ahí y
-- en este repo no se borran datos (CLAUDE.md). Queda como columna espejo.
--
-- CÓMO SE VERIFICA (en local, después de `npx supabase db reset`)
--   select estado, activo, count(*) from retail.personas group by 1,2;
--   -- toda fila con activo=true debe traer estado='activo', y viceversa
-- ============================================================================

alter table personas
  add column if not exists estado text not null default 'activo';

-- Se rellena desde `activo`, que hasta hoy era la única verdad en local.
update personas set estado = case when activo then 'activo' else 'inactivo' end;

alter table personas
  drop constraint if exists personas_estado_check;
alter table personas
  add constraint personas_estado_check check (estado in ('activo', 'inactivo'));

-- Las dos columnas se mantienen en el mismo sitio: mientras `activo` siga
-- existiendo, dejar que se contradigan sería crear justamente el estado
-- inconsistente que el principio 2 prohíbe. El trigger es local y barato —
-- en producción esta columna no existe: ahí `estado` viene de dynamic.
create or replace function fn_sincronizar_estado_persona()
returns trigger
language plpgsql
as $$
begin
  -- Quien escriba cualquiera de las dos, la otra lo sigue.
  if tg_op = 'INSERT' then
    if new.estado is distinct from case when new.activo then 'activo' else 'inactivo' end then
      new.activo := (new.estado = 'activo');
    end if;
  elsif new.estado is distinct from old.estado then
    new.activo := (new.estado = 'activo');
  elsif new.activo is distinct from old.activo then
    new.estado := case when new.activo then 'activo' else 'inactivo' end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sincronizar_estado_persona on personas;
create trigger trg_sincronizar_estado_persona
  before insert or update on personas
  for each row execute function fn_sincronizar_estado_persona();

comment on column personas.estado is
  'Espejo local del `estado` que la vista retail.personas trae de dynamic en '
  'producción. Sincronizado con `activo` por trigger. La app SIEMPRE lee '
  '`estado`, nunca `activo` — ver 0039 y ADR-0011.';
