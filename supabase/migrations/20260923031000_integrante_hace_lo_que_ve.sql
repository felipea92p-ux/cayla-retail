-- ============================================================================
-- 20260923031000_integrante_hace_lo_que_ve.sql — CAYLA V2 · ADR-0161, decisión B2d
--
-- EL PROBLEMA PRIMERO. Con roles por módulo (20260923030000) la regla es «quien ve un módulo hace todo lo que hay en
-- él». Pero hoy un integrante VE Caja, Existencias y Productos y NO podía cerrar caja, ajustar stock ni editar el
-- catálogo (ADR-0143). Para no cambiar nada sin decidirlo, Integrante nació con `limitado_como_hoy = true`.
--
-- LA DECISIÓN (Felipe, 2026-09-22, opción a): el integrante hace todo lo de los módulos que ve. Más adelante se
-- crearán pantallas más finas para asignarle; mientras tanto, si un rol no debe cerrar caja o ajustar stock, se le
-- APAGA el módulo en Colaboradores ▸ Roles y accesos.
--
-- QUIÉN GANA QUÉ. Una cuenta con rol Integrante que ve Caja → cierra caja y mueve caja; que ve Existencias, Conteos o
-- Traslados → ajusta stock, cierra conteos y traslados con diferencia; que ve Productos o Atributos → edita el Catálogo.
-- Lo «siempre solo del líder» (anular ventas y comprobantes, series, aprobar devoluciones, montos de Compras,
-- etiquetas con descuento, Colaboradores y Roles) NO cambia: esas funciones siguen mirando fn_es_lider().
--
-- La columna `limitado_como_hoy` se conserva (vale para un rol a medida que se quiera así). Re-ejecutable.
-- ============================================================================

update retail.roles set limitado_como_hoy = false where clave = 'integrante' and limitado_como_hoy;
