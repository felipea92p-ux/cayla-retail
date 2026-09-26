-- Apartar de otra sede: pedir el traslado y apartar al llegar (Apartados v2 — ADR-0233; Felipe, 2026-09-26).
--
-- EL PROBLEMA. La clienta está en TRU y la prenda que quiere solo queda en AQP. Hoy la vendedora coordina por WhatsApp
-- con la otra tienda y nadie sabe para quién venía la prenda cuando llega: a veces la vende otra caja.
--
-- LA DECISIÓN (Felipe eligió «pedir traslado y apartar al llegar»):
--   1. TRU PIDE la prenda a AQP con el nombre de la clienta (`pedir_prenda_para_apartar`). No se reserva nada en AQP
--      todavía (ese era el otro camino, que cambiaba cómo despacha Traslados).
--   2. AQP la ENVÍA con un toque (`enviar_pedido_para_apartar`): es el traslado de siempre (`iniciar_traslado`), con la
--      clienta en la nota. Traslados no cambia.
--   3. Cuando TRU cierra el traslado, la prenda QUEDA GUARDADA SOLA para la clienta: un disparador sobre
--      `transferencias` la aparta (`apartar_stock`, ADR-0141) en el almacén donde entró, por 3 días. Si algo falla al
--      apartarla, el traslado se cierra igual y el pedido queda «llegó» para hacerlo a mano.
--   4. Cuando la clienta deja su adelanto (`separar_pedido_para_apartar`), en UNA transacción: se suelta esa reserva, la
--      prenda pasa al piso (`mover_interno`) y se aparta con `separar_prendas` como cualquier apartado (boleta de
--      anticipo, estante, plazo). Así nunca queda una ventana en que otra caja pueda venderla.
--
-- PRODUCCIÓN. Una tabla, cinco funciones y un disparador nuevo sobre `transferencias` (`create or replace trigger`,
-- nunca drop trigger). No se reescribe ninguna función de Traslados. Sin políticas. Una sola parte. Idempotente.

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create table if not exists retail.separacion_pedidos (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones (id),          -- la tienda de la clienta (pide)
  ubicacion_origen_id uuid not null references retail.ubicaciones (id),   -- la tienda que tiene la prenda (envía)
  variante_id uuid not null references retail.variantes (id),
  cantidad integer not null check (cantidad > 0),
  clienta_nombres text not null check (btrim(clienta_nombres) <> ''),
  clienta_apellidos text not null check (btrim(clienta_apellidos) <> ''),
  clienta_celular text not null check (clienta_celular ~ '^9[0-9]{8}$'),
  nota text check (nota is null or char_length(nota) <= 200),
  estado text not null default 'pedido' check (estado in ('pedido', 'en_camino', 'llego', 'apartado', 'cancelado')),
  transferencia_id uuid references retail.transferencias (id),
  apartado_id uuid references retail.apartados (id),        -- la reserva automática al llegar
  separacion_id uuid references retail.separaciones (id),   -- el apartado con adelanto
  creado_por uuid references public.personas (id),
  enviado_por uuid references public.personas (id),
  cancelado_por uuid references public.personas (id),
  cancelado_motivo text,
  llego_en timestamptz,
  token_cliente uuid unique,
  created_at timestamptz not null default now(),
  constraint separacion_pedidos_otra_sede check (ubicacion_id <> ubicacion_origen_id)
);
create index if not exists separacion_pedidos_ubicacion_idx on retail.separacion_pedidos (ubicacion_id, estado);
create index if not exists separacion_pedidos_origen_idx on retail.separacion_pedidos (ubicacion_origen_id, estado);
create index if not exists separacion_pedidos_transferencia_idx on retail.separacion_pedidos (transferencia_id) where transferencia_id is not null;
alter table retail.separacion_pedidos enable row level security;
revoke all on retail.separacion_pedidos from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Pedir (la tienda de la clienta)
-- ---------------------------------------------------------------------------
create or replace function retail.pedir_prenda_para_apartar(
  p_ubicacion_id uuid,
  p_origen_id uuid,
  p_variante_id uuid,
  p_cantidad integer,
  p_clienta_nombres text,
  p_clienta_apellidos text,
  p_clienta_celular text,
  p_nota text default null,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_id uuid;
  v_persona uuid;
  v_celular text := regexp_replace(coalesce(p_clienta_celular, ''), '\D', '', 'g');
  v_disponible integer;
begin
  if p_token is not null then
    select id into v_id from separacion_pedidos where token_cliente = p_token;
    if found then return v_id; end if;
  end if;
  if not fn_ve_modulo('apartados') then
    raise exception 'Tu rol no tiene el módulo Apartados' using errcode = '42501';
  end if;
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso sobre los apartados de esa tienda' using errcode = '42501';
  end if;
  if p_ubicacion_id = p_origen_id then
    raise exception 'La prenda se pide a OTRA tienda';
  end if;
  if (select count(*) from ubicaciones where id in (p_ubicacion_id, p_origen_id) and tipo = 'tienda') <> 2 then
    raise exception 'Solo se pide entre tiendas';
  end if;
  if coalesce(p_cantidad, 0) < 1 then
    raise exception 'Pide al menos una prenda';
  end if;
  if btrim(coalesce(p_clienta_nombres, '')) = '' or btrim(coalesce(p_clienta_apellidos, '')) = '' then
    raise exception 'Anota los nombres y apellidos de la clienta';
  end if;
  if v_celular !~ '^9[0-9]{8}$' then
    raise exception 'El celular de la clienta tiene 9 dígitos y empieza en 9';
  end if;
  if not exists (select 1 from variantes where id = p_variante_id and activo) then
    raise exception 'Esa prenda no existe o está descontinuada';
  end if;
  select coalesce(sum(st.cantidad - st.cantidad_apartada), 0) into v_disponible
    from stock st where st.variante_id = p_variante_id and st.ubicacion_id = p_origen_id;
  if v_disponible < p_cantidad then
    raise exception 'La otra tienda ya no tiene disponible esa prenda (quedan %)', greatest(v_disponible, 0);
  end if;
  v_persona := fn_actor_persona_id(true);
  begin
    insert into separacion_pedidos (ubicacion_id, ubicacion_origen_id, variante_id, cantidad, clienta_nombres, clienta_apellidos,
                                    clienta_celular, nota, creado_por, token_cliente)
      values (p_ubicacion_id, p_origen_id, p_variante_id, p_cantidad, btrim(p_clienta_nombres), btrim(p_clienta_apellidos),
              v_celular, nullif(btrim(coalesce(p_nota, '')), ''), v_persona, p_token)
      returning id into v_id;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select id into v_id from separacion_pedidos where token_cliente = p_token;
  end;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Enviar (la tienda que tiene la prenda): el traslado de siempre
-- ---------------------------------------------------------------------------
create or replace function retail.enviar_pedido_para_apartar(p_pedido_id uuid, p_fecha_estimada_llegada timestamptz, p_token uuid default null)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  pe separacion_pedidos%rowtype;
  v_tr uuid;
  v_persona uuid;
  v_sede text;
begin
  select * into pe from separacion_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido no existe';
  end if;
  if pe.estado = 'en_camino' and pe.transferencia_id is not null then
    return pe.transferencia_id;   -- reintento: ya salió
  end if;
  if pe.estado <> 'pedido' then
    raise exception 'Ese pedido ya no está por enviar (está %)', pe.estado;
  end if;
  if not (fn_ve_modulo('apartados') or fn_ve_modulo('traslados')) then
    raise exception 'Tu rol no tiene Apartados ni Traslados' using errcode = '42501';
  end if;
  select nombre into v_sede from ubicaciones where id = pe.ubicacion_id;
  -- `iniciar_traslado` comprueba que se opera el origen, el stock y firma con el responsable.
  v_tr := iniciar_traslado(
    pe.ubicacion_origen_id, pe.ubicacion_id,
    jsonb_build_array(jsonb_build_object('variante_id', pe.variante_id, 'cantidad', pe.cantidad)),
    p_fecha_estimada_llegada,
    left('Para apartar a ' || pe.clienta_nombres || ' ' || pe.clienta_apellidos || ' (pedido de ' || coalesce(v_sede, 'otra tienda') || ')', 200),
    p_token
  );
  v_persona := fn_actor_persona_id(true);
  update separacion_pedidos set estado = 'en_camino', transferencia_id = v_tr, enviado_por = v_persona where id = pe.id;
  return v_tr;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Cancelar (cualquiera de las dos tiendas, mientras no se apartó con adelanto)
-- ---------------------------------------------------------------------------
create or replace function retail.cancelar_pedido_para_apartar(p_pedido_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  pe separacion_pedidos%rowtype;
  v_persona uuid;
begin
  select * into pe from separacion_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido no existe';
  end if;
  if not (fn_puede_operar_ubicacion(pe.ubicacion_id) or fn_puede_operar_ubicacion(pe.ubicacion_origen_id)) then
    raise exception 'No tienes permiso sobre ese pedido' using errcode = '42501';
  end if;
  if pe.estado not in ('pedido', 'llego') then
    raise exception 'Ese pedido ya no se puede cancelar (está %)', pe.estado;
  end if;
  v_persona := fn_actor_persona_id(true);
  -- Si ya llegó y quedó guardada, la reserva se suelta: la prenda vuelve a estar disponible en la tienda.
  if pe.apartado_id is not null and exists (select 1 from apartados where id = pe.apartado_id and estado = 'abierto') then
    perform fn_cerrar_apartado_de_separacion(pe.apartado_id, 'clienta_no_vino', v_persona);
  end if;
  update separacion_pedidos
     set estado = 'cancelado', cancelado_por = v_persona, cancelado_motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = pe.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Al llegar: el traslado se cierra y la prenda queda guardada para la clienta
-- ---------------------------------------------------------------------------
create or replace function retail.trg_pedidos_al_llegar()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  pe separacion_pedidos%rowtype;
  v_recibido integer;
  v_apartado uuid;
begin
  if new.estado <> 'cerrada' or old.estado = 'cerrada' then
    return null;
  end if;
  for pe in select * from separacion_pedidos where transferencia_id = new.id and estado = 'en_camino' for update loop
    select coalesce(sum(r.cantidad_recibida), 0) into v_recibido
      from transferencia_recepciones r where r.transferencia_id = new.id and r.variante_id = pe.variante_id;
    if v_recibido <= 0 then
      update separacion_pedidos set estado = 'cancelado', cancelado_motivo = 'La prenda no llegó en el traslado' where id = pe.id;
      continue;
    end if;
    v_apartado := null;
    begin
      v_apartado := apartar_stock(pe.variante_id, pe.ubicacion_id, least(pe.cantidad, v_recibido),
                                  pe.clienta_nombres || ' ' || pe.clienta_apellidos, pe.clienta_celular, fn_hoy_lima() + 3,
                                  'Pedido para apartar: llegó de otra tienda',
                                  fn_sububicacion_por_defecto(pe.ubicacion_id, 'traslado_entrada'));
    exception when others then
      raise warning 'pedido para apartar %: llegó pero no se pudo guardar solo (%)', pe.id, sqlerrm;
    end;
    update separacion_pedidos set estado = 'llego', apartado_id = v_apartado, llego_en = now() where id = pe.id;
  end loop;
  return null;
end;
$$;
revoke all on function retail.trg_pedidos_al_llegar() from public, anon, authenticated;

create or replace trigger pedidos_para_apartar_al_llegar
  after update of estado on retail.transferencias
  for each row execute function retail.trg_pedidos_al_llegar();

-- ---------------------------------------------------------------------------
-- 5. La clienta deja su adelanto: se suelta la reserva, pasa al piso y se aparta, todo junto
--    p_datos: los mismos parámetros de `separar_prendas`, con sus nombres (p_items, p_pagos, p_clienta_nombres, …).
-- ---------------------------------------------------------------------------
create or replace function retail.separar_pedido_para_apartar(p_pedido_id uuid, p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  pe separacion_pedidos%rowtype;
  a apartados%rowtype;
  v_persona uuid;
  v_piso uuid;
  v_sep uuid;
  v_existente uuid;
begin
  if nullif(p_datos ->> 'p_token', '') is not null then
    select id into v_existente from separaciones where token_cliente = (p_datos ->> 'p_token')::uuid;
    if found then return v_existente; end if;
  end if;
  select * into pe from separacion_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido no existe';
  end if;
  if pe.estado <> 'llego' then
    raise exception 'Ese pedido todavía no llegó (está %)', pe.estado;
  end if;
  if not fn_ve_modulo('apartados') then
    raise exception 'Tu rol no tiene el módulo Apartados' using errcode = '42501';
  end if;
  if not fn_puede_operar_ubicacion(pe.ubicacion_id) or (p_datos ->> 'p_ubicacion_id')::uuid <> pe.ubicacion_id then
    raise exception 'Ese pedido es de otra tienda' using errcode = '42501';
  end if;
  v_persona := fn_actor_persona_id(true);
  v_piso := fn_sububicacion_por_defecto(pe.ubicacion_id, 'venta');

  if pe.apartado_id is not null then
    select * into a from apartados where id = pe.apartado_id for update;
    if a.estado = 'abierto' then
      perform fn_cerrar_apartado_de_separacion(a.id, 'entregada', v_persona);
    end if;
    if a.sububicacion_id is distinct from v_piso then
      perform mover_interno(p_ubicacion_id => pe.ubicacion_id, p_variante_id => pe.variante_id, p_cantidad => a.cantidad,
                            p_sububicacion_origen_id => a.sububicacion_id, p_sububicacion_destino_id => v_piso,
                            p_nota => 'Pedido para apartar: al piso para apartarlo con adelanto');
    end if;
  end if;

  v_sep := separar_prendas(
    p_ubicacion_id => pe.ubicacion_id,
    p_items => p_datos -> 'p_items',
    p_pagos => p_datos -> 'p_pagos',
    p_clienta_nombres => p_datos ->> 'p_clienta_nombres',
    p_clienta_apellidos => p_datos ->> 'p_clienta_apellidos',
    p_clienta_celular => p_datos ->> 'p_clienta_celular',
    p_devolucion_medio => p_datos ->> 'p_devolucion_medio',
    p_clienta_dni => nullif(p_datos ->> 'p_clienta_dni', ''),
    p_devolucion_numero => nullif(p_datos ->> 'p_devolucion_numero', ''),
    p_devolucion_cci => nullif(p_datos ->> 'p_devolucion_cci', ''),
    p_comprobante_tipo => coalesce(p_datos ->> 'p_comprobante_tipo', 'boleta'),
    p_cliente_ruc => nullif(p_datos ->> 'p_cliente_ruc', ''),
    p_cliente_razon_social => nullif(p_datos ->> 'p_cliente_razon_social', ''),
    p_asesora_id => nullif(p_datos ->> 'p_asesora_id', '')::uuid,
    p_clienta_id => nullif(p_datos ->> 'p_clienta_id', '')::uuid,
    p_nota => nullif(p_datos ->> 'p_nota', ''),
    p_token => nullif(p_datos ->> 'p_token', '')::uuid
  );
  update separacion_pedidos set estado = 'apartado', separacion_id = v_sep where id = pe.id;
  return v_sep;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Lectura: lo que pedí y lo que me pidieron (abiertos, y lo cerrado de los últimos 7 días)
-- ---------------------------------------------------------------------------
create or replace function retail.fn_pedidos_para_apartar(p_ubicacion_id uuid)
returns table (
  id uuid, direccion text, otra_sede text, variante_id uuid, cantidad integer,
  clienta_nombres text, clienta_apellidos text, clienta_celular text, nota text, estado text,
  created_at timestamptz, llego_en timestamptz, guardada_hasta date, traslado_numero integer, cancelado_motivo text
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select pe.id,
         case when pe.ubicacion_id = p_ubicacion_id then 'pedi' else 'me_piden' end,
         u.nombre, pe.variante_id, pe.cantidad, pe.clienta_nombres, pe.clienta_apellidos, pe.clienta_celular, pe.nota, pe.estado,
         pe.created_at, pe.llego_en, a.vence_el, t.numero, pe.cancelado_motivo
    from separacion_pedidos pe
    join ubicaciones u on u.id = case when pe.ubicacion_id = p_ubicacion_id then pe.ubicacion_origen_id else pe.ubicacion_id end
    left join apartados a on a.id = pe.apartado_id and a.estado = 'abierto'
    left join transferencias t on t.id = pe.transferencia_id
   where (pe.ubicacion_id = p_ubicacion_id or pe.ubicacion_origen_id = p_ubicacion_id)
     and fn_puede_operar_ubicacion(p_ubicacion_id)
     and (pe.estado in ('pedido', 'en_camino', 'llego') or pe.created_at > now() - interval '7 days')
   order by case pe.estado when 'llego' then 0 when 'pedido' then 1 when 'en_camino' then 2 else 3 end, pe.created_at desc
   limit 100;
$$;

revoke all on function retail.pedir_prenda_para_apartar(uuid, uuid, uuid, integer, text, text, text, text, uuid) from public, anon;
revoke all on function retail.enviar_pedido_para_apartar(uuid, timestamptz, uuid) from public, anon;
revoke all on function retail.cancelar_pedido_para_apartar(uuid, text) from public, anon;
revoke all on function retail.separar_pedido_para_apartar(uuid, jsonb) from public, anon;
revoke all on function retail.fn_pedidos_para_apartar(uuid) from public, anon;
grant execute on function retail.pedir_prenda_para_apartar(uuid, uuid, uuid, integer, text, text, text, text, uuid) to authenticated;
grant execute on function retail.enviar_pedido_para_apartar(uuid, timestamptz, uuid) to authenticated;
grant execute on function retail.cancelar_pedido_para_apartar(uuid, text) to authenticated;
grant execute on function retail.separar_pedido_para_apartar(uuid, jsonb) to authenticated;
grant execute on function retail.fn_pedidos_para_apartar(uuid) to authenticated;
