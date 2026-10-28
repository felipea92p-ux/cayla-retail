-- ============================================================================
-- 20261007200000_sunat_consulta_lo_que_quedo_en_tramite.sql — CAYLA V2
--
-- EL PROBLEMA QUE RESUELVE (2026-10-07). Cuando Lucode responde PENDIENTE —SUNAT todavía no dice nada— el
-- comprobante queda «enviado», y nadie volvía a preguntar. Las boletas B001-113…192 de Tienda TRU pasaron una
-- semana en «enviado» mientras el panel de Lucode las mostraba RECHAZADAS (la serie ya la había usado otro
-- proveedor): el ERP no se enteró y las ventas quedaron sin comprobante válido sin que nadie lo viera. Lo mismo
-- con las bajas: B001-1 pidió su baja el 2026-09-29 y quedó «en trámite» para siempre, porque confirmarla
-- exigía que alguien apretara «consultar» en esa fila.
--
-- QUÉ AGREGA. El mismo barrido que ya reintenta la cola (`/api/lucode/reintentar`: cada cobro en Vender, cada
-- apertura de Comprobantes y el trabajo programado) ahora también PREGUNTA por lo que quedó a medias:
--   · `fn_tomar_comprobantes_para_consultar`: reserva hasta `p_limite` comprobantes que esperan a SUNAT —
--     «enviado» (emisión sin respuesta final) o «aceptado» con baja pedida y sin confirmar—, con el mismo
--     candado que el reintento (`for update skip locked` + una reserva que vence sola).
--   · `fn_confirmar_baja_sunat`: escribe «anulado» cuando SUNAT confirma una baja YA PEDIDA. No exige ser
--     líder: la decisión de anular la tomó un líder al pedirla (`anular_comprobante`); esto solo anota lo que
--     SUNAT respondió, igual que `actualizar_transmision_comprobante` anota una aceptación. Por eso no toca
--     `anulado_por` (quien pidió la baja) ni el motivo.
--
-- `proximo_reintento_at` hace aquí de «próxima vez que el ERP le pregunta a Lucode por este comprobante». En
-- `pendiente`/`pendiente_reintento` es el próximo envío; en `enviado` o con baja pedida, la próxima consulta.
-- Son estados distintos, así que las dos funciones nunca se pisan.
--
-- CUÁNTO SE INSISTE. Se pregunta a partir de los 2 minutos (el propio envío tarda hasta 15 s) y cada 10, durante
-- 15 días desde que se envió o se pidió la baja: SUNAT resuelve en horas, y lo que siga sin respuesta después
-- queda a la vista en Comprobantes para decidirlo a mano, sin consultas eternas.
--
-- SE ROMPE SI alguien consulta un comprobante tomado acá sin pasar por `lib/consultar-comprobante.ts`, que es
-- quien decide qué escribir con cada respuesta (`lib/consulta-sunat-reglas.ts`).
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.fn_tomar_comprobantes_para_consultar(
  p_ubicacion_id uuid default null,
  p_limite integer default 3
)
returns setof uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  -- El trabajo programado entra con la llave de servicio: no es ninguna persona.
  v_cron boolean := auth.role() is not distinct from 'service_role';
begin
  if p_ubicacion_id is null then
    if not (v_cron or fn_es_lider()) then
      raise exception 'Solo un líder puede consultar los comprobantes de todas las sedes';
    end if;
  elsif not (v_cron or fn_puede_operar_ubicacion(p_ubicacion_id)) then
    raise exception 'No tienes permiso para operar esa ubicación';
  end if;

  return query
    with tomados as (
      select c.id
        from retail.comprobantes c
       where (p_ubicacion_id is null or c.ubicacion_id = p_ubicacion_id)
         and c.entorno_transmision is not null
         and coalesce(c.proximo_reintento_at, now()) <= now()
         and (
           (c.estado = 'enviado'
             and coalesce(c.enviado_at, c.created_at) < now() - interval '2 minutes'
             and coalesce(c.enviado_at, c.created_at) > now() - interval '15 days')
           or (c.estado = 'aceptado' and c.anulacion_solicitada_at is not null
             and c.anulacion_solicitada_at < now() - interval '2 minutes'
             and c.anulacion_solicitada_at > now() - interval '15 days')
         )
       order by coalesce(c.anulacion_solicitada_at, c.enviado_at, c.created_at)
       limit greatest(1, least(p_limite, 20))
       for update of c skip locked
    )
    update retail.comprobantes c
       set proximo_reintento_at = now() + interval '10 minutes'
      from tomados t
     where c.id = t.id
    returning c.id;
end;
$$;

revoke all on function retail.fn_tomar_comprobantes_para_consultar(uuid, integer) from public;
grant execute on function retail.fn_tomar_comprobantes_para_consultar(uuid, integer) to authenticated, service_role;

comment on function retail.fn_tomar_comprobantes_para_consultar(uuid, integer) is
  'Reserva comprobantes que esperan respuesta de SUNAT (enviado, o aceptado con baja pedida) para preguntarle a Lucode. 20261007200000.';

create or replace function retail.fn_confirmar_baja_sunat(
  p_comprobante_id uuid,
  p_respuesta jsonb default null
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion_id uuid;
  v_estado text;
  v_solicitada timestamptz;
begin
  for v_ubicacion_id, v_estado, v_solicitada in
    select ubicacion_id, estado, anulacion_solicitada_at from retail.comprobantes where id = p_comprobante_id for update
  loop exit; end loop;
  if v_ubicacion_id is null then
    raise exception 'El comprobante % no existe', p_comprobante_id;
  end if;
  if not (auth.role() is not distinct from 'service_role' or fn_puede_operar_ubicacion(v_ubicacion_id)) then
    raise exception 'No tienes permiso para operar ese comprobante';
  end if;
  if v_estado = 'anulado' then
    return; -- otra pasada ya lo confirmó
  end if;
  if v_solicitada is null or v_estado <> 'aceptado' then
    raise exception 'Este comprobante no tiene una baja pedida: no hay nada que confirmar';
  end if;
  update retail.comprobantes set
    estado = 'anulado',
    anulado_at = now(),
    respuesta_anulacion = coalesce(p_respuesta, respuesta_anulacion),
    proximo_reintento_at = null
  where id = p_comprobante_id;
end;
$$;

revoke all on function retail.fn_confirmar_baja_sunat(uuid, jsonb) from public;
grant execute on function retail.fn_confirmar_baja_sunat(uuid, jsonb) to authenticated, service_role;

comment on function retail.fn_confirmar_baja_sunat(uuid, jsonb) is
  'Marca «anulado» un comprobante cuya baja YA PEDIDA confirmó SUNAT. Solo anota la respuesta: la decisión fue de quien pidió la baja. 20261007200000.';
