-- Ventas ▸ Reportes: el módulo (Felipe, 2026-11-03; maqueta docs/maquetas/reportes-ventas-2026-11/).
--
-- Dos reportes de lectura dentro de Ventas, junto al Historial: «Ventas del mes» (cifras, ventas por día, mes a mes, cómo pagaron y una
-- tabla por tienda y categoría) y «Ranking de prendas» (lo que más se vende, con fechas, tienda, categoría, marca, talla y color).
-- Esta migración solo da de alta el módulo (CLAUDE.md «Módulos y roles», ADR-0161 y ADR-0306: un módulo es una entrada del menú).
-- Las funciones de lectura de cada reporte llegan en sus propias migraciones, cada una con la actividad que la usa.
--
-- NACE SIN ROL: ningún rol recibe el módulo desde una migración. Solo lo ve el líder hasta que él mismo lo encienda para un rol en
-- Colaboradores ▸ Roles y accesos. Delegable: quien lo reciba verá solo su tienda (lo decide la función de cada reporte, como
-- `fn_deuda_visible` en Compras por tienda, ADR-0184); el líder y el Admin, todas.
--
-- Orden 55: entre Historial (50) y Facturación (60), como en el menú.
-- Pegado en producción: es un solo `insert` a una tabla chica, sin políticas ni `alter`, así que no choca con el Asesor de seguridad
-- (CLAUDE.md «Políticas y deadlocks»). Es idempotente: `on conflict do nothing`.
set lock_timeout = '3s';

insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('reportes_ventas', 'Ventas', 'Reportes de ventas',
   'Ver cuánto se vendió cada mes, por tienda y por categoría, y qué prendas se venden más con sus filtros; descargar los reportes',
   55, false, true)
on conflict (clave) do nothing;
