-- Historial de Apartados acotado por fecha (Felipe 2026-10-10).
--
-- EL PROBLEMA. El Historial de Apartados abre en «Todos» y `buscar_separaciones` traía todos los apartados de la tienda
-- (hasta 200). Con el tiempo lo ya cerrado crece sin fin y la pantalla se vuelve lenta y el tope de 200 dejaba fuera
-- lo más viejo sin que nadie lo eligiera.
--
-- LA DECISIÓN. `buscar_separaciones` recibe un rango opcional (`p_desde`, `p_hasta`, días de Lima, ambos incluidos) que
-- acota SOLO lo cerrado (entregado o devuelto) por el DÍA EN QUE SE HIZO el apartado. Lo que sigue esperando algo
-- (abierto, o liberado con el adelanto por devolver) sale siempre, sea de la fecha que sea: Entregar, «Necesitan algo» y
-- el conteo de la pestaña lo necesitan, y un abono (2–3 días cada vez, sin tope) o un adelanto que nadie vino a cobrar
-- pueden pasar de 30 días. Sin rango (los dos `null`), la función responde igual que antes: Caja y el buscador de
-- Apartar la siguen llamando así.
--
-- DESCARTÉ. Acotar también lo abierto: un apartado vencido de hace 35 días desaparecería de «Necesitan algo». Filtrar
-- por el día en que se cerró: cada final tiene su propia columna (`entregada_en`, `devuelta_en`) y la regla se explica
-- peor; Felipe eligió el día en que se hizo. Un índice por (`ubicacion_id`, `created_at`): son 3 tiendas con decenas
-- de apartados al mes, el filtro por tienda ya deja pocas filas.
--
-- PRODUCCIÓN. Solo la función: cambia su firma (dos parámetros nuevos), así que va `drop function` + `create`
-- (drop function no toma las tablas de auth). Sin políticas. Una sola parte. Idempotente. Va después de
-- 20260927110000 (la versión con el estante, que esta reemplaza tal cual salvo el rango).

set lock_timeout = '3s';
set search_path = retail, public, extensions;

drop function if exists retail.buscar_separaciones(uuid, text, text[]);
drop function if exists retail.buscar_separaciones(uuid, text, text[], date, date);
create function retail.buscar_separaciones(
  p_ubicacion_id uuid,
  p_texto text default null,
  p_estados text[] default null,
  p_desde date default null,
  p_hasta date default null
)
 RETURNS TABLE(id uuid, codigo text, estado text, clienta_nombres text, clienta_apellidos text, clienta_celular text, clienta_dni text, asesora text, total numeric, adelanto numeric, saldo numeric, vence_el date, extensiones smallint, creada_en timestamp with time zone, devolucion_medio text, devolucion_numero text, devolucion_cci_final text, liberada_sola boolean, comprobante_anticipo text, comprobante_final text, nota_credito text, items jsonb, pagos jsonb, estante text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
  select s.id, s.codigo, s.estado, s.clienta_nombres, s.clienta_apellidos, s.clienta_celular, s.clienta_dni,
         nullif(btrim(coalesce(pa.nombres, '') || ' ' || coalesce(pa.apellidos, '')), ''),
         s.total, s.adelanto, case when s.estado = 'abierta' then s.total - s.adelanto else 0 end,
         s.vence_el, s.extensiones, s.created_at,
         s.devolucion_medio, s.devolucion_numero, right(s.devolucion_cci, 4),
         (s.liberada_en is not null and s.liberada_por is null),
         ca.serie || '-' || lpad(ca.numero::text, 6, '0'),
         (select cf.serie || '-' || lpad(cf.numero::text, 6, '0') from comprobantes cf where cf.venta_id = s.venta_id and s.venta_id is not null order by cf.created_at limit 1),
         cn.serie || '-' || lpad(cn.numero::text, 6, '0'),
         (select jsonb_agg(jsonb_build_object('id', si.id, 'variante_id', si.variante_id, 'sku', v.sku, 'referencia', p.referencia,
                                              'cantidad', si.cantidad, 'precio_unitario', si.precio_unitario,
                                              'descuento_unitario', si.descuento_unitario) order by v.sku)
            from separacion_items si join variantes v on v.id = si.variante_id join productos p on p.id = v.producto_id
           where si.separacion_id = s.id),
         (select jsonb_agg(jsonb_build_object('metodo', sp.metodo, 'monto', sp.monto, 'fecha', sp.created_at, 'abono', sp.abono_id is not null) order by sp.created_at)
            from separacion_pagos sp where sp.separacion_id = s.id),
         s.estante
    from separaciones s
    left join public.personas pa on pa.id = s.asesora_id
    left join comprobantes ca on ca.id = s.comprobante_anticipo_id
    left join comprobantes cn on cn.id = s.nota_credito_id
   where s.ubicacion_id = p_ubicacion_id
     and fn_puede_operar_ubicacion(p_ubicacion_id)
     and (p_estados is null or s.estado = any (p_estados))
     -- El rango acota solo lo cerrado; lo que espera algo (abierto o por devolver) sale siempre.
     and (
       s.estado in ('abierta', 'liberada')
       or ((p_desde is null or (s.created_at at time zone 'America/Lima')::date >= p_desde)
           and (p_hasta is null or (s.created_at at time zone 'America/Lima')::date <= p_hasta))
     )
     and (
       nullif(btrim(coalesce(p_texto, '')), '') is null
       or s.id::text = btrim(p_texto)
       or s.codigo ilike '%' || btrim(p_texto) || '%'
       or (s.clienta_nombres || ' ' || s.clienta_apellidos) ilike '%' || btrim(p_texto) || '%'
       or s.clienta_dni = regexp_replace(p_texto, '\D', '', 'g')
       or s.clienta_celular = regexp_replace(p_texto, '\D', '', 'g')
       or (ca.serie || '-' || lpad(ca.numero::text, 6, '0')) ilike '%' || btrim(p_texto) || '%'
     )
   order by case s.estado when 'liberada' then 0 when 'abierta' then 1 else 2 end, s.vence_el, s.created_at
   limit 200;
$function$;

revoke all on function retail.buscar_separaciones(uuid, text, text[], date, date) from public, anon;
grant execute on function retail.buscar_separaciones(uuid, text, text[], date, date) to authenticated;
