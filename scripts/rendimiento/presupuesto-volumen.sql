-- scripts/rendimiento/presupuesto-volumen.sql — el volumen fijo del presupuesto de rendimiento (ADR-0656, cambiar-de-modulo#14).
--
-- QUÉ ES. Una tienda chica con forma de verdad, para medir cuántos bloques lee cada función de entrada de módulo: 3 tiendas (las 2 de
-- la semilla y una más), 2.000 productos × 6 tallas-color = 12.000 variantes con código de barras, su stock en el piso de cada tienda
-- (y en el almacén de una de cada cuatro), su entrada en `movimientos`, ~3.000 ventas con líneas, pagos, boleta y salida de stock, una
-- caja cerrada por tienda y día, y 1.500 clientes. No es un año de datos (eso es `scripts/carga/`, ADR-0194): es lo justo para que
-- una consulta que se vuelve correlativa o que pierde su índice lea MUCHO más que antes, sin gastar minutos de CI (ADR-0648).
--
-- FIJO. Mismo volumen en cada corrida: los ids salen de `md5` (no de `gen_random_uuid()`), los montos y colores de la posición, y no
-- hay `random()`. Las fechas son relativas a hoy en Lima: las ventas van desde el primer día de hace dos meses hasta el ÚLTIMO día del
-- mes en curso (incluidos los días que aún no llegan). Así «este mes» siempre está lleno y «los últimos 30 días» siempre tienen 30
-- días de ventas: lo que una función lee no cambia con el día del mes, que es lo que hace estable al presupuesto.
--
-- CÓMO. Lo carga `presupuesto.mjs` dentro de UNA transacción que termina en ROLLBACK: la base no se toca. Inserta directo con los
-- disparadores apagados (`session_replication_role = replica`, como `scripts/carga/01_volumen.sql`) porque es historia ya ocurrida, y
-- después analiza las tablas con una muestra que las cubre enteras: con la muestra al azar de siempre, el plan podría cambiar de una
-- corrida a otra.

set local session_replication_role = replica;
set local search_path = retail, public, extensions;

-- ---------- 1. Una tienda más (las otras dos son de la semilla) ----------
insert into public.sedes (id, codigo, nombre, tipo, ciudad)
values (md5('presupuesto-sede')::uuid, 'PRS', 'Tienda Presupuesto', 'tienda', 'Arequipa')
on conflict do nothing;

insert into ubicaciones (id, nombre, tipo, sede_dynamic_id)
values (md5('presupuesto-tienda')::uuid, 'Tienda Presupuesto', 'tienda', md5('presupuesto-sede')::uuid)
on conflict do nothing;

insert into sububicaciones (id, ubicacion_id, nombre, tipo)
select md5('presupuesto-sub-' || x.tipo)::uuid, md5('presupuesto-tienda')::uuid, x.nombre, x.tipo
from (values ('Piso de venta', 'piso_venta'), ('Almacén de tienda', 'almacen_tienda'), ('Cuarentena', 'cuarentena')) x(nombre, tipo)
on conflict do nothing;

create temp table p_tiendas on commit drop as
select u.id, row_number() over (order by u.nombre) as n,
       (select s.id from sububicaciones s where s.ubicacion_id = u.id and s.tipo = 'piso_venta' order by s.id limit 1) as piso,
       (select s.id from sububicaciones s where s.ubicacion_id = u.id and s.tipo = 'almacen_tienda' order by s.id limit 1) as almacen
from ubicaciones u
where u.tipo = 'tienda' and u.nombre in ('Tienda Lima', 'Tienda Trujillo', 'Tienda Presupuesto');

do $$ begin
  if (select count(*) from p_tiendas where piso is not null and almacen is not null) <> 3 then
    raise exception 'El volumen del presupuesto espera las tiendas Lima y Trujillo de la semilla, con su piso y su almacén';
  end if;
end $$;

-- ---------- 2. Catálogo: 2.000 productos × 3 tallas × 2 colores ----------
create temp table p_ref on commit drop as
select (select array_agg(id order by nombre) from categorias) as cats,
       (select array_agg(id order by nombre) from marcas) as marcas,
       (select array_agg(id order by nombre) from proveedores) as provs,
       (select array_agg(id order by valor) from tallas) as tallas,
       (select array_agg(codigo order by codigo) from colores) as colores;

insert into productos (id, categoria_id, referencia, descripcion, estado, codigo, marca_id, proveedor_id, estado_alta, created_at)
select md5('presupuesto-producto-' || i)::uuid,
       r.cats[1 + i % cardinality(r.cats)],
       'PRESUPUESTO ' || lpad(i::text, 5, '0'),
       'Prenda del presupuesto ' || i,
       'activo',
       'PZ' || lpad(i::text, 5, '0'),
       r.marcas[1 + i % greatest(cardinality(r.marcas), 1)],
       r.provs[1 + i % greatest(cardinality(r.provs), 1)],
       'aprobado',
       now() - make_interval(days => 400 - i % 365)
from generate_series(1, 2000) i, p_ref r;

insert into variantes (id, producto_id, color_codigo, talla_id, sku, codigo, precio, costo, activo, created_at)
select md5('presupuesto-variante-' || i || '-' || t || '-' || c)::uuid,
       md5('presupuesto-producto-' || i)::uuid,
       r.colores[1 + (c + i) % cardinality(r.colores)],
       r.tallas[1 + (t + i) % cardinality(r.tallas)],
       'PZ' || lpad(i::text, 5, '0') || '-' || t || c,
       'PZ' || lpad(i::text, 5, '0') || t || c,
       (59 + (i * 7 + t * 10) % 140)::numeric(10, 2) + 0.90,
       (25 + (i * 3 + t * 4) % 50)::numeric(10, 2),
       true,
       now() - make_interval(days => 400 - i % 365)
from generate_series(1, 2000) i
cross join generate_series(1, 3) t
cross join generate_series(1, 2) c
cross join p_ref r;

create temp table p_var on commit drop as
select v.id, v.precio, v.costo, row_number() over (order by v.codigo) - 1 as i
from variantes v where v.codigo like 'PZ%';

insert into codigos_barras (variante_id, codigo, origen)
select id, '79' || lpad(i::text, 11, '0'), 'propio' from p_var;

-- ---------- 3. Stock con su entrada: todo en el piso, y una de cada cuatro también en el almacén ----------
insert into stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada, updated_at)
select v.id, t.id, t.piso, 3 + v.i % 5, 0, now() from p_var v cross join p_tiendas t
union all
select v.id, t.id, t.almacen, 2 + v.i % 3, 0, now() from p_var v cross join p_tiendas t where v.i % 4 = 0
on conflict do nothing;

insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at)
select s.variante_id, s.ubicacion_id, s.sububicacion_id, 'entrada', s.cantidad, 'Volumen del presupuesto',
       now() - make_interval(days => (30 + v.i % 120)::int)
from stock s join p_var v on v.id = s.variante_id join p_tiendas t on t.id = s.ubicacion_id;

-- ---------- 4. Clientes ----------
insert into clientas (id, documento_tipo, documento_numero, nombre, telefono_whatsapp, cumple_dia, cumple_mes, created_at)
select md5('presupuesto-cliente-' || i)::uuid, 'dni', (59000000 + i)::text, 'Cliente Presupuesto ' || i, '97' || lpad(i::text, 7, '0'),
       1 + i % 28, 1 + i % 12, now() - make_interval(days => i % 365)
from generate_series(1, 1500) i;

-- ---------- 5. Ventas: 11 por tienda y día, del primer día de hace dos meses al último del mes en curso ----------
create temp table p_dias on commit drop as
select d::date as dia, row_number() over (order by d) as n
from generate_series(date_trunc('month', retail.fn_hoy_lima()) - interval '2 months',
                     date_trunc('month', retail.fn_hoy_lima()) + interval '1 month' - interval '1 day',
                     interval '1 day') d;

create temp table p_per on commit drop as
select c.persona_id as id, row_number() over (order by c.persona_id) - 1 as i
from colaboradores c where c.estado = 'activo';

insert into cajas (id, ubicacion_id, estado, monto_apertura, abierta_en, cerrada_en, monto_cierre_sistema, monto_cierre_real, diferencia)
select md5('presupuesto-caja-' || t.n || '-' || d.n)::uuid, t.id, 'cerrada', 200,
       (d.dia + time '09:00') at time zone 'America/Lima', (d.dia + time '19:30') at time zone 'America/Lima', 0, 0, 0
from p_tiendas t cross join p_dias d;

create temp table p_ventas on commit drop as
select md5('presupuesto-venta-' || t.n || '-' || d.n || '-' || v)::uuid as id,
       md5('presupuesto-caja-' || t.n || '-' || d.n)::uuid as caja_id,
       t.id as ubicacion_id, t.n as tienda, d.n as dia, v as nro,
       (d.dia + time '10:00' + make_interval(mins => (v * 47) % 540)) at time zone 'America/Lima' as creada,
       1 + (v + d.n) % 3 as lineas
from p_tiendas t cross join p_dias d cross join generate_series(1, 11) v;

insert into ventas (id, ubicacion_id, cliente_id, usuario_id, caja_id, created_at, estado, emisor, descuento_pct, asesora_id)
select v.id, v.ubicacion_id,
       case when v.nro % 10 < 3 then md5('presupuesto-cliente-' || (1 + (v.nro * 331 + v.dia * 17) % 1500))::uuid end,
       p.id, v.caja_id, v.creada, 'completada', 'retail', 0, p.id
from p_ventas v join p_per p on p.i = (v.nro + v.dia) % (select count(*) from p_per);

create temp table p_items on commit drop as
select md5('presupuesto-item-' || v.id || '-' || l)::uuid as id, v.id as venta_id, v.ubicacion_id, v.creada,
       x.id as variante_id, x.precio, x.costo
from p_ventas v cross join lateral generate_series(1, v.lineas) l
join p_var x on x.i = (v.nro * 7919 + v.dia * 104729 + l * 15485863 + v.tienda * 32452843) % 12000;

insert into venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
select id, venta_id, variante_id, 1, precio, 0, costo from p_items;

insert into venta_pagos (venta_id, metodo, monto)
select venta_id, (array['efectivo', 'tarjeta', 'yape', 'plin'])[1 + abs(hashtext(venta_id::text)) % 4], sum(precio)
from p_items group by venta_id;

insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, created_at)
select i.variante_id, i.ubicacion_id, t.piso, 'salida', 1, 'venta', i.id, i.creada
from p_items i join p_tiendas t on t.id = i.ubicacion_id;

insert into comprobantes (venta_id, ubicacion_id, tipo, serie, numero, cliente_tipo_doc, subtotal, igv, total, estado,
                          entorno_transmision, created_at, items)
select v.id, v.ubicacion_id, 'boleta', 'BP' || lpad(v.tienda::text, 2, '0'),
       row_number() over (partition by v.tienda order by v.creada, v.id),
       'sin_documento', round(s.total / 1.18, 2), s.total - round(s.total / 1.18, 2), s.total,
       'aceptado', 'produccion', v.creada, '[]'::jsonb
from p_ventas v join (select venta_id, sum(precio) as total from p_items group by venta_id) s on s.venta_id = v.id;

set local session_replication_role = origin;

-- La muestra cubre cada tabla entera (300 × 300 = 90.000 filas): estadísticas iguales en cada corrida, planes iguales.
set local default_statistics_target = 300;
analyze retail.productos, retail.variantes, retail.codigos_barras, retail.stock, retail.movimientos, retail.clientas, retail.cajas,
        retail.ventas, retail.venta_items, retail.venta_pagos, retail.comprobantes, retail.ubicaciones, retail.sububicaciones;
reset default_statistics_target;
