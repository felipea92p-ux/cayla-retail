-- ============================================================================
-- 20260917120000 — Reactivar un rechazado también retira el rechazo
--
-- EL BUG. Los 5 triggers de estado (colores, tallas, tejidos, patrones,
-- etiquetas — 20260917100000 en adelante) solo permiten 'aprobado' viniendo
-- de 'pendiente' — nunca de 'rechazado'. Eso deja cualquier propuesta
-- rechazada sin camino de vuelta: ni la pantalla que se está por construir
-- (botón "Reactivar" en la sección Desactivados) ni nadie más podría
-- reaprobarla jamás, contradiciendo el propio diseño que esta sesión copió
-- ("reactivar un color rechazado también retira el rechazo, en un solo
-- movimiento explícito" — ADR-0072 de referencia, rama sin fusionar).
--
-- Se encontró ANTES de construir la pantalla que lo habría expuesto en
-- producción, no después — se lee el propio trigger antes de confiar en él.
-- ============================================================================

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
    if exists (select 1 from variantes where talla_id = old.id and activo) then
      raise exception 'Ya hay una variante activa con esta talla — apruébala y desactívala si ya no sirve.';
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
