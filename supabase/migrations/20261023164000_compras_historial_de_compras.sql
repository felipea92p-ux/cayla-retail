-- ============================================================================
-- 20261023164000_compras_historial_de_compras.sql — CAYLA V2 · ADR-0480 (Compras simple), actualización 2026-10-23
-- «Facturas de compra» pasa a llamarse «Historial de compras» en Roles y accesos.
--
-- EL PROBLEMA PRIMERO. Con Compras simple la compra nace en «Mi plata para compras» y su comprobante se completa en
-- «Revisar compras». La pantalla `/compras` seguía llamándose «Facturas de proveedor» y tenía su propio «+ Registrar
-- factura»: dos puertas para el mismo papel, y un nombre que mentía, porque lo comprado puede venir con factura, boleta,
-- nota de venta o sin comprobante. Felipe (2026-10-23): esa pantalla solo muestra el historial; registrar se retira de
-- todo el ERP.
--
-- QUÉ HACE. Solo el texto que ve el líder en Roles y accesos: `nombre` e `incluye` del módulo `facturas_compra`. La clave
-- NO cambia: `fn_puede_ver_dinero_de_compras()`, `fn_puede_registrar_compras()`, el candado de dinero (ADR-0126) y las
-- asignaciones de rol la usan, y quien hoy ve la pantalla la sigue viendo igual.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: tal cual en el SQL Editor, cuando quieras (antes o después de publicar la web: solo cambia
-- un texto). Sin políticas ni `alter`: ADR-0195 no aplica. Re-pegable.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

update retail.modulos
   set nombre = 'Historial de compras',
       incluye = 'Ver todas las compras con su papel (factura, boleta, nota de venta o sin comprobante), lo que falta pagar y lo que falta llegar; adjuntar documentos, anular una compra sin pagos ni recepciones y descargar el mes para el contador'
 where clave = 'facturas_compra';
