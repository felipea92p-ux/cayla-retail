-- ============================================================================
-- RENDIMIENTO · DETALLE POR HORA — «ventas por hora» y «prendas por venta» de una tienda
-- ----------------------------------------------------------------------------
-- Segunda etapa de la propuesta final de Rendimiento (docs/maquetas/rendimiento-vistas-2026-10/rendimiento-final.html). SOLO agrega una
-- función de lectura: no toca ninguna tabla, política ni función existente, así que se pega en producción de una sola vez, sin partes ni
-- candados (`create or replace function` no toma bloqueos de tablas).
--
-- PROMETE: `retail.fn_rendimiento_detalle(p_ubicacion_id, p_desde, p_hasta)` devuelve, por cada día y cada hora de Lima en que hubo ventas, lo que
--   vendió LA TIENDA: nº de ventas, soles (con IGV) y prendas. Una fila por (día, hora) CON ventas: las horas sin ventas no vienen (la web las
--   rellena con 0). La definición de «venta que cuenta» es la de `fn_rendimiento_serie`: completada y no de prueba, así que el total de un día
--   cuadra con el de la serie. Solo para tiendas de `fn_rendimiento_ubicaciones()` (el mismo alcance de Rendimiento); a otra tienda, 42501.
--   Es de la TIENDA, no de una persona: sirve para repartir turnos («en qué franja se vende»), no para juzgar a nadie.
--
-- ASUME: (1) que `venta_items.cantidad` son las prendas (una fila por variante vendida); (2) que el día y la hora son los de Lima, que va cinco
--   horas detrás de UTC todo el año; (3) rangos de hasta 92 días, como `fn_rendimiento_serie`.
--
-- ORDEN DE MAGNITUD: una tienda hace unas decenas de ventas al día y abre unas 12 horas: un mes son como 12 × 30 = 360 filas como máximo.
--
-- CONCURRENCIA: solo lectura (STABLE). Una venta que entra mientras se lee aparece en la próxima lectura.
-- CAÍDA EXTERNA: no toca nada de afuera. Si la función no existe todavía (la web se publicó antes que esta migración), el panel de Rendimiento
--   sigue con lo demás y las dos medidas no se dibujan (nunca como 0).
-- CÓMO SE REVIERTE: `drop function retail.fn_rendimiento_detalle(uuid, date, date);` (nada más depende de ella salvo el panel de Rendimiento).
-- ============================================================================

create or replace function retail.fn_rendimiento_detalle(p_ubicacion_id uuid, p_desde date, p_hasta date)
returns table (fecha date, hora integer, ventas integer, total numeric, prendas integer)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
#variable_conflict use_column
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 92 then
    raise exception 'El rango de fechas no es válido' using errcode = '22023';
  end if;
  if p_ubicacion_id is null or not (p_ubicacion_id = any (coalesce(retail.fn_rendimiento_ubicaciones(), '{}'::uuid[]))) then
    raise exception 'No puedes ver el rendimiento de esa tienda' using errcode = '42501';
  end if;
  return query
    select (vt.created_at at time zone 'America/Lima')::date,
           extract(hour from vt.created_at at time zone 'America/Lima')::integer,
           count(distinct vt.id)::integer,
           coalesce(sum(vi.subtotal), 0)::numeric,
           coalesce(sum(vi.cantidad), 0)::integer
      from retail.ventas vt
      join retail.venta_items vi on vi.venta_id = vt.id
     where vt.ubicacion_id = p_ubicacion_id and vt.estado = 'completada' and not vt.es_prueba
       and vt.created_at >= (p_desde::timestamp at time zone 'America/Lima')
       and vt.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
     group by 1, 2
     order by 1, 2;
end;
$fn$;

comment on function retail.fn_rendimiento_detalle(uuid, date, date) is
  'Lo que vendió la tienda por día y por hora de Lima: nº de ventas, soles con IGV y prendas (completadas y no de prueba, como fn_rendimiento_serie). Una fila por día y hora con ventas. Solo tiendas de fn_rendimiento_ubicaciones() de quien pregunta. security definer, stable.';

revoke all on function retail.fn_rendimiento_detalle(uuid, date, date) from public, anon;
grant execute on function retail.fn_rendimiento_detalle(uuid, date, date) to authenticated;
