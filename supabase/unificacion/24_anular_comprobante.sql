-- ============================================================================
-- anular_comprobante — paso (c) del plan de facturación
-- Correr en cayla-DYNAMIC. Solo toca `retail`. Ver
-- docs/adr/0016-anulacion-de-comprobantes.md.
--
-- Requiere que 23_comprobante_entorno_transmision.sql ya esté aplicado.
-- ============================================================================

alter table retail.comprobantes
  add column if not exists motivo_anulacion text,
  add column if not exists anulacion_solicitada_at timestamptz,
  add column if not exists anulado_at timestamptz,
  add column if not exists respuesta_anulacion jsonb,
  add column if not exists anulado_por uuid references personas (id);

comment on column retail.comprobantes.anulacion_solicitada_at is
  'Cuándo se pidió la baja al proveedor. Con esto lleno y estado todavía "aceptado", la anulación está en trámite: SUNAT procesa el resumen diario de boletas de forma diferida.';

-- Un comprobante anulado sin motivo no sirve para nada ante una fiscalización.
alter table retail.comprobantes drop constraint if exists comprobantes_anulado_tiene_motivo;
alter table retail.comprobantes add constraint comprobantes_anulado_tiene_motivo
  check (estado <> 'anulado' or motivo_anulacion is not null) not valid;

do $$
begin
  alter table retail.comprobantes validate constraint comprobantes_anulado_tiene_motivo;
exception when check_violation then
  raise notice 'Hay comprobantes anulados sin motivo, anteriores a esta migración. La restricción queda NOT VALID y aplica de aquí en adelante.';
end $$;

create or replace function retail.anular_comprobante(
  p_comprobante_id uuid,
  p_motivo text,
  p_confirmada boolean,
  p_respuesta jsonb default null
)
returns void
language plpgsql security definer set search_path = retail, public
as $$
declare
  v_comprobante comprobantes%rowtype;
  v_persona_id uuid;
  v_notas integer;
begin
  -- Decisión de negocio de Felipe (2026-09-09): anular es de líder, no de
  -- integrante. Emitir se puede corregir; anular es irreversible ante SUNAT y
  -- corre contra un plazo. La pantalla ya es líder-only, pero la regla vive
  -- acá porque una pantalla no es un permiso.
  if not retail.es_lider() then
    raise exception 'Solo un líder puede anular un comprobante';
  end if;

  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'La anulación requiere un motivo';
  end if;

  select * into v_comprobante from comprobantes where id = p_comprobante_id;
  if not found then
    raise exception 'El comprobante % no existe', p_comprobante_id;
  end if;
  if not retail.puede_operar_sede(v_comprobante.sede_id) then
    raise exception 'No tienes permiso para anular comprobantes de esa sede';
  end if;

  -- Solo se anula lo que SUNAT conoce. Un comprobante 'pendiente' nunca se
  -- transmitió: no hay nada que dar de baja, y marcarlo 'anulado' inventaría
  -- una baja ante SUNAT que jamás ocurrió.
  if v_comprobante.estado <> 'aceptado' then
    raise exception 'Solo se puede anular un comprobante aceptado por SUNAT (estado actual: %)', v_comprobante.estado;
  end if;

  -- Una nota de crédito/débito referencia a este comprobante y exige que esté
  -- aceptado (trigger de 0034). Anularlo dejaría la nota colgada de un
  -- documento dado de baja: primero se resuelve la nota.
  select count(*) into v_notas
  from comprobantes n
  where n.comprobante_original_id = p_comprobante_id
    and n.estado <> 'anulado';
  if v_notas > 0 then
    raise exception 'Este comprobante tiene % nota(s) vigente(s) que lo referencian. Anúlalas primero.', v_notas;
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  update comprobantes set
    estado = case when p_confirmada then 'anulado' else estado end,
    motivo_anulacion = p_motivo,
    anulado_por = v_persona_id,
    anulacion_solicitada_at = coalesce(anulacion_solicitada_at, now()),
    anulado_at = case when p_confirmada then now() else anulado_at end,
    respuesta_anulacion = coalesce(p_respuesta, respuesta_anulacion)
  where id = p_comprobante_id;
end;
$$;
