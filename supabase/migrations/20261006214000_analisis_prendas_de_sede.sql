-- ============================================================================
-- 20261006214000_analisis_prendas_de_sede.sql — CAYLA V2 · ADR-0356 (Análisis v4, actividad 2: las prendas de cada tienda)
-- Una sola lectura, de solo lectura, con lo que Análisis dice de cada prenda (una talla de un color de un modelo) de UNA tienda.
--
-- EL PROBLEMA PRIMERO. El nuevo Análisis hace cuatro preguntas por prenda —¿qué hago hoy?, ¿qué se está acabando?, ¿qué no se
-- vende?, ¿qué pido?— y compara las tres tiendas. Ninguna lectura de hoy las contesta: nadie da lo vendido por semana de una prenda,
-- los días sin venderse sin tope de fechas (fn_resumen_variantes solo mira dentro de su ventana), «de lo que llegó, cuánto se
-- vendió» ni cuántas ventas llevaron rebaja. Y todas las lecturas por prenda (fn_demanda_sede, fn_resumen_comparacion,
-- fn_piso_plan_lectura) exigen OPERAR la sede: a una encargada, las otras dos tiendas le llegaban vacías. Felipe decidió (decisión 8,
-- 2026-10-06) que en Análisis la encargada y el líder vean LO MISMO: las tres tiendas, con el precio y el costo de cada prenda.
--
-- QUÉ HACE. `retail.fn_analisis_sede(p_ubicacion_id)` devuelve UN jsonb `{ubicacion_id, hoy, rebaja_de_100, prendas: [...]}`. La web
-- la llama una vez por tienda, en paralelo (`apps/web/lib/analisis-sede.ts`), y cruza las tres en `lib/analisis-armado.ts`. Hay UNA
-- fila por prenda de la tienda con algo que decir: libre en la tienda, vendida en las últimas 8 semanas, llegada en 30 días o en
-- camino (un traslado en tránsito o una compra repartida a la tienda que falta recibir). Cada fila trae:
--   · la prenda: `variante_id`, `producto_id`, `nombre` (`productos.referencia`, el nombre del modelo en tienda), `color` y
--     `color_hex`, `talla` (`tallas.valor`), `categoria` con su `categoria_prefijo` y `categoria_familia` (el ícono de la prenda sin
--     foto, ADR-0333; si una subcategoría no los trae, los de su categoría madre) y `foto_url` (la de SU color o la sin color,
--     la principal primero: una foto de otro color mentiría; sin ninguna, la web dibuja la prenda sin foto);
--   · el dinero: `precio` (de venta vigente, `variantes.precio`) y `costo` (`variantes.costo`); NULL si es 0 o menos, que es «no se
--     sabe» (como `estado_costo = 'sin_costo'` de fn_resumen_comparacion), nunca un costo de 0 que abarate lo quieto;
--   · de dónde se repone: `origen` 'taller' o 'terceros' y `proveedor_id` (el de la última compra, solo si es de terceros). Sale de
--     `fn_origen_producto(producto, hoy)`, LA regla de «¿de quién es esta prenda?» (la última compra vigente o producción terminada
--     del Taller, hasta hoy): aquí no se copia. Sin compra ni producción (lo que entró por carga inicial), NULL: no se adivina;
--   · `piso` y `almacen`: lo LIBRE de `fn_existencias_base` (LA cifra de stock, ADR-0270: sin apartadas ni Cuarentena). En
--     `almacen` va también lo libre que quedó sin lugar (una sede que no separa piso y almacén): no está colgado, está guardado
--     —como cuenta Pedir a otra sede (`pedidos-entre-sedes-reglas.ts`) y como el motor cuenta la tienda entera como almacén—;
--   · `vendidas_30`: lo vendido de ESTA prenda en la tienda en los últimos 30 días de Lima, hoy incluido;
--   · `semanas`: 8 enteros, de la semana más vieja a la actual; la semana k (0 a 7) son los 7 días que terminan hoy − 7·(7−k), así
--     que la última termina hoy y puede estar a medias;
--   · `dias_sin_vender`: días desde la última venta de la prenda en ESTA tienda, sin tope de fechas; si nunca se vendió aquí, desde
--     que entró a la tienda por primera vez (cualquier entrada o ajuste a favor que no fue a Cuarentena, o un traslado del modelo de
--     un solo paso: el `primer_ingreso` de fn_resumen_variantes); NULL si no hay de dónde contar;
--   · `llegaron_30`: las unidades que ENTRARON a la tienda en 30 días según `fn_es_llegada`, el mismo predicado que usan Frescura y
--     la comparación de períodos: lo recibido de un proveedor, del Taller o de otra ubicación (traslado), y lo que se registró al
--     llegar (carga inicial: así entra hoy la mercadería nueva que se da de alta con su stock). No cuentan bajar o subir entre piso
--     y almacén (son traslados dentro de la tienda), los ajustes, ni lo que vuelve de un cliente (devoluciones y cambios);
--   · `vendidas_de_llegadas_30`: de esas, cuántas se vendieron desde la primera de esas entradas (nunca más que `llegaron_30`). Es
--     «se vende lo que llega» por prenda; la web lo suma por tienda.
-- Arriba, `rebaja_de_100`: de cada 100 líneas vendidas en la tienda en 30 días, cuántas llevaron rebaja —un descuento de la línea
-- que no es el regalo de cumpleaños del club, o un descuento a toda la venta (`ventas.descuento_pct`)—; NULL si no vendió. El regalo
-- del club no es una rebaja: es la misma separación que ya hace el candado de «no vender bajo costo» (ADR-0288, tanda 1c). Aquí sí
-- cuentan las ventas «sin registrar»: son ventas de verdad y su descuento se conoce aunque no se sepa la prenda.
--
-- CÓMO CUENTA LO VENDIDO. Igual que `fn_piso_plan_lectura` (ADR-0328, actividad 7), que es LA forma de contar una venta: la línea
-- cobrada, menos lo que se cambió por otra prenda y lo devuelto con devolución APROBADA, más cada cambio como la prenda NUEVA en el
-- día de la venta; sin ventas anuladas ni de prueba, sin productos de prueba y sin la liquidación de una prenda dañada
-- (`cuarentena_liquidada`: salió de Cuarentena, no la eligió un cliente). Por prenda, sin la centinela de «sin registrar»
-- (ADR-0179): esas ventas no tienen prenda. Las ventas salen de `ventas`/`venta_items` y no del libro por la misma razón que allá:
-- la línea tiene una sola fecha (la del cobro) y una sola prenda a la vez, así una venta regularizada no cuenta dos veces. La única
-- diferencia es de forma: aquí se mira la historia entera de la tienda (la última venta no tiene tope), así que los cambios y las
-- devoluciones se suman una vez por línea y se cruzan, en vez de buscarse línea por línea.
--
-- QUIÉN LA LEE. Dos puertas: la de todas las lecturas de retail (`fn_tiene_acceso_retail()`: persona activa con colaborador activo,
-- o terminal activa) y la de Análisis (`fn_puede_analizar()`: el líder, o un rol con el módulo Análisis). NO pide operar la sede
-- (`fn_puede_operar_ubicacion`), a propósito: por la decisión 8 de Felipe (2026-10-06), en Análisis la encargada y el líder ven lo
-- mismo, las tres tiendas, con sus ventas por prenda, su precio y su costo (ADR-0328 enmendado). Es una lectura `security definer`
-- que salta el RLS de `ventas` (que solo deja ver la sede propia): esa es la decisión, y la puerta de Análisis es su candado. Sin
-- cualquiera de las dos puertas devuelve NULL —no un jsonb vacío—: la web lo dice como «no se pudo leer», nunca como «sin ventas».
--
-- NÚMEROS. Hoy una tienda tiene unas 500 tallas con stock y cientos de líneas de venta en su historia; en 3 años, como techo, ~2.000
-- tallas y ~50.000 líneas por tienda. La lectura recorre las ventas de UNA tienda por `ventas_ubicacion_fecha_idx` (con la salida
-- de liquidación de cada línea por `movimientos_venta_item_idx`), sus movimientos por `movimientos_ubicacion_fecha_idx` y
-- `movimientos_destino_fecha_idx`, y `fn_existencias_base` UNA vez (CTE materializada). Medido en local: 7 a 12 ms por tienda con
-- los datos de la base, y 19 ms (mediana) con 200 prendas y 600 ventas (`scripts/pruebas/analisis_lecturas.mjs`, caso N1).
-- `fn_origen_producto` corre una vez por modelo, no por talla, pero recorre `compra_items` entera (no hay índice por producto):
-- con 20.000 líneas de compra son ~3 ms por modelo, ~300 ms para una tienda con 100 modelos. Si Compras crece hasta ahí, un
-- índice `compra_items (producto_id)` lo resuelve sin tocar esta función (queda propuesto, no se crea aquí: es la tabla de Compras).
-- Sin caché ni tabla resumen: serían una copia que se puede desincronizar.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, ANTES de fusionar la web que la llama). Un solo `create or replace function` con
-- su `comment` y sus permisos: sin políticas ni `alter` de tablas, así que no toma los bloqueos de `auth`/`storage` (ADR-0195) y se
-- pega entero, en una sola parte, en el SQL Editor (ya trae `retail.`). La guarda del principio se detiene, sin crear nada, si falta algo
-- de lo que asume. Se puede pegar dos veces. Después de pegar, solo lectura:
--   select md5(prosrc) from pg_proc where oid = 'retail.fn_analisis_sede(uuid)'::regprocedure;
--     → `f26582c6a15c91ff5c154e77acf07dc5` (el cuerpo de este archivo; medido en la base local con todas las migraciones).
--   select retail.fn_analisis_sede((select id from retail.ubicaciones where tipo = 'tienda' order by nombre limit 1)) is null;
--     → `true` en el SQL Editor: ahí no hay sesión, y eso también es la prueba de la puerta. Con sesión (la web) trae el jsonb.
--
-- SE ROMPE SI alguien cambia `regularizar_prenda` para que deje la línea de venta en la centinela (las regularizadas dejarían de
-- contar por prenda) o para que cree una línea nueva (contarían dos veces): lo vigila `pnpm pruebas:piso-plan`, que cuenta igual.
-- Si `fn_es_llegada` cambia de predicado, cambia aquí también «lo que llegó» (a propósito: una sola definición con Frescura). Si el
-- club deja de guardar su parte en `descuento_club_unitario`, su regalo empezaría a contar como rebaja. Y si una venta se registra
-- con una sede distinta de la que vendió, la prenda se vendería en la tienda equivocada. Prueba: `scripts/pruebas/analisis_lecturas.mjs`.
-- SE DESHACE con: drop function retail.fn_analisis_sede(uuid);
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Guarda: lo que esta lectura asume tiene que estar en la base. Si falta, se detiene sin crear nada.
do $$
begin
  if to_regprocedure('retail.fn_existencias_base(uuid, uuid[])') is null then
    raise exception 'Falta retail.fn_existencias_base(uuid, uuid[]): pega antes 20260929010000_fn_existencias_una_sola_cifra.sql.';
  end if;
  if to_regprocedure('retail.fn_tiene_acceso_retail()') is null or to_regprocedure('retail.fn_puede_analizar()') is null then
    raise exception 'Faltan las puertas retail.fn_tiene_acceso_retail() o retail.fn_puede_analizar(): pega antes 20260923130000_abrir_modulos_a_los_roles.sql.';
  end if;
  if to_regprocedure('retail.fn_origen_producto(uuid, date)') is null then
    raise exception 'Falta retail.fn_origen_producto(uuid, date): pega antes 20260918191500_fn_origen_producto.sql.';
  end if;
  if to_regprocedure('retail.fn_es_llegada(text, text, uuid, uuid, uuid)') is null then
    raise exception 'Falta retail.fn_es_llegada(text, text, uuid, uuid, uuid): pega antes 20260928120300_frescura_lectura.sql.';
  end if;
  if to_regclass('retail.compra_item_reparto_resumen') is null then
    raise exception 'Falta la vista retail.compra_item_reparto_resumen: pega antes 20260919172000_reparto_compra_por_tienda.sql.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'retail' and table_name = 'venta_items' and column_name = 'descuento_club_unitario') then
    raise exception 'Falta retail.venta_items.descuento_club_unitario: pega antes 20260930230000_club_paso1c_parte1_venta_items.sql.';
  end if;
end $$;

create or replace function retail.fn_analisis_sede(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  -- La prenda centinela de las ventas «sin registrar» (ADR-0179) y su producto: no son una prenda que se pueda comprar ni liquidar.
  c_centinela constant uuid := '22222222-2222-4222-8222-222222222222';
  c_producto_centinela constant uuid := '11111111-1111-4111-8111-111111111111';
  v_hoy date;
  v_desde_30 date;
  v_desde_56 date;
begin
  if p_ubicacion_id is null then
    raise exception 'fn_analisis_sede: falta la tienda' using errcode = '22004';
  end if;
  -- Dos puertas (la de todas las lecturas y la de Análisis), sin la de la sede: decisión 8, ver la cabecera. Sin cualquiera, NULL.
  if not retail.fn_tiene_acceso_retail() or not retail.fn_puede_analizar() then
    return null;
  end if;

  v_hoy := retail.fn_hoy_lima();
  v_desde_30 := v_hoy - 29;   -- 30 días de Lima, hoy incluido
  v_desde_56 := v_hoy - 55;   -- 8 semanas de 7 días, hoy incluido

  return (
    with existencias as materialized (
      -- LA cifra de stock (ADR-0270), una sola vez: lo libre colgado y lo libre guardado (más lo libre sin lugar), y lo que viene
      -- en un traslado en tránsito.
      select e.variante_id,
             greatest(e.piso_libre, 0) as piso,
             greatest(e.almacen_libre + e.sin_lugar, 0) as almacen,
             e.en_camino
      from retail.fn_existencias_base(p_ubicacion_id, null) e
    ),
    lineas_cobradas as materialized (
      -- Cada línea de venta de la tienda, de toda su historia, con la hora y el día de Lima en que se COBRÓ, y si llevó rebaja.
      select vi.id as venta_item_id,
             vi.variante_id,
             vi.cantidad,
             v.created_at as cobrada_en,
             (v.created_at at time zone 'America/Lima')::date as dia,
             ((vi.descuento_unitario - vi.descuento_club_unitario) > 0 or v.descuento_pct > 0) as con_rebaja
      from retail.ventas v
      join retail.venta_items vi on vi.venta_id = v.id
      where v.ubicacion_id = p_ubicacion_id
        and v.estado = 'completada'
        and not v.es_prueba
        and not exists (select 1 from retail.movimientos m
                         where m.venta_item_id = vi.id and m.motivo = 'cuarentena_liquidada')
    ),
    cambiado as (
      select c.venta_item_id, sum(c.cantidad) as cantidad
      from retail.cambios c
      join lineas_cobradas l on l.venta_item_id = c.venta_item_id
      group by c.venta_item_id
    ),
    devuelto as (
      -- Solo lo devuelto con la devolución APROBADA: una pendiente o rechazada todavía no devolvió nada.
      select di.venta_item_id, sum(di.cantidad) as cantidad
      from retail.devolucion_items di
      join retail.devoluciones d on d.id = di.devolucion_id
      join lineas_cobradas l on l.venta_item_id = di.venta_item_id
      where d.estado = 'aprobada'
      group by di.venta_item_id
    ),
    lineas as materialized (
      -- Lo que el cliente se LLEVÓ, en el día en que se cobró: la línea menos lo cambiado y lo devuelto, y cada cambio como la
      -- prenda nueva con la fecha de la VENTA (el cambio corrige QUÉ se vendió, no CUÁNDO). Mismo límite conocido que
      -- fn_piso_plan_lectura: si lo cambiado además se devuelve, la devolución resta de la línea original hasta 0.
      select x.venta_item_id, x.variante_id, x.cantidad, x.cobrada_en, x.dia, x.con_rebaja
      from (
        select l.venta_item_id,
               l.variante_id,
               greatest(l.cantidad - coalesce(ca.cantidad, 0) - coalesce(de.cantidad, 0), 0)::integer as cantidad,
               l.cobrada_en, l.dia, l.con_rebaja
        from lineas_cobradas l
        left join cambiado ca on ca.venta_item_id = l.venta_item_id
        left join devuelto de on de.venta_item_id = l.venta_item_id
        union all
        select l.venta_item_id, c.variante_nueva_id, c.cantidad, l.cobrada_en, l.dia, l.con_rebaja
        from lineas_cobradas l
        join retail.cambios c on c.venta_item_id = l.venta_item_id
      ) x
      where x.cantidad > 0
    ),
    ventas_prenda as (
      -- Por prenda (sin la centinela ni los productos de prueba): su última venta en la tienda (sin tope de fechas), lo vendido en
      -- 8 semanas y en 30 días, y las 8 semanas una por una (la semana k son los 7 días que terminan hoy − 7·(7−k)).
      select l.variante_id,
             max(l.dia) as ultima_venta,
             coalesce(sum(l.cantidad) filter (where l.dia >= v_desde_56), 0)::integer as vendidas_56,
             coalesce(sum(l.cantidad) filter (where l.dia >= v_desde_30), 0)::integer as vendidas_30,
             array[
               coalesce(sum(l.cantidad) filter (where l.dia between v_hoy - 55 and v_hoy - 49), 0),
               coalesce(sum(l.cantidad) filter (where l.dia between v_hoy - 48 and v_hoy - 42), 0),
               coalesce(sum(l.cantidad) filter (where l.dia between v_hoy - 41 and v_hoy - 35), 0),
               coalesce(sum(l.cantidad) filter (where l.dia between v_hoy - 34 and v_hoy - 28), 0),
               coalesce(sum(l.cantidad) filter (where l.dia between v_hoy - 27 and v_hoy - 21), 0),
               coalesce(sum(l.cantidad) filter (where l.dia between v_hoy - 20 and v_hoy - 14), 0),
               coalesce(sum(l.cantidad) filter (where l.dia between v_hoy - 13 and v_hoy - 7), 0),
               coalesce(sum(l.cantidad) filter (where l.dia between v_hoy - 6 and v_hoy), 0)
             ]::integer[] as semanas
      from lineas l
      join retail.variantes va on va.id = l.variante_id
      join retail.productos pr on pr.id = va.producto_id
      where l.variante_id <> c_centinela
        and not pr.es_prueba
      group by l.variante_id
    ),
    rebaja as (
      -- Las líneas vendidas en 30 días (una por línea de venta, aunque un cambio la parta en dos prendas) y cuántas con rebaja.
      select count(distinct l.venta_item_id) as lineas,
             count(distinct l.venta_item_id) filter (where l.con_rebaja) as con_rebaja
      from lineas l
      join retail.variantes va on va.id = l.variante_id
      join retail.productos pr on pr.id = va.producto_id
      where l.dia >= v_desde_30
        and not pr.es_prueba
    ),
    llegadas as (
      -- Lo que ENTRÓ a la tienda en 30 días (`fn_es_llegada`: proveedor, Taller, traslado recibido o carga inicial) y cuándo entró
      -- lo primero de eso.
      select m.variante_id,
             sum(m.cantidad)::integer as llegaron_30,
             min(m.created_at) as primera
      from retail.movimientos m
      where m.ubicacion_id = p_ubicacion_id
        and m.created_at >= (v_desde_30::timestamp at time zone 'America/Lima')
        and retail.fn_es_llegada(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)
        and m.variante_id <> c_centinela
      group by m.variante_id
    ),
    vendidas_de_llegadas as (
      -- De lo que llegó, cuánto se vendió desde la primera de esas entradas (nunca más de lo que llegó).
      select ll.variante_id,
             least(coalesce(sum(l.cantidad), 0), ll.llegaron_30)::integer as vendidas
      from llegadas ll
      left join lineas l on l.variante_id = ll.variante_id and l.cobrada_en >= ll.primera
      group by ll.variante_id, ll.llegaron_30
    ),
    primer_ingreso as (
      -- La primera vez que la prenda entró a la tienda, sin tope de fechas: el reloj de una que nunca se vendió aquí. Una entrada o
      -- un ajuste a favor que no fue a Cuarentena (una devolución dañada no «llegó para venderse»), o un traslado del modelo de un
      -- solo paso que vino de otra ubicación (el `primer_ingreso` de fn_resumen_variantes).
      select x.variante_id, min(x.en) as en
      from (
        select m.variante_id, m.created_at as en
        from retail.movimientos m
        left join retail.sububicaciones su on su.id = m.sububicacion_id
        where m.ubicacion_id = p_ubicacion_id
          and (m.tipo = 'entrada' or (m.tipo = 'ajuste' and m.cantidad > 0))
          and su.tipo is distinct from 'cuarentena'
        union all
        select m.variante_id, m.created_at
        from retail.movimientos m
        where m.ubicacion_destino_id = p_ubicacion_id
          and m.ubicacion_id <> p_ubicacion_id
          and m.tipo = 'traslado'
      ) x
      where x.variante_id <> c_centinela
      group by x.variante_id
    ),
    compras_en_camino as (
      -- Una compra repartida a ESTA tienda que todavía falta recibir (`compra_item_reparto_resumen`: asignado − recibido − cerrado),
      -- de una línea que ya dice su talla y color. Una línea agrupada (sin variante) se desglosa al recibir: no tiene prenda aún.
      select distinct i.variante_id
      from retail.compra_item_reparto_resumen r
      join retail.compra_items i on i.id = r.compra_item_id
      join retail.compras c on c.id = r.compra_id
      where r.ubicacion_id = p_ubicacion_id
        and r.pendiente > 0
        and c.estado = 'vigente'
        and c.naturaleza = 'mercaderia'
        and i.variante_id is not null
    ),
    universo as (
      -- Las prendas con algo que decir: libres, vendidas en 8 semanas, llegadas en 30 días o en camino.
      select e.variante_id from existencias e where e.piso + e.almacen > 0 or e.en_camino > 0
      union
      select s.variante_id from ventas_prenda s where s.vendidas_56 > 0
      union
      select ll.variante_id from llegadas ll where ll.llegaron_30 > 0
      union
      select ce.variante_id from compras_en_camino ce
    ),
    origenes as (
      -- De dónde se repone cada modelo, con LA regla (fn_origen_producto), una vez por modelo. Sin origen, no hay fila.
      select p.producto_id, o.tipo, o.origen_id
      from (select distinct va.producto_id
              from universo u
              join retail.variantes va on va.id = u.variante_id) p
      cross join lateral retail.fn_origen_producto(p.producto_id, v_hoy) o
    ),
    filas as (
      select va.id as variante_id,
             va.producto_id,
             pr.referencia as nombre,
             co.nombre as color,
             co.hex as color_hex,
             ta.valor as talla,
             ca.nombre as categoria,
             coalesce(ca.prefijo, cm.prefijo) as categoria_prefijo,
             coalesce(ca.familia, cm.familia) as categoria_familia,
             foto.url as foto_url,
             case when va.precio > 0 then va.precio end as precio,
             case when va.costo > 0 then va.costo end as costo,
             case o.tipo when 'taller' then 'taller' when 'proveedor' then 'terceros' end as origen,
             case when o.tipo = 'proveedor' then o.origen_id end as proveedor_id,
             coalesce(e.piso, 0) as piso,
             coalesce(e.almacen, 0) as almacen,
             coalesce(s.vendidas_30, 0) as vendidas_30,
             coalesce(s.semanas, array[0, 0, 0, 0, 0, 0, 0, 0]::integer[]) as semanas,
             case
               when s.ultima_venta is not null then greatest(v_hoy - s.ultima_venta, 0)
               when pi.en is not null then greatest(v_hoy - (pi.en at time zone 'America/Lima')::date, 0)
             end as dias_sin_vender,
             coalesce(ll.llegaron_30, 0) as llegaron_30,
             coalesce(vl.vendidas, 0) as vendidas_de_llegadas_30
      from universo u
      join retail.variantes va on va.id = u.variante_id
      join retail.productos pr on pr.id = va.producto_id
      left join retail.colores co on co.codigo = va.color_codigo
      left join retail.tallas ta on ta.id = va.talla_id
      left join retail.categorias ca on ca.id = pr.categoria_id
      left join retail.categorias cm on cm.id = ca.categoria_padre_id
      left join existencias e on e.variante_id = u.variante_id
      left join ventas_prenda s on s.variante_id = u.variante_id
      left join llegadas ll on ll.variante_id = u.variante_id
      left join vendidas_de_llegadas vl on vl.variante_id = u.variante_id
      left join primer_ingreso pi on pi.variante_id = u.variante_id
      left join origenes o on o.producto_id = va.producto_id
      left join lateral (
        -- La foto de SU color o la que no tiene color (nunca la de otro color), la principal primero.
        select f.url
        from retail.producto_fotos f
        where f.producto_id = va.producto_id
          and (f.color_codigo is null or f.color_codigo = va.color_codigo)
        order by (f.color_codigo is null), f.es_principal desc, f.orden, f.created_at
        limit 1
      ) foto on true
      where not pr.es_prueba
        and pr.id <> c_producto_centinela
    )
    select jsonb_build_object(
      'ubicacion_id', p_ubicacion_id,
      'hoy', v_hoy,
      'rebaja_de_100', (select case when r.lineas > 0 then round(100.0 * r.con_rebaja / r.lineas)::integer end from rebaja r),
      'prendas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'variante_id', f.variante_id,
                 'producto_id', f.producto_id,
                 'nombre', f.nombre,
                 'color', f.color,
                 'color_hex', f.color_hex,
                 'talla', f.talla,
                 'categoria', f.categoria,
                 'categoria_prefijo', f.categoria_prefijo,
                 'categoria_familia', f.categoria_familia,
                 'foto_url', f.foto_url,
                 'precio', f.precio,
                 'costo', f.costo,
                 'origen', f.origen,
                 'proveedor_id', f.proveedor_id,
                 'piso', f.piso,
                 'almacen', f.almacen,
                 'vendidas_30', f.vendidas_30,
                 'semanas', to_jsonb(f.semanas),
                 'dias_sin_vender', f.dias_sin_vender,
                 'llegaron_30', f.llegaron_30,
                 'vendidas_de_llegadas_30', f.vendidas_de_llegadas_30)
               order by f.nombre, f.color, f.talla, f.variante_id)
        from filas f), '[]'::jsonb)
    )
  );
end;
$$;

comment on function retail.fn_analisis_sede(uuid) is
  'ADR-0356 (Análisis v4): las prendas de UNA tienda con algo que decir (libres, vendidas en 8 semanas, llegadas en 30 días o en '
  'camino), en un jsonb: nombre, color, talla, categoría, foto, precio y costo, origen (fn_origen_producto), lo libre en piso y '
  'almacén (fn_existencias_base), lo vendido en 30 días y en 8 semanas, días sin venderse, lo que llegó en 30 días (fn_es_llegada) '
  'y cuánto de eso se vendió, y de cada 100 líneas vendidas en 30 días cuántas llevaron rebaja. Cuenta lo vendido como '
  'fn_piso_plan_lectura. Puertas: fn_tiene_acceso_retail() y fn_puede_analizar(), sin pedir operar la sede (decisión 8: la '
  'encargada y el líder ven las tres tiendas). Sin ellas, NULL. Solo lectura.';

revoke all on function retail.fn_analisis_sede(uuid) from public, anon;
grant execute on function retail.fn_analisis_sede(uuid) to authenticated, service_role;

reset lock_timeout;
