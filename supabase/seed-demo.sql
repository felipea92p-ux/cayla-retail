-- ============================================================================
-- SEED DE DEMOSTRACIÓN — datos de mentira para poder VER funcionar el sistema
-- ============================================================================
-- NO se corre solo. `config.toml` solo lista `./seed.sql`, que siembra lo
-- mínimo para entrar (un usuario, su persona, las series de AQP). Este archivo
-- es aparte y se corre a mano cuando quieres una pantalla con datos:
--
--   docker exec -i supabase_db_cayla-retail psql -U postgres -d postgres < supabase/seed-demo.sql
--
-- Se borra entero con `npx supabase db reset`, que rehace migraciones + seed
-- real sin este archivo. Por eso no necesita —ni tiene— ningún DELETE: si ya
-- hay datos de demo se planta y avisa, en vez de borrar `movimientos`.
--
-- POR QUÉ EXISTE: sin catálogo no hay stock, sin stock no hay ventas, y sin
-- ventas el Inicio muestra cuatro ceros. Con la base vacía se puede probar que
-- el código no revienta, pero no que la pantalla SIRVE. Esto llena ese hueco
-- sin tocar producción y sin inventar un modo "demo" dentro de la app.
--
-- REGLA QUE RESPETA: `movimientos` es la fuente de verdad y `stock` es un
-- derivado. Acá se insertan movimientos con su fecha real y después se llama a
-- `retail.recalcular_stock()` — nunca se escribe una cantidad de stock a mano.
-- Es la misma regla que hace imposible un inventario inconsistente en
-- producción; un seed que la rompiera enseñaría a romperla.
--
-- LO QUE NO CUBRE: `retail.stock_almacen` no existe en local — solo la crea
-- `supabase/unificacion/12_almacen_interno.sql`, que es de producción. Así que
-- la parte de "almacén" del inventario a costo no se puede sembrar ni verificar
-- acá. Es la deuda de migraciones duales que ya está en el BACKLOG.
-- ============================================================================

set search_path to retail, public;

-- Todo en una transacción: psql confirma cada sentencia por su cuenta, así que
-- sin esto la tabla temporal moría antes de usarse y un error a mitad dejaba
-- media demo cargada. Con `begin`, o entra todo o no entra nada.
begin;

do $guardia$
begin
  if exists (select 1 from retail.productos where sku_padre like 'DEMO-%') then
    raise exception 'Ya hay datos de demo cargados. Corre npx supabase db reset y vuelve a intentar.';
  end if;
end
$guardia$;

-- ==================== 1. Catálogo ====================
-- La chalina nace 60 días atrás a propósito: por encima del umbral de 45 días
-- sin venta, para que aparezca como "estancada" y esa cifra del Inicio no sea
-- siempre cero.
insert into productos (sku_padre, referencia, marca, genero, estado, categoria_id, created_at)
select v.sku_padre, v.referencia, 'CAYLA', 'mujer', 'activa', c.id,
       timezone('America/Lima', now()) - make_interval(days => v.dias_atras)
from (values
  ('DEMO-BLU', 'BLUSA SATINADA', 'Blusas',            25),
  ('DEMO-BLA', 'BLAZER DE LINO', 'Blazers/Sacos',     25),
  ('DEMO-ARE', 'ARETES PERLA',   'Aretes',            25),
  ('DEMO-CHA', 'CHALINA ALPACA', 'Bufandas/Chalinas', 60)
) as v(sku_padre, referencia, categoria, dias_atras)
join categorias c on c.nombre = v.categoria;

insert into variantes (producto_id, sku, talla, color, costo, precio, created_at)
select p.id, v.sku, v.talla, v.color, v.costo, v.precio, p.created_at
from (values
  ('DEMO-BLU', 'DEMO-BLU-S', 'S',  'Marfil', 22.00,  69.00),
  ('DEMO-BLU', 'DEMO-BLU-M', 'M',  'Marfil', 22.00,  69.00),
  ('DEMO-BLU', 'DEMO-BLU-L', 'L',  'Marfil', 22.00,  69.00),
  ('DEMO-BLA', 'DEMO-BLA-S', 'S',  'Arena',  45.00, 139.00),
  ('DEMO-BLA', 'DEMO-BLA-M', 'M',  'Arena',  45.00, 139.00),
  ('DEMO-ARE', 'DEMO-ARE-U', null, 'Nácar',   8.00,  29.00),
  ('DEMO-CHA', 'DEMO-CHA-U', null, 'Camel',  35.00,  99.00)
) as v(padre, sku, talla, color, costo, precio)
join productos p on p.sku_padre = v.padre;

-- ==================== 2. Entradas de mercadería ====================
insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, created_at)
select vr.id, s.id, 'entrada', e.cant, 'compra',
       (select id from personas order by created_at limit 1),
       vr.created_at + interval '2 hours'
from (values
  ('DEMO-BLU-S', 'TRU', 12), ('DEMO-BLU-S', 'AQP', 10),
  ('DEMO-BLU-M', 'TRU', 18), ('DEMO-BLU-M', 'AQP', 14),
  ('DEMO-BLU-L', 'TRU', 10), ('DEMO-BLU-L', 'AQP',  8),
  ('DEMO-BLA-S', 'TRU',  6), ('DEMO-BLA-S', 'AQP',  5),
  ('DEMO-BLA-M', 'TRU',  7), ('DEMO-BLA-M', 'AQP',  6),
  ('DEMO-ARE-U', 'TRU', 30), ('DEMO-ARE-U', 'AQP', 25), ('DEMO-ARE-U', 'LIM', 15),
  ('DEMO-CHA-U', 'TRU',  9)
) as e(sku, sede, cant)
join variantes vr on vr.sku = e.sku
join sedes s on s.codigo = e.sede;

-- Una entrada RECIENTE, aparte de las de arriba. Sin ella la actividad del
-- Inicio muestra ocho "Venta" seguidas —las entradas quedan fuera del corte por
-- viejas— y la etiqueta "Ingreso de mercadería" nunca se ve, aunque el código
-- sepa escribirla. Va a LIM sobre los aretes: no toca ninguno de los dos casos
-- de traslado que la demo monta sobre las blusas.
insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, created_at)
select vr.id, s.id, 'entrada', 6, 'compra',
       (select id from personas order by created_at limit 1),
       (date_trunc('day', timezone('America/Lima', now())) - interval '1 day' + interval '11 hours')
         at time zone 'America/Lima'
from variantes vr, sedes s
where vr.sku = 'DEMO-ARE-U' and s.codigo = 'LIM';

-- ==================== 3. Cajas ====================
-- Las tres quedan ABIERTAS, pero la de LIM lleva 3 días así. Es el caso que
-- separa las dos mitades del Inicio: la tarjeta "Cajas" dice el ESTADO ("3 de 3
-- abiertas", sin rojo — tener la caja abierta es lo normal) y la bandeja de
-- pendientes dice la ACCIÓN ("1 caja de días anteriores sin cerrar"), que es lo
-- único que de verdad exige que alguien haga algo.
insert into cajas (sede_id, monto_apertura, abierta_por, abierta_en, estado)
select s.id, 100.00, (select id from personas order by created_at limit 1),
       (date_trunc('day', timezone('America/Lima', now()))
          - make_interval(days => case when s.codigo = 'LIM' then 3 else 0 end)
          + interval '9 hours') at time zone 'America/Lima',
       'abierta'
from sedes s where s.codigo in ('TRU', 'AQP', 'LIM');

-- ==================== 4. Ventas de las últimas 2 semanas ====================
-- `dias` = cuántos días atrás en hora de Lima; `hora`/`minu` = hora local.
-- Las de hace 7 días a las 09:40 y 10:30 están puestas a esa hora a propósito:
-- son la base del comparativo del Inicio ("vs. la semana pasada a esta hora").
-- Si sólo hubiera ventas de la tarde, a media mañana no habría contra qué
-- comparar y la tarjeta no mostraría porcentaje.
create temporary table _demo_ventas on commit drop as
select
  gen_random_uuid() as venta_id,
  s.id  as sede_id,
  vr.id as variante_id,
  d.cant,
  d.metodo,
  round(vr.precio * d.cant, 2) as monto,
  (date_trunc('day', timezone('America/Lima', now()))
     - make_interval(days => d.dias)
     + make_interval(hours => d.hora, mins => d.minu)) at time zone 'America/Lima' as cuando
from (values
  (13, 18, 10, 'TRU', 'DEMO-BLU-M', 2, 'efectivo'),
  (13, 19,  0, 'AQP', 'DEMO-ARE-U', 1, 'yape'),
  (12, 17, 30, 'TRU', 'DEMO-BLU-S', 1, 'pos'),
  (11, 16, 20, 'AQP', 'DEMO-BLU-M', 2, 'efectivo'),
  (11, 18, 45, 'TRU', 'DEMO-ARE-U', 2, 'yape'),
  (10, 11,  0, 'TRU', 'DEMO-BLU-M', 1, 'efectivo'),
  ( 9, 17,  0, 'AQP', 'DEMO-BLA-S', 1, 'pos'),
  ( 8, 19, 20, 'TRU', 'DEMO-BLU-M', 2, 'efectivo'),
  ( 8, 16,  0, 'TRU', 'DEMO-BLU-L', 1, 'yape'),
  ( 7,  9, 40, 'AQP', 'DEMO-BLU-M', 1, 'efectivo'),
  ( 7, 10, 30, 'TRU', 'DEMO-BLU-M', 2, 'pos'),
  ( 7, 17, 50, 'TRU', 'DEMO-ARE-U', 3, 'yape'),
  ( 7, 19, 10, 'AQP', 'DEMO-BLA-M', 1, 'transferencia'),
  ( 6, 18,  0, 'TRU', 'DEMO-BLU-M', 1, 'efectivo'),
  -- Estas tres dejan la talla L en CERO en AQP mientras a TRU le sobran 9: es el
  -- caso que dispara la sugerencia de traslado del Inicio. Sin una sede en cero,
  -- ese bloque no tiene nada que decir y no aparece.
  ( 6, 17, 30, 'AQP', 'DEMO-BLU-L', 3, 'efectivo'),
  ( 4, 16,  0, 'AQP', 'DEMO-BLU-L', 2, 'yape'),
  ( 2, 19,  0, 'AQP', 'DEMO-BLU-L', 2, 'pos'),
  ( 5, 16, 40, 'AQP', 'DEMO-BLU-M', 2, 'pos'),
  ( 5, 19,  0, 'TRU', 'DEMO-BLU-S', 2, 'efectivo'),
  ( 4, 17, 10, 'TRU', 'DEMO-BLU-M', 3, 'efectivo'),
  ( 4, 18, 20, 'AQP', 'DEMO-ARE-U', 2, 'yape'),
  ( 3, 15, 30, 'AQP', 'DEMO-BLU-M', 1, 'efectivo'),
  ( 2, 18, 30, 'TRU', 'DEMO-BLU-M', 2, 'pos'),
  ( 2, 19, 40, 'TRU', 'DEMO-BLA-M', 1, 'transferencia'),
  ( 2, 17,  0, 'AQP', 'DEMO-BLU-L', 1, 'efectivo'),
  ( 1, 16, 10, 'TRU', 'DEMO-BLU-M', 1, 'efectivo'),
  ( 1, 18, 50, 'AQP', 'DEMO-BLU-M', 2, 'yape'),
  ( 1, 17, 30, 'LIM', 'DEMO-ARE-U', 2, 'efectivo'),
  ( 0,  9, 15, 'TRU', 'DEMO-BLU-M', 2, 'efectivo'),
  ( 0, 10, 20, 'TRU', 'DEMO-BLA-M', 1, 'pos'),
  ( 0, 10, 45, 'AQP', 'DEMO-ARE-U', 1, 'yape')
) as d(dias, hora, minu, sede, sku, cant, metodo)
join sedes s on s.codigo = d.sede
join variantes vr on vr.sku = d.sku;

insert into ventas (id, sede_id, caja_id, metodo_pago, monto_total, usuario_id, created_at)
select d.venta_id, d.sede_id,
       (select c.id from cajas c where c.sede_id = d.sede_id limit 1),
       d.metodo, d.monto,
       (select id from personas order by created_at limit 1),
       d.cuando
from _demo_ventas d;

insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, canal, monto, venta_id, usuario_id, created_at)
select d.variante_id, d.sede_id, 'salida', d.cant, 'venta', 'tienda', d.monto, d.venta_id,
       (select id from personas order by created_at limit 1),
       d.cuando
from _demo_ventas d;

-- ==================== 5. Derivar el stock ====================
-- Nunca se escribe `stock` a mano: se reconstruye desde `movimientos`.
--
-- OJO — acá NO se llama a `retail.recalcular_stock()`, que es la función que
-- debería hacer justo esto. Está rota y no puede correr en ninguna base con
-- ventas: inserta las salidas como `-sum(cantidad)` confiando en que el
-- `on conflict do update` las reste de la fila que ya existe, pero Postgres
-- evalúa los CHECK sobre la fila PROPUESTA antes de resolver el conflicto, y
-- `stock_cantidad_no_negativa` la rechaza antes de llegar al update.
-- Reproducción mínima:
--   create temp table t (a int primary key, b int check (b >= 0));
--   insert into t values (1, 5);
--   insert into t values (1, -3) on conflict (a) do update set b = t.b + excluded.b;
--   -- ERROR: violates check constraint, aunque el resultado seria 2
-- El arreglo de fondo es agregar el NETO por (variante, sede) y recién ahí
-- insertar una sola vez — que es lo que hace la consulta de abajo. Está
-- pendiente de decidir con Felipe porque toca el núcleo y también producción.
--
-- (Este seed no crea traslados, así que la pata de `sede_destino_id` no se
-- replica acá a propósito: no se copia lógica que este archivo no ejercita.)
insert into stock (variante_id, sede_id, cantidad, ultima_entrada, ultima_salida)
select variante_id, sede_id,
       sum(case when tipo in ('entrada', 'ajuste') then cantidad else -cantidad end),
       max(created_at) filter (where tipo = 'entrada'),
       max(created_at) filter (where tipo in ('salida', 'traslado'))
from movimientos
group by variante_id, sede_id;

-- `recalcular_stock` no sella `ultima_venta` (eso lo hace fn_aplicar_movimiento
-- en la operación real), así que se deriva acá del mismo movimiento. Sin esto,
-- "días sin venta" se mediría desde el alta y nada saldría estancado.
update stock s
set ultima_venta = m.ultima
from (
  select variante_id, sede_id, max(created_at) as ultima
  from movimientos
  where tipo = 'salida' and motivo = 'venta'
  group by variante_id, sede_id
) m
where m.variante_id = s.variante_id and m.sede_id = s.sede_id;

-- Un límite por sede puesto a mano (lo que en la app se fija en
-- /producto/[varianteId] con la RPC `fijar_stock_minimo`). TRU se queda con 2
-- blusas talla M y su límite es 5: el Inicio debe sugerir el traslado AUNQUE
-- TRU no esté en cero. Es el caso que la regla vieja —"solo si está en cero"—
-- no veía. La talla L queda como el otro caso, el de cero exacto en AQP.
update stock set stock_minimo = 5
where variante_id = (select id from variantes where sku = 'DEMO-BLU-M')
  and sede_id = (select id from sedes where codigo = 'TRU');

-- ==================== 6. Pendientes ====================
-- Lo que alimenta la bandeja del Inicio. Cada fila es un estado que en la
-- operación real exige que alguien haga algo hoy; sin ellas el bloque no
-- aparece (a propósito) y no habría forma de verlo funcionar.

-- Rechazado por SUNAT: el estado más caro del sistema. El correlativo ya quedó
-- consumido y el documento no vale. `entorno_transmision` es obligatorio en
-- todo lo que no sea 'pendiente'.
insert into comprobantes (sede_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc,
                          cliente_nombre, moneda, subtotal, igv, total, estado,
                          entorno_transmision, motivo_rechazo, created_at)
select s.id, 'boleta', 'B001', 1, 'dni', '44556677', 'ROSA QUISPE MAMANI', 'PEN',
       58.47, 10.53, 69.00, 'rechazado', 'sandbox',
       '2335 - El documento electronico ya fue dado de baja',
       (date_trunc('day', timezone('America/Lima', now())) - interval '2 days' + interval '18 hours')
         at time zone 'America/Lima'
from sedes s where s.codigo = 'AQP';

-- Emitido hace tres días y nunca transmitido: el olvido con plazo corriendo.
insert into comprobantes (sede_id, tipo, serie, numero, cliente_tipo_doc,
                          cliente_nombre, moneda, subtotal, igv, total, estado, created_at)
select s.id, 'boleta', 'B001', 2, 'sin_documento', 'Cliente varios', 'PEN',
       117.80, 21.20, 139.00, 'pendiente',
       (date_trunc('day', timezone('America/Lima', now())) - interval '3 days' + interval '17 hours')
         at time zone 'America/Lima'
from sedes s where s.codigo = 'AQP';

-- La serie tiene que quedar donde la dejó la demo: con `siguiente_numero` en 1,
-- la primera boleta emitida desde la pantalla chocaría contra el
-- unique(tipo, serie, numero) que ya ocupan las dos de arriba. Es el mismo
-- problema real que dejó B004-000001 en producción (BITACORA 05-09).
update series_comprobantes set siguiente_numero = 3 where tipo = 'boleta' and serie = 'B001';

-- Taller: una corrida terminada que nunca entró al inventario (las prendas
-- existen y el sistema no lo sabe: todo lo que se calcula sobre stock queda mal
-- mientras dure) y otra que ya pasó su fecha de entrega.
insert into producciones (unidad_id, producto_id, fecha, cantidad, costo_tela, costo_avios,
                          costo_maquila, precio_taller, es_muestra, estado, detalle,
                          fecha_entrega, inventariado_at, creado_por, created_at)
select t.id, p.id,
       (timezone('America/Lima', now()) - interval '12 days')::date,
       24, 380.00, 90.00, 240.00, 69.00, false, 'terminado',
       'Blusa satinada — corrida 12',
       (timezone('America/Lima', now()) - interval '2 days')::date,
       null,
       (select id from personas order by created_at limit 1),
       timezone('America/Lima', now()) - interval '12 days'
from sedes t, productos p
where t.tipo = 'fabrica' and p.sku_padre = 'DEMO-BLU';

insert into producciones (unidad_id, producto_id, fecha, cantidad, costo_tela, costo_avios,
                          costo_maquila, precio_taller, es_muestra, estado, detalle,
                          fecha_entrega, creado_por, created_at)
select t.id, p.id,
       (timezone('America/Lima', now()) - interval '20 days')::date,
       15, 620.00, 140.00, 300.00, 139.00, false, 'en_proceso',
       'Blazer de lino — corrida 13',
       (timezone('America/Lima', now()) - interval '4 days')::date,
       (select id from personas order by created_at limit 1),
       timezone('America/Lima', now()) - interval '20 days'
from sedes t, productos p
where t.tipo = 'fabrica' and p.sku_padre = 'DEMO-BLA';

-- Compras: una orden que según su propia fecha estimada ya debió llegar. Solo
-- se siembra CON fecha estimada — una orden sin ella no se marca atrasada
-- nunca, porque nadie sabe cuándo debía llegar.
insert into ordenes_compra (proveedor, estado, sede_destino_id, fecha, fecha_estimada, monto_estimado, nota)
select 'Textiles Gamarra SAC', 'confirmada', s.id,
       (timezone('America/Lima', now()) - interval '21 days')::date,
       (timezone('America/Lima', now()) - interval '5 days')::date,
       2400.00, 'Reposicion de blusas satinadas'
from sedes s where s.codigo = 'TRU';

do $resumen$
declare
  v_ventas int;
  v_hoy numeric;
  v_unidades bigint;
  v_valor numeric;
begin
  select count(*),
         coalesce(sum(monto_total) filter (
           where created_at >= date_trunc('day', timezone('America/Lima', now())) at time zone 'America/Lima'
         ), 0)
    into v_ventas, v_hoy
    from retail.ventas;

  select coalesce(sum(st.cantidad), 0), coalesce(sum(st.cantidad * vr.costo), 0)
    into v_unidades, v_valor
    from retail.stock st
    join retail.variantes vr on vr.id = st.variante_id;

  raise notice 'Demo lista: % ventas en 14 dias | hoy S/% | % unidades en piso | inventario a costo S/%',
    v_ventas, v_hoy, v_unidades, v_valor;
end
$resumen$;

commit;
