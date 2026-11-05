-- Datos bancarios de proveedores: también los ve quien tiene Órdenes de compra (2026-10-21, decisión de Felipe después del informe
-- `docs/pantallas/compras-ordenes-nueva.md`, tarea #5). Una sola parte, sin políticas.
--
-- POR QUÉ. La compradora (módulo Órdenes de compra, sin Proveedores ni Por pagar) registra el comprobante de su orden y paga al
-- contado, a veces desde su fondo (ADR-0362, decisión 42). Con la regla del 2026-10-13 no veía la cuenta, el CCI ni el Yape del
-- proveedor: pagaba a ciegas, y la pantalla le decía «este proveedor no tiene cuenta» aunque la tuviera (la base le devolvía cero
-- filas y la web lo leía como «no hay»). Para una transferencia que no se revierte, un «no se ve» dicho como «no hay» es un riesgo.
--
-- LO QUE DECIDIÓ FELIPE (2026-10-21): sumar Órdenes de compra a quienes ven los datos para pagar. El aviso al líder por un cambio de
-- cuenta (20261013161000) sigue igual, y quien la cambia sigue quedando anotado. UNA CONSECUENCIA que hay que saber: el historial de
-- cambios de cuenta (`fn_proveedor_cambios_bancarios`) se protege con la MISMA regla, así que quien tiene Órdenes de compra también
-- puede leerlo llamando a la función; ninguna pantalla se lo muestra (vive en la ficha del proveedor, que pide Proveedores).
--
-- DECIDÍ: una línea más en la regla única `fn_puede_ver_datos_bancarios()`. Todo lo que la usa (`fn_proveedores`,
-- `fn_proveedor_datos_bancarios`, `fn_proveedor_cambios_bancarios`) se entera solo.
-- DESCARTÉ: una función aparte «para la compradora» (dos reglas de lo mismo se descuadran) y mostrar solo el titular y el banco (la
-- compradora igual necesita el CCI para pagar; quedaría pagando con un permiso a medias).
-- SE ROMPE SI: alguien le da Órdenes de compra a un rol que no debería ver cuentas de terceros: el rol «ve y hace todo lo que hay en
-- el módulo» (ADR-0161), así que ahora también ve cómo se le paga a cada proveedor. Por eso se dice en el «incluye» del módulo, que
-- es lo que lee el líder en Roles y accesos antes de asignarlo.
--
-- PRODUCCIÓN. Una sola parte; solo reemplaza una función y actualiza el texto de una fila de `modulos`: no toma candados sobre
-- `auth` ni `storage` (no hay políticas) ni sobre tablas en uso. Re-pegable. Se puede pegar antes o después de la web nueva: la web
-- vieja simplemente seguirá diciendo «sin cuenta» a quien no la ve, como hoy.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_puede_ver_datos_bancarios()
returns boolean
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
  -- Quien puede EDITAR un proveedor también ve su cuenta (`fn_puede_gestionar_proveedores`, la llave de la ficha): si no, al
  -- guardar cualquier cambio la edición mandaría banco y cuenta en blanco y `actualizar_proveedor` borraría los datos reales.
  -- Órdenes de compra (2026-10-21): la compradora paga al contado desde su orden y necesita la cuenta para hacerlo.
  select retail.fn_puede_gestionar_proveedores()
      or retail.fn_ve_modulo('proveedores') or retail.fn_ve_modulo('por_pagar') or retail.fn_ve_modulo('cuentas_dinero')
      or retail.fn_ve_modulo('ordenes_compra');
$$;
revoke all on function retail.fn_puede_ver_datos_bancarios() from public, anon;
grant execute on function retail.fn_puede_ver_datos_bancarios() to authenticated;
comment on function retail.fn_puede_ver_datos_bancarios() is
  'Quién ve el CCI, la cuenta, el Yape y el titular de los proveedores: quien ve Proveedores, Por pagar, Cuentas y dinero u Órdenes de compra (Felipe 2026-10-13 y 2026-10-21).';

update retail.modulos
   set incluye = 'Crear, ver, editar y anular las órdenes de compra a proveedores de todas las sedes, con sus precios, descargar su PDF y ver cómo se le paga a cada proveedor (cuenta, CCI, Yape, Plin y titular)'
 where clave = 'ordenes_compra';
