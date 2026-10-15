-- ============================================================================
-- 20261015115000_pedidos_web_anular_pagado_lecturas.sql — CAYLA V2 · Tienda online (ADR-0408): anular un pedido web PAGADO (parte 2 de
-- 2: lo que leen las pantallas y la mercadería del Balance)
--
-- EL PROBLEMA PRIMERO. La parte 1 (20261015114000) ya anula un pedido pagado de punta a punta. Faltaban tres lecturas:
--   · la hoja del ERP tiene que decir, ANTES de confirmar, qué le va a pasar a la boleta (se libera sin enviar, sale su nota de crédito,
--     o todavía no se puede y qué hacer), y después de anular, la nota de crédito que la anuló;
--   · «Mis pedidos» de la tienda online tiene que decirle al cliente cuánto se le devuelve y con qué nota de crédito se anuló su boleta;
--   · y la mercadería del Balance (`fn_bal_stock`) restaba lo vendido por la web que todavía no se entregaba (20261015053000) aunque esa
--     venta ya se hubiera anulado: la prenda volvió a ser de CAYLA (el diario revierte la venta el día que se anula y la devuelve a la
--     mercadería), así que el Balance la contaba de menos y la cuenta 201 dejaba de cuadrar.
--
-- QUÉ HACE (solo funciones; reemplazos anclados, como 20261015052000 y 053000)
--   1. `fn_pedido_web_detalle`: `anulacion_boleta` (en un pedido pagado, lo que `fn_pedido_web_camino_boleta` diría si se anula ahora) y
--      `nota_credito` (la que anuló su boleta, con su número, estado y total). Va antes del bloque de 20261015052000, sin tocar su texto.
--   2. `fn_pedidos_web_de_clienta` («Mis pedidos»): `devuelto` (lo que se le devolvió al cliente, pago por pago sumado) y `nota_credito`
--      (su número). Va antes del bloque de 20261015052000, sin tocar su texto.
--   3. `fn_bal_stock`: lo vendido por la web que se descontaba y cuya venta se anuló antes del corte se vuelve a sumar a su tienda
--      (`anulado_web`), con la misma condición exacta de `vendido_web`. Se suma aparte, en la consulta final, para no reescribir el texto
--      de 20261015053000 (que así se puede volver a pegar).
--
-- POR QUÉ ASÍ. DECIDÍ sumar lo anulado aparte y no cambiar el filtro de `vendido_web`: el resultado es el mismo (la fila que `vendido_web`
-- resta y `anulado_web` suma se cancela exacta) y la migración de la actividad 10 sigue pudiéndose pegar dos veces. DESCARTÉ guardar en
-- `pedidos_web` la nota de crédito o lo devuelto: se leen de `comprobantes` y `pedido_web_pagos`, que son la fuente; una copia se desalinearía.
--
-- SE ROMPE SI una migración vuelve a definir entera alguna de estas funciones después de esta. Se arregla volviendo a pegar esta.
-- `pnpm pruebas:pedidos-web-anular` lo marca.
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe). Va DESPUÉS de 20261015114000. Una sola parte: solo funciones (sin
-- tablas, sin políticas, sin disparadores). Re-ejecutable: un ancla ya aplicada no hace nada; si un ancla no aparece exactamente una vez,
-- aborta sin tocar nada. Ningún `select … into` dentro de un texto entre comillas.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('retail.fn_pedido_web_camino_boleta(uuid)') is null then
    raise exception 'Falta 20261015114000_pedidos_web_anular_pagado.sql (la parte 1): pégala antes que esta.';
  end if;
end;
$$;

create or replace function pg_temp.anclar(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición viva.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ----------------------------------------------------------------------------
-- 1. El ERP: qué le pasaría a la boleta si se anula ahora, y la nota de crédito que la anuló
-- ----------------------------------------------------------------------------
select pg_temp.anclar('retail.fn_pedido_web_detalle(uuid)',
  $v$    -- ADR-0408 act. 10: la venta del pedido pagado completo, su boleta y quién lo entregó. El código para recoger no sale aquí: lo$v$,
  $n$    -- ADR-0408 (anular un pedido pagado): en un pedido pagado, qué le pasaría a su boleta si se anula ahora (la misma regla de la
    -- anulación); y, anulado, la nota de crédito que anuló su boleta.
    'anulacion_boleta', (select retail.fn_pedido_web_camino_boleta(w.venta_id) from retail.pedidos_web w
                          where w.id = p_pedido_id and w.estado = 'pagado' and w.venta_id is not null),
    'nota_credito', (select jsonb_build_object('comprobante_id', n.id, 'texto', n.serie || '-' || lpad(n.numero::text, 6, '0'),
                                               'estado', n.estado, 'total', n.total)
                       from retail.pedidos_web w
                       join retail.comprobantes c on c.venta_id = w.venta_id and c.tipo in ('boleta', 'factura')
                       join retail.comprobantes n on n.comprobante_original_id = c.id and n.tipo = 'nota_credito'
                      where w.id = p_pedido_id
                      order by n.created_at desc limit 1),
    -- ADR-0408 act. 10: la venta del pedido pagado completo, su boleta y quién lo entregó. El código para recoger no sale aquí: lo$n$);

-- ----------------------------------------------------------------------------
-- 2. «Mis pedidos»: lo que se le devolvió al cliente y la nota de crédito que anuló su boleta
-- ----------------------------------------------------------------------------
select pg_temp.anclar('retail.fn_pedidos_web_de_clienta(uuid, integer, integer)',
  $v$             'codigo_recojo', case when h.listo_para_recoger then w.codigo_recojo end,$v$,
  $n$             -- ADR-0408 (anular un pedido pagado): lo que se le devolvió (cada pago devuelto) y la nota de crédito que anuló su boleta.
             'devuelto', (select coalesce(sum(g.monto), 0) from retail.pedido_web_pagos g
                           where g.pedido_id = w.id and g.estado = 'anulado' and g.anulado_motivo = 'devuelto_al_cliente'),
             'nota_credito', (select n.serie || '-' || lpad(n.numero::text, 6, '0')
                                from retail.comprobantes c
                                join retail.comprobantes n on n.comprobante_original_id = c.id and n.tipo = 'nota_credito'
                               where c.venta_id = w.venta_id and c.tipo in ('boleta', 'factura') and n.estado not in ('rechazado', 'anulado')
                               order by n.created_at desc limit 1),
             'codigo_recojo', case when h.listo_para_recoger then w.codigo_recojo end,$n$);

-- ----------------------------------------------------------------------------
-- 3. La mercadería del Balance: lo vendido por la web cuya venta se anuló vuelve a ser de CAYLA
-- ----------------------------------------------------------------------------
select pg_temp.anclar('retail.fn_bal_stock(date)',
  $v$  -- ADR-0408 act. 10: lo vendido por la web que al cierre de ese día todavía no se entregaba ya es del cliente (su venta lo sacó de$v$,
  $n$  -- ADR-0408 (anular un pedido pagado): de eso, lo de una venta que se anuló antes del corte vuelve a ser de CAYLA (el diario la
  -- revierte ese día y devuelve la prenda a la mercadería). Es exactamente lo que `vendido_web` resta de más: se suma en la consulta final.
  anulado_web as (
    select vi.variante_id, v.ubicacion_id, sum(vi.cantidad)::bigint as q
      from retail.pedido_web_lineas l
      join retail.venta_items vi on vi.id = l.venta_item_id
      join retail.ventas v on v.id = vi.venta_id
      cross join fin
     where v.created_at < fin.t and not coalesce(v.es_prueba, false)
       and not exists (select 1 from retail.movimientos m where m.venta_item_id = vi.id and m.tipo = 'salida' and m.created_at < fin.t)
       and v.estado = 'anulada' and v.anulado_en < fin.t
       and vi.variante_id <> '22222222-2222-4222-8222-222222222222'
     group by 1, 2
  ),
  -- ADR-0408 act. 10: lo vendido por la web que al cierre de ese día todavía no se entregaba ya es del cliente (su venta lo sacó de$n$);
select pg_temp.anclar('retail.fn_bal_stock(date)',
  $v$    from al_corte a join retail.variantes v on v.id = a.variante_id cross join fin$v$,
  $n$    from (select * from al_corte union all select * from anulado_web) a join retail.variantes v on v.id = a.variante_id cross join fin$n$);

-- ----------------------------------------------------------------------------
-- 4. Comprobación
-- ----------------------------------------------------------------------------
do $$
begin
  if position('''anulacion_boleta''' in pg_get_functiondef('retail.fn_pedido_web_detalle(uuid)'::regprocedure)) = 0
     or position('''nota_credito''' in pg_get_functiondef('retail.fn_pedido_web_detalle(uuid)'::regprocedure)) = 0 then
    raise exception 'fn_pedido_web_detalle no quedó diciendo qué pasa con la boleta al anular';
  end if;
  if position('''devuelto''' in pg_get_functiondef('retail.fn_pedidos_web_de_clienta(uuid, integer, integer)'::regprocedure)) = 0 then
    raise exception '«Mis pedidos» no quedó diciendo lo que se le devolvió al cliente';
  end if;
  if position('select * from anulado_web' in pg_get_functiondef('retail.fn_bal_stock(date)'::regprocedure)) = 0
     or position('select * from vendido_web' in pg_get_functiondef('retail.fn_bal_stock(date)'::regprocedure)) = 0 then
    raise exception 'fn_bal_stock no quedó devolviendo a la mercadería lo de una venta web anulada';
  end if;
end;
$$;

reset lock_timeout;
notify pgrst, 'reload schema';
