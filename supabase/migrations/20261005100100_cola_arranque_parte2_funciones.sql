-- ============================================================================
-- 20261005100100_cola_arranque_parte2_funciones.sql — CAYLA V2 (ADR-0334, Felipe 2026-10-04)
-- «Cerrar la cola de arranque»: PARTE 2 de 3 — la función que cierra, los dos candados que ya existían y la Actividad.
-- Va DESPUÉS de la parte 1 y ANTES de la 3. Sin políticas: solo `create or replace` (no toma candados de `auth`/`storage`).
--
-- CONTRATO de `cerrar_cola_arranque(p_ubicacion_id, p_hasta, p_motivo, p_nota)`.
--   PROMETE: cierra TODAS las ventas sin registrar pendientes de esa sede vendidas hasta `p_hasta`, o ninguna (una transacción),
--            y devuelve el id del cierre. No mueve stock, no toca el dinero de la venta ni la línea de la venta.
--   ASUME:   que `p_hasta` es el instante que el líder VIO en la hoja (la pantalla se lo manda): lo que entre después no se cierra
--            sin que nadie lo haya visto. Que la sede tiene plazo vigente (`cola_arranque_plazo`).
--   EXIGE:   cuenta de LÍDER (`fn_es_lider`, la cuenta y no el responsable: una terminal nunca), que opere esa sede, un motivo
--            de la lista cerrada y al menos una venta pendiente.
-- TRANSACCIÓN: el bloqueo de las filas, el registro del cierre y el cambio de estado van juntos. Un `regularizar_prenda` a la vez
--   sobre una fila espera a esta función (o ella a él): quien llega segundo ve que la fila ya no está pendiente, nunca la pisa.
--
-- SE ROMPE SI: el líder cierra y al día siguiente una cliente devuelve esa prenda. `fn_exige_prenda_regularizada` sigue bloqueando
--   cambios y devoluciones de una fila cerrada; la salida es «reabrir» (migración siguiente, solo líder).
--
-- PRODUCCIÓN: pegar con OK de Felipe, tras la parte 1. Ya lleva `retail.`. Se puede pegar dos veces.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Cerrar la cola de una sede ----------
create or replace function retail.cerrar_cola_arranque(p_ubicacion_id uuid, p_hasta timestamptz, p_motivo text, p_nota text default null)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_plazo date;
  v_ids uuid[];
  v_filas integer;
  v_soles numeric(12, 2);
  v_cierre uuid;
begin
  -- El permiso se mira ANTES de la firma: quien no es líder recibe siempre este mensaje, no uno de «elige quién hace esto».
  if not fn_es_lider() then
    raise exception 'cola_solo_lider' using errcode = '42501', hint = 'Solo un líder puede cerrar la cola de arranque de una tienda';
  end if;
  v_persona := fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'cola_sin_persona' using errcode = '42501', hint = 'No se sabe quién cierra la cola: entra con tu cuenta';
  end if;
  if p_ubicacion_id is null or not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'cola_sin_permiso_sede' using errcode = '42501', hint = 'No tienes permiso para cerrar la cola de esa tienda';
  end if;
  if p_motivo is null or p_motivo not in ('no_se_sabe', 'aun_no_cargada', 'ultima_unidad') then
    raise exception 'cola_motivo_invalido' using hint = 'Elige por qué se cierran sin identificar la prenda';
  end if;
  if p_hasta is null or p_hasta > now() then
    raise exception 'cola_corte_invalido' using hint = 'El corte tiene que ser un momento que ya pasó';
  end if;

  select hasta into v_plazo from cola_arranque_plazo where ubicacion_id = p_ubicacion_id;
  if not found then
    raise exception 'cola_sin_plazo' using hint = 'Esta tienda no tiene plazo abierto para cerrar su cola de arranque';
  end if;
  if fn_hoy_lima() > v_plazo then
    raise exception 'cola_plazo_vencido' using hint = 'El plazo para cerrar la cola de esta tienda ya venció';
  end if;

  -- Se bloquean en orden de id (sin deadlock con `regularizar_prenda`, que toma una sola fila) y se cuenta lo bloqueado: lo que
  -- se cierra es EXACTAMENTE este conjunto, aunque otra venta se confirme mientras tanto.
  with bloqueadas as (
    select p.id, p.precio_cobrado
      from prendas_por_regularizar p
     where p.ubicacion_id = p_ubicacion_id and p.estado = 'pendiente' and p.vendido_en <= p_hasta
     order by p.id
       for update
  )
  select array_agg(id), count(*), coalesce(sum(precio_cobrado), 0) into v_ids, v_filas, v_soles from bloqueadas;

  if v_filas = 0 then
    raise exception 'cola_vacia' using hint = 'No hay ventas sin registrar pendientes hasta ese momento';
  end if;

  insert into cierres_cola_arranque (ubicacion_id, corte, motivo, nota, filas, soles, cerrado_por)
    values (p_ubicacion_id, p_hasta, p_motivo, nullif(btrim(p_nota), ''), v_filas, v_soles, v_persona)
    returning id into v_cierre;

  update prendas_por_regularizar set estado = 'cerrada_sin_prenda', cierre_id = v_cierre where id = any(v_ids);

  return v_cierre;
end;
$$;

comment on function retail.cerrar_cola_arranque(uuid, timestamptz, text, text) is
  'ADR-0334: un líder cierra en bloque las ventas sin registrar pendientes de una sede (hasta p_hasta), sin identificar la prenda y sin mover stock. Dentro del plazo de cola_arranque_plazo. Devuelve el id del cierre.';
revoke all on function retail.cerrar_cola_arranque(uuid, timestamptz, text, text) from public, anon;
grant execute on function retail.cerrar_cola_arranque(uuid, timestamptz, text, text) to authenticated;

-- ---------- 2. Cambios y devoluciones: una venta cerrada sigue bloqueada ----------
-- Antes solo miraba `pendiente`: con el estado nuevo, una devolución de una venta cerrada habría dejado la prenda volver a un stock
-- que no se sabe cuál es. Mismo candado, dos mensajes: cada uno dice lo que SÍ se puede hacer.
create or replace function retail.fn_exige_prenda_regularizada()
returns trigger
language plpgsql
security definer
set search_path = retail, public
as $$
declare
  v_estado text;
begin
  select estado into v_estado from prendas_por_regularizar
    where venta_item_id = new.venta_item_id and estado in ('pendiente', 'cerrada_sin_prenda');
  if v_estado = 'pendiente' then
    raise exception 'prenda_sin_regularizar'
      using hint = 'Pide a almacén que regularice esta prenda (Existencias ▸ Ventas sin registrar) antes de cambiarla o devolverla';
  elsif v_estado = 'cerrada_sin_prenda' then
    raise exception 'prenda_cerrada_sin_prenda'
      using hint = 'Esa venta se cerró sin identificar la prenda. Pide a un líder que la reabra (Existencias ▸ Ventas sin registrar) antes de cambiarla o devolverla';
  end if;
  return new;
end;
$$;

-- ---------- 3. Anular la venta: también saca de la cola lo que estaba cerrado ----------
create or replace function retail.fn_prendas_por_regularizar_al_anular()
returns trigger
language plpgsql
security definer
set search_path = retail, public
as $$
begin
  if new.estado = 'anulada' and old.estado is distinct from 'anulada' then
    update prendas_por_regularizar p set estado = 'anulada'
      from venta_items vi
      where vi.id = p.venta_item_id and vi.venta_id = new.id and p.estado in ('pendiente', 'cerrada_sin_prenda');
  end if;
  return new;
end;
$$;

-- ---------- 4. Actividad: UNA línea por cierre (no una por prenda) ----------
create or replace function retail.fn_actividad_cierre_cola(p_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  r retail.cierres_cola_arranque;
begin
  select * into r from retail.cierres_cola_arranque where id = p_id;
  if r.id is null then return; end if;
  perform retail.fn_actividad_anotar(
    'existencias', 'cola_arranque_cerrada',
    'cerró la cola de arranque de ' || retail.fn_actividad_sede_nombre(r.ubicacion_id) || ': '
      || r.filas || case when r.filas = 1 then ' prenda vendida sin registrar' else ' prendas vendidas sin registrar' end
      || ' (' || retail.fn_actividad_soles(r.soles) || ') sin identificar — '
      || case r.motivo
           when 'no_se_sabe' then 'nadie recuerda cuál era'
           when 'aun_no_cargada' then 'la prenda aún no está cargada en el sistema'
           else 'se vendió la última unidad de un modelo que nadie cargó'
         end,
    r.cerrado_por, case when p_origen = 'vivo' then retail.fn_actividad_terminal_ahora() end, r.ubicacion_id, null,
    'cierres_cola_arranque', r.id::text, r.cerrado_en,
    jsonb_build_object('motivo', r.motivo, 'filas', r.filas, 'soles', r.soles, 'corte', r.corte, 'nota', r.nota),
    p_origen);
end;
$fn$;

-- Envuelto como los demás disparadores de Actividad: un error del historial nunca detiene el cierre.
create or replace function retail.trg_actividad_cierre_cola() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
begin
  begin
    perform retail.fn_actividad_cierre_cola(new.id);
  exception when others then
    raise warning 'actividad: no se anotó el cierre de cola % (%)', new.id, sqlerrm;
  end;
  return null;
end;
$fn$;

create or replace trigger trg_actividad_cierre_cola
  after insert on retail.cierres_cola_arranque
  for each row execute function retail.trg_actividad_cierre_cola();

revoke all on function retail.fn_actividad_cierre_cola(uuid, text) from public, anon, authenticated;
revoke all on function retail.trg_actividad_cierre_cola() from public, anon, authenticated;
revoke all on function retail.fn_exige_prenda_regularizada() from public, anon, authenticated;
revoke all on function retail.fn_prendas_por_regularizar_al_anular() from public, anon, authenticated;

-- ---------- 5. Sin combo «Responsable»: la cuenta del líder firma (como `regularizar_prenda`, ADR-0280) ----------
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('cola_arranque_cerrar', 'Cerrar la cola de arranque de ventas sin registrar de una tienda')
on conflict (clave) do nothing;

-- ---------- 6. Validación final: si algo no quedó, se deshace todo ----------
do $v$
begin
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'cerrar_cola_arranque') <> 1 then
    raise exception 'cola de arranque: debe haber una sola cerrar_cola_arranque';
  end if;
  if pg_get_functiondef('retail.fn_exige_prenda_regularizada()'::regprocedure) not like '%cerrada_sin_prenda%' then
    raise exception 'cola de arranque: fn_exige_prenda_regularizada no quedó';
  end if;
  if pg_get_functiondef('retail.fn_prendas_por_regularizar_al_anular()'::regprocedure) not like '%cerrada_sin_prenda%' then
    raise exception 'cola de arranque: el disparador de anular no quedó';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_actividad_cierre_cola' and tgenabled = 'O' and not tgisinternal) then
    raise exception 'cola de arranque: falta el disparador de Actividad';
  end if;
  -- Los dos disparadores de la cola siguen vivos (los creó 20260923161700; aquí solo se reemplazó su función).
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O'
        and tgname in ('trg_prendas_por_regularizar_al_anular', 'trg_cambios_exige_regularizada', 'trg_devolucion_items_exige_regularizada')) <> 3 then
    raise exception 'cola de arranque: algún disparador de la cola quedó apagado';
  end if;
end
$v$;
