-- ============================================================================
-- «Pregúntale a CAYLA»: cada pregunta queda anotada (ADR-0536, actividad 5; Felipe 2026-10-26)
--
-- QUÉ. El asistente de la cabecera responde «cómo hago X» llevando a la persona al botón. Felipe lo pidió para algo más: que las
-- preguntas digan qué falta construir (las que no tienen respuesta), qué está escondido (las que se repiten) y qué accesos pide la
-- gente. Para eso cada pregunta se guarda aquí, con lo que se respondió, cuánto costó y si le sirvió a la persona.
--
-- QUÉ SE GUARDA (decisión 8 del ADR): quién preguntó, en qué sede, en qué pantalla y la pregunta, YA LIMPIA de números largos y
-- correos (la web la pasa por `limpiarDatosPersonales` antes de llamar aquí: un DNI escrito en la pregunta llega como «[número]»).
-- Nunca datos de clientes ni montos.
--
-- EL TOPE DEL MES. `fn_asistente_gasto_del_mes()` suma lo que costaron las preguntas del mes de Lima; la web deja de llamar a la IA
-- al llegar a US$30 y sigue sin ella (el «modo básico»). Por eso el costo de una fila tiene techo (US$0,05: una pregunta cuesta
-- ~US$0,0013): quien llamara a la función a mano no puede inflar el gasto y dejar a todas las tiendas sin IA.
--
-- QUIÉN. La persona de la sesión o la responsable de la terminal (`fn_actor_persona_id(true)`, como toda función que guarda); si no
-- se sabe (una terminal sin responsable), la fila queda con la cuenta y sin persona: una pregunta no es una operación del negocio y
-- no se le exige responsable. «¿Te sirvió?» solo lo contesta la misma cuenta que preguntó, una vez.
--
-- CÓMO SE PEGA. Una sola parte: tabla nueva (RLS encendido SIN políticas: solo la tocan estas funciones `security definer`) y
-- tres funciones; no hace `alter` de tablas en uso ni crea políticas (ADR-0195). Re-ejecutable. Nada se borra nunca.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.fn_actor_persona_id(boolean)') is null then
    raise exception 'Falta retail.fn_actor_persona_id: pega antes 20260929230000_acciones_sin_responsable.sql.';
  end if;
  if to_regprocedure('retail.fn_tiene_acceso_retail()') is null then
    raise exception 'Falta retail.fn_tiene_acceso_retail().';
  end if;
end $$;

create table if not exists retail.asistente_preguntas (
  id uuid primary key default gen_random_uuid(),
  creada_en timestamptz not null default now(),
  -- La cuenta que preguntó (auth.users.id): una persona o una terminal. Es la que puede contestar «¿Te sirvió?».
  cuenta_id uuid not null,
  -- La persona (la de la sesión o la responsable de la terminal); vacía si no se supo.
  persona_id uuid references public.personas (id),
  -- La sede que miraba; vacía en CAYLA Global.
  ubicacion_id uuid references retail.ubicaciones (id),
  -- La pantalla donde estaba, sin su `?…` (la consulta puede traer lo que buscó).
  ruta text not null check (ruta ~ '^/' and char_length(ruta) <= 300),
  pregunta text not null check (char_length(pregunta) between 2 and 300),
  -- Lo que respondió: guia (la llevó) · sin_acceso (vive en un módulo que su rol no tiene) · regla (una regla de tienda aprobada) ·
  -- error (la frase de un error conocido) · no_existe · fuera_de_tema · basico (sin IA).
  tipo text not null check (tipo in ('guia', 'sin_acceso', 'regla', 'error', 'no_existe', 'fuera_de_tema', 'basico')),
  -- De qué era la pregunta, según la IA: como_hacer · regla (del negocio) · por_que (algo que hizo el sistema) · otro. Vacío sin IA.
  tema text check (tema in ('como_hacer', 'regla', 'por_que', 'otro')),
  -- Por qué no hubo IA (solo con tipo basico): sin_clave · sin_respuesta · respuesta_invalida · rechazo · tope.
  motivo text check (motivo in ('sin_clave', 'sin_respuesta', 'respuesta_invalida', 'rechazo', 'tope')),
  -- El recorrido que se ofreció (`[{ guiaId, pasoId, href }]`) y, si fue «sin acceso», la guía y el módulo que hacían falta.
  tramos jsonb not null default '[]'::jsonb check (jsonb_typeof(tramos) = 'array' and jsonb_array_length(tramos) <= 3),
  guia_id text check (guia_id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  modulo text check (char_length(modulo) <= 60),
  -- Con regla, su id (`lib/asistente/reglas-de-tienda.ts`); con error, la marca del error (`lib/error-escritura.ts`).
  referencia text check (char_length(referencia) <= 80),
  modelo text check (char_length(modelo) <= 60),
  tokens_entrada integer not null default 0 check (tokens_entrada >= 0),
  tokens_salida integer not null default 0 check (tokens_salida >= 0),
  tokens_cache integer not null default 0 check (tokens_cache >= 0),
  costo_usd numeric(10, 6) not null default 0 check (costo_usd >= 0 and costo_usd <= 0.05),
  ms integer check (ms >= 0),
  -- «¿Te sirvió?»: vacío hasta que la persona conteste; una sola vez.
  sirvio boolean,
  -- Si dijo que no: «¿Qué buscabas?», opcional, también una sola vez.
  comentario text check (char_length(comentario) between 1 and 300),
  respondida_en timestamptz,
  check (comentario is null or sirvio is false)
);
comment on table retail.asistente_preguntas is
  'ADR-0536: cada pregunta a «Pregúntale a CAYLA», con lo que se respondió, su costo y si le sirvió. Sin DELETE. Solo la tocan registrar_pregunta_asistente, responder_pregunta_asistente y fn_asistente_gasto_del_mes.';

create index if not exists asistente_preguntas_creada_en on retail.asistente_preguntas (creada_en);
create index if not exists asistente_preguntas_cuenta on retail.asistente_preguntas (cuenta_id, creada_en);

alter table retail.asistente_preguntas enable row level security;
revoke all on table retail.asistente_preguntas from anon, authenticated;

-- Anota una pregunta y devuelve su id (para contestar «¿Te sirvió?» después). La llama `/api/asistente`.
create or replace function retail.registrar_pregunta_asistente(
  p_ubicacion_id uuid,
  p_ruta text,
  p_pregunta text,
  p_tipo text,
  p_tema text default null,
  p_motivo text default null,
  p_tramos jsonb default '[]'::jsonb,
  p_guia_id text default null,
  p_modulo text default null,
  p_modelo text default null,
  p_tokens_entrada integer default 0,
  p_tokens_salida integer default 0,
  p_tokens_cache integer default 0,
  p_costo_usd numeric default 0,
  p_ms integer default null,
  p_referencia text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_id uuid;
begin
  if auth.uid() is null or not retail.fn_tiene_acceso_retail() then
    raise exception 'Sin acceso a retail' using errcode = '42501';
  end if;
  begin
    v_persona := retail.fn_actor_persona_id(true);
  exception when others then
    v_persona := null; -- una terminal sin responsable: la pregunta queda con la cuenta
  end;
  if p_ubicacion_id is not null and not exists (select 1 from retail.ubicaciones where id = p_ubicacion_id) then
    raise exception 'Sede no válida' using errcode = '22023';
  end if;
  insert into retail.asistente_preguntas (
    cuenta_id, persona_id, ubicacion_id, ruta, pregunta, tipo, tema, motivo, tramos, guia_id, modulo, modelo,
    tokens_entrada, tokens_salida, tokens_cache, costo_usd, ms, referencia
  ) values (
    auth.uid(), v_persona, p_ubicacion_id, p_ruta, btrim(p_pregunta), p_tipo, p_tema, p_motivo, coalesce(p_tramos, '[]'::jsonb),
    p_guia_id, p_modulo, p_modelo, coalesce(p_tokens_entrada, 0), coalesce(p_tokens_salida, 0), coalesce(p_tokens_cache, 0),
    coalesce(p_costo_usd, 0), p_ms, p_referencia
  )
  returning id into v_id;
  return v_id;
end;
$$;

comment on function retail.registrar_pregunta_asistente(uuid, text, text, text, text, text, jsonb, text, text, text, integer, integer, integer, numeric, integer, text) is
  'ADR-0536: anota una pregunta a «Pregúntale a CAYLA» (ya limpia de datos personales) y devuelve su id.';
revoke all on function retail.registrar_pregunta_asistente(uuid, text, text, text, text, text, jsonb, text, text, text, integer, integer, integer, numeric, integer, text) from public, anon;
grant execute on function retail.registrar_pregunta_asistente(uuid, text, text, text, text, text, jsonb, text, text, text, integer, integer, integer, numeric, integer, text) to authenticated, service_role;

-- «¿Te sirvió?» y, si no, «¿Qué buscabas?». Solo la cuenta que preguntó, dentro de un día, y cada cosa una sola vez: contestar lo
-- mismo de nuevo no hace nada (un doble clic no falla); cambiar de opinión no se puede (la cifra del informe no se mueve sola).
create or replace function retail.responder_pregunta_asistente(p_pregunta_id uuid, p_sirvio boolean, p_comentario text default null)
returns void
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_fila retail.asistente_preguntas%rowtype;
  v_comentario text := nullif(btrim(coalesce(p_comentario, '')), '');
begin
  if auth.uid() is null or not retail.fn_tiene_acceso_retail() then
    raise exception 'Sin acceso a retail' using errcode = '42501';
  end if;
  if p_sirvio is null then
    raise exception 'Falta decir si sirvió' using errcode = '22023';
  end if;
  select * into v_fila from retail.asistente_preguntas where id = p_pregunta_id for update;
  if not found or v_fila.cuenta_id <> auth.uid() then
    raise exception 'Esa pregunta no es tuya' using errcode = '42501';
  end if;
  if v_fila.creada_en < now() - interval '1 day' then
    raise exception 'Esa pregunta ya cerró' using errcode = '22023';
  end if;
  if v_fila.sirvio is not null and v_fila.sirvio <> p_sirvio then
    raise exception 'Ya contestaste esa pregunta' using errcode = '22023';
  end if;
  if v_comentario is not null and p_sirvio then
    raise exception 'El comentario es solo para cuando no sirvió' using errcode = '22023';
  end if;
  if char_length(v_comentario) > 300 then
    raise exception 'El comentario es de 300 letras como máximo' using errcode = '22023';
  end if;
  update retail.asistente_preguntas
     set sirvio = p_sirvio,
         respondida_en = coalesce(respondida_en, now()),
         comentario = coalesce(comentario, v_comentario)
   where id = p_pregunta_id;
end;
$$;

comment on function retail.responder_pregunta_asistente(uuid, boolean, text) is
  'ADR-0536: «¿Te sirvió?» de una pregunta a «Pregúntale a CAYLA», solo la cuenta que preguntó, una vez, dentro de un día.';
revoke all on function retail.responder_pregunta_asistente(uuid, boolean, text) from public, anon;
grant execute on function retail.responder_pregunta_asistente(uuid, boolean, text) to authenticated, service_role;

-- Lo que costaron las preguntas del mes de Lima, en dólares: la web lo compara con el tope (US$30) antes de llamar a la IA.
create or replace function retail.fn_asistente_gasto_del_mes()
returns numeric
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_desde timestamptz := date_trunc('month', now() at time zone 'America/Lima') at time zone 'America/Lima';
begin
  if auth.uid() is null or not retail.fn_tiene_acceso_retail() then
    raise exception 'Sin acceso a retail' using errcode = '42501';
  end if;
  return coalesce((select sum(costo_usd) from retail.asistente_preguntas where creada_en >= v_desde), 0);
end;
$$;

comment on function retail.fn_asistente_gasto_del_mes() is
  'ADR-0536: lo que costaron las preguntas a «Pregúntale a CAYLA» en el mes de Lima (US$), para el tope mensual.';
revoke all on function retail.fn_asistente_gasto_del_mes() from public, anon;
grant execute on function retail.fn_asistente_gasto_del_mes() to authenticated, service_role;
