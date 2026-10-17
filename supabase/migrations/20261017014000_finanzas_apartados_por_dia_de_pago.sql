-- ============================================================================
-- 20261017014000_finanzas_apartados_por_dia_de_pago.sql — CAYLA V2 (auditoría de Finanzas 2026-10-16, G02; ADR-0433, actividad 10)
--
-- EL PROBLEMA PRIMERO. Un apartado se separa con un adelanto y, antes de entregarse, la clienta puede abonar más. El diario (`fn_asientos`)
-- asentaba TODO el adelanto —incluidos los abonos de días o meses después— el día de la separación, con el total de hoy
-- (`separaciones.adelanto`), y el Balance (`fn_bal_anticipos`) igual. Resultado: un abono de marzo aparecía en febrero; el diario de febrero
-- CAMBIABA cuando la clienta abonaba (un mes cerrado divergía de su foto por una operación normal: el chequeo «huella» del cierre se ponía en
-- rojo); la caja, el banco y el IGV quedaban mal fechados; y Cuentas y dinero (por fecha del pago) decía otra cosa. Caso real en producción:
-- APT-TRU-0006, separado el 9-oct con pagos de 30.00 (9-oct), 30.00 (14-oct) y 29.90 (15-oct): el diario asentaba 89.90 el 9-oct y nada el 14 ni el 15.
--
-- CÓMO. Un asiento POR PAGO, fechado el día en que entró la plata (`separacion_pagos.created_at`, hora de Lima): 101/104/105 al debe, 122 y 4011 al
-- haber, con el IGV de ese pago a la tasa de ESE día. Dos ayudantes nuevos lo dejan en un solo lugar: `fn_igv_de_adelanto(monto, fecha)` (los céntimos
-- se redondean POR PAGO, como en la boleta de cada abono) y `fn_igv_de_la_separacion(id, monto)` (la suma de los de todos sus pagos; con `monto`, la
-- parte que se aplica). Todo lo que reversa el adelanto usa la MISMA suma, o el 4011 quedaría huérfano por céntimos: la devolución (`sd`) y la venta
-- que lo aplica al entregar (`cobro.igv_ant`). El Balance (`fn_bal_anticipos`) suma los pagos recibidos hasta el corte (antes, el total de hoy).
-- El `origen` de cada línea sigue siendo la separación (la pantalla enlaza «De dónde sale» igual).
-- Reemplazos anclados sobre las funciones VIVAS (cada texto ancla aparece una vez o la migración aborta; si el texto nuevo ya está, no toca nada).
-- Las huellas de `fn_asientos` y `fn_bal_anticipos` eran idénticas en local y en producción el 2026-10-16 (f2e74089… y b7fc4c42…).
--
-- LO QUE NO SE DECIDE AQUÍ (queda para el contador; ADR-0399): hoy el diario asienta el IGV de cada adelanto (4011) el día que entra, como cuando
-- cada abono emitía su comprobante de anticipo. Desde ADR-0399 un apartado nuevo NO emite comprobante: la boleta sale una sola vez, al entregar, por el
-- total. Si el contador dice que el IGV nace al entregar y no al cobrar el adelanto, el 4011 de los apartados nuevos se mueve a la entrega: es otra
-- migración, con su decisión. Esta corrige la FECHA, no la política.
--
-- Producción: sin `alter` de tablas en uso y sin políticas (ADR-0195, «Políticas y deadlocks»): se pega entera.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.anclar(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición viva.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ── 1. Los ayudantes del IGV de un adelanto ──────────────────────────────────────────────────────────────────────────────
create or replace function retail.fn_igv_de_adelanto(p_monto numeric, p_fecha date)
returns numeric
language sql
stable
set search_path = retail, public, extensions
as $fn$ select round(p_monto - p_monto / (1 + retail.fn_tasa_igv(p_fecha)), 2); $fn$;

create or replace function retail.fn_igv_de_la_separacion(p_separacion_id uuid, p_monto numeric default null)
returns numeric
language sql
stable
set search_path = retail, public, extensions
as $fn$
  select case when p_monto is null or s.adelanto = 0 or abs(p_monto - s.adelanto) < 0.005 then t.igv
              else round(t.igv * p_monto / s.adelanto, 2) end
    from retail.separaciones s
    cross join lateral (
      select coalesce(sum(retail.fn_igv_de_adelanto(p.monto, (p.created_at at time zone 'America/Lima')::date)), 0) as igv
        from retail.separacion_pagos p where p.separacion_id = s.id) t
   where s.id = p_separacion_id;
$fn$;
revoke all on function retail.fn_igv_de_adelanto(numeric, date), retail.fn_igv_de_la_separacion(uuid, numeric) from public, anon, authenticated;

-- ── 2. El diario: cada pago en su día; la devolución y la entrega reversan lo mismo que entró ──────────────────────────
select pg_temp.anclar('retail.fn_asientos(date, date, uuid)',
  $v$  -- ===== Separaciones: el adelanto entra el día que se separa (122 + su IGV, como la boleta de anticipo) y, si se
  -- devuelve, sale el día que se devuelve. Si la separación se entrega, la venta lo aplica (ver `cobro`).
  sp as (
    select s.id, s.ubicacion_id, (s.created_at at time zone 'America/Lima')::date as f, s.adelanto,
           round(s.adelanto - s.adelanto / (1 + retail.fn_tasa_igv((s.created_at at time zone 'America/Lima')::date)), 2) as igv
      from retail.separaciones s
     where s.created_at >= v_ini and s.created_at < v_fin and (v_todo or s.ubicacion_id = any (v_ubics))
  ),
  sd as (
    select s.id, s.ubicacion_id, (s.devuelta_en at time zone 'America/Lima')::date as f, s.adelanto, s.devolucion_medio_real as medio,
           round(s.adelanto - s.adelanto / (1 + retail.fn_tasa_igv((s.created_at at time zone 'America/Lima')::date)), 2) as igv
      from retail.separaciones s
     where s.estado = 'devuelta' and s.devuelta_en >= v_ini and s.devuelta_en < v_fin and (v_todo or s.ubicacion_id = any (v_ubics))
  ),
  l_anticipo as (
    select sp.f, sp.ubicacion_id, 'anticipo:' || sp.id as asiento, 'anticipo'::text as regla,
           retail.fn_asiento_cuenta_de_medio(p.metodo, 'entra') as cuenta, p.monto as debe, 0::numeric as haber,
           'separaciones'::text as ot, sp.id as oid, 'Adelanto de la separación (' || p.metodo || ')' as glosa
      from sp join retail.separacion_pagos p on p.separacion_id = sp.id
    union all
    select sp.f, sp.ubicacion_id, 'anticipo:' || sp.id, 'anticipo', '122', 0, sp.adelanto - sp.igv, 'separaciones', sp.id, 'Se le debe a la clienta hasta entregar'
      from sp
    union all
    select sp.f, sp.ubicacion_id, 'anticipo:' || sp.id, 'anticipo', '4011', 0, sp.igv, 'separaciones', sp.id, 'IGV de la boleta de anticipo'
      from sp where sp.igv > 0
    union all
    select sd.f, sd.ubicacion_id, 'anticipo_devuelto:' || sd.id, 'anticipo_devuelto', '122', sd.adelanto - sd.igv, 0, 'separaciones', sd.id, 'Se devuelve el adelanto'
      from sd
    union all
    select sd.f, sd.ubicacion_id, 'anticipo_devuelto:' || sd.id, 'anticipo_devuelto', '4011', sd.igv, 0, 'separaciones', sd.id, 'Se revierte el IGV del anticipo'
      from sd where sd.igv > 0
    union all
    select sd.f, sd.ubicacion_id, 'anticipo_devuelto:' || sd.id, 'anticipo_devuelto', retail.fn_asiento_cuenta_de_medio(sd.medio, 'entra'),
           0, sd.adelanto, 'separaciones', sd.id, 'Devolución del adelanto (' || sd.medio || ')'
      from sd
  ),$v$,
  $n$  -- ===== Separaciones: cada pago del adelanto (el primero y cada abono) entra el día en que se recibió (122 + su IGV, un asiento por pago)
  -- y, si el adelanto se devuelve, sale entero el día que se devuelve. Si la separación se entrega, la venta lo aplica (ver `cobro`).
  -- ADR-0433, actividad 10 (G02): antes TODO el adelanto —con los abonos de después— se asentaba el día de la separación, con el total de hoy.
  pp as (
    select p.id, p.separacion_id, s.ubicacion_id, (p.created_at at time zone 'America/Lima')::date as f, p.monto, p.metodo,
           retail.fn_igv_de_adelanto(p.monto, (p.created_at at time zone 'America/Lima')::date) as igv
      from retail.separacion_pagos p join retail.separaciones s on s.id = p.separacion_id
     where p.created_at >= v_ini and p.created_at < v_fin and (v_todo or s.ubicacion_id = any (v_ubics))
  ),
  sd as (
    select s.id, s.ubicacion_id, (s.devuelta_en at time zone 'America/Lima')::date as f, s.adelanto, s.devolucion_medio_real as medio,
           retail.fn_igv_de_la_separacion(s.id) as igv
      from retail.separaciones s
     where s.estado = 'devuelta' and s.devuelta_en >= v_ini and s.devuelta_en < v_fin and (v_todo or s.ubicacion_id = any (v_ubics))
  ),
  l_anticipo as (
    select pp.f, pp.ubicacion_id, 'anticipo:' || pp.id as asiento, 'anticipo'::text as regla,
           retail.fn_asiento_cuenta_de_medio(pp.metodo, 'entra') as cuenta, pp.monto as debe, 0::numeric as haber,
           'separaciones'::text as ot, pp.separacion_id as oid, 'Adelanto de la separación (' || pp.metodo || ')' as glosa
      from pp
    union all
    select pp.f, pp.ubicacion_id, 'anticipo:' || pp.id, 'anticipo', '122', 0, pp.monto - pp.igv, 'separaciones', pp.separacion_id, 'Se le debe a la clienta hasta entregar'
      from pp
    union all
    select pp.f, pp.ubicacion_id, 'anticipo:' || pp.id, 'anticipo', '4011', 0, pp.igv, 'separaciones', pp.separacion_id, 'IGV de la boleta de anticipo'
      from pp where pp.igv > 0
    union all
    select sd.f, sd.ubicacion_id, 'anticipo_devuelto:' || sd.id, 'anticipo_devuelto', '122', sd.adelanto - sd.igv, 0, 'separaciones', sd.id, 'Se devuelve el adelanto'
      from sd
    union all
    select sd.f, sd.ubicacion_id, 'anticipo_devuelto:' || sd.id, 'anticipo_devuelto', '4011', sd.igv, 0, 'separaciones', sd.id, 'Se revierte el IGV del anticipo'
      from sd where sd.igv > 0
    union all
    select sd.f, sd.ubicacion_id, 'anticipo_devuelto:' || sd.id, 'anticipo_devuelto', retail.fn_asiento_cuenta_de_medio(sd.medio, 'entra'),
           0, sd.adelanto, 'separaciones', sd.id, 'Devolución del adelanto (' || sd.medio || ')'
      from sd
  ),$n$);

select pg_temp.anclar('retail.fn_asientos(date, date, uuid)',
  $v$case when vp.metodo = 'anticipo' then coalesce(
             (select round(vp.monto - vp.monto / (1 + retail.fn_tasa_igv((s.created_at at time zone 'America/Lima')::date)), 2)
                from retail.separaciones s where s.venta_id = vp.venta_id limit 1), 0)
           else 0 end as igv_ant$v$,
  $n$case when vp.metodo = 'anticipo' then coalesce(
             (select retail.fn_igv_de_la_separacion(s.id, vp.monto)
                from retail.separaciones s where s.venta_id = vp.venta_id limit 1), 0)
           else 0 end as igv_ant$n$);

-- ── 3. El Balance: lo recibido hasta el corte ─────────────────────────────────────────────────────────────────────────────
select pg_temp.anclar('retail.fn_bal_anticipos(date)',
  $v$  select s.ubicacion_id,
         sum(s.adelanto - round(s.adelanto - s.adelanto / (1 + retail.fn_tasa_igv((s.created_at at time zone 'America/Lima')::date)), 2))
    from retail.separaciones s cross join fin
   where s.created_at < fin.t$v$,
  $n$  select s.ubicacion_id,
         sum(p.monto - retail.fn_igv_de_adelanto(p.monto, (p.created_at at time zone 'America/Lima')::date))
    from retail.separacion_pagos p join retail.separaciones s on s.id = p.separacion_id cross join fin
   where p.created_at < fin.t$n$);

notify pgrst, 'reload schema';
