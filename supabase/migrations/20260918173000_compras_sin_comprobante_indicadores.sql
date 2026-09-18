-- ============================================================================
-- Ingreso sin comprobante: controlar lo que entra sin respaldo
-- (ADR-0106, sección «Lectura»)
--
-- EL PROBLEMA. `recibir_lote` (mercadería que llega sin comprobante todavía, o
-- muestras/obsequios) es el único camino por donde entra stock sin que quede
-- deuda ni costo detrás. Hoy la pantalla es un formulario y una lista sin
-- cifras: nadie ve cuánto entró así este mes, ni cuánto de eso quedó SIN COSTO
-- — y una prenda sin costo distorsiona el margen (el costo promedio ponderado
-- solo cuenta lo que se registró).
--
-- CÓMO REGISTRA EL COSTO `recibir_lote` (verificado contra la función viva, no
-- contra la maqueta): por cada ítem crea un movimiento `entrada`/`recepcion`
-- ligado al lote y, SOLO si el ítem trae `costo_unitario`, llama a
-- `fn_recalcular_costo_variante`, que deja una fila en `costo_historial` con ese
-- `movimiento_id` (una por movimiento: unique). Sin costo → no hay fila.
--
-- DEFINICIONES (las lee la interfaz):
--   · Lote SIN COMPROBANTE = lote donde NINGÚN movimiento tiene `compra_item_id`.
--     Un lote de `recibir_compras` (contra comprobante) que además trae líneas
--     «fuera de comprobante» sigue siendo una recepción con comprobante: entra en
--     `listar_recepciones_compras`, no acá.
--   · SIN COSTO = movimiento de un lote sin comprobante que NO dejó fila en
--     `costo_historial`. Un costo registrado en 0 (un obsequio) SÍ es costo: es
--     una decisión explícita; lo que se marca es la omisión.
--   · unidades_sin_costo_mes = Σ cantidad de esos movimientos, en lotes del mes.
--     Por lote, `sin_costo` = true si AL MENOS un movimiento del lote quedó sin
--     costo (para que «Completar costo» siga visible en un lote a medias);
--     `costo_unitario_promedio` = promedio ponderado por unidades de los
--     movimientos que SÍ tienen costo (NULL si ninguno). Coinciden con la cifra
--     de la cabecera: un lote con `sin_costo` aporta a `unidades_sin_costo_mes`.
--   · «Mes» = mes calendario de Lima (fn_hoy_lima()); las unidades y recepciones
--     cuentan por fecha del lote en hora de Lima. `ultima_recepcion` y
--     `ultima_ubicacion` NO se limitan al mes: es la última que hubo, siempre.
--
-- CANDADO DE SEDE: `fn_puede_operar_ubicacion(lotes.ubicacion_id)` — el mismo de
-- `recibir_lote` y de la política de `lotes` — más `p_ubicacion_id` si se pide
-- una sede. `security definer` se salta la RLS, así que se repite a mano.
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. las 3 cifras de la cabecera ====================
create or replace function retail.resumen_sin_comprobante(p_ubicacion_id uuid default null)
returns table (
  unidades_mes bigint,
  recepciones_mes integer,
  unidades_sin_costo_mes bigint,
  ultima_recepcion timestamptz,
  ultima_ubicacion text
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  with lotes_sc as (
    select l.id as lote, l.fecha_recepcion as recibido_en, l.ubicacion_id as ubicacion
    from lotes l
    where not exists (select 1 from movimientos m where m.lote_id = l.id and m.compra_item_id is not null)
      and fn_puede_operar_ubicacion(l.ubicacion_id)
      and (p_ubicacion_id is null or l.ubicacion_id = p_ubicacion_id)
  ),
  del_mes as (
    select s.lote from lotes_sc s
    where (s.recibido_en at time zone 'America/Lima')::date >= date_trunc('month', fn_hoy_lima())::date
  ),
  unidades as (
    select m.cantidad, (ch.id is null) as sin_costo
    from del_mes d
    join movimientos m on m.lote_id = d.lote and m.tipo = 'entrada'
    left join costo_historial ch on ch.movimiento_id = m.id
  )
  select
    coalesce((select sum(u.cantidad) from unidades u), 0)::bigint,
    (select count(*) from del_mes)::integer,
    coalesce((select sum(u.cantidad) from unidades u where u.sin_costo), 0)::bigint,
    (select max(s.recibido_en) from lotes_sc s),
    (select ub.nombre from lotes_sc s join ubicaciones ub on ub.id = s.ubicacion
       order by s.recibido_en desc, s.lote asc limit 1)
  where auth.uid() is not null;
$$;

comment on function retail.resumen_sin_comprobante(uuid) is
  'Una fila: unidades y recepciones sin comprobante del mes (Lima), unidades sin costo registrado, y la última recepción (no limitada al mes). Sin comprobante = lote sin ningún movimiento contra una línea de comprobante; sin costo = movimiento sin fila en costo_historial. Acotada por sede. ADR-0106.';

revoke all on function retail.resumen_sin_comprobante(uuid) from public, anon;
grant execute on function retail.resumen_sin_comprobante(uuid) to authenticated;

-- ==================== 2. la lista, un lote por fila ====================
create or replace function retail.recepciones_sin_comprobante(
  p_ubicacion_id uuid default null,
  p_limite integer default 20
)
returns table (
  lote_id uuid,
  fecha_recepcion timestamptz,
  ubicacion_nombre text,
  proveedor_nombre text,
  numero_guia text,
  nota text,
  recibido_por uuid,
  unidades integer,
  costo_unitario_promedio numeric,
  sin_costo boolean
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select
    l.id,
    l.fecha_recepcion,
    ub.nombre,
    pr.nombre,
    l.numero_guia,
    l.nota,
    l.recibido_por,
    sum(m.cantidad)::integer,
    round(
      sum(m.cantidad * ch.costo_unitario_nuevo) filter (where ch.id is not null)
      / nullif(sum(m.cantidad) filter (where ch.id is not null), 0),
      2
    ),
    bool_or(ch.id is null)
  from lotes l
  join ubicaciones ub on ub.id = l.ubicacion_id
  join proveedores pr on pr.id = l.proveedor_id
  join movimientos m on m.lote_id = l.id and m.tipo = 'entrada'
  left join costo_historial ch on ch.movimiento_id = m.id
  where auth.uid() is not null
    and not exists (select 1 from movimientos x where x.lote_id = l.id and x.compra_item_id is not null)
    and fn_puede_operar_ubicacion(l.ubicacion_id)
    and (p_ubicacion_id is null or l.ubicacion_id = p_ubicacion_id)
  group by l.id, l.fecha_recepcion, ub.nombre, pr.nombre, l.numero_guia, l.nota, l.recibido_por
  order by l.fecha_recepcion desc, l.id asc
  limit greatest(1, least(coalesce(p_limite, 20), 200));
$$;

comment on function retail.recepciones_sin_comprobante(uuid, integer) is
  'Recepciones sin comprobante, una fila por lote, más recientes primero (máx. 200): unidades, costo unitario promedio ponderado de lo que tiene costo y sin_costo = algún movimiento sin costo registrado. Acotada por sede. ADR-0106.';

revoke all on function retail.recepciones_sin_comprobante(uuid, integer) from public, anon;
grant execute on function retail.recepciones_sin_comprobante(uuid, integer) to authenticated;
