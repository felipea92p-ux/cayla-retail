-- ============================================================================
-- 20261019205000_club_puntos_resumen_caja.sql — CAYLA V2 · Club · puntos, actividad 5 de 12: lo que la caja necesita saber
-- Sigue a `20261019204000_club_puntos_cobrar_con_cupon.sql`. Solo una función de LECTURA nueva (el prefijo `resumen_` no abre el
-- loader global, lib/espera-reglas.ts): no toca tablas ni funciones existentes.
--
-- EL PROBLEMA. La tarjeta del cliente en caja tiene que decir, de un vistazo y sin que la cajera calcule nada: cuántos puntos tiene y
-- cuánto valen, si puede usarlos, si tiene cupones vivos, cuántos puntos gana con esta compra y si le toca el regalo de cumpleaños.
-- Todo eso lo decide la base (la configuración vigente, el saldo, los cupones): la caja solo lo muestra.
--
-- QUÉ HACE: `resumen_puntos_caja(clienta)` devuelve un jsonb con la configuración vigente (siempre, aunque la ficha no sea miembro:
-- sirve para decir «gana N puntos») y, si es miembro, su saldo, lo que valen, su regalo de cumpleaños y sus cupones vivos. Antes de
-- leer el saldo libera lo vencido de esa miembro, para que la caja nunca muestre puntos que están en un cupón ya pasado de fecha.
--
-- DECIDÍ: los cupones vivos de la miembro se muestran a la cajera con su código (el cupón es al portador y quien lo tiene ya lo ve
--   en su celular; la cajera lo necesita para ofrecérselo). Solo con el módulo Vender o Clientes.
-- CÓMO SE PEGA: este archivo SOLO en el SQL Editor de producción, después de `20261019204000`. Idempotente. `lock_timeout` 3 s.
-- CAÍDA EXTERNA. Nada llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.resumen_puntos_caja(p_clienta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_cfg retail.club_puntos_config;
  v_ficha record;
  v_config jsonb;
  v_saldo integer;
  v_regalo boolean;
begin
  if not (retail.fn_ve_modulo('vender') or retail.fn_ve_modulo('clientas')) then
    raise exception 'No tienes permiso para ver los puntos del Club.' using errcode = '42501', hint = 'sin_permiso';
  end if;

  v_cfg := retail.fn_club_puntos_config(v_hoy);
  v_config := jsonb_build_object(
    'puntos_por_sol', v_cfg.puntos_por_sol, 'soles_por_100', v_cfg.soles_por_100, 'canje_minimo', v_cfg.canje_minimo_puntos,
    'compra_minima_x', v_cfg.compra_minima_x, 'vigencia_dias', v_cfg.vigencia_cupon_dias, 'regalo_cumple', v_cfg.regalo_cumple_puntos);

  select c.club_desde, c.anonimizada, c.archivada_en, c.cumple_dia, c.cumple_mes into v_ficha
    from retail.clientas c where c.id = p_clienta_id;
  if not found or v_ficha.club_desde is null or v_ficha.anonimizada or v_ficha.archivada_en is not null then
    return v_config || jsonb_build_object('miembro', false);
  end if;

  -- Lo vencido de esta miembro vuelve a su saldo antes de leerlo.
  perform retail.fn_club_cupones_vencer(p_clienta_id);
  v_saldo := retail.fn_club_puntos_saldo(p_clienta_id);

  -- El regalo: su mes y sin uno vivo este año (uno ya revertido no cuenta: se volvió a poder dar).
  v_regalo := v_cfg.regalo_cumple_puntos > 0
              and v_ficha.cumple_mes = extract(month from v_hoy)::smallint
              and not exists (select 1 from retail.club_puntos_movimientos m
                               where m.clienta_id = p_clienta_id and m.tipo = 'cumple' and m.anio = extract(year from v_hoy)::smallint
                                 and not exists (select 1 from retail.club_puntos_movimientos r where r.tipo = 'revierte' and r.de_movimiento_id = m.id));

  return v_config || jsonb_build_object(
    'miembro', true,
    'saldo', v_saldo,
    'valor_saldo', retail.fn_club_puntos_valor(v_saldo, v_hoy),
    'cumple_dia', v_ficha.cumple_dia,
    'cumple_mes', v_ficha.cumple_mes,
    'regalo_disponible', v_regalo,
    'cupones', coalesce((select jsonb_agg(jsonb_build_object('codigo', k.codigo, 'valor', k.valor, 'compra_minima', k.compra_minima, 'vence_el', k.vence_el)
                                          order by k.vence_el, k.creado_en)
                           from retail.club_cupones k
                          where k.clienta_id = p_clienta_id and k.estado = 'activo' and k.vence_el >= v_hoy), '[]'::jsonb));
end;
$$;
comment on function retail.resumen_puntos_caja(uuid) is
  'Lo que la caja muestra de los puntos de una clienta: la configuración vigente (siempre) y, si es miembro, su saldo y lo que valen, su regalo de cumpleaños y sus cupones vivos con su código. Libera lo vencido antes de leer. Solo con el módulo Vender o Clientas.';
revoke all on function retail.resumen_puntos_caja(uuid) from public, anon;
grant execute on function retail.resumen_puntos_caja(uuid) to authenticated;
