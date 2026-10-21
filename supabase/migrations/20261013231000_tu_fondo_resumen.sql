-- «Tu fondo», fase 6 · actividad 4 (ADR-0362, decisiones 26 y 32): lo que la compradora ve de su fondo donde compra y en el Inicio.
--
-- EL PROBLEMA PRIMERO. Con las actividades 1 a 3 la compradora recibe plata, paga a proveedores y anota los gastos del viaje desde su
-- fondo, pero para saber cuánto le queda tiene que abrir la hoja de un pago y mirar el combo «Sale de». La decisión 26 pide lo contrario:
-- «al final tiene que verse cuánto le queda», a la vista, como control contra el fraude. `fn_mi_fondo` (20261013212000) solo trae el
-- saldo, para el combo; la tarjeta necesita también de dónde salió ese saldo.
--
-- QUÉ CREA
--   · `fn_mi_fondo_resumen()`: el fondo de quien mira, en una fila: lo que tiene en la mano (en negativo, lo que CAYLA le debe: decisión
--     32), lo que le entregaron, lo que devolvió, lo que pagó a proveedores, lo que salió como gasto (los del viaje) y, por si algún día
--     otra cosa mueve el fondo, «otros» (lo que falta para cuadrar: hoy siempre 0). Más el «para qué» de la última entrega y desde cuándo
--     tiene plata. Sin módulo: es lo suyo, como `fn_mi_fondo`. Una terminal no tiene dueña: nada. Quien no tiene fondo: nada, sin leer el
--     libro (la mayoría de las personas abre el Inicio sin fondo; el libro tarda ~90 ms en producción, medido el 2026-10-13).
--
-- DESCARTÉ
--   · Sumar cada cosa desde su tabla (`compra_pagos`, `gastos`, `movimientos_dinero`): serían dos verdades. Todo sale del MISMO libro que
--     «Cuentas y dinero» y que el saldo (`fn_dinero_libro`), en una sola pasada; por eso el desglose cuadra siempre con el saldo.
--   · Ampliar `fn_mi_fondo`: cambiar lo que devuelve obliga a borrarla y crearla de nuevo, y la usan los pagos para el combo, que solo
--     necesita el saldo.
--   · Contar solo desde la última rendición: todavía no existe (actividad 5). Ese día esta función cambia por dentro (`create or replace`,
--     mismas columnas) y la pantalla no se toca.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (autorización de Felipe para la fase 6). Una sola parte: una función nueva; sin tablas, sin políticas, sin
-- `drop`, sin `select … into` dentro de textos entre comillas (ADR-0288). Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_mi_fondo_resumen()
returns table (
  cuenta_id uuid, nombre text, saldo numeric, entregado numeric, devuelto numeric, pagado numeric, gastos numeric, otros numeric,
  desde date, para_que text, ultima_entrega date
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_yo uuid;
  v_fondo uuid;
  v_nombre text;
  v_inicial numeric;
begin
  if auth.uid() is null or retail.fn_es_terminal() then
    return;
  end if;
  v_yo := (select p.id from public.personas p where p.auth_user_id = auth.uid());
  for v_fondo, v_nombre, v_inicial in
    select c.id, c.nombre, coalesce(c.saldo_inicial, 0) from retail.cuentas_dinero c
     where c.tipo = 'fondo' and c.persona_id = v_yo and c.archivada_en is null
  loop
    exit;
  end loop;
  if v_fondo is null then
    return;
  end if;
  return query
  with libro as materialized (
    select l.monto, l.origen from retail.fn_dinero_libro(retail.fn_hoy_lima()) l where l.cuenta_id = v_fondo
  ),
  entregas as (
    select d.fecha, d.created_at, d.referencia from retail.movimientos_dinero d
     where d.tipo = 'entrega_fondo' and d.estado = 'vigente' and d.cuenta_destino_id = v_fondo
  ),
  sumas as (
    select v_inicial + coalesce(sum(l.monto), 0) as saldo,
           coalesce(sum(l.monto) filter (where l.origen = 'movimiento' and l.monto > 0), 0) as entregado,
           coalesce(-sum(l.monto) filter (where l.origen = 'movimiento' and l.monto < 0), 0) as devuelto,
           coalesce(-sum(l.monto) filter (where l.origen = 'pago'), 0) as pagado,
           coalesce(-sum(l.monto) filter (where l.origen = 'gasto'), 0) as gastos
      from libro l
  )
  select v_fondo, v_nombre, s.saldo, s.entregado, s.devuelto, s.pagado, s.gastos,
         -- Lo que falta para cuadrar: entregado − devuelto − pagado − gastos tiene que dar el saldo. Hoy siempre 0.
         s.saldo - (v_inicial + s.entregado - s.devuelto - s.pagado - s.gastos),
         (select min(e.fecha) from entregas e),
         (select e.referencia from entregas e order by e.fecha desc, e.created_at desc limit 1),
         (select max(e.fecha) from entregas e)
    from sumas s;
end $$;

comment on function retail.fn_mi_fondo_resumen() is
  'ADR-0362 fase 6 · actividad 4: la tarjeta «Tu fondo» de quien mira (Órdenes de compra e Inicio). Todo sale del mismo libro que el saldo (fn_dinero_libro). Sin fondo o desde una terminal: nada.';

revoke all on function retail.fn_mi_fondo_resumen() from public, anon;
grant execute on function retail.fn_mi_fondo_resumen() to authenticated, service_role;

reset lock_timeout;
notify pgrst, 'reload schema';
