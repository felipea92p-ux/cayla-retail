-- ============================================================================
-- 20260917230000 — Etiquetas: ventana de vigencia (activar/vencer solo) y
-- comentario obligatorio al aprobar cualquier propuesta
--
-- QUÉ TRAE
--   1. `retail.etiquetas.vigente_desde`/`vigente_hasta` (date, ambas
--      opcionales) — para etiquetas de campaña (San Valentín, Halloween,
--      Black Friday...) que deben "aparecer solas" ~2 semanas antes de la
--      fecha y dejar de ofrecerse cuando ya pasó, sin que nadie tenga que
--      acordarse de activarlas/desactivarlas a mano.
--   2. `fn_etiquetas_estado_trigger` gana la misma regla que ya tiene
--      `fn_tallas_estado_trigger`: aprobar una propuesta exige un
--      comentario en `notas` (Felipe, 2026-09-17: "sí, exigir motivo
--      siempre" — no solo para las de mayor riesgo como Hecho a mano).
--
-- POR QUÉ UNA VENTANA CALCULADA Y NO UN CRON QUE CAMBIA `activo`
--   Un job que prende/apaga la etiqueta es una pieza más que puede fallar
--   en silencio (principio 9, "todo falla, todo el tiempo") — y para algo
--   que Postgres puede resolver solo, en cada lectura, comparando contra
--   `current_date`. "¿Está vigente ahora?" nunca vive guardado en una
--   columna que alguien tiene que acordarse de actualizar: se calcula.
--   La condición completa es:
--     estado = 'aprobado' and activo
--       and (vigente_desde is null or vigente_desde <= current_date)
--       and (vigente_hasta is null or vigente_hasta >= current_date)
--   Vive en la pantalla (`/productos/etiquetas`) y en el selector de
--   `ProductoForm.tsx` al ofrecer qué etiquetas se pueden aplicar — NO
--   se construyó acá porque esta migración es solo el esquema; el
--   frontend que la consume es tarea aparte (ver BACKLOG).
--
-- POR QUÉ ESTO NO TOCA `fn_variante_permitida_en_sede` NI
-- `registrar_venta`/`transferir`
--   Esa función resuelve una pregunta distinta: "¿esta variante puede
--   estar/venderse EN ESTA SEDE?" (candado de `sedes_permitidas`). La
--   vigencia por fecha no restringe dónde se vende algo, solo si una
--   etiqueta de campaña sigue siendo la "actual" — una prenda etiquetada
--   Halloween en noviembre se sigue vendiendo igual, solo deja de
--   ofrecerse como opción nueva y de mostrarse como vigente en pantalla.
--   Mezclar los dos conceptos en la misma función habría sido el error
--   que el principio 2 (integridad conceptual) existe para evitar: dos
--   preguntas distintas, dos mecanismos separados.
--
-- POR QUÉ EL COMENTARIO OBLIGATORIO VA PARA TODAS, NO SOLO LAS OPERATIVAS
--   Felipe lo pidió así explícitamente, no una lectura mía: con ~20
--   etiquetas de vocabulario abierto, la razón de "por qué esto es una
--   etiqueta real y no ruido" queda escrita desde el día uno, sin
--   depender de que alguien se acuerde de explicarla después. Mismo
--   candado que ya prueba su valor en Tallas.
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.etiquetas add column if not exists vigente_desde date;
alter table retail.etiquetas add column if not exists vigente_hasta date;

alter table retail.etiquetas add constraint etiquetas_vigencia_coherente
  check (vigente_desde is null or vigente_hasta is null or vigente_desde <= vigente_hasta);

comment on column retail.etiquetas.vigente_desde is
  'Desde cuándo esta etiqueta se ofrece como vigente (null = siempre, sin ventana). No bloquea nada por sí sola — la pantalla/selector filtran por esto, no registrar_venta/transferir.';
comment on column retail.etiquetas.vigente_hasta is
  'Hasta cuándo. Pasada la fecha, deja de ofrecerse como opción nueva; lo que ya estaba aplicado a una variante NO se quita solo.';

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
    if coalesce(trim(new.notas), '') = '' then
      raise exception 'Aprobar una etiqueta exige un comentario breve (para qué sirve, por qué es distinta de las que ya existen).';
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
