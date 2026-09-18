-- ============================================================================
-- 20260917220000 — Resumen de Inventario: agregados por VARIANTE × UBICACIÓN
-- para la capa analítica (`/inventario/resumen`). ADR-0097.
--
-- SOLO LOCAL — no aplicar a producción sin el ok puntual de Felipe.
--
-- QUÉ HACE ESTA FUNCIÓN Y QUÉ NO. `fn_resumen_variantes` devuelve NÚMEROS
-- crudos por variante para una ubicación (stock por sububicación, ventas y
-- devoluciones de la ventana, días observables, mercadería en camino, y lo
-- mismo de las otras sedes como jsonb). NO decide nada: los umbrales y las
-- reglas (riesgo, sobrestock, curva rota, sugerir traslado) viven en UN solo
-- lugar, `apps/web/lib/resumen-reglas.ts`, que reutiliza `calcularEstado`/
-- `necesitaReponerPiso` de Existencias. Así Existencias y Resumen no pueden
-- decir dos cosas distintas de la misma prenda (integridad conceptual), y un
-- umbral se cambia en una constante, no en SQL y TS a la vez.
--
-- QUÉ ES DEMANDA (clasificación verificada RPC por RPC en pg_proc, 2026-09-17,
-- por FK de origen y estado real — nunca solo por el texto de `motivo`, que no
-- tiene CHECK):
--   suma   : salida con venta_item_id cuya venta está 'completada' y motivo
--            'venta' (una venta anulada deja su salida original en el ledger:
--            se descarta por ventas.estado, no restando 'anulacion_venta');
--            salida con cambio_id (la prenda nueva que se llevó la clienta).
--   resta  : entrada con devolucion_item_id que NO fue a cuarentena (una prenda
--            devuelta dañada sí fue demanda real — la unidad se perdió, la
--            clienta sí la quiso); entrada con cambio_id (la talla equivocada
--            que volvió no era demanda de esa variante).
--   neutro : traslados (dos filas traslado_salida/traslado_entrada, y el tipo
--            'traslado' interno piso↔almacén), recepción, producción, carga
--            inicial, conteo, ajustes, cuarentena_liquidada (venta real en
--            soles, pero no demanda de prenda sana — no consume stock vendible).
-- La devolución/cambio se atribuye a la sede de la VENTA original (la clienta
-- puede devolver en otra sede: crear_devolucion/registrar_cambio reciben
-- p_ubicacion_id libre) — si no, la sede receptora quedaría con demanda
-- negativa y la vendedora sobreestimada.
--
-- VENTANA OBSERVABLE. `dias_observables` = días desde el primer ingreso de esa
-- variante a ESA ubicación (entrada, ajuste positivo o destino de un traslado
-- interno), con tope p_ventana_dias, en días calendario de Lima. Una prenda
-- que llegó hace 8 días se divide entre 8, no entre 30. `stock.updated_at` se
-- pisa en cada movimiento, así que la única fuente de "desde cuándo" es el
-- ledger. Sin primer ingreso → NULL → la capa TS dice "historial insuficiente",
-- nunca inventa una velocidad.
--
-- EN CAMINO = lo ENVIADO (transferencia_items.cantidad) en transferencias con
-- estado in ('en_transito','recibido_con_diferencia') hacia esa ubicación —
-- misma definición que ya usa Existencias (`getExistencias`). Entre el
-- despacho y la confirmación esas unidades no están en `stock` de nadie.
--
-- DISPONIBLE excluye siempre la sububicación 'cuarentena' (dañado no es
-- vendible) y la variante centinela del cobro manual — mismo criterio que
-- `getStockPorUbicacion`. Ojo: `fn_stock_por_sede()` NO excluye ninguna de
-- las dos; por eso acá se calcula el stock de la red directo de `stock`.
--
-- SEGURIDAD. security definer para poder mirar las otras sedes (RLS de stock
-- solo deja ver la propia), con baranda: si quien llama no puede operar
-- p_ubicacion_id (`fn_puede_operar_ubicacion`), devuelve cero filas. Y el par
-- revoke/grant de siempre — sin el revoke, `anon` ejecuta (Postgres da EXECUTE
-- a public al crear cualquier función; 0005_grants.sql lo repite para
-- authenticated).
-- ============================================================================

-- La versión anterior de ESTE MISMO archivo definía fn_resumen_inventario()
-- (nivel producto/red). Nunca se aplicó fuera de este worktree; se reemplaza.
drop function if exists retail.fn_resumen_inventario();

-- `retail.transferir` (modelo atómico viejo de traslado) la retiró ADR-0068
-- (20260916150000:118) y la resucitó sin querer 20260917100700:246, SIN
-- revoke: ejecutable por `anon`. Mueve el stock al destino de inmediato pero
-- deja la transferencia en 'en_transito' para siempre → Existencias y este
-- Resumen la contarían como "en camino" además de disponible (doble conteo
-- verificado en la revisión de ADR-0097). Sin ningún caller en la app.
drop function if exists retail.transferir(uuid, uuid, jsonb, text);

-- Ventana rodante sobre TODAS las ubicaciones (para "en la red" hace falta la
-- velocidad de las otras sedes): sin este índice es un seq scan completo
-- del ledger por carga. El (ubicacion_id, created_at) que ya existe no sirve
-- para una condición solo por fecha.
create index if not exists movimientos_created_at_idx
  on retail.movimientos (created_at desc);

-- La forma de salida cambió respecto a la primera versión local del mismo día:
-- Postgres no deja alterar el tipo de retorno con create or replace.
drop function if exists retail.fn_resumen_variantes(uuid, integer);

create or replace function retail.fn_resumen_variantes(
  p_ubicacion_id uuid,
  p_ventana_dias integer default 30
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
  en_red jsonb
)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
with params as (
  select
    greatest(coalesce(p_ventana_dias, 30), 1) as ventana,
    (now() at time zone 'America/Lima')::date as hoy,
    '22222222-2222-4222-8222-222222222222'::uuid as centinela
),
desde as (
  -- Primer instante (UTC) del primer día de la ventana, en calendario de Lima:
  -- ventana=30 y hoy=17 → desde el 19 del mes anterior a las 00:00 Lima.
  select ((hoy - ventana + 1)::timestamp at time zone 'America/Lima') as ts from params
),
permiso as (
  select fn_puede_operar_ubicacion(p_ubicacion_id) as ok
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
universo as (
  select v.id as variante_id, v.producto_id, p.referencia, c.nombre as categoria_nombre,
    v.sku, v.codigo, ta.valor as talla, v.color_codigo, co.nombre as color_nombre, co.hex as color_hex,
    p.stock_minimo,
    foto.url as foto_url
  from variantes v
  join productos p on p.id = v.producto_id
  left join categorias c on c.id = p.categoria_id
  left join tallas ta on ta.id = v.talla_id
  left join colores co on co.codigo = v.color_codigo
  left join lateral (
    -- Foto de ESTE color si la hay; si no, la principal del producto.
    select pf.url
    from producto_fotos pf
    where pf.producto_id = p.id
    order by (pf.color_codigo is not distinct from v.color_codigo) desc, pf.es_principal desc, pf.orden
    limit 1
  ) foto on true
  -- Mismo universo que Existencias (`getStockPorUbicacion`): variante activa,
  -- sin el centinela. Un producto descontinuado con stock SÍ entra — es el
  -- candidato natural a liquidar, y Existencias también lo muestra.
  where v.activo
    and v.id <> (select centinela from params)
),
stock_ub as (
  -- Una fila por (variante, ubicación); NULL de sububicación es un valor real
  -- (el Taller entero vive ahí, y también los reingresos de anulación).
  select s.variante_id, s.ubicacion_id,
    coalesce(sum(s.cantidad) filter (where su.tipo = 'piso_venta'), 0)::integer as piso,
    coalesce(sum(s.cantidad) filter (where su.tipo = 'almacen_tienda'), 0)::integer as almacen,
    coalesce(sum(s.cantidad) filter (where s.sububicacion_id is null), 0)::integer as sin_sub,
    coalesce(sum(s.cantidad) filter (where su.tipo = 'cuarentena'), 0)::integer as cuarentena,
    coalesce(sum(s.cantidad) filter (where su.tipo is distinct from 'cuarentena'), 0)::integer as disponible
  from stock s
  left join sububicaciones su on su.id = s.sububicacion_id
  join ubicaciones_activas ua on ua.id = s.ubicacion_id
  where s.variante_id <> (select centinela from params)
  group by s.variante_id, s.ubicacion_id
),
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
  where m.created_at >= (select ts from desde)
    and m.variante_id <> (select centinela from params)
    and (m.venta_item_id is not null or m.cambio_id is not null or m.devolucion_item_id is not null)
),
demanda as (
  select d.variante_id, d.ubicacion_id,
    coalesce(sum(d.cantidad) filter (where d.clase = 'venta'), 0)::integer as ventas,
    coalesce(sum(d.cantidad) filter (where d.clase = 'devolucion'), 0)::integer as devoluciones,
    max(d.created_at) filter (where d.clase = 'venta') as ultima_venta
  from demanda_filas d
  where d.clase is not null
  group by d.variante_id, d.ubicacion_id
),
flujo as (
  -- Para sell-through y explicaciones: qué entró de verdad a la sede en la
  -- ventana (recepción, producción, traslado recibido, carga inicial) y qué
  -- se perdió (mermas y salidas de cuarentena que no fueron venta). Un ajuste
  -- 'reposicion' del modal de Existencias es "encontré más", no mercadería
  -- recibida: no cuenta como entrada.
  select m.variante_id, m.ubicacion_id,
    coalesce(sum(m.cantidad) filter (
      where m.tipo = 'entrada' and (m.lote_id is not null or m.produccion_id is not null
        or m.transferencia_recepcion_id is not null or m.motivo = 'carga_inicial')
    ), 0)::integer as entradas,
    coalesce(sum(abs(m.cantidad)) filter (
      where (m.tipo = 'ajuste' and m.cantidad < 0 and m.motivo = 'merma')
         or (m.tipo = 'salida' and m.motivo in ('cuarentena_se_boto', 'cuarentena_donada'))
    ), 0)::integer as mermas,
    -- Lo que salió hacia otra sede: ni vendido ni perdido, pero ya no está acá
    -- (entra al denominador del sell-through por conservación de unidades).
    coalesce(sum(m.cantidad) filter (
      where m.tipo = 'salida' and (m.transferencia_item_id is not null or m.motivo = 'traslado_salida')
    ), 0)::integer as traslados_salida
  from movimientos m
  where m.created_at >= (select ts from desde)
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
    min(t.fecha_estimada_llegada) filter (where now() <= t.fecha_estimada_llegada) as proxima_llegada
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
    pi.primer_ingreso,
    case when pi.primer_ingreso is null then null
      else least(
        (select ventana from params),
        greatest(((select hoy from params) - (pi.primer_ingreso at time zone 'America/Lima')::date) + 1, 1)
      ) end as dias_observables,
    coalesce(de.ventas, 0) as ventas, coalesce(de.devoluciones, 0) as devoluciones, de.ultima_venta,
    coalesce(fl.entradas, 0) as entradas, coalesce(fl.mermas, 0) as mermas, coalesce(fl.traslados_salida, 0) as traslados_salida,
    coalesce(ec.unidades, 0) as en_camino, coalesce(ec.a_tiempo, 0) as en_camino_a_tiempo,
    coalesce(ec.atrasado, false) as en_camino_atrasado, ec.proxima_llegada
  from universo u
  cross join ubicaciones_activas ua
  left join stock_ub st on st.variante_id = u.variante_id and st.ubicacion_id = ua.id
  left join primer_ingreso pi on pi.variante_id = u.variante_id and pi.ubicacion_id = ua.id
  left join demanda de on de.variante_id = u.variante_id and de.ubicacion_id = ua.id
  left join flujo fl on fl.variante_id = u.variante_id and fl.ubicacion_id = ua.id
  left join en_camino ec on ec.variante_id = u.variante_id and ec.ubicacion_id = ua.id
),
-- "En la red" agregado UNA vez por variante (group by), no una subconsulta
-- correlacionada por fila: con 5.000 variantes esa versión recorría la CTE
-- materializada 5.000 veces (5,5 s); así son ~100 ms — verificado en la
-- revisión de ADR-0097. Solo un líder ve las otras sedes: un integrante
-- opera la suya y no tiene por qué leer ventas ajenas por esta vía.
en_red_agg as (
  select o.variante_id,
    jsonb_agg(jsonb_build_object(
      'ubicacion_id', o.ubicacion_id,
      'nombre', o.nombre,
      'tipo', o.tipo,
      'separa_piso_almacen', o.separa,
      'disponible', o.disponible,
      'almacen', case when o.separa then o.almacen else o.disponible end,
      'dias_observables', o.dias_observables,
      'ventas_ventana', o.ventas,
      'devoluciones_ventana', o.devoluciones,
      'en_camino', o.en_camino
    ) order by o.disponible desc, o.nombre) as en_red
  from por_ubicacion o
  where o.ubicacion_id <> p_ubicacion_id
    and (o.disponible > 0 or o.en_camino > 0)
    and fn_es_lider()
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
  coalesce(er.en_red, '[]'::jsonb) as en_red
from universo u
join por_ubicacion aqui on aqui.variante_id = u.variante_id and aqui.ubicacion_id = p_ubicacion_id
left join en_red_agg er on er.variante_id = u.variante_id
where (select ok from permiso)
  -- Solo lo que tiene que ver con ESTA sede: alguna vez ingresó, tiene stock,
  -- viene en camino o vendió en la ventana. Una variante que jamás pisó la
  -- sede no es una "curva rota" de esa sede ni cuenta para su salud.
  and (aqui.disponible > 0 or aqui.en_camino > 0 or aqui.ventas > 0 or aqui.primer_ingreso is not null)
-- Orden estable (variante_id al final) porque el cliente pagina con Range:
-- PostgREST corta en max_rows (1.000) sin avisar.
order by u.referencia, u.color_nombre, u.talla, u.variante_id;
$$;

comment on function retail.fn_resumen_variantes(uuid, integer) is
  'Agregados crudos por variante para una ubicación (stock por sububicación, demanda neta de la ventana observable, en camino, y lo mismo de las otras sedes en jsonb). Las reglas viven en apps/web/lib/resumen-reglas.ts. Ver ADR-0097.';

revoke all on function retail.fn_resumen_variantes(uuid, integer) from public;
grant execute on function retail.fn_resumen_variantes(uuid, integer) to authenticated;
