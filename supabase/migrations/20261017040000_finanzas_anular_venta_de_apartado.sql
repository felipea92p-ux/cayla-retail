-- ============================================================================
-- 20261017040000_finanzas_anular_venta_de_apartado.sql — CAYLA V2 (hallazgo de la revisión de la actividad 10, ADR-0433)
--
-- EL PROBLEMA PRIMERO. Una encargada se equivoca el mismo día y anula, desde Devoluciones, la venta que ENTREGÓ un apartado. `anular_venta` devuelve las prendas
-- al stock y revierte la venta, pero el adelanto de la clienta ya estaba asentado como lo que se le debe (122) con su IGV (4011) y la anulación «devuelve el cobro»
-- a la 122: el adelanto queda colgado en el libro como una deuda que ninguna pantalla puede devolver (el apartado sigue «entregado»), el Balance (`fn_bal_anticipos`)
-- lo da en cero y la conciliación de la 122 queda en `no_cuadra`, bloqueando el cierre del mes. Reproducido con las RPC reales (suite finanzas_apartados_por_pago, caso G).
--
-- DECISIÓN DE FELIPE (2026-10-16, «que anular una venta de apartado la rechace con un mensaje»): la venta que entrega un apartado NO se anula. El camino es Devolución,
-- que devuelve las prendas y saca el dinero por su medio. Mismo estilo que el rechazo de la venta de un pedido web por entregar (ADR-0408 act. 10): errcode P0001 y un
-- `hint` (`venta_de_apartado`) que la web puede reconocer.
--
-- LO MISMO PARA UN PEDIDO WEB ENTREGADO (hallazgo de la revisión adversarial de esta migración, reproducido con las RPC reales): la venta de un pedido web se paga
-- por adelantado —un solo pago «anticipo» por el total, 122— y, una vez entregado, anularla deja ese pago colgado igual que en el apartado (el pedido sigue
-- «entregado», `anular_pedido_web_pagado` exige «pagado» y Devolución rechaza una venta ya anulada: nada lo devuelve). La función ya rechazaba el pedido POR entregar; ahora
-- rechaza también el entregado, con su `hint` (`venta_de_pedido_web_entregado`) y el mismo camino: Devolución, que ya admite una venta entregada.
--
-- CÓMO. Un reemplazo anclado sobre la función VIVA de `anular_venta` (el ancla, un comentario, aparece una vez o la migración aborta; si el texto nuevo ya está, no hace
-- nada): el chequeo va justo antes del de pedido web, después de los de permiso, estado y sede. Una venta que no es de un apartado no cambia en nada.
-- Contra producción (solo lectura, 2026-10-16): el ancla aparece exactamente una vez en `anular_venta`.
--
-- Producción: sin `alter` de tablas en uso y sin políticas (ADR-0195, «Políticas y deadlocks»): se pega entera.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

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

select pg_temp.anclar('retail.anular_venta(uuid, text, jsonb)',
  $v$-- ADR-0408 act. 10: la venta de un pedido web que todavía no se entrega no se anula: sus prendas siguen reservadas en la tienda (nunca$v$,
  $n$-- ADR-0433 (decisión de Felipe, 2026-10-16): la venta que ENTREGA un apartado no se anula. Su adelanto ya está asentado como lo que se le debe a la clienta (122 y su
  -- IGV) y anular la venta lo dejaría colgado en el libro, sin forma de devolverlo (y la conciliación de la 122 bloqueada). Se devuelve por Devolución.
  if exists (select 1 from retail.separaciones s where s.venta_id = p_venta_id) then
    raise exception 'Esta venta es la entrega del apartado %: su adelanto quedaría sin devolver si se anula. Usa Devolución: la prenda vuelve y el dinero sale por su medio.',
      (select s.codigo from retail.separaciones s where s.venta_id = p_venta_id limit 1)
      using errcode = 'P0001', hint = 'venta_de_apartado';
  end if;
  -- ADR-0433 (hallazgo de la revisión de esta misma actividad): lo mismo la venta de un pedido web ya ENTREGADO. Se pagó por adelantado (pago «anticipo», 122) y anularla
  -- dejaría ese pago colgado en el libro, sin forma de devolverlo. Se devuelve por Devolución.
  if exists (select 1 from retail.pedidos_web w where w.venta_id = p_venta_id and w.estado = 'entregado') then
    raise exception 'Esta venta es del pedido web %, ya entregado: su pago quedaría sin devolver si se anula. Usa Devolución: la prenda vuelve y el dinero sale por su medio.',
      (select w.codigo from retail.pedidos_web w where w.venta_id = p_venta_id limit 1)
      using errcode = 'P0001', hint = 'venta_de_pedido_web_entregado';
  end if;
  -- ADR-0408 act. 10: la venta de un pedido web que todavía no se entrega no se anula: sus prendas siguen reservadas en la tienda (nunca$n$);

notify pgrst, 'reload schema';
