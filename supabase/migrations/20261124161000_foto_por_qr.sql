-- La foto de un modelo, tomada con el celular por un QR (ADR-0699, actividad 2c; Felipe 2026-11-24 eligió «sin sesión»).
--
-- EL PROBLEMA. En Recibir ▸ Contar la computadora cuenta y el celular tiene la cámara. La foto tiene que viajar de uno a otro, y el
-- celular no tiene por qué tener sesión en el ERP. Felipe eligió que el QR traiga su propio permiso: quien lo escanea sube la foto sin
-- entrar. Es una puerta de escritura sin cuenta, así que se hace lo más angosta posible:
--   · vale para UN modelo de UN envío abierto, y vence a los 10 minutos (nunca más de 15: lo exige la tabla);
--   · sube como mucho 3 fotos (lo exige la tabla);
--   · la base no guarda el permiso, guarda su huella (sha256): leer la tabla no da con qué subir;
--   · el celular no habla con la base: habla con `POST /api/foto-qr/<permiso>`, que mira el permiso con la llave de servicio, revisa que
--     sea una imagen de verdad y la deja en un almacén privado (`retail-fotos-por-qr`), sin políticas: nadie con sesión lo lee directo;
--   · la computadora que lo pidió recoge la foto (`marcar_foto_por_qr_recogida`) y el servidor la borra del almacén al entregarla.
--
-- CONTRATO
--   PROMETE: `crear_foto_por_qr` da un permiso nuevo a quien puede contar ese envío; `usar_foto_por_qr` (solo el servidor) anota una
--            foto contra un permiso vigente y con lugar, o se niega con un motivo; `fn_fotos_por_qr_llegadas` y `marcar_foto_por_qr_recogida`
--            le dan a la cuenta que pidió el permiso, y a nadie más, las fotos que llegaron.
--   ASUME:   que el servidor guarda el archivo ANTES de `usar_foto_por_qr` y lo borra si esta se niega; y que borra el archivo al recogerlo.
--   NO HACE: no crea prendas ni toca el conteo: la foto llega a la pantalla como si se hubiera tomado ahí, y sigue el camino de siempre.
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR (los hace imposibles la tabla, no el código):
--   · un permiso que dura más de 15 minutos, o que vence antes de nacer  → `fotos_por_qr_vence`;
--   · un permiso con más de 3 fotos, o con fotos negativas               → `fotos_por_qr_tope`, y `usar_foto_por_qr` bloquea la fila;
--   · dos permisos con la misma huella, o una foto anotada dos veces      → `unique` en `token_hash` y en `ruta`;
--   · una foto sin su permiso                                              → FK con `on delete cascade`.
--
-- Producción: espera el OK de Felipe (CLAUDE.md, «Detente y confirma»). Idempotente; el almacén solo donde existe Storage.

set search_path = retail, public, extensions;

create table if not exists retail.fotos_por_qr (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  despacho_id uuid not null references retail.despachos(id),
  parada_clave text not null check (length(parada_clave) between 1 and 300),
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  creado_por uuid not null,
  -- La CUENTA que pidió el QR (la computadora): solo ella recoge las fotos. Puede no ser quien firma (una terminal con su responsable).
  cuenta uuid not null,
  creado_en timestamptz not null default now(),
  vence_en timestamptz not null,
  fotos smallint not null default 0,
  constraint fotos_por_qr_vence check (vence_en > creado_en and vence_en <= creado_en + interval '15 minutes'),
  constraint fotos_por_qr_tope check (fotos between 0 and 3)
);
comment on table retail.fotos_por_qr is
  'ADR-0699: el permiso de un QR para subir la foto de un modelo desde un celular sin sesión. Guarda la huella sha256, nunca el permiso; vence a los 10 min (tope 15) y admite 3 fotos.';

create table if not exists retail.fotos_por_qr_archivos (
  id uuid primary key default gen_random_uuid(),
  qr_id uuid not null references retail.fotos_por_qr(id) on delete cascade,
  ruta text not null unique check (length(ruta) between 1 and 300),
  creado_en timestamptz not null default now(),
  recogida_en timestamptz
);
create index if not exists fotos_por_qr_archivos_qr on retail.fotos_por_qr_archivos (qr_id) where recogida_en is null;
comment on table retail.fotos_por_qr_archivos is
  'ADR-0699: cada foto que subió un celular con un permiso de QR, hasta que la computadora la recoge (y el servidor la borra del almacén).';

-- Nadie las lee ni las escribe directo: solo por las funciones de abajo.
alter table retail.fotos_por_qr enable row level security;
alter table retail.fotos_por_qr_archivos enable row level security;
revoke all on retail.fotos_por_qr, retail.fotos_por_qr_archivos from public, anon, authenticated;

-- Un permiso nuevo para la foto de un modelo. Quien lo pide tiene que poder contar ese envío (las mismas puertas que guardar un conteo).
create or replace function retail.crear_foto_por_qr(p_despacho_id uuid, p_parada_clave text, p_nombre text)
returns table (id uuid, token text, vence_en timestamptz)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_despacho retail.despachos;
  v_actor uuid;
  v_token text;
  v_id uuid;
  v_vence timestamptz := now() + interval '10 minutes';
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Tomar la foto con el celular necesita el módulo «Recibir mercadería» en tu rol' using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  if v_despacho.estado <> 'abierto' then
    raise exception 'La foto con el celular es para un envío que se está contando' using hint = 'envio_no_abierto';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);
  if p_parada_clave is null or length(p_parada_clave) not between 1 and 300 then
    raise exception 'Falta qué modelo es' using hint = 'qr_sin_modelo';
  end if;
  -- 24 bytes al azar, en base64 para URL: 32 caracteres. Solo viaja en esta respuesta; la base se queda con su huella.
  v_token := translate(encode(gen_random_bytes(24), 'base64'), '+/', '-_');
  if auth.uid() is null then
    raise exception 'Hace falta una sesión' using errcode = '42501', hint = 'sin_sesion';
  end if;
  insert into retail.fotos_por_qr (token_hash, despacho_id, parada_clave, nombre, creado_por, cuenta, vence_en)
  values (encode(digest(v_token, 'sha256'), 'hex'), v_despacho.id, p_parada_clave, left(btrim(coalesce(nullif(btrim(p_nombre), ''), 'Prenda')), 120), v_actor, auth.uid(), v_vence)
  returning fotos_por_qr.id into v_id;
  return query select v_id, v_token, v_vence;
end;
$$;
revoke all on function retail.crear_foto_por_qr(uuid, text, text) from public, anon;
grant execute on function retail.crear_foto_por_qr(uuid, text, text) to authenticated;

-- Lo que el celular puede saber de su permiso: el nombre del modelo, si sigue vigente y cuántas fotos le quedan. Solo el servidor.
create or replace function retail.fn_foto_por_qr_info(p_token_hash text)
returns table (id uuid, nombre text, vigente boolean, quedan integer)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select q.id, q.nombre, (q.vence_en > now() and q.fotos < 3 and d.estado = 'abierto'), greatest(0, 3 - q.fotos)::integer
  from retail.fotos_por_qr q
  join retail.despachos d on d.id = q.despacho_id
  where q.token_hash = p_token_hash;
$$;
revoke all on function retail.fn_foto_por_qr_info(text) from public, anon, authenticated;
grant execute on function retail.fn_foto_por_qr_info(text) to service_role;

-- Anota una foto ya guardada en el almacén contra su permiso. La fila se bloquea: dos fotos al mismo tiempo no pasan el tope de 3.
create or replace function retail.usar_foto_por_qr(p_token_hash text, p_ruta text)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_qr retail.fotos_por_qr;
  v_estado text;
begin
  select q.* into v_qr from retail.fotos_por_qr q where q.token_hash = p_token_hash for update;
  if not found then
    raise exception 'Este código no es de CAYLA' using hint = 'qr_no_existe';
  end if;
  select d.estado into v_estado from retail.despachos d where d.id = v_qr.despacho_id;
  if v_qr.vence_en <= now() or v_estado <> 'abierto' then
    raise exception 'Este código ya venció: pide uno nuevo en la computadora' using hint = 'qr_vencido';
  end if;
  if v_qr.fotos >= 3 then
    raise exception 'Con este código ya se subieron 3 fotos: pide uno nuevo' using hint = 'qr_lleno';
  end if;
  insert into retail.fotos_por_qr_archivos (qr_id, ruta) values (v_qr.id, p_ruta);
  update retail.fotos_por_qr set fotos = fotos + 1 where id = v_qr.id;
  return 3 - (v_qr.fotos + 1);
end;
$$;
revoke all on function retail.usar_foto_por_qr(text, text) from public, anon, authenticated;
grant execute on function retail.usar_foto_por_qr(text, text) to service_role;

-- Las fotos que llegaron y nadie recogió todavía. Solo quien creó el permiso (la computadora que muestra el QR).
create or replace function retail.fn_fotos_por_qr_llegadas(p_qr_id uuid)
returns table (archivo_id uuid, creado_en timestamptz)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select a.id, a.creado_en
  from retail.fotos_por_qr_archivos a
  join retail.fotos_por_qr q on q.id = a.qr_id
  where a.qr_id = p_qr_id and a.recogida_en is null and q.cuenta = auth.uid()
  order by a.creado_en;
$$;
revoke all on function retail.fn_fotos_por_qr_llegadas(uuid) from public, anon;
grant execute on function retail.fn_fotos_por_qr_llegadas(uuid) to authenticated;

-- La computadora recoge una foto: queda marcada y devuelve dónde está, para que el servidor la entregue y la borre. Una sola vez.
create or replace function retail.marcar_foto_por_qr_recogida(p_archivo_id uuid)
returns text
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ruta text;
begin
  update retail.fotos_por_qr_archivos a
     set recogida_en = now()
    from retail.fotos_por_qr q
   where a.id = p_archivo_id and q.id = a.qr_id and a.recogida_en is null and q.cuenta = auth.uid()
  returning a.ruta into v_ruta;
  if v_ruta is null then
    raise exception 'Esa foto ya se recogió o no es tuya' using errcode = '42501', hint = 'qr_foto_ajena';
  end if;
  return v_ruta;
end;
$$;
revoke all on function retail.marcar_foto_por_qr_recogida(uuid) from public, anon;
grant execute on function retail.marcar_foto_por_qr_recogida(uuid) to authenticated;

-- El almacén privado, sin políticas: solo la llave de servicio entra. Hasta 10 MB y solo fotos.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'foto_por_qr: sin schema storage en este Postgres; el almacén retail-fotos-por-qr se crea donde Storage existe.';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('retail-fotos-por-qr', 'retail-fotos-por-qr', false, 10 * 1024 * 1024,
          array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif'])
  on conflict (id) do update
    set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
end;
$$;
