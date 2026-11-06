-- ADR-0611, actividad 7: Cambios en el patrimonio de unas fechas cualquiera (Felipe 2026-11-05: el calendario de Estados financieros elige un rango, no solo un mes).
--
-- QUÉ HACE. `fn_patrimonio_en_fechas(p_desde, p_hasta)` devuelve lo mismo que `fn_patrimonio_cambios` para esas fechas: lo tuyo al empezar y al terminar, la ganancia, los aportes,
-- los retiros y lo que esos tres no explican. La regla es la misma, renglón por renglón: el mismo diario que el Balance (`fn_bal_diario`), los mismos saldos de arranque y las mismas
-- cuentas de patrimonio. Solo cambia dónde empieza y dónde termina.
--
-- QUÉ NO HACE. No toca `fn_patrimonio_cambios`: esa sigue dando el mes y la serie de lo tuyo al cierre de cada mes, y la usan la pantalla (un mes entero, la línea) y el archivo del
-- contador. Solo lee.
--
-- PROMETE: `sin_arranque` si esas fechas terminan antes del día en que CAYLA empezó a usar el sistema (como el Balance); `hasta` en el futuro se queda en hoy; fechas al revés o que
-- todavía no empiezan, 22023 con su motivo. Quien no ve los Estados financieros de CAYLA entera, 42501 (`fn_exigir_estados_financieros_de_todo`).
-- Sin `alter` de tablas ni políticas: se pega en el SQL Editor de una vez, sin partes.
set lock_timeout = '3s';

create or replace function retail.fn_patrimonio_en_fechas(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_corte date;
  v_arr date;
  v_r jsonb;
begin
  perform retail.fn_exigir_estados_financieros_de_todo();
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Esas fechas no son válidas: la final va después de la inicial.' using errcode = '22023';
  end if;
  if p_desde > v_hoy then
    raise exception 'Esas fechas todavía no empiezan.' using errcode = '22023';
  end if;
  v_corte := least(p_hasta, v_hoy);
  v_arr := retail.fn_fecha_de_arranque();
  -- Sin punto de partida no hay patrimonio que contar (igual que el Balance): la pantalla lo dice.
  if v_arr is null or v_corte < v_arr - 1 then
    return jsonb_build_object('mes', date_trunc('month', v_corte)::date, 'desde', p_desde, 'corte', v_corte, 'arranque', v_arr, 'sin_arranque', true);
  end if;

  with
  -- El día anterior al arranque es el propio arranque: sin diario (se pide un día y se descarta), como en fn_balance_general.
  a as materialized (
    select x.fecha, x.regla, x.cuenta, x.debe - x.haber as d
      from retail.fn_bal_diario(v_arr, greatest(v_corte, v_arr)) x
     where x.fecha <= v_corte
  ),
  ini as (select v.cuenta, v.debe - v.haber as d from retail.fn_saldos_iniciales_vigentes() v),
  -- El día anterior a la primera fecha (el inicio) y la última. Nada antes del arranque.
  cortes as (
    select c.corte from (values (p_desde - 1), (v_corte)) c(corte) where c.corte >= v_arr - 1
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
  -- Lo que pasó dentro de esas fechas.
  mov as (
    select coalesce(sum(-a.d) filter (where c.tipo in ('ingreso', 'gasto')), 0) as ganancia,
           coalesce(sum(-a.d) filter (where a.cuenta like '52%'), 0) as aportes,
           coalesce(sum(a.d) filter (where a.cuenta = '591' and a.regla = 'retiro'), 0) as retiros
      from a join retail.cuentas c on c.codigo = a.cuenta
     where a.fecha >= p_desde
  ),
  -- Los dos extremos. Al empezar puede no haber fila (si las fechas empiezan antes del arranque: lo tuyo es el arranque).
  ext as (
    select coalesce(i.capital, 0) as ic, coalesce(i.aportes, 0) as ia, coalesce(i.utilidades, 0) as iu,
           f.capital as fc, f.aportes as fa, f.utilidades as fu
      from (select 1) z
      left join pat i on i.corte = p_desde - 1
      left join pat f on f.corte = v_corte
  )
  select jsonb_build_object(
           'mes', date_trunc('month', v_corte)::date, 'desde', p_desde, 'corte', v_corte, 'arranque', v_arr, 'sin_arranque', false,
           'inicio', jsonb_build_object('fecha', p_desde - 1, 'capital', e.ic, 'aportes', e.ia, 'utilidades', e.iu,
                                        'total', e.ic + e.ia + e.iu),
           'fin', jsonb_build_object('fecha', v_corte, 'capital', e.fc, 'aportes', e.fa, 'utilidades', e.fu,
                                     'total', e.fc + e.fa + e.fu),
           'ganancia', m.ganancia, 'aportes', m.aportes, 'retiros', m.retiros,
           'otros', (e.fc + e.fa + e.fu) - (e.ic + e.ia + e.iu) - m.ganancia - m.aportes + m.retiros,
           'serie', '[]'::jsonb)
    into v_r
    from ext e cross join mov m;
  return v_r;
end $$;

comment on function retail.fn_patrimonio_en_fechas(date, date) is
  'ADR-0611: el estado de cambios en el patrimonio de unas fechas cualquiera (lo tuyo al empezar y al terminar, la ganancia, los aportes, los retiros y lo que no explican). La misma regla que fn_patrimonio_cambios, con un inicio y un fin a elegir.';

revoke all on function retail.fn_patrimonio_en_fechas(date, date) from public, anon;
grant execute on function retail.fn_patrimonio_en_fechas(date, date) to authenticated, service_role;
