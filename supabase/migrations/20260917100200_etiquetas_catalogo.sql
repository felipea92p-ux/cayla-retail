-- ============================================================================
-- 20260917100200 — Etiquetas de catálogo: vocabulario cerrado, propone/
-- aprueba/rechaza, N:N por VARIANTE, con restricción opcional de sede
--
-- QUÉ ES Y QUÉ NO ES
--   Un tag de catálogo tipo folksonomy ("Oferta", "Verano 2026") para
--   filtrar/buscar — NO tiene relación con la etiqueta física de código de
--   barras que ya existe (`retail.codigos_barras`, `EtiquetasGenerator`).
--
-- POR QUÉ N:N CON variantes Y NO CON productos
--   Felipe (2026-09-17): "última unidad" aplica a una talla específica, no
--   a todo el modelo — granularidad por variante, no por producto. Misma
--   razón por la que talla/color ya viven ahí.
--
-- QUÉ ES sedes_permitidas
--   null o vacío = sin restricción, visible/vendible en cualquier sede. Con
--   valores = SOLO esas ubicaciones. Un array (no una tabla puente) porque
--   hoy son ~4 ubicaciones fijas, mismo criterio que
--   `categorias.tallas_sugeridas` antes de este cambio (0 a pocas opciones,
--   no amerita tabla de unión — principio 3).
--
-- DÓNDE SE HACE CUMPLIR
--   NO acá. El candado real vive en `registrar_venta` y `transferir`
--   (20260917100800_movimientos_respetan_restriccion_sede.sql) — una
--   etiqueta con sedes_permitidas es solo un dato hasta que esas dos
--   funciones lo leen. Una etiqueta PENDIENTE nunca restringe nada (el
--   candado exige estado='aprobado'): evita que un colaborador bloquee una
--   venta por accidente antes de que un Líder la revise.
-- ============================================================================

create table retail.etiquetas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  sedes_permitidas uuid[],
  estado text not null default 'aprobado' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  propuesto_por uuid references public.personas (id),
  aprobado_por uuid references public.personas (id),
  aprobado_en timestamptz,
  notas text,
  created_at timestamptz not null default now()
);
create unique index etiquetas_clave_unica on retail.etiquetas (retail.fn_clave_texto(nombre));

comment on column retail.etiquetas.sedes_permitidas is
  'null o vacío = sin restricción. Con valores = solo esas ubicaciones pueden vender/mostrar variantes con esta etiqueta. Solo tiene efecto si estado=aprobado (ver registrar_venta/transferir).';

create table retail.variante_etiquetas (
  variante_id uuid not null references retail.variantes (id) on delete cascade,
  etiqueta_id uuid not null references retail.etiquetas (id),
  created_at timestamptz not null default now(),
  primary key (variante_id, etiqueta_id)
);

comment on table retail.variante_etiquetas is
  'N:N variante↔etiqueta. 0, 1 o muchas etiquetas por variante — la PK compuesta solo evita duplicar el mismo par, sin tope de cardinalidad.';

-- ---------- el candado: mismo mecanismo, "en uso" ya resoluble porque variante_etiquetas existe en este mismo archivo ----------
create or replace function retail.fn_etiquetas_estado_trigger()
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
    if old.estado not in ('pendiente', 'rechazado') then
      raise exception 'Solo se puede aprobar una etiqueta que está pendiente, o reactivar una rechazada.';
    end if;
    new.activo := true;
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
  elsif new.estado = 'rechazado' and old.estado is distinct from 'rechazado' then
    if old.estado <> 'pendiente' then
      raise exception 'Solo se puede rechazar una propuesta que todavía está pendiente de aprobar.';
    end if;
    if exists (select 1 from variante_etiquetas where etiqueta_id = old.id) then
      raise exception 'Ya hay una variante usando esta etiqueta — apruébala y desactívala si ya no sirve.';
    end if;
    new.activo := false;
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
  end if;

  return new;
end;
$$;

create trigger etiquetas_estado_biut
  before insert or update on retail.etiquetas
  for each row execute function retail.fn_etiquetas_estado_trigger();

alter table retail.etiquetas add constraint etiquetas_rechazado_no_activo check (estado <> 'rechazado' or activo = false);

-- ---------- RLS ----------
alter table retail.etiquetas enable row level security;
create policy etiquetas_select on retail.etiquetas for select using (auth.role() = 'authenticated');
create policy etiquetas_insert_autenticado on retail.etiquetas for insert with check (auth.role() = 'authenticated');
create policy etiquetas_update_lider on retail.etiquetas for update using (retail.fn_es_lider()) with check (retail.fn_es_lider());

-- variante_etiquetas: cualquiera lee; solo Líder aplica/quita una etiqueta de
-- una variante — es edición normal de producto (mismo candado que
-- variantes_write_lider), distinto del mecanismo de aprobar el vocabulario.
alter table retail.variante_etiquetas enable row level security;
create policy variante_etiquetas_select on retail.variante_etiquetas for select using (auth.role() = 'authenticated');
create policy variante_etiquetas_write_lider on retail.variante_etiquetas for all
  using (retail.fn_es_lider()) with check (retail.fn_es_lider());
