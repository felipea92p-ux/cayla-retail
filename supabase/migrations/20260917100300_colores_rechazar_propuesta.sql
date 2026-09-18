-- ============================================================================
-- 20260917100300 — Colores: rechazar una propuesta pendiente
--
-- ADR-0070 (20260916220000) dejó "rechazar" fuera a propósito: un color
-- pendiente solo se podía aprobar y desactivar después. Con tejidos,
-- patrones, etiquetas y tallas naciendo YA con rechazar incluido
-- (20260917100000/100100/100200), dejar a colores como la única excepción
-- rompería integridad conceptual (principio 2) — los 5 vocabularios
-- cerrados deben ofrecer el mismo mecanismo.
--
-- Dos implementaciones reales de esto se escribieron en paralelo el
-- 2026-09-16 (ADR-0072 y ADR-0078, cada una en una rama sin fusionar).
-- Felipe eligió ADR-0095 (2026-09-17): cierra un estado inconsistente real
-- (bloquea rechazar si ya hay una variante activa con el color) y resuelve
-- la carrera entre 2 Líderes con el mismo UPDATE atómico que ya usan
-- tejidos/patrones/etiquetas/tallas. Esta migración construye esa versión
-- directo sobre el estado actual del esquema (no un cherry-pick de la
-- rama), con el mismo molde que las 4 tablas nuevas.
-- ============================================================================

alter table retail.colores
  drop constraint if exists colores_estado_check;
alter table retail.colores
  add constraint colores_estado_check check (estado in ('pendiente', 'aprobado', 'rechazado'));

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
    if old.estado <> 'pendiente' then
      raise exception 'Solo se puede aprobar un color que todavía está pendiente.';
    end if;
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
-- El trigger colores_estado_biut ya existe (20260916220000) y apunta a esta
-- función por nombre — CREATE OR REPLACE alcanza, no hace falta recrearlo.

alter table retail.colores
  add constraint colores_rechazado_no_activo check (estado <> 'rechazado' or activo = false);
