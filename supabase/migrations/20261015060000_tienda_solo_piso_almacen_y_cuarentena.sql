-- ============================================================================
-- 20261015060000_tienda_solo_piso_almacen_y_cuarentena.sql — CAYLA V2 · tienda online (ADR-0408, integración)
--
-- EL PROBLEMA. La tienda online dice «hay» con `fn_tienda_disponible` (20261015012000): lo libre de `fn_existencias_base`, que
-- cuenta TODO lugar de la tienda menos la Cuarentena. Al confirmar un pedido web, el motor (`fn_pedido_web_reservar`,
-- 20261014235000) reserva solo del piso, del almacén o de lo que no tiene lugar. Las dos reglas coinciden mientras una tienda
-- tenga solo esos lugares; con un lugar de otro tipo (un «rack», como los del Taller), la web diría «hay» de una prenda que la
-- tienda no podría confirmar desde ahí. Nada lo impedía: `sububicaciones.tipo` es texto libre.
--
-- LA DECISIÓN (Felipe, 2026-10-15, con la recomendación de la sesión): una TIENDA solo tiene piso (`piso_venta`), almacén
-- (`almacen_tienda`) y Cuarentena (`cuarentena`, lo dañado, que no se vende: ni Vender ni la web lo ofrecen). El Taller sigue con
-- sus racks. Si un día una tienda necesita otro lugar, primero se decide cómo lo cuenta la web y se cambia esta lista. Producción,
-- leída el 2026-10-15: las 3 tiendas tienen exactamente esos 3 lugares; nada que corregir.
--
-- CÓMO. Un disparador antes de crear o cambiar un lugar: si es de una tienda y su tipo no es uno de los tres, se niega
-- (23514, hint `sububicacion_de_tienda`). Si la base ya tuviera un lugar así, la migración se detiene ANTES de crear nada y lo
-- dice (no se arregla a ciegas: es una decisión de la tienda). Cambiar el tipo de una ubicación (de Taller a tienda) no lo vigila:
-- no hay pantalla que lo haga.
--
-- PEGAR EN PRODUCCIÓN: una sola parte, se puede pegar dos veces (`create or replace`), sin políticas, sin `drop trigger`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
declare
  v_cuantos int := (
    select count(*)
    from retail.sububicaciones s
    join retail.ubicaciones u on u.id = s.ubicacion_id
    where u.tipo = 'tienda' and coalesce(s.tipo, '') not in ('piso_venta', 'almacen_tienda', 'cuarentena'));
begin
  if v_cuantos > 0 then
    raise exception 'Hay % lugar(es) de tienda que no son piso, almacén ni Cuarentena: decidir qué hacer con ellos antes de pegar esta migración.', v_cuantos;
  end if;
end;
$$;

create or replace function retail.fn_sububicacion_de_tienda_valida()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  -- Sin tipo también se niega: `fn_existencias_base` lo contaría y el motor no.
  if coalesce(new.tipo, '') not in ('piso_venta', 'almacen_tienda', 'cuarentena')
     and exists (select 1 from retail.ubicaciones u where u.id = new.ubicacion_id and u.tipo = 'tienda') then
    raise exception 'Una tienda solo tiene piso, almacén y Cuarentena.'
      using errcode = '23514', hint = 'sububicacion_de_tienda', detail = coalesce(new.tipo, '(sin tipo)');
  end if;
  return new;
end;
$$;

comment on function retail.fn_sububicacion_de_tienda_valida() is
  'ADR-0408 (integración): una tienda solo tiene piso, almacén y Cuarentena, así la web y la confirmación de un pedido web cuentan lo mismo. El Taller sigue con sus racks.';

revoke all on function retail.fn_sububicacion_de_tienda_valida() from public, anon, authenticated;

create or replace trigger sububicacion_de_tienda_valida
  before insert or update of tipo, ubicacion_id on retail.sububicaciones
  for each row execute function retail.fn_sububicacion_de_tienda_valida();
