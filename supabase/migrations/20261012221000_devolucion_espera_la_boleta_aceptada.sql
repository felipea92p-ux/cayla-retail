-- ============================================================================
-- 20261012221000_devolucion_espera_la_boleta_aceptada.sql — CAYLA V2 (Ventas · Devoluciones · SUNAT)
--
-- EL PROBLEMA PRIMERO. Se corta el internet el sábado y las boletas quedan sin llegar a SUNAT. A las 7:30 un cliente devuelve una
-- casaca de S/ 180 y la líder aprueba con reembolso: `aprobar_devolucion` solo emite la nota de crédito sobre una boleta ACEPTADA,
-- así que no sale ninguna. Al volver la red, la boleta se transmite por los S/ 180 completos y nadie se entera: CAYLA declara IGV
-- por una venta que ya devolvió, y esa boleta ya no tiene una nota que la corrija.
--
-- LA DECISIÓN (Felipe, 2026-10-12): se BLOQUEA. Mientras la venta tenga una boleta o factura en camino a SUNAT (pendiente, en la
-- cola de reintento o enviada sin respuesta) o rechazada (que se puede reintentar y llegar después), la devolución no se aprueba:
-- el mensaje dice cuál y qué hacer. Cuando SUNAT la acepta, se vuelve a aprobar y sale su nota de crédito. Se descartaron diferir
-- la nota en una cola (una pieza más que vigilar) y liberar la boleta (deja una venta real sin comprobante).
--
-- QUÉ NO CAMBIA. Una venta sin boleta (nota de venta), con la boleta liberada (no_emitido) o anulada se sigue devolviendo igual:
-- no hay nada que SUNAT vaya a recibir. Con la boleta aceptada, sale la nota como siempre.
--
-- CÓMO. Reemplazo ANCLADO sobre la definición viva (20260922235000 + 20261012120100): el candado entra justo después del tope del
-- reembolso, ANTES de mover stock, caja o comprobantes, así un rechazo no deja nada a medias. Reusa la variable `r` (record) de la
-- función. Si el ancla no está exactamente una vez, se detiene sin tocar nada; si ya está aplicada, no hace nada. Sin
-- comentarios en el ancla ni un `select … into` entre comillas simples (ADR-0288).
--
-- SE ROMPE SI una migración posterior redefine `aprobar_devolucion` copiando un archivo anterior: pierde el candado.
-- `pnpm pruebas:aprobar-devolucion-caja` lo vigila (caso de la boleta pendiente).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: solo una función (sin tablas, políticas ni disparadores,
-- ADR-0195). Se puede pegar dos veces.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

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

select pg_temp.reemplazar(
  'retail.aprobar_devolucion(uuid,numeric,text,uuid)',
  $v$      p_reembolso_monto, v_valor_pagado;
  end if;
$v$,
  $v$      p_reembolso_monto, v_valor_pagado;
  end if;

  -- Felipe 2026-10-12: una devolución no se aprueba mientras la boleta o factura de la venta no esté aceptada por SUNAT. Sin
  -- aceptada no sale la nota de crédito, y la boleta llegaría después por el total: IGV declarado de una venta devuelta.
  for r in
    select c.tipo, c.serie, c.numero, c.estado
      from comprobantes c
     where c.venta_id = d.venta_id
       and c.tipo in ('boleta', 'factura')
       and c.estado in ('pendiente', 'pendiente_reintento', 'enviado', 'rechazado')
     order by c.created_at desc
     limit 1
  loop
    raise exception 'La % %-% de esta venta todavía no está aceptada por SUNAT (%). %',
      r.tipo, r.serie, lpad(r.numero::text, 6, '0'),
      case r.estado when 'rechazado' then 'SUNAT la rechazó' when 'enviado' then 'se envió y SUNAT aún no responde' else 'todavía no se envía' end,
      case r.estado
        when 'rechazado' then 'Reintenta su envío en Comprobantes y, cuando SUNAT la acepte, vuelve a aprobar: así sale su nota de crédito.'
        else 'Espera a que SUNAT la acepte y vuelve a aprobar: así sale su nota de crédito.'
      end
      using errcode = 'P0001', hint = 'devolucion_boleta_sin_aceptar';
  end loop;
$v$,
  1);

reset lock_timeout;
