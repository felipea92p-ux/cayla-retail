-- ============================================================================
-- 20261016191000 — La tarifa de cada máquina solo estima y avisa: comisión esperada por día pendiente y «el depósito no llegó»
-- (ADR-0429; decisión 3 del ADR-0417; actividad 4 de 6)
--
-- EL PROBLEMA PRIMERO. La comisión REAL sale del cruce del depósito (actividad 3). Pero mientras el depósito no llega nadie
-- sabe cuánto va a faltar, y si Izipay o Vendemás se atrasan (o depositaron en otra cuenta) nadie se entera hasta conciliar.
-- Felipe (2026-10-05): cada máquina cobra una sola tasa + IGV + un cargo fijo por operación y deposita en 1 a 3 días hábiles.
--
-- CONTRATO (Liskov)
--   PROMETE: `pos_tarifas` guarda la tarifa de cada máquina y medio CON VIGENCIA (solo agrega filas: lo pasado se estima con la
--            tarifa que regía ese día). `fn_pos_pendientes` dice además, por día pendiente, cuántos pagos fueron, la comisión
--            ESPERADA (nula sin tarifa), cuántos días hábiles lleva esperando y si está atrasado (más días hábiles que los que la
--            máquina tarda; sin tarifa, 3). `fn_pos_alertas()` resume por máquina lo atrasado. `guardar_pos_tarifa` la cambia
--            desde hoy, con su rastro en `configuracion_historial`.
--   ASUME:   solo el líder cambia tarifas y ve lo pendiente; los días hábiles son de lunes a sábado (sin domingos; los feriados no
--            se descuentan: un aviso un día antes es mejor que uno un día después). La estimación NUNCA reemplaza a la real: no se
--            escribe en ningún gasto ni asiento.
--   NO HACE: no estima la comisión por venta en el margen (eso es de Finanzas ▸ Análisis, aparte); no detiene ningún cobro ni depósito.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, después de 20261016190000. Una tabla nueva (RLS sin políticas), funciones
-- nuevas y dos que cambian de forma (`fn_pos_pendientes`, `fn_pos_maquinas`: se recrean con `drop function`, que no toma tablas).
-- No toma ninguna tabla que use la tienda. Idempotente.
-- SE ROMPE SI: (1) la tarifa de Vendemás nunca se carga: lo pendiente dice «sin tarifa» y solo avisa por los días (3 hábiles);
-- (2) un feriado largo: el aviso de atraso llega un día antes de lo justo (aceptado: avisa, no bloquea).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Las tarifas, con vigencia ----------
create table if not exists retail.pos_tarifas (
  id uuid primary key default gen_random_uuid(),
  maquina_id uuid not null references retail.pos_maquinas (id),
  medio text not null check (medio in ('tarjeta', 'qr')),
  -- La tasa que descuenta la máquina, en % del monto (3.50 = 3,5 %).
  tasa_pct numeric(5,2) not null check (tasa_pct >= 0 and tasa_pct <= 100),
  -- Si la máquina le suma el IGV a su comisión (lo usual en Perú: la comisión es un servicio gravado).
  igv_sobre_tasa boolean not null default true,
  -- Cargo fijo por cada pago (S/).
  cargo_fijo numeric(8,2) not null default 0 check (cargo_fijo >= 0 and cargo_fijo <= 50),
  -- En cuántos días hábiles deposita (1 a 3 según la tarjeta, Felipe 2026-10-05). Pasado ese plazo, el día queda «atrasado».
  dias_abono smallint not null default 3 check (dias_abono between 0 and 15),
  vigente_desde date not null,
  registrado_por uuid references public.personas (id),
  created_at timestamptz not null default now()
);
comment on table retail.pos_tarifas is
  'La tarifa de cada máquina de cobro por medio (ADR-0429): tasa %, si lleva IGV, cargo fijo por pago y en cuántos días hábiles deposita. Solo agrega filas: la que rige un día es la de mayor vigente_desde ≤ ese día. SOLO estima y avisa; la comisión real sale del depósito.';
create index if not exists pos_tarifas_vigencia_idx on retail.pos_tarifas (maquina_id, medio, vigente_desde desc, created_at desc);
alter table retail.pos_tarifas enable row level security;

create or replace function retail.fn_pos_tarifas_inmutable() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  raise exception 'Una tarifa no se edita ni se borra: se cambia desde hoy (queda la historia).' using errcode = 'P0001';
end $$;
create or replace trigger pos_tarifas_inmutable before update or delete on retail.pos_tarifas
  for each row execute function retail.fn_pos_tarifas_inmutable();
revoke all on function retail.fn_pos_tarifas_inmutable() from public, anon, authenticated;

-- La tarifa que regía para una máquina y un medio un día dado (nula si nunca se cargó).
create or replace function retail.fn_pos_tarifa(p_maquina_id uuid, p_medio text, p_fecha date)
returns retail.pos_tarifas
language sql stable set search_path = retail, public, extensions as $$
  select t.* from retail.pos_tarifas t
   where t.maquina_id = p_maquina_id and t.medio = p_medio and t.vigente_desde <= p_fecha
   order by t.vigente_desde desc, t.created_at desc
   limit 1;
$$;
revoke all on function retail.fn_pos_tarifa(uuid, text, date) from public, anon, authenticated;

-- Días hábiles entre dos fechas (sin contar el día de partida ni los domingos). Los feriados no se descuentan, a propósito.
create or replace function retail.fn_dias_habiles(p_desde date, p_hasta date) returns integer
language sql immutable as $$
  select coalesce((select count(*)::integer from generate_series(p_desde + 1, p_hasta, interval '1 day') d
                    where extract(isodow from d) <> 7), 0);
$$;
revoke all on function retail.fn_dias_habiles(date, date) from public, anon, authenticated;

-- La comisión esperada de un monto cobrado en N pagos con la tarifa que regía ese día: tasa (con IGV si la tarifa lo lleva) + el
-- cargo fijo por cada pago. Nula sin tarifa: nunca se inventa un número.
create or replace function retail.fn_pos_comision_estimada(p_maquina_id uuid, p_medio text, p_monto numeric, p_n_pagos integer, p_fecha date)
returns numeric
language sql stable set search_path = retail, public, extensions as $$
  select case when t.id is null then null
         else round(p_monto * t.tasa_pct / 100 * (case when t.igv_sobre_tasa then 1 + retail.fn_tasa_igv(p_fecha) else 1 end)
                    + t.cargo_fijo * greatest(coalesce(p_n_pagos, 0), 0), 2) end
    from (select (retail.fn_pos_tarifa(p_maquina_id, p_medio, p_fecha)).*) t;
$$;
revoke all on function retail.fn_pos_comision_estimada(uuid, text, numeric, integer, date) from public, anon, authenticated;

-- ---------- 2. Lo pendiente, ahora con lo esperado y el atraso ----------
drop function if exists retail.fn_pos_pendientes(uuid);
create or replace function retail.fn_pos_pendientes(p_cuenta_id uuid)
returns table (clave text, fecha date, ubicacion_id uuid, ubicacion_nombre text, medio text, bruto numeric, dias integer,
               n_pagos integer, esperado numeric, dias_habiles integer, atrasado boolean)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_hoy date := retail.fn_hoy_lima(); v_maquina uuid;
begin
  perform retail.fn_exigir_lider_dinero('Ver lo que una máquina no depositó');
  if not exists (select 1 from retail.cuentas_dinero c where c.id = p_cuenta_id and c.tipo = 'por_abonar') then
    raise exception 'Esa cuenta no es la de una máquina de cobro («por depositar»).' using errcode = 'P0001';
  end if;
  select m.id into v_maquina from retail.pos_maquinas m where m.cuenta_id = p_cuenta_id;
  return query
  with pend as (
    select l.clave, l.fecha, l.ubicacion_id, u.nombre as ubicacion_nombre, split_part(l.clave, ':', 4) as medio, l.monto as bruto
      from retail.fn_dinero_libro(v_hoy) l
      left join retail.ubicaciones u on u.id = l.ubicacion_id
     where l.cuenta_id = p_cuenta_id and l.origen = 'cobros' and l.monto <> 0
       and not exists (select 1 from retail.pos_abonos_lotes a join retail.movimientos_dinero d on d.id = a.movimiento_dinero_id
                        where a.cuenta_id = p_cuenta_id and a.clave = l.clave and d.estado = 'vigente')
  ),
  conteo as (
    -- Cuántos pagos fueron ese día, en esa tienda, con ese medio (para el cargo fijo por pago). Solo ventas completadas.
    select p.clave, (select count(*)::integer from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id
                       where v.estado = 'completada' and not coalesce(v.es_prueba, false) and vp.metodo = p.medio
                         and v.ubicacion_id = p.ubicacion_id and (v.created_at at time zone 'America/Lima')::date = p.fecha
                         and coalesce(vp.cuenta_dinero_id, p_cuenta_id) = p_cuenta_id) as n
      from pend p
  )
  select p.clave, p.fecha, p.ubicacion_id, p.ubicacion_nombre, p.medio, p.bruto, (v_hoy - p.fecha)::integer,
         c.n,
         case when v_maquina is null then null else retail.fn_pos_comision_estimada(v_maquina, p.medio, p.bruto, c.n, p.fecha) end,
         retail.fn_dias_habiles(p.fecha, v_hoy),
         retail.fn_dias_habiles(p.fecha, v_hoy) > coalesce((retail.fn_pos_tarifa(v_maquina, p.medio, p.fecha)).dias_abono, 3)
    from pend p join conteo c on c.clave = p.clave
   order by p.fecha, p.ubicacion_nombre, p.medio;
end $$;
comment on function retail.fn_pos_pendientes(uuid) is
  'ADR-0429: los días (tienda y medio) cobrados con una máquina que ningún depósito vigente cubre: bruto, pagos, comisión esperada (nula sin tarifa), días hábiles esperando y si ya está atrasado. Solo el líder.';
revoke all on function retail.fn_pos_pendientes(uuid) from public, anon;
grant execute on function retail.fn_pos_pendientes(uuid) to authenticated;

-- Por máquina: cuánto espera, cuánto ya está atrasado y desde cuándo. Para el aviso de Cuentas y dinero. Solo el líder.
create or replace function retail.fn_pos_alertas()
returns table (maquina_id uuid, nombre text, cuenta_id uuid, pendientes integer, monto_pendiente numeric, esperado numeric,
               atrasados integer, monto_atrasado numeric, dias_habiles_mas_viejo integer, dias_abono integer, sin_tarifa boolean)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_hoy date := retail.fn_hoy_lima();
begin
  perform retail.fn_exigir_lider_dinero('Ver los depósitos pendientes de las máquinas');
  return query
  select m.id, m.nombre, m.cuenta_id,
         count(p.clave)::integer, coalesce(sum(p.bruto), 0), sum(p.esperado),
         count(p.clave) filter (where p.atrasado)::integer, coalesce(sum(p.bruto) filter (where p.atrasado), 0),
         coalesce(max(p.dias_habiles), 0),
         coalesce(max(coalesce((retail.fn_pos_tarifa(m.id, p.medio, v_hoy)).dias_abono, 3)), 3)::integer,
         bool_or(p.esperado is null) is not false
    from retail.pos_maquinas m
    left join lateral retail.fn_pos_pendientes(m.cuenta_id) p on true
   where m.archivada_en is null
   group by m.id, m.nombre, m.cuenta_id, m.orden
   order by m.orden, m.nombre;
end $$;
comment on function retail.fn_pos_alertas() is 'ADR-0429: por máquina, cuánto espera depósito, cuánto ya está atrasado y desde cuándo. Solo el líder.';
revoke all on function retail.fn_pos_alertas() from public, anon;
grant execute on function retail.fn_pos_alertas() to authenticated;

-- ---------- 3. Cambiar la tarifa desde hoy ----------
create or replace function retail.guardar_pos_tarifa(
  p_maquina_id uuid, p_medio text, p_tasa_pct numeric, p_igv_sobre_tasa boolean, p_cargo_fijo numeric, p_dias_abono integer
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_actor uuid; v_id uuid; v_antes retail.pos_tarifas; v_hoy date := retail.fn_hoy_lima();
begin
  perform retail.fn_exigir_lider_dinero('Cambiar la tarifa de una máquina');
  if not exists (select 1 from retail.pos_maquinas m where m.id = p_maquina_id and m.archivada_en is null) then
    raise exception 'Esa máquina no existe o está archivada.' using errcode = 'P0001';
  end if;
  if p_medio is null or p_medio not in ('tarjeta', 'qr') then
    raise exception 'La tarifa es de la tarjeta o del QR.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from retail.pos_maquinas_sedes ms where ms.maquina_id = p_maquina_id and ms.medio = p_medio) then
    raise exception 'Esa máquina no cobra con % en ninguna tienda.', case p_medio when 'qr' then 'QR' else 'tarjeta' end using errcode = 'P0001';
  end if;
  if p_tasa_pct is null or p_tasa_pct < 0 or p_tasa_pct > 100 or p_tasa_pct <> p_tasa_pct then
    raise exception 'La tasa va de 0 a 100 %%.' using errcode = 'P0001';
  end if;
  if p_cargo_fijo is null or p_cargo_fijo < 0 or p_cargo_fijo > 50 or p_cargo_fijo <> p_cargo_fijo then
    raise exception 'El cargo fijo por pago va de S/ 0 a S/ 50.' using errcode = 'P0001';
  end if;
  if p_dias_abono is null or p_dias_abono < 0 or p_dias_abono > 15 then
    raise exception 'Los días de abono van de 0 a 15.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  perform pg_advisory_xact_lock(hashtextextended('pos_tarifa:' || p_maquina_id::text || ':' || p_medio, 0));
  v_antes := retail.fn_pos_tarifa(p_maquina_id, p_medio, v_hoy);
  if v_antes.id is not null and (v_antes.tasa_pct, v_antes.igv_sobre_tasa, v_antes.cargo_fijo, v_antes.dias_abono)
     is not distinct from (round(p_tasa_pct, 2), coalesce(p_igv_sobre_tasa, true), round(p_cargo_fijo, 2), p_dias_abono::smallint) then
    return v_antes.id;
  end if;
  insert into retail.pos_tarifas (maquina_id, medio, tasa_pct, igv_sobre_tasa, cargo_fijo, dias_abono, vigente_desde, registrado_por)
  values (p_maquina_id, p_medio, round(p_tasa_pct, 2), coalesce(p_igv_sobre_tasa, true), round(p_cargo_fijo, 2), p_dias_abono,
          case when v_antes.id is null then date '1900-01-01' else v_hoy end, v_actor)
  returning id into v_id;
  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('pos_tarifa', jsonb_build_object('maquina_id', p_maquina_id, 'medio', p_medio, 'tasa_pct', round(p_tasa_pct, 2), 'igv_sobre_tasa', coalesce(p_igv_sobre_tasa, true),
                                            'cargo_fijo', round(p_cargo_fijo, 2), 'dias_abono', p_dias_abono,
                                            'antes', case when v_antes.id is null then null else jsonb_build_object('tasa_pct', v_antes.tasa_pct, 'igv_sobre_tasa', v_antes.igv_sobre_tasa, 'cargo_fijo', v_antes.cargo_fijo, 'dias_abono', v_antes.dias_abono) end), v_actor);
  return v_id;
end $$;
comment on function retail.guardar_pos_tarifa(uuid, text, numeric, boolean, numeric, integer) is
  'ADR-0429: la tarifa de una máquina para un medio, desde hoy (la primera vale para todo lo anterior). Solo el líder. Solo estima y avisa.';
revoke all on function retail.guardar_pos_tarifa(uuid, text, numeric, boolean, numeric, integer) from public, anon;
grant execute on function retail.guardar_pos_tarifa(uuid, text, numeric, boolean, numeric, integer) to authenticated;

-- ---------- 4. Configuración ve la tarifa vigente de cada máquina y medio ----------
drop function if exists retail.fn_pos_maquinas();
create or replace function retail.fn_pos_maquinas()
returns table (maquina_id uuid, nombre text, cuenta_id uuid, cuenta_nombre text, archivada boolean,
               ubicacion_id uuid, ubicacion_nombre text, medio text, por_defecto boolean,
               tasa_pct numeric, igv_sobre_tasa boolean, cargo_fijo numeric, dias_abono integer, tarifa_desde date)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_hoy date := retail.fn_hoy_lima();
begin
  perform retail.fn_exigir_lider_dinero('Ver las máquinas de cobro');
  return query
  select m.id, m.nombre, m.cuenta_id, c.nombre, m.archivada_en is not null,
         ms.ubicacion_id, u.nombre, ms.medio,
         case when ms.medio is null then null else retail.fn_cuenta_de_cobro(ms.ubicacion_id, ms.medio, v_hoy) = m.cuenta_id end,
         t.tasa_pct, t.igv_sobre_tasa, t.cargo_fijo, t.dias_abono::integer, t.vigente_desde
    from retail.pos_maquinas m
    join retail.cuentas_dinero c on c.id = m.cuenta_id
    left join retail.pos_maquinas_sedes ms on ms.maquina_id = m.id
    left join retail.ubicaciones u on u.id = ms.ubicacion_id
    left join lateral (select (retail.fn_pos_tarifa(m.id, ms.medio, v_hoy)).*) t on ms.medio is not null
   order by m.archivada_en nulls first, m.orden, m.nombre, u.nombre, ms.medio;
end $$;
comment on function retail.fn_pos_maquinas() is 'ADR-0429: las máquinas de cobro con su cuenta puente, en qué tiendas operan, con qué medio y la tarifa vigente de cada medio. Solo el líder.';
revoke all on function retail.fn_pos_maquinas() from public, anon;
grant execute on function retail.fn_pos_maquinas() to authenticated;

-- ---------- 5. Lo que ya se sabe: el QR de Izipay no cobra comisión «por ahora» (Felipe 2026-10-05) y deposita al día siguiente ----------
insert into retail.pos_tarifas (maquina_id, medio, tasa_pct, igv_sobre_tasa, cargo_fijo, dias_abono, vigente_desde, registrado_por)
select m.id, 'qr', 0, false, 0, 1, date '1900-01-01', null
  from retail.pos_maquinas m
 where lower(m.nombre) = 'izipay' and m.archivada_en is null
   and not exists (select 1 from retail.pos_tarifas t where t.maquina_id = m.id and t.medio = 'qr');
