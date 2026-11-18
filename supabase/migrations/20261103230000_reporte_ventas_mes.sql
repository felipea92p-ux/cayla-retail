-- Ventas ▸ Reportes ▸ Ventas del mes: la lectura (Felipe, 2026-11-03; maqueta docs/maquetas/reportes-ventas-2026-11/).
--
-- `retail.fn_reporte_ventas_mes(p_mes, p_ubicacion)` devuelve, en UN jsonb, las cinco cifras del mes (vendido, ventas, prendas, devuelto y
-- el ticket que se saca de ellas) y las mismas cifras del TRAMO equivalente del mes anterior, para compararlas. Es de solo lectura.
--
-- QUÉ CUENTA COMO VENTA (la misma regla del Historial, ADR-0147; decisión de Felipe 2026-11-03):
--   · `estado = 'completada'` y `es_prueba = false`: las anuladas y las de prueba no suman.
--   · «Vendido» es la suma del `subtotal` de cada línea (lo cobrado, con su descuento: la base lo calcula, (precio − descuento) × cantidad).
--     Las bolsas son una venta real y suman.
--   · «Devuelto» es el reembolso de las devoluciones APROBADAS, en el día en que se aprobaron (`aprobado_en`; si falta, el de la solicitud):
--     la plata sale cuando se aprueba, no cuando se vendió. Una devolución de una venta de prueba no cuenta. Los cambios no entran todavía.
--   · Los días son los de Lima (`America/Lima`), no los del servidor.
--
-- EL TRAMO. Un mes cerrado se mide entero. El mes en curso se mide «a la fecha» (hasta hoy, inclusive) y se compara con los MISMOS días del
-- mes anterior, no con el mes entero (comparar 3 días contra 30 hace parecer que se vendió nada). Si el mes anterior es más corto que el tramo
-- (octubre entero contra septiembre), se compara con septiembre entero. Un mes futuro no trae ventas.
--
-- QUIÉN VE QUÉ. Es una función INVOKER: lee `ventas`, `venta_items` y `devoluciones` con las reglas de fila de siempre, así que el líder lee todas las
-- tiendas y quien tenga el módulo en un rol lee solo la suya (`fn_ubicacion_actual_persona()`), sin que esta función repita ese candado.
-- Además exige el módulo `reportes_ventas` (la puerta de la base, ADR-0161 B2): sin él, 42501. `p_ubicacion` (opcional) acota a una tienda;
-- una tienda que la cuenta no ve da ceros, no un error.
--
-- POR QUÉ SIN `security definer` NI `set search_path`: cada llamada a una función así dentro de una consulta cuesta mucho más que una
-- comparación, y esta lee todas las ventas del mes; todo va con su esquema escrito. Aprendido con la lectura de Tráfico (9,9 s → 436 ms).
-- Pegado en producción: es un `create or replace function` y dos permisos; no toma locks de `auth` ni `storage` (CLAUDE.md «Políticas y deadlocks»).
set lock_timeout = '3s';

create or replace function retail.fn_reporte_ventas_mes(p_mes date, p_ubicacion uuid default null)
returns jsonb
language plpgsql
stable
as $fn$
declare
  v_ini date;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_sig date;            -- primer día del mes siguiente
  v_fin date;            -- fin (exclusivo) del tramo del mes pedido
  v_prev_ini date;
  v_prev_fin date;       -- fin (exclusivo) del tramo equivalente del mes anterior
  v_primera date;
  v_res jsonb;
begin
  if p_mes is null then
    raise exception 'Falta el mes del reporte.' using errcode = '22023';
  end if;
  if not coalesce(retail.fn_ve_modulo('reportes_ventas'), false) then
    raise exception 'Tu rol no ve los Reportes de ventas.' using errcode = '42501';
  end if;

  v_ini := date_trunc('month', p_mes)::date;
  v_sig := (v_ini + interval '1 month')::date;
  v_fin := least(v_sig, v_hoy + 1);
  if v_fin < v_ini then v_fin := v_ini; end if;   -- mes futuro: tramo vacío
  v_prev_ini := (v_ini - interval '1 month')::date;
  v_prev_fin := least(v_prev_ini + (v_fin - v_ini), v_ini);

  with ventanas(k, d, h) as (
    values ('actual', v_ini, v_fin), ('anterior', v_prev_ini, v_prev_fin)
  ),
  v as (
    select w.k, vt.id
    from ventanas w
    join retail.ventas vt
      on vt.created_at >= (w.d::timestamp at time zone 'America/Lima')
     and vt.created_at <  (w.h::timestamp at time zone 'America/Lima')
    where vt.estado = 'completada'
      and not vt.es_prueba
      and (p_ubicacion is null or vt.ubicacion_id = p_ubicacion)
  ),
  tick as (select k, count(*) as tickets from v group by k),
  it as (
    select v.k,
           sum(i.subtotal) as vendido,
           sum(i.cantidad) as unidades
    from v join retail.venta_items i on i.venta_id = v.id
    group by v.k
  ),
  dev as (
    select w.k, sum(d.reembolso_monto) as devuelto
    from ventanas w
    join retail.devoluciones d
      on coalesce(d.aprobado_en, d.created_at) >= (w.d::timestamp at time zone 'America/Lima')
     and coalesce(d.aprobado_en, d.created_at) <  (w.h::timestamp at time zone 'America/Lima')
    join retail.ventas vv on vv.id = d.venta_id
    where d.estado = 'aprobada'
      and not vv.es_prueba
      and (p_ubicacion is null or d.ubicacion_id = p_ubicacion)
    group by w.k
  )
  select jsonb_object_agg(w.k, jsonb_build_object(
           'desde', w.d, 'hasta', w.h,
           'vendido', round(coalesce(it.vendido, 0), 2),
           'tickets', coalesce(tick.tickets, 0),
           'unidades', coalesce(it.unidades, 0),
           'devuelto', round(coalesce(dev.devuelto, 0), 2)))
  into v_res
  from ventanas w
  left join tick on tick.k = w.k
  left join it on it.k = w.k
  left join dev on dev.k = w.k;

  select min((vt.created_at at time zone 'America/Lima')::date)
  into v_primera
  from retail.ventas vt
  where vt.estado = 'completada' and not vt.es_prueba
    and (p_ubicacion is null or vt.ubicacion_id = p_ubicacion);

  return jsonb_build_object(
    'mes', v_ini,
    'hoy', v_hoy,
    'en_curso', (v_hoy >= v_ini and v_hoy < v_sig),
    'primera_venta', v_primera,
    'actual', v_res -> 'actual',
    'anterior', v_res -> 'anterior'
  );
end
$fn$;

revoke all on function retail.fn_reporte_ventas_mes(date, uuid) from public, anon;
grant execute on function retail.fn_reporte_ventas_mes(date, uuid) to authenticated;

comment on function retail.fn_reporte_ventas_mes(date, uuid) is
  'Ventas ▸ Reportes ▸ Ventas del mes: cifras del mes (a la fecha si está en curso) y del tramo equivalente del mes anterior. Invoker; exige el módulo reportes_ventas.';
