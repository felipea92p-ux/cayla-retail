-- ADR-0393 (Felipe, 2026-10-14): «Recibir mercadería» vive en Inventario, para todos, y sale de Compras.
--
-- EL PROBLEMA PRIMERO. Recibir aparecía en dos lugares del menú según quién mirara (ADR-0113): en Compras para quien ve el dinero de
-- Compras y en Inventario para quien no. La mudanza a Inventario ya estaba decidida (ADR-0362, decisión 38: «Órdenes de compra» entró como
-- séptima hija de Compras «mientras Recibir siga en Compras») y la base de producción ya tenía el módulo en el grupo «Inventario» desde el
-- 2026-10-07, con su orden viejo (160, entre los de Compras), pero ningún archivo del repo lo decía: una base hecha de cero lo dejaba en
-- «Compras». Felipe pidió el 2026-10-14 que Recibir esté en Inventario, también en el menú lateral.
--
-- QUÉ HACE. Una fila de `retail.modulos`: el grupo «Inventario» y el orden 115, justo después de Movimientos (110) y antes de Catálogo
-- (120), para que Roles y accesos lo muestre junto a las demás pantallas de Inventario. Sin `alter`, sin políticas, sin `rol_modulos`: nadie
-- gana ni pierde el módulo (ADR-0161). La web lo espeja en `apps/web/lib/modulos.ts`, y `lib/menu.ts` deja una sola fila, en Inventario.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, a cualquier hora; idempotente.
set lock_timeout = '3s';

update retail.modulos set grupo = 'Inventario', orden = 115 where clave = 'recibir' and (grupo <> 'Inventario' or orden <> 115);

do $$
begin
  if not exists (select 1 from retail.modulos where clave = 'recibir' and grupo = 'Inventario' and orden = 115) then
    raise exception 'retail.modulos: «recibir» tiene que quedar en el grupo Inventario con orden 115';
  end if;
end;
$$;

reset lock_timeout;
