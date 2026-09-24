-- Abrir Vender: versión del catálogo, caja abierta, UNA página del catálogo (1.000 variantes con sus embeds, como
-- PostgREST) y UNA del stock de la tienda. La web pide ~24 + ~24 páginas así cuando el catálogo ya no entra en la caché.
\set a random(0, 59)
\set p random(0, 23)
begin;
select set_config('request.jwt.claim.sub', auth_user_id::text, true),
       set_config('request.headers', json_build_object('x-responsable', persona_id, 'x-ubicacion', ubicacion_id)::text, true),
       set_config('carga.ub', ubicacion_id::text, true)
from public._carga_actores where i = :a;
select set_config('carga.p', (:p)::text, true);
set local role authenticated;
set local statement_timeout = '8s';
set local lock_timeout = '8s';
do $$ begin
  perform retail.fn_catalogo_version();
  perform id from retail.cajas where ubicacion_id = current_setting('carga.ub')::uuid and estado = 'abierta';
  perform count(*) from (select v.id, v.sku, v.codigo, v.color_codigo, v.precio, v.activo,
    (select row_to_json(t) from (select valor from retail.tallas where id = v.talla_id) t),
    (select row_to_json(p) from (select p.id, p.referencia,
       (select row_to_json(c) from (select nombre from retail.categorias where id = p.categoria_id) c) as categoria,
       (select coalesce(json_agg(f), '[]') from (select url, color_codigo from retail.producto_fotos where producto_id = p.id) f) as fotos
     from retail.productos p where p.id = v.producto_id) p),
    (select row_to_json(c) from (select nombre, hex from retail.colores where codigo = v.color_codigo) c),
    (select coalesce(json_agg(b), '[]') from (select codigo from retail.codigos_barras where variante_id = v.id) b)
    from retail.variantes v order by v.sku, v.id limit 1000 offset current_setting('carga.p')::int * 1000) x;
  perform count(*) from (select s.variante_id, s.cantidad, s.cantidad_apartada,
    (select tipo from retail.sububicaciones where id = s.sububicacion_id), v.activo
    from retail.stock s join retail.variantes v on v.id = s.variante_id
    where s.ubicacion_id = current_setting('carga.ub')::uuid order by s.variante_id
    limit 1000 offset current_setting('carga.p')::int * 1000) x;
exception when others or query_canceled then
  perform public._carga_error('abrir_vender', sqlstate, sqlerrm);
end $$;
commit;
