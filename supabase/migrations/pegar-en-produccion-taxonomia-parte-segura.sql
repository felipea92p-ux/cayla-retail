-- ============================================================================
-- PEGAR EN PRODUCCIÓN — parte SEGURA de la taxonomía de hoy (2026-09-17)
--
-- No es un archivo de migración numerado: no lo recoge `supabase db reset`
-- local (el mismo patrón que ya usan `activacion-piso-almacen-produccion.sql`,
-- `datos-reales-produccion.sql`, etc. en esta carpeta). Vive acá para que
-- quede junto al resto de la historia, no porque el CLI lo vaya a aplicar.
--
-- POR QUÉ ESTE ARCHIVO EXISTE
--   Al ir a pegar las migraciones 20260917100000-20260917140000 en
--   producción se encontró que producción YA TIENE `retail.tejidos`,
--   `retail.patrones`, `retail.etiquetas`, `retail.variante_etiquetas` y
--   `productos.tejido_id`/`patron_id` — creados por otra sesión/rama,
--   nunca fusionada a main, con una versión más vieja del trigger (sin
--   "rechazar" en tejidos/patrones/etiquetas; colores sí tiene rechazar
--   pero no el fix de "reactivar retira el rechazo"). Pegar los archivos
--   de `supabase/migrations/` tal cual habría fallado en el primer
--   `create table retail.tejidos` (ya existe) y dejado todo a medias.
--
--   Verificado también: `retail.tallas` NO existe en producción,
--   `variantes.talla` sigue siendo texto libre (no `talla_id`),
--   `categorias.tallas_sugeridas` sigue viva, y el frontend desplegado en
--   `main` (confirmado leyendo `origin/main` directo, no asumido) todavía
--   lee `variantes.talla` y `categorias.tallas_sugeridas` — main nunca
--   fusionó el trabajo de este worktree.
--
-- QUÉ VA ACÁ (100% seguro, cero riesgo para lo que `main` ya usa hoy)
--   1. `retail.tallas` — tabla nueva, nadie en producción la toca todavía.
--   2. Arregla los triggers de tejidos/patrones/etiquetas (agrega
--      "rechazar") y de los 5 (agrega "reactivar retira el rechazo") —
--      pura ampliación de constraints/funciones sobre tablas que `main`
--      no consulta hoy (no hay pantalla de administración fusionada).
--   3. `retail.categoria_tallas/tejidos/patrones` — tablas nuevas, con
--      backfill que SOLO LEE `categorias.tallas_sugeridas` (nunca la
--      toca ni la borra).
--   4. Los 2 RPC nuevos de hoy (`actualizar_categoria_ejes`,
--      `actualizar_variantes_etiquetas`) — funciones nuevas, nada las
--      llama todavía.
--
-- QUÉ *NO* VA ACÁ, A PROPÓSITO (rompería la app en vivo AHORA MISMO)
--   - Agregar `variantes.talla_id` y borrar `variantes.talla`: el
--     `catalogo-v2.ts` de `main` todavía hace `select ... talla ...` —
--     borrar la columna tumba /productos, la ficha de producto y el POS
--     en el segundo que se aplique.
--   - Borrar `categorias.tallas_sugeridas`: `NuevoProductoForm.tsx` de
--     `main` todavía la lee para sugerir tallas al crear un producto.
--   - Tocar `registrar_venta`/`transferir` (candado de sede por
--     etiqueta): son las funciones que procesan CADA venta y traslado
--     real ahora mismo — se reescriben junto con el resto, no sueltas,
--     y con el cuerpo actual de producción en la mano, no a ciegas.
--   - Los 9 renombres/fusiones de categorías de ADR-0076 (Blusas→Camisas,
--     etc.): no rompen código, pero cambian lo que ve una encargada de
--     sede en el desplegable AHORA MISMO — se quedan para cuando se
--     coordine con Felipe el momento, no la seguridad técnica.
--   - Los 7 RPC/funciones que todavía leen `variantes.talla` como texto
--     y las firmas de `catalogo_actualizar_producto`/
--     `crear_producto_con_variantes` con `talla_id`.
--
--   Todo lo de arriba necesita ir EN EL MISMO MOMENTO que se fusiona este
--   worktree a `main` y se despliega el frontend nuevo — backend y
--   frontend tienen que moverse juntos ahí, no el backend primero.
-- ============================================================================

set search_path to retail, public, extensions;

-- ---------------------------------------------------------------------------
-- 1) retail.tallas — nueva, sin el candado "en uso" (depende de
--    variantes.talla_id, que llega junto con el frontend nuevo).
-- ---------------------------------------------------------------------------
create table retail.tallas (
  id uuid primary key default gen_random_uuid(),
  valor text not null,
  activo boolean not null default true,
  estado text not null default 'aprobado' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  propuesto_por uuid references public.personas (id),
  aprobado_por uuid references public.personas (id),
  aprobado_en timestamptz,
  notas text,
  created_at timestamptz not null default now()
);

comment on table retail.tallas is
  'Vocabulario cerrado de tallas. variantes.talla (texto libre) sigue viva hasta que el frontend V2 se fusione a main — ver ADR-0075. Qué categorías la ofrecen vive en retail.categoria_tallas.';
comment on column retail.tallas.notas is
  'A diferencia de colores/tejidos/patrones/etiquetas: OBLIGATORIO al aprobar (fn_tallas_estado_trigger lo exige). Opcional al rechazar.';

create unique index tallas_clave_unica on retail.tallas (retail.fn_clave_texto(valor));

create or replace function retail.fn_tallas_estado_trigger()
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
      raise exception 'Solo se puede aprobar una talla que está pendiente, o reactivar una rechazada.';
    end if;
    if coalesce(trim(new.notas), '') = '' then
      raise exception 'Aprobar una talla exige un comentario breve (a qué categoría aplica, por qué es distinta de las que ya existen).';
    end if;
    new.activo := true;
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
  elsif new.estado = 'rechazado' and old.estado is distinct from 'rechazado' then
    if old.estado <> 'pendiente' then
      raise exception 'Solo se puede rechazar una propuesta que todavía está pendiente de aprobar.';
    end if;
    new.activo := false;
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
  end if;

  return new;
end;
$$;

drop trigger if exists tallas_estado_biut on retail.tallas;
create trigger tallas_estado_biut
  before insert or update on retail.tallas
  for each row execute function retail.fn_tallas_estado_trigger();

alter table retail.tallas
  add constraint tallas_rechazado_no_activo check (estado <> 'rechazado' or activo = false);

alter table retail.tallas enable row level security;
create policy tallas_select on retail.tallas for select using (auth.role() = 'authenticated');
create policy tallas_insert_autenticado on retail.tallas for insert with check (auth.role() = 'authenticated');
create policy tallas_update_lider on retail.tallas for update using (retail.fn_es_lider()) with check (retail.fn_es_lider());

-- ---------------------------------------------------------------------------
-- 2) Arreglar los 5 triggers de vocabulario ya existentes: agrega
--    "rechazar" a tejidos/patrones/etiquetas (production solo tenía
--    pendiente/aprobado) y "reactivar retira el rechazo" a los 5.
-- ---------------------------------------------------------------------------
alter table retail.etiquetas drop constraint etiquetas_estado_check;
alter table retail.etiquetas add constraint etiquetas_estado_check check (estado in ('pendiente','aprobado','rechazado'));
alter table retail.etiquetas add constraint etiquetas_rechazado_no_activo check (estado <> 'rechazado' or activo = false);

alter table retail.tejidos drop constraint tejidos_estado_check;
alter table retail.tejidos add constraint tejidos_estado_check check (estado in ('pendiente','aprobado','rechazado'));
alter table retail.tejidos add constraint tejidos_rechazado_no_activo check (estado <> 'rechazado' or activo = false);

alter table retail.patrones drop constraint patrones_estado_check;
alter table retail.patrones add constraint patrones_estado_check check (estado in ('pendiente','aprobado','rechazado'));
alter table retail.patrones add constraint patrones_rechazado_no_activo check (estado <> 'rechazado' or activo = false);

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
    return new;
  end if;

  if new.estado = 'aprobado' and old.estado is distinct from 'aprobado' then
    if old.estado not in ('pendiente', 'rechazado') then
      raise exception 'Solo se puede aprobar un color que está pendiente, o reactivar uno rechazado.';
    end if;
    new.activo := true;
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
  elsif new.estado = 'rechazado' and old.estado is distinct from 'rechazado' then
    if old.estado <> 'pendiente' then
      raise exception 'Solo se puede rechazar una propuesta que todavía está pendiente de aprobar.';
    end if;
    if exists (select 1 from variantes where color_codigo = old.codigo and activo) then
      raise exception 'Ya hay una variante activa con este color — apruébalo y desactívalo si ya no sirve.';
    end if;
    new.activo := false;
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
  end if;

  return new;
end;
$$;

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
    if old.estado not in ('pendiente', 'rechazado') then
      raise exception 'Solo se puede aprobar un tejido que está pendiente, o reactivar uno rechazado.';
    end if;
    new.activo := true;
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
    if old.estado not in ('pendiente', 'rechazado') then
      raise exception 'Solo se puede aprobar un patrón que está pendiente, o reactivar uno rechazado.';
    end if;
    new.activo := true;
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

-- ---------------------------------------------------------------------------
-- 3) categoria_tallas/tejidos/patrones — tablas nuevas + backfill que solo
--    LEE categorias.tallas_sugeridas (no la toca).
-- ---------------------------------------------------------------------------
create table retail.categoria_tallas (
  categoria_id uuid not null references retail.categorias (id) on delete cascade,
  talla_id uuid not null references retail.tallas (id),
  created_at timestamptz not null default now(),
  primary key (categoria_id, talla_id)
);

create table retail.categoria_tejidos (
  categoria_id uuid not null references retail.categorias (id) on delete cascade,
  tejido_id uuid not null references retail.tejidos (id),
  created_at timestamptz not null default now(),
  primary key (categoria_id, tejido_id)
);

create table retail.categoria_patrones (
  categoria_id uuid not null references retail.categorias (id) on delete cascade,
  patron_id uuid not null references retail.patrones (id),
  created_at timestamptz not null default now(),
  primary key (categoria_id, patron_id)
);

comment on table retail.categoria_tallas is 'Qué tallas ofrece el formulario para una categoría/subcategoría dada. Sin fila = sin tallas sugeridas ahí. Reemplaza categorias.tallas_sugeridas — no hereda de categoría a subcategoría.';
comment on table retail.categoria_tejidos is 'Qué tejidos ofrece el formulario para una categoría/subcategoría dada. Sin fila = tejido no aplica ahí.';
comment on table retail.categoria_patrones is 'Qué patrones ofrece el formulario para una categoría/subcategoría dada. Sin fila = patrón no aplica ahí.';

alter table retail.categoria_tallas enable row level security;
create policy categoria_tallas_select on retail.categoria_tallas for select using (auth.role() = 'authenticated');
create policy categoria_tallas_write_lider on retail.categoria_tallas for all
  using (retail.fn_es_lider()) with check (retail.fn_es_lider());

alter table retail.categoria_tejidos enable row level security;
create policy categoria_tejidos_select on retail.categoria_tejidos for select using (auth.role() = 'authenticated');
create policy categoria_tejidos_write_lider on retail.categoria_tejidos for all
  using (retail.fn_es_lider()) with check (retail.fn_es_lider());

alter table retail.categoria_patrones enable row level security;
create policy categoria_patrones_select on retail.categoria_patrones for select using (auth.role() = 'authenticated');
create policy categoria_patrones_write_lider on retail.categoria_patrones for all
  using (retail.fn_es_lider()) with check (retail.fn_es_lider());

alter table retail.tallas disable trigger tallas_estado_biut;

do $$
declare
  v_cat record;
  v_valor text;
  v_talla_id uuid;
begin
  for v_cat in select id, tallas_sugeridas from retail.categorias where tallas_sugeridas is not null loop
    foreach v_valor in array v_cat.tallas_sugeridas loop
      if coalesce(trim(v_valor), '') = '' then continue; end if;

      select id into v_talla_id from retail.tallas
        where retail.fn_clave_texto(valor) = retail.fn_clave_texto(v_valor);

      if v_talla_id is null then
        insert into retail.tallas (valor, estado, notas)
          values (trim(v_valor), 'aprobado', 'Migrado desde categorias.tallas_sugeridas el 2026-09-17 — valor ya vivía en el catálogo de V1, no es una propuesta nueva.')
          returning id into v_talla_id;
      end if;

      insert into retail.categoria_tallas (categoria_id, talla_id)
        values (v_cat.id, v_talla_id)
        on conflict do nothing;
    end loop;
  end loop;
end $$;

alter table retail.tallas enable trigger tallas_estado_biut;

-- ---------------------------------------------------------------------------
-- 4) Los 2 RPC nuevos de hoy — nada los llama todavía.
-- ---------------------------------------------------------------------------
create function retail.actualizar_categoria_ejes(
  p_categoria_id uuid,
  p_talla_ids uuid[],
  p_tejido_ids uuid[],
  p_patron_ids uuid[]
) returns void
language plpgsql security definer set search_path = retail, public as $$
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede editar qué tallas/tejidos/patrones ofrece una categoría.';
  end if;

  if not exists (select 1 from retail.categorias where id = p_categoria_id) then
    raise exception 'Esa categoría ya no existe. Recarga la pantalla.';
  end if;

  delete from retail.categoria_tallas where categoria_id = p_categoria_id;
  if p_talla_ids is not null and array_length(p_talla_ids, 1) > 0 then
    insert into retail.categoria_tallas (categoria_id, talla_id)
      select distinct p_categoria_id, t from unnest(p_talla_ids) as t;
  end if;

  delete from retail.categoria_tejidos where categoria_id = p_categoria_id;
  if p_tejido_ids is not null and array_length(p_tejido_ids, 1) > 0 then
    insert into retail.categoria_tejidos (categoria_id, tejido_id)
      select distinct p_categoria_id, t from unnest(p_tejido_ids) as t;
  end if;

  delete from retail.categoria_patrones where categoria_id = p_categoria_id;
  if p_patron_ids is not null and array_length(p_patron_ids, 1) > 0 then
    insert into retail.categoria_patrones (categoria_id, patron_id)
      select distinct p_categoria_id, t from unnest(p_patron_ids) as t;
  end if;
end;
$$;

comment on function retail.actualizar_categoria_ejes(uuid, uuid[], uuid[], uuid[]) is
  'Reemplaza (no amplía) el conjunto completo de tallas/tejidos/patrones que ofrece una categoría. Los 3 ejes se guardan juntos, atómicamente.';

grant execute on function retail.actualizar_categoria_ejes(uuid, uuid[], uuid[], uuid[]) to authenticated;

create function retail.actualizar_variantes_etiquetas(p_asignaciones jsonb)
returns void
language plpgsql security definer set search_path = retail, public as $$
declare
  v_item jsonb;
  v_variante_id uuid;
  v_etiqueta_ids uuid[];
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede aplicar etiquetas a una variante.';
  end if;

  for v_item in select * from jsonb_array_elements(p_asignaciones) loop
    if not (v_item ->> 'variante_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'Una de las variantes no es válida. Recarga la pantalla.';
    end if;
    v_variante_id := (v_item ->> 'variante_id')::uuid;

    if not exists (select 1 from retail.variantes where id = v_variante_id) then
      raise exception 'Una de las variantes ya no existe. Recarga la pantalla.';
    end if;

    if jsonb_typeof(coalesce(v_item -> 'etiqueta_ids', '[]'::jsonb)) <> 'array' then
      raise exception 'La lista de etiquetas de una de las variantes no es válida. Recarga la pantalla.';
    end if;

    select array(select jsonb_array_elements_text(coalesce(v_item -> 'etiqueta_ids', '[]'::jsonb)))::uuid[]
      into v_etiqueta_ids;

    delete from retail.variante_etiquetas where variante_id = v_variante_id;
    if v_etiqueta_ids is not null and array_length(v_etiqueta_ids, 1) > 0 then
      insert into retail.variante_etiquetas (variante_id, etiqueta_id)
        select distinct v_variante_id, e from unnest(v_etiqueta_ids) as e;
    end if;
  end loop;
end;
$$;

comment on function retail.actualizar_variantes_etiquetas(jsonb) is
  'Reemplaza (no amplía) el conjunto de etiquetas de catálogo aplicadas a cada variante de p_asignaciones: [{"variante_id": uuid, "etiqueta_ids": uuid[]}, ...].';

grant execute on function retail.actualizar_variantes_etiquetas(jsonb) to authenticated;
