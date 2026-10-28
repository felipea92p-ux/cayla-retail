-- ============================================================================
-- 20261015151000_apartados_aplazar_y_detalle.sql — CAYLA V2 (ADR-0414, Felipe 2026-10-15)
--
-- EL PROBLEMA PRIMERO. En Apartados ▸ Historial cada fila decía «S/60.00 de S/89.90 · 1 abono», pero no había dónde ver
-- CUÁNDO pagó cada cosa, con qué medio ni quién lo cobró: si un abono no cuadraba en la caja, nadie sabía a quién
-- preguntar. Y el plazo solo se estiraba de una forma: +7 días, una sola vez y solo después de vencer (D3, 2026-09-22).
-- El cliente que dice «vuelvo el sábado» o «la recojo en 3 días» no tenía cómo.
--
-- LA DECISIÓN (Felipe, 2026-10-15).
--   · Aplazar: +3 días, +7 días o una fecha elegida, en cualquier momento mientras el apartado está abierto. Con tope, para
--     que la prenda no quede fuera del piso para siempre: como mucho 2 aplazamientos y nunca más allá de 30 días desde el
--     día en que se apartó.
--   · Cada aplazamiento queda anotado (de qué fecha a cuál, cuándo y quién), y el detalle muestra quién cobró cada pago.
--
-- CONTRATO (Liskov)
--   aplazar_separacion(p_separacion_id, p_vence_el) → date
--     PROMETE: mueve `vence_el` del apartado y de sus reservas por prenda (`apartados`) a `p_vence_el`, suma 1 a
--              `extensiones` y anota la fila en `separacion_aplazamientos`, todo o nada. Repetir la misma llamada (doble clic,
--              reintento tras un corte) no cuenta dos veces: si el apartado ya vence ese día por un aplazamiento, devuelve
--              la fecha sin tocar nada.
--     ASUME:   quien llama puede gestionar la caja (líder o cuenta de ventas, como extender/liberar) y opera esa sede.
--     RECHAZA: apartado cerrado; 2 aplazamientos ya hechos; una fecha que no es posterior a hoy y al vencimiento actual;
--              una fecha más allá de 30 días desde que se apartó.
--   extender_separacion(p_separacion_id) → date
--     Sigue existiendo para las pestañas abiertas con la pantalla anterior: ahora es «aplazar 7 días» (mismas reglas).
--   fn_detalle_separacion(p_separacion_id) → jsonb (solo lectura)
--     PROMETE: el historial completo de un apartado (pagos con fecha y hora, medio y quién lo cobró; aplazamientos; avisos
--              por WhatsApp; entrega, liberación y devolución con quién y cuándo). NULL si no existe o no es de una sede
--              que la cuenta opera.
--
-- ESTADOS IMPOSIBLES (Lamport). Un aplazamiento hacia atrás o al mismo día (`separacion_aplazamientos_hacia_adelante`);
-- más de 2 aplazamientos (`separaciones_extensiones_check`, que pasa de ≤ 1 a ≤ 2). El tope de 30 días NO es un candado
-- de la tabla a propósito: «esperarla 2 o 3 días» al abonar (`abonar_separacion`) puede pasarlo y es legítimo; el tope es
-- de aplazar, y vive en la función que aplaza.
--
-- CÓMO SE PEGA. Una sola parte, idempotente, con `set lock_timeout = '3s'`. Sin políticas ni `drop trigger` (ADR-0195):
-- la tabla nueva solo la leen y escriben funciones `security definer` (RLS encendido sin políticas). El único `alter` es
-- el candado de `separaciones` (tabla chica: ~1 fila en producción al 2026-10-15). Los apartados extendidos antes de hoy
-- no tienen fila en `separacion_aplazamientos`: su `extensiones` (0 o 1) sigue contando y el detalle lo dice sin fecha.
-- ============================================================================
set lock_timeout = '3s';

-- 1. El historial de aplazamientos ----------------------------------------------------------------------------------
create table if not exists retail.separacion_aplazamientos (
  id uuid primary key default gen_random_uuid(),
  separacion_id uuid not null references retail.separaciones(id),
  vence_antes date not null,
  vence_despues date not null,
  creado_por uuid references public.personas(id),
  created_at timestamptz not null default now(),
  constraint separacion_aplazamientos_hacia_adelante check (vence_despues > vence_antes)
);

comment on table retail.separacion_aplazamientos is
  'Cada vez que se aplazó el vencimiento de un apartado (ADR-0414): de qué fecha a cuál, cuándo y quién.';

create index if not exists separacion_aplazamientos_separacion_idx on retail.separacion_aplazamientos (separacion_id, created_at);

alter table retail.separacion_aplazamientos enable row level security;
revoke all on table retail.separacion_aplazamientos from anon, authenticated;

-- 2. Hasta 2 aplazamientos (antes, 1) -------------------------------------------------------------------------------
alter table retail.separaciones drop constraint if exists separaciones_extensiones_check;
alter table retail.separaciones add constraint separaciones_extensiones_check check (extensiones >= 0 and extensiones <= 2);

-- 3. aplazar_separacion ---------------------------------------------------------------------------------------------
create or replace function retail.aplazar_separacion(p_separacion_id uuid, p_vence_el date)
returns date
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  s separaciones%rowtype;
  v_desde date;
  v_tope date;
begin
  if not fn_puede_gestionar_caja() then
    raise exception 'Solo una líder o la cuenta de ventas de la tienda puede aplazar un apartado' using errcode = '42501';
  end if;
  if p_vence_el is null then
    raise exception 'Elige hasta qué día se aplaza el apartado';
  end if;
  select * into s from separaciones where id = p_separacion_id for update;
  if not found then raise exception 'Ese apartado no existe'; end if;
  if not fn_puede_operar_ubicacion(s.ubicacion_id) then
    raise exception 'No tienes permiso sobre los apartados de esa tienda';
  end if;
  if s.estado <> 'abierta' then
    raise exception 'Solo se aplaza un apartado abierto (este está %)', s.estado;
  end if;
  -- La misma llamada dos veces (doble clic, reintento tras un corte): ya quedó, no cuenta otra vez.
  if s.vence_el = p_vence_el
     and exists (select 1 from separacion_aplazamientos a where a.separacion_id = s.id and a.vence_despues = p_vence_el) then
    return s.vence_el;
  end if;
  if s.extensiones >= 2 then
    raise exception 'El apartado % ya se aplazó 2 veces: no se puede aplazar más', s.codigo;
  end if;
  v_desde := greatest(s.vence_el, fn_hoy_lima());
  if p_vence_el <= v_desde then
    raise exception 'La nueva fecha tiene que ser después del %', to_char(v_desde, 'DD/MM/YYYY');
  end if;
  v_tope := (s.created_at at time zone 'America/Lima')::date + 30;
  if p_vence_el > v_tope then
    raise exception 'Un apartado se guarda como mucho 30 días desde que se apartó: hasta el %', to_char(v_tope, 'DD/MM/YYYY');
  end if;

  update separaciones set vence_el = p_vence_el, extensiones = extensiones + 1 where id = s.id;
  update apartados set vence_el = p_vence_el where separacion_id = s.id and estado = 'abierto';
  insert into separacion_aplazamientos (separacion_id, vence_antes, vence_despues, creado_por)
  values (s.id, s.vence_el, p_vence_el, fn_actor_persona_id(true));
  return p_vence_el;
end;
$$;

revoke all on function retail.aplazar_separacion(uuid, date) from public, anon;
grant execute on function retail.aplazar_separacion(uuid, date) to authenticated;

-- 4. extender_separacion = aplazar 7 días -----------------------------------------------------------------------------
create or replace function retail.extender_separacion(p_separacion_id uuid)
returns date
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_vence date;
begin
  v_vence := (select greatest(s.vence_el, fn_hoy_lima()) + 7 from separaciones s where s.id = p_separacion_id);
  if v_vence is null then raise exception 'Ese apartado no existe'; end if;
  return aplazar_separacion(p_separacion_id, v_vence);
end;
$$;

-- 5. fn_detalle_separacion: el historial de un apartado -------------------------------------------------------------
create or replace function retail.fn_detalle_separacion(p_separacion_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with nombres as (
    select p.id, nullif(btrim(coalesce(p.nombres, '') || ' ' || coalesce(p.apellidos, '')), '') as nombre
      from public.personas p
  )
  select jsonb_build_object(
    'id', s.id,
    'creada_en', s.created_at,
    'creada_por', (select n.nombre from nombres n where n.id = s.creado_por),
    'extensiones', s.extensiones,
    -- Lo cobrado antes de recoger: el adelanto (sin abono) y cada abono, con quien lo cobró.
    'pagos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', sp.id,
               'metodo', sp.metodo,
               'monto', sp.monto,
               'recibido', sp.recibido,
               'fecha', sp.created_at,
               'abono', sp.abono_id is not null,
               'dias_espera', coalesce(ab.dias_espera, 0),
               'vence_despues', case when coalesce(ab.dias_espera, 0) > 0 then ab.vence_despues end,
               'por', (select n.nombre from nombres n where n.id = coalesce(ab.creado_por, case when sp.abono_id is null then s.creado_por end))
             ) order by sp.created_at, sp.id)
        from separacion_pagos sp
        left join separacion_abonos ab on ab.id = sp.abono_id
       where sp.separacion_id = s.id), '[]'::jsonb),
    'aplazamientos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'vence_antes', a.vence_antes,
               'vence_despues', a.vence_despues,
               'fecha', a.created_at,
               'por', (select n.nombre from nombres n where n.id = a.creado_por)
             ) order by a.created_at)
        from separacion_aplazamientos a
       where a.separacion_id = s.id), '[]'::jsonb),
    'avisos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fecha', av.created_at,
               'por', (select n.nombre from nombres n where n.id = av.avisado_por)
             ) order by av.created_at)
        from separacion_avisos av
       where av.separacion_id = s.id), '[]'::jsonb),
    'entregada_en', s.entregada_en,
    'entregada_por', (select n.nombre from nombres n where n.id = s.entregada_por),
    'liberada_en', s.liberada_en,
    'liberada_por', (select n.nombre from nombres n where n.id = s.liberada_por),
    'liberada_motivo', s.liberada_motivo,
    'devuelta_en', s.devuelta_en,
    'devuelta_por', (select n.nombre from nombres n where n.id = s.devuelta_por),
    'devolucion_medio_real', s.devolucion_medio_real
  )
    from separaciones s
   where s.id = p_separacion_id
     and fn_puede_operar_ubicacion(s.ubicacion_id);
$$;

revoke all on function retail.fn_detalle_separacion(uuid) from public, anon;
grant execute on function retail.fn_detalle_separacion(uuid) to authenticated;
