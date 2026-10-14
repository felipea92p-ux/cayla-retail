-- ADR-0372 (act. 2026-10-13 b, Felipe: «haz que el plan reste lo pedido en órdenes»): lo que falta llegar de las órdenes de compra.
--
-- EL PROBLEMA PRIMERO. El Plan de campaña muestra lo pedido en órdenes de compra («12 ya pedidas») pero no lo resta de «Comprar»: la
-- regla del 2026-10-12 (act. e) decía que restarlo contaría dos veces lo que ya entró al stock, porque las órdenes no sabían cuándo
-- llegaba la mercadería, y que pasaría a restar cuando Órdenes recibiera contra la orden. Eso ya existe: los envíos (fase 3,
-- `despachos`), la recepción (fase 4, `despacho_recibidos` y `despacho_diferencias`) y «Nos debe» (fase 5a, `proveedor_deuda_resoluciones`)
-- están en producción. Sin restar, quien arma Navidad con órdenes ya hechas ve «Comprar 200» cuando 150 ya vienen en camino.
--
-- QUÉ HACE. `fn_plan_compra_pedido` suma `por_llegar` por categoría y por orden: lo de la orden que todavía no está en ninguna tienda.
-- Por cada línea de una orden `generada` de la campaña:
--   por_llegar = lo que todavía no salió en un envío vigente   (cantidad − lo enviado en envíos en camino, abiertos o cerrados; nunca < 0)
--              + lo que va en un envío que todavía no se recibe (envíos en camino o abiertos: aún no entró al stock)
--              + lo que el proveedor debe reponer              (faltantes «No vino» de envíos cerrados, menos lo ya resuelto en «Nos debe»)
-- Lo que llegó en un envío cerrado ya está en el stock que el Plan resta: no se vuelve a contar. Lo que faltó porque se perdió o fue a
-- otra sede tampoco: no va a llegar por esta orden. La reposición de un «No vino» entra al stock y, en el mismo acto, salda su deuda
-- (`recibir_despacho`, fase 5a): deja de estar por llegar justo cuando empieza a estar en el stock.
-- La web (`lib/plan-compra-pedido.ts`, `armarFilas`) resta `por_llegar` de lo que hay que comprar. `unidades` (lo pedido) no cambia.
--
-- DECIDÍ: medir por línea de la orden, con los mismos estados de envío que usa Órdenes para «enviado» (`fn_orden_compra_detalle`).
-- DESCARTÉ: (a) restar todo lo pedido sin mirar los envíos: lo que ya llegó estaría dos veces, en el stock y en lo pedido;
--   (b) partir de max(pedido, facturado) como «por enviar» en Órdenes: el Plan muestra lo pedido y restar más de lo que dice «ya pedidas»
--   no se podría explicar en la fila; si un proveedor factura de más, esas prendas se ven cuando llegan;
--   (c) contar un faltante «No vino» como perdido: «Nos debe» lo trata como una deuda por reponer (decisiones 14 y 24 de ADR-0362).
-- SE ROMPE SI: una orden para Navidad llega antes de la campaña (entrega en noviembre): no es «de la campaña» por sus fechas (act. e) y
--   lo que viene en camino no se resta hasta que llega y entra al stock; o si la fase 5b agrega otra forma de saldar una deuda que sí
--   traiga prendas: hoy toda resolución de una deuda la saca de «por llegar».
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, sin políticas ni `alter` de tablas: solo reescribe una función de
-- lectura (mismo nombre, mismos argumentos y mismo tipo de retorno). El candado de abajo aborta SIN TOCAR NADA si la función viva no es
-- la de 20261012224000 ni esta: alguien la cambió y hay que mirar antes. Se puede pegar dos veces. El bloque final comprueba que quedó.

set lock_timeout = '3s';

do $candado$
declare
  v_md5 text;
begin
  for v_md5 in select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('retail.fn_plan_compra_pedido(uuid)') loop
    exit;
  end loop;
  if v_md5 is not null and v_md5 not in ('722b26b161576cb11c9e54a139cc7fb5', 'bd7ca122bda0933b1de184b920f2e653') then
    raise exception 'retail.fn_plan_compra_pedido no es la de 20261012224000 ni la de esta migración (md5 %): no se pisa sin mirar.', v_md5;
  end if;
end;
$candado$;

create or replace function retail.fn_plan_compra_pedido(p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_desde date;
  v_hasta date;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Ver el plan de campaña necesita el módulo «Plan de campaña» en tu rol' using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  for v_desde, v_hasta in select p.desde, p.hasta from retail.planes_compra p where p.id = p_plan_id loop exit; end loop;
  if v_desde is null then
    return null;
  end if;

  return (
    with ordenes as (
      select o.id, o.numero, o.fecha_emision, o.fecha_entrega_estimada, pv.nombre as proveedor,
             coalesce(u.nombre, 'Por repartir') as destino
        from retail.ordenes_compra o
        join retail.proveedores pv on pv.id = o.proveedor_id
        left join retail.ubicaciones u on u.id = o.ubicacion_destino_id
       where o.estado = 'generada'
         and coalesce(o.fecha_entrega_estimada, o.fecha_emision) between v_desde and v_hasta
    ),
    lineas as (
      select i.orden_compra_id, i.categoria_id, i.cantidad, i.subtotal,
             greatest(i.cantidad - env.enviado, 0) + env.en_camino + greatest(coalesce(deu.pendiente, 0), 0) as por_llegar
        from retail.orden_compra_items i
        cross join lateral (
          select coalesce(sum(di.cantidad), 0)::integer as enviado,
                 coalesce(sum(di.cantidad) filter (where d.estado in ('en_camino', 'abierto')), 0)::integer as en_camino
            from retail.despacho_items di
            join retail.despachos d on d.id = di.despacho_id
           where di.orden_compra_item_id = i.id
             and d.estado in ('en_camino', 'abierto', 'cerrado')
        ) env
        left join lateral (
          select sum(x.cantidad - coalesce((select sum(r.cantidad) from retail.proveedor_deuda_resoluciones r where r.diferencia_id = x.id), 0))::integer as pendiente
            from retail.despacho_diferencias x
            join retail.despacho_items di on di.id = x.despacho_item_id
            join retail.despachos d on d.id = x.despacho_id
           where di.orden_compra_item_id = i.id
             and x.tipo = 'faltante'
             and x.causa = 'no_vino'
             and d.estado = 'cerrado'
        ) deu on true
       where i.orden_compra_id in (select id from ordenes)
    )
    select jsonb_build_object(
      'ordenes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', o.id, 'numero', o.numero, 'proveedor', o.proveedor, 'destino', o.destino,
                 'emision', o.fecha_emision, 'entrega', o.fecha_entrega_estimada,
                 'unidades', (select coalesce(sum(l.cantidad), 0) from lineas l where l.orden_compra_id = o.id),
                 'por_llegar', (select coalesce(sum(l.por_llegar), 0) from lineas l where l.orden_compra_id = o.id),
                 'total', (select coalesce(round(sum(l.subtotal), 2), 0) from lineas l where l.orden_compra_id = o.id))
               order by coalesce(o.fecha_entrega_estimada, o.fecha_emision), o.numero)
          from ordenes o), '[]'::jsonb),
      'categorias', coalesce((
        select jsonb_agg(jsonb_build_object('c', g.categoria_id, 'unidades', g.unidades, 'por_llegar', g.por_llegar, 'soles', g.soles, 'ordenes', g.ordenes))
          from (select l.categoria_id, sum(l.cantidad)::integer as unidades, sum(l.por_llegar)::integer as por_llegar,
                       round(sum(l.subtotal), 2) as soles,
                       jsonb_agg(distinct (select o.numero from ordenes o where o.id = l.orden_compra_id)) as ordenes
                  from lineas l group by l.categoria_id) g), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function retail.fn_plan_compra_pedido(uuid) from public, anon;
grant execute on function retail.fn_plan_compra_pedido(uuid) to authenticated, service_role;
comment on function retail.fn_plan_compra_pedido(uuid) is
  'ADR-0372: lo pedido en órdenes de compra (generadas) que llegan dentro de las fechas de la campaña, por categoría y por orden, y lo que de eso todavía no está en ninguna tienda (por_llegar: lo que no salió, lo que va en un envío sin recibir y lo que el proveedor debe reponer). El Plan resta por_llegar de «Comprar». Pide el módulo plan_compra.';

-- Comprobación: la función nueva es la que quedó.
do $comprobar$
begin
  if position('por_llegar' in pg_get_functiondef('retail.fn_plan_compra_pedido(uuid)'::regprocedure)) = 0 then
    raise exception 'fn_plan_compra_pedido no quedó con por_llegar';
  end if;
end;
$comprobar$;
