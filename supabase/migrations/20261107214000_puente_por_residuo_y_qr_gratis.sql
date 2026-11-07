-- ============================================================================
-- 20261107214000 — La puente de la máquina ya no esconde lo cobrado después de un depósito, y el QR de Izipay es gratis los primeros días
-- de cada mes (ADR-0629, Fase A del cuadre de las puentes; Felipe 2026-11-07)
--
-- EL PROBLEMA PRIMERO. Un día (tienda + medio) quedaba «liquidado» apenas CUALQUIER depósito vigente lo cubría, sin mirar el monto
-- (`fn_pos_pendientes`: `not exists … a.clave = l.clave`). Izipay deposita el QR al instante, así que el depósito se registraba a media
-- tarde y todo lo que la tienda cobraba después quedaba en «Por depositar Izipay» sin que ninguna pantalla lo volviera a ofrecer: la
-- puente decía más de lo que de verdad faltaba y solo se cuadraba a mano, con abonos sin días y ajustes que tapaban la diferencia
-- (medido en producción el 2026-11-07: cobros de dos días ya «liquidados» siguieron sumando en la puente). Además, la tarifa del QR no
-- tenía la ventana gratis de noviembre, así que la base estimaba una comisión que Izipay no cobró.
--
-- LA DECISIÓN (Felipe 2026-11-07: «plata atrapada primero» y «QR gratis hasta el día 10»).
--   1. Lo pendiente de un día es lo cobrado MENOS lo que ya cubrieron sus depósitos vigentes (el residuo), no «ese día no tiene
--      depósito». Un día depositado que siguió vendiendo vuelve a aparecer con lo que falta, y `fn_pos_pendientes` lo dice en
--      `ya_depositado`. `registrar_abono_pos` no cambia: ya guarda en `pos_abonos_lotes` el bruto que le da `fn_pos_pendientes`, que
--      ahora es el residuo, y `unique (movimiento_dinero_id, clave)` ya deja que dos depósitos distintos cubran el mismo día.
--   2. La comisión estimada de un día se revierte UNA vez: con su primer depósito vigente. El depósito del residuo trae su comisión real
--      (bruto − neto) y nada que revertir; si no, el diario revertiría dos veces lo estimado del mismo día.
--   3. «Cuadrar depósitos» estima la comisión de un residuo como la parte proporcional de la del día, y dice cuánto de lo que propone
--      se cobró después de un depósito (`residuo`).
--   4. `pos_tarifas.gratis_hasta_dia`: los primeros N días de cada mes esa tarifa no cobra. Se guarda una vez y vale todos los meses
--      (antes hacían falta dos filas por mes). El QR de Izipay: 2,38 % + IGV, gratis hasta el día 10, desde el 1-nov-2026.
--
-- DESCARTÉ: un movimiento de dinero por cada QR (ADR-0629: ~550 filas más al mes y dos formas de liquidar); repartir la reversa de lo
-- estimado entre los depósitos de un día en proporción a su bruto (el reparto cambiaría cada vez que llega otro depósito, y el diario de
-- un mes cerrado se movería); mostrar como pendiente un residuo NEGATIVO (una venta anulada después del depósito): es una devolución que
-- va por su propio camino, no plata que la máquina deba.
--
-- SE ROMPE SI: alguien deposita un residuo y además lo cuadra a mano con un abono sin días (como se hizo el 6-nov): se cuenta dos veces.
-- Por eso, al pegar esto en producción, los abonos sin días se anulan antes (con el OK de Felipe, ADR-0629). Y si Izipay cambia la ventana
-- gratis, se agrega otra fila de tarifa (las tarifas solo agregan filas).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una sola ejecución, sin políticas (las tablas nuevas o tocadas se leen solo por funciones `security definer`).
-- El CANDADO compara el cuerpo vivo de cada función que se reescribe entera con el de main; si alguien la cambió, aborta y dice cuál. El
-- parche del diario es un reemplazo anclado: si el ancla no aparece exactamente una vez, aborta. Pegarla dos veces no hace nada.
-- Verificado: `pnpm pruebas:puente-residuo`, `pnpm pruebas:comision-estimada`, `pnpm pruebas:pos-maquinas`.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ============================== CANDADO (corre primero) ==============================
-- Acepta el cuerpo de main (medido en producción el 2026-11-07, igual al del repo) o el de este archivo (lleva «ADR-0629»).
do $candado$
declare r record; v_src text;
begin
  for r in select * from (values
    ('retail.fn_pos_pendientes(uuid)', 'da35d705ce5d1427f7a0af485334c055'),
    ('retail.fn_cuadrar_depositos_vista()', '0378ceaa250e17fa4aead10f26ad51ba'),
    ('retail.fn_pos_comision_lote(uuid,date,uuid,text)', '2b08e34ebcde1c9109a4d6b05aca68d7'),
    ('retail.fn_pos_comision_estimada(uuid,text,numeric,integer,date)', '9247d580108758cbe9bb79ce5d718274')
  ) as t(firma, md5_main) loop
    select p.prosrc into v_src from pg_proc p where p.oid = to_regprocedure(r.firma);
    if v_src is null then
      raise exception 'Falta %: esta migración no la crea, solo la reescribe.', r.firma;
    end if;
    if md5(v_src) <> r.md5_main and position('ADR-0629' in v_src) = 0 then
      raise exception '% tiene otro cuerpo en esta base (md5 %): no es el de main ni el de este archivo. Reescríbela desde su definición real antes de pegar.', r.firma, md5(v_src);
    end if;
  end loop;
end
$candado$;

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ───────────────────────────── 1. La ventana gratis de cada mes ─────────────────────────────
alter table retail.pos_tarifas add column if not exists gratis_hasta_dia smallint not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pos_tarifas_gratis_hasta_dia_rango') then
    alter table retail.pos_tarifas add constraint pos_tarifas_gratis_hasta_dia_rango check (gratis_hasta_dia between 0 and 31);
  end if;
end $$;
comment on column retail.pos_tarifas.gratis_hasta_dia is
  'ADR-0629: los primeros N días de cada mes esta tarifa no cobra (0 = ninguno). El QR de Izipay es gratis hasta el día 10.';

-- El QR de Izipay desde el 1-nov-2026 (Felipe 2026-11-07). Las tarifas solo agregan filas; esta reemplaza las dos por mes.
insert into retail.pos_tarifas (maquina_id, medio, tasa_pct, igv_sobre_tasa, cargo_fijo, dias_abono, vigente_desde, gratis_hasta_dia)
select m.id, 'qr', 2.38, true, 0, 0, date '2026-11-01', 10
  from retail.pos_maquinas m
 where m.nombre ilike 'izipay%' and m.archivada_en is null
   and exists (select 1 from retail.pos_tarifas t where t.maquina_id = m.id and t.medio = 'qr')
   and not exists (select 1 from retail.pos_tarifas t where t.maquina_id = m.id and t.medio = 'qr' and t.vigente_desde = date '2026-11-01');

-- La comisión de un día por su total (la usa `fn_pos_pendientes` para la columna `esperado`): 0 en los días gratis.
create or replace function retail.fn_pos_comision_estimada(p_maquina_id uuid, p_medio text, p_monto numeric, p_n_pagos integer, p_fecha date)
returns numeric
language sql stable set search_path = retail, public, extensions as $$
  -- ADR-0629: los primeros días del mes de una tarifa con ventana gratis no cobran.
  select case when t.id is null then null
              when extract(day from p_fecha) <= t.gratis_hasta_dia then 0
         else round(p_monto * t.tasa_pct / 100 * (case when t.igv_sobre_tasa then 1 + retail.fn_tasa_igv(p_fecha) else 1 end)
                    + t.cargo_fijo * greatest(coalesce(p_n_pagos, 0), 0), 2) end
    from (select (retail.fn_pos_tarifa(p_maquina_id, p_medio, p_fecha)).*) t;
$$;
revoke all on function retail.fn_pos_comision_estimada(uuid, text, numeric, integer, date) from public, anon, authenticated;

-- La comisión de un día, operación por operación (el devengo del diario y «Cuadrar depósitos»): 0 en los días gratis.
create or replace function retail.fn_pos_comision_lote(p_cuenta_id uuid, p_fecha date, p_ubicacion_id uuid, p_medio text)
returns numeric
language sql stable security definer
set search_path = retail, public, extensions
as $$
  with t as (
    select (retail.fn_pos_tarifa(m.id, p_medio, p_fecha)).* from retail.pos_maquinas m where m.cuenta_id = p_cuenta_id
  )
  select coalesce(sum(round(vp.monto * t.tasa_pct / 100, 2)
                      + case when t.igv_sobre_tasa then round(round(vp.monto * t.tasa_pct / 100, 2) * retail.fn_tasa_igv(p_fecha), 2) else 0 end
                      + t.cargo_fijo), 0)::numeric
    from t
    join retail.venta_pagos vp on vp.cuenta_dinero_id = p_cuenta_id and vp.metodo = p_medio
    join retail.ventas v on v.id = vp.venta_id
   where t.id is not null
     and extract(day from p_fecha) > t.gratis_hasta_dia -- ADR-0629: los días gratis del mes no cobran
     and v.ubicacion_id = p_ubicacion_id and v.estado = 'completada' and not coalesce(v.es_prueba, false)
     and v.created_at >= (p_fecha::timestamp at time zone 'America/Lima') and v.created_at < ((p_fecha + 1)::timestamp at time zone 'America/Lima');
$$;
revoke all on function retail.fn_pos_comision_lote(uuid, date, uuid, text) from public, anon, authenticated;

-- ───────────────────────────── 2. Lo pendiente es el residuo ─────────────────────────────
-- Cambia lo que devuelve (suma `ya_depositado`): por eso se borra y se crea, con sus permisos de antes.
drop function if exists retail.fn_pos_pendientes(uuid);
create function retail.fn_pos_pendientes(p_cuenta_id uuid)
returns table (clave text, fecha date, ubicacion_id uuid, ubicacion_nombre text, medio text, bruto numeric, dias integer,
               n_pagos integer, esperado numeric, dias_habiles integer, atrasado boolean, ya_depositado numeric)
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
  with depositado as (
    -- ADR-0629: lo que ya cubrieron los depósitos vigentes de cada día (tienda + medio). Antes bastaba con que existiera uno.
    select a.clave, sum(a.bruto) as monto
      from retail.pos_abonos_lotes a join retail.movimientos_dinero d on d.id = a.movimiento_dinero_id
     where a.cuenta_id = p_cuenta_id and d.estado = 'vigente'
     group by a.clave
  ),
  pend as (
    select l.clave, l.fecha, l.ubicacion_id, u.nombre as ubicacion_nombre, split_part(l.clave, ':', 4) as medio,
           l.monto - coalesce(dep.monto, 0) as bruto, coalesce(dep.monto, 0) as ya_depositado
      from retail.fn_dinero_libro(v_hoy) l
      left join retail.ubicaciones u on u.id = l.ubicacion_id
      left join depositado dep on dep.clave = l.clave
     where l.cuenta_id = p_cuenta_id and l.origen = 'cobros'
       -- Sin depósito: todo lo cobrado (como siempre). Con depósito: solo si se cobró más después; un residuo negativo es una
       -- venta anulada después del depósito y va por la devolución, no es plata que la máquina deba.
       and (case when dep.clave is null then l.monto <> 0 else l.monto - dep.monto >= 0.01 end)
  ),
  conteo as materialized (
    -- Cuántos pagos fueron ese día, en esa tienda, con ese medio (para el cargo fijo por pago). Solo ventas completadas. El día va
    -- como rango sobre `created_at` (usa `ventas_ubicacion_fecha_idx`, ADR-0622).
    select p.clave, (select count(*)::integer from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id
                       where v.estado = 'completada' and not coalesce(v.es_prueba, false) and vp.metodo = p.medio
                         and v.ubicacion_id = p.ubicacion_id
                         and v.created_at >= (p.fecha::timestamp at time zone 'America/Lima')
                         and v.created_at < ((p.fecha + 1)::timestamp at time zone 'America/Lima')
                         and coalesce(vp.cuenta_dinero_id, p_cuenta_id) = p_cuenta_id) as n
      from pend p
  )
  select p.clave, p.fecha, p.ubicacion_id, p.ubicacion_nombre, p.medio, p.bruto, (v_hoy - p.fecha)::integer,
         c.n,
         case when v_maquina is null then null else retail.fn_pos_comision_estimada(v_maquina, p.medio, p.bruto, c.n, p.fecha) end,
         retail.fn_dias_habiles(p.fecha, v_hoy),
         retail.fn_dias_habiles(p.fecha, v_hoy) > coalesce((retail.fn_pos_tarifa(v_maquina, p.medio, p.fecha)).dias_abono, 3),
         p.ya_depositado
    from pend p join conteo c on c.clave = p.clave
   order by p.fecha, p.ubicacion_nombre, p.medio;
end $$;
comment on function retail.fn_pos_pendientes(uuid) is
  'ADR-0429 y ADR-0629: lo que cada día (tienda y medio) cobrado con una máquina todavía no tiene depósito: lo cobrado menos lo que cubrieron sus depósitos vigentes (`ya_depositado`). Solo el líder.';
revoke all on function retail.fn_pos_pendientes(uuid) from public, anon;
grant execute on function retail.fn_pos_pendientes(uuid) to authenticated;

-- ───────────────────────────── 3. «Cuadrar depósitos» con el residuo ─────────────────────────────
drop function if exists retail.fn_cuadrar_depositos_vista();
create function retail.fn_cuadrar_depositos_vista()
returns table (cuenta_id uuid, maquina text, banco_id uuid, banco text, dias integer, bruto numeric, comision numeric, neto numeric, claves text[], desde date, hasta date, falta text, residuo numeric)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_hoy date := retail.fn_hoy_lima();
begin
  perform retail.fn_exigir_lider_dinero('Cuadrar los depósitos de las máquinas');
  return query
  with lotes as (
    select m.cuenta_id, m.nombre as maquina, m.banco_id, p.clave, p.fecha, p.bruto, p.ya_depositado,
           (retail.fn_pos_tarifa(m.id, p.medio, p.fecha)).id as tarifa_id,
           -- ADR-0629: un residuo lleva la parte de la comisión del día que le toca por su monto.
           case when p.ya_depositado > 0
                then round(retail.fn_pos_comision_lote(m.cuenta_id, p.fecha, p.ubicacion_id, p.medio) * p.bruto / (p.bruto + p.ya_depositado), 2)
                else retail.fn_pos_comision_lote(m.cuenta_id, p.fecha, p.ubicacion_id, p.medio) end as comision
      from retail.pos_maquinas m
     cross join lateral retail.fn_pos_pendientes(m.cuenta_id) p
     where m.archivada_en is null and p.fecha < v_hoy and p.bruto > 0
       and (p.dias_habiles >= coalesce((retail.fn_pos_tarifa(m.id, p.medio, p.fecha)).dias_abono, 3) or v_hoy - p.fecha >= 2)
  )
  select l.cuenta_id, l.maquina, l.banco_id, b.nombre, count(*)::integer, sum(l.bruto)::numeric, sum(l.comision)::numeric, sum(l.bruto - l.comision)::numeric,
         array_agg(l.clave order by l.fecha, l.clave), min(l.fecha), max(l.fecha),
         case when l.banco_id is null then 'banco' when bool_or(l.tarifa_id is null) then 'tarifa' end,
         coalesce(sum(l.bruto) filter (where l.ya_depositado > 0), 0)::numeric
    from lotes l
    left join retail.cuentas_dinero b on b.id = l.banco_id
   group by l.cuenta_id, l.maquina, l.banco_id, b.nombre
   order by l.maquina;
end $$;
comment on function retail.fn_cuadrar_depositos_vista() is
  'Tarea 14 y ADR-0629: la vista previa de «Cuadrar depósitos». `falta`: banco o tarifa, lo que impide cuadrar esa máquina. `residuo`: cuánto de lo propuesto se cobró después de un depósito ya registrado.';
revoke all on function retail.fn_cuadrar_depositos_vista() from public, anon;
grant execute on function retail.fn_cuadrar_depositos_vista() to authenticated;

-- ───────────────────────────── 4. El diario revierte lo estimado una sola vez por día ─────────────────────────────
-- `rev_est` (20261106012000) revertía la comisión estimada del día por CADA lote de un depósito vigente. Con el residuo, un día puede
-- tener dos depósitos: solo el primero vigente (por orden de registro) revierte; el del residuo trae su comisión real y nada más.
select pg_temp.reemplazar('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])',
$a$     where p_todo and d.fecha between p_desde and p_hasta and a.fecha >= coalesce(retail.fn_finanzas_desde(), a.fecha)$a$,
$n$     where p_todo and d.fecha between p_desde and p_hasta and a.fecha >= coalesce(retail.fn_finanzas_desde(), a.fecha)
       -- ADR-0629: lo estimado de un día se revierte una vez, con su primer depósito vigente.
       and not exists (select 1 from retail.pos_abonos_lotes a2 join retail.movimientos_dinero d2 on d2.id = a2.movimiento_dinero_id and d2.estado = 'vigente'
                        where a2.cuenta_id = a.cuenta_id and a2.clave = a.clave and (a2.created_at, a2.id) < (a.created_at, a.id))$n$, 1);
