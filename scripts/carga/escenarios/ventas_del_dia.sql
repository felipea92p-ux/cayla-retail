-- Vender ▸ «ventas de hoy» y los totales del historial del mes.
\set a random(0, 59)
begin;
select set_config('request.jwt.claim.sub', auth_user_id::text, true),
       set_config('request.headers', json_build_object('x-responsable', persona_id, 'x-ubicacion', ubicacion_id)::text, true),
       set_config('carga.ub', ubicacion_id::text, true)
from public._carga_actores where i = :a;
set local role authenticated;
set local statement_timeout = '8s';
set local lock_timeout = '8s';
do $$ begin
  perform count(*) from retail.fn_ventas_del_dia(current_setting('carga.ub')::uuid);
  perform count(*) from retail.fn_totales_historial_ventas(now() - interval '30 days', now(), current_setting('carga.ub')::uuid, null, null, null, null, false, null);
exception when others or query_canceled then
  perform public._carga_error('ventas_del_dia', sqlstate, sqlerrm);
end $$;
commit;
