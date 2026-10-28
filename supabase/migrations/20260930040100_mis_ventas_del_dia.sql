-- ============================================================================
-- MIS VENTAS DE HOY — «Tus ventas» del Inicio deja de mostrar el total de la tienda
-- ----------------------------------------------------------------------------
-- Primer paso de la meta por persona (docs/maquetas/rendimiento-meta-2026-09/). No toca ninguna tabla ni ninguna
-- función existente: SOLO agrega una función de lectura. Se puede pegar en producción sin partes ni candados
-- (`create or replace function` no toma bloqueos sobre tablas, y no hay políticas).
--
-- PROMETE: `retail.fn_mis_ventas_del_dia(p_ubicacion_id)` devuelve las ventas de HOY (día de Lima) cuya asesora
--   —`ventas.asesora_id`, quien atendió a la clienta, ADR-0219— es QUIEN PREGUNTA, una fila por venta con su total.
--   Nunca devuelve las de otra persona, tampoco cuando quien pregunta es líder: para el total de la tienda está
--   `fn_ventas_del_dia`, que NO cambia. Una terminal es un aparato, no una persona: 0 filas, sin error.
--
-- ASUME: (1) que `ventas.asesora_id` dice quién atendió: el Punto de venta no deja cobrar sin elegirla desde el
--   2026-09-22. (2) Que «una venta que cuenta» es la misma de Rendimiento (ADR-0219, punto 2): completada y no de
--   prueba. Así lo que una integrante ve de sí misma y lo que la encargada ve de ella en Rendimiento son el mismo número.
--   (3) `p_ubicacion_id` es opcional: sin él, todo el día de la persona aunque haya cubierto otra tienda.
--
-- POR QUÉ EXISTE (verificado en producción el 2026-09-29): `fn_ventas_del_dia`, para quien no es líder, devuelve TODAS las
--   ventas de su tienda (`not q.lider and v.ubicacion_id = q.mia`, sin mirar `asesora_id`). El Inicio la usaba para «Tus
--   ventas» y «Tu ticket»: cada colaboradora veía el día de toda la tienda con la etiqueta de «lo suyo». Caja, Vender y
--   Comprobantes siguen necesitando el día de la tienda, por eso no se cambia esa función: se agrega esta.
--
-- CONCURRENCIA: solo lectura (STABLE). Una venta que entra mientras se lee aparece en la próxima lectura.
-- CAÍDA EXTERNA: no toca nada de afuera. Si la función no existe todavía (la web se publicó antes que esta migración), la
--   pantalla dice «No se pudieron cargar las ventas de hoy»: prefiere no mostrar nada antes que mostrar el número de otra.
-- CÓMO SE REVIERTE: `drop function retail.fn_mis_ventas_del_dia(uuid);` (nada más depende de ella salvo el Inicio).
-- ============================================================================

create or replace function retail.fn_mis_ventas_del_dia(p_ubicacion_id uuid default null)
returns table (venta_id uuid, hora text, ubicacion_nombre text, total numeric, prendas integer)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- «Hoy» como RANGO de created_at desde la medianoche de Lima (usa ventas_ubicacion_fecha_idx, igual que fn_ventas_del_dia,
  -- ADR-0194). Quién soy se calcula UNA vez («materialized»). Una terminal no tiene persona: `fn_actor_persona_id` le
  -- exigiría un responsable, así que ni se llama (el CASE no evalúa la rama que no corresponde).
  with quien as materialized (
    select case
             when exists (select 1 from retail.fn_terminal_actual() t where t.id is not null) then null
             else retail.fn_actor_persona_id(false)
           end as yo,
           ((now() at time zone 'America/Lima')::date::timestamp at time zone 'America/Lima') as ini
  )
  select
    v.id,
    to_char(v.created_at at time zone 'America/Lima', 'HH24:MI'),
    u.nombre,
    (select coalesce(sum(vi.subtotal), 0) from retail.venta_items vi where vi.venta_id = v.id),
    (select coalesce(sum(vi.cantidad), 0)::integer from retail.venta_items vi where vi.venta_id = v.id)
  from quien q
  join retail.ventas v
    on q.yo is not null
   and v.asesora_id = q.yo
   and v.created_at >= q.ini and v.created_at < q.ini + interval '1 day'
  join retail.ubicaciones u on u.id = v.ubicacion_id
  where v.estado = 'completada'
    and not coalesce(v.es_prueba, false)
    and (p_ubicacion_id is null or v.ubicacion_id = p_ubicacion_id)
  order by v.created_at desc;
$$;

comment on function retail.fn_mis_ventas_del_dia(uuid) is
  'Las ventas de HOY (día de Lima) cuya asesora (ventas.asesora_id, quien atendió) es quien pregunta: completadas y no de prueba, como en Rendimiento (ADR-0219). Nunca las de otra persona, tampoco para un líder (el total de la tienda es fn_ventas_del_dia). Una terminal recibe 0 filas. p_ubicacion_id opcional.';

revoke all on function retail.fn_mis_ventas_del_dia(uuid) from public, anon;
grant execute on function retail.fn_mis_ventas_del_dia(uuid) to authenticated;

notify pgrst, 'reload schema';
