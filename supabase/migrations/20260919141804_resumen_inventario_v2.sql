-- ============================================================================
-- 20260919141804 — Resumen de Inventario v2: período elegible, comparación,
-- días CON STOCK como denominador de la velocidad, costo verificable.
-- ADR-0113. Evoluciona `fn_resumen_variantes` (ADR-0101, ya en producción con
-- la firma `(uuid, integer)`); no crea otra función.
--
-- RENOMBRADA el 2026-09-19 desde `20260919010000`: esa versión la usa
-- `20260919010000_etiquetar_variantes.sql`, que YA corrió en producción (existe
-- `retail.etiquetar_variantes`); esta NO había corrido allá (la firma vigente de
-- `fn_resumen_variantes` seguía siendo `(uuid, integer)`). Regla del candado de
-- versiones: se renombra la que aún no corrió. El contenido no cambió.
--
-- NO SE APLICA A PRODUCCIÓN desde esta sesión: Felipe la pega (con prefijo
-- `retail.` ya escrito, este archivo ya lo lleva) cuando decida.
--
-- QUÉ CAMBIA RESPECTO A LA VERSIÓN ANTERIOR
--   1. Ventana elegible: `p_desde`/`p_hasta` (fechas de Lima, ambas incluidas)
--      y una segunda ventana de comparación (`p_cmp_desde`/`p_cmp_hasta`).
--      Sin fechas, todo funciona como antes: ventana rodante de
--      `p_ventana_dias` que termina hoy (así la pantalla vieja, si sigue
--      desplegada mientras se pega esta migración, no se entera).
--   2. `dias_con_stock`: cuántos días (con decimales) la variante estuvo
--      realmente EN VENTA dentro de la ventana. Es el denominador correcto de
--      la velocidad: una prenda que vendió 10 unidades en los 5 días que tuvo
--      stock y luego estuvo 25 días agotada vende 2/día, no 0,33. ADR-0101
--      lo dejó anotado como «segundo paso» porque exige reconstruir el saldo
--      hacia atrás sobre el ledger; se hace acá, en Postgres, una sola vez.
--   3. Datos que la pantalla nueva necesita y la vieja no traía: categoría,
--      estado del producto, precio, códigos de barras, origen de abastecimiento
--      (¿se repone comprando o produciendo?), el traslado que viene en camino
--      (para enlazarlo) y el costo con su estado de verificación.
--
-- QUÉ ES «EN VENTA» (verificado en pg_proc, 2026-09-18)
--   El POS descuenta SOLO del piso: `registrar_venta` usa
--   `fn_sububicacion_por_defecto(ubicacion, 'venta')` = 'piso_venta', y
--   `fn_aplicar_movimiento` rechaza la salida si ahí no hay stock. Las
--   entradas (compra, producción) y los traslados llegan al ALMACÉN. O sea:
--   una prenda con 0 en el piso y 5 en el almacén NO se puede vender hasta que
--   alguien la baje. Por eso:
--     · tienda que separa piso/almacén: en venta = piso > 0.
--     · ubicación sin esa separación (Taller): en venta = todo lo no dañado.
--   Cobertura, en cambio, mira lo UTILIZABLE en la sede (piso + almacén, sin
--   cuarentena ni «sin ubicar»): «¿cuánto dura lo que tengo aquí si lo voy
--   bajando?». Son dos preguntas distintas y el motor de recomendaciones las
--   trata por separado (primero «bajar al piso», que no cuesta nada).
--
-- CÓMO SE RECONSTRUYE EL SALDO. `stock` es el saldo actual; el ledger
-- (`movimientos`) dice cómo se llegó. Cada fila mueve cantidades entre
-- «cubetas» (ubicación, sububicación) exactamente como `fn_aplicar_movimiento`:
--   entrada  +c en (ubicación, sub)      salida  −c en (ubicación, sub)
--   ajuste   +c (con signo) en (ubicación, sub)
--   traslado −c en (ubicación, sub) y +c en (destino, sub destino)
-- El saldo en el instante t es el saldo actual menos todo lo que se movió
-- después de t. De ahí salen los intervalos con saldo > 0 y, recortados a la
-- ventana, los días con stock (con decimales: se pesa por tiempo real).
-- Si el saldo reconstruido da negativo en algún tramo es que `stock` y el
-- ledger no cuadran (alguien escribió stock sin movimiento): se avisa con
-- `ledger_consistente = false` y la capa TS NO se fía de `dias_con_stock`.
--
-- DEMANDA: igual que ADR-0101 (por FK y estado real, no por el texto de
-- `motivo`): suma la salida de una venta 'completada' y la de un cambio; resta
-- la devolución que NO fue a cuarentena y la entrada de un cambio; todo lo
-- demás (traslados, recepciones, producción, carga inicial, conteo, ajustes)
-- es neutro. Una venta anulada no cuenta en NINGUNA ventana.
--
-- SELL-THROUGH: se arma en TS con `stock_inicial` (utilizable al inicio de la
-- ventana, reconstruido) + `entradas_ventana` (lo que llegó de afuera) contra
-- las ventas netas — la definición clásica, sin depender del stock de hoy.
--
-- COSTO. `variantes.costo` debería moverse SOLO por `fn_recalcular_costo_variante`
-- (ADR-0067). Hoy hay dos caminos más que lo escriben fuera de ese cálculo:
-- `catalogo_actualizar_producto` (pisa el costo con lo que mande el formulario,
-- o con 0) y la política `variantes_write_lider` (un líder puede actualizar
-- `variantes` por la API). Esta función NO lo cierra —eso exige decidir cómo se
-- corrige un costo mal cargado—, pero sí lo MIDE y lo dice, por variante:
--   'oficial'   el costo coincide con el último de `costo_historial` y la
--               cadena (costo_anterior = resultante previo) no está rota.
--   'declarado' sin historial oficial y sin ningún cambio posterior registrado:
--               es el costo con el que se dio de alta la prenda.
--   'alterado'  cambió fuera del cálculo oficial (no coincide con el ledger, la
--               cadena se rompió, o hay un cambio manual registrado).
--   'sin_costo' nulo o ≤ 0.
-- La pantalla solo muestra «Capital en inventario» si ninguna prenda con stock
-- está 'alterada' ni 'sin_costo'. El costo solo viaja a líderes.
--
-- SEGURIDAD: security definer para mirar otras sedes; baranda por
-- `fn_puede_operar_ubicacion`; `en_red` y costo solo para `fn_es_lider()`;
-- `revoke` de public y anon (default privileges de Supabase dan EXECUTE a anon).
-- ============================================================================

-- La forma de salida cambia (columnas nuevas) y Postgres no deja alterar el
-- tipo de retorno con `create or replace`; además la firma cambia. Se elimina
-- la firma anterior a propósito: dos sobrecargas con el mismo nombre harían
-- ambigua la llamada por nombre de PostgREST.
drop function if exists retail.fn_resumen_variantes(uuid, integer);

create or replace function retail.fn_resumen_variantes(
  p_ubicacion_id uuid,
  p_ventana_dias integer default 30,
  p_desde date default null,
  p_hasta date default null,
  p_cmp_desde date default null,
  p_cmp_hasta date default null
)
returns table (
  variante_id uuid,
  producto_id uuid,
  referencia text,
  categoria_nombre text,
  sku text,
  codigo text,
  talla text,
  color_codigo text,
  color_nombre text,
  color_hex text,
  foto_url text,
  stock_minimo integer,
  separa_piso_almacen boolean,
  piso integer,
  almacen integer,
  sin_sububicacion integer,
  cuarentena integer,
  disponible integer,
  primer_ingreso timestamptz,
  dias_observables integer,
  ventas_ventana integer,
  devoluciones_ventana integer,
  ultima_venta timestamptz,
  entradas_ventana integer,
  mermas_ventana integer,
  en_camino integer,
  en_camino_a_tiempo integer,
  en_camino_atrasado boolean,
  proxima_llegada timestamptz,
  traslados_salida_ventana integer,
  en_red jsonb,
  -- Nuevas (ADR-0113)
  categoria_id uuid,
  producto_estado text,
  producto_codigo text,
  precio numeric,
  costo numeric,
  estado_costo text,
  codigos_barras text[],
  dias_con_stock numeric,
  stock_inicial integer,
  ledger_consistente boolean,
  ventas_cmp integer,
  devoluciones_cmp integer,
  dias_con_stock_cmp numeric,
  origen_abastecimiento text,
  proximo_traslado_id uuid
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
ventana_base as (
  -- Fechas de Lima, ambas incluidas. Tope de 730 días hacia atrás: la ventana
  -- recorre el ledger completo desde ahí, y un rango absurdo no debe poder
  -- convertir una carga de pantalla en un barrido de años.
  select
    greatest(least(coalesce(p_desde, x.hoy - (greatest(coalesce(p_ventana_dias, 30), 1) - 1)), x.hasta0), x.hoy - 730) as desde_d,
    x.hasta0 as hasta_d,
    (p_cmp_desde is not null and p_cmp_hasta is not null) as hay_cmp,
    greatest(least(p_cmp_desde, p_cmp_hasta), x.hoy - 800) as cmp_desde_d,
    least(greatest(p_cmp_desde, p_cmp_hasta), x.hoy) as cmp_hasta_d
  from (select p.hoy, least(coalesce(p_hasta, p.hoy), p.hoy) as hasta0 from params p) x
),
ventana as (
  select
    vb.desde_d, vb.hasta_d,
    (vb.desde_d::timestamp at time zone 'America/Lima') as w_ini,
    least(now(), ((vb.hasta_d + 1)::timestamp at time zone 'America/Lima')) as w_fin,
    vb.hay_cmp,
    case when vb.hay_cmp then (vb.cmp_desde_d::timestamp at time zone 'America/Lima') end as c_ini,
    case when vb.hay_cmp then least(now(), ((vb.cmp_hasta_d + 1)::timestamp at time zone 'America/Lima')) end as c_fin,
    least(
      (vb.desde_d::timestamp at time zone 'America/Lima'),
      coalesce(case when vb.hay_cmp then (vb.cmp_desde_d::timestamp at time zone 'America/Lima') end,
               (vb.desde_d::timestamp at time zone 'America/Lima'))
    ) as t0
  from ventana_base vb
),
permiso as (
  select fn_puede_operar_ubicacion(p_ubicacion_id) as ok
),
lider as (
  select fn_es_lider() as ok
),
ubicaciones_activas as (
  select u.id, u.nombre, u.tipo,
    exists (
      select 1 from sububicaciones su
      where su.ubicacion_id = u.id and su.tipo in ('piso_venta', 'almacen_tienda')
    ) as separa
  from ubicaciones u
  where u.activo
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
  -- Cambios de costo registrados por el trigger de variantes (ADR-0067).
  select distinct hc.entidad_id as variante_id
  from historial_producto_cambios hc
  where hc.entidad = 'variante' and hc.campo = 'costo'
),
universo as (
  select v.id as variante_id, v.producto_id, p.referencia, c.nombre as categoria_nombre, c.id as categoria_id,
    p.estado as producto_estado, p.codigo as producto_codigo,
    v.sku, v.codigo, ta.valor as talla, v.color_codigo, co.nombre as color_nombre, co.hex as color_hex,
    p.stock_minimo, v.precio,
    foto.url as foto_url,
    barras.codigos as codigos_barras,
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
    -- Foto de ESTE color si la hay; si no, la principal del producto.
    select pf.url
    from producto_fotos pf
    where pf.producto_id = p.id
    order by (pf.color_codigo is not distinct from v.color_codigo) desc, pf.es_principal desc, pf.orden
    limit 1
  ) foto on true
  left join lateral (
    select array_agg(cb.codigo order by cb.codigo) as codigos
    from codigos_barras cb
    where cb.variante_id = v.id
  ) barras on true
  -- Mismo universo que Existencias (`getStockPorUbicacion`): variante activa,
  -- sin el centinela. Un producto descontinuado con stock SÍ entra: es el
  -- candidato natural a liquidar, y Existencias también lo muestra.
  where v.activo
    and v.id <> (select centinela from params)
),
stock_ub as (
  -- Una fila por (variante, ubicación); NULL de sububicación es un valor real
  -- (el Taller entero vive ahí, y también los reingresos de anulación).
  select s.variante_id, s.ubicacion_id, ua.separa,
    coalesce(sum(s.cantidad) filter (where su.tipo = 'piso_venta'), 0)::integer as piso,
    coalesce(sum(s.cantidad) filter (where su.tipo = 'almacen_tienda'), 0)::integer as almacen,
    coalesce(sum(s.cantidad) filter (where s.sububicacion_id is null), 0)::integer as sin_sub,
    coalesce(sum(s.cantidad) filter (where su.tipo = 'cuarentena'), 0)::integer as cuarentena,
    coalesce(sum(s.cantidad) filter (where su.tipo is distinct from 'cuarentena'), 0)::integer as disponible
  from stock s
  left join sububicaciones su on su.id = s.sububicacion_id
  join ubicaciones_activas ua on ua.id = s.ubicacion_id
  where s.variante_id <> (select centinela from params)
  group by s.variante_id, s.ubicacion_id, ua.separa
),
-- ---------------------------------------------------------------------------
-- Reconstrucción del saldo «en venta» y «utilizable» sobre el ledger.
-- ---------------------------------------------------------------------------
efectos as (
  -- Cada movimiento mueve cantidades entre cubetas tal como fn_aplicar_movimiento:
  -- una fila por cubeta afectada (el traslado interno afecta dos).
  select e.variante_id, e.ubicacion_id, e.created_at, e.id, e.delta, su.tipo as sub_tipo, ua.separa
  from (
    select m.variante_id, m.ubicacion_id, m.sububicacion_id, m.created_at, m.id,
      case m.tipo when 'entrada' then m.cantidad when 'salida' then -m.cantidad
                  when 'ajuste' then m.cantidad when 'traslado' then -m.cantidad end as delta
    from movimientos m
    where m.created_at >= (select t0 from ventana)
      and m.tipo in ('entrada', 'salida', 'ajuste', 'traslado')
      and m.variante_id <> (select centinela from params)
    union all
    select m.variante_id, m.ubicacion_destino_id, m.sububicacion_destino_id, m.created_at, m.id, m.cantidad
    from movimientos m
    where m.created_at >= (select t0 from ventana)
      and m.tipo = 'traslado' and m.ubicacion_destino_id is not null
      and m.variante_id <> (select centinela from params)
  ) e
  join ubicaciones_activas ua on ua.id = e.ubicacion_id
  left join sububicaciones su on su.id = e.sububicacion_id
  where e.delta <> 0
),
efectos_clase as (
  select ef.variante_id, ef.ubicacion_id, ef.created_at, ef.id,
    -- Cubeta «en venta»: piso donde hay separación; todo lo no dañado en el resto.
    case when ef.separa
         then case when ef.sub_tipo = 'piso_venta' then ef.delta else 0 end
         else case when ef.sub_tipo is distinct from 'cuarentena' then ef.delta else 0 end end as d_venta,
    -- Cubeta «utilizable»: piso + almacén donde hay separación; todo lo no dañado en el resto.
    case when ef.separa
         then case when ef.sub_tipo in ('piso_venta', 'almacen_tienda') then ef.delta else 0 end
         else case when ef.sub_tipo is distinct from 'cuarentena' then ef.delta else 0 end end as d_util
  from efectos ef
),
mov_par as (
  -- Un movimiento puede tocar dos cubetas de la misma ubicación (piso↔almacén):
  -- se suma por movimiento y par para que no haya empates de orden.
  select ec.variante_id, ec.ubicacion_id, ec.created_at, ec.id, sum(ec.d_venta) as d
  from efectos_clase ec
  group by ec.variante_id, ec.ubicacion_id, ec.created_at, ec.id
  having sum(ec.d_venta) <> 0
),
s_inicio as (
  -- Saldo «en venta» en t0 = saldo de hoy − todo lo movido desde t0.
  select mp.variante_id, mp.ubicacion_id,
    coalesce(max(case when st.separa then st.piso else st.disponible end), 0) - sum(mp.d) as s_start
  from mov_par mp
  left join stock_ub st on st.variante_id = mp.variante_id and st.ubicacion_id = mp.ubicacion_id
  group by mp.variante_id, mp.ubicacion_id
),
puntos as (
  select si.variante_id, si.ubicacion_id, (select t0 from ventana) as ts, 0 as ord, null::uuid as oid, si.s_start as nivel
  from s_inicio si
  union all
  select mp.variante_id, mp.ubicacion_id, mp.created_at, 1, mp.id,
    si.s_start + sum(mp.d) over (partition by mp.variante_id, mp.ubicacion_id order by mp.created_at, mp.id)
  from mov_par mp
  join s_inicio si on si.variante_id = mp.variante_id and si.ubicacion_id = mp.ubicacion_id
),
intervalos as (
  select pt.variante_id, pt.ubicacion_id, pt.nivel, pt.ts as inicio,
    coalesce(lead(pt.ts) over (partition by pt.variante_id, pt.ubicacion_id order by pt.ts, pt.ord, pt.oid), now()) as fin
  from puntos pt
),
dias_par as (
  select i.variante_id, i.ubicacion_id,
    coalesce(sum(extract(epoch from greatest(least(i.fin, w.w_fin) - greatest(i.inicio, w.w_ini), interval '0')))
      filter (where i.nivel > 0), 0) / 86400.0 as dias,
    case when w.hay_cmp then
      coalesce(sum(extract(epoch from greatest(least(i.fin, w.c_fin) - greatest(i.inicio, w.c_ini), interval '0')))
        filter (where i.nivel > 0), 0) / 86400.0
    end as dias_cmp,
    -- Tramos de duración cero (varios movimientos en el mismo instante) no
    -- cuentan: el orden interno de una transacción no es observable.
    coalesce(bool_and(i.nivel >= 0) filter (where i.fin > i.inicio), true) as consistente
  from intervalos i
  cross join ventana w
  group by i.variante_id, i.ubicacion_id, w.hay_cmp
),
util_desde as (
  -- Lo utilizable se movió esto desde el inicio de la ventana → saldo inicial.
  select ec.variante_id, ec.ubicacion_id, sum(ec.d_util) as suma
  from efectos_clase ec
  where ec.created_at >= (select w_ini from ventana)
  group by ec.variante_id, ec.ubicacion_id
),
-- ---------------------------------------------------------------------------
-- Ingresos, demanda, flujo y mercadería en camino.
-- ---------------------------------------------------------------------------
primer_ingreso as (
  -- Una devolución dañada que entra directo a cuarentena NO es "la sede
  -- empezó a tener la prenda": no cuenta como ingreso.
  select x.variante_id, x.ubicacion_id, min(x.created_at) as primer_ingreso
  from (
    select m.variante_id, m.ubicacion_id, m.created_at
    from movimientos m
    left join sububicaciones su on su.id = m.sububicacion_id
    where (m.tipo = 'entrada' or (m.tipo = 'ajuste' and m.cantidad > 0))
      and su.tipo is distinct from 'cuarentena'
    union all
    select m.variante_id, m.ubicacion_destino_id, m.created_at
    from movimientos m
    where m.tipo = 'traslado' and m.ubicacion_destino_id is not null
  ) x
  where x.variante_id <> (select centinela from params)
  group by x.variante_id, x.ubicacion_id
),
origen_abast as (
  -- ¿Esta prenda se repone comprando o produciendo? Se lee de cómo entró
  -- alguna vez (los tres índices parciales cubren la búsqueda).
  select m.variante_id,
    case when bool_or(m.produccion_id is not null) and bool_or(m.compra_item_id is not null or m.lote_id is not null) then 'ambos'
         when bool_or(m.produccion_id is not null) then 'produccion'
         else 'compra' end as origen
  from movimientos m
  where m.tipo = 'entrada' and (m.produccion_id is not null or m.compra_item_id is not null or m.lote_id is not null)
    and m.variante_id <> (select centinela from params)
  group by m.variante_id
),
demanda_filas as (
  select
    m.variante_id,
    case
      when m.devolucion_item_id is not null then coalesce(ve_dev.ubicacion_id, m.ubicacion_id)
      when m.cambio_id is not null and m.tipo = 'entrada' then coalesce(ve_cam.ubicacion_id, m.ubicacion_id)
      else m.ubicacion_id
    end as ubicacion_id,
    m.cantidad,
    m.created_at,
    case
      -- Con venta_item_id manda el estado real de la venta (una anulada no
      -- cuenta). Sin venta_item_id (importación histórica que solo cargó el
      -- ledger) el motivo 'venta' alcanza: mejor contar la historia que
      -- fingir que no vendió nada.
      when m.tipo = 'salida' and m.motivo = 'venta' and (m.venta_item_id is null or ve.estado = 'completada') then 'venta'
      when m.tipo = 'salida' and m.cambio_id is not null then 'venta'
      when m.tipo = 'entrada' and m.devolucion_item_id is not null and su.tipo is distinct from 'cuarentena' then 'devolucion'
      when m.tipo = 'entrada' and m.cambio_id is not null then 'devolucion'
    end as clase
  from movimientos m
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
    -- Además de lo que tiene FK, una salida de motivo 'venta' SIN venta_item_id (una
    -- importación histórica que solo cargó el ledger) también es demanda: la rama de
    -- abajo ya lo prevé, pero este filtro la dejaba muerta y una importación de 12
    -- meses daba velocidad cero en todo (corregido en ADR-0113).
    and (m.venta_item_id is not null or m.cambio_id is not null or m.devolucion_item_id is not null
         or (m.tipo = 'salida' and m.motivo = 'venta'))
),
demanda as (
  select d.variante_id, d.ubicacion_id,
    coalesce(sum(d.cantidad) filter (where d.clase = 'venta' and d.created_at >= w.w_ini and d.created_at < w.w_fin), 0)::integer as ventas,
    coalesce(sum(d.cantidad) filter (where d.clase = 'devolucion' and d.created_at >= w.w_ini and d.created_at < w.w_fin), 0)::integer as devoluciones,
    max(d.created_at) filter (where d.clase = 'venta' and d.created_at >= w.w_ini and d.created_at < w.w_fin) as ultima_venta,
    coalesce(sum(d.cantidad) filter (where d.clase = 'venta' and w.hay_cmp and d.created_at >= w.c_ini and d.created_at < w.c_fin), 0)::integer as ventas_cmp,
    coalesce(sum(d.cantidad) filter (where d.clase = 'devolucion' and w.hay_cmp and d.created_at >= w.c_ini and d.created_at < w.c_fin), 0)::integer as devoluciones_cmp
  from demanda_filas d
  cross join ventana w
  where d.clase is not null
  group by d.variante_id, d.ubicacion_id
),
flujo as (
  -- Para explicaciones: qué entró de verdad a la sede en la ventana (recepción,
  -- producción, traslado recibido, carga inicial) y qué se perdió (mermas y
  -- salidas de cuarentena que no fueron venta). Un ajuste 'reposicion' del
  -- modal de Existencias es "encontré más", no mercadería recibida.
  select m.variante_id, m.ubicacion_id,
    coalesce(sum(m.cantidad) filter (
      where m.tipo = 'entrada' and (m.lote_id is not null or m.produccion_id is not null
        or m.transferencia_recepcion_id is not null or m.motivo = 'carga_inicial')
    ), 0)::integer as entradas,
    coalesce(sum(abs(m.cantidad)) filter (
      where (m.tipo = 'ajuste' and m.cantidad < 0 and m.motivo = 'merma')
         or (m.tipo = 'salida' and m.motivo in ('cuarentena_se_boto', 'cuarentena_donada'))
    ), 0)::integer as mermas,
    coalesce(sum(m.cantidad) filter (
      where m.tipo = 'salida' and (m.transferencia_item_id is not null or m.motivo = 'traslado_salida')
    ), 0)::integer as traslados_salida
  from movimientos m
  where m.created_at >= (select w_ini from ventana)
    and m.created_at < (select w_fin from ventana)
    and m.variante_id <> (select centinela from params)
  group by m.variante_id, m.ubicacion_id
),
en_camino as (
  -- Lo ENVIADO (misma definición que Existencias), partido en lo que viene a
  -- tiempo y lo atrasado: un traslado atrasado de 1 unidad no debe teñir de
  -- "atrasado" a las 20 que sí llegan mañana.
  select ti.variante_id, t.ubicacion_destino_id as ubicacion_id,
    sum(ti.cantidad)::integer as unidades,
    coalesce(sum(ti.cantidad) filter (where t.fecha_estimada_llegada is null or now() <= t.fecha_estimada_llegada), 0)::integer as a_tiempo,
    bool_or(t.fecha_estimada_llegada is not null and now() > t.fecha_estimada_llegada) as atrasado,
    min(t.fecha_estimada_llegada) filter (where now() <= t.fecha_estimada_llegada) as proxima_llegada,
    (array_agg(t.id order by t.fecha_estimada_llegada nulls last, t.created_at) filter (where t.estado = 'en_transito'))[1] as proximo_traslado_id
  from transferencia_items ti
  join transferencias t on t.id = ti.transferencia_id
  where t.estado in ('en_transito', 'recibido_con_diferencia')
  group by ti.variante_id, t.ubicacion_destino_id
),
-- Todo lo anterior, por (variante, ubicación), para ESTA sede y para las otras.
por_ubicacion as (
  select u.variante_id, ua.id as ubicacion_id, ua.nombre, ua.tipo, ua.separa,
    coalesce(st.piso, 0) as piso, coalesce(st.almacen, 0) as almacen,
    coalesce(st.sin_sub, 0) as sin_sub, coalesce(st.cuarentena, 0) as cuarentena,
    coalesce(st.disponible, 0) as disponible,
    case when ua.separa then coalesce(st.piso, 0) + coalesce(st.almacen, 0) else coalesce(st.disponible, 0) end as utilizable,
    pi.primer_ingreso,
    -- Días de la ventana en que la prenda ya estaba en la sede (tope: la ventana entera).
    case when pi.primer_ingreso is null then null
      else greatest(least(
        (w.hasta_d - w.desde_d) + 1,
        (w.hasta_d - (pi.primer_ingreso at time zone 'America/Lima')::date) + 1
      ), 0) end as dias_observables,
    round((coalesce(dp.dias,
      case when (case when ua.separa then coalesce(st.piso, 0) else coalesce(st.disponible, 0) end) > 0
           then extract(epoch from (w.w_fin - w.w_ini)) / 86400.0 else 0 end))::numeric, 3) as dias_con_stock,
    case when w.hay_cmp then round((coalesce(dp.dias_cmp,
      case when (case when ua.separa then coalesce(st.piso, 0) else coalesce(st.disponible, 0) end) > 0
           then extract(epoch from (w.c_fin - w.c_ini)) / 86400.0 else 0 end))::numeric, 3) end as dias_con_stock_cmp,
    greatest((case when ua.separa then coalesce(st.piso, 0) + coalesce(st.almacen, 0) else coalesce(st.disponible, 0) end)
             - coalesce(ud.suma, 0), 0)::integer as stock_inicial,
    (coalesce(dp.consistente, true)
      and ((case when ua.separa then coalesce(st.piso, 0) + coalesce(st.almacen, 0) else coalesce(st.disponible, 0) end)
           - coalesce(ud.suma, 0)) >= 0) as consistente,
    coalesce(de.ventas, 0) as ventas, coalesce(de.devoluciones, 0) as devoluciones, de.ultima_venta,
    coalesce(de.ventas_cmp, 0) as ventas_cmp, coalesce(de.devoluciones_cmp, 0) as devoluciones_cmp,
    coalesce(fl.entradas, 0) as entradas, coalesce(fl.mermas, 0) as mermas, coalesce(fl.traslados_salida, 0) as traslados_salida,
    coalesce(ec.unidades, 0) as en_camino, coalesce(ec.a_tiempo, 0) as en_camino_a_tiempo,
    coalesce(ec.atrasado, false) as en_camino_atrasado, ec.proxima_llegada, ec.proximo_traslado_id
  from universo u
  cross join ubicaciones_activas ua
  cross join ventana w
  left join stock_ub st on st.variante_id = u.variante_id and st.ubicacion_id = ua.id
  left join primer_ingreso pi on pi.variante_id = u.variante_id and pi.ubicacion_id = ua.id
  left join dias_par dp on dp.variante_id = u.variante_id and dp.ubicacion_id = ua.id
  left join util_desde ud on ud.variante_id = u.variante_id and ud.ubicacion_id = ua.id
  left join demanda de on de.variante_id = u.variante_id and de.ubicacion_id = ua.id
  left join flujo fl on fl.variante_id = u.variante_id and fl.ubicacion_id = ua.id
  left join en_camino ec on ec.variante_id = u.variante_id and ec.ubicacion_id = ua.id
),
-- "En la red" agregado UNA vez por variante (group by), no una subconsulta
-- correlacionada por fila (ADR-0101: 5,5 s → ~100 ms con 5.000 variantes).
-- Solo un líder ve las otras sedes.
en_red_agg as (
  select o.variante_id,
    jsonb_agg(jsonb_build_object(
      'ubicacion_id', o.ubicacion_id,
      'nombre', o.nombre,
      'tipo', o.tipo,
      'separa_piso_almacen', o.separa,
      'disponible', o.disponible,
      'utilizable', o.utilizable,
      'piso', o.piso,
      'almacen', case when o.separa then o.almacen else o.disponible end,
      'dias_observables', o.dias_observables,
      'dias_con_stock', o.dias_con_stock,
      'ledger_consistente', o.consistente,
      'ventas_ventana', o.ventas,
      'devoluciones_ventana', o.devoluciones,
      'en_camino', o.en_camino
    ) order by o.disponible desc, o.nombre) as en_red
  from por_ubicacion o
  where o.ubicacion_id <> p_ubicacion_id
    and (o.disponible > 0 or o.en_camino > 0)
    and (select ok from lider)
  group by o.variante_id
)
select
  u.variante_id, u.producto_id, u.referencia, u.categoria_nombre,
  u.sku, u.codigo, u.talla, u.color_codigo, u.color_nombre, u.color_hex, u.foto_url,
  u.stock_minimo,
  aqui.separa,
  aqui.piso, aqui.almacen, aqui.sin_sub, aqui.cuarentena, aqui.disponible,
  aqui.primer_ingreso, aqui.dias_observables,
  aqui.ventas, aqui.devoluciones, aqui.ultima_venta,
  aqui.entradas, aqui.mermas,
  aqui.en_camino, aqui.en_camino_a_tiempo, aqui.en_camino_atrasado, aqui.proxima_llegada,
  aqui.traslados_salida,
  coalesce(er.en_red, '[]'::jsonb) as en_red,
  u.categoria_id, u.producto_estado, u.producto_codigo, u.precio,
  case when (select ok from lider) then u.costo_valor end as costo,
  case when (select ok from lider) then u.costo_estado end as estado_costo,
  coalesce(u.codigos_barras, '{}'::text[]) as codigos_barras,
  aqui.dias_con_stock, aqui.stock_inicial, aqui.consistente,
  aqui.ventas_cmp, aqui.devoluciones_cmp, aqui.dias_con_stock_cmp,
  oa.origen as origen_abastecimiento,
  aqui.proximo_traslado_id
from universo u
join por_ubicacion aqui on aqui.variante_id = u.variante_id and aqui.ubicacion_id = p_ubicacion_id
left join en_red_agg er on er.variante_id = u.variante_id
left join origen_abast oa on oa.variante_id = u.variante_id
where (select ok from permiso)
  -- Solo lo que tiene que ver con ESTA sede: alguna vez ingresó, tiene stock,
  -- viene en camino o vendió en la ventana. Una variante que jamás pisó la
  -- sede no es una "curva rota" de esa sede ni cuenta para su salud.
  and (aqui.disponible > 0 or aqui.en_camino > 0 or aqui.ventas > 0 or aqui.primer_ingreso is not null)
-- Orden estable (variante_id al final) porque el cliente pagina con Range:
-- PostgREST corta en max_rows (1.000) sin avisar.
order by u.referencia, u.color_nombre, u.talla, u.variante_id;
$$;

comment on function retail.fn_resumen_variantes(uuid, integer, date, date, date, date) is
  'Agregados crudos por variante para una ubicación y una ventana elegible (+ ventana de comparación): stock por sububicación, demanda neta, días con stock reconstruidos del ledger, en camino, costo verificado y lo mismo de las otras sedes en jsonb. No decide nada: las reglas viven en apps/web/lib/resumen-reglas.ts. Ver ADR-0101 y ADR-0113.';

revoke all on function retail.fn_resumen_variantes(uuid, integer, date, date, date, date) from public, anon;
grant execute on function retail.fn_resumen_variantes(uuid, integer, date, date, date, date) to authenticated;

notify pgrst, 'reload schema';
