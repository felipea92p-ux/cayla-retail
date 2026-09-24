-- Pantalla Caja: resumen del turno y efectivo esperado.
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
  perform retail.fn_resumen_caja(c.id), retail.fn_esperado_caja(c.id)
  from retail.cajas c where c.ubicacion_id = current_setting('carga.ub')::uuid and c.estado = 'abierta';
exception when others or query_canceled then
  perform public._carga_error('caja', sqlstate, sqlerrm);
end $$;
commit;
