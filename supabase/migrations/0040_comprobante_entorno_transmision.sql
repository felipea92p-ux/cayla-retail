-- Un comprobante "aceptado" no dice contra QUÉ ambiente se aceptó. Con
-- `LUCODE_ENTORNO=sandbox` la app guarda exactamente el mismo estado que con
-- `produccion`: estado='aceptado', su CDR y su PDF — pero SUNAT nunca lo vio.
-- Eso es un estado inconsistente (principio 2), no un detalle de
-- configuración: la base afirma un hecho ("SUNAT lo aceptó") que no puede
-- respaldar. Y se propaga — `emitir_nota` exige que el original esté
-- 'aceptado' (0034), así que una nota de crédito puede colgarse de un
-- documento que no existe ante SUNAT.
--
-- QUÉ PROMETE: todo comprobante que salió de 'pendiente' sabe de qué ambiente
-- vino, y no hay forma de escribir el estado sin decirlo (la RPC lo exige).
-- QUÉ ASUME: solo `actualizar_transmision_comprobante` escribe el estado de
-- transmisión — sigue siendo cierto, `comprobantes` no tiene política de
-- UPDATE para clientes (0032).
-- QUÉ NO HACE: no toca los comprobantes ya transmitidos antes de esta columna
-- (su ambiente es genuinamente desconocido; ponerles 'produccion' sería la
-- misma mentira que esta migración viene a cerrar). Por eso la restricción
-- nace `not valid` y se valida sola si la tabla está limpia.
--
-- CÓMO SE REVIERTE:
--   alter table comprobantes drop constraint comprobantes_transmitido_tiene_entorno;
--   alter table comprobantes drop column entorno_transmision;
--   -- y restaurar la firma de 4 parámetros de 0038.

alter table comprobantes
  add column if not exists entorno_transmision text
    check (entorno_transmision in ('sandbox', 'produccion'));

comment on column comprobantes.entorno_transmision is
  'Ambiente de Lucode contra el que se transmitió: produccion = válido ante SUNAT; sandbox = prueba. Null mientras el comprobante siga pendiente.';

alter table comprobantes drop constraint if exists comprobantes_transmitido_tiene_entorno;
alter table comprobantes add constraint comprobantes_transmitido_tiene_entorno
  check (estado = 'pendiente' or entorno_transmision is not null) not valid;

do $$
begin
  alter table comprobantes validate constraint comprobantes_transmitido_tiene_entorno;
exception when check_violation then
  raise notice 'Hay comprobantes transmitidos antes de esta columna. La restricción queda NOT VALID: aplica de aquí en adelante, y esas filas viejas quedan marcadas como lo que son — ambiente desconocido.';
end $$;

-- La firma vieja (4 parámetros) se DROPEA, no se reemplaza: `create or replace`
-- con un parámetro nuevo deja una sobrecarga, y PostgREST resuelve por firma
-- exacta — es exactamente el error que costó "Could not find the function ...
-- in the schema cache" el 2026-09-08 (ver BITÁCORA).
drop function if exists actualizar_transmision_comprobante(uuid, text, jsonb, text);

create or replace function actualizar_transmision_comprobante(
  p_comprobante_id uuid,
  p_estado text,
  p_entorno text,
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
  -- Sin default a propósito: quien transmite SIEMPRE sabe contra qué ambiente
  -- lo hizo. Un default convertiría el olvido en un dato falso.
  if p_entorno not in ('sandbox', 'produccion') then
    raise exception 'Ambiente de transmisión inválido: %', coalesce(p_entorno, 'null');
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
    entorno_transmision = p_entorno,
    respuesta_sunat = coalesce(p_respuesta_sunat, respuesta_sunat),
    motivo_rechazo = case when p_estado = 'rechazado' then p_motivo_rechazo else motivo_rechazo end,
    enviado_at = coalesce(enviado_at, now())
  where id = p_comprobante_id;
end;
$$;
