-- Fondos por rendir, fase 6 · actividad 2 (ADR-0362, decisiones 26, 32 y 46): pagar a un proveedor desde «Mi fondo».
--
-- EL PROBLEMA PRIMERO. Con la actividad 1 la compradora ya recibe plata en su fondo, pero no puede gastarla en el sistema: el pago de
-- un comprobante (al contado, al registrar el de una orden, o después en Por pagar) solo sale de un cajón, una caja fuerte, un banco o
-- lo que tiene el líder. Lo que pagó con su fondo terminaría registrado como si hubiera salido de la tienda: el cajón no cuadraría al
-- cierre y su fondo diría que todavía tiene la plata. Y si el fondo no alcanza, la decisión 32 dice que paga de su bolsillo y CAYLA
-- se lo debe: el sistema tiene que aceptarlo, no frenarlo.
--
-- QUÉ CREA
--   1. `fn_fondo_para_pagar(cuenta, medio)`, interna: el candado del fondo al pagar. Solo su dueña, con SU cuenta (nunca desde una
--      terminal: ahí cualquiera elige un nombre en el combo) y firmando ella (el responsable es la misma persona); en efectivo, Yape,
--      Plin, transferencia, depósito u «otro» (con tarjeta la plata es de la tarjeta de crédito o de un banco de CAYLA); el fondo,
--      vivo. Toma el mismo candado por persona que entregar, devolver y anular: un pago y la anulación de una entrega no se cruzan.
--      NO mira el saldo: el fondo puede quedar en negativo, y ese negativo es «CAYLA te debe» (decisión 32, sin tope).
--   2. `fn_mi_fondo()`: el fondo de quien mira (su cuenta y lo que tiene en la mano). Sin módulo: es lo suyo. Una terminal no tiene
--      dueña: no ve ninguno. Lo usan los pagos de Compras para ofrecer «Mi fondo» (y la actividad 5, para «Tu fondo»).
--   3. Reemplazos anclados en la definición viva (abortan sin cambiar nada si la función cambió desde que se escribió esto):
--      · `fn_compra_pagos_sellar`: un pago con la cuenta de un fondo no pasa por `fn_cuenta_sellada` (que no acepta un fondo en ningún
--        otro lado: gastos, activos, Producción, cobros) sino por `fn_fondo_para_pagar`, y no toca ninguna caja.
--      · `fn_asientos`: el pago sale de la cuenta del fondo (1413), no de la que diría su medio (101 en efectivo, 104 por Yape). Sin
--        esto el Diario restaría de la caja una plata que nunca salió de una caja, y el Balance de la 101 no cuadraría.
--
-- DESCARTÉ
--   · Que `fn_cuenta_sirve` acepte el tipo `fondo`: esa tabla la usan las 13 pantallas que preguntan «¿De dónde sale la plata?» y los
--     sellos de gastos, activos y Producción; el fondo se habría colado en todas, y sus asientos (que van por el medio) habrían caído en
--     la 101. Fuera de los pagos a proveedores el fondo llega con su propia regla (los gastos del viaje, actividad 4).
--   · Topar el pago en lo que hay en el fondo: la decisión 32 dice lo contrario (paga de su bolsillo; sin tope).
--   · Dejar que una terminal pague desde el fondo del responsable que se elige en el combo: elegir un nombre no prueba quién tiene la
--     plata. Con la cuenta de la persona, sí.
--
-- SE ROMPE SI · alguien agrega otro camino que escriba `compra_pagos` sin pasar por el disparador (no hay ninguno: las 4 funciones que
--   pagan insertan y el disparador sella); o una pantalla nueva de pagos usa `useCuentasParaElegir("pago")` sin `conMiFondo`: no
--   rompe nada, solo no ofrece el fondo.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte, DESPUÉS de 20261013181000 y 20261013182000: funciones nuevas y
-- reemplazos anclados; sin tablas, sin políticas, sin `drop trigger` (ADR-0195) y sin `select … into` dentro de textos entre comillas
-- (ADR-0288). Los anclajes se comprobaron contra producción en solo lectura el 2026-10-13 (`fn_compra_pagos_sellar` 27c3d60e…,
-- `fn_asientos` 9383864f…, una aparición cada uno). Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplaza un texto en la definición VIVA de una función, solo si aparece las veces esperadas; si ya está reemplazado, no hace nada.
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

-- ---------- 1. El candado del fondo al pagar ----------
create or replace function retail.fn_fondo_para_pagar(p_cuenta_id uuid, p_medio text) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_c retail.cuentas_dinero%rowtype;
  v_yo uuid;
begin
  select * into v_c from retail.cuentas_dinero where id = p_cuenta_id;
  if not found or v_c.tipo <> 'fondo' then
    raise exception 'Esa cuenta no es un fondo por rendir.' using errcode = 'P0001';
  end if;
  if v_c.archivada_en is not null then
    raise exception 'Ese fondo está cerrado: elige otra cuenta.' using errcode = 'P0001';
  end if;
  if coalesce(p_medio, '') not in ('efectivo', 'yape', 'plin', 'transferencia', 'deposito', 'otro') then
    raise exception 'Desde un fondo se paga en efectivo, Yape, Plin, transferencia o depósito.' using errcode = 'P0001';
  end if;
  -- La plata del fondo la tiene una persona: la mueve ella, con su cuenta. En una terminal cualquiera elige un nombre en el combo.
  if retail.fn_es_terminal() then
    raise exception 'Desde un fondo se paga solo con la cuenta de su dueña, no desde una terminal.' using errcode = '42501', hint = 'fondo_ajeno';
  end if;
  v_yo := (select p.id from public.personas p where p.auth_user_id = auth.uid());
  if v_yo is null or v_yo <> v_c.persona_id then
    raise exception 'Desde un fondo paga solo su dueña: «%» no es el tuyo.', v_c.nombre using errcode = '42501', hint = 'fondo_ajeno';
  end if;
  if retail.fn_actor_persona_id(true) is distinct from v_yo then
    raise exception 'Desde tu fondo pagas tú: elige tu nombre en «Responsable».' using errcode = '42501', hint = 'fondo_ajeno';
  end if;
  -- El mismo candado por persona que entregar, devolver y anular (20261013182000): si a la vez se anula una entrega, la anulación
  -- espera y ve este pago al decidir si esa plata ya se usó.
  perform pg_advisory_xact_lock(hashtextextended('fondo:' || v_c.persona_id::text, 0));
end $$;

-- ---------- 2. Lo que tiene quien mira ----------
create or replace function retail.fn_mi_fondo()
returns table (cuenta_id uuid, nombre text, saldo numeric)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_yo uuid;
begin
  if auth.uid() is null or retail.fn_es_terminal() then
    return;
  end if;
  v_yo := (select p.id from public.personas p where p.auth_user_id = auth.uid());
  return query
  select c.id, c.nombre, retail.fn_fondo_saldo(c.id)
    from retail.cuentas_dinero c
   where c.tipo = 'fondo' and c.persona_id = v_yo and c.archivada_en is null;
end $$;

-- ---------- 3. Los pagos a proveedores aprenden el fondo ----------
select pg_temp.reemplazar('retail.fn_compra_pagos_sellar()',
$v$  new.cuenta_dinero_id := retail.fn_cuenta_sellada('pago', new.metodo, new.ubicacion_id, new.fecha, new.cuenta_dinero_id);$v$,
$n$  -- ADR-0362 fase 6: el fondo por rendir de quien paga no pasa por `fn_cuenta_sellada` (no lo acepta en ningún otro lado): lo
  -- valida `fn_fondo_para_pagar` (su dueña, con su cuenta) y no toca ninguna caja. Puede quedar en negativo: «CAYLA te debe».
  if new.cuenta_dinero_id is not null and exists (select 1 from retail.cuentas_dinero f where f.id = new.cuenta_dinero_id and f.tipo = 'fondo') then
    if new.caja_movimiento_id is not null then
      raise exception 'Solo lo que sale de un cajón se une a un egreso de caja.' using errcode = 'P0001';
    end if;
    perform retail.fn_fondo_para_pagar(new.cuenta_dinero_id, new.metodo);
    return new;
  end if;
  new.cuenta_dinero_id := retail.fn_cuenta_sellada('pago', new.metodo, new.ubicacion_id, new.fecha, new.cuenta_dinero_id);$n$,
1);

-- El Diario: el pago desde un fondo sale de la cuenta del fondo (1413), no de la de su medio.
select pg_temp.reemplazar('retail.fn_asientos(date, date, uuid)',
$v$           coalesce(c.documento, concat_ws('-', c.serie, c.numero)) as doc
      from retail.compra_pagos p join retail.compras c on c.id = p.compra_id$v$,
$n$           coalesce(c.documento, concat_ws('-', c.serie, c.numero)) as doc,
           -- ADR-0362 fase 6: pagado desde un fondo por rendir, sale de la cuenta del fondo (1413).
           (select f.cuenta_contable from retail.cuentas_dinero f where f.id = p.cuenta_dinero_id and f.tipo = 'fondo') as cta_fondo
      from retail.compra_pagos p join retail.compras c on c.id = p.compra_id$n$,
1);

select pg_temp.reemplazar('retail.fn_asientos(date, date, uuid)',
$v$    select pg.f, pg.ubicacion_id, 'pago_proveedor:' || pg.id, 'pago_proveedor', retail.fn_asiento_cuenta_de_medio(pg.metodo, 'sale'), 0, pg.monto,
           'compra_pagos', pg.id, 'Sale por ' || pg.metodo$v$,
$n$    select pg.f, pg.ubicacion_id, 'pago_proveedor:' || pg.id, 'pago_proveedor', coalesce(pg.cta_fondo, retail.fn_asiento_cuenta_de_medio(pg.metodo, 'sale')), 0, pg.monto,
           'compra_pagos', pg.id, case when pg.cta_fondo is not null then 'Sale del fondo por rendir (' || pg.metodo || ')' else 'Sale por ' || pg.metodo end$n$,
1);

-- ---------- 4. Permisos ----------
revoke all on function retail.fn_fondo_para_pagar(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_mi_fondo() from public, anon;
grant execute on function retail.fn_mi_fondo() to authenticated, service_role;

reset lock_timeout;
notify pgrst, 'reload schema';
