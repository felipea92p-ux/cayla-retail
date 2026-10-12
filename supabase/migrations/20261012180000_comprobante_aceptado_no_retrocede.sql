-- ============================================================================
-- 20261012180000_comprobante_aceptado_no_retrocede.sql — CAYLA V2 (ADR-0382, Felipe 2026-10-12)
--
-- EL PROBLEMA. Lo que SUNAT ya aceptó no puede volver atrás en el ERP, y hasta hoy nada en la base lo
-- impedía: `actualizar_transmision_comprobante` escribía cualquier estado sobre cualquier otro. Dos respuestas
-- de Lucode del mismo comprobante (dos pestañas, «Reintentar ahora» mientras se barre la cola, la consulta de
-- lo que quedó en trámite, o lo que confirma `lib/resolver-ya-emitido.ts` del ADR-0378) leían las dos el
-- estado de antes, y la última en llegar ganaba: una respuesta vieja podía dejar en «enviado» o «rechazado» una
-- boleta que SUNAT ya tenía aceptada. En producción no ha pasado (consultado el 2026-10-12: 0 comprobantes con
-- respuesta ACEPTADO y estado distinto de aceptado/anulado); que no haya pasado dependía de que la web tuviera
-- cuidado, no de la base.
--
-- QUÉ CAMBIA (una sola parte, sin políticas)
--   1. `actualizar_transmision_comprobante` lee la fila Y la bloquea (`for update`). Si dos respuestas llegan
--      a la vez, la segunda espera a la primera y decide con lo que esta dejó escrito. Si el comprobante ya
--      está `aceptado` (o `anulado`, que viene después), la respuesta es vieja: se ignora SIN error y la
--      pantalla relee lo que hay. Misma firma, mismos permisos: ni la web ni sus llamadores cambian.
--   2. Un disparador sobre la TABLA (`comprobantes_estado_no_retrocede`) con los únicos pasos de estado
--      permitidos. Cubre a las seis funciones que hoy cambian el estado de un comprobante y a cualquiera que
--      venga, no solo a esta RPC (mismo criterio que `comprobantes_venta_no_anulada`, 20260921161500).
--
-- LOS PASOS PERMITIDOS (cualquier otro se rechaza):
--   pendiente, pendiente_reintento → pendiente_reintento, enviado, aceptado, rechazado, no_emitido
--   interna (nota de venta)        → no_emitido   (anular la venta)
--   enviado, rechazado             → enviado, aceptado, rechazado   (consulta y reenvío tras corregir)
--   aceptado                       → anulado      (la baja ante SUNAT)
--   anulado, no_emitido            → nada
--   Quién escribe cada paso: fn_marcar_reintento_transmision (→ pendiente_reintento), actualizar_transmision_
--   comprobante (→ enviado/aceptado/rechazado), marcar_comprobante_no_emitido y anular_venta (→ no_emitido),
--   anular_comprobante y fn_confirmar_baja_sunat (aceptado → anulado). Un cambio que deja el mismo estado
--   (otro reintento, otra consulta en trámite) no pasa por el disparador.
--
-- POR QUÉ IGNORAR Y NO RECHAZAR la respuesta vieja dentro de la RPC: que dos respuestas se crucen es normal
-- (SUNAT lenta, dos pestañas). Rechazarla haría que `transmitirComprobante` anote «Lucode transmitió pero no se
-- pudo guardar» y mande una alerta al registro de errores por algo que salió bien; alertas falsas enseñan a
-- ignorar las verdaderas. El disparador SÍ rechaza: lo que llega a él no es una carrera sino un paso que no
-- existe (p. ej. SUNAT acepta algo que el ERP ya había dado por no emitido), y eso tiene que verse.
--
-- QUÉ NO CAMBIA: los candados de permiso de la RPC, ninguna otra función, ningún dato (el disparador solo mira
-- los cambios nuevos). La restauración de la base local (`scripts/flujo-de-negocio/estado.mjs`) recarga con
-- `session_replication_role = replica`, que apaga este disparador mientras recarga.
--
-- SE ROMPE SI hace falta un paso nuevo legítimo (p. ej. volver a abrir un comprobante liberado): ese paso
-- necesita su propia migración que lo agregue aquí, a propósito. Lo cubren `pnpm pruebas:sunat-estado-no-retrocede`
-- (en el CI) y `BASE_DESECHABLE=1 pnpm pruebas:sunat-estado-no-retrocede-concurrencia` (dos conexiones reales).
--
-- REVERSIBLE: el cuerpo anterior de la RPC es el de `20260924113817_sunat_reintento_por_cron.sql`; el disparador
-- se quita con `drop trigger comprobantes_estado_no_retrocede on retail.comprobantes;` y
-- `drop function retail.fn_comprobante_estado_no_retrocede();`.
--
-- PRODUCCIÓN. Se pega tal cual en el SQL Editor, de una vez: sin políticas ni `drop trigger`, re-ejecutable. Huella
-- ANTES de `actualizar_transmision_comprobante` (md5 de `pg_get_functiondef`, producción y local, 2026-10-12):
-- 2614dff116d42705bcf9fd85bafa0720. Si la función viva no es esa (ni ya la nueva), el pegado se detiene sin tocar
-- nada.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Antes de reemplazar: la función viva tiene que ser la revisada (o ya la nueva). Si alguien la cambió después del
-- 2026-10-12, se detiene aquí en vez de pisar ese cambio.
do $$
declare
  v_def text := pg_get_functiondef('retail.actualizar_transmision_comprobante(uuid, text, text, jsonb, text)'::regprocedure);
begin
  if md5(v_def) <> '2614dff116d42705bcf9fd85bafa0720'
     and position($t$v_estado in ('aceptado', 'anulado')$t$ in v_def) = 0 then
    raise exception 'actualizar_transmision_comprobante cambió desde el 2026-10-12 (huella %). Revísala antes de pegar esta migración.', md5(v_def);
  end if;
end;
$$;

-- ---------- 1. La respuesta vieja no pisa la última palabra de SUNAT ----------
create or replace function retail.actualizar_transmision_comprobante(
  p_comprobante_id uuid, p_estado text, p_entorno text,
  p_respuesta_sunat jsonb default null, p_motivo_rechazo text default null
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion_id uuid;
  v_estado text;
begin
  -- Se lee Y se bloquea la fila: si dos respuestas del mismo comprobante llegan a la vez, la segunda espera a la
  -- primera y decide con lo que esta dejó escrito. Sin el `for update` las dos leían el estado de antes y la última
  -- en llegar pisaba a la otra.
  select ubicacion_id, estado into v_ubicacion_id, v_estado
    from comprobantes where id = p_comprobante_id
    for update;
  if not found then
    raise exception 'El comprobante % no existe', p_comprobante_id;
  end if;
  -- PL-113: el trabajo programado (llave de servicio) guarda lo que respondió Lucode, igual que la pantalla.
  if not (auth.role() is not distinct from 'service_role' or fn_puede_operar_ubicacion(v_ubicacion_id)) then
    raise exception 'No tienes permiso para actualizar ese comprobante';
  end if;
  if p_estado not in ('enviado', 'aceptado', 'rechazado') then
    raise exception 'actualizar_transmision_comprobante no maneja el estado % — anular_comprobante() es aparte', p_estado;
  end if;
  -- ADR-0382: aceptado (y anulado, que viene después) es la última palabra de SUNAT. Lo que llega cuando ya está
  -- escrito es una respuesta vieja: se ignora sin error. Cualquier otro paso imposible lo frena el disparador
  -- `comprobantes_estado_no_retrocede`, con su mensaje.
  if v_estado in ('aceptado', 'anulado') then
    return;
  end if;
  update comprobantes set
    estado = p_estado,
    entorno_transmision = p_entorno,
    respuesta_sunat = coalesce(p_respuesta_sunat, respuesta_sunat),
    motivo_rechazo = p_motivo_rechazo,
    enviado_at = coalesce(enviado_at, now())
  where id = p_comprobante_id;
end;
$$;

grant execute on function retail.actualizar_transmision_comprobante(uuid, text, text, jsonb, text) to authenticated, service_role;

-- ---------- 2. Los pasos de estado que existen, en la tabla ----------
create or replace function retail.fn_comprobante_estado_no_retrocede()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if (old.estado in ('pendiente', 'pendiente_reintento')
        and new.estado in ('pendiente_reintento', 'enviado', 'aceptado', 'rechazado', 'no_emitido'))
     or (old.estado = 'interna' and new.estado = 'no_emitido')
     or (old.estado in ('enviado', 'rechazado') and new.estado in ('enviado', 'aceptado', 'rechazado'))
     or (old.estado = 'aceptado' and new.estado = 'anulado')
  then
    return new;
  end if;
  raise exception 'El comprobante %-% está «%» y no puede pasar a «%»: lo que SUNAT ya respondió, o lo que se liberó, no se deshace desde aquí',
      old.serie, old.numero, old.estado, new.estado
    using errcode = 'check_violation',
          hint = 'Para dar de baja uno aceptado está «Anular» en Comprobantes (ante SUNAT). Lo demás se revisa en el panel de Lucode.';
end;
$$;

revoke all on function retail.fn_comprobante_estado_no_retrocede() from public;
grant execute on function retail.fn_comprobante_estado_no_retrocede() to authenticated, service_role;

create or replace trigger comprobantes_estado_no_retrocede
  before update of estado on retail.comprobantes
  for each row
  when (old.estado is distinct from new.estado)
  execute function retail.fn_comprobante_estado_no_retrocede();
