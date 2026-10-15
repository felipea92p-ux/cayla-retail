-- ============================================================================
-- 20261015053000_pedidos_web_en_finanzas.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 10 (parte 3 de 3): la plata de los
-- pedidos web en Finanzas
--
-- EL PROBLEMA PRIMERO. Felipe decidió (2026-10-14) que el efectivo de un pedido web se cuente en Finanzas como el de Apartados. Hoy un
-- pago de un pedido web casi no existe para Finanzas:
--   · el flujo de caja (`fn_flujo_lineas`) ponía su efectivo en «Otros ingresos», y su devolución en «Por clasificar»;
--   · Cuentas y dinero (`fn_dinero_libro`) no veía lo que el cliente pagó por Yape, Plin o transferencia: esa plata llega al banco y no
--     aparecía en ningún lado (la venta del pedido la aplica como «anticipo», que no es un cobro);
--   · el diario (`fn_asientos`) no tenía esos pagos, pero la venta del pedido sí aplica su «anticipo» contra «Adelantos de clientes»
--     (122): esa cuenta quedaba al revés, y la caja y el banco del diario, sin esa plata. Y como la venta sale al pagar y la prenda recién
--     al entregar, la mercadería del diario y la de la tienda tampoco daban lo mismo. El Balance (`fn_conciliacion_contable`) no cuadraba
--     en caja, bancos, adelantos ni mercadería, y con una cuenta que no cuadra el Balance no se dibuja (ADR-0198).
--
-- QUÉ HACE
--   PARTE 1 (`pedido_web_pagos`, sola): cada pago de la tienda SELLA su cuenta al anotarse, como el abono de un apartado (ADR-0195 F3b):
--     el efectivo, el cajón de su tienda; lo demás, la cuenta de cobro de ese medio vigente hoy. Si después cambia a qué banco cae el
--     Yape, lo ya cobrado no se mueve. El sello nunca tumba un pago (si falla, queda «sin cuenta» y el libro lo deduce). Uno de la
--     pasarela no llega a una cuenta de la tienda: sin cuenta.
--   PARTE 2 (solo funciones; reemplazos anclados, como 20261010223118 y 20261014153000):
--     1. `fn_flujo_lineas`: el efectivo del pedido web y su devolución son «Efectivo de clientes», como el adelanto de un apartado.
--     2. `fn_dinero_libro`: lo digital que el cliente pagó entra a su cuenta sellada el día que se anota; lo que se le devolvió, sale el
--        día que se devuelve. Uno anotado por error nunca entró al banco.
--     3. El diario (`fn_asientos_pedidos_web`, sumada a `fn_asientos` como la del IGV perdido): el pago entra a la caja o al banco contra
--        «Adelantos de clientes» (122), sin IGV (el pedido no tiene boleta de anticipo: su IGV lo asienta la venta, con su boleta); la
--        venta lo aplica (ya lo hacía); lo anulado sale. Uno digital anotado por error nunca existió; uno en efectivo sí pasó por el cajón
--        (entró y salió), así que entra y sale también en el diario.
--     4. `fn_bal_anticipos`: lo pagado de un pedido web que al corte todavía no era una venta ni se había anulado es un adelanto de
--        cliente (el otro camino de la 122).
--     5. `fn_bal_stock`: lo vendido por la web que al corte todavía no se entregaba ya es del cliente (su venta ya lo sacó de la
--        mercadería en el diario): no se cuenta como mercadería de CAYLA, aunque espere en la tienda.
--     6. `fn_bal_causas_dinero`: los ingresos y salidas del cajón de los pedidos web ya no son «sin origen» ni «sin clasificar» (el diario
--        los tiene).
--     7. `fn_conciliacion_contable`: la fila de la 122 dice que también cuenta los pedidos web.
--
-- QUÉ NO DECIDE. Si un pago parcial (un adelanto antes de pagar todo) necesita su propia boleta de anticipo según la SUNAT: hoy la boleta
-- sale una sola vez, al quedar pagado completo, y el diario lo sigue. Si el contador dice que el adelanto la necesita, el pago asienta
-- su IGV como el de una separación. Tampoco toca un pago de la pasarela (futura).
--
-- SE ROMPE SI una migración vuelve a definir entera alguna de estas funciones después de esta: el pedido web vuelve a descuadrar el
-- Balance. Se arregla volviendo a pegar la PARTE 2. `pnpm pruebas:pedidos-web-entregar` lo marca.
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe). Va después de 20261015051000. DOS PARTES que se pegan por separado y
-- en orden, cada una con `lock_timeout = 3s` (si dice «lock timeout», se repite esa parte) e idempotente: la 1 toma `pedido_web_pagos` un
-- instante (columna nueva sin valor por defecto, con FK a `cuentas_dinero`) y engancha su disparador con `create or replace trigger`;
-- la 2 son solo funciones. Sin políticas ni `drop trigger`. Si un ancla no aparece exactamente una vez, aborta sin tocar nada. Ningún
-- `select … into` dentro de un texto entre comillas.
-- ============================================================================

-- ============================== PARTE 1 · pedido_web_pagos (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.pedido_web_pagos add column if not exists cuenta_dinero_id uuid references retail.cuentas_dinero (id);
comment on column retail.pedido_web_pagos.cuenta_dinero_id is
  'Dónde entró la plata de un pago de la tienda, sellada al anotarlo (ADR-0195 F3b, ADR-0408 act. 10): el cajón en efectivo, la cuenta de medios_de_cobro en lo demás. Nula: un pago de la pasarela, o la tienda no configuró ese medio (el libro la deduce).';

create or replace function retail.fn_pedido_web_pagos_sellar() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_ubic uuid;
begin
  if tg_op = 'UPDATE' then
    if new.cuenta_dinero_id is distinct from old.cuenta_dinero_id then
      raise exception 'La cuenta de un pago se sella al anotarlo: no cambia.' using errcode = '23514', hint = 'pedido_web_pago_inmutable';
    end if;
    return new;
  end if;
  if new.origen is distinct from 'tienda' then
    new.cuenta_dinero_id := null;
    return new;
  end if;
  -- El sello nunca tumba un pago: si falla, queda «sin cuenta» (el libro la deduce, como un cobro viejo).
  begin
    v_ubic := (select w.ubicacion_id from retail.pedidos_web w where w.id = new.pedido_id);
    new.cuenta_dinero_id := retail.fn_cuenta_sellada('cobro', new.medio, v_ubic, retail.fn_hoy_lima(), new.cuenta_dinero_id);
  exception when others then
    new.cuenta_dinero_id := null;
  end;
  return new;
end $$;
revoke all on function retail.fn_pedido_web_pagos_sellar() from public, anon, authenticated;

create or replace trigger pedido_web_pagos_sellar_cuenta before insert or update of cuenta_dinero_id on retail.pedido_web_pagos
  for each row execute function retail.fn_pedido_web_pagos_sellar();

reset lock_timeout;

-- ============================== PARTE 2 · las funciones de Finanzas ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'pedido_web_pagos' and column_name = 'cuenta_dinero_id') then
    raise exception 'Falta la PARTE 1 de esta migración (la cuenta sellada de cada pago de pedido web): pégala antes que esta.';
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
-- 1. El flujo de caja: el efectivo del pedido web y su devolución son «Efectivo de clientes»
-- ----------------------------------------------------------------------------
select pg_temp.anclar('retail.fn_flujo_lineas(date, date)',
  $v$case when m.separacion_id is not null or exists (select 1 from retail.separacion_pagos sp where sp.caja_movimiento_id = m.id)$v$,
  $n$case when m.separacion_id is not null or exists (select 1 from retail.separacion_pagos sp where sp.caja_movimiento_id = m.id)
                         -- ADR-0408 act. 10: el pago en efectivo de un pedido web, como el adelanto de un apartado.
                         or exists (select 1 from retail.pedido_web_pagos pw where pw.caja_movimiento_id = m.id)$n$);
select pg_temp.anclar('retail.fn_flujo_lineas(date, date)',
  $v$             when exists (select 1 from retail.separaciones s where s.devolucion_caja_movimiento_id = m.id) then 'efectivo'$v$,
  $n$             when exists (select 1 from retail.separaciones s where s.devolucion_caja_movimiento_id = m.id) then 'efectivo'
             -- ADR-0408 act. 10: lo que sale del cajón al anular un pago en efectivo de su pedido web.
             when exists (select 1 from retail.pedido_web_pagos pw where pw.anulado_caja_movimiento_id = m.id) then 'efectivo'$n$);

-- ----------------------------------------------------------------------------
-- 2. Cuentas y dinero: lo digital del pedido web entra (y, devuelto, sale) por su cuenta sellada
-- ----------------------------------------------------------------------------
select pg_temp.anclar('retail.fn_dinero_libro(date)',
  $v$    union all
    -- F3b: el adelanto devuelto de un apartado (situación 10).$v$,
  $n$    union all
    -- ADR-0408 act. 10: lo que el cliente pagó por Yape, Plin o transferencia dentro de su pedido web, como el adelanto digital de un
    -- apartado: entra el día que se anota, a la cuenta que selló. Uno anotado por error nunca entró; uno que se le devolvió, sale el día
    -- que se devuelve, por la misma cuenta.
    select pw_w.ubicacion_id, (pw.registrado_en at time zone 'America/Lima')::date, pw.medio, pw.monto, pw.cuenta_dinero_id
      from retail.pedido_web_pagos pw join retail.pedidos_web pw_w on pw_w.id = pw.pedido_id
     where pw.origen = 'tienda' and pw.medio in ('yape', 'plin', 'transferencia')
       and (pw.estado = 'aprobado' or (pw.estado = 'anulado' and pw.anulado_motivo = 'devuelto_al_cliente'))
    union all
    select pw_w.ubicacion_id, (pw.anulado_en at time zone 'America/Lima')::date, pw.medio, -pw.monto, pw.cuenta_dinero_id
      from retail.pedido_web_pagos pw join retail.pedidos_web pw_w on pw_w.id = pw.pedido_id
     where pw.origen = 'tienda' and pw.medio in ('yape', 'plin', 'transferencia')
       and pw.estado = 'anulado' and pw.anulado_motivo = 'devuelto_al_cliente'
    union all
    -- F3b: el adelanto devuelto de un apartado (situación 10).$n$);

-- ----------------------------------------------------------------------------
-- 3. El diario: el pago entra a la caja o al banco contra «Adelantos de clientes» (122); lo anulado sale
-- ----------------------------------------------------------------------------
-- Mismas columnas que las líneas de `fn_asientos` (como `fn_asientos_igv_perdido`). Sin IGV: el pedido no tiene boleta de anticipo, y
-- la venta (que aplica el «anticipo» contra la 122) asienta todo su IGV con su boleta.
create or replace function retail.fn_asientos_pedidos_web(p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
returns table (f date, ubicacion_id uuid, asiento text, regla text, cuenta text, debe numeric, haber numeric, ot text, oid uuid, glosa text)
language sql stable set search_path = retail, public, extensions as $$
  with
  lim as (select (p_desde::timestamp at time zone 'America/Lima') as ini, ((p_hasta + 1)::timestamp at time zone 'America/Lima') as fin),
  -- Lo que pasó por la caja o el banco: lo aprobado, lo devuelto al cliente y, en efectivo, también lo anotado por error (entró al
  -- cajón y salió con su egreso). Uno digital anotado por error nunca entró al banco: no existe.
  pg as (
    select x.id, w.ubicacion_id, w.codigo, x.medio, x.monto, x.registrado_en, x.estado, x.anulado_en
      from retail.pedido_web_pagos x join retail.pedidos_web w on w.id = x.pedido_id
     where x.origen = 'tienda' and (p_todo or w.ubicacion_id = any (p_ubics))
       and (x.estado = 'aprobado' or x.anulado_motivo = 'devuelto_al_cliente' or x.medio = 'efectivo')
  ),
  entra as (select pg.* from pg cross join lim where pg.registrado_en >= lim.ini and pg.registrado_en < lim.fin),
  sale as (select pg.* from pg cross join lim where pg.estado = 'anulado' and pg.anulado_en >= lim.ini and pg.anulado_en < lim.fin)
  select (e.registrado_en at time zone 'America/Lima')::date, e.ubicacion_id, 'pedido_web_pago:' || e.id, 'pedido_web_pago',
         retail.fn_asiento_cuenta_de_medio(e.medio, 'entra'), e.monto, 0::numeric, 'pedido_web_pagos', e.id,
         'Pago del pedido web ' || e.codigo || ' (' || e.medio || ')'
    from entra e
  union all
  select (e.registrado_en at time zone 'America/Lima')::date, e.ubicacion_id, 'pedido_web_pago:' || e.id, 'pedido_web_pago', '122',
         0::numeric, e.monto, 'pedido_web_pagos', e.id, 'Se le debe al cliente hasta que su pedido quede pagado y sea una venta'
    from entra e
  union all
  select (s.anulado_en at time zone 'America/Lima')::date, s.ubicacion_id, 'pedido_web_pago_anulado:' || s.id, 'pedido_web_pago_anulado',
         '122', s.monto, 0::numeric, 'pedido_web_pagos', s.id, 'Se anula el pago del pedido web ' || s.codigo
    from sale s
  union all
  select (s.anulado_en at time zone 'America/Lima')::date, s.ubicacion_id, 'pedido_web_pago_anulado:' || s.id, 'pedido_web_pago_anulado',
         retail.fn_asiento_cuenta_de_medio(s.medio, 'entra'), 0::numeric, s.monto, 'pedido_web_pagos', s.id,
         'Sale lo que se había anotado (' || s.medio || ')'
    from sale s;
$$;
revoke all on function retail.fn_asientos_pedidos_web(date, date, boolean, uuid[]) from public, anon, authenticated;

select pg_temp.anclar('retail.fn_asientos(date, date, uuid)',
  $v$    union all select * from retail.fn_asientos_igv_perdido(p_desde, p_hasta, v_todo, v_ubics)
$v$,
  $n$    union all select * from retail.fn_asientos_igv_perdido(p_desde, p_hasta, v_todo, v_ubics)
    -- ADR-0408 act. 10: los pagos de los pedidos web entran contra «Adelantos de clientes»; la venta del pedido los aplica.
    union all select * from retail.fn_asientos_pedidos_web(p_desde, p_hasta, v_todo, v_ubics)
$n$);

-- ----------------------------------------------------------------------------
-- 4. El otro camino de la 122: lo pagado de un pedido web que al corte todavía no era una venta
-- ----------------------------------------------------------------------------
select pg_temp.anclar('retail.fn_bal_anticipos(date)',
  $v$   group by s.ubicacion_id;$v$,
  $n$   group by s.ubicacion_id
  union all
  -- ADR-0408 act. 10: lo que un cliente pagó por su pedido web y al cierre de ese día todavía no era una venta ni se había anulado
  -- (las mismas reglas que el diario: uno digital anotado por error nunca existió). Entero: el pedido no tiene boleta de anticipo.
  select w.ubicacion_id, sum(x.monto)
    from retail.pedido_web_pagos x join retail.pedidos_web w on w.id = x.pedido_id cross join fin
   where x.origen = 'tienda' and x.registrado_en < fin.t
     and (x.estado = 'aprobado' or ((x.anulado_motivo = 'devuelto_al_cliente' or x.medio = 'efectivo') and x.anulado_en >= fin.t))
     and not exists (select 1 from retail.ventas v where v.id = w.venta_id and v.created_at < fin.t)
   group by w.ubicacion_id;$n$);

-- ----------------------------------------------------------------------------
-- 5. El otro camino de la 201: lo vendido por la web y todavía no entregado ya es del cliente
-- ----------------------------------------------------------------------------
select pg_temp.anclar('retail.fn_bal_stock(date)',
  $v$  al_corte as ($v$,
  $n$  -- ADR-0408 act. 10: lo vendido por la web que al cierre de ese día todavía no se entregaba ya es del cliente (su venta lo sacó de
  -- la mercadería en el diario): se descuenta de su tienda, aunque la prenda espere ahí o todavía falte conseguirla.
  vendido_web as (
    select vi.variante_id, v.ubicacion_id, -sum(vi.cantidad)::bigint as q
      from retail.pedido_web_lineas l
      join retail.venta_items vi on vi.id = l.venta_item_id
      join retail.ventas v on v.id = vi.venta_id
      cross join fin
     where v.created_at < fin.t and not coalesce(v.es_prueba, false)
       and not exists (select 1 from retail.movimientos m where m.venta_item_id = vi.id and m.tipo = 'salida' and m.created_at < fin.t)
     group by 1, 2
  ),
  al_corte as ($n$);
select pg_temp.anclar('retail.fn_bal_stock(date)',
  $v$      from (select * from actual union all select * from despues) x$v$,
  $n$      from (select * from actual union all select * from despues union all select * from vendido_web) x$n$);

-- ----------------------------------------------------------------------------
-- 6. Las causas del Balance: el efectivo de los pedidos web ya tiene origen (el diario lo tiene)
-- ----------------------------------------------------------------------------
select pg_temp.anclar('retail.fn_bal_causas_dinero(date, date)',
  $v$       and not exists (select 1 from retail.separaciones s where s.devolucion_caja_movimiento_id = cm.id)$v$,
  $n$       and not exists (select 1 from retail.separaciones s where s.devolucion_caja_movimiento_id = cm.id)
       -- ADR-0408 act. 10: lo que sale del cajón al anular un pago de un pedido web ya está en el diario.
       and not exists (select 1 from retail.pedido_web_pagos pw where pw.anulado_caja_movimiento_id = cm.id)$n$);
select pg_temp.anclar('retail.fn_bal_causas_dinero(date, date)',
  $v$       and not exists (select 1 from retail.apartados ap where ap.adelanto_caja_movimiento_id = cm.id)
       and not (cm.id = any (v_reemb_ids)$v$,
  $n$       and not exists (select 1 from retail.apartados ap where ap.adelanto_caja_movimiento_id = cm.id)
       -- ADR-0408 act. 10: el pago en efectivo de un pedido web ya está en el diario.
       and not exists (select 1 from retail.pedido_web_pagos pw where pw.caja_movimiento_id = cm.id)
       and not (cm.id = any (v_reemb_ids)$n$);

-- ----------------------------------------------------------------------------
-- 7. La fila de la 122 en la comprobación del Balance dice contra qué se mide
-- ----------------------------------------------------------------------------
select pg_temp.anclar('retail.fn_conciliacion_contable(date)',
  $v$'contra las separaciones que no se entregaron ni devolvieron'$v$,
  $n$'contra las separaciones y los pagos de pedidos web que todavía no son una venta ni se devolvieron'$n$);

-- ----------------------------------------------------------------------------
-- 8. Comprobación
-- ----------------------------------------------------------------------------
do $$
begin
  if position('pw.caja_movimiento_id = m.id' in pg_get_functiondef('retail.fn_flujo_lineas(date, date)'::regprocedure)) = 0
     or position('pw.anulado_caja_movimiento_id = m.id' in pg_get_functiondef('retail.fn_flujo_lineas(date, date)'::regprocedure)) = 0 then
    raise exception 'fn_flujo_lineas no quedó contando el efectivo de los pedidos web como efectivo de clientes';
  end if;
  if position('pw.cuenta_dinero_id' in pg_get_functiondef('retail.fn_dinero_libro(date)'::regprocedure)) = 0 then
    raise exception 'fn_dinero_libro no quedó contando lo digital de los pedidos web en su cuenta sellada';
  end if;
  if position('retail.fn_asientos_pedidos_web(p_desde, p_hasta, v_todo, v_ubics)' in pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure)) = 0 then
    raise exception 'fn_asientos no quedó sumando los pagos de los pedidos web';
  end if;
  if position('retail.pedido_web_pagos' in pg_get_functiondef('retail.fn_bal_anticipos(date)'::regprocedure)) = 0 then
    raise exception 'fn_bal_anticipos no quedó contando lo pagado de los pedidos web';
  end if;
  if position('select * from vendido_web' in pg_get_functiondef('retail.fn_bal_stock(date)'::regprocedure)) = 0 then
    raise exception 'fn_bal_stock no quedó descontando lo vendido por la web que falta entregar';
  end if;
  if position('pw.caja_movimiento_id = cm.id' in pg_get_functiondef('retail.fn_bal_causas_dinero(date, date)'::regprocedure)) = 0
     or position('pw.anulado_caja_movimiento_id = cm.id' in pg_get_functiondef('retail.fn_bal_causas_dinero(date, date)'::regprocedure)) = 0 then
    raise exception 'fn_bal_causas_dinero no quedó reconociendo el efectivo de los pedidos web';
  end if;
end;
$$;

reset lock_timeout;
