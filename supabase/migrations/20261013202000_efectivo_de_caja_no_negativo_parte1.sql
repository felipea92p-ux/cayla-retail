-- ============================================================================
-- 20261013202000_efectivo_de_caja_no_negativo_parte1.sql — CAYLA V2 (/chaos 2026-10-13, decisión de Felipe 2026-10-13)
--
-- EL PROBLEMA PRIMERO. El efectivo que una caja abierta espera tener en el cajón (`fn_calcular_esperado_caja`: apertura +
-- ventas en efectivo + entradas − salidas − reembolsos en efectivo ± vueltos de cambios) podía quedar en NEGATIVO: un retiro,
-- un gasto en efectivo, el reembolso de una devolución, el vuelto de un cambio, anular una venta en efectivo o pasar su pago a
-- tarjeta, por más plata de la que hay. /chaos lo hizo el 2026-10-13 (un egreso de S/ 500 con S/ 100 en el cajón quedó
-- guardado) y dos egresos a la vez de S/ 300 contra S/ 390 pasaban los dos. Un cajón con −S/ 110 no existe: es un estado
-- imposible, y el cierre lo mostraba como «faltante» de quien contó.
--
-- LA DECISIÓN (Felipe, 2026-10-13): la base lo impide. Ninguna operación deja el esperado de una caja ABIERTA bajo cero.
--   · La regla vive en UNA función, `fn_exigir_efectivo_en_caja(caja)`, que recalcula el esperado con la misma cuenta que usa
--     `cerrar_caja` y, si queda bajo cero, rechaza con `efectivo_insuficiente`.
--   · La llaman disparadores de restricción DIFERIDOS (parte 2): corren al confirmar la transacción, cuando la operación ya tomó
--     todos sus candados. Ahí toman un candado por caja (`pg_advisory_xact_lock`), el último de todos: dos salidas a la vez de la
--     misma caja se ordenan, y la segunda ve la primera (así no pasan las dos). Ser diferidos también cubre a quien borra y
--     vuelve a escribir (`corregir_pagos_venta` borra los pagos y los inserta de nuevo): se mira el resultado final.
--   · Quien puede cerrar la caja ve la cifra; una integrante no (el arqueo ciego, ADR-0186): solo el «no hay tanto efectivo».
--
-- CONTRATO (Liskov)
--   PROMETE: al confirmar una operación que saca efectivo de una caja abierta, si el esperado queda < 0 la transacción entera se
--            deshace con `efectivo_insuficiente` (P0001). Exactamente 0 se acepta. Una caja cerrada no se mira (su cuenta ya se
--            cerró). Nada cambia para lo que deja el esperado en 0 o más.
--   ASUME:   `fn_calcular_esperado_caja` y `fn_puede_gestionar_caja`.
--   NO HACE: no crea los disparadores (parte 2), no toca tablas ni políticas, no corrige cajas que ya estén en negativo (antes de
--            pegar en producción se revisa que no haya ninguna abierta así).
--
-- CÓMO SE PEGA. Una sola parte: solo funciones. Idempotente. Va ANTES de la parte 2.
-- ============================================================================
set lock_timeout = '3s';

create or replace function retail.fn_exigir_efectivo_en_caja(p_caja_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_esperado numeric;
begin
  if p_caja_id is null then
    return;
  end if;
  -- El último candado de la operación: dos salidas a la vez de la misma caja se ordenan aquí y la segunda ve la primera.
  perform pg_advisory_xact_lock(hashtextextended('efectivo_de_caja:' || p_caja_id::text, 0));
  if (select c.estado from retail.cajas c where c.id = p_caja_id) is distinct from 'abierta' then
    return;
  end if;
  v_esperado := (select e.esperado from retail.fn_calcular_esperado_caja(p_caja_id) e);
  if v_esperado < 0 then
    if retail.fn_puede_gestionar_caja() then
      raise exception 'No hay tanto efectivo en la caja: con esto el cajón quedaría en S/ %. Revisa el monto, o usa otro medio.',
        to_char(v_esperado, 'FM999999990.00')
        using errcode = 'P0001', hint = 'efectivo_insuficiente';
    end if;
    raise exception 'No hay tanto efectivo en la caja para esto. Revisa el monto, usa otro medio o pídele ayuda a quien cierra la caja.'
      using errcode = 'P0001', hint = 'efectivo_insuficiente';
  end if;
end;
$$;

comment on function retail.fn_exigir_efectivo_en_caja(uuid) is
  'Interna: rechaza (efectivo_insuficiente) si el efectivo esperado de una caja abierta quedó bajo cero. La llaman disparadores diferidos.';
revoke all on function retail.fn_exigir_efectivo_en_caja(uuid) from public, anon, authenticated;

-- La función de los disparadores: saca la caja de la fila y pregunta. Un pago de venta borrado o cambiado mira la caja de su venta.
create or replace function retail.trg_efectivo_de_caja()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_caja uuid;
begin
  if tg_table_name = 'venta_pagos' then
    v_caja := (select v.caja_id from retail.ventas v where v.id = coalesce(old.venta_id, new.venta_id));
  elsif tg_op = 'DELETE' then
    v_caja := old.caja_id;
  else
    v_caja := new.caja_id;
  end if;
  perform retail.fn_exigir_efectivo_en_caja(v_caja);
  return null;
end;
$$;

comment on function retail.trg_efectivo_de_caja() is
  'Disparador diferido: al confirmar algo que saca efectivo de una caja, exige que su esperado no quede bajo cero.';
revoke all on function retail.trg_efectivo_de_caja() from public, anon, authenticated;
