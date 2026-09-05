-- ============================================================================
-- actualizar_transmision_comprobante — Fase 1 (Lucode) del reemplazo de Alegra
-- Correr en cayla-DYNAMIC. Solo toca `retail`. Ver
-- docs/adr/0009-comprobantes-items-lucode.md.
-- ============================================================================

create or replace function retail.actualizar_transmision_comprobante(
  p_comprobante_id uuid,
  p_estado text,
  p_respuesta_sunat jsonb default null,
  p_motivo_rechazo text default null
)
returns void
language plpgsql security definer set search_path = retail, public
as $$
declare
  v_sede_id uuid;
begin
  if p_estado not in ('enviado', 'aceptado', 'rechazado') then
    raise exception 'Estado de transmisión inválido: %', p_estado;
  end if;

  select sede_id into v_sede_id from comprobantes where id = p_comprobante_id;
  if v_sede_id is null then
    raise exception 'El comprobante % no existe', p_comprobante_id;
  end if;
  if not retail.puede_operar_sede(v_sede_id) then
    raise exception 'No tienes permiso para actualizar comprobantes de esa sede';
  end if;

  update comprobantes set
    estado = p_estado,
    respuesta_sunat = coalesce(p_respuesta_sunat, respuesta_sunat),
    motivo_rechazo = case when p_estado = 'rechazado' then p_motivo_rechazo else motivo_rechazo end,
    enviado_at = coalesce(enviado_at, now())
  where id = p_comprobante_id;
end;
$$;
