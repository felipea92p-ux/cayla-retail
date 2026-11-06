-- ============================================================================
-- 20261106000000 — Cargar el arranque sin trampa (tarea 4 de «Las 36 de Finanzas»)
--
-- EL PROBLEMA PRIMERO. Tres cosas hacían imposible cargar bien el arranque:
--   1. Con un día anterior al `saldo_desde` de un banco, `fn_bal_dinero` ya le sumaba su saldo inicial: la propuesta traía el saldo real de fin de mes, y la
--      comprobación lo explicaba dos veces («antes del arranque» y «cuenta nueva»), así que quedaba «sin explicar» sin que nadie lo adivinara.
--   2. La caja fuerte no admitía saldo inicial, y la 101 no se edita la primera vez: lo que había en la caja fuerte no tenía dónde decirse, y sin eso no se
--      puede depositar lo que de verdad había.
--   3. «Por rendir» está en −S/ 4.60 y tampoco se podía declarar.
--
-- LA DECISIÓN.
--   1. Antes de abrir su `saldo_desde`, una cuenta no tiene plata: la causa `cuenta_nueva` ya explica la diferencia, una sola vez. El signo de esa causa estaba bien:
--      lo que estaba mal era contarla dos veces. La pantalla frena además un arranque anterior a un banco (`SaldosArranqueModal`).
--   2. y 3. La caja fuerte y «por rendir» llevan saldo inicial, como un banco. El cajón no: su punto de partida es la caja que se cierra.
-- NO se extiende `fn_exigir_efectivo_en_cuenta` a «por rendir»: con su saldo actual rechazaría toda operación de esa cuenta hasta regularizarlo.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución. Sin tablas ni políticas. Reescribe tres funciones desde su definición viva; si un ancla no aparece exactamente
-- las veces esperadas, aborta entero. Pegarla dos veces no hace nada. Verificado: `pnpm pruebas:balance` y `pnpm pruebas:editar-cuentas`.
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

select pg_temp.reemplazar('retail.fn_bal_dinero(date)',
$a$           else c.saldo_inicial + coalesce((select sum(l.monto) from libro l$a$,
$n$           -- Tarea 4: antes de su `saldo_desde`, la cuenta no tiene plata. El saldo inicial es de abrir ese día, o sea, del cierre del día anterior.
           when c.saldo_desde is not null and p_corte + 1 < c.saldo_desde then 0
           else c.saldo_inicial + coalesce((select sum(l.monto) from libro l$n$, 1);

select pg_temp.reemplazar('retail.editar_cuenta_dinero(uuid,text,text,text,numeric,date)',
$a$    if v_automatica then
      raise exception 'El cajón, la caja fuerte y el efectivo por rendir no llevan saldo inicial.' using errcode = 'P0001';$a$,
$n$    if v_c.tipo = 'cajon' then
      raise exception 'El cajón no lleva saldo inicial: su punto de partida es la caja que se cierra.' using errcode = 'P0001';$n$, 1);

select pg_temp.reemplazar('retail.fn_cuenta_dinero_detalle(uuid)',
$a$    when v_automatica then 'El cajón, la caja fuerte y el efectivo por rendir no llevan saldo inicial: su punto de partida se registra en Reportes ▸ Balance.'$a$,
$n$    when v_c.tipo = 'cajon' then 'El cajón no lleva saldo inicial: su punto de partida es la caja que se cierra.'$n$, 1);

reset lock_timeout;
