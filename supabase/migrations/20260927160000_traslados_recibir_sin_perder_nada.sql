-- ============================================================================
-- 20260927160000_traslados_recibir_sin_perder_nada.sql — CAYLA V2 · ADR-0238 (Felipe, 2026-09-26: D-129 a D-132)
-- Traslados: recibir sin perder nada (entra lo que coincide, conteo guardado, piso o almacén, anular).
--
-- EL PROBLEMA PRIMERO. El recorrido de Traslados como persona sin contexto (docs/pantallas/traslados.md) encontró que el
-- flujo falla justo al recibir:
--   · Si falta UNA prenda, no entra ninguna: 79 de 80 prendas quedan fuera del stock hasta que aparezca un líder.
--   · Lo que llega entra al almacén y Vender descuenta del piso: «entraron al stock» y, en la caja, «está en el almacén».
--   · Un envío equivocado no se puede deshacer: la otra sede registra 0 y un líder lo da por perdido. Pérdida falsa.
--   · Contar una casilla marcaba «confirmado»: con el conteo guardado línea por línea eso ya no es verdad.
--
-- QUÉ HACE (el contrato de la web está en la tabla «Contrato» del ADR-0238):
--   1. `transferencias`: `sububicacion_destino_id` (dónde terminó la caja), `anulado_por/_en`, `motivo_anulacion` y el
--      estado `anulada`. Los CHECK hacen imposible un traslado anulado sin fecha o sin motivo, y un motivo de anulación
--      en uno que no está anulado. La sububicación destino se ata a la sede destino con llave compuesta (como
--      `movimientos`): no puede apuntar al piso de OTRA sede.
--   2. `confirmar_traslado(p_transferencia_id, p_destino default null)` (D-129, D-131): cada línea cuyo conteo es IGUAL a
--      lo enviado entra al stock YA, en el piso o el almacén según `p_destino` (null = almacén, como siempre). Si alguna
--      línea no cuadra, queda `recibido_con_diferencia` y solo esa línea espera al líder.
--   3. `cerrar_traslado_con_diferencia`: hace entrar solo lo que falta, en la MISMA sububicación que eligió quien confirmó.
--   4. `registrar_recepcion_traslado` (D-130): se llama al contar cada casilla. Ya no marca «confirmado», no corrige una
--      línea que ya entró al stock y no toca un traslado anulado.
--   5. `anular_traslado` (D-132, NUEVA): quien envió (o un líder), mientras nadie haya empezado a contar. Cada prenda
--      vuelve a la sede de origen, a la misma sububicación de la que salió, con un movimiento `entrada`/`traslado_anulado`
--      enlazado a su línea. Un pedido para apartar que iba en él vuelve a «pedido».
--   6. Pedido para apartar (ADR-0233): se aparta cuando SU línea entra al stock (aunque otra línea espere al líder) y en
--      la sububicación donde entró de verdad. La lógica sale del disparador a `fn_apartar_pedidos_que_llegaron`; el
--      disparador queda solo para cancelar, al cerrar, lo que no llegó.
--   7. `fn_traslado_lineas`: suma `codigo` (el de la etiqueta, para la pistola) e `ingresado` (esa línea ya entró).
--   8. Lectores del historial: el movimiento `traslado_anulado` se lee como parte de su traslado en Movimientos
--      (`fn_movimientos`, `fn_movimientos_resumen`, `fn_movimientos_resumen_procesos`), y en el Balance deja de contar como
--      «en tránsito» (`fn_bal_transito`) y como «otra entrada sin asiento» (`fn_bal_causas_mercaderia`). Estas cinco se
--      parchan sobre su definición VIVA (`pg_temp.reemplazar`, como 20260927153000): no se copian, así ningún parche en
--      vivo se pierde; si el trozo no aparece las veces esperadas, la migración aborta entera.
--
-- DECISIONES DE DISEÑO (las de negocio están en el ADR):
--   · Candados en el mismo orden en confirmar, cerrar y anular (ADR-0190): primero el stock de las prendas
--     (`fn_bloquear_en_orden`), después el traslado (`for update`). Es el orden que ya usa `recibir_envio` (stock → traslado
--     dentro de `confirmar_traslado`); así dos operaciones sobre el mismo traslado nunca se esperan en círculo.
--   · `anular_traslado` NO lleva columna de token ni candado consultivo: a diferencia de `iniciar_traslado` (que crea una
--     fila que todavía no existe), aquí la fila ya existe y su `for update` serializa los dos intentos; el segundo la
--     encuentra `anulada` y devuelve su id sin mover nada. Se rompe si alguien quisiera distinguir «mi anulación» de «la
--     de otra persona»: con token, las dos devuelven el mismo id (el estado que ambos pedían ya se cumple).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una sola parte, tal cual (trae `retail.` y su `search_path`). Lleva `alter table` sobre
-- `transferencias` pero NINGUNA política ni `drop trigger` (ADR-0195: no se mezclan): no hay riesgo de 40P01 con el
-- Asesor. Idempotente: se puede pegar dos veces. Va ANTES de la web nueva: la web de hoy sigue funcionando con esta base
-- (`p_destino` tiene valor por defecto y las columnas son aditivas).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------
-- 1. La tabla: dónde terminó la caja y la anulación
-- ---------------------------------------------------------------------------
alter table retail.transferencias add column if not exists sububicacion_destino_id uuid;
alter table retail.transferencias add column if not exists anulado_por uuid;
alter table retail.transferencias add column if not exists anulado_en timestamptz;
alter table retail.transferencias add column if not exists motivo_anulacion text;

do $$
begin
  -- Llave compuesta: la sububicación destino tiene que ser DE la sede destino (misma regla que `movimientos`).
  if not exists (select 1 from pg_constraint where conname = 'transferencias_sububicacion_destino_pertenece_fk') then
    alter table retail.transferencias
      add constraint transferencias_sububicacion_destino_pertenece_fk
      foreign key (sububicacion_destino_id, ubicacion_destino_id) references retail.sububicaciones (id, ubicacion_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transferencias_anulado_por_fkey') then
    alter table retail.transferencias
      add constraint transferencias_anulado_por_fkey foreign key (anulado_por) references public.personas (id);
  end if;
end $$;

alter table retail.transferencias drop constraint if exists transferencias_estado_check;
alter table retail.transferencias add constraint transferencias_estado_check
  check (estado in ('completada', 'en_transito', 'recibido_con_diferencia', 'cerrada', 'anulada'));

-- Lamport: el esquema hace imposible el estado a medias. Un anulado sin fecha o sin motivo, o un motivo en un traslado
-- que no se anuló, no pueden existir aunque alguien escriba directo en la tabla.
alter table retail.transferencias drop constraint if exists transferencias_anulada_con_fecha;
alter table retail.transferencias add constraint transferencias_anulada_con_fecha
  check ((estado = 'anulada') = (anulado_en is not null));
alter table retail.transferencias drop constraint if exists transferencias_anulada_con_motivo;
alter table retail.transferencias add constraint transferencias_anulada_con_motivo
  check ((estado = 'anulada') = (nullif(btrim(motivo_anulacion), '') is not null));
alter table retail.transferencias drop constraint if exists transferencias_anulado_por_solo_si_anulada;
alter table retail.transferencias add constraint transferencias_anulado_por_solo_si_anulada
  check (anulado_por is null or estado = 'anulada');

comment on column retail.transferencias.sububicacion_destino_id is
  'ADR-0238 (D-131): dónde entró la caja en la sede destino (piso o almacén), elegido al confirmar. `cerrar_traslado_con_diferencia` usa la misma. Null si la sede no separa piso/almacén (Taller) o si se confirmó antes de esta columna.';
comment on column retail.transferencias.motivo_anulacion is
  'ADR-0238 (D-132): por qué se anuló el envío. Obligatorio si estado = anulada (CHECK).';

-- ---------------------------------------------------------------------------
-- 2. Pedido para apartar: se aparta cuando SU línea entra al stock (ADR-0233 + D-131)
-- ---------------------------------------------------------------------------
-- Interna (sin EXECUTE para nadie): la llaman confirmar y cerrar justo después de hacer entrar una línea, en SU
-- transacción. Aparta en la sububicación donde la prenda entró de verdad; si apartar falla, la recepción sigue (el
-- pedido queda «llegó» para hacerlo a mano), como prometía ADR-0233.
create or replace function retail.fn_apartar_pedidos_que_llegaron(
  p_transferencia_id uuid,
  p_variante_id uuid,
  p_sububicacion_id uuid,
  p_cantidad integer
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  pe separacion_pedidos%rowtype;
  v_resto integer := coalesce(p_cantidad, 0);
  v_apartar integer;
  v_apartado uuid;
begin
  for pe in
    select * from separacion_pedidos
     where transferencia_id = p_transferencia_id and variante_id = p_variante_id and estado = 'en_camino'
     order by created_at, id
     for update
  loop
    -- Lo que entró se reparte entre los pedidos en el orden en que se pidieron; el que se queda sin prenda sigue
    -- «en camino» y el disparador lo cancela al cerrarse el traslado.
    exit when v_resto <= 0;
    v_apartar := least(pe.cantidad, v_resto);
    v_resto := v_resto - v_apartar;
    v_apartado := null;
    begin
      v_apartado := apartar_stock(pe.variante_id, pe.ubicacion_id, v_apartar,
                                  pe.clienta_nombres || ' ' || pe.clienta_apellidos, pe.clienta_celular, fn_hoy_lima() + 3,
                                  'Pedido para apartar: llegó de otra tienda',
                                  p_sububicacion_id);
    exception when others then
      raise warning 'pedido para apartar %: llegó pero no se pudo guardar solo (%)', pe.id, sqlerrm;
    end;
    update separacion_pedidos set estado = 'llego', apartado_id = v_apartado, llego_en = now() where id = pe.id;
  end loop;
end;
$$;
revoke all on function retail.fn_apartar_pedidos_que_llegaron(uuid, uuid, uuid, integer) from public, anon, authenticated;

-- El disparador ya no aparta (eso pasa línea por línea, arriba): al cerrarse el traslado, lo que sigue «en camino» es
-- porque no llegó.
create or replace function retail.trg_pedidos_al_llegar()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if new.estado <> 'cerrada' or old.estado = 'cerrada' then
    return null;
  end if;
  update separacion_pedidos
     set estado = 'cancelado', cancelado_motivo = 'La prenda no llegó en el traslado'
   where transferencia_id = new.id and estado = 'en_camino';
  return null;
end;
$$;
revoke all on function retail.trg_pedidos_al_llegar() from public, anon, authenticated;

create or replace trigger pedidos_para_apartar_al_llegar
  after update of estado on retail.transferencias
  for each row execute function retail.trg_pedidos_al_llegar();

-- ---------------------------------------------------------------------------
-- 3. Contar una casilla (D-130): fija el conteo, no confirma nada
-- ---------------------------------------------------------------------------
create or replace function retail.registrar_recepcion_traslado(p_transferencia_id uuid, p_variante_id uuid, p_cantidad_recibida integer)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare t transferencias%rowtype; v_persona uuid; v_id uuid;
begin
  select * into t from transferencias where id = p_transferencia_id for update;
  if not found then raise exception 'El traslado % no existe', p_transferencia_id; end if;
  if not fn_puede_operar_ubicacion(t.ubicacion_destino_id) then
    raise exception 'No tienes permiso para confirmar recepción en esa ubicación';
  end if;
  if t.estado = 'anulada' then
    raise exception 'Ese traslado se anuló: la mercadería volvió a la sede que la envió';
  end if;
  if t.estado not in ('en_transito', 'recibido_con_diferencia') then
    raise exception 'Este traslado ya está % — no se puede seguir confirmando', t.estado;
  end if;
  if p_cantidad_recibida < 0 then
    raise exception 'La cantidad recibida no puede ser negativa';
  end if;
  -- D-129: una línea que ya entró al stock no se corrige contando de nuevo (el stock ya la sumó).
  if exists (select 1 from transferencia_recepciones
              where transferencia_id = p_transferencia_id and variante_id = p_variante_id and movimiento_id is not null) then
    raise exception 'Esa prenda ya entró al stock: su conteo no se puede cambiar';
  end if;

  v_persona := retail.fn_actor_persona_id(true);
  insert into transferencia_recepciones (transferencia_id, variante_id, cantidad_recibida, registrado_por)
    values (p_transferencia_id, p_variante_id, p_cantidad_recibida, v_persona)
    on conflict (transferencia_id, variante_id) do update
      set cantidad_recibida = excluded.cantidad_recibida, registrado_por = excluded.registrado_por
    returning id into v_id;
  -- D-130: ya NO marca confirmado_por/confirmado_en. Se llama al contar cada casilla, y «confirmado» tiene que seguir
  -- diciendo «alguien apretó Confirmar recepción» (lo marca `confirmar_traslado`).
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Confirmar (D-129 + D-131): entra lo que coincide, donde se eligió
-- ---------------------------------------------------------------------------
drop function if exists retail.confirmar_traslado(uuid);
create or replace function retail.confirmar_traslado(p_transferencia_id uuid, p_destino text default null)
returns table (resultado text, lineas_ok integer, lineas_con_diferencia integer, unidades_ingresadas integer)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  t transferencias%rowtype; v_persona uuid; v_distintas integer; r record; v_mov_id uuid; v_sub_destino uuid;
  v_lineas integer := 0; v_unidades integer := 0;
begin
  if p_destino is not null and p_destino not in ('piso_venta', 'almacen_tienda') then
    raise exception 'Elige si lo que llegó va al piso de venta o al almacén';
  end if;

  -- Origen y destino no cambian nunca: se leen sin candado para saber qué bloquear.
  select * into t from transferencias where id = p_transferencia_id;
  if not found then raise exception 'El traslado % no existe', p_transferencia_id; end if;
  if not fn_puede_operar_ubicacion(t.ubicacion_destino_id) then
    raise exception 'No tienes permiso para confirmar recepción en esa ubicación';
  end if;
  -- ADR-0190: stock primero, traslado después (el mismo orden que `recibir_envio` y `anular_traslado`).
  perform fn_bloquear_en_orden(t.ubicacion_destino_id,
    array(select variante_id from transferencia_recepciones where transferencia_id = p_transferencia_id
          union select variante_id from transferencia_items where transferencia_id = p_transferencia_id));
  select * into t from transferencias where id = p_transferencia_id for update;
  if t.estado = 'anulada' then
    raise exception 'Ese traslado se anuló: la mercadería volvió a la sede que la envió';
  end if;
  if t.estado <> 'en_transito' then raise exception 'Este traslado ya está %', t.estado; end if;

  if exists (
    select 1 from transferencia_items ti
    where ti.transferencia_id = p_transferencia_id
      and not exists (select 1 from transferencia_recepciones tr
                       where tr.transferencia_id = ti.transferencia_id and tr.variante_id = ti.variante_id)
  ) then
    raise exception 'Todavía faltan prendas enviadas por confirmar — registra qué pasó con cada una (aunque sea 0)';
  end if;

  select count(*) into v_distintas
  from transferencia_items ti
  full join transferencia_recepciones tr
    on tr.transferencia_id = ti.transferencia_id and tr.variante_id = ti.variante_id
  where coalesce(ti.transferencia_id, tr.transferencia_id) = p_transferencia_id
    and coalesce(ti.cantidad, 0) <> coalesce(tr.cantidad_recibida, 0);

  v_persona := retail.fn_actor_persona_id(true);

  -- D-131: la sububicación elegida; si la sede no la tiene (el Taller solo tiene racks), la de siempre. Se guarda para
  -- que el cierre del líder deje lo que falta en el mismo lugar: toda la caja termina junta.
  if p_destino is not null then
    select s.id into v_sub_destino from sububicaciones s where s.ubicacion_id = t.ubicacion_destino_id and s.tipo = p_destino;
  end if;
  v_sub_destino := coalesce(v_sub_destino, fn_sububicacion_por_defecto(t.ubicacion_destino_id, 'traslado_entrada'));

  -- D-129: entra YA cada línea cuyo conteo es igual a lo enviado. Las que no cuadran (de más o de menos, o una prenda
  -- que no venía en el envío) quedan sin movimiento para que el líder decida sobre la línea entera.
  for r in
    select tr.* from transferencia_recepciones tr
      join transferencia_items ti on ti.transferencia_id = tr.transferencia_id and ti.variante_id = tr.variante_id
     where tr.transferencia_id = p_transferencia_id
       and tr.movimiento_id is null
       and tr.cantidad_recibida = ti.cantidad
       and tr.cantidad_recibida > 0
     order by tr.variante_id
  loop
    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, transferencia_recepcion_id, usuario_id)
      values (r.variante_id, t.ubicacion_destino_id, v_sub_destino,
              'entrada', r.cantidad_recibida, 'traslado_entrada', r.id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);
    update transferencia_recepciones set movimiento_id = v_mov_id where id = r.id;
    perform fn_apartar_pedidos_que_llegaron(p_transferencia_id, r.variante_id, v_sub_destino, r.cantidad_recibida);
    v_lineas := v_lineas + 1; v_unidades := v_unidades + r.cantidad_recibida;
  end loop;

  if v_distintas = 0 then
    update transferencias set estado = 'cerrada', sububicacion_destino_id = v_sub_destino,
        confirmado_por = coalesce(confirmado_por, v_persona), confirmado_en = coalesce(confirmado_en, now()),
        cerrado_por = v_persona, cerrado_en = now()
      where id = p_transferencia_id;
    return query select 'cerrada'::text, v_lineas, 0, v_unidades;
  else
    update transferencias set estado = 'recibido_con_diferencia', sububicacion_destino_id = v_sub_destino,
        confirmado_por = coalesce(confirmado_por, v_persona), confirmado_en = coalesce(confirmado_en, now())
      where id = p_transferencia_id;
    return query select 'recibido_con_diferencia'::text, v_lineas, v_distintas, v_unidades;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. El líder cierra con diferencia: entra solo lo que falta, en el mismo lugar
-- ---------------------------------------------------------------------------
create or replace function retail.cerrar_traslado_con_diferencia(p_transferencia_id uuid, p_nota text default null)
returns table (lineas_recibidas integer, unidades_recibidas integer)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  t transferencias%rowtype; v_persona uuid; r record; v_mov_id uuid; v_sub_destino uuid;
  v_lineas integer := 0; v_unidades integer := 0;
begin
  select * into t from transferencias where id = p_transferencia_id;
  if not found then raise exception 'El traslado % no existe', p_transferencia_id; end if;
  if not fn_puede_ajustar_inventario() then
    raise exception 'Solo un líder puede cerrar un traslado con diferencias — es la aprobación de lo recibido';
  end if;
  if not fn_puede_operar_ubicacion(t.ubicacion_destino_id) then
    raise exception 'No tienes permiso para cerrar traslados en esa ubicación';
  end if;
  -- ADR-0190: stock primero, traslado después.
  perform fn_bloquear_en_orden(t.ubicacion_destino_id,
    array(select variante_id from transferencia_recepciones where transferencia_id = p_transferencia_id and movimiento_id is null));
  select * into t from transferencias where id = p_transferencia_id for update;
  if t.estado <> 'recibido_con_diferencia' then
    raise exception 'Este traslado no está pendiente de revisión (está %)', t.estado;
  end if;

  v_persona := retail.fn_actor_persona_id(true);
  -- D-131: donde entró el resto de la caja. Un traslado confirmado antes de esta migración no la tiene: la de siempre.
  v_sub_destino := coalesce(t.sububicacion_destino_id, fn_sububicacion_por_defecto(t.ubicacion_destino_id, 'traslado_entrada'));
  for r in select * from transferencia_recepciones
            where transferencia_id = p_transferencia_id and movimiento_id is null
            order by variante_id loop
    if r.cantidad_recibida > 0 then
      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, transferencia_recepcion_id, usuario_id)
        values (r.variante_id, t.ubicacion_destino_id, v_sub_destino,
                'entrada', r.cantidad_recibida, 'traslado_entrada', r.id, v_persona)
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
      update transferencia_recepciones set movimiento_id = v_mov_id where id = r.id;
      perform fn_apartar_pedidos_que_llegaron(p_transferencia_id, r.variante_id, v_sub_destino, r.cantidad_recibida);
      v_lineas := v_lineas + 1; v_unidades := v_unidades + r.cantidad_recibida;
    end if;
  end loop;

  update transferencias set estado = 'cerrada', cerrado_por = v_persona, cerrado_en = now(), nota_cierre = p_nota,
      sububicacion_destino_id = coalesce(sububicacion_destino_id, v_sub_destino)
    where id = p_transferencia_id;
  return query select v_lineas, v_unidades;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Anular un envío (D-132)
-- ---------------------------------------------------------------------------
-- PROMETE: con el traslado en camino y sin ningún conteo, devuelve cada prenda a la sede de origen (a la sububicación de
-- la que salió), deja el traslado `anulada` con quién, cuándo y por qué, y devuelve a «pedido» el pedido para apartar
-- que iba en él. Un segundo intento sobre un traslado ya anulado con token devuelve el mismo id sin mover nada.
-- ASUME: quien llama opera la sede de origen o es líder, y escribe un motivo.
create or replace function retail.anular_traslado(p_transferencia_id uuid, p_motivo text, p_token uuid default null)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  t transferencias%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_persona uuid;
  ti record;
  v_salida movimientos%rowtype;
  v_mov_id uuid;
begin
  select * into t from transferencias where id = p_transferencia_id;
  if not found then raise exception 'Ese traslado no existe'; end if;
  if not fn_puede_operar_ubicacion(t.ubicacion_origen_id) then
    raise exception 'Solo la sede que envió el traslado o un líder pueden anularlo' using errcode = '42501';
  end if;

  -- ADR-0190: stock de origen primero, traslado después (el mismo orden que confirmar y cerrar).
  perform fn_bloquear_en_orden(t.ubicacion_origen_id,
    array(select variante_id from transferencia_items where transferencia_id = p_transferencia_id));
  select * into t from transferencias where id = p_transferencia_id for update;

  -- Doble clic: el segundo intento esperó al primero en el `for update` y encuentra el traslado ya anulado.
  if t.estado = 'anulada' then
    if p_token is not null then
      return t.id;
    end if;
    raise exception 'Ese traslado ya se anuló';
  end if;
  if t.estado <> 'en_transito' then
    raise exception 'La otra sede ya recibió este traslado: no se puede anular';
  end if;
  -- D-132: si alguien ya empezó a contar, la caja está en la otra sede; eso se resuelve contando, no anulando.
  if exists (select 1 from transferencia_recepciones where transferencia_id = p_transferencia_id) then
    raise exception 'La otra sede ya empezó a contar este traslado: no se puede anular. Que terminen de contarlo; lo que no llegó lo cierra un líder';
  end if;
  if v_motivo is null then
    raise exception 'Escribe por qué anulas el envío (por ejemplo: «se envió a la sede equivocada»)';
  end if;

  v_persona := retail.fn_actor_persona_id(true);

  for ti in select * from transferencia_items where transferencia_id = p_transferencia_id order by variante_id loop
    -- La prenda vuelve a donde estaba: la sububicación de SU movimiento de salida (no la por defecto de hoy).
    select * into v_salida from movimientos
     where id = coalesce(ti.movimiento_id,
                         (select m.id from movimientos m where m.transferencia_item_id = ti.id and m.tipo = 'salida' order by m.created_at limit 1));
    if not found then
      raise exception 'Una prenda de este traslado no tiene registrada su salida: no se puede anular solo, pide ayuda a un líder';
    end if;
    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, transferencia_item_id, usuario_id, nota)
      values (ti.variante_id, t.ubicacion_origen_id, v_salida.sububicacion_id,
              'entrada', v_salida.cantidad, 'traslado_anulado', ti.id, v_persona, left('Envío anulado: ' || v_motivo, 500))
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);
  end loop;

  update transferencias
     set estado = 'anulada', anulado_por = v_persona, anulado_en = now(), motivo_anulacion = v_motivo
   where id = p_transferencia_id;

  -- ADR-0233: el pedido para apartar que iba en este envío vuelve a esperar que lo envíen (de nuevo, con otro traslado).
  update separacion_pedidos
     set estado = 'pedido', transferencia_id = null, enviado_por = null
   where transferencia_id = p_transferencia_id and estado = 'en_camino';

  return p_transferencia_id;
end;
$$;

comment on function retail.anular_traslado(uuid, text, uuid) is
  'ADR-0238 (D-132): anula un envío en camino que nadie empezó a contar. Quien opera la sede de origen o un líder; motivo obligatorio. Cada prenda vuelve a la sububicación de la que salió (entrada/traslado_anulado, enlazada a su línea). Con token, un segundo intento devuelve el mismo id sin mover nada.';

-- ---------------------------------------------------------------------------
-- 7. Las líneas del traslado: con el código de la etiqueta y si ya entró
-- ---------------------------------------------------------------------------
drop function if exists retail.fn_traslado_lineas(uuid);
create or replace function retail.fn_traslado_lineas(p_transferencia_id uuid)
returns table (variante_id uuid, sku text, referencia text, talla text, color text, cantidad_enviada integer,
               cantidad_recibida integer, diferencia integer, codigo text, ingresado boolean)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(ti.variante_id, tr.variante_id), va.sku, p.referencia, ta.valor, co.nombre,
         ti.cantidad, tr.cantidad_recibida, coalesce(tr.cantidad_recibida, 0) - coalesce(ti.cantidad, 0),
         -- El código impreso en la etiqueta (`variantes.codigo`, que también está en `codigos_barras`); si la prenda no lo
         -- tiene, su primer código de barras (el mismo criterio que la revisión de Conteo).
         coalesce(va.codigo, (select cb.codigo from codigos_barras cb where cb.variante_id = va.id order by cb.created_at, cb.codigo limit 1)),
         tr.movimiento_id is not null
  from transferencia_items ti
  full join transferencia_recepciones tr
    on tr.transferencia_id = ti.transferencia_id and tr.variante_id = ti.variante_id
  join variantes va on va.id = coalesce(ti.variante_id, tr.variante_id)
  join productos p on p.id = va.producto_id
  left join tallas ta on ta.id = va.talla_id
  left join colores co on co.codigo = va.color_codigo
  where coalesce(ti.transferencia_id, tr.transferencia_id) = p_transferencia_id
    and exists (select 1 from transferencias t where t.id = p_transferencia_id
      and (fn_puede_operar_ubicacion(t.ubicacion_origen_id) or fn_puede_operar_ubicacion(t.ubicacion_destino_id)));
$$;

-- ---------------------------------------------------------------------------
-- 8. Los lectores del historial: `traslado_anulado` es parte de su traslado
-- ---------------------------------------------------------------------------
-- Reemplaza un trozo de una función viva exactamente `p_veces` veces y aborta si no aparece esas veces (la función
-- cambió desde que se escribió esto). La marca, que va dentro del texto nuevo, la vuelve re-pegable.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: el texto a reemplazar aparece % veces (se esperaban %). Regenera el reemplazo desde su definición real.',
      p_firma, v_n, p_veces;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- Movimientos: la categoría «Traslados», la sede de origen → destino del traslado y el filtro. El número del traslado
-- ya viaja solo (el movimiento cuelga de su línea por `transferencia_item_id`).
select pg_temp.reemplazar(
  'retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamp with time zone, uuid, integer, uuid)',
  $v$m.motivo in ('traslado_salida', 'traslado_entrada')$v$,
  $n$m.motivo in ('traslado_salida', 'traslado_entrada', 'traslado_anulado')$n$,
  6, $m$'traslado_anulado'$m$
);
select pg_temp.reemplazar(
  'retail.fn_movimientos_resumen(uuid, date, date, text, text, uuid, uuid)',
  $v$m.motivo in ('traslado_salida', 'traslado_entrada')$v$,
  $n$m.motivo in ('traslado_salida', 'traslado_entrada', 'traslado_anulado')$n$,
  1, $m$'traslado_anulado'$m$
);
select pg_temp.reemplazar(
  'retail.fn_movimientos_resumen_procesos(uuid, date, date, text, text, uuid, uuid)',
  $v$m.motivo in ('traslado_salida', 'traslado_entrada')$v$,
  $n$m.motivo in ('traslado_salida', 'traslado_entrada', 'traslado_anulado')$n$,
  1, $m$'traslado_anulado'$m$
);

-- Balance: lo que volvió al origen no es una «entrada sin asiento» (su salida tampoco era una «salida sin asiento»)...
select pg_temp.reemplazar(
  'retail.fn_bal_causas_mercaderia(date, date)',
  $v$not in ('recepcion', 'produccion', 'traslado_entrada', 'devolucion', 'cambio', 'anulacion_venta')$v$,
  $n$not in ('recepcion', 'produccion', 'traslado_entrada', 'traslado_anulado', 'devolucion', 'cambio', 'anulacion_venta')$n$,
  1, $m$'traslado_anulado'$m$
);
-- ...y un traslado anulado deja de estar «en tránsito» desde el momento en que se anuló (antes, sí lo estaba).
select pg_temp.reemplazar(
  'retail.fn_bal_transito(date)',
  $v$and not (t.cerrado_en is not null and t.cerrado_en < fin.t)$v$,
  $n$and not (t.cerrado_en is not null and t.cerrado_en < fin.t)
     and not (t.anulado_en is not null and t.anulado_en < fin.t)$n$,
  1, $m$t.anulado_en$m$
);

-- ---------------------------------------------------------------------------
-- 9. Permisos: solo sesiones con cuenta; nada abierto a anon
-- ---------------------------------------------------------------------------
revoke all on function retail.registrar_recepcion_traslado(uuid, uuid, integer) from public, anon;
revoke all on function retail.confirmar_traslado(uuid, text) from public, anon;
revoke all on function retail.cerrar_traslado_con_diferencia(uuid, text) from public, anon;
revoke all on function retail.anular_traslado(uuid, text, uuid) from public, anon;
revoke all on function retail.fn_traslado_lineas(uuid) from public, anon;
grant execute on function retail.registrar_recepcion_traslado(uuid, uuid, integer) to authenticated;
grant execute on function retail.confirmar_traslado(uuid, text) to authenticated;
grant execute on function retail.cerrar_traslado_con_diferencia(uuid, text) to authenticated;
grant execute on function retail.anular_traslado(uuid, text, uuid) to authenticated;
grant execute on function retail.fn_traslado_lineas(uuid) to authenticated;

notify pgrst, 'reload schema';
