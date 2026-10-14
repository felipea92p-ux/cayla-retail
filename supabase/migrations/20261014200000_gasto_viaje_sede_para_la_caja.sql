-- ============================================================================
-- 20261014200000_gasto_viaje_sede_para_la_caja.sql — ADR-0362 fase 6 (/chaos 2026-10-14, Felipe 2026-10-14)
--
-- EL PROBLEMA PRIMERO. Un gasto del viaje es de la sede de quien lo registra o, si no tiene una (un líder), de la que gestiona su
-- primera orden (`registrar_gasto_viaje`, decisión 46). Y si se paga en efectivo de un cajón, la caja tiene que ser de esa misma sede
-- (`fn_comprobante_y_pago`). La hoja, en cambio, ofrecía las cajas de la sede de ARRIBA: /chaos (2026-10-14) abrió como Felipe, en
-- Tienda Lima, el gasto de una orden de Trujillo; la hoja propuso «Cajón · Tienda Lima» y la base lo rechazó con «Es de otra tienda que
-- la caja que lo paga.», sin decir qué elegir.
--
-- LA DECISIÓN (Felipe 2026-10-14, con «lo menor» de /chaos). La hoja propone la caja de la tienda del gasto. Para eso le pregunta a la
-- base, con la MISMA regla, de qué sede es el gasto: `fn_gasto_viaje_sede(órdenes)`. Una lectura, sin escribir nada.
--
-- CONTRATO (Liskov)
--   PROMETE: la sede de quien pregunta, si tiene una asignada y activa; si no, la que gestiona la primera de esas órdenes (la misma que
--            elige `registrar_gasto_viaje`); `null` si no hay ninguna. Quien no ve Órdenes de compra recibe 42501.
--   ASUME:   `fn_orden_compra_gestora`.
--   NO HACE: no escribe, no cambia la regla de `registrar_gasto_viaje` ni la de `fn_comprobante_y_pago`.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: una función nueva, sin tablas ni políticas. Idempotente.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_gasto_viaje_sede(p_ordenes uuid[])
returns uuid
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $function$
declare
  v_yo uuid;
  v_ordenes uuid[];
begin
  if not retail.fn_ve_modulo('ordenes_compra') then
    raise exception 'Registrar un gasto del viaje necesita el módulo Órdenes de compra en tu rol.' using errcode = '42501';
  end if;
  -- Quien pregunta (la persona de la cuenta: esta lectura no firma nada). Desde una terminal no hay persona: decide la orden.
  v_yo := (select p.id from public.personas p where p.auth_user_id = auth.uid());
  -- Las órdenes como las ordena `registrar_gasto_viaje` (distintas, en orden): «la primera» es la misma allá y aquí.
  v_ordenes := (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(p_ordenes, '{}'::uuid[])) x where x is not null);
  return coalesce(
    (select u.id from retail.colaboradores co join retail.ubicaciones u on u.id = co.ubicacion_asignada_id
      where co.persona_id = v_yo and u.activo limit 1),
    case when cardinality(v_ordenes) > 0 then retail.fn_orden_compra_gestora(v_ordenes[1]) end);
end $function$;
comment on function retail.fn_gasto_viaje_sede(uuid[]) is
  'ADR-0362 fase 6 (/chaos 2026-10-14): de qué sede es un gasto del viaje con esas órdenes (la de quien pregunta o la que gestiona la primera orden, como registrar_gasto_viaje). La hoja la usa para proponer la caja de esa tienda.';

revoke all on function retail.fn_gasto_viaje_sede(uuid[]) from public, anon;
grant execute on function retail.fn_gasto_viaje_sede(uuid[]) to authenticated;

reset lock_timeout;
notify pgrst, 'reload schema';
