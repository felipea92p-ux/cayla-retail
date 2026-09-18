-- ============================================================================
-- META DE VENTA DIARIA POR UBICACIÓN (rediseño visual de Caja, 2026-09-18)
--
-- La barra de "meta del día" del nuevo tablero de Caja necesita un número
-- real contra el cual comparar lo vendido — hoy NINGUNA tabla tiene
-- "meta"/"objetivo" (revisado contra las 60 tablas de `retail`). Se agrega
-- la columna más angosta posible: nullable, sin default inventado. Si una
-- ubicación no tiene meta configurada, la barra simplemente no se muestra
-- (principio 2: cero estados inconsistentes — mejor no mostrar nada que
-- mostrar una meta que nadie fijó). Configurarla hoy es un UPDATE directo;
-- si en el futuro hace falta que un Líder la edite desde la app, se agrega
-- una RPC entonces (principio 5: no sobre-construir para el uso que no llegó).
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.ubicaciones add column meta_venta_diaria numeric;

alter table retail.ubicaciones
  add constraint ubicaciones_meta_venta_diaria_positiva check (meta_venta_diaria is null or meta_venta_diaria > 0);

comment on column retail.ubicaciones.meta_venta_diaria is
  'Meta de venta del día para esta ubicación, en soles. Null = sin meta configurada (el tablero de Caja no muestra la barra de meta). Se configura hoy por UPDATE directo; sin RPC propia todavía.';
