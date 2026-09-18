-- ============================================================================
-- listar_compras: filtro por tipo de documento (factura/boleta/nota_venta)
--
-- `compras.tipo` existe desde 20260912231956_compras_desde_factura.sql
-- (columna con CHECK, la elige el colaborador al registrar en CompraFormV2),
-- pero `listar_compras` nunca aceptó filtrar por ella — la lista de
-- Facturas de proveedores no tenía forma de aislar "solo boletas" o "solo
-- notas de venta". Se agrega `p_tipo` al final de la firma (default null)
-- para que sea un `create or replace` sin DROP: los parámetros existentes
-- no cambian de posición ni de tipo, así que Postgres reemplaza la función
-- en el lugar y PostgREST sigue resolviendo la misma llamada por nombre.
--
-- Sin índice nuevo: `tipo` es un filtro adicional sobre lo que los índices
-- existentes (compras_orden_idx y compañía) ya acotan por fecha/estado — al
-- volumen de CAYLA (3 tiendas + 1 taller) un predicado extra sobre esas
-- filas no compite con un scan completo (principio 5, no sobre-construir
-- para el volumen que nunca llega). Si el día de mañana hace falta, se mide
-- y se agrega, no antes.
--
-- DROP + CREATE, no `create or replace`: un parámetro nuevo cambia la firma
-- (aunque tenga default), y `create or replace` con otra firma crea una
-- SEGUNDA sobrecarga en vez de reemplazar la primera — PostgREST y el
-- `grant` sin lista de tipos quedan ambiguos entre las dos. Mismo motivo
-- que documentó 20260914220000_compras_orden_por_creacion.sql.
-- ============================================================================

set search_path = retail, public, extensions;

drop function retail.listar_compras(integer, date, timestamptz, uuid, text, text, uuid, text, text, text, boolean, boolean, boolean, boolean, date, date);

create function retail.listar_compras(
  p_limite integer default 50,
  p_cursor_fecha date default null,
  p_cursor_creado_en timestamptz default null,
  p_cursor_id uuid default null,
  p_orden text default 'emision',
  p_busqueda text default null,
  p_proveedor_id uuid default null,
  p_estado_pago text default null,
  p_estado_recepcion text default null,
  p_condicion text default null,
  p_solo_vigentes boolean default false,
  p_con_saldo boolean default false,
  p_solo_vencidas boolean default false,
  p_por_recibir boolean default false,
  p_desde date default null,
  p_hasta date default null,
  p_tipo text default null
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
  if v_busqueda is not null then
    select coalesce(array_agg(id), '{}') into v_proveedores from proveedores where nombre ilike '%' || v_busqueda || '%';
  end if;
  if p_orden = 'vencimiento' then
    return query
      select r.*
      from compras_resumen r
      where (v_busqueda is null or r.documento ilike '%' || v_busqueda || '%' or r.proveedor_id = any(v_proveedores))
        and (p_proveedor_id is null or r.proveedor_id = p_proveedor_id)
        and (p_estado_pago is null or r.estado_pago = p_estado_pago)
        and (p_estado_recepcion is null or r.estado_recepcion = p_estado_recepcion)
        and (p_condicion is null or r.condicion = p_condicion)
        and (p_tipo is null or r.tipo = p_tipo)
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
        and (p_tipo is null or r.tipo = p_tipo)
        and (not p_solo_vigentes or r.estado = 'vigente')
        and (not p_con_saldo or (r.estado = 'vigente' and r.saldo > 0))
        and (not p_solo_vencidas or (r.estado = 'vigente' and r.saldo > 0 and r.fecha_vencimiento < current_date))
        and (not p_por_recibir or (r.estado = 'vigente' and r.estado_recepcion in ('sin_recibir', 'parcial')))
        and (p_desde is null or r.fecha_emision >= p_desde)
        and (p_hasta is null or r.fecha_emision <= p_hasta)
        and (p_cursor_id is null or (r.fecha_emision, r.created_at, r.id) < (p_cursor_fecha, p_cursor_creado_en, p_cursor_id))
      order by r.fecha_emision desc, r.created_at desc, r.id desc
      limit v_limite;
  end if;
end;
$$;

grant execute on function retail.listar_compras to authenticated;
