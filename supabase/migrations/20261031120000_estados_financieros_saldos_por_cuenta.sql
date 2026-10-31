-- ============================================================================
-- Estados financieros · los saldos por cuenta de un mes (ADR-0585, actividad 8).
--
-- EL PROBLEMA. La pantalla de Estados financieros ya no muestra cuentas (Felipe 2026-10-30): las cuentas van solo en lo que se descarga
-- para el contador. Los cuatro estados formales ya traen su columna «Cuenta», pero el contador pide además la «balanza de comprobación»:
-- cada cuenta con su saldo al empezar el mes, lo que se cargó y se abonó en el mes, y su saldo al cerrar. Ninguna función la daba:
-- `fn_balance_general` da solo las cuentas del Balance (sin ingresos ni gastos) y sin el debe y el haber del mes.
--
-- LO QUE HACE. `fn_saldos_por_cuenta(p_mes)` lee el MISMO diario que el Balance (`fn_bal_diario` desde el arranque, más los saldos de
-- arranque), en una sola pasada, para CAYLA entera:
--   · saldo_inicial: los saldos de arranque más el diario desde el arranque hasta el día anterior al mes (debe − haber);
--   · debe y haber: lo que se cargó y se abonó dentro del mes (hasta hoy, en el mes en curso);
--   · saldo_final = saldo_inicial + debe − haber.
-- Todo en el signo del debe (un pasivo, el patrimonio y un ingreso salen negativos), que es como el contador cuadra: la suma de
-- saldo_final de todas las cuentas es 0 si el diario cuadra (lo fija la prueba). Solo las cuentas que tienen algo.
-- Las cuentas de ingreso y gasto acumulan desde el arranque: todavía no hay cierre del año (cuando lo haya, ese asiento las deja en cero).
--
-- QUIÉN LO VE. Lo mismo que el Balance de CAYLA entera: `fn_exigir_estados_financieros_de_todo()` (el líder o quien tiene el módulo,
-- salvo una terminal; migración 20261030235000). Solo lee (STABLE).
--
-- Producción: una función nueva, sin `alter` ni políticas: se pega entera, de una vez, después de 20261030235000.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_saldos_por_cuenta(p_mes date default null)
returns table (cuenta text, nombre text, tipo text, saldo_inicial numeric, debe numeric, haber numeric, saldo_final numeric)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_hoy date := retail.fn_hoy_lima();
  v_mes date := date_trunc('month', coalesce(p_mes, v_hoy))::date;
  v_corte date;
  v_arr date;
begin
  perform retail.fn_exigir_estados_financieros_de_todo();
  if v_mes > date_trunc('month', v_hoy)::date then
    raise exception 'Ese mes todavía no empieza.' using errcode = '22023';
  end if;
  v_corte := least((v_mes + interval '1 month' - interval '1 day')::date, v_hoy);
  v_arr := retail.fn_fecha_de_arranque();
  -- Sin punto de partida no hay saldos que contar (igual que el Balance).
  if v_arr is null then
    raise exception 'Faltan los saldos de arranque: el líder los registra en ¿Cuánto vale CAYLA?.' using errcode = 'P0001';
  end if;
  if v_corte < v_arr - 1 then
    raise exception 'Ese mes es anterior al arranque del sistema.' using errcode = '22023';
  end if;

  return query
  with
  -- El día anterior al arranque es el propio arranque: sin diario (se pide un día y se descarta), como en fn_balance_general.
  a as materialized (
    select x.fecha, x.cuenta, x.debe, x.haber
      from retail.fn_bal_diario(v_arr, greatest(v_corte, v_arr)) x
     where x.fecha <= v_corte
  ),
  mov as (
    select m.cuenta,
           sum(m.ini) as ini,
           sum(m.debe) as debe,
           sum(m.haber) as haber
      from (
        select v.cuenta, v.debe - v.haber as ini, 0::numeric as debe, 0::numeric as haber from retail.fn_saldos_iniciales_vigentes() v
        union all
        select a.cuenta,
               case when a.fecha < v_mes then a.debe - a.haber else 0 end,
               case when a.fecha >= v_mes then a.debe else 0 end,
               case when a.fecha >= v_mes then a.haber else 0 end
          from a
      ) m
     group by m.cuenta
  )
  select m.cuenta, c.nombre, c.tipo, round(m.ini, 2), round(m.debe, 2), round(m.haber, 2), round(m.ini + m.debe - m.haber, 2)
    from mov m
    left join retail.cuentas c on c.codigo = m.cuenta
   where round(m.ini, 2) <> 0 or round(m.debe, 2) <> 0 or round(m.haber, 2) <> 0
   order by m.cuenta;
end $$;

comment on function retail.fn_saldos_por_cuenta(date) is
  'ADR-0585: la balanza de comprobación de un mes (cada cuenta con su saldo al empezar, el debe y el haber del mes y su saldo al cerrar, en el signo del debe). Lee el mismo diario que fn_balance_general. Lo ve quien ve los Estados financieros de CAYLA entera.';

revoke all on function retail.fn_saldos_por_cuenta(date) from public, anon;
grant execute on function retail.fn_saldos_por_cuenta(date) to authenticated, service_role;
