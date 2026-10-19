-- ============================================================================
-- 20261019213000_club_puntos_tienda_mis_puntos.sql — CAYLA V2 · Club · puntos, actividad 6 de 12: «Mi Club» en la tienda web
-- Sigue a `20261019205000_club_puntos_resumen_caja.sql`. Solo una función de LECTURA nueva para la tienda: no toca tablas ni
-- funciones existentes (`tienda_mi_club` sigue entregando favoritos, esperas y novedades; los puntos vienen de aquí).
--
-- EL PROBLEMA. «Mi perfil» de la tienda tiene que decirle al cliente, sin que calcule nada: cuántos puntos tiene y cuánto valen,
-- cómo los gana, cuáles son sus cupones vivos con su código (para enseñarlos en caja o pegarlos al pagar en la web) y qué le pasó a
-- sus puntos últimamente. Todo lo decide la base; la tienda solo lo pone en palabras.
--
-- QUÉ HACE: `tienda_puntos_config()` devuelve la configuración vigente para lo que la tienda dice a TODOS (la portada, los Términos):
-- sin usuario y sin datos de nadie. `tienda_mis_puntos(usuario_web)` devuelve un jsonb con la configuración vigente, el saldo y lo que vale, el regalo de
-- cumpleaños de este mes, los cupones vivos y los últimos movimientos. Antes de leer libera lo vencido de esa miembro, para que
-- «Mi Club» nunca muestre puntos que están en un cupón pasado de fecha. Devuelve `null` sin cuenta; con la cuenta pero sin ficha
-- activa del Club, solo la configuración y `miembro: false`.
--
-- DECIDÍ: `pierde_el` es el último día en que se guardan sus datos y sus puntos (Términos 5.7): lo dice la misma cuenta que usa el cron.
-- DECIDÍ: de cada movimiento solo sale el tipo, los puntos, el día de Lima y, si es de un cupón, su código. Nunca la venta, la nota
--   ni quién lo registró: la tienda web no debe ver nada de la operación interna.
-- CÓMO SE PEGA: este archivo SOLO en el SQL Editor de producción, después de `20261019205000`. Idempotente. `lock_timeout` 3 s.
-- CAÍDA EXTERNA. Nada llama a la red. Solo la ejecuta `tienda_web`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Hasta cuándo se guardan sus datos y sus puntos (la conservación de 3 años, Términos 5.7) ----------
-- La MISMA cuenta la usa el cron que elimina (`fn_club_anonimizar_inactivas`, actividad 9) y lo que «Mi Club» le dice a la persona, para que
-- la fecha que ella ve sea la que de verdad corre: 3 años desde su última compra (sin compras, desde que se registró o se unió).
create or replace function retail.fn_club_conservacion_hasta(p_clienta_id uuid)
returns date
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select ((greatest(c.created_at, coalesce(c.club_desde, c.created_at),
                    coalesce((select max(v.created_at) from retail.ventas v where v.cliente_id = c.id and v.estado = 'completada'), c.created_at))
           + interval '3 years') at time zone 'America/Lima')::date
    from retail.clientas c where c.id = p_clienta_id;
$$;
comment on function retail.fn_club_conservacion_hasta(uuid) is
  'El último día en que se guardan los datos y los puntos de una ficha: 3 años desde su última compra (o desde que se registró o se unió). Al día siguiente la conservación la anonimiza y sus puntos se eliminan con ella. Interna: la usan el cron y «Mi Club».';
revoke all on function retail.fn_club_conservacion_hasta(uuid) from public, anon, authenticated;

-- ---------- 1. Lo que muestra «Mi Club» ----------
create or replace function retail.tienda_mis_puntos(p_usuario_web_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_clienta uuid;
  v_cfg retail.club_puntos_config;
  v_config jsonb;
  v_ficha record;
  v_saldo integer;
  v_regalo boolean;
begin
  if p_usuario_web_id is null then
    return null;
  end if;
  select w.clienta_id into v_clienta
    from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id and w.cerrada_en is null;
  if v_clienta is null then
    return null;
  end if;

  v_cfg := retail.fn_club_puntos_config(v_hoy);
  v_config := jsonb_build_object(
    'puntos_por_sol', v_cfg.puntos_por_sol, 'soles_por_100', v_cfg.soles_por_100, 'canje_minimo', v_cfg.canje_minimo_puntos,
    'compra_minima_x', v_cfg.compra_minima_x, 'vigencia_dias', v_cfg.vigencia_cupon_dias, 'regalo_cumple', v_cfg.regalo_cumple_puntos);

  select c.club_desde, c.anonimizada, c.archivada_en, c.cumple_dia, c.cumple_mes into v_ficha
    from retail.clientas c where c.id = v_clienta;
  if not found or v_ficha.club_desde is null or v_ficha.anonimizada or v_ficha.archivada_en is not null then
    return v_config || jsonb_build_object('miembro', false);
  end if;

  -- Lo vencido de esta miembro vuelve a su saldo antes de leerlo.
  perform retail.fn_club_cupones_vencer(v_clienta);
  v_saldo := retail.fn_club_puntos_saldo(v_clienta);

  -- El regalo: su mes y sin uno vivo este año (uno ya revertido no cuenta: se volvió a poder dar). Igual que la caja.
  v_regalo := v_cfg.regalo_cumple_puntos > 0
              and v_ficha.cumple_mes = extract(month from v_hoy)::smallint
              and not exists (select 1 from retail.club_puntos_movimientos m
                               where m.clienta_id = v_clienta and m.tipo = 'cumple' and m.anio = extract(year from v_hoy)::smallint
                                 and not exists (select 1 from retail.club_puntos_movimientos r where r.tipo = 'revierte' and r.de_movimiento_id = m.id));

  return v_config || jsonb_build_object(
    'miembro', true,
    'saldo', v_saldo,
    'valor_saldo', retail.fn_club_puntos_valor(v_saldo, v_hoy),
    'cumple_dia', v_ficha.cumple_dia,
    'cumple_mes', v_ficha.cumple_mes,
    'regalo_disponible', v_regalo,
    'pierde_el', retail.fn_club_conservacion_hasta(v_clienta),
    'cupones', coalesce((select jsonb_agg(jsonb_build_object('codigo', k.codigo, 'puntos', k.puntos, 'valor', k.valor,
                                                             'compra_minima', k.compra_minima, 'vence_el', k.vence_el)
                                          order by k.vence_el, k.creado_en)
                           from retail.club_cupones k
                          where k.clienta_id = v_clienta and k.estado = 'activo' and k.vence_el >= v_hoy), '[]'::jsonb),
    'movimientos', coalesce((select jsonb_agg(jsonb_build_object('tipo', m.tipo, 'puntos', m.puntos,
                                                                 'dia', (m.created_at at time zone 'America/Lima')::date,
                                                                 'codigo', case when m.tipo in ('canje', 'devuelve') then m.referencia end)
                                              order by m.created_at desc, m.id)
                               from (select * from retail.club_puntos_movimientos
                                      where clienta_id = v_clienta order by created_at desc, id limit 15) m), '[]'::jsonb));
end;
$$;
comment on function retail.tienda_mis_puntos(uuid) is
  'Lo que «Mi Club» de la tienda web muestra de los puntos de una cuenta: la configuración vigente y, si es miembro, su saldo y lo que vale, el regalo de cumpleaños de este mes, sus cupones vivos con su código y sus últimos movimientos (sin venta, nota ni responsable). Libera lo vencido antes de leer. null sin cuenta. La llama el rol tienda_web con el usuario ya verificado por la web.';
revoke all on function retail.tienda_mis_puntos(uuid) from public, anon, authenticated;
do $grant$
begin
  if exists (select 1 from pg_roles where rolname = 'tienda_web') then
    grant execute on function retail.tienda_mis_puntos(uuid) to tienda_web;
  end if;
end;
$grant$;

-- ---------- 2. La configuración para lo que la tienda dice a todos ----------
create or replace function retail.tienda_puntos_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_cfg retail.club_puntos_config;
begin
  v_cfg := retail.fn_club_puntos_config((now() at time zone 'America/Lima')::date);
  return jsonb_build_object(
    'puntos_por_sol', v_cfg.puntos_por_sol, 'soles_por_100', v_cfg.soles_por_100, 'canje_minimo', v_cfg.canje_minimo_puntos,
    'compra_minima_x', v_cfg.compra_minima_x, 'vigencia_dias', v_cfg.vigencia_cupon_dias, 'regalo_cumple', v_cfg.regalo_cumple_puntos);
end;
$$;
comment on function retail.tienda_puntos_config() is
  'La configuración vigente de los puntos del Club para lo que la tienda web dice a todos (portada, Términos): sin usuario y sin datos de nadie. La llama el rol tienda_web.';
revoke all on function retail.tienda_puntos_config() from public, anon, authenticated;
do $grant$
begin
  if exists (select 1 from pg_roles where rolname = 'tienda_web') then
    grant execute on function retail.tienda_puntos_config() to tienda_web;
  end if;
end;
$grant$;
