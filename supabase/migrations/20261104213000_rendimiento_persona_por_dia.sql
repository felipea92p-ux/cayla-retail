-- ============================================================================
-- 20261104213000 — Rendimiento: lo de cada persona, día por día (ADR-0610)
--
-- EL PROBLEMA PRIMERO. La pantalla nueva de Rendimiento deja elegir cualquier tramo de días y compara a cada persona contra su meta de ESOS días.
-- `fn_metas_equipo` solo entrega tres cortes ya sumados (hoy, 7 días y el mes), y `fn_rendimiento_serie` y `fn_rendimiento_detalle` son de la tienda.
-- Sin el dato por persona y por día, la pantalla tendría que inventar el reparto.
--
-- CONTRATO (Liskov)
--   PROMETE: `retail.fn_rendimiento_persona_dias(p_ubicacion_id, p_desde, p_hasta)` devuelve una fila por persona y día que tenga meta o ventas:
--            nº de ventas, soles con IGV, prendas y su meta de ese día (`fn_metas_por_dia`, con el ajuste de la líder). «Venta que cuenta» es la de
--            `fn_rendimiento_serie` (completada, no de prueba, solo lo de CAYLA: ADR-0560), así que la suma de un día cuadra con la serie de la tienda.
--            Una venta sin quien atendió sale con `persona_id` nulo: no se pierde. Quien vendió y ya no está en el equipo sale con su nombre y sin meta.
--            Solo para tiendas de `fn_rendimiento_ubicaciones()`; a otra tienda, 42501. Un rango roto o de más de 92 días, 22023.
--   ASUME:   (a) el día es el de Lima; (b) `venta_items.cantidad` son las prendas; (c) `fn_metas_por_dia` reparte por horas o, sin horarios, en partes iguales.
--   NO HACE: no escribe nada; no toca tablas ni políticas; no decide quién va adelante (eso lo dice `rendimiento-vista-reglas.ts`).
--
-- ORDEN DE MAGNITUD: 7 personas × 92 días = 644 filas como máximo por tienda.
-- CONCURRENCIA: solo lectura (STABLE). Una venta que entra mientras se lee aparece en la próxima lectura.
-- CAÍDA EXTERNA: no toca nada de afuera. Si la función no existe todavía, la pantalla sigue con lo que ya lee y sin la vista por persona (lib/rendimiento.ts).
-- CÓMO SE PEGA EN PRODUCCIÓN: una sola ejecución; `create or replace function` no toma tablas en exclusiva. No lleva políticas.
-- CÓMO SE REVIERTE: `drop function retail.fn_rendimiento_persona_dias(uuid, date, date);`
-- ============================================================================

create or replace function retail.fn_rendimiento_persona_dias(p_ubicacion_id uuid, p_desde date, p_hasta date)
returns table (persona_id uuid, nombre text, fecha date, meta_dia numeric, ventas integer, total numeric, prendas integer)
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
    with md as (
      select m.persona_id as pid, m.fecha as dia, m.meta_dia as meta
        from retail.fn_metas_por_dia(p_ubicacion_id, p_desde, p_hasta) m
       where m.fecha between p_desde and p_hasta
    ),
    vd as (
      select vt.asesora_id as pid,
             (vt.created_at at time zone 'America/Lima')::date as dia,
             count(distinct vt.id)::integer as n,
             coalesce(sum(vi.subtotal), 0)::numeric as t,
             coalesce(sum(vi.cantidad), 0)::integer as pr
        from retail.ventas vt
        join retail.venta_items vi on vi.venta_id = vt.id
       where vt.ubicacion_id = p_ubicacion_id and vt.estado = 'completada' and not vt.es_prueba
         and vt.created_at >= (p_desde::timestamp at time zone 'America/Lima')
         and vt.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
         and not retail.fn_item_es_de_claure(vi.id, vt.ubicacion_id, vt.created_at)
       group by 1, 2
    ),
    junto as (
      select coalesce(md.pid, vd.pid) as pid, coalesce(md.dia, vd.dia) as dia, md.meta,
             coalesce(vd.n, 0) as n, coalesce(vd.t, 0::numeric) as t, coalesce(vd.pr, 0) as pr
        from md
        full join vd on vd.pid = md.pid and vd.dia = md.dia
       where coalesce(md.meta, 0) > 0 or vd.dia is not null
    )
    select j.pid,
           case when j.pid is null then null
                else coalesce(nullif(trim(p.nombres || ' ' || left(coalesce(p.apellidos, ''), 1) || '.'), '.'), 'Sin nombre') end,
           j.dia, j.meta, j.n, j.t, j.pr
      from junto j
      left join public.personas p on p.id = j.pid
     order by j.dia, j.pid;
end;
$fn$;

comment on function retail.fn_rendimiento_persona_dias(uuid, date, date) is
  'ADR-0610: lo de cada persona de una tienda, día por día: ventas, soles con IGV, prendas y su meta de ese día. Cuadra con fn_rendimiento_serie. persona_id nulo = venta sin quien atendió. Solo tiendas de fn_rendimiento_ubicaciones(); rango de hasta 92 días.';

revoke all on function retail.fn_rendimiento_persona_dias(uuid, date, date) from public, anon;
grant execute on function retail.fn_rendimiento_persona_dias(uuid, date, date) to authenticated;
