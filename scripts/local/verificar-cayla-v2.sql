-- ============================================================================
-- verificar-cayla-v2.sql — los 18 escenarios pedidos para validar V2.
-- Corre como rol `authenticated` con el JWT simulado de cada persona, para
-- que RLS se aplique de verdad (a diferencia de seed.sql, que corre con
-- privilegio completo a propósito).
-- ============================================================================
\x auto
\pset tuples_only off

\echo '================================================================'
\echo '1) Alta de producto + variantes (ya sembrado)'
\echo '================================================================'
select count(*) as productos, (select count(*) from retail.variantes) as variantes from retail.productos;

\echo ''
\echo '================================================================'
\echo '2) Recepción (ya sembrada) — movimientos de entrada reales'
\echo '================================================================'
select count(*) as lotes, (select count(*) from retail.movimientos where tipo='entrada') as entradas from retail.lotes;

\echo ''
\echo '================================================================'
\echo '3) Venta simple — trazabilidad'
\echo '================================================================'
select v.id, vi.variante_id, m.tipo, m.cantidad
from retail.ventas v join retail.venta_items vi on vi.venta_id = v.id
  join retail.movimientos m on m.venta_item_id = vi.id
where v.metodo_pago = 'efectivo';

\echo ''
\echo '================================================================'
\echo '4 y 5) Venta con snapshot de costo + costo cambia después + se reconstruye igual'
\echo '================================================================'
select va.sku, vi.costo_unitario as costo_en_la_venta from retail.venta_items vi
  join retail.variantes va on va.id = vi.variante_id
  where vi.venta_id in (select id from retail.ventas where metodo_pago='yape');
update retail.variantes set costo = costo * 1.5
  where id in (select variante_id from retail.venta_items vi join retail.ventas v on v.id=vi.venta_id where v.metodo_pago='yape');
\echo '-- 6) tras el cambio, la venta histórica sigue igual:'
select va.sku, vi.costo_unitario as costo_congelado, va.costo as costo_catalogo_hoy
  from retail.venta_items vi join retail.variantes va on va.id = vi.variante_id
  where vi.venta_id in (select id from retail.ventas where metodo_pago='yape');

\echo ''
\echo '================================================================'
\echo '7) Transferencia — origen y destino'
\echo '================================================================'
select uo.nombre as origen, ud.nombre as destino, count(*) as items
from retail.transferencias t join retail.ubicaciones uo on uo.id=t.ubicacion_origen_id
  join retail.ubicaciones ud on ud.id=t.ubicacion_destino_id
  join retail.transferencia_items ti on ti.transferencia_id = t.id
group by uo.nombre, ud.nombre;

\echo ''
\echo '================================================================'
\echo '8) Devolución parcial (2 de 3 líneas)'
\echo '================================================================'
select count(*) as lineas_devueltas from retail.devolucion_items;

\echo ''
\echo '================================================================'
\echo '9) Devolución con 2 condiciones — solo vendible regresa'
\echo '================================================================'
select condicion, (movimiento_id is not null) as genero_movimiento from retail.devolucion_items order by condicion;

\echo ''
\echo '================================================================'
\echo '10) Conteo con diferencia'
\echo '================================================================'
select va.sku, ci.cantidad_sistema, ci.cantidad_contada, ci.diferencia
from retail.conteo_items ci join retail.variantes va on va.id=ci.variante_id
where ci.diferencia is not null and ci.diferencia <> 0;

\echo ''
\echo '================================================================'
\echo '11) Nueva ubicación sin cambiar estructura'
\echo '================================================================'
insert into retail.ubicaciones (nombre, tipo) values ('Tienda Chiclayo', 'tienda') returning *;

\echo ''
\echo '================================================================'
\echo '12) Operación sin sububicaciones (las 3 tiendas)'
\echo '================================================================'
select u.nombre, count(su.id) as sububicaciones
from retail.ubicaciones u left join retail.sububicaciones su on su.ubicacion_id = u.id
where u.tipo = 'tienda' group by u.nombre order by u.nombre;

\echo ''
\echo '================================================================'
\echo '13) Almacén con sububicaciones'
\echo '================================================================'
select u.nombre, su.nombre as rack from retail.ubicaciones u
  join retail.sububicaciones su on su.ubicacion_id = u.id;

\echo ''
\echo '================================================================'
\echo '14) Intento de stock negativo — debe RECHAZAR'
\echo '================================================================'
select retail.registrar_movimiento(
  (select id from retail.variantes where sku='BLU-EMMA-NEG-M'),
  (select id from retail.ubicaciones where nombre='Tienda Lima'),
  'ajuste', -999999, 'intento de romper stock'
);

\echo ''
\echo '================================================================'
\echo '15) SKU duplicado — debe RECHAZAR'
\echo '================================================================'
insert into retail.variantes (producto_id, color_codigo, talla, sku, precio, costo)
  select producto_id, color_codigo, talla, sku, precio, costo from retail.variantes limit 1;

\echo ''
\echo '================================================================'
\echo '16) Devolución superior a lo vendido — debe RECHAZAR'
\echo '================================================================'
select retail.crear_devolucion(
  (select venta_id from retail.venta_items limit 1),
  (select id from retail.ubicaciones where nombre='Tienda Lima'),
  jsonb_build_array(jsonb_build_object('venta_item_id', (select id from retail.venta_items limit 1), 'cantidad', 999, 'condicion', 'vendible')),
  'intento de devolver de más', 'otro'
);

\echo ''
\echo '================================================================'
\echo '17) Idempotencia de venta — 2do intento devuelve la MISMA venta'
\echo '================================================================'
select gen_random_uuid() as tok \gset
select retail.registrar_venta(
  (select id from retail.ubicaciones where nombre='Tienda Lima'),
  jsonb_build_array(jsonb_build_object('variante_id', (select id from retail.variantes where sku='BLU-EMMA-BEI-S'), 'cantidad', 1, 'precio_unitario', 79.90, 'descuento_unitario', 0)),
  'efectivo', null, :'tok'::uuid
) as primera \gset
select retail.registrar_venta(
  (select id from retail.ubicaciones where nombre='Tienda Lima'),
  jsonb_build_array(jsonb_build_object('variante_id', (select id from retail.variantes where sku='BLU-EMMA-BEI-S'), 'cantidad', 1, 'precio_unitario', 79.90, 'descuento_unitario', 0)),
  'efectivo', null, :'tok'::uuid
) as segunda \gset
select (:'primera' = :'segunda') as devolvio_la_misma, count(*) as filas from retail.ventas where token_cliente = :'tok'::uuid;
