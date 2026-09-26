-- Cobrar en caja: 1 a 3 prendas; dos elegidas con Zipf (pocas muy vendidas: una colección nueva) para que dos
-- cajas de la misma tienda choquen en la misma prenda, que es donde aparecen esperas y bloqueos.
\set a random(0, 59)
\set v1 random_zipfian(0, 23999, 1.2)
\set v2 random_zipfian(0, 23999, 1.2)
\set v3 random(0, 23999)
\set n random(1, 3)
begin;
select set_config('request.jwt.claim.sub', auth_user_id::text, true),
       set_config('request.headers', json_build_object('x-responsable', persona_id, 'x-ubicacion', ubicacion_id)::text, true),
       set_config('carga.ub', ubicacion_id::text, true)
from public._carga_actores where i = :a;
select set_config('carga.v', (:v1)::text || ',' || (:v2)::text || ',' || (:v3)::text, true), set_config('carga.n', (:n)::text, true);
set local role authenticated;
set local statement_timeout = '8s';
set local lock_timeout = '8s';
do $$ begin
  perform retail.registrar_venta(current_setting('carga.ub')::uuid, x.items, x.pagos, p_token => gen_random_uuid())
  from (select jsonb_agg(jsonb_build_object('variante_id', id, 'cantidad', 1, 'precio_unitario', precio)) as items,
               jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', sum(precio))) as pagos
        from (select v.id, v.precio from public._carga_variantes v
              where v.i = any (string_to_array(current_setting('carga.v'), ',')::int[])
              limit current_setting('carga.n')::int) it) x;
exception when others or query_canceled then
  perform public._carga_error('vender', sqlstate, sqlerrm);
end $$;
commit;
