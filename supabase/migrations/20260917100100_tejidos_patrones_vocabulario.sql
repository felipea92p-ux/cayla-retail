-- ============================================================================
-- 20260917100100 — Tejidos y patrones: vocabulario cerrado, propone/aprueba/
-- rechaza, atributos del PRODUCTO (no de la variante)
--
-- POR QUÉ SON ATRIBUTOS DE productos Y NO DE variantes
--   El tejido y el patrón de una prenda no cambian entre sus tallas — un
--   vestido de algodón sigue siendo de algodón en S y en L. Si un mismo
--   diseño existe en dos telas distintas, son dos PRODUCTOS distintos (con
--   su propia referencia), no dos variantes del mismo. Consecuencia directa:
--   el máximo de variantes por producto sigue siendo talla × color — tejido
--   y patrón nunca entran a esa combinatoria (confirmado con Felipe,
--   2026-09-17).
--
-- ALCANCE: SOLO CATÁLOGO/TIENDA
--   Verificado contra ADR-0051 (Producción del Taller): una orden de
--   producción consume variantes que YA EXISTEN en el catálogo — no hay
--   concepto de receta/materia prima consumida. Tejido/patrón acá son un
--   dato de catálogo (búsqueda, filtro, inteligencia comercial), no un
--   insumo de producción. Si algún día hace falta costear por tela
--   consumida en el Taller, es un sistema de materia prima aparte — no una
--   extensión de estas dos columnas.
--
-- MISMO MOLDE QUE colores/tallas: id uuid, propone/aprueba/rechaza,
-- candado de clave única normalizada (ADR-0024), sin comentario obligatorio
-- al aprobar (a diferencia de tallas — acá un valor de más es tan barato de
-- limpiar como un color de más).
-- ============================================================================

create table retail.tejidos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  estado text not null default 'aprobado' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  propuesto_por uuid references public.personas (id),
  aprobado_por uuid references public.personas (id),
  aprobado_en timestamptz,
  notas text,
  created_at timestamptz not null default now()
);
create unique index tejidos_clave_unica on retail.tejidos (retail.fn_clave_texto(nombre));

create table retail.patrones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  estado text not null default 'aprobado' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  propuesto_por uuid references public.personas (id),
  aprobado_por uuid references public.personas (id),
  aprobado_en timestamptz,
  notas text,
  created_at timestamptz not null default now()
);
create unique index patrones_clave_unica on retail.patrones (retail.fn_clave_texto(nombre));

comment on table retail.tejidos is 'Vocabulario cerrado de tejidos (algodón, poliéster, drill...). Atributo de retail.productos, no de variantes — ver encabezado de este archivo. Qué categorías lo ofrecen vive en retail.categoria_tejidos.';
comment on table retail.patrones is 'Vocabulario cerrado de patrones/estampados de tela (liso, rayado, floral...). Mismo molde que tejidos.';

-- ---------- columnas en productos, ANTES de los triggers que las van a leer ----------
alter table retail.productos add column if not exists tejido_id uuid references retail.tejidos (id);
alter table retail.productos add column if not exists patron_id uuid references retail.patrones (id);

comment on column retail.productos.tejido_id is 'Opcional. Filtrado por categoría en el formulario vía retail.categoria_tejidos — no hay CHECK que lo fuerce a nivel de base porque la lista de categorías válidas cambia sin migración.';
comment on column retail.productos.patron_id is 'Opcional. Mismo criterio que tejido_id.';

-- ---------- el candado: mismo mecanismo que tallas/colores, con el "en uso" ya resoluble porque productos.tejido_id/patron_id ya existen ----------
create or replace function retail.fn_tejidos_estado_trigger()
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
    return new;
  end if;

  if new.estado = 'aprobado' and old.estado is distinct from 'aprobado' then
    if old.estado <> 'pendiente' then
      raise exception 'Solo se puede aprobar un tejido que todavía está pendiente.';
    end if;
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
  elsif new.estado = 'rechazado' and old.estado is distinct from 'rechazado' then
    if old.estado <> 'pendiente' then
      raise exception 'Solo se puede rechazar una propuesta que todavía está pendiente de aprobar.';
    end if;
    if exists (select 1 from productos where tejido_id = old.id and estado = 'activo') then
      raise exception 'Ya hay un producto activo con este tejido — apruébalo y desactívalo si ya no sirve.';
    end if;
    new.activo := false;
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
  end if;

  return new;
end;
$$;

create or replace function retail.fn_patrones_estado_trigger()
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
    return new;
  end if;

  if new.estado = 'aprobado' and old.estado is distinct from 'aprobado' then
    if old.estado <> 'pendiente' then
      raise exception 'Solo se puede aprobar un patrón que todavía está pendiente.';
    end if;
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
  elsif new.estado = 'rechazado' and old.estado is distinct from 'rechazado' then
    if old.estado <> 'pendiente' then
      raise exception 'Solo se puede rechazar una propuesta que todavía está pendiente de aprobar.';
    end if;
    if exists (select 1 from productos where patron_id = old.id and estado = 'activo') then
      raise exception 'Ya hay un producto activo con este patrón — apruébalo y desactívalo si ya no sirve.';
    end if;
    new.activo := false;
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
  end if;

  return new;
end;
$$;

create trigger tejidos_estado_biut
  before insert or update on retail.tejidos
  for each row execute function retail.fn_tejidos_estado_trigger();

create trigger patrones_estado_biut
  before insert or update on retail.patrones
  for each row execute function retail.fn_patrones_estado_trigger();

alter table retail.tejidos add constraint tejidos_rechazado_no_activo check (estado <> 'rechazado' or activo = false);
alter table retail.patrones add constraint patrones_rechazado_no_activo check (estado <> 'rechazado' or activo = false);

-- ---------- RLS: mismo patrón que colores/tallas ----------
alter table retail.tejidos enable row level security;
create policy tejidos_select on retail.tejidos for select using (auth.role() = 'authenticated');
create policy tejidos_insert_autenticado on retail.tejidos for insert with check (auth.role() = 'authenticated');
create policy tejidos_update_lider on retail.tejidos for update using (retail.fn_es_lider()) with check (retail.fn_es_lider());

alter table retail.patrones enable row level security;
create policy patrones_select on retail.patrones for select using (auth.role() = 'authenticated');
create policy patrones_insert_autenticado on retail.patrones for insert with check (auth.role() = 'authenticated');
create policy patrones_update_lider on retail.patrones for update using (retail.fn_es_lider()) with check (retail.fn_es_lider());
