-- ADR-0319 · Caja compara el día de hoy contra ayer. Una lectura NUEVA, de solo lectura: no toca ninguna tabla.
-- Devuelve cada pago de las ventas completadas de una sede en un día de Lima, con el minuto del día en que se hizo, para que
-- la pantalla compare «hasta esta misma hora» con exactitud (sin prorratear). Mismas reglas que fn_resumen_caja: sin ventas
-- anuladas y sobre TODAS las cajas de la sede ese día. Quién pregunta: líder (cualquier sede) o la sede de la cuenta.
set search_path = retail, public, extensions;

create or replace function retail.fn_comparativa_caja(p_ubicacion_id uuid, p_dia date)
returns table(venta_id uuid, minuto integer, metodo text, monto numeric)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select v.id,
         (extract(hour from v.created_at at time zone 'America/Lima') * 60
          + extract(minute from v.created_at at time zone 'America/Lima'))::integer,
         vp.metodo,
         vp.monto
  from ventas v
  join venta_pagos vp on vp.venta_id = v.id
  where fn_puede_operar_ubicacion(p_ubicacion_id)
    and v.ubicacion_id = p_ubicacion_id
    and v.estado = 'completada'
    -- Rango de created_at (usa el índice por sede y fecha), no `(created_at at time zone …)::date = …`.
    and v.created_at >= (p_dia::timestamp at time zone 'America/Lima')
    and v.created_at <  ((p_dia + 1)::timestamp at time zone 'America/Lima')
  order by v.created_at, v.id;
$$;

revoke all on function retail.fn_comparativa_caja(uuid, date) from public, anon;
grant execute on function retail.fn_comparativa_caja(uuid, date) to authenticated;
