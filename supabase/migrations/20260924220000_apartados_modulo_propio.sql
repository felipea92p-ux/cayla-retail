-- ============================================================================
-- 20260924220000_apartados_modulo_propio.sql — CAYLA V2
--
-- ADR-0196: Apartados deja de colgar del módulo «Punto de venta» y pasa a ser un módulo propio (Felipe, 2026-09-24:
-- «son diferentes módulos»).
--
-- EL PROBLEMA PRIMERO. En Roles y accesos, encender «Punto de venta» abría DOS pantallas: el mostrador y Apartados
-- (ADR-0166 los había juntado por ser «la misma caja»). El líder no podía dar a alguien el mostrador sin darle también
-- el manejo de adelantos, saldos, prórrogas y devoluciones de adelanto, que es otro trabajo.
--
-- QUÉ HACE. Solo da de alta el módulo en el catálogo (regla ADR-0161 «Módulos y roles»):
--   · orden 15: entre Punto de venta (10) y Caja (20), igual que en el menú.
--   · delegable = true: las funciones de apartados (`separar_prendas`, `entregar_separacion`, `extender_separacion`,
--     `liberar_separacion`, `registrar_devolucion_separacion`) no exigen `fn_es_lider()`; piden que la cuenta opere la
--     tienda (`fn_puede_operar_ubicacion`), igual que `registrar_venta`. Encenderlo en un rol no abre nada que falle.
--   · no asigna el módulo a ningún rol: nace sin rol, solo lo ve el líder.
--
-- CONSECUENCIA DE NEGOCIO (aceptada por Felipe): quien hoy ve «Punto de venta» deja de ver Apartados en el menú hasta
-- que el líder encienda «Apartados» en su rol. Los apartados abiertos no se tocan: siguen en la base y el líder los ve.
--
-- Producción: pegar en el SQL Editor de cayla-dynamic (ya trae `retail.`). Re-ejecutable.
-- ============================================================================

insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('apartados', 'Ventas', 'Apartados', 'Apartar prendas con adelanto, entregar cobrando el saldo, extender, liberar y devolver el adelanto', 15, false, true)
on conflict (clave) do update set
  grupo = excluded.grupo, nombre = excluded.nombre, incluye = excluded.incluye, orden = excluded.orden,
  solo_lider = excluded.solo_lider, delegable = excluded.delegable;
