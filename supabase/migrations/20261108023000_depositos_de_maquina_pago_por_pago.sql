-- ADR-0629, Fase B, actividad 4: el depósito de una máquina, pago por pago.
--
-- EL PROBLEMA. El QR de Izipay llega a Interbank Empresas suelto, un abono por cada pago («Abono QR IBK»), con las tiendas mezcladas. El
-- ERP solo sabía depositar un DÍA entero (tienda y medio): si de 30 QR llegaron 29, había que registrar el día completo e inventar una
-- comisión, o no registrar nada. Y cuando llegaba el que faltaba, nadie sabía cuál era.
--
-- LO QUE SE AGREGA (la web empareja el extracto con estos pagos y pide registrar lo que llegó):
--   1. `fn_pos_comision_pago`: la comisión de UN pago como la cobra la máquina (comisión redondeada, IGV sobre la comisión redondeada,
--      cargo fijo; 0 en los días gratis de la tarifa). Es la misma cuenta que `fn_pos_comision_lote` hace pago por pago para un día.
--   2. `pos_abonos_pagos`: qué pagos cubrió cada depósito. No es un movimiento por pago (el ADR-0629 lo descartó): el depósito sigue
--      siendo uno, y esto es su lista. Solo agrega filas; anular el depósito libera sus pagos.
--   3. `fn_pos_pagos_por_depositar`: los pagos de una máquina entre dos fechas, cada uno con su hora, su tienda, lo que debería llegar
--      al banco (con la tarifa de su medio y, para un lote de tarjeta, con la de tarjeta) y si ya está en un depósito.
--   4. `registrar_abono_pos_pagos`: registra el depósito de esos pagos. Por cada día (tienda y medio) guarda lo que cubren en
--      `pos_abonos_lotes` (un bruto parcial: el residuo de la Fase A hace el resto) y la lista en `pos_abonos_pagos`.
--
-- UN DÍA CON UN DEPÓSITO SIN DETALLE (todos los anteriores a esta migración) no entra al pago por pago: no se sabe qué pagos cubrió, y
-- adivinarlo depositaría dos veces el mismo QR. Ese día se sigue cuadrando con «Cuadrar depósitos» (`dia_sin_detalle`).
--
-- Sin políticas: la tabla nueva solo se lee y escribe por funciones `security definer` (regla de «Políticas y deadlocks»). Se pega en
-- una sola parte: no hay `alter` de tablas en uso ni `create policy`.

set lock_timeout = '3s';

-- ---------- 1. La comisión de un pago ----------
create or replace function retail.fn_pos_comision_pago(p_maquina_id uuid, p_medio text, p_monto numeric, p_fecha date)
returns numeric
language sql stable set search_path = retail, public, extensions as $$
  select case when t.id is null then null
              when extract(day from p_fecha) <= t.gratis_hasta_dia then 0
         else round(p_monto * t.tasa_pct / 100, 2)
              + case when t.igv_sobre_tasa then round(round(p_monto * t.tasa_pct / 100, 2) * retail.fn_tasa_igv(p_fecha), 2) else 0 end
              + t.cargo_fijo end
    from (select (retail.fn_pos_tarifa(p_maquina_id, p_medio, p_fecha)).*) t;
$$;
comment on function retail.fn_pos_comision_pago(uuid, text, numeric, date) is
  'ADR-0629 Fase B: la comisión de UN pago como la descuenta la máquina (comisión e IGV redondeados por separado, cargo fijo; 0 en los días gratis). Nula sin tarifa.';
revoke all on function retail.fn_pos_comision_pago(uuid, text, numeric, date) from public, anon, authenticated;

-- ---------- 2. Qué pagos cubrió cada depósito ----------
create table if not exists retail.pos_abonos_pagos (
  movimiento_dinero_id uuid not null references retail.movimientos_dinero (id),
  cuenta_id uuid not null references retail.cuentas_dinero (id),
  -- El pago: de una venta, de un apartado o la diferencia que pagó el cliente en un cambio (las tres fuentes de `fn_dinero_libro`).
  origen text not null check (origen in ('venta_pago', 'separacion_pago', 'cambio')),
  origen_id uuid not null,
  clave text not null check (clave like 'cobros:%'),
  monto numeric(12,2) not null check (monto > 0),
  created_at timestamptz not null default now(),
  primary key (movimiento_dinero_id, origen, origen_id)
);
comment on table retail.pos_abonos_pagos is
  'ADR-0629 Fase B: qué pagos cubrió cada depósito de una máquina (su lista, no un movimiento por pago). Solo agrega filas: anular el depósito libera sus pagos.';
create index if not exists pos_abonos_pagos_origen_idx on retail.pos_abonos_pagos (origen, origen_id);
create index if not exists pos_abonos_pagos_cuenta_clave_idx on retail.pos_abonos_pagos (cuenta_id, clave);
alter table retail.pos_abonos_pagos enable row level security;
revoke all on table retail.pos_abonos_pagos from anon, authenticated;

create or replace function retail.fn_pos_abonos_pagos_inmutable() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  raise exception 'Los pagos que cubrió un depósito no se editan ni se borran: se anula el depósito y se registra de nuevo.' using errcode = 'P0001';
end $$;
revoke all on function retail.fn_pos_abonos_pagos_inmutable() from public, anon, authenticated;
create or replace trigger pos_abonos_pagos_inmutable before update or delete on retail.pos_abonos_pagos
  for each row execute function retail.fn_pos_abonos_pagos_inmutable();

-- ---------- 3. Los pagos de una máquina, uno por uno ----------
create or replace function retail.fn_pos_pagos_por_depositar(p_cuenta_id uuid, p_desde date, p_hasta date)
returns table (origen text, origen_id uuid, clave text, fecha date, hora timestamptz, ubicacion_id uuid, ubicacion_nombre text, medio text,
               monto numeric, neto_esperado numeric, neto_tarjeta numeric, depositado boolean, dia_sin_detalle boolean)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_maquina uuid;
begin
  perform retail.fn_exigir_lider_dinero('Ver lo que una máquina no depositó');
  if not exists (select 1 from retail.cuentas_dinero c where c.id = p_cuenta_id and c.tipo = 'por_abonar') then
    raise exception 'Esa cuenta no es la de una máquina de cobro («por depositar»).' using errcode = 'P0001';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 62 then
    raise exception 'Pide los pagos de hasta dos meses a la vez.' using errcode = 'P0001';
  end if;
  select m.id into v_maquina from retail.pos_maquinas m where m.cuenta_id = p_cuenta_id;
  return query
  with base as (
    -- Las mismas tres fuentes de cobro que `fn_dinero_libro` lleva a una máquina, solo lo que entra (un reembolso no es un pago).
    select 'venta_pago'::text as origen, vp.id as origen_id, v.ubicacion_id, v.created_at as hora, vp.metodo as medio, vp.monto::numeric as monto,
           vp.cuenta_dinero_id as sellada
      from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id
     where v.estado = 'completada' and not coalesce(v.es_prueba, false) and vp.metodo in ('qr', 'tarjeta')
       and v.created_at >= (p_desde::timestamp at time zone 'America/Lima') and v.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
    union all
    select 'separacion_pago', sp.id, s.ubicacion_id, sp.created_at, sp.metodo, sp.monto, sp.cuenta_dinero_id
      from retail.separacion_pagos sp join retail.separaciones s on s.id = sp.separacion_id
     where sp.metodo = 'tarjeta'
       and sp.created_at >= (p_desde::timestamp at time zone 'America/Lima') and sp.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
    union all
    select 'cambio', cb.id, cb.ubicacion_id, cb.created_at, cb.metodo_pago_diferencia, cb.diferencia, cb.cuenta_dinero_id
      from retail.cambios cb
     where cb.metodo_pago_diferencia in ('qr', 'tarjeta') and cb.diferencia > 0
       and cb.created_at >= (p_desde::timestamp at time zone 'America/Lima') and cb.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
  ),
  mios as (
    select b.*, (b.hora at time zone 'America/Lima')::date as fecha
      from base b
     where coalesce(b.sellada, retail.fn_cuenta_de_cobro(b.ubicacion_id, b.medio, (b.hora at time zone 'America/Lima')::date)) = p_cuenta_id
  ),
  ligados as (
    select a.origen, a.origen_id, a.clave, a.monto
      from retail.pos_abonos_pagos a join retail.movimientos_dinero d on d.id = a.movimiento_dinero_id
     where a.cuenta_id = p_cuenta_id and d.estado = 'vigente'
  ),
  sin_detalle as (
    -- Lo depositado de cada día que ningún pago explica: un depósito de antes de la Fase B, o uno registrado por día.
    select l.clave
      from retail.pos_abonos_lotes l join retail.movimientos_dinero d on d.id = l.movimiento_dinero_id
     where l.cuenta_id = p_cuenta_id and d.estado = 'vigente'
     group by l.clave
    having sum(l.bruto) - coalesce((select sum(x.monto) from ligados x where x.clave = l.clave), 0) >= 0.01
  )
  select m.origen, m.origen_id, 'cobros:' || m.fecha::text || ':' || m.ubicacion_id::text || ':' || m.medio, m.fecha, m.hora, m.ubicacion_id, u.nombre,
         m.medio, m.monto,
         m.monto - retail.fn_pos_comision_pago(v_maquina, m.medio, m.monto, m.fecha),
         m.monto - retail.fn_pos_comision_pago(v_maquina, 'tarjeta', m.monto, m.fecha),
         exists (select 1 from ligados x where x.origen = m.origen and x.origen_id = m.origen_id),
         exists (select 1 from sin_detalle s where s.clave = 'cobros:' || m.fecha::text || ':' || m.ubicacion_id::text || ':' || m.medio)
    from mios m join retail.ubicaciones u on u.id = m.ubicacion_id
   order by m.hora, m.origen_id;
end $$;
comment on function retail.fn_pos_pagos_por_depositar(uuid, date, date) is
  'ADR-0629 Fase B: los pagos de una máquina entre dos fechas (hasta dos meses), uno por uno, con lo que debería llegar al banco y si ya están en un depósito. Solo el líder.';
revoke all on function retail.fn_pos_pagos_por_depositar(uuid, date, date) from public, anon;
grant execute on function retail.fn_pos_pagos_por_depositar(uuid, date, date) to authenticated;

-- ---------- 4. Registrar el depósito de unos pagos ----------
create or replace function retail.registrar_abono_pos_pagos(
  p_cuenta_id uuid,
  p_banco_id uuid,
  p_fecha date,
  p_neto numeric,
  p_pagos jsonb,
  p_referencia text default null,
  p_token uuid default null
) returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_c retail.cuentas_dinero%rowtype;
  v_b retail.cuentas_dinero%rowtype;
  v_fecha date := coalesce(p_fecha, retail.fn_hoy_lima());
  v_neto numeric := round(coalesce(p_neto, 0), 2);
  v_pedidos integer;
  v_bruto numeric;
  v_comision numeric;
  v_falta text;
  v_id uuid;
begin
  perform retail.fn_exigir_lider_dinero('Registrar el depósito de una máquina');

  -- Doble clic / reintento: el mismo token devuelve el mismo depósito.
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('movimientos_dinero:' || p_token::text, 0));
    v_id := (select d.id from retail.movimientos_dinero d where d.token_cliente = p_token);
    if v_id is not null then
      return (select jsonb_build_object('movimiento_id', d.id, 'neto', d.monto, 'comision', d.comision, 'bruto', d.monto + d.comision,
                                        'pagos', (select count(*) from retail.pos_abonos_pagos a where a.movimiento_dinero_id = d.id))
                from retail.movimientos_dinero d where d.id = v_id);
    end if;
  end if;

  select * into v_c from retail.cuentas_dinero where id = p_cuenta_id;
  if not found or v_c.tipo <> 'por_abonar' then
    raise exception 'Elige la máquina: una cuenta «por depositar».' using errcode = 'P0001';
  end if;
  select * into v_b from retail.cuentas_dinero where id = p_banco_id;
  if not found or v_b.tipo <> 'banco' then
    raise exception 'El depósito llega a un banco.' using errcode = 'P0001';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Marca qué pagos llegaron.' using errcode = 'P0001';
  end if;
  if v_neto <= 0 then
    raise exception 'Di cuánto llegó al banco.' using errcode = 'P0001';
  end if;
  if v_fecha > retail.fn_hoy_lima() then
    raise exception 'La fecha no puede ser futura.' using errcode = 'P0001';
  end if;

  -- Un depósito a la vez por máquina, el mismo candado de `registrar_abono_pos`: los dos caminos no liquidan el mismo pago a la vez.
  perform pg_advisory_xact_lock(hashtextextended('pos_abono:' || p_cuenta_id::text, 0));

  create temporary table if not exists pg_temp.pagos_del_abono (origen text, origen_id uuid, pedido boolean, clave text, fecha date,
    ubicacion_id uuid, medio text, monto numeric, depositado boolean, dia_sin_detalle boolean) on commit drop;
  truncate pg_temp.pagos_del_abono;
  insert into pg_temp.pagos_del_abono (origen, origen_id, pedido)
  select distinct x ->> 'origen', (x ->> 'origen_id')::uuid, true from jsonb_array_elements(p_pagos) x;
  v_pedidos := (select count(*) from pg_temp.pagos_del_abono);
  if v_pedidos <> jsonb_array_length(p_pagos) then
    raise exception 'Un pago está dos veces en la lista.' using errcode = 'P0001';
  end if;

  -- Los pagos de los dos meses antes del depósito: lo pedido tiene que estar ahí (de esta máquina, completado, no depositado).
  update pg_temp.pagos_del_abono t
     set clave = p.clave, fecha = p.fecha, ubicacion_id = p.ubicacion_id, medio = p.medio, monto = p.monto,
         depositado = p.depositado, dia_sin_detalle = p.dia_sin_detalle
    from retail.fn_pos_pagos_por_depositar(p_cuenta_id, v_fecha - 62, v_fecha) p
   where p.origen = t.origen and p.origen_id = t.origen_id;
  if exists (select 1 from pg_temp.pagos_del_abono where clave is null) then
    raise exception 'Alguno de esos pagos no es de esta máquina, no está completado o es de hace más de dos meses: recarga y vuelve a emparejar.' using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_temp.pagos_del_abono where depositado) then
    raise exception 'Alguno de esos pagos ya está en otro depósito: recarga y vuelve a emparejar.' using errcode = 'P0001';
  end if;
  v_falta := (select min(clave) from pg_temp.pagos_del_abono where dia_sin_detalle);
  if v_falta is not null then
    raise exception 'El % ya tiene un depósito que no dice qué pagos cubrió: ese día se cuadra con «Cuadrar depósitos».',
      to_char(split_part(v_falta, ':', 2)::date, 'DD/MM') using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_temp.pagos_del_abono where fecha > v_fecha) then
    raise exception 'El depósito no puede ser anterior a los pagos que cubre.' using errcode = 'P0001';
  end if;
  -- Lo que cubre de cada día no puede pasar de lo que ese día todavía espera (la venta pudo cambiar desde que se emparejó).
  if exists (
    select 1 from (select clave, sum(monto) as monto from pg_temp.pagos_del_abono group by clave) t
      left join retail.fn_pos_pendientes(p_cuenta_id) p on p.clave = t.clave
     where p.clave is null or t.monto - p.bruto >= 0.01
  ) then
    raise exception 'Alguno de esos días cambió desde que se emparejó: recarga y vuelve a emparejar.' using errcode = 'P0001';
  end if;

  v_bruto := (select sum(monto) from pg_temp.pagos_del_abono);
  v_comision := round(v_bruto - v_neto, 2);
  if v_comision < 0 then
    raise exception 'Llegó S/ % y esos pagos suman S/ %: el depósito no puede ser mayor que lo cobrado.',
      to_char(v_neto, 'FM999G999G990D00'), to_char(v_bruto, 'FM999G999G990D00') using errcode = 'P0001';
  end if;

  -- El abono de siempre: baja la puente por lo cobrado, sube el banco por lo que llegó y la diferencia es el gasto de la comisión.
  v_id := retail.registrar_movimiento_dinero(
    p_tipo => 'abono_tarjeta', p_monto => v_neto, p_cuenta_origen_id => p_cuenta_id, p_cuenta_destino_id => p_banco_id,
    p_fecha => v_fecha, p_referencia => p_referencia, p_comision => v_comision, p_token => p_token);

  insert into retail.pos_abonos_lotes (movimiento_dinero_id, cuenta_id, clave, fecha, ubicacion_id, medio, bruto)
  select v_id, p_cuenta_id, clave, fecha, ubicacion_id, medio, sum(monto)
    from pg_temp.pagos_del_abono group by clave, fecha, ubicacion_id, medio;
  insert into retail.pos_abonos_pagos (movimiento_dinero_id, cuenta_id, origen, origen_id, clave, monto)
  select v_id, p_cuenta_id, origen, origen_id, clave, monto from pg_temp.pagos_del_abono;

  return jsonb_build_object('movimiento_id', v_id, 'bruto', v_bruto, 'neto', v_neto, 'comision', v_comision, 'pagos', v_pedidos,
                            'dias', (select count(distinct clave) from pg_temp.pagos_del_abono));
end $$;
comment on function retail.registrar_abono_pos_pagos(uuid, uuid, date, numeric, jsonb, text, uuid) is
  'ADR-0629 Fase B: el depósito de una máquina cruzado contra los PAGOS que llegaron (el QR de Izipay llega uno por uno): un abono por lo que llegó, la comisión real y qué pagos y días cubrió. Solo el líder; todo o nada; idempotente por token.';
revoke all on function retail.registrar_abono_pos_pagos(uuid, uuid, date, numeric, jsonb, text, uuid) from public, anon;
grant execute on function retail.registrar_abono_pos_pagos(uuid, uuid, date, numeric, jsonb, text, uuid) to authenticated;

reset lock_timeout;
