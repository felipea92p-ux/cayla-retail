-- Fase 1 del reemplazo de Alegra: el route handler que llama a Lucode
-- (apps/web/lib/lucode.ts) necesita escribir el resultado real de la
-- transmisión de vuelta en `comprobantes` — y `comprobantes` no tiene
-- política de UPDATE para clientes (mismo criterio que `asientos`/`lotes`:
-- el único camino de escritura es una RPC security definer).
--
-- QUÉ PROMETE: actualiza estado/respuesta_sunat/motivo_rechazo/enviado_at de
-- UN comprobante, validando que quien llama pueda operar esa sede.
-- QUÉ ASUME: el comprobante ya existe (lo creó `emitir_comprobante`/
-- `emitir_nota`). No crea, no borra, no toca serie/número/items/total.
-- QUÉ NO HACE: no permite volver a 'pendiente' ni pasar a 'anulado' — anular
-- es una operación distinta (RPC de Lucode `/voided`), con su propio motivo
-- y su propia regla de negocio; mezclarlo aquí abriría la puerta a "anular"
-- un comprobante sin pasar por Lucode.
--
-- CÓMO SE REVIERTE: drop function actualizar_transmision_comprobante.

create or replace function actualizar_transmision_comprobante(
  p_comprobante_id uuid,
  p_estado text,
  p_respuesta_sunat jsonb default null,
  p_motivo_rechazo text default null
)
returns void
language plpgsql
security definer
set search_path = public
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
  if not fn_puede_operar_sede(v_sede_id) then
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
