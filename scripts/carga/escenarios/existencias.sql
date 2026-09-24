-- Existencias / Productos: primera página, la mitad de las veces con búsqueda.
\set a random(0, 59)
\set q random(1, 3000)
begin;
select set_config('request.jwt.claim.sub', auth_user_id::text, true),
       set_config('request.headers', json_build_object('x-responsable', persona_id, 'x-ubicacion', ubicacion_id)::text, true),
       set_config('carga.ub', ubicacion_id::text, true)
from public._carga_actores where i = :a;
select set_config('carga.q', (:q)::text, true);
set local role authenticated;
set local statement_timeout = '8s';
set local lock_timeout = '8s';
do $$ begin
  perform count(*) from retail.fn_productos(case when current_setting('carga.q')::int % 2 = 0 then 'carga ' || lpad(current_setting('carga.q'), 5, '0') end,
    null, null, null, null, null, null, 1, 50, null, null, null);
exception when others or query_canceled then
  perform public._carga_error('existencias', sqlstate, sqlerrm || ' | q=' || current_setting('carga.q'));
end $$;
commit;
