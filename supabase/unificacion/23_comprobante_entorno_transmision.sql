-- ============================================================================
-- comprobantes.entorno_transmision — que "Aceptado" no pueda mentir
-- Correr en cayla-DYNAMIC. Solo toca `retail`. Ver
-- docs/adr/0015-entorno-de-transmision-en-el-comprobante.md.
--
-- Un comprobante transmitido contra el sandbox de Lucode queda hoy con el
-- MISMO estado que uno real ('aceptado', con CDR y PDF) y nada en la base
-- distingue uno del otro. Esta migración agrega el ambiente y hace imposible
-- escribir el estado de transmisión sin declararlo.
--
-- OJO: dropea la firma de 4 parámetros de `actualizar_transmision_comprobante`
-- antes de crear la de 5. Si se salta ese drop quedan DOS sobrecargas y
-- PostgREST resuelve por firma exacta — el mismo error del 2026-09-08.
-- ============================================================================

alter table retail.comprobantes
  add column if not exists entorno_transmision text
    check (entorno_transmision in ('sandbox', 'produccion'));

comment on column retail.comprobantes.entorno_transmision is
  'Ambiente de Lucode contra el que se transmitió: produccion = válido ante SUNAT; sandbox = prueba. Null mientras el comprobante siga pendiente.';

alter table retail.comprobantes drop constraint if exists comprobantes_transmitido_tiene_entorno;
alter table retail.comprobantes add constraint comprobantes_transmitido_tiene_entorno
  check (estado = 'pendiente' or entorno_transmision is not null) not valid;

do $$
begin
  alter table retail.comprobantes validate constraint comprobantes_transmitido_tiene_entorno;
exception when check_violation then
  raise notice 'Hay comprobantes transmitidos antes de esta columna. La restricción queda NOT VALID: aplica de aquí en adelante, y esas filas viejas quedan marcadas como lo que son — ambiente desconocido.';
end $$;

drop function if exists retail.actualizar_transmision_comprobante(uuid, text, jsonb, text);

create or replace function retail.actualizar_transmision_comprobante(
  p_comprobante_id uuid,
  p_estado text,
  p_entorno text,
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
  -- Sin default a propósito: quien transmite SIEMPRE sabe contra qué ambiente
  -- lo hizo. Un default convertiría el olvido en un dato falso.
  if p_entorno not in ('sandbox', 'produccion') then
    raise exception 'Ambiente de transmisión inválido: %', coalesce(p_entorno, 'null');
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
    entorno_transmision = p_entorno,
    respuesta_sunat = coalesce(p_respuesta_sunat, respuesta_sunat),
    motivo_rechazo = case when p_estado = 'rechazado' then p_motivo_rechazo else motivo_rechazo end,
    enviado_at = coalesce(enviado_at, now())
  where id = p_comprobante_id;
end;
$$;

-- Verificación después de pegar (debe devolver UNA fila, 5 argumentos):
--   select p.oid::regprocedure
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'retail' and p.proname = 'actualizar_transmision_comprobante';
