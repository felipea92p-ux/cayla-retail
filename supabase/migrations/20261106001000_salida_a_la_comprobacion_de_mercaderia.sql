-- ============================================================================
-- 20261106001000 — Dar salida a la comprobación de mercadería (tarea 5 de «Las 36 de Finanzas»)
--
-- EL PROBLEMA PRIMERO. Cargar el arranque no destrababa el Balance: las líneas vendidas sin prenda sacan su costo estimado de la 201 sin mover stock y sin causa
-- que lo explique (S/ 30,674 desde octubre), y en la 201 ninguna causa se aceptaba: un céntimo de redondeo dejaba «no cuadra». Además `fn_bal_por_recibir` no
-- sumaba `compra_item_recibido_antes`: una compra completada después de recibir contaba otra vez como «por recibir» (hay 6 esperando, S/ 4,293).
--
-- LA DECISIÓN.
--   · Causa nueva `venta_sin_prenda`: lo que el diario le saca a la 201 por una venta sin prenda, con su anulación, devolución y cambio.
--   · En la 201 dan NOTA, no bloquean: `venta_sin_prenda`, `redondeo` y `recepcion_sin_factura`. Se sabe qué son y cuánto. `sin_explicar` y todas las demás siguen
--     bloqueando. Es la lectura de ADR-0485 d.6 (recibir sin papel es normal en Gamarra) sobre ADR-0198.
--   · Lo recibido antes de tener su papel cuenta como recibido, en `fn_bal_por_recibir`, en el medidor de confianza y en `recepciones_sin_comprobante`.
--
-- SUPUESTO PARA EL CONTADOR: esas tres causas se aceptan con nota y sin asiento. Si prefiere un asiento para alguna, sale de esta lista y vuelve a bloquear.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución. Sin tablas ni políticas. Reescribe cuatro funciones desde su definición viva; si un ancla no aparece exactamente las veces
-- esperadas, aborta entero. Pegarla dos veces no hace nada. Verificado: `pnpm pruebas:balance`.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar('retail.fn_bal_causas_mercaderia(date,date)',
$a$    select 'recepcion_sin_factura', 'Mercadería recibida sin factura',$a$,
$n$    -- Tarea 5: una venta sin prenda saca su costo de la 201 y no mueve stock; lo que la deshace lo devuelve. Con el mismo signo que el resto: diario − stock.
    select 'venta_sin_prenda', 'Ventas sin prenda: su costo estimado sale de la mercadería sin mover stock',
           (select coalesce(-sum(vi.costo_unitario * vi.cantidad), 0)
              from retail.venta_items vi join retail.ventas v on v.id = vi.venta_id cross join lim
             where vi.variante_id = '22222222-2222-4222-8222-222222222222' and not coalesce(v.es_prueba, false)
               and v.created_at >= lim.ini and v.created_at < lim.fin)
           + (select coalesce(sum(vi.costo_unitario * vi.cantidad), 0)
                from retail.venta_items vi join retail.ventas v on v.id = vi.venta_id cross join lim
                left join retail.venta_anulacion_items ai on ai.venta_item_id = vi.id
               where vi.variante_id = '22222222-2222-4222-8222-222222222222' and not coalesce(v.es_prueba, false)
                 and coalesce(ai.condicion, 'vendible') = 'vendible'
                 and v.anulado_en >= lim.ini and v.anulado_en < lim.fin)
           + (select coalesce(sum(vi.costo_unitario * di.cantidad), 0)
                from retail.devoluciones d join retail.devolucion_items di on di.devolucion_id = d.id
                join retail.venta_items vi on vi.id = di.venta_item_id join retail.ventas v on v.id = d.venta_id cross join lim
               where vi.variante_id = '22222222-2222-4222-8222-222222222222' and not coalesce(v.es_prueba, false)
                 and d.estado = 'aprobada' and d.aprobado_en >= lim.ini and d.aprobado_en < lim.fin)
           + (select coalesce(sum(vi.costo_unitario * c.cantidad), 0)
                from retail.cambios c join retail.venta_items vi on vi.id = c.venta_item_id join retail.ventas v on v.id = vi.venta_id cross join lim
               where vi.variante_id = '22222222-2222-4222-8222-222222222222' and not coalesce(v.es_prueba, false)
                 and vi.costo_unitario > 0 and c.created_at >= lim.ini and c.created_at < lim.fin)
    union all
    select 'recepcion_sin_factura', 'Mercadería recibida sin factura',$n$, 1);

select pg_temp.reemplazar('retail.fn_conciliacion_contable(date)',
$a$      select coalesce(jsonb_agg(jsonb_build_object('clave', c.clave, 'texto', c.texto, 'monto', c.monto, 'acepta', false) order by abs(c.monto) desc), '[]'::jsonb),
             coalesce(sum(c.monto), 0), 0$a$,
$n$      select coalesce(jsonb_agg(jsonb_build_object('clave', c.clave, 'texto', c.texto, 'monto', c.monto, 'acepta', c.clave in ('venta_sin_prenda', 'redondeo', 'recepcion_sin_factura')) order by abs(c.monto) desc), '[]'::jsonb),
             coalesce(sum(c.monto), 0), coalesce(sum(c.monto) filter (where c.clave in ('venta_sin_prenda', 'redondeo', 'recepcion_sin_factura')), 0)$n$, 1);

select pg_temp.reemplazar('retail.fn_bal_por_recibir(date)',
$a$                        where m.compra_item_id = ci.id and m.tipo = 'entrada' and m.created_at < fin.t) rc on true$a$,
$n$                        where m.tipo = 'entrada' and m.created_at < fin.t
                          and (m.compra_item_id = ci.id
                               or (m.compra_item_id is null and exists (
                                     select 1 from retail.compra_item_recibido_antes a join retail.despacho_recibidos r on r.id = a.despacho_recibido_id
                                      where a.compra_item_id = ci.id and m.id in (r.movimiento_id, r.movimiento_danada_id))))) rc on true$n$, 1);

select pg_temp.reemplazar('retail.recepciones_sin_comprobante(uuid,integer)',
$a$    and not exists (select 1 from movimientos x where x.lote_id = l.id and x.compra_item_id is not null)$a$,
$n$    and not exists (select 1 from movimientos x where x.lote_id = l.id and x.compra_item_id is not null)
    and not exists (select 1 from retail.despacho_recibidos r join retail.compra_item_recibido_antes a on a.despacho_recibido_id = r.id
                     where r.movimiento_id = m.id or r.movimiento_danada_id = m.id)$n$, 1);

select pg_temp.reemplazar('retail.fn_finanzas_confianza(date,uuid)',
$a$and m.tipo = 'entrada' and m.motivo = 'recepcion' and m.compra_item_id is null
                                     and m.variante_id <> '22222222-2222-4222-8222-222222222222'$a$,
$n$and m.tipo = 'entrada' and m.motivo = 'recepcion' and m.compra_item_id is null
                                     and not exists (select 1 from retail.despacho_recibidos r join retail.compra_item_recibido_antes a on a.despacho_recibido_id = r.id
                                                      where m.id in (r.movimiento_id, r.movimiento_danada_id))
                                     and m.variante_id <> '22222222-2222-4222-8222-222222222222'$n$, 1);

reset lock_timeout;
