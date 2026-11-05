-- ============================================================================
-- 20261020145000_tienda_push_suscripciones_y_envios.sql — CAYLA V2 · Tienda online: avisos push en el celular (Felipe, 2026-10-20)
--
-- EL PROBLEMA. Las notificaciones de la tienda solo se ven si la persona abre la app. Felipe quiere que lleguen al celular cuando la
-- app está instalada: una talla que esperaba ya llegó, o un cambio en su pedido.
--
-- ANALOGÍA CAYLA. Es la libreta de avisos de la tienda: cada persona deja el teléfono donde quiere que la llamen (la suscripción), y
-- cada aviso se anota en una hoja de «por llamar» (la cola de envíos) en el mismo momento en que pasa algo. Un trabajo recorre la hoja
-- cada minuto y llama. Si la llamada falla, la hoja conserva el aviso.
--
-- QUÉ HAY AQUÍ (solo las tablas y las funciones de la tienda; los disparadores van en la migración siguiente)
--   1. `retail.tienda_push_suscripciones`: un aparato por fila (su dirección de envío y sus dos claves). Una dirección es única: si
--      el mismo aparato entra con otra cuenta, la dirección pasa a esa cuenta.
--   2. `retail.tienda_push_envios`: la cola. Un aviso por cuenta y clave; la clave única evita avisar dos veces lo mismo.
--   3. `tienda_push_suscribir` y `tienda_push_quitar`: las usa la tienda cuando la persona activa o apaga los avisos.
--   4. `tienda_push_reclamar`, `tienda_push_marcar_enviado` y `tienda_push_quitar_suscripcion`: las usa solo el trabajo de envío.
--
-- QUÉ SE GARANTIZA
--   · RLS encendido sin políticas: nadie lee ni escribe estas tablas por fuera de sus funciones (ni `tienda_web` directamente).
--   · Cada cuenta solo toca lo suyo: las funciones buscan la cuenta por su usuario (`cuentas_web`).
--   · Las claves de los aparatos y el texto de cada aviso tienen topes de largo; un aviso nunca lleva datos de la compra (el texto es
--     genérico y el enlace solo dice a qué pantalla ir).
--   · Un aviso que falla se reintenta, y se da por perdido a los 5 intentos (no se acumula para siempre).
--
-- ORDEN. Esta migración va primero: la siguiente crea los disparadores, que escriben en la cola de esta.
-- ============================================================================

set search_path = retail, public;

create table if not exists retail.tienda_push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  cuenta_web_id uuid not null references retail.cuentas_web (id) on delete cascade,
  endpoint text not null unique
    check (char_length(endpoint) between 20 and 1000 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) between 40 and 200),
  auth text not null check (char_length(auth) between 10 and 100),
  creada_en timestamptz not null default now()
);

create index if not exists tienda_push_suscripciones_cuenta_idx on retail.tienda_push_suscripciones (cuenta_web_id);

alter table retail.tienda_push_suscripciones enable row level security;
revoke all on retail.tienda_push_suscripciones from public, anon, authenticated, tienda_web;

comment on table retail.tienda_push_suscripciones is
  'Tienda online (Felipe, 2026-10-20): los aparatos que pidieron avisos en el celular. Interna: solo sus funciones tienda_push_*.';

create table if not exists retail.tienda_push_envios (
  id uuid primary key default gen_random_uuid(),
  cuenta_web_id uuid not null references retail.cuentas_web (id) on delete cascade,
  clave text not null check (char_length(clave) between 1 and 200),
  titulo text not null check (char_length(titulo) between 1 and 120),
  texto text not null check (char_length(texto) between 1 and 240),
  enlace text not null check (enlace like '/%' and char_length(enlace) <= 300),
  creado_en timestamptz not null default now(),
  enviado_en timestamptz,
  intentos integer not null default 0 check (intentos between 0 and 5),
  constraint tienda_push_envios_clave_unica unique (cuenta_web_id, clave)
);

create index if not exists tienda_push_envios_pendientes_idx on retail.tienda_push_envios (creado_en)
  where enviado_en is null;

alter table retail.tienda_push_envios enable row level security;
revoke all on retail.tienda_push_envios from public, anon, authenticated, tienda_web;

comment on table retail.tienda_push_envios is
  'Tienda online (Felipe, 2026-10-20): la cola de avisos push, uno por cuenta y clave. Interna: solo sus funciones tienda_push_*.';

-- ---------------------------------------------------------------------------
-- Activar: guarda (o reasigna) el aparato. Devuelve estado 'ok' o 'sin_cuenta' / 'invalido'.
create or replace function retail.tienda_push_suscribir(p_usuario_web_id uuid, p_endpoint text, p_p256dh text, p_auth text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public
as $$
declare
  v_cuenta uuid;
begin
  if p_usuario_web_id is null or p_endpoint is null or p_p256dh is null or p_auth is null
     or char_length(p_endpoint) not between 20 and 1000 or p_endpoint not like 'https://%'
     or char_length(p_p256dh) not between 40 and 200 or char_length(p_auth) not between 10 and 100 then
    return jsonb_build_object('estado', 'invalido');
  end if;
  select w.id into v_cuenta from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id for update;
  if v_cuenta is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  insert into retail.tienda_push_suscripciones as s (cuenta_web_id, endpoint, p256dh, auth)
  values (v_cuenta, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set
    cuenta_web_id = excluded.cuenta_web_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    creada_en = now();
  return jsonb_build_object('estado', 'ok');
end;
$$;

-- Apagar los avisos de ESE aparato (la persona lo quitó, o el navegador revocó el permiso).
create or replace function retail.tienda_push_quitar(p_usuario_web_id uuid, p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public
as $$
declare
  v_cuenta uuid;
  v_quitadas integer;
begin
  if p_usuario_web_id is null or p_endpoint is null or char_length(p_endpoint) > 1000 then
    return jsonb_build_object('estado', 'invalido');
  end if;
  select w.id into v_cuenta from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id;
  if v_cuenta is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  delete from retail.tienda_push_suscripciones where cuenta_web_id = v_cuenta and endpoint = p_endpoint;
  get diagnostics v_quitadas = row_count;
  return jsonb_build_object('estado', 'ok', 'quitadas', v_quitadas);
end;
$$;

-- ---------------------------------------------------------------------------
-- El trabajo de envío: toma hasta `p_limite` avisos pendientes (los más viejos primero), suma un intento a cada uno y devuelve, por
-- cada aviso, sus aparatos. Sin pendientes devuelve una lista vacía.
create or replace function retail.tienda_push_reclamar(p_limite integer)
returns jsonb
language plpgsql
security definer
set search_path = retail, public
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_avisos jsonb;
begin
  -- Un aviso de más de dos horas ya no es noticia (p. ej. lo que se acumuló antes de encender el envío): se cierra sin mandarlo.
  update retail.tienda_push_envios set enviado_en = now()
   where enviado_en is null and creado_en < now() - interval '2 hours';

  with tomados as (
    select e.id from retail.tienda_push_envios e
     where e.enviado_en is null and e.intentos < 5
     order by e.creado_en, e.id
     limit v_limite
     for update skip locked
  ),
  sumados as (
    update retail.tienda_push_envios e set intentos = e.intentos + 1
      from tomados t where e.id = t.id
    returning e.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'titulo', s.titulo, 'texto', s.texto, 'enlace', s.enlace, 'intentos', s.intentos,
           'aparatos', coalesce((
             select jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth))
               from retail.tienda_push_suscripciones p where p.cuenta_web_id = s.cuenta_web_id
           ), '[]'::jsonb)
         ) order by s.creado_en, s.id), '[]'::jsonb)
    into v_avisos
    from sumados s;
  return jsonb_build_object('estado', 'ok', 'avisos', v_avisos);
end;
$$;

-- Un aviso se da por enviado: o llegó a sus aparatos, o la cuenta no tiene ninguno (no hay nada que reintentar). Si el envío falló, el
-- aviso no se marca: vuelve a salir en la siguiente vuelta, hasta su quinto intento.
create or replace function retail.tienda_push_marcar_enviado(p_envio uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public
as $$
begin
  if p_envio is null then
    return jsonb_build_object('estado', 'invalido');
  end if;
  update retail.tienda_push_envios set enviado_en = now() where id = p_envio and enviado_en is null;
  return jsonb_build_object('estado', 'ok');
end;
$$;

-- Quita un aparato que el servicio de envío dio por muerto (404 o 410: el navegador ya no lo acepta).
create or replace function retail.tienda_push_quitar_suscripcion(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public
as $$
begin
  if p_endpoint is null or char_length(p_endpoint) > 1000 then
    return jsonb_build_object('estado', 'invalido');
  end if;
  delete from retail.tienda_push_suscripciones where endpoint = p_endpoint;
  return jsonb_build_object('estado', 'ok');
end;
$$;

revoke all on function retail.tienda_push_suscribir(uuid, text, text, text) from public, anon, authenticated;
revoke all on function retail.tienda_push_quitar(uuid, text) from public, anon, authenticated;
revoke all on function retail.tienda_push_reclamar(integer) from public, anon, authenticated;
revoke all on function retail.tienda_push_marcar_enviado(uuid) from public, anon, authenticated;
revoke all on function retail.tienda_push_quitar_suscripcion(text) from public, anon, authenticated;
grant execute on function retail.tienda_push_suscribir(uuid, text, text, text) to tienda_web;
grant execute on function retail.tienda_push_quitar(uuid, text) to tienda_web;
grant execute on function retail.tienda_push_reclamar(integer) to tienda_web;
grant execute on function retail.tienda_push_marcar_enviado(uuid) to tienda_web;
grant execute on function retail.tienda_push_quitar_suscripcion(text) to tienda_web;
