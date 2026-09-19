-- ✅ APLICADO EL 2026-09-18 (no volver a pegar). Con la autorización explícita de Felipe en el
-- chat, Claude aplicó solo el paso 1 con `apply_migration`; quedó registrado como
-- `20260919003414_fn_tallas_estado_trigger_reactivar_rechazado` (versión en UTC) con su SQL
-- guardado. Verificado en producción: cuerpo con el md5 del repo (994940f7…), una sola firma, un
-- solo trigger (`tallas_estado_biut`), permisos intactos, las otras cuatro funciones con su huella
-- de antes y las 25 tallas todavía en 'aprobado'. Se conserva como registro y por la reversión.
-- ============================================================================
-- SQL PENDIENTE DE PEGAR EN PRODUCCIÓN — 2026-09-18
-- Proyecto: cayla-dynamic (schema retail). Pegar en el SQL Editor, en este orden: 1, 2, 3.
--
-- QUÉ ES. Reactivar una talla RECHAZADA. Hoy `fn_tallas_estado_trigger` solo deja aprobar desde
-- 'pendiente', así que una talla rechazada no tiene camino de vuelta: falla con «Solo se puede
-- aprobar una talla que todavía está pendiente». Esta versión (la que ya tiene el repo) también
-- deja aprobar desde 'rechazado' —sigue exigiendo el comentario— y la marca activa.
--
-- ⚠️ NO PEGUES `supabase/migrations/20260917120000_reactivar_rechazado_retira_rechazo.sql`
-- ENTERO. Redefine cinco funciones (colores, tallas, tejidos, patrones, etiquetas) y producción
-- ya tiene la versión FINAL de cuatro. La de etiquetas de ese archivo es anterior a
-- `20260917230000_etiquetas_vigencia_y_comentario_obligatorio`: pegarlo entero haría RETROCEDER
-- etiquetas. Solo `fn_tallas_estado_trigger` está atrás, y es lo único que hay que pegar.
--
-- EFECTO HOY. Ninguna fila: las 25 tallas de producción están en 'aprobado' (leído el
-- 2026-09-18). Solo habilita reactivar una talla que se rechace en adelante. Es un
-- `create or replace` de una función de trigger (una sola: `tallas_estado_biut`), sin cambios
-- de firma, permisos ni datos.
--
-- VERIFICADO (local, transacción revertida): con esta función, proponer → rechazar →
-- reactivar sin comentario (la base lo rechaza) → reactivar con comentario deja
-- «aprobado / activo = true». Con la definición actual de producción, la reactivación falla.
-- El cuerpo de esta función tiene el mismo md5 (994940f78e0472df3c9672fa4a2c1890, sin
-- comentarios ni espacios) que el estado final del repo.
-- ============================================================================


-- ==================== 1. APLICAR ====================
set search_path = retail, public, extensions;

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


-- ==================== 2. VERIFICAR (debe dar true | true | 1) ====================
-- ya_tiene_el_cambio: la función nueva quedó puesta.
-- coincide_con_el_repo: mismo cuerpo que el estado final del repo (huella md5).
-- triggers_que_la_usan: sigue colgada de un solo trigger (`tallas_estado_biut`).
select
  prosrc like '%reactivar una rechazada%' as ya_tiene_el_cambio,
  md5(btrim(regexp_replace(regexp_replace(prosrc, '--[^\r\n]*', '', 'g'), '\s+', ' ', 'g')))
    = '994940f78e0472df3c9672fa4a2c1890' as coincide_con_el_repo,
  (select count(*) from pg_trigger t where t.tgfoid = 'retail.fn_tallas_estado_trigger'::regproc and not t.tgisinternal) as triggers_que_la_usan
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'retail' and p.proname = 'fn_tallas_estado_trigger';


-- ==================== 3. SOLO SI HAY QUE DESHACER ====================
-- La definición de producción ANTES del cambio (leída con pg_get_functiondef el 2026-09-18).
-- No la pegues si el paso 2 dio bien.
--
-- set search_path = retail, public, extensions;
-- create or replace function retail.fn_tallas_estado_trigger()
-- returns trigger language plpgsql security definer set search_path = retail, public, extensions
-- as $$
-- declare
--   v_persona uuid;
-- begin
--   select id into v_persona from public.personas where auth_user_id = auth.uid();
--   if tg_op = 'INSERT' then
--     new.propuesto_por := v_persona;
--     if retail.fn_es_lider() then
--       new.estado := 'aprobado'; new.aprobado_por := v_persona; new.aprobado_en := now();
--     else
--       new.estado := 'pendiente'; new.aprobado_por := null; new.aprobado_en := null;
--     end if;
--     return new;
--   end if;
--   if new.estado = 'aprobado' and old.estado is distinct from 'aprobado' then
--     if old.estado <> 'pendiente' then
--       raise exception 'Solo se puede aprobar una talla que todavía está pendiente.';
--     end if;
--     if coalesce(trim(new.notas), '') = '' then
--       raise exception 'Aprobar una talla exige un comentario breve (a qué categoría aplica, por qué es distinta de las que ya existen).';
--     end if;
--     new.aprobado_por := v_persona; new.aprobado_en := now();
--   elsif new.estado = 'rechazado' and old.estado is distinct from 'rechazado' then
--     if old.estado <> 'pendiente' then
--       raise exception 'Solo se puede rechazar una propuesta que todavía está pendiente de aprobar.';
--     end if;
--     if exists (select 1 from variantes where talla_id = old.id and activo) then
--       raise exception 'Ya hay una variante activa con esta talla — apruébala y desactívala si ya no sirve.';
--     end if;
--     new.activo := false; new.aprobado_por := v_persona; new.aprobado_en := now();
--   end if;
--   return new;
-- end;
-- $$;
