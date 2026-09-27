-- ============================================================================
-- Análisis comercial: piso vs. almacén (2026-09-24, pedido de Felipe)
--
-- QUÉ AGREGA. Extiende `fn_resumen_comparacion` (ADR-0138) — la misma función que ya alimenta
-- Desempeño Y Comparar períodos — con lo que hace falta para separar dos preguntas que hoy se
-- contestan con el mismo número:
--   A) COMPORTAMIENTO COMERCIAL — «¿cómo responde la variante cuando está en el piso?» (piso solo)
--   B) GESTIÓN DEL INVENTARIO TOTAL — «¿cuánto inventario mantengo para producir esas ventas?»
--      (piso + almacén)
-- No decide nada nuevo: sigue siendo números crudos. La interpretación (rotación, sell-through de
-- exposición, «sin venta», lectura del período) vive en TypeScript — mismo reparto de siempre
-- (ADR-0101/0113/0138).
--
-- LOS TRES AGREGADOS NUEVOS, por período (A y B):
--
-- 1. PROMEDIO PONDERADO POR TIEMPO, piso y total. Hoy `rotacion.ts` promedia (inicio + cierre) ÷ 2
--    a falta de algo mejor — y lo dice explícito en su propio comentario, con el punto de sustitución
--    ya construido: `BaseRotacion.inventarioPromedioTemporal`. Acá se calcula ESE número: se clona el
--    mismo mecanismo que ya reconstruye «días con stock» (`efectos_clase`/`mov_par`/`puntos`/
--    `intervalos`/`dias_par`, más abajo), pero en vez de sumar SOLO la duración con nivel > 0, se
--    integra nivel × duración (el área bajo la curva de stock) y se divide por la duración total del
--    período — una vez para la cubeta «piso» (`d_venta`, ya existía) y una vez más para «total»
--    (`d_util`, ya existía pero antes solo se miraba en dos instantes, nunca a lo largo del tiempo).
--    Ninguna fórmula de rotación cambia: solo se le da un promedio mejor a la que ya existe.
--
-- 2. EVENTOS DE PISO (`piso_eventos`, jsonb). El sell-through de exposición (cohortes: una reposición
--    reciente no puede penalizar el sell-through si todavía no tuvo VENTANA_MADUREZ_DIAS para
--    venderse — constante en `inventario-reglas.ts`, `SELL_THROUGH_EXPOSURE_WINDOW_DAYS`) es lo único
--    de todo el pedido que es un problema de SECUENCIA (FIFO), no de agregación. Hacerlo en SQL con
--    funciones de ventana lo vuelve imposible de testear con los mismos `describe/it` que ya usa
--    `resumen-reglas.test.ts` (656 líneas, cero tests en SQL). Por eso acá solo se expone la lista
--    ORDENADA de eventos que afectan el piso —el mismo delta `d_venta` de siempre, uno por movimiento,
--    más un evento sintético al inicio de la ventana con el saldo que ya traía (`s_inicio`, que ya se
--    calculaba)—, cada uno con `esVenta` (una venta real o un cambio, NUNCA un traslado/ajuste/
--    movimiento interno) para que el FIFO no cuente un piso→almacén→piso como venta (pedido de Felipe,
--    caso G). El FIFO en sí se resuelve en `apps/web/lib/resumen-exposicion.ts`, con tests.
--
-- 3. ÚLTIMA VENTA Y EXPOSICIÓN DESDE ENTONCES (`ultima_venta_en`, `piso_expuesto_desde_ultima_venta_dias`).
--    «Sin venta» (sección 11 del pedido) NO son días de calendario: son días con stock en PISO desde la
--    última venta. Se resuelve con el mismo mecanismo de `intervalos` (piso), pero acotado entre la
--    última venta detectada (dentro de la ventana ya reconstruida, `t0` a hoy) y ahora — no entre los
--    bordes fijos del período A/B. Sin ninguna venta en la ventana, `ultima_venta_en` es null y el
--    conteo corre desde `t0`: es la exposición que el historial disponible permite ver, ni más ni menos
--    (si `t0` topó en los 730 días, en algún momento puede no alcanzar — se documenta, no se disimula).
--
-- QUÉ NO CAMBIA. Ninguna columna existente se toca ni se renombra: todo lo de arriba se agrega al final
-- de `returns table`. La función sigue siendo aditiva, mismo criterio que su propio encabezado original
-- («por qué una función nueva y no ampliar fn_resumen_variantes»): agregar columnas obliga a recrearla
-- (Postgres no deja cambiar el tipo de retorno con `create or replace`), así que se hace `drop` +
-- recreate con el cuerpo COMPLETO —no hay una forma de "solo agregar una columna" en una función SQL—,
-- pero el cuerpo existente no cambia ni una línea salvo donde se aclara abajo.
-- ============================================================================

-- «Es VENTA COMERCIAL» de un movimiento de stock (decisión de Felipe, 2026-09-24, sección 1): UNA sola
-- fuente para `efectos` (piso, más abajo) y `demanda_base` (Vendido comercial/Ritmo/Sell-through/Rotación/
-- Tendencia) — antes cada una repetía su propia versión del criterio. Deliberadamente NO incluye
-- `cuarentena_liquidada`: una liquidación de prenda dañada es una salida contable real (mueve stock, genera
-- ingreso si corresponde, conserva su trazabilidad en `ventas`/`venta_items`, INTACTA) pero no es demanda
-- comercial — Felipe fue explícito: "no quiero que liquidar mercancía dañada haga parecer que aumentó la
-- demanda normal de una variante". `demanda_base`, más abajo, la clasifica aparte (`clase = 'liquidacion_danada'`)
-- para que quede fuera de los dos únicos `clase` que `demanda` suma (`'venta'`/`'devolucion'`) sin que dependa
-- de una coincidencia silenciosa — es una categoría real, no una ausencia.
create or replace function retail.fn_es_venta_de_stock(p_tipo text, p_motivo text, p_cambio_id uuid, p_venta_item_id uuid, p_venta_estado text)
returns boolean
language sql
immutable
as $$
  select p_tipo = 'salida' and (
    p_cambio_id is not null
    or (p_motivo = 'venta' and (p_venta_item_id is null or p_venta_estado = 'completada'))
  )
$$;

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
  b_dias_con_stock numeric,
  -- Comportamiento comercial vs. gestión de inventario (2026-09-24): NUEVO, desde acá.
  a_piso_promedio numeric,
  b_piso_promedio numeric,
  a_total_promedio numeric,
  b_total_promedio numeric,
  ultima_venta_en timestamptz,
  piso_expuesto_desde_ultima_venta_dias numeric,
  piso_eventos jsonb
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
  -- Quien tiene el módulo Análisis, no solo el líder (20260923130000, ADR-0161). Recrear esta función con
  -- `fn_es_lider()` le quitaba la pantalla a esos roles sin ningún error: pasó en producción al pegar este archivo, y lo arregló 20260925223000.
  select fn_puede_operar_ubicacion(p_ubicacion_id) and retail.fn_puede_analizar() as ok
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
  select s.variante_id,
    -- «Utilizable»/total es SIEMPRE "no es cuarentena", separe o no la sede piso/almacén — nunca depende
    -- de que la sububicación resuelva a un tipo conocido (ver el mismo criterio en `efectos_clase.d_util`,
    -- más abajo, y la razón: sección 17 del pedido de comportamiento comercial, 2026-09-24).
    coalesce(sum(s.cantidad) filter (where su.tipo is distinct from 'cuarentena'), 0)::integer as utilizable,
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
  -- `es_venta` (2026-09-24) distingue una VENTA real (o un cambio, mismo criterio que `demanda_base` más
  -- abajo, vía `fn_es_venta_de_stock` — una sola fuente) de cualquier otra salida del piso (traslado,
  -- ajuste, o un `mover_interno` hacia el almacén): el FIFO de cohortes de `resumen-exposicion.ts` necesita
  -- saber cuál es cuál para no contar un traslado interno como si fuera una venta (sección 8 del pedido de
  -- Felipe, caso G: piso → almacén → piso). `motivo` (2026-09-24, comportamiento comercial) viaja también:
  -- es la señal que distingue un regreso real desde almacén (`movimiento_interno`) de stock genuinamente
  -- nuevo, para el reloj de exposición con pausa/reanudación (sección 5 del pedido).
  select e.variante_id, e.created_at, e.id, e.delta, su.tipo as sub_tipo, e.es_venta, e.motivo
  from (
    select m.variante_id, m.sububicacion_id, m.created_at, m.id, m.motivo,
      case m.tipo when 'entrada' then m.cantidad when 'salida' then -m.cantidad
                  when 'ajuste' then m.cantidad when 'traslado' then -m.cantidad end as delta,
      retail.fn_es_venta_de_stock(m.tipo, m.motivo, m.cambio_id, m.venta_item_id, ve.estado) as es_venta
    from movimientos m
    left join venta_items vi on vi.id = m.venta_item_id
    left join ventas ve on ve.id = vi.venta_id
    where m.ubicacion_id = p_ubicacion_id
      and m.created_at >= (select t0 from ventana)
      and m.tipo in ('entrada', 'salida', 'ajuste', 'traslado')
      and m.variante_id <> (select centinela from params)
    union all
    select m.variante_id, m.sububicacion_destino_id, m.created_at, m.id, m.motivo, m.cantidad, false as es_venta
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
  select ef.variante_id, ef.created_at, ef.id, ef.es_venta, ef.motivo,
    case when ub.separa
         then case when ef.sub_tipo = 'piso_venta' then ef.delta else 0 end
         else case when ef.sub_tipo is distinct from 'cuarentena' then ef.delta else 0 end end as d_venta,
    -- «Utilizable»/total (2026-09-24): SIEMPRE "no es cuarentena", separe o no la sede piso/almacén —
    -- ANTES, cuando la sede separaba y `sub_tipo` no resolvía a un tipo conocido (NULL: un movimiento sin
    -- sububicacion_id, como la activación piso/almacén de producción del 2026-09-14), el movimiento
    -- quedaba en CERO en las dos cubetas — el total también, no solo el piso. Eso infla el total en
    -- cualquier ventana que incluya ese evento (711 unidades en AQP+TRU, verificado en la auditoría de
    -- dominio 2026-09-24) y contradice que el total deba poder reconstruirse aunque la separación
    -- piso/almacén no se pueda determinar para un movimiento puntual (sección 17 del pedido).
    case when ef.sub_tipo is distinct from 'cuarentena' then ef.delta else 0 end as d_util
  from efectos ef
  cross join ub
),
movido as (
  select ec.variante_id,
    coalesce(sum(ec.d_util) filter (where ec.created_at >= w.a_ini), 0) as desde_a_ini,
    coalesce(sum(ec.d_util) filter (where ec.created_at >= w.a_fin), 0) as desde_a_fin,
    coalesce(sum(ec.d_util) filter (where ec.created_at >= w.b_ini), 0) as desde_b_ini,
    coalesce(sum(ec.d_util) filter (where ec.created_at >= w.b_fin), 0) as desde_b_fin
  from efectos_clase ec
  cross join ventana w
  group by ec.variante_id
),
-- ---- Cubeta «piso» (d_venta): igual que antes, más el promedio ponderado por tiempo -----------------
mov_par as (
  -- `motivo` (2026-09-24): las dos piernas de un `mover_interno` comparten el mismo `id` y el mismo
  -- `motivo` ('movimiento_interno'), así que agruparlas no lo ambigua — cualquier agregado determinista
  -- (min) devuelve el único valor real.
  select ec.variante_id, ec.created_at, ec.id, sum(ec.d_venta) as d, bool_or(ec.es_venta) as es_venta, min(ec.motivo) as motivo
  from efectos_clase ec
  group by ec.variante_id, ec.created_at, ec.id
  having sum(ec.d_venta) <> 0
),
s_inicio as (
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
    coalesce(bool_and(i.nivel >= 0) filter (where i.fin > i.inicio), true) as consistente,
    -- NUEVO: área bajo la curva (nivel × duración clipeada), un CTE más abajo la divide por los días
    -- del período para tener el promedio. Mismo `intervalos`, otra agregación: no se recorre dos veces.
    coalesce(sum(i.nivel * extract(epoch from greatest(least(i.fin, w.a_fin) - greatest(i.inicio, w.a_ini), interval '0')))
      filter (where i.fin > i.inicio), 0) / 86400.0 as area_piso_a,
    coalesce(sum(i.nivel * extract(epoch from greatest(least(i.fin, w.b_fin) - greatest(i.inicio, w.b_ini), interval '0')))
      filter (where i.fin > i.inicio), 0) / 86400.0 as area_piso_b
  from intervalos i
  cross join ventana w
  group by i.variante_id
),
-- ---- Cubeta «total» (d_util): MISMO patrón que arriba, nunca antes integrado en el tiempo -----------
mov_par_util as (
  select ec.variante_id, ec.created_at, ec.id, sum(ec.d_util) as d
  from efectos_clase ec
  group by ec.variante_id, ec.created_at, ec.id
  having sum(ec.d_util) <> 0
),
s_inicio_util as (
  select mp.variante_id, coalesce(max(ac.utilizable), 0) - sum(mp.d) as s_start
  from mov_par_util mp
  left join actual ac on ac.variante_id = mp.variante_id
  group by mp.variante_id
),
puntos_util as (
  select si.variante_id, (select t0 from ventana) as ts, 0 as ord, null::uuid as oid, si.s_start as nivel
  from s_inicio_util si
  union all
  select mp.variante_id, mp.created_at, 1, mp.id,
    si.s_start + sum(mp.d) over (partition by mp.variante_id order by mp.created_at, mp.id)
  from mov_par_util mp
  join s_inicio_util si on si.variante_id = mp.variante_id
),
intervalos_util as (
  select pt.variante_id, pt.nivel, pt.ts as inicio,
    coalesce(lead(pt.ts) over (partition by pt.variante_id order by pt.ts, pt.ord, pt.oid), now()) as fin
  from puntos_util pt
),
area_util_par as (
  select i.variante_id,
    coalesce(sum(i.nivel * extract(epoch from greatest(least(i.fin, w.a_fin) - greatest(i.inicio, w.a_ini), interval '0')))
      filter (where i.fin > i.inicio), 0) / 86400.0 as area_total_a,
    coalesce(sum(i.nivel * extract(epoch from greatest(least(i.fin, w.b_fin) - greatest(i.inicio, w.b_ini), interval '0')))
      filter (where i.fin > i.inicio), 0) / 86400.0 as area_total_b
  from intervalos_util i
  cross join ventana w
  group by i.variante_id
),
-- ---- Eventos de piso, para el FIFO de cohortes en TypeScript (resumen-exposicion.ts) -----------------
-- El saldo con que arrancó la ventana (`s_inicio.s_start`) es la primera cohorte, fechada en `t0`; cada
-- movimiento real que ya afecta la cubeta «piso» (`mov_par.d`) es una cohorte (si suma) o consumo FIFO
-- (si resta) más. Una sola lista ordenada por variante: TypeScript no tiene que saber de `s_inicio` ni
-- de `mov_par`, solo de esta forma {ts, delta}.
piso_eventos_par as (
  -- `esMovimientoInterno` (2026-09-24, sección 5 del pedido — reloj de exposición con pausa/reanudación):
  -- true cuando el evento es un `mover_interno` piso↔almacén (`motivo = 'movimiento_interno'`) — la única
  -- señal real, sin inventar trazabilidad de unidad, para distinguir «esta cantidad REGRESA de almacén»
  -- (el reloj debe reanudarse, no reiniciarse) de «esta cantidad es stock genuinamente nuevo» (el reloj
  -- arranca en cero, correctamente). El saldo inicial no es un regreso conocido: arranca su propio reloj.
  select x.variante_id,
    jsonb_agg(jsonb_build_object('ts', x.ts, 'delta', x.delta, 'esVenta', x.es_venta, 'esMovimientoInterno', x.motivo = 'movimiento_interno') order by x.ts) as eventos
  from (
    select si.variante_id, (select t0 from ventana) as ts, si.s_start as delta, false as es_venta, null::text as motivo
    from s_inicio si
    where si.s_start <> 0
    union all
    select mp.variante_id, mp.created_at as ts, mp.d as delta, mp.es_venta, mp.motivo
    from mov_par mp
  ) x
  group by x.variante_id
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
      when retail.fn_es_venta_de_stock(m.tipo, m.motivo, m.cambio_id, m.venta_item_id, ve.estado) then 'venta'
      -- Salida contable real (mueve stock, genera ingreso si corresponde, trazabilidad intacta en
      -- ventas/venta_items) pero NO es demanda comercial: clase propia, nunca 'venta' — decisión de
      -- Felipe, 2026-09-24, sección 1. `demanda` (más abajo) solo suma 'venta'/'devolucion', así que
      -- esto queda fuera de Vendido/Ritmo/Sell-through/Rotación/Tendencia por construcción, no por
      -- coincidencia silenciosa.
      when m.tipo = 'salida' and m.motivo = 'cuarentena_liquidada' then 'liquidacion_danada'
      when m.tipo = 'entrada' and m.devolucion_item_id is not null and su.tipo is distinct from 'cuarentena' then 'devolucion'
      when m.tipo = 'entrada' and m.cambio_id is not null then 'devolucion'
    end as clase,
    case
      when m.devolucion_item_id is not null then coalesce(ve_dev.ubicacion_id, m.ubicacion_id)
      when m.cambio_id is not null and m.tipo = 'entrada' then coalesce(ve_cam.ubicacion_id, m.ubicacion_id)
      else m.ubicacion_id
    end as ubicacion_id,
    case
      when m.tipo = 'salida' and m.venta_item_id is not null then m.cantidad * (vi.precio_unitario - vi.descuento_unitario)
      when m.tipo = 'salida' and m.cambio_id is not null then m.cantidad * (vi_cam.precio_unitario - vi_cam.descuento_unitario) + coalesce(ca.diferencia, 0)
      when m.tipo = 'salida' then m.cantidad * coalesce(v.precio, 0)
      when m.devolucion_item_id is not null then m.cantidad * (vi_dev.precio_unitario - vi_dev.descuento_unitario)
      when m.cambio_id is not null then m.cantidad * (vi_cam.precio_unitario - vi_cam.descuento_unitario)
      else 0
    end as importe,
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
-- ---- Última venta y exposición en piso desde entonces (para «Sin venta», sección 11) ----------------
-- Misma clase «venta» que ya usa `demanda`/`demanda_filas` (incluye un cambio, ADR-0113): no se
-- duplica el criterio de qué cuenta como venta en un segundo lugar.
ultima_venta_par as (
  select variante_id, max(created_at) as ultima_venta_en
  from demanda_filas
  where clase = 'venta' and ubicacion_id = p_ubicacion_id
  group by variante_id
),
exposicion_sin_venta as (
  -- Desde la última venta (o desde t0 si nunca vendió en la ventana disponible) hasta ahora: cuántos
  -- días (con decimales) tuvo algo en el piso. Reusa `intervalos` (piso): el corte por variante es
  -- DINÁMICO (la fecha de su propia última venta), por eso va aparte de `dias_par`, que corta en los
  -- bordes fijos del período A/B.
  select i.variante_id,
    coalesce(sum(extract(epoch from greatest(i.fin - greatest(i.inicio, coalesce(uv.ultima_venta_en, (select t0 from ventana))), interval '0')))
      filter (where i.nivel > 0), 0) / 86400.0 as dias
  from intervalos i
  left join ultima_venta_par uv on uv.variante_id = i.variante_id
  group by i.variante_id
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
    coalesce(ac.utilizable, 0) - coalesce(mo.desde_a_ini, 0) as a_ini_raw,
    coalesce(ac.utilizable, 0) - coalesce(mo.desde_a_fin, 0) as a_fin_raw,
    coalesce(ac.utilizable, 0) - coalesce(mo.desde_b_ini, 0) as b_ini_raw,
    coalesce(ac.utilizable, 0) - coalesce(mo.desde_b_fin, 0) as b_fin_raw,
    coalesce(dp.consistente, true) as dias_consistente,
    round(coalesce(dp.dias_a,
      case when coalesce(ac.en_venta, 0) > 0 then greatest(extract(epoch from (w.a_fin - w.a_ini)), 0) / 86400.0 else 0 end)::numeric, 3) as a_dias,
    round(coalesce(dp.dias_b,
      case when coalesce(ac.en_venta, 0) > 0 then greatest(extract(epoch from (w.b_fin - w.b_ini)), 0) / 86400.0 else 0 end)::numeric, 3) as b_dias,
    -- Promedio de PISO (sección 15 del pedido, 2026-09-24) = área ÷ SOLO los días con stock en piso
    -- (`dias_par.dias_a/dias_b`, el mismo denominador de «días con stock»/Ritmo observado) — NUNCA entre
    -- todo el período: diluir con los días sin piso castigaría a una variante con poca exposición dos
    -- veces (ya lo dice «muestra limitada»; el promedio no debe repetirlo con un número artificialmente
    -- bajo). Sin ningún día con piso (`dias_a = 0`), no hay promedio que reportar: N/D, no 0.
    round((dp.area_piso_a / nullif(dp.dias_a, 0))::numeric, 4) as a_piso_promedio,
    round((dp.area_piso_b / nullif(dp.dias_b, 0))::numeric, 4) as b_piso_promedio,
    -- Promedio TOTAL (sección 16): aquí SÍ importa todo el período — se mide cuánto inventario mantiene
    -- la sede, no solo mientras hay piso. Divide entre la duración COMPLETA (nunca 0 días: `fechas` ya
    -- deja al menos hoy).
    round((coalesce(au.area_total_a, 0) / greatest(extract(epoch from (w.a_fin - w.a_ini)) / 86400.0, 1))::numeric, 4) as a_total_promedio,
    round((coalesce(au.area_total_b, 0) / greatest(extract(epoch from (w.b_fin - w.b_ini)) / 86400.0, 1))::numeric, 4) as b_total_promedio,
    uv.ultima_venta_en,
    round(coalesce(esv.dias, 0)::numeric, 3) as piso_expuesto_desde_ultima_venta_dias,
    coalesce(pe.eventos, '[]'::jsonb) as piso_eventos,
    de.a_ventas, de.a_devoluciones, de.a_importe, de.a_costo_ventas, de.a_costo_devoluciones, de.a_uds_sin_costo,
    de.b_ventas, de.b_devoluciones, de.b_importe, de.b_costo_ventas, de.b_costo_devoluciones, de.b_uds_sin_costo,
    en.a_entradas, en.b_entradas
  from universo u
  cross join ventana w
  left join actual ac on ac.variante_id = u.variante_id
  left join movido mo on mo.variante_id = u.variante_id
  left join dias_par dp on dp.variante_id = u.variante_id
  left join area_util_par au on au.variante_id = u.variante_id
  left join ultima_venta_par uv on uv.variante_id = u.variante_id
  left join exposicion_sin_venta esv on esv.variante_id = u.variante_id
  left join piso_eventos_par pe on pe.variante_id = u.variante_id
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
  greatest(b.b_ini_raw, 0)::integer, greatest(b.b_fin_raw, 0)::integer, b.b_dias,
  b.a_piso_promedio, b.b_piso_promedio, b.a_total_promedio, b.b_total_promedio,
  b.ultima_venta_en, b.piso_expuesto_desde_ultima_venta_dias, b.piso_eventos
from base b
where (select ok from permiso)
  and exists (select 1 from ub)
  and (greatest(b.a_ini_raw, b.a_fin_raw, b.b_ini_raw, b.b_fin_raw) > 0
       or coalesce(b.a_ventas, 0) + coalesce(b.a_devoluciones, 0) + coalesce(b.b_ventas, 0) + coalesce(b.b_devoluciones, 0) > 0)
order by b.referencia, b.color_nombre, b.talla, b.variante_id;
$$;

comment on function retail.fn_resumen_comparacion(uuid, date, date, date, date) is
  'Comparación de dos períodos (A y B) para una sede: por variante, unidades vendidas y devueltas, importe, costo de lo vendido y de lo devuelto (COGS en componentes), unidades sin costo, entradas, stock utilizable al inicio y al cierre reconstruido del ledger, días con stock, promedio ponderado por tiempo (piso y total, para rotación), última venta y exposición en piso desde entonces, y los eventos de piso para el sell-through de cohortes en TypeScript. Solo líderes. No decide nada: las reglas viven en apps/web/lib/resumen-comparacion.ts y apps/web/lib/resumen-exposicion.ts. Ver ADR-0138, ADR-0113 y el pedido de comportamiento comercial piso/almacén (2026-09-24).';

revoke all on function retail.fn_resumen_comparacion(uuid, date, date, date, date) from public, anon;
grant execute on function retail.fn_resumen_comparacion(uuid, date, date, date, date) to authenticated;
