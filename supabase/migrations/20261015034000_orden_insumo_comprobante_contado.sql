-- ============================================================================
-- 20261015034000_orden_insumo_comprobante_contado.sql — CAYLA V2 · ADR-0362, fase 7 parte 2, actividad 2 (pagar al contado el papel de
-- una orden de insumos). Va después de 20261015015000 y 20261015020000. Contrato: docs/compras/ordenes-de-compra-2026-10/
-- contrato-ordenes-de-insumos.md (punto 2).
--
-- EL PROBLEMA PRIMERO. Con la actividad 1, quien compra para el Taller registra el papel de su orden, pero solo al crédito: si pagó en el
-- momento (en efectivo en el mercado, o con la plata de su fondo por rendir), el papel quedaba como deuda que ya no existe y el líder lo
-- pagaba otra vez desde Por pagar del Taller.
--
-- QUÉ HACE («como en tienda», Felipe 2026-10-14): quien tiene el módulo «Órdenes de insumos» registra el papel al contado, con su pago por
-- el total, desde una cuenta de la empresa o desde SU fondo por rendir. Los pagos de lo que se registró al crédito siguen siendo del líder
-- (Por pagar del Taller), como siempre.
--   1. `fn_produccion_pagos_sellar` (REEMPLAZO ANCLADO): un pago del Taller puede salir del fondo por rendir de quien paga, igual que un
--      pago de tiendas (`fn_compra_pagos_sellar`, fase 6): no pasa por `fn_cuenta_sellada` (que no acepta un fondo) sino por
--      `fn_fondo_para_pagar` (su dueña, con su cuenta, nunca una terminal; el mismo candado por persona que entregar y devolver) y no toca
--      ninguna caja. Vale para todo pago del Taller: también el líder puede pagar desde su propio fondo.
--   2. `registrar_comprobante_orden_insumo` (REEMPLAZOS ANCLADOS): acepta el contado. Al crédito, como antes (vencimiento, sin pago); al
--      contado, sin vencimiento y con su pago: uno o varios medios de plata (transferencia, Yape, Plin, efectivo, depósito u otro; el
--      Taller no lleva saldo a favor), montos con dos decimales que suman EXACTAMENTE el total, fechas entre la emisión y hoy. Cada medio
--      se guarda en `comprobantes_produccion_pagos` y su cuenta la sella el disparador de arriba (la que sirve para ese medio, o el fondo).
--   El fondo no necesita nada más: su saldo y su rendición salen del libro del dinero (`fn_dinero_libro`), que ya cuenta los pagos del
--   Taller (`pagoprod:`), con origen «pago».
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261015020000. Sin tablas, sin políticas, sin `drop trigger`
-- (ADR-0195), sin `select … into` dentro de textos entre comillas (ADR-0288). Los reemplazos abortan SIN TOCAR NADA si la función viva
-- cambió, y no hacen nada si ya están aplicados: se puede pegar dos veces. El bloque final comprueba que quedó todo.
-- ============================================================================

set lock_timeout = '3s';

-- Reemplazo anclado (el mismo de 20261015020000): falla si la función viva cambió, y es re-ejecutable.
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

-- ---------- 1. Un pago del Taller puede salir del fondo por rendir de quien paga ----------
select pg_temp.reemplazar(
  'retail.fn_produccion_pagos_sellar()',
  $v$  new.cuenta_dinero_id := retail.fn_cuenta_sellada('pago', new.metodo, null, new.fecha, new.cuenta_dinero_id);
$v$,
  $n$  -- ADR-0362 fase 7 parte 2 (como en tiendas, fase 6): el fondo por rendir de quien paga no pasa por `fn_cuenta_sellada` (no lo acepta
  -- en ningún otro lado): lo valida `fn_fondo_para_pagar` (su dueña, con su cuenta) y no toca ninguna caja. Puede quedar en negativo:
  -- «CAYLA te debe».
  if new.cuenta_dinero_id is not null and exists (select 1 from retail.cuentas_dinero f where f.id = new.cuenta_dinero_id and f.tipo = 'fondo') then
    if new.caja_movimiento_id is not null then
      raise exception 'Solo lo que sale de un cajón se une a un egreso de caja.' using errcode = 'P0001';
    end if;
    perform retail.fn_fondo_para_pagar(new.cuenta_dinero_id, new.metodo);
    return new;
  end if;
  new.cuenta_dinero_id := retail.fn_cuenta_sellada('pago', new.metodo, null, new.fecha, new.cuenta_dinero_id);
$n$,
  1);

-- ---------- 2. El papel de una orden de insumos, también al contado ----------
-- 2a. Lo que la función necesita para leer el pago.
select pg_temp.reemplazar(
  'retail.registrar_comprobante_orden_insumo(uuid, text, text, text, jsonb, date, text, date, numeric, numeric, jsonb, text, uuid)',
  $v$  v_restriccion text;
begin$v$,
  $n$  v_restriccion text;
  v_pagos jsonb;
  v_pago jsonb;
  v_monto numeric;
  v_pago_fecha date;
  v_pago_suma numeric := 0;
begin$n$,
  1);

-- 2b. Al crédito, con vencimiento y sin pago; al contado, con su pago.
select pg_temp.reemplazar(
  'retail.registrar_comprobante_orden_insumo(uuid, text, text, text, jsonb, date, text, date, numeric, numeric, jsonb, text, uuid)',
  $v$  -- Esta actividad registra al crédito; el pago al contado de una orden de insumos llega en la actividad 2 (ADR-0362, fase 7 parte 2).
  if v_condicion = 'contado' then
    raise exception 'Por ahora el comprobante de una orden de insumos se registra al crédito' using hint = 'comprobante_orden_insumo_contado';
  end if;
  if p_fecha_vencimiento is null or p_fecha_vencimiento < v_emision then
    raise exception 'Al crédito, elige cuándo vence: desde la fecha de emisión en adelante' using hint = 'comprobante_orden_insumo_vencimiento';
  end if;
  if not v_sin_pago then
    raise exception 'Al crédito, el comprobante se registra sin pago' using hint = 'comprobante_orden_insumo_pago_credito';
  end if;
$v$,
  $n$  -- Al crédito: con su vencimiento y sin pago (lo paga el líder después, desde Por pagar del Taller). Al contado (actividad 2, «como en
  -- tienda»): con su pago por el total, desde una cuenta de la empresa o desde el fondo por rendir de quien paga.
  if v_condicion = 'credito' then
    if p_fecha_vencimiento is null or p_fecha_vencimiento < v_emision then
      raise exception 'Al crédito, elige cuándo vence: desde la fecha de emisión en adelante' using hint = 'comprobante_orden_insumo_vencimiento';
    end if;
    if not v_sin_pago then
      raise exception 'Al crédito, el comprobante se registra sin pago: lo paga tu líder después' using hint = 'comprobante_orden_insumo_pago_credito';
    end if;
  elsif v_sin_pago then
    raise exception 'Al contado, el comprobante se registra con su pago' using hint = 'comprobante_orden_insumo_sin_pago';
  end if;
$n$,
  1);

-- 2c. El pago al contado se valida entero antes de escribir nada, contra el total ya calculado.
select pg_temp.reemplazar(
  'retail.registrar_comprobante_orden_insumo(uuid, text, text, text, jsonb, date, text, date, numeric, numeric, jsonb, text, uuid)',
  $v$  -- Todo bien: se escribe. Una carrera con el mismo token o el mismo papel termina en el único y se responde igual que arriba.
$v$,
  $n$  -- Al contado: el pago suma EXACTAMENTE el total, con los medios de plata del Taller (sin saldo a favor: el Taller no lo lleva). Cada
  -- medio, con un monto mayor a cero y dos decimales, y una fecha entre la emisión y hoy. La cuenta (o el fondo) la valida el disparador.
  if not v_sin_pago then
    if jsonb_typeof(p_pago) = 'object' then
      v_pagos := jsonb_build_array(p_pago);
    elsif jsonb_typeof(p_pago) = 'array' then
      v_pagos := p_pago;
    else
      raise exception 'El pago necesita al menos un medio con su monto' using hint = 'comprobante_orden_insumo_pago';
    end if;
    for v_pago in select e.value from jsonb_array_elements(v_pagos) e loop
      if jsonb_typeof(v_pago) <> 'object' then
        raise exception 'El pago necesita al menos un medio con su monto' using hint = 'comprobante_orden_insumo_pago';
      end if;
      begin
        v_monto := nullif(btrim(v_pago ->> 'monto'), '')::numeric;
        perform nullif(btrim(v_pago ->> 'cuenta_id'), '')::uuid;
        v_pago_fecha := coalesce(nullif(btrim(v_pago ->> 'fecha'), '')::date, v_hoy);
      exception when others then
        raise exception 'Un medio de pago trae un monto, una cuenta o una fecha que no se entiende' using hint = 'comprobante_orden_insumo_pago';
      end;
      -- `NaN` e `Infinity` no cumplen `<= 99999999.99`: también se rechazan.
      if v_monto is null or not (v_monto > 0 and v_monto <= 99999999.99) then
        raise exception 'Cada medio de pago necesita un monto mayor a cero' using hint = 'comprobante_orden_insumo_pago';
      end if;
      if v_monto <> round(v_monto, 2) then
        raise exception 'Los montos del pago admiten como máximo 2 decimales (llegó %)', v_monto using hint = 'comprobante_orden_insumo_pago';
      end if;
      if coalesce(v_pago ->> 'metodo', '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro') then
        raise exception 'Medio de pago no reconocido: %', coalesce(nullif(v_pago ->> 'metodo', ''), '(vacío)') using hint = 'comprobante_orden_insumo_pago';
      end if;
      if v_pago_fecha > v_hoy then
        raise exception 'La fecha del pago no puede ser futura: hoy es %', to_char(v_hoy, 'DD/MM/YYYY') using hint = 'comprobante_orden_insumo_pago';
      end if;
      if v_pago_fecha < least(v_emision, v_hoy) then
        raise exception 'La fecha del pago (%) es anterior a la emisión del comprobante (%)', to_char(v_pago_fecha, 'DD/MM/YYYY'),
          to_char(v_emision, 'DD/MM/YYYY') using hint = 'comprobante_orden_insumo_pago';
      end if;
      v_pago_suma := v_pago_suma + v_monto;
    end loop;
    if v_pago_suma <> v_total then
      raise exception 'Al contado, el pago tiene que ser el total del comprobante (S/ %); suma S/ %', v_total, v_pago_suma
        using hint = 'comprobante_orden_insumo_pago';
    end if;
  end if;

  -- Todo bien: se escribe. Una carrera con el mismo token o el mismo papel termina en el único y se responde igual que arriba.
$n$,
  1);

-- 2d. Al contado no hay vencimiento.
select pg_temp.reemplazar(
  'retail.registrar_comprobante_orden_insumo(uuid, text, text, text, jsonb, date, text, date, numeric, numeric, jsonb, text, uuid)',
  $v$      v_orden.proveedor_id, v_tipo, v_serie, v_numero, v_emision, v_condicion, p_fecha_vencimiento, v_subtotal, v_igv, v_total, v_nota,$v$,
  $n$      v_orden.proveedor_id, v_tipo, v_serie, v_numero, v_emision, v_condicion,
      case when v_condicion = 'contado' then null else p_fecha_vencimiento end, v_subtotal, v_igv, v_total, v_nota,$n$,
  1);

-- 2e. El pago, después de las líneas: cada medio en el libro del Taller; su cuenta (o el fondo) la sella `fn_produccion_pagos_sellar`.
select pg_temp.reemplazar(
  'retail.registrar_comprobante_orden_insumo(uuid, text, text, text, jsonb, date, text, date, numeric, numeric, jsonb, text, uuid)',
  $v$  -- Actividad (ADR-0207), sin montos como el resto de la orden. Si falla, el comprobante igual queda guardado.
$v$,
  $n$  if v_pagos is not null then
    insert into retail.comprobantes_produccion_pagos (comprobante_id, fecha, monto, metodo, referencia, usuario_id, cuenta_dinero_id)
    select v_id, coalesce(nullif(btrim(p.valor ->> 'fecha'), '')::date, v_hoy), (p.valor ->> 'monto')::numeric, p.valor ->> 'metodo',
           nullif(btrim(coalesce(p.valor ->> 'referencia', '')), ''), v_actor, nullif(btrim(p.valor ->> 'cuenta_id'), '')::uuid
      from jsonb_array_elements(v_pagos) with ordinality as p(valor, posicion)
     order by p.posicion;
  end if;

  -- Actividad (ADR-0207), sin montos como el resto de la orden. Si falla, el comprobante igual queda guardado.
$n$,
  1);

reset lock_timeout;

-- ---------- Comprobación: si algo no quedó, el pegado falla y no se aplica nada ----------
do $$
declare
  v_def text := pg_get_functiondef('retail.registrar_comprobante_orden_insumo(uuid, text, text, text, jsonb, date, text, date, numeric, numeric, jsonb, text, uuid)'::regprocedure);
begin
  if position('fn_fondo_para_pagar' in pg_get_functiondef('retail.fn_produccion_pagos_sellar()'::regprocedure)) = 0 then
    raise exception 'un pago del Taller todavía no puede salir de un fondo por rendir';
  end if;
  if position('comprobante_orden_insumo_contado' in v_def) > 0
     or position('comprobante_orden_insumo_sin_pago' in v_def) = 0
     or position('insert into retail.comprobantes_produccion_pagos' in v_def) = 0 then
    raise exception 'el papel de una orden de insumos todavía no se registra al contado';
  end if;
end;
$$;
