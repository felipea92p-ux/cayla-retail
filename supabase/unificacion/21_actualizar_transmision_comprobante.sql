-- ############################################################################
-- ##  SUPERADO POR 23_facturacion_fase1.sql — NO SE PEGA                    ##
-- ############################################################################
-- Este archivo NO se aplica en producción. Su contenido vive ahora, íntegro,
-- dentro de `23_facturacion_fase1.sql`, fusionado con el 20 en una sola
-- transacción.
--
-- POR QUÉ: el 20 (columna `items`) y este (la función que guarda la respuesta de
-- SUNAT) son dos mitades de una sola cosa. Aplicar el 20 sin este deja el
-- sistema transmitiendo a SUNAT sin poder guardar el resultado, con el
-- correlativo ya quemado. Fusionados dentro de un begin/commit, o entran los
-- dos o no entra ninguno.
--
-- El 23 mantiene este cuerpo tal cual, con una sola diferencia: la guarda de
-- permiso pasa a `coalesce(retail.puede_operar_sede(x), false) is not true`,
-- que no se cae en silencio si el helper devolviera NULL.
--
-- Se conserva el archivo, sin borrarlo, porque es la historia de la decisión.
-- Registro de aplicación: ver `retail.migraciones_aplicadas`, donde esta ruta
-- NO tiene fila y la del 23 sí.
-- ############################################################################

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
