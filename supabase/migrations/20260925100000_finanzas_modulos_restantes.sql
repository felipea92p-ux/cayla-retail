-- ============================================================================
-- 20260925100000 — Los módulos de Finanzas que faltan (ADR-0195, decisión B; docs/PLAN-FINANZAS.md §6)
--
-- EL PROBLEMA: F3–F10 construyen Cuentas y dinero, Reportes, Impuestos y Cierre de mes en paralelo. Si cada fase diera de
-- alta su módulo en su propia migración, las cuatro se pisarían el `orden` y el catálogo de Roles y accesos. Se dan de
-- alta juntos, una vez, antes de construir.
--
-- LAS REGLAS (CLAUDE.md «Módulos y roles», ADR-0161): cada módulo nace SIN rol (ningún `insert into rol_modulos`): solo el
-- líder lo ve hasta que él decida a quién dárselo.
--   · cuentas_dinero y reportes_financieros: delegables. Con el módulo, una cuenta ve lo de SU tienda; el líder, todo.
--   · impuestos: de CAYLA entera. «Solo líder por ahora» (delegable = false).
--   · cierre_mes: siempre del líder (delegable = false).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una sola ejecución, sin candados sobre tablas en uso (solo inserta en `modulos`).
-- ============================================================================
set lock_timeout = '3s';

insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('cuentas_dinero', 'Finanzas', 'Cuentas y dinero',
   'Ver las cuentas y el efectivo de su tienda; registrar depósitos del cajón al banco, abonos de tarjeta y movimientos entre cuentas; ver lo que se debe y cuándo vence',
   260, false, true),
  ('reportes_financieros', 'Finanzas', 'Reportes financieros',
   'Ver el resumen, el estado de resultados, el flujo de caja y el balance de su tienda; cómo rindieron las campañas',
   270, false, true),
  ('impuestos', 'Finanzas', 'Impuestos',
   'Ver el IGV del mes (ventas contra compras), la alerta del límite de ventas del régimen y bajar el reporte para el contador',
   280, false, false),
  ('cierre_mes', 'Finanzas', 'Cierre de mes',
   'Cerrar el mes de cada tienda y de la empresa, y reabrirlo con motivo',
   290, false, false)
on conflict (clave) do nothing;

reset lock_timeout;
