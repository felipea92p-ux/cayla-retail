-- ============================================================================
-- 20260928160000_editar_archivar_reactivar_clienta.sql — CAYLA V2 · Clientas, paso 2 (parte 3/5)
--
-- Las tres funciones que le faltaban a la ficha de clienta desde que nació (BACKLOG, «Ficha de
-- clienta: no hay candado que agregar todavía» — no había ninguna función para editar):
--   `editar_clienta`, `archivar_clienta` (con `p_anonimizar` para el pedido de la Ley 29733) y
--   `reactivar_clienta`. Todas firman con `retail.fn_actor_persona_id(true)` (ADR-0161/0162: la
--   base firma con el responsable del combo, no con la cuenta) y candado optimista `version`
--   (ADR-0193 reusado — ver la migración anterior, «LA OBJECIÓN»).
--
-- CONCURRENCIA (antes de decir «listo», pregunta 1). Dos asesoras editando la MISMA ficha: la
-- segunda que guarda manda la `version` que leyó al abrir; `editar_clienta` la relee con
-- `for update` y si ya cambió, rechaza con PT409 antes de escribir nada — nunca pisa en silencio
-- lo que puso la primera. `archivar_clienta`/`reactivar_clienta` usan el mismo candado: archivar
-- una ficha que alguien acaba de reactivar (o viceversa) también se rechaza, no se ejecuta a
-- ciegas sobre una fila que cambió de estado mientras se decidía.
--
-- CAÍDA EXTERNA (pregunta 2). Ninguna de las tres toca una integración externa.
--
-- PERSONA SIN CONTEXTO (pregunta 3). El mensaje de PT409 es el mismo que ya conoce la web
-- («Otra persona cambió esto mientras lo editabas. Recarga para ver sus cambios» —
-- `apps/web/lib/error-escritura.ts`); una colaboradora que intenta editar una ficha archivada
-- recibe «Esta ficha está archivada — reactívala antes de editarla», sin jerga de base de datos.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. editar_clienta ----------
--
-- El consentimiento de WhatsApp sigue el criterio de `registrar_clienta` (nunca se revoca por
-- omisión, ver ADR-0154 «LA OBJECIÓN») PERO acá sí hace falta poder revocarlo a propósito: la
-- clienta puede pedir que dejen de escribirle. `p_revoca_whatsapp` es ese parámetro aparte que
-- ADR-0154 dejó pendiente: «ese caso necesita su propio parámetro, no compartir el default de
-- "no me preguntaron"».
create or replace function retail.editar_clienta(
  p_id uuid,
  p_dni text default null,
  p_nombre text default null,
  p_telefono_whatsapp text default null,
  p_acepta_whatsapp boolean default false,
  p_revoca_whatsapp boolean default false,
  p_cumple_dia smallint default null,
  p_cumple_mes smallint default null,
  p_tallas jsonb default null,
  p_version_esperada integer default null
)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_actual record;
begin
  v_persona := retail.fn_actor_persona_id(true);

  select * into v_actual from retail.clientas where id = p_id;
  if v_actual.id is null then
    raise exception 'Esa clienta ya no existe — actualiza la pantalla.';
  end if;
  if v_actual.archivada_en is not null then
    raise exception 'Esta ficha está archivada — reactívala antes de editarla.';
  end if;

  -- ADR-0193: candado optimista. `for update` cierra la carrera de dos guardados a la vez (el
  -- segundo espera al primero y, al despertar, ya no encuentra la fila en la versión que pidió).
  if p_version_esperada is not null then
    perform 1 from retail.clientas where id = p_id and version = p_version_esperada for update;
    if not found then
      raise exception 'Alguien más editó esta ficha mientras la mirabas. Recarga para ver sus cambios.'
        using errcode = 'PT409', hint = 'version_cambiada';
    end if;
  end if;

  update retail.clientas set
    dni = nullif(btrim(p_dni), ''),
    nombre = nullif(btrim(p_nombre), ''),
    telefono_whatsapp = nullif(btrim(p_telefono_whatsapp), ''),
    whatsapp_consentimiento_en = case
      when p_revoca_whatsapp then null
      when p_acepta_whatsapp then now()
      else whatsapp_consentimiento_en
    end,
    cumple_dia = p_cumple_dia,
    cumple_mes = p_cumple_mes,
    tallas = coalesce(p_tallas, tallas)
  where id = p_id;

  perform retail.fn_actividad_anotar(
    'clientas', 'editar',
    'Editó la ficha de ' || coalesce(nullif(btrim(p_nombre), ''), nullif(btrim(p_dni), ''), 'una clienta'),
    v_persona, null, null, null, 'clientas', p_id::text, now(),
    jsonb_build_object('revoco_whatsapp', p_revoca_whatsapp), 'vivo'
  );

  return (select version from retail.clientas where id = p_id);
end;
$$;

comment on function retail.editar_clienta(uuid, text, text, text, boolean, boolean, smallint, smallint, jsonb, integer) is
  'Edita una ficha ya creada. p_version_esperada (ADR-0193): rechaza con PT409 si otra persona la editó entre medio. p_revoca_whatsapp: apaga el consentimiento a propósito (p_acepta_whatsapp=false por sí solo nunca lo revoca, igual que registrar_clienta).';

-- ---------- 2. archivar_clienta (incluye el pedido de anonimizar, Ley 29733) ----------
create or replace function retail.archivar_clienta(
  p_id uuid,
  p_motivo text,
  p_anonimizar boolean default false,
  p_version_esperada integer default null
)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_actual record;
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  v_persona := retail.fn_actor_persona_id(true);

  if v_motivo is null then
    raise exception 'Escribe un motivo antes de archivar a esta clienta.';
  end if;

  select * into v_actual from retail.clientas where id = p_id;
  if v_actual.id is null then
    raise exception 'Esa clienta ya no existe — actualiza la pantalla.';
  end if;
  if v_actual.archivada_en is not null then
    raise exception 'Esta ficha ya está archivada.';
  end if;

  if p_version_esperada is not null then
    perform 1 from retail.clientas where id = p_id and version = p_version_esperada for update;
    if not found then
      raise exception 'Alguien más cambió esta ficha mientras la mirabas. Recarga para ver sus cambios.'
        using errcode = 'PT409', hint = 'version_cambiada';
    end if;
  end if;

  update retail.clientas set
    archivada_en = now(),
    archivada_por = v_persona,
    motivo_archivo = v_motivo,
    anonimizada = p_anonimizar,
    dni = case when p_anonimizar then null else dni end,
    nombre = case when p_anonimizar then 'Clienta anonimizada' else nombre end,
    telefono_whatsapp = case when p_anonimizar then null else telefono_whatsapp end,
    whatsapp_consentimiento_en = case when p_anonimizar then null else whatsapp_consentimiento_en end,
    cumple_dia = case when p_anonimizar then null else cumple_dia end,
    cumple_mes = case when p_anonimizar then null else cumple_mes end,
    tallas = case when p_anonimizar then null else tallas end
  where id = p_id;

  perform retail.fn_actividad_anotar(
    'clientas', case when p_anonimizar then 'anonimizar' else 'archivar' end,
    case when p_anonimizar
      then 'Anonimizó una ficha de clienta a pedido: ' || v_motivo
      else 'Archivó la ficha de ' || coalesce(v_actual.nombre, v_actual.dni, 'una clienta') || ': ' || v_motivo
    end,
    v_persona, null, null, null, 'clientas', p_id::text, now(),
    jsonb_build_object('motivo', v_motivo, 'anonimizada', p_anonimizar), 'vivo'
  );

  return (select version from retail.clientas where id = p_id);
end;
$$;

comment on function retail.archivar_clienta(uuid, text, boolean, integer) is
  'Archiva una ficha (nunca delete). p_anonimizar=true además le quita todo dato personal (Ley 29733, docs/datos/06-DATOS-PERSONALES.md §7): sus ventas/cambios/devoluciones/separaciones NO se tocan, solo desaparece la persona. p_version_esperada: ADR-0193.';

-- ---------- 3. reactivar_clienta ----------
create or replace function retail.reactivar_clienta(
  p_id uuid,
  p_version_esperada integer default null
)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_actual record;
begin
  v_persona := retail.fn_actor_persona_id(true);

  select * into v_actual from retail.clientas where id = p_id;
  if v_actual.id is null then
    raise exception 'Esa clienta ya no existe — actualiza la pantalla.';
  end if;
  if v_actual.archivada_en is null then
    raise exception 'Esta ficha no está archivada.';
  end if;
  if v_actual.anonimizada then
    raise exception 'Esta ficha fue anonimizada: sus datos personales ya no existen, no se puede reactivar.';
  end if;
  if v_actual.fusionada_en_id is not null then
    raise exception 'Esta ficha se unió a otra — abre esa ficha en su lugar.';
  end if;

  if p_version_esperada is not null then
    perform 1 from retail.clientas where id = p_id and version = p_version_esperada for update;
    if not found then
      raise exception 'Alguien más cambió esta ficha mientras la mirabas. Recarga para ver sus cambios.'
        using errcode = 'PT409', hint = 'version_cambiada';
    end if;
  end if;

  update retail.clientas set archivada_en = null, archivada_por = null, motivo_archivo = null where id = p_id;

  perform retail.fn_actividad_anotar(
    'clientas', 'reactivar', 'Reactivó la ficha de ' || coalesce(v_actual.nombre, v_actual.dni, 'una clienta'),
    v_persona, null, null, null, 'clientas', p_id::text, now(), '{}'::jsonb, 'vivo'
  );

  return (select version from retail.clientas where id = p_id);
end;
$$;

comment on function retail.reactivar_clienta(uuid, integer) is
  'Deshace un archivar_clienta simple (sin anonimizar). Una ficha anonimizada o fusionada no se puede reactivar: sus datos ya no existen, o la persona real es la otra ficha.';

revoke execute on function
  retail.editar_clienta(uuid, text, text, text, boolean, boolean, smallint, smallint, jsonb, integer),
  retail.archivar_clienta(uuid, text, boolean, integer),
  retail.reactivar_clienta(uuid, integer)
from public, anon;

grant execute on function
  retail.editar_clienta(uuid, text, text, text, boolean, boolean, smallint, smallint, jsonb, integer),
  retail.archivar_clienta(uuid, text, boolean, integer),
  retail.reactivar_clienta(uuid, integer)
to authenticated;

notify pgrst, 'reload schema';
