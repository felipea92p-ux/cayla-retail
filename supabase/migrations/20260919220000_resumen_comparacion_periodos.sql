-- ============================================================================
-- Resumen de Inventario · comparación de DOS períodos, A contra B (ADR-0138)
--
-- QUÉ RESPONDE. «¿Qué cambió entre estos dos períodos y en qué productos?». Para
-- cada variante de UNA sede devuelve, por período, los números crudos: unidades
-- vendidas y devueltas, importe y costo de lo vendido, stock al INICIO y al CIERRE
-- y días con stock. No decide nada: cobertura, rotación, señales e interpretación
-- viven en apps/web/lib/resumen-comparacion.ts (el mismo reparto de
-- `fn_resumen_variantes`, ADR-0101: la base trae números, el TypeScript decide).
--
-- POR QUÉ UNA FUNCIÓN NUEVA Y NO AMPLIAR `fn_resumen_variantes`. Aquella solo
-- conoce el stock de HOY y el del inicio de SU ventana; comparar dos períodos exige
-- el stock al cierre de cada uno, y agregarle columnas obliga a eliminarla y
-- recrearla (ya está en producción y la usa la pantalla actual). Esta es aditiva:
-- nada existente cambia de forma.
--
-- STOCK AL INICIO / AL CIERRE. `stock` es el saldo de hoy; el ledger (`movimientos`)
-- dice cómo se llegó. El saldo en el instante t es el saldo de hoy menos todo lo
-- que se movió desde t (misma reconstrucción de ADR-0113: cada movimiento mueve
-- cantidades entre «cubetas» tal como `fn_aplicar_movimiento`). Aquí «stock» es lo
-- UTILIZABLE de la sede (piso + almacén donde hay separación; todo lo no dañado
-- donde no), igual que la cobertura de la pantalla actual. Inicio de un período =
-- 00:00 de Lima de su primer día; cierre = 00:00 del día siguiente a su último día
-- (o ahora, si el período llega hasta hoy). Nunca se deduce restando ventas: el
-- stock también cambia por recepciones, devoluciones, traslados y ajustes.
--
-- DÍAS CON STOCK. Los días (con decimales) en que la prenda estuvo EN VENTA dentro
-- de cada período (piso > 0 donde hay separación) — el denominador canónico de la
-- velocidad (ADR-0121). Si el saldo reconstruido da negativo en algún tramo es que
-- `stock` y el ledger no cuadran (alguien escribió stock sin movimiento): se avisa
-- con `ledger_consistente = false` y la capa TS no se fía de lo reconstruido.
--
-- DEMANDA, IMPORTE Y COSTO. Igual que `fn_resumen_variantes` (por FK y estado real,
-- no por el texto de `motivo`): suma la salida de una venta 'completada' y la de
-- un cambio; resta la devolución que NO fue a cuarentena y la entrada de un cambio.
-- El IMPORTE es lo que efectivamente cobró la línea (precio − descuento). Un cambio
-- aporta exactamente su diferencia de precio. Importe neto de devoluciones, nunca negativo.
--
-- COSTO DE LO VENDIDO (COGS). Se devuelve en sus COMPONENTES —costo de las unidades
-- vendidas y costo de las devueltas—, no ya restado: quien junta dos períodos (Desempeño
-- suma dos mitades) debe restar sobre el TOTAL; una devolución de la 2.ª mitad de algo
-- vendido en la 1.ª, restada mitad por mitad, se perdería. La fuente es la transacción:
-- `venta_items.costo_unitario`, que `registrar_venta` fija con el costo de la variante ESE
-- día (nunca el de hoy); una devolución usa el costo de la línea que devuelve. Un costo 0
-- es «no había costo»: NO se inventa uno, se cuenta en `*_uds_sin_costo` (unidades
-- vendidas o devueltas a las que ninguna fuente dio costo) y la capa TS declara el COGS
-- no confiable (rotación N/D). Un cambio o una importación histórica sin línea de venta no
-- tienen costo guardado: se usa el costo actual de la prenda, que es lo único que hay.
--
-- ENTRADAS. Lo que llegó DE AFUERA a la sede en cada período (recepción de compra o lote, producción,
-- traslado recibido, carga inicial: el mismo criterio de `flujo` en `fn_resumen_variantes`). Con el stock
-- al inicio es la base del sell-through: ventas netas ÷ (stock al inicio + entradas).
--
-- SEGURIDAD. security definer; solo un LÍDER que pueda operar la sede recibe filas
-- (costo e importe son datos de líder); `revoke` de public y anon (los default
-- privileges de Supabase dan EXECUTE a anon).
-- ============================================================================

-- La forma de salida cambió respecto de la primera versión de este archivo (columnas `*_entradas`). La
-- función todavía no está en producción, así que se recrea limpia: Postgres no deja cambiar el tipo de
-- retorno con `create or replace`.
drop function if exists retail.fn_resumen_comparacion(uuid, date, date, date, date);

create or replace function retail.fn_resumen_comparacion(
  p_ubicacion_id uuid,
  p_a_desde date,
  p_a_hasta date,
  p_b_desde date,
  p_b_hasta date
)
returns table (
  variante_id uuid,
  producto_id uuid,
  referencia text,
  categoria_id uuid,
  categoria_nombre text,
  producto_estado text,
  producto_codigo text,
  sku text,
  codigo text,
  codigos_barras text[],
  talla text,
  color_codigo text,
  color_nombre text,
  color_hex text,
  costo numeric,
  estado_costo text,
  ledger_consistente boolean,
  -- Período A
  a_ventas integer,
  a_devoluciones integer,
  a_importe numeric,
  a_costo_ventas numeric,
  a_costo_devoluciones numeric,
  a_uds_sin_costo integer,
  a_entradas integer,
  a_stock_inicio integer,
  a_stock_cierre integer,
  a_dias_con_stock numeric,
  -- Período B
  b_ventas integer,
  b_devoluciones integer,
  b_importe numeric,
  b_costo_ventas numeric,
  b_costo_devoluciones numeric,
  b_uds_sin_costo integer,
  b_entradas integer,
  b_stock_inicio integer,
  b_stock_cierre integer,
  b_dias_con_stock numeric
)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
with params as (
  select (now() at time zone 'America/Lima')::date as hoy,
         '22222222-2222-4222-8222-222222222222'::uuid as centinela
),
fechas as (
  -- Fechas de Lima, ambos extremos incluidos. Un período no pasa de hoy ni se va
  -- más atrás de 730 días: la reconstrucción recorre el ledger desde el inicio del
  -- más antiguo, y un rango absurdo no debe convertir una pantalla en un barrido de años.
  select
    greatest(least(p_a_desde, p_a_hasta, p.hoy), p.hoy - 730) as a_desde,
    least(greatest(p_a_desde, p_a_hasta), p.hoy) as a_hasta,
    greatest(least(p_b_desde, p_b_hasta, p.hoy), p.hoy - 730) as b_desde,
    least(greatest(p_b_desde, p_b_hasta), p.hoy) as b_hasta
  from params p
),
ventana as (
  select
    (f.a_desde::timestamp at time zone 'America/Lima') as a_ini,
    least(now(), ((greatest(f.a_hasta, f.a_desde) + 1)::timestamp at time zone 'America/Lima')) as a_fin,
    (f.b_desde::timestamp at time zone 'America/Lima') as b_ini,
    least(now(), ((greatest(f.b_hasta, f.b_desde) + 1)::timestamp at time zone 'America/Lima')) as b_fin,
    least((f.a_desde::timestamp at time zone 'America/Lima'), (f.b_desde::timestamp at time zone 'America/Lima')) as t0
  from fechas f
),
permiso as (
  select fn_puede_operar_ubicacion(p_ubicacion_id) and fn_es_lider() as ok
),
ub as (
  select u.id,
    exists (
      select 1 from sububicaciones su
      where su.ubicacion_id = u.id and su.tipo in ('piso_venta', 'almacen_tienda')
    ) as separa
  from ubicaciones u
  where u.id = p_ubicacion_id and u.activo
),
costo_hist as (
  -- Cadena oficial de costos por variante: cada fila debe partir del costo con
  -- que terminó la anterior; si no, alguien lo movió por fuera entre medio.
  select h.variante_id, count(*) as n,
    (array_agg(h.costo_resultante order by h.created_at desc, h.id desc))[1] as ultimo,
    coalesce(bool_or(h.previo is not null and h.costo_anterior is distinct from h.previo), false) as cadena_rota
  from (
    select ch.*, lag(ch.costo_resultante) over (partition by ch.variante_id order by ch.created_at, ch.id) as previo
    from costo_historial ch
  ) h
  group by h.variante_id
),
costo_editado as (
  select distinct hc.entidad_id as variante_id
  from historial_producto_cambios hc
  where hc.entidad = 'variante' and hc.campo = 'costo'
),
universo as (
  -- Mismo universo que `fn_resumen_variantes`: variante activa, sin el centinela.
  select v.id as variante_id, v.producto_id, p.referencia, c.id as categoria_id, c.nombre as categoria_nombre,
    p.estado as producto_estado, p.codigo as producto_codigo,
    v.sku, v.codigo, ta.valor as talla, v.color_codigo, co.nombre as color_nombre, co.hex as color_hex,
    barras.codigos as codigos_barras,
    v.precio as precio_valor,
    v.costo as costo_valor,
    case
      when v.costo is null or v.costo <= 0 then 'sin_costo'
      when chi.variante_id is not null then
        case when v.costo is distinct from chi.ultimo or chi.cadena_rota then 'alterado' else 'oficial' end
      when ced.variante_id is not null then 'alterado'
      else 'declarado'
    end as costo_estado
  from variantes v
  join productos p on p.id = v.producto_id
  left join categorias c on c.id = p.categoria_id
  left join tallas ta on ta.id = v.talla_id
  left join colores co on co.codigo = v.color_codigo
  left join costo_hist chi on chi.variante_id = v.id
  left join costo_editado ced on ced.variante_id = v.id
  left join lateral (
    select array_agg(cb.codigo order by cb.codigo) as codigos
    from codigos_barras cb
    where cb.variante_id = v.id
  ) barras on true
  where v.activo
    and v.id <> (select centinela from params)
),
actual as (
  -- El saldo de hoy en ESTA sede: lo «utilizable» (lo que cuenta para la cobertura)
  -- y lo «en venta» (lo que el POS puede vender: el piso donde hay separación).
  select s.variante_id,
    case when ub.separa
      then coalesce(sum(s.cantidad) filter (where su.tipo in ('piso_venta', 'almacen_tienda')), 0)
      else coalesce(sum(s.cantidad) filter (where su.tipo is distinct from 'cuarentena'), 0) end::integer as utilizable,
    case when ub.separa
      then coalesce(sum(s.cantidad) filter (where su.tipo = 'piso_venta'), 0)
      else coalesce(sum(s.cantidad) filter (where su.tipo is distinct from 'cuarentena'), 0) end::integer as en_venta
  from stock s
  left join sububicaciones su on su.id = s.sububicacion_id
  cross join ub
  where s.ubicacion_id = p_ubicacion_id
    and s.variante_id <> (select centinela from params)
  group by s.variante_id, ub.separa
),
-- ---------------------------------------------------------------------------
-- Reconstrucción del saldo sobre el ledger (ADR-0113), solo de esta sede.
-- ---------------------------------------------------------------------------
efectos as (
  -- Una fila por cubeta afectada: entrada +c, salida −c, ajuste +c (con signo) en
  -- (sede, sub); el traslado resta en el origen y suma en el destino.
  select e.variante_id, e.created_at, e.id, e.delta, su.tipo as sub_tipo
  from (
    select m.variante_id, m.sububicacion_id, m.created_at, m.id,
      case m.tipo when 'entrada' then m.cantidad when 'salida' then -m.cantidad
                  when 'ajuste' then m.cantidad when 'traslado' then -m.cantidad end as delta
    from movimientos m
    where m.ubicacion_id = p_ubicacion_id
      and m.created_at >= (select t0 from ventana)
      and m.tipo in ('entrada', 'salida', 'ajuste', 'traslado')
      and m.variante_id <> (select centinela from params)
    union all
    select m.variante_id, m.sububicacion_destino_id, m.created_at, m.id, m.cantidad
    from movimientos m
    where m.ubicacion_destino_id = p_ubicacion_id
      and m.created_at >= (select t0 from ventana)
      and m.tipo = 'traslado'
      and m.variante_id <> (select centinela from params)
  ) e
  left join sububicaciones su on su.id = e.sububicacion_id
  where e.delta <> 0
),
efectos_clase as (
  select ef.variante_id, ef.created_at, ef.id,
    -- Cubeta «en venta»: piso donde hay separación; todo lo no dañado en el resto.
    case when ub.separa
         then case when ef.sub_tipo = 'piso_venta' then ef.delta else 0 end
         else case when ef.sub_tipo is distinct from 'cuarentena' then ef.delta else 0 end end as d_venta,
    -- Cubeta «utilizable»: piso + almacén donde hay separación; todo lo no dañado en el resto.
    case when ub.separa
         then case when ef.sub_tipo in ('piso_venta', 'almacen_tienda') then ef.delta else 0 end
         else case when ef.sub_tipo is distinct from 'cuarentena' then ef.delta else 0 end end as d_util
  from efectos ef
  cross join ub
),
movido as (
  -- Lo utilizable que se movió desde cada instante: saldo(t) = saldo de hoy − esto.
  select ec.variante_id,
    coalesce(sum(ec.d_util) filter (where ec.created_at >= w.a_ini), 0) as desde_a_ini,
    coalesce(sum(ec.d_util) filter (where ec.created_at >= w.a_fin), 0) as desde_a_fin,
    coalesce(sum(ec.d_util) filter (where ec.created_at >= w.b_ini), 0) as desde_b_ini,
    coalesce(sum(ec.d_util) filter (where ec.created_at >= w.b_fin), 0) as desde_b_fin
  from efectos_clase ec
  cross join ventana w
  group by ec.variante_id
),
mov_par as (
  -- Un movimiento puede tocar dos cubetas de la sede (piso↔almacén): se suma por
  -- movimiento para que no haya empates de orden.
  select ec.variante_id, ec.created_at, ec.id, sum(ec.d_venta) as d
  from efectos_clase ec
  group by ec.variante_id, ec.created_at, ec.id
  having sum(ec.d_venta) <> 0
),
s_inicio as (
  -- Saldo «en venta» en t0 = saldo de hoy − todo lo movido desde t0.
  select mp.variante_id, coalesce(max(ac.en_venta), 0) - sum(mp.d) as s_start
  from mov_par mp
  left join actual ac on ac.variante_id = mp.variante_id
  group by mp.variante_id
),
puntos as (
  select si.variante_id, (select t0 from ventana) as ts, 0 as ord, null::uuid as oid, si.s_start as nivel
  from s_inicio si
  union all
  select mp.variante_id, mp.created_at, 1, mp.id,
    si.s_start + sum(mp.d) over (partition by mp.variante_id order by mp.created_at, mp.id)
  from mov_par mp
  join s_inicio si on si.variante_id = mp.variante_id
),
intervalos as (
  select pt.variante_id, pt.nivel, pt.ts as inicio,
    coalesce(lead(pt.ts) over (partition by pt.variante_id order by pt.ts, pt.ord, pt.oid), now()) as fin
  from puntos pt
),
dias_par as (
  select i.variante_id,
    coalesce(sum(extract(epoch from greatest(least(i.fin, w.a_fin) - greatest(i.inicio, w.a_ini), interval '0')))
      filter (where i.nivel > 0), 0) / 86400.0 as dias_a,
    coalesce(sum(extract(epoch from greatest(least(i.fin, w.b_fin) - greatest(i.inicio, w.b_ini), interval '0')))
      filter (where i.nivel > 0), 0) / 86400.0 as dias_b,
    -- Tramos de duración cero (varios movimientos en el mismo instante) no cuentan:
    -- el orden interno de una transacción no es observable.
    coalesce(bool_and(i.nivel >= 0) filter (where i.fin > i.inicio), true) as consistente
  from intervalos i
  cross join ventana w
  group by i.variante_id
),
-- ---------------------------------------------------------------------------
-- Demanda, importe y costo de lo vendido, de esta sede.
-- ---------------------------------------------------------------------------
demanda_base as (
  select
    m.variante_id,
    m.cantidad,
    m.created_at,
    case
      -- Con venta_item_id manda el estado real de la venta (una anulada no cuenta).
      -- Sin venta_item_id (importación histórica que solo cargó el ledger) el motivo
      -- 'venta' alcanza: mejor contar la historia que fingir que no vendió nada.
      when m.tipo = 'salida' and m.motivo = 'venta' and (m.venta_item_id is null or ve.estado = 'completada') then 'venta'
      when m.tipo = 'salida' and m.cambio_id is not null then 'venta'
      when m.tipo = 'entrada' and m.devolucion_item_id is not null and su.tipo is distinct from 'cuarentena' then 'devolucion'
      when m.tipo = 'entrada' and m.cambio_id is not null then 'devolucion'
    end as clase,
    case
      when m.devolucion_item_id is not null then coalesce(ve_dev.ubicacion_id, m.ubicacion_id)
      when m.cambio_id is not null and m.tipo = 'entrada' then coalesce(ve_cam.ubicacion_id, m.ubicacion_id)
      else m.ubicacion_id
    end as ubicacion_id,
    -- Lo que cobró la línea que originó el movimiento (precio − descuento). Un cambio
    -- suma su diferencia de precio a la prenda que se llevó y resta lo cobrado a la
    -- que volvió: neto = la diferencia, que es lo que la clienta realmente puso.
    case
      when m.tipo = 'salida' and m.venta_item_id is not null then m.cantidad * (vi.precio_unitario - vi.descuento_unitario)
      when m.tipo = 'salida' and m.cambio_id is not null then m.cantidad * (vi_cam.precio_unitario - vi_cam.descuento_unitario) + coalesce(ca.diferencia, 0)
      when m.tipo = 'salida' then m.cantidad * coalesce(v.precio, 0)
      when m.devolucion_item_id is not null then m.cantidad * (vi_dev.precio_unitario - vi_dev.descuento_unitario)
      when m.cambio_id is not null then m.cantidad * (vi_cam.precio_unitario - vi_cam.descuento_unitario)
      else 0
    end as importe,
    -- Costo unitario que RECONOCIÓ la transacción: el de la línea de venta (el de ese día) o, en una
    -- devolución, el de la línea que se devuelve. NULL = ninguna fuente lo dio (un 0 guardado es «no
    -- había costo»). Un cambio o una importación sin línea solo tienen el costo actual de la prenda.
    case
      when m.tipo = 'salida' and m.venta_item_id is not null then nullif(vi.costo_unitario, 0)
      when m.tipo = 'salida' then nullif(v.costo, 0)
      when m.devolucion_item_id is not null then nullif(vi_dev.costo_unitario, 0)
      when m.cambio_id is not null then nullif(vi_cam.costo_unitario, 0)
    end as costo_unit
  from movimientos m
  join variantes v on v.id = m.variante_id
  left join venta_items vi on vi.id = m.venta_item_id
  left join ventas ve on ve.id = vi.venta_id
  left join devolucion_items di on di.id = m.devolucion_item_id
  left join venta_items vi_dev on vi_dev.id = di.venta_item_id
  left join ventas ve_dev on ve_dev.id = vi_dev.venta_id
  left join cambios ca on ca.id = m.cambio_id
  left join venta_items vi_cam on vi_cam.id = ca.venta_item_id
  left join ventas ve_cam on ve_cam.id = vi_cam.venta_id
  left join sububicaciones su on su.id = m.sububicacion_id
  where m.created_at >= (select t0 from ventana)
    and m.variante_id <> (select centinela from params)
    and (m.venta_item_id is not null or m.cambio_id is not null or m.devolucion_item_id is not null
         or (m.tipo = 'salida' and m.motivo = 'venta'))
),
demanda_filas as (
  select b.*,
    b.cantidad * coalesce(b.costo_unit, 0) as costo_total,
    (b.costo_unit is null) as sin_costo
  from demanda_base b
),
demanda as (
  select d.variante_id,
    coalesce(sum(d.cantidad) filter (where d.clase = 'venta' and d.created_at >= w.a_ini and d.created_at < w.a_fin), 0)::integer as a_ventas,
    coalesce(sum(d.cantidad) filter (where d.clase = 'devolucion' and d.created_at >= w.a_ini and d.created_at < w.a_fin), 0)::integer as a_devoluciones,
    greatest(
      coalesce(sum(d.importe) filter (where d.clase = 'venta' and d.created_at >= w.a_ini and d.created_at < w.a_fin), 0)
      - coalesce(sum(d.importe) filter (where d.clase = 'devolucion' and d.created_at >= w.a_ini and d.created_at < w.a_fin), 0), 0) as a_importe,
    coalesce(sum(d.costo_total) filter (where d.clase = 'venta' and d.created_at >= w.a_ini and d.created_at < w.a_fin), 0) as a_costo_ventas,
    coalesce(sum(d.costo_total) filter (where d.clase = 'devolucion' and d.created_at >= w.a_ini and d.created_at < w.a_fin), 0) as a_costo_devoluciones,
    coalesce(sum(d.cantidad) filter (where d.sin_costo and d.created_at >= w.a_ini and d.created_at < w.a_fin), 0)::integer as a_uds_sin_costo,
    coalesce(sum(d.cantidad) filter (where d.clase = 'venta' and d.created_at >= w.b_ini and d.created_at < w.b_fin), 0)::integer as b_ventas,
    coalesce(sum(d.cantidad) filter (where d.clase = 'devolucion' and d.created_at >= w.b_ini and d.created_at < w.b_fin), 0)::integer as b_devoluciones,
    greatest(
      coalesce(sum(d.importe) filter (where d.clase = 'venta' and d.created_at >= w.b_ini and d.created_at < w.b_fin), 0)
      - coalesce(sum(d.importe) filter (where d.clase = 'devolucion' and d.created_at >= w.b_ini and d.created_at < w.b_fin), 0), 0) as b_importe,
    coalesce(sum(d.costo_total) filter (where d.clase = 'venta' and d.created_at >= w.b_ini and d.created_at < w.b_fin), 0) as b_costo_ventas,
    coalesce(sum(d.costo_total) filter (where d.clase = 'devolucion' and d.created_at >= w.b_ini and d.created_at < w.b_fin), 0) as b_costo_devoluciones,
    coalesce(sum(d.cantidad) filter (where d.sin_costo and d.created_at >= w.b_ini and d.created_at < w.b_fin), 0)::integer as b_uds_sin_costo
  from demanda_filas d
  cross join ventana w
  where d.clase is not null
    and d.ubicacion_id = p_ubicacion_id
  group by d.variante_id
),
entradas as (
  -- Lo que llegó de afuera a esta sede en cada período (criterio de `flujo`, ADR-0113).
  select m.variante_id,
    coalesce(sum(m.cantidad) filter (where m.created_at >= w.a_ini and m.created_at < w.a_fin), 0)::integer as a_entradas,
    coalesce(sum(m.cantidad) filter (where m.created_at >= w.b_ini and m.created_at < w.b_fin), 0)::integer as b_entradas
  from movimientos m
  cross join ventana w
  where m.ubicacion_id = p_ubicacion_id
    and m.created_at >= w.t0
    and m.tipo = 'entrada'
    and (m.lote_id is not null or m.produccion_id is not null or m.transferencia_recepcion_id is not null or m.motivo = 'carga_inicial')
    and m.variante_id <> (select centinela from params)
  group by m.variante_id
),
base as (
  select u.*,
    -- Saldo reconstruido (sin recortar a 0: un negativo es la señal de que el ledger no cuadra).
    coalesce(ac.utilizable, 0) - coalesce(mo.desde_a_ini, 0) as a_ini_raw,
    coalesce(ac.utilizable, 0) - coalesce(mo.desde_a_fin, 0) as a_fin_raw,
    coalesce(ac.utilizable, 0) - coalesce(mo.desde_b_ini, 0) as b_ini_raw,
    coalesce(ac.utilizable, 0) - coalesce(mo.desde_b_fin, 0) as b_fin_raw,
    coalesce(dp.consistente, true) as dias_consistente,
    -- Días con stock: sin movimientos desde t0 el saldo fue constante = el de hoy,
    -- así que estuvo en venta la ventana entera o no estuvo nada.
    round(coalesce(dp.dias_a,
      case when coalesce(ac.en_venta, 0) > 0 then greatest(extract(epoch from (w.a_fin - w.a_ini)), 0) / 86400.0 else 0 end)::numeric, 3) as a_dias,
    round(coalesce(dp.dias_b,
      case when coalesce(ac.en_venta, 0) > 0 then greatest(extract(epoch from (w.b_fin - w.b_ini)), 0) / 86400.0 else 0 end)::numeric, 3) as b_dias,
    de.a_ventas, de.a_devoluciones, de.a_importe, de.a_costo_ventas, de.a_costo_devoluciones, de.a_uds_sin_costo,
    de.b_ventas, de.b_devoluciones, de.b_importe, de.b_costo_ventas, de.b_costo_devoluciones, de.b_uds_sin_costo,
    en.a_entradas, en.b_entradas
  from universo u
  cross join ventana w
  left join actual ac on ac.variante_id = u.variante_id
  left join movido mo on mo.variante_id = u.variante_id
  left join dias_par dp on dp.variante_id = u.variante_id
  left join demanda de on de.variante_id = u.variante_id
  left join entradas en on en.variante_id = u.variante_id
)
select
  b.variante_id, b.producto_id, b.referencia, b.categoria_id, b.categoria_nombre,
  b.producto_estado, b.producto_codigo, b.sku, b.codigo, coalesce(b.codigos_barras, '{}'::text[]),
  b.talla, b.color_codigo, b.color_nombre, b.color_hex,
  b.costo_valor, b.costo_estado,
  (b.dias_consistente and least(b.a_ini_raw, b.a_fin_raw, b.b_ini_raw, b.b_fin_raw) >= 0),
  coalesce(b.a_ventas, 0), coalesce(b.a_devoluciones, 0), round(coalesce(b.a_importe, 0), 2), round(coalesce(b.a_costo_ventas, 0), 2), round(coalesce(b.a_costo_devoluciones, 0), 2), coalesce(b.a_uds_sin_costo, 0), coalesce(b.a_entradas, 0),
  greatest(b.a_ini_raw, 0)::integer, greatest(b.a_fin_raw, 0)::integer, b.a_dias,
  coalesce(b.b_ventas, 0), coalesce(b.b_devoluciones, 0), round(coalesce(b.b_importe, 0), 2), round(coalesce(b.b_costo_ventas, 0), 2), round(coalesce(b.b_costo_devoluciones, 0), 2), coalesce(b.b_uds_sin_costo, 0), coalesce(b.b_entradas, 0),
  greatest(b.b_ini_raw, 0)::integer, greatest(b.b_fin_raw, 0)::integer, b.b_dias
from base b
where (select ok from permiso)
  and exists (select 1 from ub)
  -- Solo lo que tuvo que ver con la sede en alguno de los dos períodos: tuvo stock
  -- en algún borde o se vendió/devolvió. Una variante que no pisó la sede no es ruido.
  and (greatest(b.a_ini_raw, b.a_fin_raw, b.b_ini_raw, b.b_fin_raw) > 0
       or coalesce(b.a_ventas, 0) + coalesce(b.a_devoluciones, 0) + coalesce(b.b_ventas, 0) + coalesce(b.b_devoluciones, 0) > 0)
-- Orden estable (variante_id al final) porque el cliente pagina con Range:
-- PostgREST corta en max_rows (1.000) sin avisar.
order by b.referencia, b.color_nombre, b.talla, b.variante_id;
$$;

comment on function retail.fn_resumen_comparacion(uuid, date, date, date, date) is
  'Comparación de dos períodos (A y B) para una sede: por variante, unidades vendidas y devueltas, importe, costo de lo vendido y de lo devuelto (COGS en componentes), unidades sin costo, entradas, stock utilizable al inicio y al cierre reconstruido del ledger y días con stock. Solo líderes. No decide nada: las reglas viven en apps/web/lib/resumen-comparacion.ts. Ver ADR-0138 y ADR-0113.';

revoke all on function retail.fn_resumen_comparacion(uuid, date, date, date, date) from public, anon;
grant execute on function retail.fn_resumen_comparacion(uuid, date, date, date, date) to authenticated;
