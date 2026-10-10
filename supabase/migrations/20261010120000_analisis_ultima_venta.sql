-- ============================================================================
-- 20261010120000 — Análisis: la última venta de cada prenda, para medir el MODELO entero (ADR-0357, decisión 12, Felipe 2026-10-10)
--
-- EL PROBLEMA PRIMERO. Análisis medía cada talla de cada color por separado. Con 1 a 3 unidades por talla, el mismo modelo colgado
--   salía a la vez como «Se agotó, cómprala» (la S que se vendió) y «Nunca salió al piso» (la L guardada): en TRU, el 10 de octubre,
--   140 de las 424 tallas «que nunca salieron» eran de un modelo ya colgado. Felipe (2026-10-10): se mide por MODELO — si el Chaleco
--   Cecia está colgado en cualquier talla o color, todo el modelo está presentado — en las cuatro pestañas y en Hoy; la talla y el
--   color quedan en el detalle del modelo.
--
-- POR QUÉ HACE FALTA ESTO. La web arma el modelo juntando las filas por talla que ya devuelve esta función. Casi todo se suma
--   (stock, ventas, semanas) o se toma la primera fecha (`salio_al_piso`, `llego`). Lo único que no se puede deducir exacto es
--   «días sin venderse del modelo» = desde su última venta (de cualquier talla) o desde que el modelo salió al piso, lo que pasó
--   después: con solo `dias_sin_vender` por talla, una talla vendida el mismo día en que se colgó no se distingue de una que se colgó
--   ese día y nunca se vendió, y colgar una talla nueva parecería una venta. Por eso cada fila trae ahora `ultima_venta`.
--
-- QUÉ CAMBIA. Solo una clave más en cada fila: `ultima_venta` (fecha de Lima de la última venta de la prenda en ESTA tienda, sin tope
--   de fechas; NULL si nunca se vendió aquí). Es el `max(dia)` que la función ya calculaba en `ventas_prenda`. Todo lo demás de
--   20261007120000 queda igual, letra por letra.
--
-- NÚMEROS. Ninguna lectura nueva: el dato ya estaba calculado.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA PARTE (con el OK de Felipe, ANTES de fusionar la web que lo lee): un solo `create or replace
--   function` (misma firma: se reemplaza, no se crea otra), su comentario y sus permisos. Sin políticas, sin `alter` de tablas y sin
--   disparadores: no toma `auth` ni `storage` (ADR-0195). Se puede pegar dos veces. Lleva su `set search_path`: se pega tal cual.
--   La web de hoy sigue funcionando con esto: no lee la clave nueva.
-- SE ROMPE SI la web nueva se publica ANTES de pegar esto. No se cae: sin `ultima_venta`, cuenta los días del modelo con los de sus
--   tallas (el más reciente) y lo dice una vez arriba.
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select md5(prosrc) from pg_proc where oid = 'retail.fn_analisis_sede(uuid)'::regprocedure;
--     → `15598f29697b4a6229ba3d78d8630d5a` (el cuerpo de este archivo; la imprime el caso D4 de la prueba).
-- Prueba: `scripts/pruebas/analisis_lecturas.mjs` (casos F3, D4 y M1).
-- SE DESHACE pegando otra vez el cuerpo de 20261007120000_analisis_salio_al_piso.sql (huella 874919d9dfc5820ec59c2cc1ec70318d).
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
             min(l.dia) as primera_venta,
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
    pisos as materialized (
      -- Los pisos de venta de la tienda (normalmente uno): donde la prenda está a la vista del cliente.
      select su.id from retail.sububicaciones su where su.ubicacion_id = p_ubicacion_id and su.tipo = 'piso_venta'
    ),
    en_piso as (
      -- La primera vez que la prenda estuvo en el piso de esta tienda, sin tope de fechas: un movimiento que la puso ahí o que la
      -- sacó de ahí (bajarla del almacén, entrar directo al piso, venderla, un cambio, un conteo en el piso). Por los mismos índices
      -- de la tienda que usan `llegadas` y `primer_ingreso`.
      select x.variante_id, min(x.en) as en
      from (
        select m.variante_id, m.created_at as en
        from retail.movimientos m
        where m.ubicacion_id = p_ubicacion_id
          and m.sububicacion_id in (select id from pisos)
        union all
        select m.variante_id, m.created_at
        from retail.movimientos m
        where m.ubicacion_destino_id = p_ubicacion_id
          and m.sububicacion_destino_id in (select id from pisos)
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
             -- Días en el piso sin venderse (20261007120000): desde la última venta o desde que salió al piso, lo que pasó después;
             -- NULL si nunca salió al piso (eso lo muestra la pestaña «Nunca salió al piso», no «No se vende»).
             case
               when sp.salio is not null then greatest(v_hoy - greatest(coalesce(s.ultima_venta, sp.salio), sp.salio), 0)
             end as dias_sin_vender,
             sp.salio as salio_al_piso,
             -- La última venta en la tienda, sin tope de fechas (20261010120000): con ella la web cuenta los días sin venderse del MODELO.
             s.ultima_venta,
             (pi.en at time zone 'America/Lima')::date as llego,
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
      left join en_piso ep on ep.variante_id = u.variante_id
      cross join lateral (
        -- Cuándo salió al piso: su primer movimiento en un piso de la tienda o su primera venta, lo que fue antes (si se vendió,
        -- alguien la vio). Si hoy está colgada sin ninguno de los dos (un dato viejo sin lugar), desde que llegó.
        select coalesce(least((ep.en at time zone 'America/Lima')::date, s.primera_venta),
                        case when coalesce(e.piso, 0) > 0 then coalesce((pi.en at time zone 'America/Lima')::date, v_hoy) end) as salio
      ) sp
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
                 'salio_al_piso', f.salio_al_piso,
                 'ultima_venta', f.ultima_venta,
                 'llego', f.llego,
                 'llegaron_30', f.llegaron_30,
                 'vendidas_de_llegadas_30', f.vendidas_de_llegadas_30)
               order by f.nombre, f.color, f.talla, f.variante_id)
        from filas f), '[]'::jsonb)
    )
  );
end;
$$;

comment on function retail.fn_analisis_sede(uuid) is
  'ADR-0357 (Análisis v4): las prendas de UNA tienda con algo que decir (libres, vendidas en 8 semanas, llegadas en 30 días o en '
  'camino), en un jsonb: nombre, color, talla, categoría, foto, precio y costo, origen (fn_origen_producto), lo libre en piso y '
  'almacén (fn_existencias_base), lo vendido en 30 días y en 8 semanas, cuándo llegó y cuándo salió al piso (NULL: nunca salió), '
  'los días en el piso sin venderse (NULL si nunca salió), lo que llegó en 30 días (fn_es_llegada) y cuánto de eso se vendió, y de '
  'cada 100 líneas vendidas en 30 días cuántas llevaron rebaja. Cuenta lo vendido como fn_piso_plan_lectura. Puertas: '
  'fn_tiene_acceso_retail() y fn_puede_analizar(), sin pedir operar la sede (decisión 8). Sin ellas, NULL. Solo lectura. '
  'Salió al piso y días desde el piso: 20261007120000. Última venta (para medir el modelo entero): 20261010120000.';

revoke all on function retail.fn_analisis_sede(uuid) from public, anon;
grant execute on function retail.fn_analisis_sede(uuid) to authenticated, service_role;

reset lock_timeout;
