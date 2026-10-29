-- ============================================================================
-- 20261029043000 — Lo que CAYLA cobró de un apartado o un pedido web con prendas de CLAURE también se le debe a Claudia (ADR-0560; actividad 7)
--
-- EL PROBLEMA PRIMERO. La cuenta con CLAURE (actividad 1) suma lo que cada venta de CLAURE cobró en una cuenta de CAYLA. Pero un APARTADO se cobra en abonos antes de
-- entregar la prenda, y un PEDIDO WEB se paga por adelantado: al entregar o despachar, la venta guarda ese adelanto como un pago de medio `anticipo` que no dice a qué cuenta
-- entró. La plata sí cayó en una cuenta de CAYLA —cada abono (`separacion_pagos`) y cada pago (`pedido_web_pagos`) sabe cuál—, y la cuenta con CLAURE no la veía: lo
-- adelantado por una prenda de Claudia no entraba a lo que se le debe. Felipe (2026-10-28): «apartados: cuando se entrega la prenda; pedido web: cuando se despacha».
--
-- CONTRATO (Liskov)
--   PROMETE: `fn_claure_filas` (la base de la pantalla CLAURE, de `fn_claure_cuenta` y del aviso del cierre de caja) suma también, por la parte de CLAURE de la venta, lo
--            cobrado en cuentas de CAYLA con los abonos de un apartado (`separacion_pagos`, no efectivo) y los pagos aprobados de un pedido web (`pedido_web_pagos`, no anulados,
--            no efectivo), FECHADO el día de la venta (la entrega o el despacho: cuando la prenda sale). Mientras la prenda no sale no hay venta y no se debe nada; un apartado
--            que se anula no deja venta. Lo demás de `fn_claure_filas` es EXACTAMENTE lo de la actividad 1 (misma firma, mismas columnas, mismos candados).
--   ASUME:   (a) la suma de los abonos de un apartado es su adelanto (`separaciones.adelanto`) y la de los pagos aprobados de un pedido web es lo que la venta guarda como
--            `anticipo`: se reparten por el valor de las líneas de CLAURE como cualquier otro pago; (b) un adelanto en efectivo no entra (el efectivo lo tiene Claudia, como en
--            la venta); (c) si un abono se devolvió al cliente (anulado), ya no está en `separacion_pagos`/`pedido_web_pagos` aprobados y no se cuenta.
--   NO HACE: no cambia ninguna tabla ni la web; el aviso del cierre y la pantalla CLAURE suben solos porque leen `fn_claure_filas`.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, después de 20261029041000 (y de 20261029004000, que crea la función). Un `create or replace function` sobre una función propia
-- (sin tablas ni políticas); idempotente. SE ROMPE SI: `separaciones.venta_id` o `pedidos_web.venta_id` dejan de apuntar a la venta de la entrega.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_claure_filas(p_ubics uuid[])
returns table (fecha date, origen text, medio text, cuenta_id uuid, cuenta_nombre text, ubicacion_id uuid,
               n_pagos integer, monto numeric, igv numeric, comision numeric, contado boolean)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_ubics uuid[] := p_ubics;
  v_casa uuid := retail.fn_empresa_casa_id();
  v_claure uuid;
  v_desde date;
begin
  select e.id, e.cuenta_corriente_desde into v_claure, v_desde from retail.empresas e where e.clave = 'claure' and e.activo;
  if v_claure is null or v_desde is null then
    return;
  end if;

  return query
  with sedes as (
    -- Donde opera CLAURE (hoy Lima) y que esta cuenta ve.
    select es.ubicacion_id from retail.empresa_sedes es where es.empresa_id = v_claure and es.ubicacion_id = any (v_ubics)
  ),
  lineas as (
    -- Cada venta completada con cuánto de su valor es de CLAURE (por línea, según el dueño real de cada unidad).
    select v.id as venta_id, v.ubicacion_id, (v.created_at at time zone 'America/Lima')::date as fecha,
           sum(i.subtotal) as total,
           coalesce(sum(i.subtotal) filter (where retail.fn_dueno_de_la_linea(i.id) = v_claure), 0) as de_claure
      from retail.ventas v
      join sedes s on s.ubicacion_id = v.ubicacion_id
      join retail.venta_items i on i.venta_id = v.id
     where v.estado = 'completada' and not coalesce(v.es_prueba, false)
       and (v.created_at at time zone 'America/Lima')::date >= v_desde
     group by v.id, v.ubicacion_id, v.created_at
  ),
  cobros as (
    -- Cada pago que no es efectivo, en la parte que corresponde a CLAURE, con la cuenta a la que entró (la misma regla del libro de dinero).
    select l.ubicacion_id, l.fecha, p.metodo as medio, p.id as pago_id, p.monto * l.de_claure / l.total as monto,
           coalesce(p.cuenta_dinero_id, retail.fn_cuenta_de_cobro(l.ubicacion_id, p.metodo, l.fecha)) as cuenta_id
      from lineas l join retail.venta_pagos p on p.venta_id = l.venta_id
     where l.de_claure > 0 and l.total > 0 and p.metodo in ('yape', 'plin', 'tarjeta', 'transferencia', 'qr')
    union all
    -- Un APARTADO (ADR-0141): su adelanto se cobró en abonos antes de la entrega; al entregar la prenda queda en la venta como medio `anticipo`, que no dice a qué cuenta
    -- entró. La plata cayó en la cuenta de cada abono (`separacion_pagos`), y se le debe a Claudia desde que la prenda SALE: el día de la venta (la entrega), no el del abono.
    select l.ubicacion_id, l.fecha, sp.metodo as medio, sp.id as pago_id, sp.monto * l.de_claure / l.total as monto,
           coalesce(sp.cuenta_dinero_id, retail.fn_cuenta_de_cobro(l.ubicacion_id, sp.metodo, l.fecha)) as cuenta_id
      from lineas l
      join retail.separaciones sx on sx.venta_id = l.venta_id
      join retail.separacion_pagos sp on sp.separacion_id = sx.id
     where l.de_claure > 0 and l.total > 0 and sp.metodo in ('yape', 'plin', 'tarjeta', 'transferencia')
    union all
    -- Un PEDIDO WEB: lo pagado antes del despacho queda en la venta como `anticipo`; igual, se le debe a Claudia cuando la prenda sale (el día de la venta). Solo los pagos
    -- aprobados y no anulados, en la cuenta donde cayeron.
    select l.ubicacion_id, l.fecha, pw.medio as medio, pw.id as pago_id, pw.monto * l.de_claure / l.total as monto,
           coalesce(pw.cuenta_dinero_id, retail.fn_cuenta_de_cobro(l.ubicacion_id, pw.medio, l.fecha)) as cuenta_id
      from lineas l
      join retail.pedidos_web pe on pe.venta_id = l.venta_id
      join retail.pedido_web_pagos pw on pw.pedido_id = pe.id and pw.estado = 'aprobado' and pw.anulado_en is null
     where l.de_claure > 0 and l.total > 0 and pw.medio in ('yape', 'plin', 'tarjeta', 'transferencia')
  ),
  devueltos as (
    -- Lo que CAYLA devolvió de una prenda de CLAURE, pagado desde una cuenta suya: baja lo que se le debe. Si la devolución se pagó en
    -- efectivo (de la caja de Claudia) no baja nada: la plata de la venta sigue en la cuenta de CAYLA y Claudia puso el reembolso.
    select dv.id as dev_id, dv.ubicacion_id, (dv.aprobado_en at time zone 'America/Lima')::date as fecha, dv.reembolso_metodo as medio,
           -(dv.reembolso_monto * x.de_claure / x.total) as monto,
           coalesce(dv.reembolso_cuenta_id,
                    retail.fn_cuenta_de_cobro(dv.ubicacion_id, dv.reembolso_metodo, (dv.aprobado_en at time zone 'America/Lima')::date)) as cuenta_id
      from retail.devoluciones dv
      join sedes s on s.ubicacion_id = dv.ubicacion_id
      cross join lateral (
        select sum(vi.subtotal / vi.cantidad * di.cantidad) as total,
               coalesce(sum(vi.subtotal / vi.cantidad * di.cantidad) filter (where retail.fn_dueno_de_la_linea(vi.id) = v_claure), 0) as de_claure
          from retail.devolucion_items di join retail.venta_items vi on vi.id = di.venta_item_id
         where di.devolucion_id = dv.id and vi.cantidad > 0
      ) x
     where dv.estado = 'aprobada' and dv.aprobado_en is not null
       and dv.reembolso_metodo in ('yape', 'plin', 'tarjeta', 'transferencia') and coalesce(dv.reembolso_monto, 0) > 0
       and (dv.aprobado_en at time zone 'America/Lima')::date >= v_desde
       and x.de_claure > 0 and x.total > 0
  ),
  agrupado as (
    select 'venta'::text as origen, c.fecha, c.medio, c.cuenta_id, c.ubicacion_id,
           count(distinct c.pago_id)::integer as n_pagos, round(sum(c.monto), 2) as monto
      from cobros c left join retail.cuentas_dinero cd on cd.id = c.cuenta_id
     where cd.id is null or cd.empresa_id = v_casa
     group by c.fecha, c.medio, c.cuenta_id, c.ubicacion_id
    union all
    select 'devolucion'::text, d.fecha, d.medio, d.cuenta_id, d.ubicacion_id,
           count(distinct d.dev_id)::integer, round(sum(d.monto), 2)
      from devueltos d left join retail.cuentas_dinero cd on cd.id = d.cuenta_id
     where cd.id is null or cd.empresa_id = v_casa
     group by d.fecha, d.medio, d.cuenta_id, d.ubicacion_id
  ),
  cambiados as (
    -- Un cambio con prendas de CLAURE (la devuelta o la nueva): no entra al saldo, se lista para revisarlo a mano.
    select cb.ubicacion_id, (cb.created_at at time zone 'America/Lima')::date as fecha, cb.metodo_pago_diferencia as medio,
           cb.diferencia as monto, cb.cuenta_dinero_id as cuenta_id
      from retail.cambios cb
      join sedes s on s.ubicacion_id = cb.ubicacion_id
     where (cb.created_at at time zone 'America/Lima')::date >= v_desde
       and (retail.fn_dueno_de_la_linea(cb.venta_item_id) = v_claure
            or exists (select 1 from retail.cambio_salidas cs
                         join retail.variantes va on va.id = cs.variante_id
                         join retail.productos pr on pr.id = va.producto_id
                        where cs.cambio_id = cb.id and pr.empresa_id = v_claure)
            or exists (select 1 from retail.variantes va
                         join retail.productos pr on pr.id = va.producto_id
                        where va.id = cb.variante_nueva_id and pr.empresa_id = v_claure))
  )
  select g.fecha, g.origen, g.medio, g.cuenta_id, cd.nombre, g.ubicacion_id, g.n_pagos, g.monto,
         round(g.monto - g.monto / (1 + retail.fn_tasa_igv(g.fecha)), 2),
         -- La comisión del POS la asume Claudia: solo tarjeta y QR llevan, con la tarifa de la máquina de esa cuenta; nula si no la hay.
         case when g.origen = 'devolucion' or g.medio not in ('tarjeta', 'qr') then 0::numeric
              else (select retail.fn_pos_comision_estimada(m.id, g.medio, g.monto, g.n_pagos, g.fecha)
                      from retail.pos_maquinas m where m.cuenta_id = g.cuenta_id) end,
         true
    from agrupado g left join retail.cuentas_dinero cd on cd.id = g.cuenta_id
  union all
  select k.fecha, 'cambio'::text, k.medio, k.cuenta_id, cd.nombre, k.ubicacion_id, 1, k.monto, null::numeric, null::numeric, false
    from cambiados k left join retail.cuentas_dinero cd on cd.id = k.cuenta_id
  order by 1 desc, 2, 3;
end $$;

comment on function retail.fn_claure_filas(uuid[]) is
  'ADR-0560 (internal): lo cobrado por ventas de CLAURE en cuentas de CAYLA, por día, medio y cuenta, con lo devuelto, la comisión estimada y los cambios por revisar. Desde la actividad 7 incluye el adelanto de un apartado y el pago anticipado de un pedido web, fechado el día que la prenda sale.';
revoke all on function retail.fn_claure_filas(uuid[]) from public, anon, authenticated;

do $$
begin
  if position('separacion_pagos' in pg_get_functiondef('retail.fn_claure_filas(uuid[])'::regprocedure)) = 0
     or position('pedido_web_pagos' in pg_get_functiondef('retail.fn_claure_filas(uuid[])'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_claure_filas no quedó sumando el adelanto de un apartado ni el pago de un pedido web';
  end if;
end $$;
