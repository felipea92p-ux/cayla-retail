-- Meta de ventas del día por sede (rediseño visual de Caja, 2026-09-18).
-- Nullable a propósito: sin pantalla de edición todavía (queda en BACKLOG), se
-- setea por SQL Editor hasta que exista una. La UI oculta la barra de meta
-- cuando es null en vez de mostrar un cero engañoso.
alter table retail.ubicaciones
  add column meta_venta_diaria numeric(12, 2);

comment on column retail.ubicaciones.meta_venta_diaria is
  'Meta de ventas del día para esta sede, en soles. Null = sin meta configurada.';
