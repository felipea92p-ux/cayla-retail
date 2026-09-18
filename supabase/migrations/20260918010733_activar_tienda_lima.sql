-- ADR-0097 — Activar Tienda Lima
--
-- Tienda Lima existe hace semanas en el seed local (usada en decenas de
-- pruebas registradas en BITACORA.md) pero nunca se creó en producción: hoy
-- `retail.ubicaciones` solo tiene Taller, Tienda AQP y Tienda TRU. Este
-- script la da de alta de verdad, con el mismo patrón de sububicaciones que
-- ya tienen las otras dos tiendas.
--
-- `sede_dynamic_id` enlaza con la fila de Dynamic código '003' (nombre real
-- "Tienda LIM" — el código 'LIM' en Dynamic es el Taller, no la tienda; ver
-- BACKLOG.md, entrada 2026-09-10). Se usa el mismo nombre "Tienda LIM" en
-- `retail.ubicaciones` para no inventar una segunda etiqueta para el mismo
-- lugar.

insert into retail.ubicaciones (nombre, tipo, activo, sede_dynamic_id)
select 'Tienda LIM', 'tienda', true, id
from public.sedes
where codigo = '003'
on conflict do nothing;

insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
select u.id, sub.nombre, sub.tipo
from retail.ubicaciones u
cross join (values
  ('Piso de venta', 'piso_venta'),
  ('Almacén de tienda', 'almacen_tienda'),
  ('Cuarentena', 'cuarentena')
) as sub(nombre, tipo)
where u.nombre = 'Tienda LIM'
on conflict do nothing;
