-- ============================================================================
-- 20261030150000_pedidos_web_push_aparatos.sql — CAYLA V2 · Tienda web: aviso en el celular de la sede cuando llega un pedido web
-- (ADR-0582, Felipe 2026-10-30)
--
-- EL PROBLEMA. Un pedido web nuevo solo se ve si alguien abre Tienda web ▸ Pedidos. La sede tiene dos teléfonos (un Android y un
-- iPhone 12) con el ERP instalado, y Felipe quiere que suenen cuando un cliente separa en la tienda online.
--
-- ANALOGÍA CAYLA. Es el timbre de la puerta de atrás: cada teléfono se cuelga del timbre de SU tienda (el aparato y su sede), y cada
-- pedido que entra deja una ficha en la bandeja de «por avisar» (la cola) en el mismo instante en que nace. Un trabajo pasa por la
-- bandeja cada minuto y toca el timbre de los teléfonos de esa tienda. Si el timbre no suena, la ficha sigue en la bandeja.
--
-- QUÉ HAY AQUÍ
--   1. `retail.pedidos_web_push_aparatos`: un teléfono por fila (su dirección de envío y sus dos claves), la cuenta que lo activó y la
--      sede de la que quiere los avisos. Una dirección es única: el mismo teléfono activado de nuevo (otra sede, otra cuenta) se mueve.
--   2. `retail.pedidos_web_push_envios`: la cola, una ficha por pedido. Guarda solo el pedido: el texto se arma al enviar (el pedido
--      nace con total 0 y sus prendas llegan después, en la misma transacción; al enviar ya está completo).
--   3. El disparador `pedidos_web_push_nuevo` (después de insertar en `pedidos_web`): anota la ficha. Si no puede, avisa y el pedido
--      sigue: un pedido nunca se cae por un aviso.
--   4. La pantalla: `pedidos_web_push_activar`, `pedidos_web_push_apagar` y `fn_pedidos_web_push_estado`.
--   5. El trabajo de envío (`service_role`): `fn_pedidos_web_push_reclamar`, `fn_pedidos_web_push_marcar_enviado` y
--      `fn_pedidos_web_push_quitar_aparato`.
--
-- QUÉ SE GARANTIZA
--   · Activar exige lo mismo que atender un pedido: ver «Pedidos web» y operar esa sede (`fn_pedido_web_exigir`).
--   · Y se vuelve a preguntar EN CADA ENVÍO, con las mismas funciones (`fn_pedidos_web_push_puede`): a quien le quitan el módulo o la
--     sede, su teléfono deja de sonar solo, sin que nadie se acuerde de apagarlo.
--   · El aviso no lleva el nombre del cliente ni la prenda: el número, la sede, cuántas prendas y el total (texto A de la maqueta
--     `docs/maquetas/aviso-pedido-web-2026-10/`). La foto de la primera prenda va solo para el Android abierto.
--   · RLS encendido sin políticas: nadie toca estas tablas por fuera de sus funciones.
--   · Un aviso de más de dos horas, o de un pedido que ya se cerró (vencido o anulado), se cierra sin enviar.
--   · Un aviso que falla se reintenta hasta 5 veces.
--
-- QUIÉN ACTIVÓ. El aparato guarda la CUENTA (`auth_user_id`), no el responsable del combo (ADR-0162): activar el timbre es una
-- preferencia del teléfono, como el modo oscuro, no una operación del negocio; y es la cuenta la que debe seguir viendo el módulo.
--
-- PRODUCCIÓN. Se pega tal cual, en una sola parte: crea tablas nuevas y un disparador (`create or replace trigger`, que no toma las
-- tablas de `auth` ni de `storage`), y no lleva políticas (CLAUDE.md, «Políticas y deadlocks»). Se puede pegar dos veces.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create table if not exists retail.pedidos_web_push_aparatos (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  ubicacion_id uuid not null references retail.ubicaciones (id),
  endpoint text not null unique
    check (char_length(endpoint) between 20 and 1000 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) between 40 and 200),
  auth text not null check (char_length(auth) between 10 and 100),
  activado_en timestamptz not null default now()
);

create index if not exists pedidos_web_push_aparatos_ubicacion_idx on retail.pedidos_web_push_aparatos (ubicacion_id);

alter table retail.pedidos_web_push_aparatos enable row level security;
revoke all on retail.pedidos_web_push_aparatos from public, anon, authenticated;

comment on table retail.pedidos_web_push_aparatos is
  'ADR-0582: los teléfonos que piden el aviso de pedido web nuevo, cada uno con su sede. Interna: solo sus funciones pedidos_web_push_*.';

create table if not exists retail.pedidos_web_push_envios (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null unique references retail.pedidos_web (id) on delete cascade,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz,
  intentos integer not null default 0 check (intentos between 0 and 5)
);

create index if not exists pedidos_web_push_envios_pendientes_idx on retail.pedidos_web_push_envios (creado_en)
  where enviado_en is null;

alter table retail.pedidos_web_push_envios enable row level security;
revoke all on retail.pedidos_web_push_envios from public, anon, authenticated;

comment on table retail.pedidos_web_push_envios is
  'ADR-0582: la cola del aviso de pedido web nuevo, una ficha por pedido. Interna: solo sus funciones pedidos_web_push_*.';

-- ---------------------------------------------------------------------------
-- El disparador: cada pedido que nace deja su ficha. Nunca tumba el pedido.
create or replace function retail.fn_pedidos_web_push_anotar()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  begin
    insert into retail.pedidos_web_push_envios (pedido_id) values (new.id) on conflict (pedido_id) do nothing;
  exception when others then
    raise warning 'ADR-0582: no se pudo anotar el aviso del pedido web % (%)', new.id, sqlerrm;
  end;
  return null;
end;
$$;

create or replace trigger pedidos_web_push_nuevo
  after insert on retail.pedidos_web
  for each row execute function retail.fn_pedidos_web_push_anotar();

-- ---------------------------------------------------------------------------
-- ¿Esa cuenta, HOY, atiende los pedidos web de esa sede? Pregunta lo mismo que `fn_pedido_web_exigir`, con las mismas funciones,
-- poniéndose un instante en la piel de la cuenta (como hace el SQL Editor al probar una función con `request.jwt.claims`). Deja la
-- sesión como estaba, también si algo falla.
create or replace function retail.fn_pedidos_web_push_puede(p_auth_user_id uuid, p_ubicacion_id uuid)
returns boolean
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_claims text := current_setting('request.jwt.claims', true);
  v_ok boolean := false;
begin
  if p_auth_user_id is null or p_ubicacion_id is null then
    return false;
  end if;
  perform set_config('request.jwt.claim.sub', p_auth_user_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id::text, 'role', 'authenticated')::text, true);
  begin
    v_ok := coalesce(retail.fn_ve_modulo('pedidos_web'), false) and coalesce(retail.fn_puede_operar_ubicacion(p_ubicacion_id), false);
  exception when others then
    v_ok := false;
  end;
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  return v_ok;
end;
$$;

-- ---------------------------------------------------------------------------
-- La pantalla: activar el timbre de este teléfono para una sede.
create or replace function retail.pedidos_web_push_activar(p_ubicacion_id uuid, p_endpoint text, p_p256dh text, p_auth text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesión.' using errcode = '42501', hint = 'push_sin_sesion';
  end if;
  if p_ubicacion_id is null or p_endpoint is null or p_p256dh is null or p_auth is null
     or char_length(p_endpoint) not between 20 and 1000 or p_endpoint not like 'https://%'
     or char_length(p_p256dh) not between 40 and 200 or char_length(p_auth) not between 10 and 100 then
    raise exception 'El teléfono no entregó una dirección de avisos válida.' using errcode = '22023', hint = 'push_invalido';
  end if;
  perform retail.fn_pedido_web_exigir(p_ubicacion_id);

  insert into retail.pedidos_web_push_aparatos as a (auth_user_id, ubicacion_id, endpoint, p256dh, auth)
  values (auth.uid(), p_ubicacion_id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set
    auth_user_id = excluded.auth_user_id,
    ubicacion_id = excluded.ubicacion_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    activado_en = now();
  return jsonb_build_object('estado', 'ok', 'ubicacion_id', p_ubicacion_id);
end;
$$;

-- Apagar el timbre de ESTE teléfono. La dirección solo la conoce el propio teléfono; sin ella no se apaga nada.
create or replace function retail.pedidos_web_push_apagar(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_quitados integer;
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesión.' using errcode = '42501', hint = 'push_sin_sesion';
  end if;
  if p_endpoint is null or char_length(p_endpoint) > 1000 then
    raise exception 'El teléfono no entregó una dirección de avisos válida.' using errcode = '22023', hint = 'push_invalido';
  end if;
  delete from retail.pedidos_web_push_aparatos where endpoint = p_endpoint;
  get diagnostics v_quitados = row_count;
  return jsonb_build_object('estado', 'ok', 'quitados', v_quitados);
end;
$$;

-- ¿Este teléfono ya suena, y para qué sede? Solo responde por la dirección que el propio teléfono entrega.
create or replace function retail.fn_pedidos_web_push_estado(p_endpoint text)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion uuid;
  v_sede text;
begin
  if auth.uid() is null or p_endpoint is null or char_length(p_endpoint) > 1000 then
    return jsonb_build_object('activo', false);
  end if;
  for v_ubicacion, v_sede in
    select a.ubicacion_id, u.nombre from retail.pedidos_web_push_aparatos a join retail.ubicaciones u on u.id = a.ubicacion_id
     where a.endpoint = p_endpoint
  loop
    exit;
  end loop;
  if v_ubicacion is null then
    return jsonb_build_object('activo', false);
  end if;
  return jsonb_build_object('activo', true, 'ubicacion_id', v_ubicacion, 'sede', v_sede);
end;
$$;

-- ---------------------------------------------------------------------------
-- El trabajo de envío: toma hasta `p_limite` fichas pendientes (las más viejas primero), suma un intento a cada una y devuelve, por
-- ficha, lo que el aviso dice y los teléfonos que hoy pueden recibirlo. Las fichas viejas o de pedidos cerrados se cierran sin enviar.
create or replace function retail.fn_pedidos_web_push_reclamar(p_limite integer)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 20), 1), 100);
  v_ficha record;
  v_aparatos jsonb;
  v_aparato record;
  v_avisos jsonb := '[]'::jsonb;
begin
  update retail.pedidos_web_push_envios e set enviado_en = now()
   where e.enviado_en is null
     and (e.creado_en < now() - interval '2 hours'
          or exists (select 1 from retail.pedidos_web p where p.id = e.pedido_id and p.estado in ('vencido', 'anulado')));

  for v_ficha in
    with tomadas as (
      select e.id from retail.pedidos_web_push_envios e
       where e.enviado_en is null and e.intentos < 5
       order by e.creado_en, e.id
       limit v_limite
       for update skip locked
    )
    update retail.pedidos_web_push_envios e set intentos = e.intentos + 1
      from tomadas t where e.id = t.id
    returning e.id, e.pedido_id, e.intentos, e.creado_en
  loop
    v_aparatos := '[]'::jsonb;
    for v_aparato in
      select a.endpoint, a.p256dh, a.auth, a.auth_user_id, a.ubicacion_id
        from retail.pedidos_web_push_aparatos a
        join retail.pedidos_web p on p.id = v_ficha.pedido_id and p.ubicacion_id = a.ubicacion_id
       order by a.activado_en
    loop
      if retail.fn_pedidos_web_push_puede(v_aparato.auth_user_id, v_aparato.ubicacion_id) then
        v_aparatos := v_aparatos || jsonb_build_object('endpoint', v_aparato.endpoint, 'p256dh', v_aparato.p256dh, 'auth', v_aparato.auth);
      end if;
    end loop;

    v_avisos := v_avisos || (
      select jsonb_build_object(
               'id', v_ficha.id, 'intentos', v_ficha.intentos,
               'pedido_id', p.id, 'codigo', p.codigo, 'sede', u.nombre, 'total', p.total,
               'prendas', (select count(*) from retail.pedido_web_lineas l where l.pedido_id = p.id),
               'foto', (select retail.fn_pedido_web_prenda(l.variante_id) ->> 'foto'
                          from retail.pedido_web_lineas l where l.pedido_id = p.id order by l.posicion limit 1),
               'aparatos', v_aparatos)
        from retail.pedidos_web p join retail.ubicaciones u on u.id = p.ubicacion_id
       where p.id = v_ficha.pedido_id);
  end loop;

  return jsonb_build_object('estado', 'ok', 'avisos', v_avisos);
end;
$$;

-- Una ficha se da por enviada: llegó a algún teléfono, o la sede no tiene ninguno que pueda recibirla. Si el envío falló, no se marca:
-- vuelve a salir en la vuelta siguiente, hasta su quinto intento.
create or replace function retail.fn_pedidos_web_push_marcar_enviado(p_envio uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if p_envio is null then
    return jsonb_build_object('estado', 'invalido');
  end if;
  update retail.pedidos_web_push_envios set enviado_en = now() where id = p_envio and enviado_en is null;
  return jsonb_build_object('estado', 'ok');
end;
$$;

-- Quita un teléfono que el servicio de envío dio por muerto (404 o 410: el navegador ya no lo acepta, o desinstalaron la app).
create or replace function retail.fn_pedidos_web_push_quitar_aparato(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if p_endpoint is null or char_length(p_endpoint) > 1000 then
    return jsonb_build_object('estado', 'invalido');
  end if;
  delete from retail.pedidos_web_push_aparatos where endpoint = p_endpoint;
  return jsonb_build_object('estado', 'ok');
end;
$$;

revoke all on function retail.fn_pedidos_web_push_anotar() from public, anon, authenticated;
revoke all on function retail.fn_pedidos_web_push_puede(uuid, uuid) from public, anon, authenticated;
revoke all on function retail.pedidos_web_push_activar(uuid, text, text, text) from public, anon;
revoke all on function retail.pedidos_web_push_apagar(text) from public, anon;
revoke all on function retail.fn_pedidos_web_push_estado(text) from public, anon;
revoke all on function retail.fn_pedidos_web_push_reclamar(integer) from public, anon, authenticated;
revoke all on function retail.fn_pedidos_web_push_marcar_enviado(uuid) from public, anon, authenticated;
revoke all on function retail.fn_pedidos_web_push_quitar_aparato(text) from public, anon, authenticated;
grant execute on function retail.pedidos_web_push_activar(uuid, text, text, text) to authenticated;
grant execute on function retail.pedidos_web_push_apagar(text) to authenticated;
grant execute on function retail.fn_pedidos_web_push_estado(text) to authenticated;
grant execute on function retail.fn_pedidos_web_push_reclamar(integer) to service_role;
grant execute on function retail.fn_pedidos_web_push_marcar_enviado(uuid) to service_role;
grant execute on function retail.fn_pedidos_web_push_quitar_aparato(text) to service_role;
