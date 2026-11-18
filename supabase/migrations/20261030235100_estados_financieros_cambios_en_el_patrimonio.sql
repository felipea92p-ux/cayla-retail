-- ============================================================================
-- 20261030235100_estados_financieros_cambios_en_el_patrimonio.sql — CAYLA V2 (ADR-0585, actividad 2)
--
-- EL PROBLEMA PRIMERO. Estados financieros muestra cuatro estados y el cuarto, «¿Lo tuyo creció?» (el estado de cambios en el
-- patrimonio), no existía. El Balance ya decía cuánto es tuyo a una fecha, pero no POR QUÉ cambió de un mes al otro: cuánto fue la
-- ganancia, cuánto pusiste y cuánto sacaste. Esa es la única decisión que ayuda a tomar (cuánto retirar), y sin ella el dueño ve que
-- «lo tuyo» subió S/ 850 sin saber que ganó S/ 3,850 y retiró S/ 3,000.
--
-- QUÉ HACE. `fn_patrimonio_cambios(p_mes, p_meses)` lee el MISMO diario que el Balance (`fn_bal_diario` desde el arranque, más los
-- saldos de arranque), en una sola pasada, y devuelve:
--   · lo tuyo al empezar el mes (el día anterior) y al cerrarlo (fin de mes u hoy), partido como lo pide el estado formal:
--     capital (50), aportes (52) y utilidades (591 + los resultados que todavía no se cerraron), y su total;
--   · lo que lo movió en el mes: la ganancia (ingresos − gastos), los aportes (haber de la 52) y los retiros (debe de la 591 con la
--     regla «retiro»), y `otros` = lo que no explican esos tres (debe ser 0; si no, se muestra, como la comprobación del Balance);
--   · la serie de lo tuyo al cierre de los últimos `p_meses` meses (6 por defecto, 24 como máximo), sin los anteriores al arranque.
-- Por construcción, el total al cierre es la suma de la sección «patrimonio» de `fn_balance_general` a esa fecha (lo fija la prueba).
--
-- QUIÉN LO VE. Lo mismo que el Balance de CAYLA entera: `fn_exigir_estados_financieros_de_todo()` (el líder o quien tiene el módulo,
-- salvo una terminal; migración 20261030235000). Lo tuyo es de CAYLA entera: no se reparte por sede. Solo lee (STABLE).
--
-- Producción: una función nueva, sin `alter` ni políticas: se pega entera, de una vez.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_patrimonio_cambios(p_mes date default null, p_meses integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_mes date := date_trunc('month', coalesce(p_mes, v_hoy))::date;
  v_n integer := least(greatest(coalesce(p_meses, 6), 1), 24);
  v_corte date;
  v_arr date;
  v_r jsonb;
begin
  perform retail.fn_exigir_estados_financieros_de_todo();
  if v_mes > date_trunc('month', v_hoy)::date then
    raise exception 'Ese mes todavía no empieza.' using errcode = '22023';
  end if;
  v_corte := least((v_mes + interval '1 month' - interval '1 day')::date, v_hoy);
  v_arr := retail.fn_fecha_de_arranque();
  -- Sin punto de partida no hay patrimonio que contar (igual que el Balance): la pantalla lo dice.
  if v_arr is null or v_corte < v_arr - 1 then
    return jsonb_build_object('mes', v_mes, 'corte', v_corte, 'arranque', v_arr, 'sin_arranque', true);
  end if;

  with
  -- El día anterior al arranque es el propio arranque: sin diario (se pide un día y se descarta), como en fn_balance_general.
  a as materialized (
    select x.fecha, x.regla, x.cuenta, x.debe - x.haber as d
      from retail.fn_bal_diario(v_arr, greatest(v_corte, v_arr)) x
     where x.fecha <= v_corte
  ),
  ini as (select v.cuenta, v.debe - v.haber as d from retail.fn_saldos_iniciales_vigentes() v),
  -- Los cierres de cada mes de la serie (el último, el corte) y el día anterior al mes pedido (el inicio). Nada antes del arranque.
  cortes as (
    select distinct c.corte
      from (
        select least((g.m + interval '1 month' - interval '1 day')::date, v_hoy) as corte
          from generate_series(v_mes - make_interval(months => v_n - 1), v_mes, interval '1 month') g(m)
        union all
        select v_mes - 1
      ) c
     where c.corte >= v_arr - 1
  ),
  -- Lo tuyo a cada fecha: el saldo de cada cuenta de patrimonio (con el signo de un pasivo) y los resultados aún sin cerrar.
  pat as (
    select k.corte,
           coalesce(sum(-x.d) filter (where x.cuenta like '50%'), 0) as capital,
           coalesce(sum(-x.d) filter (where x.cuenta like '52%'), 0) as aportes,
           coalesce(sum(-x.d) filter (where (x.tipo = 'patrimonio' and x.cuenta not like '50%' and x.cuenta not like '52%')
                                         or x.tipo in ('ingreso', 'gasto')), 0) as utilidades
      from cortes k
      cross join lateral (
        select i.cuenta, c.tipo, i.d from ini i join retail.cuentas c on c.codigo = i.cuenta
        union all
        select a.cuenta, c.tipo, a.d from a join retail.cuentas c on c.codigo = a.cuenta where a.fecha <= k.corte
      ) x
     group by k.corte
  ),
  -- Lo que pasó dentro del mes pedido.
  mov as (
    select coalesce(sum(-a.d) filter (where c.tipo in ('ingreso', 'gasto')), 0) as ganancia,
           coalesce(sum(-a.d) filter (where a.cuenta like '52%'), 0) as aportes,
           coalesce(sum(a.d) filter (where a.cuenta = '591' and a.regla = 'retiro'), 0) as retiros
      from a join retail.cuentas c on c.codigo = a.cuenta
     where a.fecha >= v_mes
  ),
  -- Los dos extremos del mes. Al empezar puede no haber fila (el mes del arranque empieza en cero de diario: lo tuyo es el arranque).
  ext as (
    select coalesce(i.capital, 0) as ic, coalesce(i.aportes, 0) as ia, coalesce(i.utilidades, 0) as iu,
           f.capital as fc, f.aportes as fa, f.utilidades as fu
      from (select 1) z
      left join pat i on i.corte = v_mes - 1
      left join pat f on f.corte = v_corte
  )
  select jsonb_build_object(
           'mes', v_mes, 'corte', v_corte, 'arranque', v_arr, 'sin_arranque', false,
           'inicio', jsonb_build_object('fecha', v_mes - 1, 'capital', e.ic, 'aportes', e.ia, 'utilidades', e.iu,
                                        'total', e.ic + e.ia + e.iu),
           'fin', jsonb_build_object('fecha', v_corte, 'capital', e.fc, 'aportes', e.fa, 'utilidades', e.fu,
                                     'total', e.fc + e.fa + e.fu),
           'ganancia', m.ganancia, 'aportes', m.aportes, 'retiros', m.retiros,
           'otros', (e.fc + e.fa + e.fu) - (e.ic + e.ia + e.iu) - m.ganancia - m.aportes + m.retiros,
           'serie', (select coalesce(jsonb_agg(jsonb_build_object('mes', date_trunc('month', p.corte)::date, 'corte', p.corte,
                                                                  'total', p.capital + p.aportes + p.utilidades) order by p.corte), '[]'::jsonb)
                       from pat p where p.corte >= v_mes - make_interval(months => v_n - 1)))
    into v_r
    from ext e cross join mov m;
  return v_r;
end $$;

comment on function retail.fn_patrimonio_cambios(date, integer) is
  'ADR-0585: el estado de cambios en el patrimonio de un mes (lo tuyo al empezar y al cerrar, la ganancia, los aportes, los retiros y lo que no explican) y lo tuyo al cierre de los últimos meses. Lee el mismo diario que fn_balance_general. Lo ve quien ve los Estados financieros de CAYLA entera.';

revoke all on function retail.fn_patrimonio_cambios(date, integer) from public, anon;
grant execute on function retail.fn_patrimonio_cambios(date, integer) to authenticated, service_role;
