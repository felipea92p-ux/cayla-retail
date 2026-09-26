-- scripts/carga/01_volumen.sql — volumen sintético para la prueba de carga (ADR-0194)
--
-- QUÉ ES. Un año de operación inventado en 6 tiendas, para medir el ERP con la base "llena" y no con la de hoy
-- (producción tiene 3 productos y 0 ventas: medir ahí no dice nada de cómo se portará en 12 meses).
--   · 6 tiendas (las 2 del local + 4 nuevas), cada una con su sede de Dynamic y sus 3 sububicaciones.
--   · 3.000 productos × 8 variantes = 24.000 variantes, con código de barras.
--   · stock: 24.000 variantes × 6 tiendas en piso de venta, 1.000 unidades cada una (la prueba no se queda sin stock).
--   · 60 colaboradoras (10 por tienda) con cuenta, rol «integrante», y asistencia diaria de un año (marcajes y
--     jornadas, como Dynamic), con la entrada de hoy marcada: pueden firmar como responsables.
--   · 365 cajas cerradas por tienda y una abierta hoy.
--   · ~130.000 ventas (60 por tienda y día) con sus líneas, pagos, boletas aceptadas y movimientos de salida.
--   · 20.000 clientas; 30 % de las ventas con clienta.
--
-- DÓNDE CORRE. SOLO en la base aparte `cayla_carga` del Postgres local (la crea `carga.mjs preparar`). Nunca en
-- `postgres` (la compartida por las otras sesiones) ni en producción: se niega a correr si la base se llama distinto.
--
-- CÓMO. Inserta directo con los triggers apagados (`session_replication_role = replica`) porque es historia ya
-- ocurrida: pasar por `registrar_venta` 130.000 veces tardaría horas y no mide nada nuevo. La prueba de carga, en
-- cambio, SÍ pasa por las funciones reales. Los datos son coherentes entre sí (cada venta tiene su caja del día,
-- cada línea su movimiento), así que los índices y planes de consulta se comportan como con datos reales.

\set ON_ERROR_STOP on

do $$ begin
  if current_database() <> 'cayla_carga' then
    raise exception 'Este volumen solo se carga en la base cayla_carga (estás en %)', current_database();
  end if;
end $$;

set session_replication_role = replica;
set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------------------------------------------
-- 0. Dynamic de mentira con la forma de producción: los índices de asistencia que usa fn_persona_presente
-- ---------------------------------------------------------------------------------------------------------------
create index if not exists idx_marcajes_vivas on public.marcajes (persona_id, timestamp_marca) where anulada_at is null;
create index if not exists idx_marcajes_fecha_jornada on public.marcajes (persona_id, fecha_jornada) where fecha_jornada is not null;
create index if not exists idx_marcajes_sede on public.marcajes (sede_id, timestamp_marca);
create unique index if not exists jornadas_persona_id_fecha_key on public.jornadas (persona_id, fecha);
create index if not exists idx_jornadas_sede on public.jornadas (sede_id, fecha);

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Tiendas
-- ---------------------------------------------------------------------------------------------------------------
insert into public.sedes (id, codigo, nombre, activa, tipo, ciudad)
select gen_random_uuid(), 'C' || i, 'Tienda Carga ' || i, true, 'tienda', 'Carga'
from generate_series(1, 4) i
where not exists (select 1 from public.sedes where codigo = 'C' || i);

insert into ubicaciones (nombre, tipo, activo, sede_dynamic_id)
select s.nombre, 'tienda', true, s.id from public.sedes s
where s.codigo like 'C%' and not exists (select 1 from ubicaciones u where u.sede_dynamic_id = s.id);

create temp table t_tiendas as
select u.id, u.sede_dynamic_id as sede_id, row_number() over (order by u.nombre) as n
from ubicaciones u where u.tipo = 'tienda' and u.sede_dynamic_id is not null;

insert into sububicaciones (ubicacion_id, nombre, tipo)
select t.id, x.nombre, x.tipo from t_tiendas t
cross join (values ('Piso de venta', 'piso_venta'), ('Almacén de tienda', 'almacen_tienda'), ('Cuarentena', 'cuarentena')) x(nombre, tipo)
where not exists (select 1 from sububicaciones s where s.ubicacion_id = t.id and s.tipo = x.tipo);

alter table t_tiendas add column piso uuid;
update t_tiendas t set piso = s.id from sububicaciones s where s.ubicacion_id = t.id and s.tipo = 'piso_venta';

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Catálogo: 3.000 productos × 8 variantes
-- ---------------------------------------------------------------------------------------------------------------
create temp table t_ref as
select (select array_agg(id order by id) from categorias) as cats,
       (select array_agg(id order by id) from marcas) as marcas,
       (select array_agg(id order by id) from proveedores) as provs,
       (select array_agg(id order by id) from tallas) as tallas,
       (select array_agg(codigo order by codigo) from colores) as colores;

insert into productos (id, categoria_id, referencia, descripcion, estado, codigo, marca_id, proveedor_id, estado_alta, created_at)
select gen_random_uuid(),
       r.cats[1 + i % cardinality(r.cats)],
       'CARGA ' || lpad(i::text, 5, '0'),
       'Prenda de carga ' || i,
       'activo',
       'CG' || lpad(i::text, 5, '0'),
       r.marcas[1 + i % cardinality(r.marcas)],
       r.provs[1 + i % cardinality(r.provs)],
       'aprobado',
       now() - make_interval(days => 365 - i % 365)
from generate_series(1, 3000) i, t_ref r;

insert into variantes (id, producto_id, color_codigo, talla_id, sku, codigo, precio, costo, activo, created_at)
select gen_random_uuid(), p.id,
       r.colores[1 + (c + ord) % cardinality(r.colores)],
       r.tallas[1 + t % cardinality(r.tallas)],
       p.codigo || '-' || t || c,
       p.codigo || t || c,
       (59 + (ord * 7 + t * 10) % 140)::numeric(10,2) + 0.90,
       (25 + (ord * 3 + t * 4) % 50)::numeric(10,2),
       true, p.created_at
from (select id, codigo, created_at, row_number() over (order by codigo) as ord from productos where codigo like 'CG%') p
cross join generate_series(1, 4) t
cross join generate_series(1, 2) c
cross join t_ref r;

insert into codigos_barras (variante_id, codigo, origen)
select v.id, '77' || lpad(row_number() over (order by v.codigo)::text, 11, '0'), 'propio'
from variantes v join productos p on p.id = v.producto_id where p.codigo like 'CG%';

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Stock en el piso de venta de cada tienda
-- ---------------------------------------------------------------------------------------------------------------
insert into stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada, updated_at)
select v.id, t.id, t.piso, 1000, 0, now()
from variantes v join productos p on p.id = v.producto_id and p.codigo like 'CG%'
cross join t_tiendas t
on conflict do nothing;

insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at)
select s.variante_id, s.ubicacion_id, s.sububicacion_id, 'entrada', 1000, 'Carga inicial (volumen sintético)', now() - interval '366 days'
from stock s join t_tiendas t on t.id = s.ubicacion_id and t.piso = s.sububicacion_id;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Colaboradoras con cuenta y asistencia de un año
-- ---------------------------------------------------------------------------------------------------------------
create temp table t_personas as
select gen_random_uuid() as id, gen_random_uuid() as auth_user_id, t.id as ubicacion_id, t.sede_id, t.n as tienda, k
from t_tiendas t cross join generate_series(1, 10) k;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select auth_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'carga-' || tienda || '-' || k || '@carga.local', now(), now()
from t_personas;

insert into public.personas (id, auth_user_id, nombres, apellidos, sede_base_id, rol, estado)
select id, auth_user_id, 'Carga ' || tienda || '-' || k, 'Sintética', sede_id, 'integrante', 'activo' from t_personas;

insert into colaboradores (persona_id, rol, rol_id, ubicacion_asignada_id, estado)
select p.id, 'colaborador', r.id, p.ubicacion_id, 'activo'
from t_personas p cross join (select id from roles where clave = 'integrante') r;

-- Entrada a las 9:00 y salida a las 19:00 cada día; hoy, entrada a medianoche (Lima) y sin salida: todas presentes.
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada, anulada_at)
select p.id, p.sede_id, x.tipo,
       ((current_date - d) + x.hora) at time zone 'America/Lima',
       current_date - d, null
from t_personas p cross join generate_series(1, 365) d
cross join (values ('entrada', time '09:00'), ('salida', time '19:00')) x(tipo, hora);

insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada, anulada_at)
select p.id, p.sede_id, 'entrada', ((now() at time zone 'America/Lima')::date::timestamp) at time zone 'America/Lima',
       (now() at time zone 'America/Lima')::date, null
from t_personas p;

insert into public.jornadas (persona_id, sede_id, fecha, estado)
select p.id, p.sede_id, current_date - d, case when d = 0 then 'abierta' else 'cerrada' end
from t_personas p cross join generate_series(0, 365) d
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Cajas: una por tienda y día (cerradas) + la de hoy abierta
-- ---------------------------------------------------------------------------------------------------------------
update cajas set estado = 'cerrada', cerrada_en = now(), monto_cierre_real = 0, monto_cierre_sistema = 0
where estado = 'abierta' and ubicacion_id in (select id from t_tiendas);

create temp table t_cajas as
select gen_random_uuid() as id, t.id as ubicacion_id, t.n as tienda, d
from t_tiendas t cross join generate_series(1, 365) d;

insert into cajas (id, ubicacion_id, estado, monto_apertura, abierta_en, cerrada_en, monto_cierre_sistema, monto_cierre_real, diferencia)
select id, ubicacion_id, 'cerrada', 200,
       ((current_date - d) + time '09:00') at time zone 'America/Lima',
       ((current_date - d) + time '19:30') at time zone 'America/Lima', 0, 0, 0
from t_cajas;

insert into cajas (ubicacion_id, estado, monto_apertura, abierta_en)
select id, 'abierta', 200, now() - interval '1 hour' from t_tiendas;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Clientas
-- ---------------------------------------------------------------------------------------------------------------
insert into clientas (dni, nombre, telefono_whatsapp, cumple_dia, cumple_mes, created_at)
select lpad((40000000 + i)::text, 8, '0'), 'Clienta Carga ' || i, '9' || lpad(i::text, 8, '0'),
       1 + i % 28, 1 + i % 12, now() - make_interval(days => i % 365)
from generate_series(1, 20000) i;

-- ---------------------------------------------------------------------------------------------------------------
-- 7. Un año de ventas: 60 por tienda y día
-- ---------------------------------------------------------------------------------------------------------------
create temp table t_var as
select v.id, v.precio, v.costo, row_number() over (order by v.codigo) - 1 as i
from variantes v join productos p on p.id = v.producto_id and p.codigo like 'CG%';
create temp table t_cli as select id, row_number() over (order by dni) - 1 as i from clientas where nombre like 'Clienta Carga%';
create temp table t_per as select id, ubicacion_id, row_number() over (partition by ubicacion_id order by id) - 1 as i from t_personas;

create temp table t_ventas as
select gen_random_uuid() as id, c.id as caja_id, c.ubicacion_id, c.tienda, c.d, v as nro,
       ((current_date - c.d) + time '10:00' + make_interval(mins => (v * 9) % 540)) at time zone 'America/Lima' as creada,
       1 + (v + c.d) % 3 as lineas
from t_cajas c cross join generate_series(1, 60) v;

insert into ventas (id, ubicacion_id, cliente_id, usuario_id, caja_id, created_at, estado, emisor, descuento_pct, asesora_id)
select v.id, v.ubicacion_id,
       case when v.nro % 10 < 3 then (select id from t_cli where i = (v.nro * 331 + v.d * 17) % 20000) end,
       p.id, v.caja_id, v.creada, 'completada', 'retail', 0, p.id
from t_ventas v join t_per p on p.ubicacion_id = v.ubicacion_id and p.i = v.nro % 10;

create temp table t_items as
select gen_random_uuid() as id, v.id as venta_id, v.ubicacion_id, v.creada, x.id as variante_id, x.precio, x.costo, v.tienda
from t_ventas v cross join lateral generate_series(1, v.lineas) l
join t_var x on x.i = (v.nro * 7919 + v.d * 104729 + l * 15485863 + v.tienda * 32452843) % 24000;

insert into venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
select id, venta_id, variante_id, 1, precio, 0, costo from t_items;

insert into venta_pagos (venta_id, metodo, monto)
select venta_id, (array['efectivo','tarjeta','yape','plin'])[1 + abs(hashtext(venta_id::text)) % 4], sum(precio)
from t_items group by venta_id;

insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, created_at)
select i.variante_id, i.ubicacion_id, t.piso, 'salida', 1, 'venta', i.id, i.creada
from t_items i join t_tiendas t on t.id = i.ubicacion_id;

-- El libro tiene que cuadrar con la foto (principio 4): la carga inicial fue 1.000 MÁS lo que se vendió en el año, así
-- el stock de hoy (1.000) es exactamente entradas − salidas.
update movimientos m set cantidad = m.cantidad + x.n
from (select variante_id, ubicacion_id, count(*) as n from t_items group by 1, 2) x
where m.motivo = 'Carga inicial (volumen sintético)' and m.variante_id = x.variante_id and m.ubicacion_id = x.ubicacion_id;

-- Boleta aceptada por venta, con su serie por tienda.
insert into comprobantes (venta_id, ubicacion_id, tipo, serie, numero, cliente_tipo_doc, subtotal, igv, total, estado, entorno_transmision, created_at, items)
select v.id, v.ubicacion_id, 'boleta', 'BC' || lpad(v.tienda::text, 2, '0'),
       row_number() over (partition by v.tienda order by v.creada, v.id),
       'sin_documento', round(s.total / 1.18, 2), s.total - round(s.total / 1.18, 2), s.total,
       'aceptado', 'produccion', v.creada, '[]'::jsonb
from t_ventas v join (select venta_id, sum(precio) total from t_items group by venta_id) s on s.venta_id = v.id;

reset session_replication_role;

analyze;

select 'productos' as tabla, count(*) from productos
union all select 'variantes', count(*) from variantes
union all select 'stock', count(*) from stock
union all select 'ventas', count(*) from ventas
union all select 'venta_items', count(*) from venta_items
union all select 'movimientos', count(*) from movimientos
union all select 'comprobantes', count(*) from comprobantes
union all select 'clientas', count(*) from clientas
union all select 'cajas', count(*) from cajas
union all select 'marcajes', count(*) from public.marcajes;
