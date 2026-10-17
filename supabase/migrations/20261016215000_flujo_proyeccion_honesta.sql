-- ============================================================================
-- 20261016215000_flujo_proyeccion_honesta.sql — CAYLA V2 (auditoría de Finanzas 2026-10-16, G05 y G06; ADR-0433, actividad 4)
--
-- EL PROBLEMA PRIMERO. «¿Me alcanza?» decía «Hoy tienes S/ 57 mil» y «~86 días de caja» sin una sola advertencia, con cuatro errores a la
-- vez (medidos en producción el 2026-10-16):
--   1. Los cobros esperados para la tienda sin meta eran lo cobrado en 8 semanas ÷ 8, como si hubiera 8 de cada día de la semana. Con un
--      mes de historia hay 2 o 3: la proyección salía ~3.5 veces más baja que lo vendido (S/ 7 400 por semana contra ~26 000 reales).
--   2. «Lo que sale» no traía el IGV ni el pago a cuenta de renta: 15 a 20 mil soles que SUNAT cobra a mitad del mes que viene.
--   3. Los pagos de planilla y de SUNAT (20261016002000, hoy 0 filas) caen en «entre cuentas» y no cuentan como salida.
--   4. Nada decía que el punto de partida es provisional: las cuentas arrancaron en 0 el 25-sep, con 0 facturas de proveedor y un mes de
--      historia; «Hoy tienes» es lo que entró y salió desde esa fecha, no el saldo del banco.
--
-- CÓMO (ADR-0433, decisiones de Felipe del 2026-10-16: «Hoy tienes» provisional, y el IGV entra porque no incluirlo es confuso).
--   · Cobros: ÷ los días de ESE día de la semana que de verdad pasaron desde que la tienda empezó a vender (tope de 8 semanas), y
--     como con pocas observaciones un día atípico mueve todo, el promedio se CONTRAE hacia el promedio diario de la tienda:
--     (suma + 2 × diario) ÷ (días + 2). Con 8 días pesa 80 % lo suyo; con 1, 33 %. Con menos de 4 días dice `promedio_corto`.
--   · IGV y pago a cuenta de renta del mes en curso, LO ACUMULADO HASTA HOY (una cota, que sube con lo que falte vender), el día 15 del
--     mes siguiente (no hay RUC ni calendario de SUNAT cargados; el 12 al 22 es la ventana real). Si el módulo de impuestos no responde
--     (una cuenta sin ese permiso), la proyección sigue sin ellos y lo dice (`incluye_impuestos` = false): se degrada, no se cae.
--   · `pago_planilla` → «planilla» y `pago_sunat` → «impuestos» en el Flujo real (salidas de verdad); y no entran al «día normal» de la
--     salida diaria: la planilla ya se suma aparte (la de Dynamic) y un pago a SUNAT cae un día, no es un gasto diario.
--   · La base dice con qué se proyecta (`historia_dias`, `saldo_inicial_declarado`, `hay_facturas_de_proveedor`, `incluye_impuestos`) y
--     un solo veredicto, `dias_de_caja_confiable` (28 días de ventas y algún saldo de arranque declarado); la web lo muestra.
-- Reemplazos anclados sobre la función VIVA (cada texto ancla aparece una vez o la migración aborta): la proyección, que han reescrito
-- cuatro migraciones, y `fn_flujo_lineas`, que anclan además pedidos web y caja. Idempotente: si el texto nuevo ya está, no toca nada.
-- Verificado: `scripts/pruebas/flujo_caja.mjs` (casos 7, 7b, 10b y 10c) y `lib/flujo-caja-reglas.test.ts`.
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

-- ── 1. El Flujo real: la planilla y el pago a SUNAT son salidas ──────────────────────────────────────────────────────
select pg_temp.anclar('retail.fn_flujo_lineas(date, date)',
  $v$when d.tipo = 'pago_tarjeta' then 'pago_tarjeta'$v$,
  $n$when d.tipo = 'pago_tarjeta' then 'pago_tarjeta'
                when d.tipo = 'pago_planilla' then 'planilla'
                when d.tipo = 'pago_sunat' then 'impuestos'$n$);

-- ── 2. La proyección ─────────────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.anclar('retail.fn_flujo_caja_proyeccion(integer)',
  $v$  v_diarias numeric;
  v_out jsonb;$v$,
  $n$  v_diarias numeric;
  v_out jsonb;
  v_hist_dias integer;
  v_saldos_declarados boolean;
  v_hay_facturas boolean;
  v_mes date := date_trunc('month', retail.fn_hoy_lima())::date;
  v_igv numeric := 0;
  v_renta numeric := 0;
  v_base_ventas numeric := 0;
  v_tasa_renta numeric := 0;
  v_incluye_impuestos boolean := false;
  v_fila record;$n$);

select pg_temp.anclar('retail.fn_flujo_caja_proyeccion(integer)',
  $v$  select coalesce(-sum(l.monto) filter (where l.con_cuenta and retail.fn_flujo_lado(l.categoria) = 'sale'), 0),$v$,
  $n$  -- ADR-0433, actividad 4: la planilla (que se suma aparte, abajo) y un pago a SUNAT (que cae un día) no son el «día normal».
  select coalesce(-sum(l.monto) filter (where l.con_cuenta and retail.fn_flujo_lado(l.categoria) = 'sale'
                                        and l.categoria not in ('planilla', 'impuestos')), 0),$n$);

select pg_temp.anclar('retail.fn_flujo_caja_proyeccion(integer)',
  $v$  v_diarias := round((v_sal_cuenta + v_sal_sin + v_planilla_mes) / 30, 2);$v$,
  $n$  v_diarias := round((v_sal_cuenta + v_sal_sin + v_planilla_mes) / 30, 2);

  -- ADR-0433, actividad 4: con qué base se proyecta (la web dice «provisional» mientras falte alguna).
  v_hist_dias := coalesce((select (v_hoy - min((v.created_at at time zone 'America/Lima')::date))::integer
                             from retail.ventas v where v.estado = 'completada' and not v.es_prueba), 0);
  v_saldos_declarados := exists (select 1 from retail.cuentas_dinero c
                                  where c.tipo in ('banco', 'caja_fuerte') and c.archivada_en is null and c.saldo_inicial <> 0);
  v_hay_facturas := exists (select 1 from retail.compras c where c.estado is distinct from 'anulada')
                    or exists (select 1 from retail.comprobantes_produccion c where c.estado = 'vigente');
  -- El IGV y el pago a cuenta de renta del mes en curso: lo acumulado hasta hoy, a pagar el mes que viene. Si el módulo de
  -- impuestos no responde (una cuenta sin ese permiso), la proyección sigue sin ellos y lo dice.
  begin
    for v_fila in select coalesce(m.a_pagar, 0) as a_pagar, coalesce(m.base_ventas, 0) as base
                    from retail.fn_impuestos_igv_meses(v_mes, v_mes) m where m.mes = v_mes loop
      v_igv := v_fila.a_pagar;
      v_base_ventas := v_fila.base;
      exit;
    end loop;
    v_tasa_renta := coalesce((select t.valor from retail.fn_parametro_tributario('renta_pago_cuenta', v_hoy) t), 0);
    v_renta := round(v_base_ventas * v_tasa_renta, 2);
    v_incluye_impuestos := true;
  exception when others then
    v_igv := 0;
    v_renta := 0;
    v_incluye_impuestos := false;
  end;$n$);

select pg_temp.anclar('retail.fn_flujo_caja_proyeccion(integer)',
  $v$  promedio as (
    select h.ubicacion_id, extract(isodow from h.dia)::integer as dow, sum(h.monto) / 8 as monto from hist h group by 1, 2
  ),$v$,
  $n$  -- El promedio de cada día de la semana (ADR-0433, actividad 4). Antes: lo cobrado ÷ 8, como si hubiera 8 de cada día; con un mes de
  -- historia hay 2 o 3 y salía ~3.5 veces más bajo que lo vendido. Ahora: ÷ los días de ESE día de la semana que de verdad pasaron desde
  -- que la tienda empezó a vender (tope de 8 semanas), contraído hacia el promedio diario de la tienda porque con pocas observaciones un
  -- día atípico mueve todo: (suma + 2 × diario) ÷ (días + 2). Con 8 días pesa 80 % lo suyo; con 1, 33 %.
  desde_tienda as (
    select t.id as ubicacion_id,
           greatest(v_hoy - 56, coalesce((select min((v.created_at at time zone 'America/Lima')::date)
                                            from retail.ventas v
                                           where v.ubicacion_id = t.id and v.estado = 'completada' and not v.es_prueba), v_hoy)) as desde
      from tiendas t
  ),
  dias_dow as (
    select d.ubicacion_id, w.dow,
           (select count(*)::integer from generate_series(d.desde, v_hoy - 1, interval '1 day') g
             where extract(isodow from g)::integer = w.dow) as n
      from desde_tienda d
     cross join generate_series(1, 7) w(dow)
  ),
  cobrado as (
    select h.ubicacion_id, extract(isodow from h.dia)::integer as dow, sum(h.monto) as monto
      from hist h join desde_tienda d on d.ubicacion_id = h.ubicacion_id and h.dia >= d.desde
     group by 1, 2
  ),
  diario_tienda as (
    select d.ubicacion_id,
           coalesce((select sum(c.monto) from cobrado c where c.ubicacion_id = d.ubicacion_id), 0) / greatest(v_hoy - d.desde, 1) as monto
      from desde_tienda d
  ),
  promedio as (
    select n.ubicacion_id, n.dow,
           (coalesce(c.monto, 0) + 2 * dt.monto) / (n.n + 2) as monto,
           case when n.n >= 4 then 'promedio' else 'promedio_corto' end as origen
      from dias_dow n
      join diario_tienda dt on dt.ubicacion_id = n.ubicacion_id
      left join cobrado c on c.ubicacion_id = n.ubicacion_id and c.dow = n.dow
  ),$n$);

select pg_temp.anclar('retail.fn_flujo_caja_proyeccion(integer)',
  $v$           case when p.meta > 0 then 'meta' else 'promedio' end as origen,$v$,
  $n$           case when p.meta > 0 then 'meta' else coalesce(pr.origen, 'promedio_corto') end as origen,$n$);

select pg_temp.anclar('retail.fn_flujo_caja_proyeccion(integer)',
  $v$  salidas as (
    select * from vencimientos union all select * from fijos union all select * from planilla
  ),$v$,
  $n$  -- IGV y pago a cuenta de renta del mes en curso, lo acumulado hasta hoy (ADR-0433, actividad 4). No hay RUC ni calendario de SUNAT
  -- cargados: el día 15 del mes siguiente es un punto medio de la ventana en que vencen (del 12 al 22, según el último dígito del RUC).
  impuestos as (
    select 'impuesto'::text as tipo, 'igv:' || to_char(v_mes, 'YYYY-MM') as id,
           ((v_mes + interval '1 month')::date + 14) as fecha, ((v_mes + interval '1 month')::date + 14) as vence,
           'IGV de ' || (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'])[extract(month from v_mes)::integer] || ' (hasta hoy)' as titulo,
           'Lo acumulado a hoy; sube con lo que falte vender. Vence entre el 12 y el 22 del mes que viene, según el último dígito del RUC.' as detalle,
           'impuestos'::text as clase, null::uuid as ubicacion_id, null::text as unidad, v_igv as monto, false as atrasada
     where v_incluye_impuestos and v_igv > 0 and ((v_mes + interval '1 month')::date + 14) between v_ini and v_fin
    union all
    select 'impuesto'::text, 'renta:' || to_char(v_mes, 'YYYY-MM'),
           ((v_mes + interval '1 month')::date + 14), ((v_mes + interval '1 month')::date + 14),
           'Pago a cuenta de renta de ' || (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'])[extract(month from v_mes)::integer] || ' (hasta hoy)',
           round(v_tasa_renta * 100, 2)::text || ' % de lo vendido sin IGV en el mes (provisional hasta que el contador confirme el régimen). Vence junto con el IGV.',
           'impuestos'::text, null::uuid, null::text, v_renta, false
     where v_incluye_impuestos and v_renta > 0 and ((v_mes + interval '1 month')::date + 14) between v_ini and v_fin
  ),
  salidas as (
    select * from vencimientos union all select * from fijos union all select * from planilla union all select * from impuestos
  ),$n$);

select pg_temp.anclar('retail.fn_flujo_caja_proyeccion(integer)',
  $v$    'salidas_30', jsonb_build_object('con_cuenta', v_sal_cuenta, 'sin_cuenta', v_sal_sin, 'planilla', v_planilla_mes),$v$,
  $n$    'salidas_30', jsonb_build_object('con_cuenta', v_sal_cuenta, 'sin_cuenta', v_sal_sin, 'planilla', v_planilla_mes),
    'historia_dias', v_hist_dias,
    'saldo_inicial_declarado', v_saldos_declarados,
    'hay_facturas_de_proveedor', v_hay_facturas,
    'incluye_impuestos', v_incluye_impuestos,
    'dias_de_caja_confiable', (v_hist_dias >= 28 and v_saldos_declarados),$n$);

-- Comprobación: las dos funciones quedaron con el texto nuevo (si un ancla cambió, arriba ya abortó).
do $c$
begin
  if position('when d.tipo = ''pago_sunat'' then ''impuestos''' in pg_get_functiondef('retail.fn_flujo_lineas(date, date)'::regprocedure)) = 0
     or position('dias_de_caja_confiable' in pg_get_functiondef('retail.fn_flujo_caja_proyeccion(integer)'::regprocedure)) = 0
     or position('diario_tienda' in pg_get_functiondef('retail.fn_flujo_caja_proyeccion(integer)'::regprocedure)) = 0 then
    raise exception 'La proyección o el Flujo real no quedaron con el texto nuevo';
  end if;
end;
$c$;
