-- Cierre con traslado y apertura verificada (ADR-0185, 2026-09-23 — spike docs/maquetas/caja-cierre-spike-2026-09/).
--
-- EL PROBLEMA. Al cerrar caja, el sistema guardaba cuánto se contó, pero no qué se hizo con ese efectivo: si se fue a
-- la caja fuerte, al banco o se le entregó al líder, y cuánto quedó en el cajón. Al día siguiente, quien abría escribía
-- un monto de memoria y nadie comparaba ese número con lo que había quedado. Un faltante de la noche terminaba
-- cargado a quien abría.
--
-- LA SALIDA, decidida por Felipe (2026-09-23):
--   1. Quien cierra VE el esperado desde el inicio (se deja el conteo ciego a pedido de Felipe). El número sale de
--      `fn_esperado_caja`, que usa el MISMO cálculo que `cerrar_caja` (`fn_calcular_esperado_caja`). Antes la
--      pantalla sumaba por su cuenta en `lib/caja.ts`, y esa suma ya se había desviado: contaba las ventas anuladas.
--   2. `cerrar_caja` recibe UN traslado opcional (monto + destino + referencia) y guarda en la misma transacción
--      cuánto queda en el cajón (`cajas.monto_fondo` = contado − trasladado). Destinos: caja fuerte, depósito
--      bancario y entregado al líder. «Otra sede» queda para después, porque necesita acuse de recibo.
--   3. `abrir_caja` compara lo que se abre con el `monto_fondo` del último cierre de la sede. Si no coincide, exige un
--      motivo, lo guarda y la diferencia le aparece al líder en Inicio hasta que la marca como revisada.
--
-- Todo lo nuevo es de solo agregar: un traslado no se edita ni se borra. Para corregirlo se registra un ingreso o
-- egreso de caja, como cualquier corrección de efectivo (ADR-0056).

-- ── 1. Columnas nuevas en `cajas` ─────────────────────────────────────────────────────────────────────────────────
alter table retail.cajas
  add column if not exists monto_fondo numeric(12,2),
  add column if not exists monto_apertura_esperado numeric(12,2),
  add column if not exists motivo_diferencia_apertura text,
  add column if not exists apertura_revisada_por uuid,
  add column if not exists apertura_revisada_en timestamptz;

comment on column retail.cajas.monto_fondo is
  'Efectivo que quedó en el cajón al cerrar: contado − trasladado (ADR-0185). La apertura siguiente de la sede lo usa como «lo que debería haber». NULL en cierres anteriores a ADR-0185.';
comment on column retail.cajas.monto_apertura_esperado is
  'monto_fondo del último cierre de la sede al momento de abrir (ADR-0185). NULL si no había con qué comparar.';
comment on column retail.cajas.motivo_diferencia_apertura is
  'Por qué se abrió con un monto distinto del esperado. Obligatorio si difieren (candado caja_apertura_explica_diferencia).';

-- Principio 2: una apertura que no coincide sin explicación es un estado imposible, no una validación de pantalla.
alter table retail.cajas drop constraint if exists caja_apertura_explica_diferencia;
alter table retail.cajas add constraint caja_apertura_explica_diferencia check (
  monto_apertura_esperado is null
  or abs(monto_apertura - monto_apertura_esperado) < 0.01
  or length(btrim(coalesce(motivo_diferencia_apertura, ''))) >= 3
);

-- ── 2. Traslados del cierre ──────────────────────────────────────────────────────────────────────────────────────
create table if not exists retail.caja_traslados (
  id uuid primary key default gen_random_uuid(),
  caja_id uuid not null references retail.cajas(id),
  destino text not null check (destino in ('caja_fuerte', 'banco', 'lider')),
  monto numeric(12,2) not null check (monto > 0),
  -- Depósito: n.º de operación del voucher. Líder: quién lo recibió. Caja fuerte: opcional.
  referencia text,
  registrado_por uuid,
  creado_en timestamptz not null default now(),
  constraint caja_traslados_referencia check (destino = 'caja_fuerte' or length(btrim(coalesce(referencia, ''))) >= 2)
);
create index if not exists caja_traslados_caja_idx on retail.caja_traslados (caja_id);

comment on table retail.caja_traslados is
  'A dónde fue el efectivo contado al cerrar una caja (ADR-0185). Solo se escribe desde cerrar_caja; no se edita ni borra.';

alter table retail.caja_traslados enable row level security;
revoke all on table retail.caja_traslados from public, anon, authenticated;
grant select on table retail.caja_traslados to authenticated;
drop policy if exists caja_traslados_select on retail.caja_traslados;
-- Misma visibilidad que `caja_movimientos`: el líder ve todo; el resto, su sede.
create policy caja_traslados_select on retail.caja_traslados for select to authenticated using (
  exists (
    select 1 from retail.cajas c
    where c.id = caja_traslados.caja_id
      and coalesce((select retail.fn_es_lider()) or c.ubicacion_id = (select retail.fn_ubicacion_actual_persona()), false)
  )
);

-- ── 3. El esperado, en un solo lugar ──────────────────────────────────────────────────────────────────────────────
-- Interna (sin permisos propios, no se expone): la usan `cerrar_caja` y `fn_esperado_caja`.
create or replace function retail.fn_calcular_esperado_caja(p_caja_id uuid)
returns table(apertura numeric, ventas_efectivo numeric, ingresos numeric, egresos numeric,
              reembolsos_efectivo numeric, cambios_efectivo numeric, esperado numeric)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_apertura numeric;
  v_ventas numeric;
  v_ingresos numeric;
  v_egresos numeric;
  v_reembolsos numeric;
  v_cambios numeric;
begin
  select c.monto_apertura into v_apertura from cajas c where c.id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id;
  end if;

  -- Una venta anulada devolvió su dinero a la clienta: su efectivo ya no está en el cajón y no se espera.
  select coalesce(sum(vp.monto), 0) into v_ventas
    from venta_pagos vp join ventas v on v.id = vp.venta_id
    where v.caja_id = p_caja_id and vp.metodo = 'efectivo' and v.estado <> 'anulada';

  select coalesce(sum(m.monto) filter (where m.tipo = 'ingreso'), 0),
         coalesce(sum(m.monto) filter (where m.tipo = 'egreso'), 0)
    into v_ingresos, v_egresos
    from caja_movimientos m where m.caja_id = p_caja_id;

  select coalesce(sum(d.reembolso_monto), 0) into v_reembolsos
    from devoluciones d
    where d.caja_id = p_caja_id and d.estado = 'aprobada' and d.reembolso_metodo = 'efectivo';

  -- `cambios.diferencia` ya trae el signo: positiva suma, negativa resta.
  select coalesce(sum(cb.diferencia), 0) into v_cambios
    from cambios cb
    where cb.caja_id = p_caja_id and cb.metodo_pago_diferencia = 'efectivo';

  return query select v_apertura, v_ventas, v_ingresos, v_egresos, v_reembolsos, v_cambios,
                      v_apertura + v_ventas + v_ingresos - v_egresos - v_reembolsos + v_cambios;
end;
$$;
revoke all on function retail.fn_calcular_esperado_caja(uuid) from public, anon, authenticated;

-- Pública: solo quien puede cerrar esa caja ve cuánto espera el sistema (ADR-0185 lo muestra desde el inicio del cierre).
create or replace function retail.fn_esperado_caja(p_caja_id uuid)
returns table(apertura numeric, ventas_efectivo numeric, ingresos numeric, egresos numeric,
              reembolsos_efectivo numeric, cambios_efectivo numeric, esperado numeric)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_ubicacion uuid;
begin
  if not fn_puede_gestionar_caja() then
    raise exception 'Solo quien puede cerrar la caja ve el monto esperado' using errcode = '42501';
  end if;
  select c.ubicacion_id into v_ubicacion from cajas c where c.id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id;
  end if;
  if not fn_puede_operar_ubicacion(v_ubicacion) then
    raise exception 'No tienes permiso sobre esa caja' using errcode = '42501';
  end if;
  return query select * from fn_calcular_esperado_caja(p_caja_id);
end;
$$;
revoke all on function retail.fn_esperado_caja(uuid) from public, anon;
grant execute on function retail.fn_esperado_caja(uuid) to authenticated;

-- ── 4. cerrar_caja con traslado ──────────────────────────────────────────────────────────────────────────────────
-- Parte de la definición real de producción (2026-09-23). Cambia la firma, así que primero se borra la vieja; si no,
-- `create` dejaría dos versiones y la llamada de la pantalla quedaría ambigua (ADR-0009).
drop function if exists retail.cerrar_caja(uuid, numeric);
create or replace function retail.cerrar_caja(
  p_caja_id uuid,
  p_monto_real numeric,
  p_traslado_monto numeric default 0,
  p_traslado_destino text default null,
  p_traslado_referencia text default null
)
returns table(monto_sistema numeric, monto_real numeric, diferencia numeric, monto_trasladado numeric, monto_fondo numeric)
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_caja cajas%rowtype;
  v_sistema numeric;
  v_traslado numeric := coalesce(p_traslado_monto, 0);
  v_fondo numeric;
  v_persona uuid;
begin
  -- CANDADO DE LÍDER (D-13, 2026-09-21): va primero, antes de mirar si la caja existe.
  if not fn_puede_gestionar_caja() then
    raise exception 'Solo un líder de equipo puede cerrar la caja' using errcode = '42501';
  end if;

  select * into v_caja from cajas where id = p_caja_id for update;
  if not found then
    raise exception 'La caja % no existe', p_caja_id;
  end if;
  if not fn_puede_operar_ubicacion(v_caja.ubicacion_id) then
    raise exception 'No tienes permiso para cerrar esa caja';
  end if;
  if v_caja.estado <> 'abierta' then
    raise exception 'Esta caja ya está cerrada';
  end if;
  if p_monto_real < 0 then
    raise exception 'El monto contado no puede ser negativo';
  end if;
  if v_traslado < 0 then
    raise exception 'El monto a trasladar no puede ser negativo';
  end if;
  if v_traslado > p_monto_real then
    raise exception 'No puedes trasladar más de lo que contaste (S/ %)', to_char(p_monto_real, 'FM999999990.00');
  end if;
  if v_traslado > 0 then
    if p_traslado_destino is null or p_traslado_destino not in ('caja_fuerte', 'banco', 'lider') then
      raise exception 'Elige a dónde va el efectivo que trasladas';
    end if;
    if p_traslado_destino = 'banco' and length(btrim(coalesce(p_traslado_referencia, ''))) < 2 then
      raise exception 'Escribe el número de operación del depósito';
    end if;
    if p_traslado_destino = 'lider' and length(btrim(coalesce(p_traslado_referencia, ''))) < 2 then
      raise exception 'Escribe a quién le entregaste el efectivo';
    end if;
  end if;

  select e.esperado into v_sistema from fn_calcular_esperado_caja(p_caja_id) e;
  v_persona := retail.fn_actor_persona_id(true);
  v_fondo := p_monto_real - v_traslado;

  if v_traslado > 0 then
    insert into caja_traslados (caja_id, destino, monto, referencia, registrado_por)
    values (p_caja_id, p_traslado_destino, v_traslado, nullif(btrim(p_traslado_referencia), ''), v_persona);
  end if;

  update cajas set
    estado = 'cerrada',
    monto_cierre_sistema = v_sistema,
    monto_cierre_real = p_monto_real,
    diferencia = p_monto_real - v_sistema,
    monto_fondo = v_fondo,
    cerrada_por = v_persona,
    -- clock_timestamp y no now(): `abrir_caja` busca el ÚLTIMO cierre de la sede por esta hora, y now() es la del
    -- inicio de la transacción (dos cierres en una misma transacción empatarían).
    cerrada_en = clock_timestamp()
  where id = p_caja_id;

  return query select v_sistema, p_monto_real, p_monto_real - v_sistema, v_traslado, v_fondo;
end;
$$;
revoke all on function retail.cerrar_caja(uuid, numeric, numeric, text, text) from public, anon;
grant execute on function retail.cerrar_caja(uuid, numeric, numeric, text, text) to authenticated;

-- ── 5. abrir_caja que compara con el último cierre ────────────────────────────────────────────────────────────────
drop function if exists retail.abrir_caja(uuid, numeric);
create or replace function retail.abrir_caja(p_ubicacion_id uuid, p_monto_apertura numeric, p_motivo_diferencia text default null)
returns uuid
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_caja_id uuid;
  v_persona uuid;
  v_esperado numeric;
  v_motivo text := nullif(btrim(p_motivo_diferencia), '');
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para abrir caja en esa ubicación';
  end if;
  if p_monto_apertura < 0 then
    raise exception 'El monto de apertura no puede ser negativo';
  end if;

  -- Lo que quedó en el cajón en el último cierre real de la sede. Los cierres de antes de ADR-0185 no lo tienen
  -- (NULL): no hay con qué comparar y no se exige motivo.
  select c.monto_fondo into v_esperado
    from cajas c
    where c.ubicacion_id = p_ubicacion_id and c.estado = 'cerrada' and not c.es_prueba
    order by c.cerrada_en desc
    limit 1;

  if v_esperado is not null and abs(p_monto_apertura - v_esperado) >= 0.01 and length(coalesce(v_motivo, '')) < 3 then
    raise exception 'El cajón debería tener S/ % según el último cierre. Escribe qué pasó para abrir con otro monto.',
      to_char(v_esperado, 'FM999999990.00');
  end if;

  v_persona := retail.fn_actor_persona_id(true);
  insert into cajas (ubicacion_id, monto_apertura, abierta_por, monto_apertura_esperado, motivo_diferencia_apertura)
    values (p_ubicacion_id, p_monto_apertura, v_persona, v_esperado,
            case when v_esperado is not null and abs(p_monto_apertura - v_esperado) >= 0.01 then v_motivo end)
    returning id into v_caja_id;
  return v_caja_id;
end;
$$;
revoke all on function retail.abrir_caja(uuid, numeric, text) from public, anon;
grant execute on function retail.abrir_caja(uuid, numeric, text) to authenticated;

-- ── 6. El líder marca como revisada una apertura con diferencia ───────────────────────────────────────────────────
create or replace function retail.revisar_apertura_caja(p_caja_id uuid)
returns void
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder de equipo puede dar por revisada una apertura' using errcode = '42501';
  end if;
  update cajas set apertura_revisada_por = retail.fn_actor_persona_id(false), apertura_revisada_en = now()
    where id = p_caja_id
      and monto_apertura_esperado is not null
      and abs(monto_apertura - monto_apertura_esperado) >= 0.01
      and apertura_revisada_en is null;
  if not found then
    raise exception 'Esa apertura no tiene una diferencia pendiente de revisar';
  end if;
end;
$$;
revoke all on function retail.revisar_apertura_caja(uuid) from public, anon;
grant execute on function retail.revisar_apertura_caja(uuid) to authenticated;
