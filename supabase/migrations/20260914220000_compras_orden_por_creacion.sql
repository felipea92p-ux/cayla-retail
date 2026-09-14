-- ============================================================================
-- Lista de compras: entre facturas del mismo día, la registrada más
-- recientemente va primera
--
-- EL PROBLEMA. La lista ordena por `fecha_emision desc, id desc`. Pero
-- `compras.id` es un uuid aleatorio (`gen_random_uuid()`): entre las 4
-- facturas emitidas el 14/09 el orden era un sorteo, y una factura recién
-- registrada podía aparecer en tercer lugar debajo de otras del mismo día.
-- El `id` servía para que el cursor del paginado fuera estable (nunca repite
-- ni salta filas), no para decir cuál se registró después.
--
-- LA SOLUCIÓN. Desempatar por `created_at` (cuándo la registró el
-- colaborador, microsegundos) y dejar `id` al final solo como garantía de
-- unicidad absoluta. El orden pasa a ser
--     fecha_emision desc, created_at desc, id desc
-- y el cursor del paginado a (fecha_emision, created_at, id), para que la
-- página siguiente arranque exactamente donde terminó la anterior.
--
-- Los cuatro índices que sostienen ese orden se recrean con `created_at` en
-- la misma posición: si no, el ORDER BY nuevo deja de calzar con el índice y
-- Postgres vuelve a leer todo, ordenar en memoria y quedarse con 50 — lo que
-- la migración `compras_snapshot_y_paginado` evitó a propósito.
--
-- La rama 'vencimiento' ("Por pagar") no cambia: ahí el desempate por fecha
-- de registro no aporta nada al colaborador.
--
-- La función cambia de firma (parámetro nuevo `p_cursor_creado_en`), así que
-- hay que DROP + CREATE: un `create or replace` con otra lista de parámetros
-- crea una segunda función en vez de reemplazar la primera, y PostgREST no
-- sabe a cuál llamar.
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. índices con el desempate nuevo ====================
drop index if exists compras_orden_idx;
drop index if exists compras_estado_pago_idx;
drop index if exists compras_estado_recepcion_idx;
drop index if exists compras_condicion_idx;

create index compras_orden_idx on compras (fecha_emision desc, created_at desc, id desc);
create index compras_estado_pago_idx on compras (estado_pago, fecha_emision desc, created_at desc, id desc);
create index compras_estado_recepcion_idx on compras (estado_recepcion, fecha_emision desc, created_at desc, id desc);
create index compras_condicion_idx on compras (condicion, fecha_emision desc, created_at desc, id desc);

-- ==================== 2. listar_compras con cursor de tres partes ====================
drop function retail.listar_compras(integer, date, uuid, text, text, uuid, text, text, text, boolean, boolean, boolean, boolean, date, date);

create function retail.listar_compras(
  p_limite integer default 50,
  p_cursor_fecha date default null,
  p_cursor_creado_en timestamptz default null, -- solo lo usa el orden 'emision'
  p_cursor_id uuid default null,
  p_orden text default 'emision',          -- 'emision' (desc) | 'vencimiento' (asc)
  p_busqueda text default null,            -- documento o nombre de proveedor
  p_proveedor_id uuid default null,
  p_estado_pago text default null,
  p_estado_recepcion text default null,
  p_condicion text default null,
  p_solo_vigentes boolean default false,
  p_con_saldo boolean default false,
  p_solo_vencidas boolean default false,
  p_por_recibir boolean default false,
  p_desde date default null,
  p_hasta date default null
)
returns setof retail.compras_resumen
language plpgsql stable
set search_path = retail, public, extensions
as $$
declare
  v_limite integer := greatest(1, least(coalesce(p_limite, 50), 200)) + 1;
  v_busqueda text := nullif(trim(p_busqueda), '');
  v_proveedores uuid[];
begin
  -- Los proveedores que matchean se resuelven ANTES, a un array: así el OR
  -- de abajo queda entre dos condiciones simples sobre `compras` (trigram en
  -- documento + btree en proveedor_id), que Postgres combina en un BitmapOr.
  -- Con un `in (select ...)` dentro del OR no puede, y lee toda la tabla.
  if v_busqueda is not null then
    select coalesce(array_agg(id), '{}') into v_proveedores from proveedores where nombre ilike '%' || v_busqueda || '%';
  end if;
  -- Dos consultas estáticas en vez de una con ORDER BY dinámico: un
  -- `order by case ...` no puede usar índice para ordenar, y a un millón de
  -- filas eso es leer todo, ordenar en memoria y quedarse con 50.
  if p_orden = 'vencimiento' then
    return query
      select r.*
      from compras_resumen r
      where (v_busqueda is null or r.documento ilike '%' || v_busqueda || '%' or r.proveedor_id = any(v_proveedores))
        and (p_proveedor_id is null or r.proveedor_id = p_proveedor_id)
        and (p_estado_pago is null or r.estado_pago = p_estado_pago)
        and (p_estado_recepcion is null or r.estado_recepcion = p_estado_recepcion)
        and (p_condicion is null or r.condicion = p_condicion)
        and (not p_solo_vigentes or r.estado = 'vigente')
        and (not p_con_saldo or (r.estado = 'vigente' and r.saldo > 0))
        and (not p_solo_vencidas or (r.estado = 'vigente' and r.saldo > 0 and r.fecha_vencimiento < current_date))
        and (not p_por_recibir or (r.estado = 'vigente' and r.estado_recepcion in ('sin_recibir', 'parcial')))
        and (p_desde is null or r.fecha_emision >= p_desde)
        and (p_hasta is null or r.fecha_emision <= p_hasta)
        and (p_cursor_id is null or (r.fecha_vencimiento, r.id) > (p_cursor_fecha, p_cursor_id))
      order by r.fecha_vencimiento asc nulls last, r.id asc
      limit v_limite;
  else
    return query
      select r.*
      from compras_resumen r
      where (v_busqueda is null or r.documento ilike '%' || v_busqueda || '%' or r.proveedor_id = any(v_proveedores))
        and (p_proveedor_id is null or r.proveedor_id = p_proveedor_id)
        and (p_estado_pago is null or r.estado_pago = p_estado_pago)
        and (p_estado_recepcion is null or r.estado_recepcion = p_estado_recepcion)
        and (p_condicion is null or r.condicion = p_condicion)
        and (not p_solo_vigentes or r.estado = 'vigente')
        and (not p_con_saldo or (r.estado = 'vigente' and r.saldo > 0))
        and (not p_solo_vencidas or (r.estado = 'vigente' and r.saldo > 0 and r.fecha_vencimiento < current_date))
        and (not p_por_recibir or (r.estado = 'vigente' and r.estado_recepcion in ('sin_recibir', 'parcial')))
        and (p_desde is null or r.fecha_emision >= p_desde)
        and (p_hasta is null or r.fecha_emision <= p_hasta)
        -- Cursor de tres partes: sin `created_at` acá, dos facturas del mismo
        -- día podrían repetirse o saltarse al cambiar de página.
        and (p_cursor_id is null or (r.fecha_emision, r.created_at, r.id) < (p_cursor_fecha, p_cursor_creado_en, p_cursor_id))
      order by r.fecha_emision desc, r.created_at desc, r.id desc
      limit v_limite;
  end if;
end;
$$;

grant execute on function retail.listar_compras to authenticated;
