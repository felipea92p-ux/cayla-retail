-- ============================================================================
-- Única fuente de verdad para el ledger de piso/almacén/total (Felipe, 2026-09-24 — ADR-0182)
--
-- CONSOLIDACIÓN DE RELEASE (mismo día): esta migración reemplaza también a
-- `20260924020000_ledger_timeline_variante.sql`, que creaba una primera versión autocontenida de
-- `fn_ledger_timeline`. Esa primera versión quedó 100% absorbida acá abajo (el `create or replace`
-- de más adelante la reemplaza entera, en el mismo release) — ninguna de las dos migraciones
-- (`010700`, esta) llegó a aplicarse a producción, así que se eliminó el archivo `020000` del set
-- del release en vez de dejar dos `create function` consecutivos de lo mismo.
--
-- Hasta esta migración existían DOS reconstrucciones independientes del mismo ledger (saldo
-- inicial → clasificación por bucket → nivel acumulado): una dentro de `fn_resumen_comparacion`
-- (todas las variantes de una sede, dos ventanas A/B a la vez) y otra en `fn_ledger_timeline`
-- (una variante, una ventana). Las dos coincidían HOY (verificado a mano, ADR-0181), pero eran
-- dos copias del mismo algoritmo: cualquier corrección futura (como la del bucket total,
-- ADR-0180) exigía aplicarse dos veces sin garantía de que las dos copias siguieran de acuerdo.
-- Felipe pidió una sola fuente de verdad conceptual, SIN volver esto N+1: una llamada por
-- variante sobre `fn_ledger_timeline` habría cambiado el recorrido de TODA la sede en un solo
-- paso — lo que ya hacía `fn_resumen_comparacion` — por N recorridos, uno por variante.
--
-- LA SOLUCIÓN: `retail.fn_ledger_puntos` hace TODO el trabajo de reconstrucción — desde
-- `movimientos`/`stock` hasta el nivel acumulado en cada punto, para los dos buckets (piso,
-- total) — para UNA sede, UN punto de partida y, opcionalmente, un subconjunto de variantes.
-- Con `p_variante_ids` en NULL reconstruye TODAS las variantes con movimiento en UN solo
-- recorrido de `movimientos` (el caso de `fn_resumen_comparacion`: sigue siendo un recorrido por
-- sede, nunca uno por variante — mismo número de escaneos de tabla que antes de esta migración).
-- Con un arreglo explícito de variantes, esas variantes SIEMPRE aparecen en el resultado (aunque
-- no tengan movimiento) — el caso de `fn_ledger_timeline`, que necesita responder siempre para
-- la variante que se le pide, igual que hacía antes de esta migración.
--
-- `fn_ledger_puntos` devuelve el NIVEL en cada punto, no intervalos ni eventos: cada consumidor
-- arma lo que necesita (intervalos con `lead()`, o la lista de eventos para el FIFO de cohortes
-- de `inventario-exposicion.ts`) a partir de los mismos puntos — ninguno de los dos vuelve a
-- decidir qué es un delta, a qué bucket pertenece un movimiento, o cuál es el saldo de partida.
--
-- QUÉ SE QUEDÓ AFUERA A PROPÓSITO, Y POR QUÉ: `fn_resumen_comparacion` sigue con su propia
-- consulta de `actual` (el stock de HOY, piso/total — un `sum(stock.cantidad)` directo, sin
-- reconstruir nada) para `a_stock_inicio`/`a_stock_cierre` (`a_ini_raw`/`a_fin_raw` en `base`,
-- vía `movido`). Es la MISMA información que ya usa `fn_ledger_puntos` como ancla —
-- matemáticamente, el nivel del ÚLTIMO punto de cada bucket ya es igual a ese `actual` — pero
-- exponerla desde la función compartida habría obligado a rediseñar `a_ini_raw`/`a_fin_raw` de
-- «diferencia hacia atrás desde hoy» (`movido`, simple, ya probado) a «búsqueda del intervalo que
-- contiene la fecha» (más frágil en los bordes: una fecha exactamente en el límite de un
-- intervalo, antes del primero, después del último). `actual` no es el algoritmo que Felipe pidió
-- unificar (reconstrucción del ledger: saldo inicial, clasificación por bucket, nivel acumulado,
-- intervalos) — es una lectura directa de `stock`, sin ninguna lógica de reconstrucción que
-- pueda desviarse entre las dos funciones. Duplicar 10 líneas de `sum(...) group by ...` no es el
-- riesgo que esta migración elimina.
--
-- CORRECCIÓN AGREGADA EL MISMO DÍA (Felipe pidió auditar Movimientos antes de cerrar el dominio):
-- `esMovimientoInterno` (el reloj de exposición pausa/reanuda) comparaba `motivo = 'movimiento_interno'`
-- — un string que solo `mover_interno()` garantiza por construcción (mismo parámetro de ubicación
-- repetido, motivo literal). La pantalla Movimientos (`fn_movimientos`) YA clasifica "interno" con una
-- condición ESTRUCTURAL más robusta: `tipo = 'traslado' and ubicacion_id = ubicacion_destino_id` — sin
-- mirar `motivo` en absoluto. Las dos condiciones NO están garantizadas equivalentes por ningún CHECK
-- ni trigger (auditado hoy): ya existe un caso real, aplicado en producción, donde divergen —
-- `activacion-piso-almacen-produccion.sql` (2026-09-14) inserta `tipo='traslado'`,
-- `ubicacion_id=ubicacion_destino_id`, pero `motivo='activacion_piso_almacen'`, no
-- `'movimiento_interno'` (por eso `apps/web/lib/movimientos-reglas.ts` ya tiene que mantener una LISTA
-- de motivos para "interno" en vez de un único valor). Hoy esa fila en particular no toca el bucket
-- piso (cae en sububicaciones que no son `piso_venta`), pero nada impide que una inserción manual
-- futura con la misma forma SÍ lo haga, rompiendo el reloj de exposición en silencio.
--
-- `retail.fn_es_traslado_interno` es la fuente ÚNICA de este hecho ESTRUCTURAL (Nivel A del dominio:
-- "¿qué pasó", no "¿qué significa comercialmente" — eso sigue siendo `fn_es_venta_de_stock`, Nivel B):
-- la misma condición que ya usaba Movimientos, ahora también la que usa el ledger. No se tocó la UI
-- ni la RPC de Movimientos (seguía correcta) — solo se le dio nombre y se reutilizó.
--
-- STOCK ACTUAL P/A (agregado el mismo día, decisión ya tomada por Felipe): dos columnas nuevas en
-- `fn_resumen_comparacion`, `stock_piso_hoy`/`stock_almacen_hoy` — el stock de HOY, contexto para
-- leer Rotación piso/total y sobrestock (NO reemplaza Existencias, que sigue siendo la pantalla de
-- HOY). Reutilizan exactamente `actual.en_venta`/`actual.utilizable`, que esta función YA calculaba
-- — ninguna fuente de stock nueva. Cuando la sede no separa piso/almacén (`ub.separa = false`) las
-- dos salen NULL a propósito: no hay un split real que reportar, y "no lo sabemos con rigor" nunca
-- se disfraza de "0" (el mismo principio N/D de todo este dominio). Con separación real pero cero
-- stock en cualquier parte, sí son 0/0 — es un dato conocido, no una ausencia.
-- ============================================================================
create or replace function retail.fn_es_traslado_interno(p_tipo text, p_ubicacion_id uuid, p_ubicacion_destino_id uuid)
returns boolean
language sql
immutable
as $$
  select p_tipo = 'traslado' and p_ubicacion_id = p_ubicacion_destino_id
$$;

comment on function retail.fn_es_traslado_interno(text, uuid, uuid) is
  'Nivel A del dominio de Inventario (hecho estructural, 2026-09-24): ¿esta fila es un traslado interno piso↔almacén (misma sede) o cruza de sede? La misma condición que ya usaba retail.fn_movimientos para su categoría "interno" — ahora también la fuente de esMovimientoInterno en retail.fn_ledger_puntos, en vez de comparar motivo = ''movimiento_interno'' (un string que solo mover_interno() garantiza por convención, no por constraint).';

drop function if exists retail.fn_ledger_puntos(uuid, timestamptz, uuid[]);

create or replace function retail.fn_ledger_puntos(
  p_ubicacion_id uuid,
  p_desde timestamptz,
  p_variante_ids uuid[] default null
)
returns table (
  variante_id uuid,
  bucket text,          -- 'piso' (solo piso_venta) | 'total' (piso + almacén, nunca cuarentena)
  ts timestamptz,
  ord smallint,          -- 0 = saldo inicial (ancla en `stock` real), 1 = movimiento real
  oid uuid,              -- id del movimiento; null en el saldo inicial
  delta integer,         -- variación neta de este punto (el saldo inicial "varía" desde 0)
  nivel integer,         -- saldo acumulado en este punto
  es_venta boolean,      -- solo tiene sentido en 'piso'; una venta real o un cambio (nunca traslado/ajuste)
  es_interno boolean     -- solo tiene sentido en 'piso'; traslado piso↔almacén de la MISMA sede (fn_es_traslado_interno), no cruza de sede
)
language sql
stable
set search_path to 'retail', 'public', 'extensions'
as $$
with params as (
  select '22222222-2222-4222-8222-222222222222'::uuid as centinela
),
pedidas as (
  select v as variante_id from unnest(p_variante_ids) as v where p_variante_ids is not null
),
ub as (
  select exists (
    select 1 from sububicaciones su where su.ubicacion_id = p_ubicacion_id and su.tipo in ('piso_venta', 'almacen_tienda')
  ) as separa
  from ubicaciones u
  where u.id = p_ubicacion_id and u.activo
),
actual as (
  select s.variante_id,
    coalesce(sum(s.cantidad) filter (where su.tipo is distinct from 'cuarentena'), 0)::integer as total,
    case when ub.separa then coalesce(sum(s.cantidad) filter (where su.tipo = 'piso_venta'), 0)
         else coalesce(sum(s.cantidad) filter (where su.tipo is distinct from 'cuarentena'), 0) end::integer as piso
  from stock s
  left join sububicaciones su on su.id = s.sububicacion_id
  cross join ub
  where s.ubicacion_id = p_ubicacion_id
    and s.variante_id <> (select centinela from params)
    and (p_variante_ids is null or s.variante_id = any(p_variante_ids))
  group by s.variante_id, ub.separa
),
efectos as (
  select e.variante_id, e.created_at, e.id, e.delta, su.tipo as sub_tipo, e.es_venta, e.es_interno
  from (
    select m.variante_id, m.sububicacion_id, m.created_at, m.id,
      case m.tipo when 'entrada' then m.cantidad when 'salida' then -m.cantidad
                  when 'ajuste' then m.cantidad when 'traslado' then -m.cantidad end as delta,
      retail.fn_es_venta_de_stock(m.tipo, m.motivo, m.cambio_id, m.venta_item_id, ve.estado) as es_venta,
      retail.fn_es_traslado_interno(m.tipo, m.ubicacion_id, m.ubicacion_destino_id) as es_interno
    from movimientos m
    left join venta_items vi on vi.id = m.venta_item_id
    left join ventas ve on ve.id = vi.venta_id
    where m.ubicacion_id = p_ubicacion_id
      and m.created_at >= p_desde
      and m.tipo in ('entrada', 'salida', 'ajuste', 'traslado')
      and m.variante_id <> (select centinela from params)
      and (p_variante_ids is null or m.variante_id = any(p_variante_ids))
    union all
    select m.variante_id, m.sububicacion_destino_id, m.created_at, m.id, m.cantidad, false as es_venta,
      retail.fn_es_traslado_interno(m.tipo, m.ubicacion_id, m.ubicacion_destino_id) as es_interno
    from movimientos m
    where m.ubicacion_destino_id = p_ubicacion_id
      and m.created_at >= p_desde
      and m.tipo = 'traslado'
      and m.variante_id <> (select centinela from params)
      and (p_variante_ids is null or m.variante_id = any(p_variante_ids))
  ) e
  left join sububicaciones su on su.id = e.sububicacion_id
  where e.delta <> 0
),
efectos_clase as (
  select ef.variante_id, ef.created_at, ef.id, ef.es_venta, ef.es_interno,
    case when ub.separa
         then case when ef.sub_tipo = 'piso_venta' then ef.delta else 0 end
         else case when ef.sub_tipo is distinct from 'cuarentena' then ef.delta else 0 end end as d_piso,
    -- Nunca condicionado a que la sede separe piso/almacén ni a que `sub_tipo` resuelva a un tipo
    -- conocido (fix del bucket total, ADR-0180): un movimiento sin sububicacion_id no debe inflar
    -- ni vaciar el total en silencio.
    case when ef.sub_tipo is distinct from 'cuarentena' then ef.delta else 0 end as d_total
  from efectos ef
  cross join ub
),
mov_piso as (
  select ec.variante_id, ec.created_at, ec.id, sum(ec.d_piso) as d, bool_or(ec.es_venta) as es_venta, bool_or(ec.es_interno) as es_interno
  from efectos_clase ec
  group by ec.variante_id, ec.created_at, ec.id
  having sum(ec.d_piso) <> 0
),
mov_total as (
  select ec.variante_id, ec.created_at, ec.id, sum(ec.d_total) as d
  from efectos_clase ec
  group by ec.variante_id, ec.created_at, ec.id
  having sum(ec.d_total) <> 0
),
-- El saldo de partida SIEMPRE aparece para una variante PEDIDA explícitamente (`fn_ledger_timeline`
-- necesita responder siempre para la variante que se le pide, tenga o no movimiento en la ventana).
-- Sin una petición explícita (`fn_resumen_comparacion`, todas las variantes de la sede), el universo
-- lo decide el propio movimiento — igual que antes de esta migración: una variante sin ledger en la
-- ventana no aparece aquí, y `fn_resumen_comparacion` ya la completa con su propio criterio (`base`,
-- `coalesce(dp.dias_a, ...)`) para no cambiar ningún número existente de esa función.
ids_piso as (
  select variante_id from mov_piso
  union
  select variante_id from pedidas
),
ids_total as (
  select variante_id from mov_total
  union
  select variante_id from pedidas
),
s_piso as (
  select i.variante_id, coalesce(max(ac.piso), 0) - coalesce(sum(mp.d), 0) as s_start
  from ids_piso i
  left join actual ac on ac.variante_id = i.variante_id
  left join mov_piso mp on mp.variante_id = i.variante_id
  group by i.variante_id
),
s_total as (
  select i.variante_id, coalesce(max(ac.total), 0) - coalesce(sum(mp.d), 0) as s_start
  from ids_total i
  left join actual ac on ac.variante_id = i.variante_id
  left join mov_total mp on mp.variante_id = i.variante_id
  group by i.variante_id
),
puntos_piso as (
  select si.variante_id, 'piso'::text as bucket, p_desde as ts, 0::smallint as ord, null::uuid as oid,
    si.s_start as delta, si.s_start as nivel, false as es_venta, false as es_interno
  from s_piso si
  union all
  select mp.variante_id, 'piso'::text, mp.created_at, 1::smallint, mp.id,
    mp.d,
    si.s_start + sum(mp.d) over (partition by mp.variante_id order by mp.created_at, mp.id),
    mp.es_venta, mp.es_interno
  from mov_piso mp
  join s_piso si on si.variante_id = mp.variante_id
),
puntos_total as (
  select si.variante_id, 'total'::text as bucket, p_desde as ts, 0::smallint as ord, null::uuid as oid,
    si.s_start as delta, si.s_start as nivel, false as es_venta, false as es_interno
  from s_total si
  union all
  select mp.variante_id, 'total'::text, mp.created_at, 1::smallint, mp.id,
    mp.d,
    si.s_start + sum(mp.d) over (partition by mp.variante_id order by mp.created_at, mp.id),
    false, false
  from mov_total mp
  join s_total si on si.variante_id = mp.variante_id
)
select * from puntos_piso
union all
select * from puntos_total;
$$;

comment on function retail.fn_ledger_puntos(uuid, timestamptz, uuid[]) is
  'Única fuente de verdad de la reconstrucción del ledger (2026-09-24, ADR-0182): el nivel de PISO y de TOTAL (piso+almacén, nunca cuarentena) en cada punto (saldo inicial + cada movimiento neto), para una sede desde un punto de partida, opcionalmente acotado a un arreglo de variantes. No calcula intervalos ni eventos: fn_resumen_comparacion y fn_ledger_timeline arman lo que necesitan a partir de estos mismos puntos. Función interna (no otorgada a authenticated): la autorización vive en cada función que la llama.';

revoke all on function retail.fn_ledger_puntos(uuid, timestamptz, uuid[]) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- `fn_ledger_timeline`: ahora un consumidor delgado de `fn_ledger_puntos` (antes reconstruía por
-- su cuenta). Mismo contrato externo (firma y columnas), mismo resultado — verificado abajo.
-- ----------------------------------------------------------------------------
create or replace function retail.fn_ledger_timeline(
  p_variante_id uuid,
  p_ubicacion_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (
  bucket text,          -- 'piso' (solo piso_venta) | 'total' (piso + almacén, nunca cuarentena)
  inicio timestamptz,
  fin timestamptz,
  nivel integer
)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
with permiso as (
  select fn_puede_operar_ubicacion(p_ubicacion_id) and fn_puede_analizar() as ok
),
ub_activa as (
  select 1 from ubicaciones u where u.id = p_ubicacion_id and u.activo
),
pt as (
  select * from retail.fn_ledger_puntos(p_ubicacion_id, p_desde, array[p_variante_id])
)
select pt.bucket, pt.ts as inicio,
  least(coalesce(lead(pt.ts) over (partition by pt.bucket order by pt.ts, pt.ord, pt.oid), p_hasta), p_hasta) as fin,
  pt.nivel
from pt
where (select ok from permiso) and exists (select 1 from ub_activa) and pt.ts < p_hasta
order by pt.bucket, pt.ts;
$$;

comment on function retail.fn_ledger_timeline(uuid, uuid, timestamptz, timestamptz) is
  'Primitiva de dominio (2026-09-24; desde ADR-0182 delegada en retail.fn_ledger_puntos, la única fuente de verdad del ledger): reconstruye los intervalos de nivel de PISO y de TOTAL (piso+almacén, nunca cuarentena) de una variante en una sede, para cualquier ventana de tiempo. No calcula nada por sí sola (ni días con stock, ni promedios, ni exposición) — expone la serie cruda para que quien la consuma calcule lo que necesite. Solo líderes que puedan analizar esa sede.';

revoke all on function retail.fn_ledger_timeline(uuid, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function retail.fn_ledger_timeline(uuid, uuid, timestamptz, timestamptz) to authenticated;

-- ----------------------------------------------------------------------------
-- `fn_resumen_comparacion`: misma firma de siempre, con 2 columnas nuevas al final (stock actual
-- P/A, ver nota arriba). Su reconstrucción del ledger (antes: `efectos`/`efectos_clase`/`mov_par`/
-- `s_inicio`/`puntos`, duplicada por bucket) se apoya en `fn_ledger_puntos` — la misma llamada, UNA
-- sola vez por invocación (todas las variantes de la sede, la ventana combinada t0→ahora), igual
-- número de recorridos de `movimientos`/`stock` que antes de esta migración.
-- ----------------------------------------------------------------------------
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
  -- Comportamiento comercial vs. gestión de inventario (2026-09-24)
  a_piso_promedio numeric,
  b_piso_promedio numeric,
  a_total_promedio numeric,
  b_total_promedio numeric,
  ultima_venta_en timestamptz,
  piso_expuesto_desde_ultima_venta_dias numeric,
  piso_eventos jsonb,
  -- Stock actual P/A (2026-09-24): el stock de HOY, NULL cuando la sede no separa piso/almacén
  -- (nunca 0 inventado — ver la nota al inicio del archivo).
  stock_piso_hoy integer,
  stock_almacen_hoy integer
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
  -- Stock de HOY, piso/total: lectura directa de `stock`, sin reconstruir nada (nunca se desvía de
  -- `fn_ledger_puntos`, que usa esta misma consulta como su propia ancla) — ver la nota al inicio
  -- del archivo sobre por qué esto se queda local en vez de exponerse desde la función compartida.
  select s.variante_id,
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
-- Reconstrucción del ledger (ADR-0113, ADR-0138, ADR-0180): DELEGADA en `fn_ledger_puntos`
-- (ADR-0182) — una sola llamada, todas las variantes de la sede, la ventana combinada t0→ahora.
-- ---------------------------------------------------------------------------
puntos_todas as (
  select * from retail.fn_ledger_puntos(p_ubicacion_id, (select t0 from ventana))
),
movido as (
  select pt.variante_id,
    coalesce(sum(pt.delta) filter (where pt.ts >= w.a_ini), 0) as desde_a_ini,
    coalesce(sum(pt.delta) filter (where pt.ts >= w.a_fin), 0) as desde_a_fin,
    coalesce(sum(pt.delta) filter (where pt.ts >= w.b_ini), 0) as desde_b_ini,
    coalesce(sum(pt.delta) filter (where pt.ts >= w.b_fin), 0) as desde_b_fin
  from puntos_todas pt
  cross join ventana w
  where pt.bucket = 'total' and pt.ord = 1
  group by pt.variante_id
),
-- ---- Cubeta «piso»: intervalos + promedio ponderado por tiempo -----------------------------------
intervalos as (
  select pt.variante_id, pt.nivel, pt.ts as inicio,
    coalesce(lead(pt.ts) over (partition by pt.variante_id order by pt.ts, pt.ord, pt.oid), now()) as fin
  from puntos_todas pt
  where pt.bucket = 'piso'
),
dias_par as (
  select i.variante_id,
    coalesce(sum(extract(epoch from greatest(least(i.fin, w.a_fin) - greatest(i.inicio, w.a_ini), interval '0')))
      filter (where i.nivel > 0), 0) / 86400.0 as dias_a,
    coalesce(sum(extract(epoch from greatest(least(i.fin, w.b_fin) - greatest(i.inicio, w.b_ini), interval '0')))
      filter (where i.nivel > 0), 0) / 86400.0 as dias_b,
    coalesce(bool_and(i.nivel >= 0) filter (where i.fin > i.inicio), true) as consistente,
    coalesce(sum(i.nivel * extract(epoch from greatest(least(i.fin, w.a_fin) - greatest(i.inicio, w.a_ini), interval '0')))
      filter (where i.fin > i.inicio), 0) / 86400.0 as area_piso_a,
    coalesce(sum(i.nivel * extract(epoch from greatest(least(i.fin, w.b_fin) - greatest(i.inicio, w.b_ini), interval '0')))
      filter (where i.fin > i.inicio), 0) / 86400.0 as area_piso_b
  from intervalos i
  cross join ventana w
  group by i.variante_id
),
-- ---- Cubeta «total»: MISMO patrón, ya integrado en el tiempo -------------------------------------
intervalos_util as (
  select pt.variante_id, pt.nivel, pt.ts as inicio,
    coalesce(lead(pt.ts) over (partition by pt.variante_id order by pt.ts, pt.ord, pt.oid), now()) as fin
  from puntos_todas pt
  where pt.bucket = 'total'
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
-- ---- Eventos de piso, para el FIFO de cohortes en TypeScript (inventario-exposicion.ts) ----------
piso_eventos_par as (
  select pt.variante_id,
    jsonb_agg(jsonb_build_object('ts', pt.ts, 'delta', pt.delta, 'esVenta', pt.es_venta, 'esMovimientoInterno', pt.es_interno) order by pt.ts) as eventos
  from puntos_todas pt
  where pt.bucket = 'piso' and (pt.ord = 1 or pt.delta <> 0)
  group by pt.variante_id
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
ultima_venta_par as (
  select variante_id, max(created_at) as ultima_venta_en
  from demanda_filas
  where clase = 'venta' and ubicacion_id = p_ubicacion_id
  group by variante_id
),
exposicion_sin_venta as (
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
    round((dp.area_piso_a / nullif(dp.dias_a, 0))::numeric, 4) as a_piso_promedio,
    round((dp.area_piso_b / nullif(dp.dias_b, 0))::numeric, 4) as b_piso_promedio,
    round((coalesce(au.area_total_a, 0) / greatest(extract(epoch from (w.a_fin - w.a_ini)) / 86400.0, 1))::numeric, 4) as a_total_promedio,
    round((coalesce(au.area_total_b, 0) / greatest(extract(epoch from (w.b_fin - w.b_ini)) / 86400.0, 1))::numeric, 4) as b_total_promedio,
    uv.ultima_venta_en,
    round(coalesce(esv.dias, 0)::numeric, 3) as piso_expuesto_desde_ultima_venta_dias,
    coalesce(pe.eventos, '[]'::jsonb) as piso_eventos,
    -- Stock actual P/A: reutiliza exactamente `actual.en_venta`/`actual.utilizable` (ya calculados
    -- arriba para a_ini_raw/a_fin_raw) — ninguna fuente de stock nueva. NULL cuando la sede no separa
    -- piso/almacén: no hay split que reportar con rigor, nunca se disfraza de 0.
    case when (select separa from ub) then coalesce(ac.en_venta, 0) end as stock_piso_hoy,
    case when (select separa from ub) then coalesce(ac.utilizable, 0) - coalesce(ac.en_venta, 0) end as stock_almacen_hoy,
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
  b.ultima_venta_en, b.piso_expuesto_desde_ultima_venta_dias, b.piso_eventos,
  b.stock_piso_hoy, b.stock_almacen_hoy
from base b
where (select ok from permiso)
  and exists (select 1 from ub)
  and (greatest(b.a_ini_raw, b.a_fin_raw, b.b_ini_raw, b.b_fin_raw) > 0
       or coalesce(b.a_ventas, 0) + coalesce(b.a_devoluciones, 0) + coalesce(b.b_ventas, 0) + coalesce(b.b_devoluciones, 0) > 0)
order by b.referencia, b.color_nombre, b.talla, b.variante_id;
$$;

comment on function retail.fn_resumen_comparacion(uuid, date, date, date, date) is
  'Comparación de dos períodos (A y B) para una sede: por variante, unidades vendidas y devueltas, importe, costo de lo vendido y de lo devuelto (COGS en componentes), unidades sin costo, entradas, stock utilizable al inicio y al cierre reconstruido del ledger, días con stock, promedio ponderado por tiempo (piso y total, para rotación), última venta y exposición en piso desde entonces, los eventos de piso para el sell-through de cohortes en TypeScript, y el stock actual de piso/almacén (NULL cuando la sede no separa). La reconstrucción del ledger (desde ADR-0182) delega en retail.fn_ledger_puntos, la misma fuente que usa fn_ledger_timeline. Solo líderes. No decide nada: las reglas viven en apps/web/lib/resumen-comparacion.ts y apps/web/lib/inventario-exposicion.ts. Ver ADR-0138, ADR-0113, ADR-0180 y ADR-0182.';

revoke all on function retail.fn_resumen_comparacion(uuid, date, date, date, date) from public, anon;
grant execute on function retail.fn_resumen_comparacion(uuid, date, date, date, date) to authenticated;
