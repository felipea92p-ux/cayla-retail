-- ============================================================================
-- 20261019215000_club_puntos_modulo_beneficios.sql — CAYLA V2 · Club · puntos, actividad 8 de 12: el módulo «Beneficios del club»
-- Sigue a `20261019213000_club_puntos_tienda_mis_puntos.sql`. Un módulo nuevo (Clientes ▸ Beneficios del club) y una función de LECTURA.
--
-- EL PROBLEMA. Felipe decidió que lo que se ofrece al cliente (cuánto vale cada punto, desde cuándo se canjea, cuánto dura un cupón, el
-- regalo de cumpleaños) sea configurable SIN deploy, en un módulo propio y no escondido en una hoja de Avisos. Quien lo cambia tiene que
-- ver, antes de guardar, lo que ese cambio le cuesta al negocio (cuánto debe en puntos, a cuánto equivale cada punto en descuento) y qué
-- cambió la última vez. Hoy la configuración se guarda con `guardar_beneficios_puntos` (actividad 1), pero no hay dónde leerla entera.
--
-- QUÉ HACE
--   1. El módulo `beneficios_club` (grupo Clientes, después de «Avisos del club»). Nace SIN rol (solo el líder) y delegable (Felipe,
--      ADR-0253: ningún módulo se limita al líder): `guardar_beneficios_puntos` y `resumen_beneficios_puntos` piden el MÓDULO, no al líder.
--      El líder decide después a qué rol dárselo.
--   2. `resumen_beneficios_puntos()`: lo que la pantalla muestra, en un solo jsonb: la configuración vigente, la que ya está programada
--      (un cambio de lo que valen los puntos rige 15 días después), las cifras del programa (puntos en circulación, lo que se debe en
--      soles si todos canjearan hoy, miembros con puntos, cupones vivos, lo canjeado y lo repartido este mes) y los últimos cambios con
--      quién los hizo. Solo lee; con el módulo.
--
-- DECIDÍ: la deuda en soles cuenta cientos completos por miembro (lo mismo que vale el saldo de cada una, `fn_club_puntos_valor`): sumar
--   los puntos y dividir sobrestimaría cuando cada saldo deja un resto. Las cifras del mes son del mes de Lima.
-- DESCARTÉ: que el módulo sea «solo líder por ahora» (`delegable = false`): contradice la regla de Felipe del 2026-09-28 (ADR-0253). Lo que
--   sí queda del líder es dar el módulo a un rol, en Roles y accesos.
-- CÓMO SE PEGA: este archivo SOLO en el SQL Editor de producción, después de `20261019213000`. Idempotente. `lock_timeout` 3 s. Sin
--   políticas ni `drop trigger`. NO escribe en `rol_modulos`: el módulo nace sin rol.
-- CAÍDA EXTERNA. Nada llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El módulo ----------
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('beneficios_club', 'Clientes', 'Beneficios del club',
   'Ver y cambiar los beneficios del Club: cuánto vale cada punto, desde cuántos se canjea, cuánto dura un cupón y el regalo de cumpleaños, con lo que cuesta al negocio y los últimos cambios. Un cambio de lo que valen los puntos rige 15 días después de avisarlo',
   76, false, true)
on conflict (clave) do nothing;

-- ---------- 2. Lo que muestra la pantalla ----------
create or replace function retail.resumen_beneficios_puntos()
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_mes date := date_trunc('month', now() at time zone 'America/Lima')::date;
  v_vigente retail.club_puntos_config;
  v_programada retail.club_puntos_config;
begin
  if not retail.fn_ve_modulo('beneficios_club') then
    raise exception 'No tienes permiso para ver los beneficios del club.' using errcode = '42501', hint = 'sin_permiso';
  end if;

  v_vigente := retail.fn_club_puntos_config(v_hoy);
  -- La última versión ya programada (rige en el futuro). Si hay varias, la que quedará al final.
  select c.* into v_programada from retail.club_puntos_config c
   where c.vigente_desde > v_hoy order by c.vigente_desde desc, c.id desc limit 1;

  return jsonb_build_object(
    'vigente', jsonb_build_object(
      'desde', v_vigente.vigente_desde, 'puntos_por_sol', v_vigente.puntos_por_sol, 'soles_por_100', v_vigente.soles_por_100,
      'canje_minimo', v_vigente.canje_minimo_puntos, 'compra_minima_x', v_vigente.compra_minima_x,
      'vigencia_dias', v_vigente.vigencia_cupon_dias, 'regalo_cumple', v_vigente.regalo_cumple_puntos, 'tope_costo_pct', v_vigente.tope_costo_pct),
    'programada', case when v_programada.id is null then null else jsonb_build_object(
      'desde', v_programada.vigente_desde, 'puntos_por_sol', v_programada.puntos_por_sol, 'soles_por_100', v_programada.soles_por_100,
      'canje_minimo', v_programada.canje_minimo_puntos, 'compra_minima_x', v_programada.compra_minima_x,
      'vigencia_dias', v_programada.vigencia_cupon_dias, 'regalo_cumple', v_programada.regalo_cumple_puntos, 'tope_costo_pct', v_programada.tope_costo_pct) end,
    'cifras', jsonb_build_object(
      'puntos_en_circulacion', coalesce((select sum(s.saldo) from retail.club_puntos_saldos s), 0),
      'miembros_con_puntos', (select count(*) from retail.club_puntos_saldos s where s.saldo > 0),
      -- Lo que vale lo que ya se ganó si todos canjearan hoy: cientos completos por miembro, como el saldo de cada una.
      'deuda_soles', coalesce((select sum(floor(s.saldo / 100.0)) from retail.club_puntos_saldos s), 0) * v_vigente.soles_por_100,
      'cupones_vivos', (select count(*) from retail.club_cupones k where k.estado = 'activo' and k.vence_el >= v_hoy),
      'cupones_vivos_soles', coalesce((select sum(k.valor) from retail.club_cupones k where k.estado = 'activo' and k.vence_el >= v_hoy), 0),
      'canjeado_mes_cupones', (select count(*) from retail.club_cupones k where k.estado = 'usado' and (k.usado_en at time zone 'America/Lima')::date >= v_mes),
      'canjeado_mes_soles', coalesce((select sum(k.valor) from retail.club_cupones k where k.estado = 'usado' and (k.usado_en at time zone 'America/Lima')::date >= v_mes), 0),
      'repartido_mes_puntos', coalesce((select sum(m.puntos) from retail.club_puntos_movimientos m
                                         where m.tipo in ('compra', 'cumple') and (m.created_at at time zone 'America/Lima')::date >= v_mes), 0)),
    'historial', coalesce((select jsonb_agg(jsonb_build_object(
                                      'cuando', h.hecho_en, 'desde', h.detalle ->> 'vigente_desde',
                                      'quien', nullif(btrim(coalesce(p.nombres, '') || ' ' || coalesce(p.apellidos, '')), ''),
                                      'antes', h.detalle -> 'antes', 'despues', h.detalle -> 'despues')
                                    order by h.hecho_en desc, h.id desc)
                             from (select * from retail.configuracion_historial where que = 'puntos_club' order by hecho_en desc, id desc limit 10) h
                             left join public.personas p on p.id = h.hecho_por), '[]'::jsonb));
end;
$$;
comment on function retail.resumen_beneficios_puntos() is
  'Lo que muestra Clientes ▸ Beneficios del club: la configuración vigente y la ya programada, las cifras del programa (puntos en circulación, lo que se debe en soles, cupones vivos, lo canjeado y repartido este mes) y los últimos 10 cambios con quién los hizo. Solo lee; con el módulo beneficios_club.';
revoke all on function retail.resumen_beneficios_puntos() from public, anon;
grant execute on function retail.resumen_beneficios_puntos() to authenticated;

reset lock_timeout;
notify pgrst, 'reload schema';
