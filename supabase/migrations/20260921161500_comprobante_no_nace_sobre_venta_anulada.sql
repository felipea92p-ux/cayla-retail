-- ============================================================================
-- 20260921161500_comprobante_no_nace_sobre_venta_anulada.sql — CAYLA V2
--
-- QUÉ CAMBIA: un candado en la TABLA `comprobantes`: no se puede insertar un comprobante ligado a una
-- venta ANULADA. Trigger `comprobantes_venta_no_anulada` (before insert) y su función
-- `fn_comprobante_de_venta_no_anulada`.
--
-- POR QUÉ (hallado el 2026-09-21 al leer `emitir_comprobante` en producción, y confirmado por la revisión
-- independiente de `20260921121500`): `emitir_comprobante` acepta cualquier `p_venta_id`, también el de una
-- venta anulada, y `convertir_proforma_a_comprobante` se lo pasa sin mirar. Deja un comprobante `pendiente`
-- sobre una venta que ya se le devolvió a la clienta: el mismo estado imposible que `20260921121500` cerró
-- del otro lado (anular libera el pendiente), sin nada que impidiera crearlo después. Hoy solo se llega
-- llamando la RPC a mano, o por una carrera con la anulación: el `for update` de `anular_venta` sobre la
-- venta hace esperar al `insert` (por el FK), y este entra apenas se anula. La pantalla no lo ofrece (la
-- lista de Facturación ya no trae ventas anuladas) y `/api/lucode/emitir` se niega a transmitirlo, pero eso
-- solo tapa los síntomas: el estado se podía crear.
--
-- POR QUÉ EN LA TABLA Y NO DENTRO DE `emitir_comprobante`: el mismo criterio de `20260916214500` para
-- cambios y devoluciones (principio 2, «cero estados inconsistentes»): el candado en la tabla cubre
-- CUALQUIER camino que inserte —`emitir_comprobante`, `convertir_proforma_a_comprobante`, una RPC futura, un
-- insert a mano—, no solo los que hoy conocemos. Y no obliga a recrear `emitir_comprobante` (idempotencia,
-- validación del IGV): menos superficie para derivar de producción.
--
-- LA REGLA:
--   · Un comprobante sin venta (manual, o una nota de crédito) pasa sin mirar nada.
--   · Con venta: toma `for share` sobre ella. `anular_venta` la toma `for update` primero, así que si
--     corren a la vez una espera a la otra y la segunda ve el estado real: anulada primero → el insert se
--     rechaza; emitido primero → la anulación espera, ve el comprobante y lo libera (`20260921121500`). En
--     ningún orden queda un pendiente sobre una venta anulada.
--   · Una venta que no existe no se decide acá: lo dice el FK.
--   · El rechazo aborta la transacción, y con ella la reserva del correlativo: no se quema un número.
--
-- QUÉ NO CAMBIA: `emitir_comprobante` y `convertir_proforma_a_comprobante` (ni firma ni cuerpo), ni los
-- comprobantes que ya existen (el trigger solo mira inserts nuevos; al 2026-09-21, en producción, 17 con
-- venta y ninguna anulada). NO comprueba que la venta sea de la misma ubicación: no hay un solo caso, y una
-- facturación central lo querría distinto.
--
-- SE ROMPE SI: alguien intenta emitirle un comprobante a una venta anulada (sale un mensaje que dice por
-- qué; lo que corresponde es Cambio o Devolución sobre lo vendido). Lo cubre
-- `scripts/pruebas/comprobante_venta_anulada.mjs` (`pnpm pruebas:comprobante-venta-anulada`).
--
-- REVERSIBLE: `drop trigger comprobantes_venta_no_anulada on retail.comprobantes;` y
-- `drop function retail.fn_comprobante_de_venta_no_anulada();`.
--
-- PRODUCCIÓN. Se pega tal cual en el SQL Editor: ya trae el `set search_path` de abajo. Objetos nuevos
-- (una función y un trigger): no hay firma que pueda quedar duplicada.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.fn_comprobante_de_venta_no_anulada()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_estado text;
begin
  if new.venta_id is null then
    return new;
  end if;
  select v.estado into v_estado from ventas v where v.id = new.venta_id for share;
  if v_estado = 'anulada' then
    raise exception 'Esta venta está anulada — no se le puede emitir un comprobante';
  end if;
  return new;
end;
$$;

revoke all on function retail.fn_comprobante_de_venta_no_anulada() from public;
grant execute on function retail.fn_comprobante_de_venta_no_anulada() to authenticated;

create or replace trigger comprobantes_venta_no_anulada
  before insert on retail.comprobantes
  for each row execute function retail.fn_comprobante_de_venta_no_anulada();
