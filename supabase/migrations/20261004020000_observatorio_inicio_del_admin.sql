-- Observatorio: el Inicio de las cuentas Admin (ADR-0322, Felipe 2026-10-03; maqueta docs/maquetas/inicio-admin-v3-2026-10/).
--
-- QUÉ AGREGA: tres funciones de SOLO LECTURA. No crea tablas, no toca políticas ni datos.
--   · fn_observatorio(p_dias)            → todo lo que la vista de toda CAYLA necesita en UNA llamada: por tienda y día,
--     lo vendido (soles, tickets, prendas) con la meta efectiva de ese día; cada venta de hoy con su minuto (para la
--     curva, «Repetir el día» y lo que llega en vivo); las del mismo día de la semana pasada (para comparar a la misma
--     hora); y de cada tienda, su caja abierta y quién está en turno.
--   · fn_observatorio_tienda(p_ubicacion_id) → el panel de UNA tienda: categorías, prendas que más salen y equipo en tres
--     ventanas (hoy, 7 y 30 días), horas pico de las últimas 4 semanas y prendas con stock que no se vendieron en 30 días.
--   · fn_observatorio_turno(p_ubicacion_id)  → quién está en turno, sin tumbar al resto si Dynamic no responde.
--
-- POR QUÉ ASÍ:
--   · Solo Admin (`fn_es_admin()`), igual que la pantalla: un líder ya lee todas las sedes por RLS, pero esta vista de la
--     empresa entera es de las cuentas Admin (decisión de Felipe, 2026-10-03).
--   · Sin ventas de prueba (`es_prueba`), como Rendimiento y Historial. `fn_ventas_del_dia` y `fn_comercial_*` sí las
--     cuentan: por eso el Observatorio no los reusa.
--   · La meta del día es la EFECTIVA (`fn_parametros_caja`: la del día de la semana más la de campaña), la misma que usan
--     Caja y el Inicio de la tienda, no la `meta_venta_diaria` cruda.
--   · El vendedor es quien atendió y, si nadie, quien cobró (`coalesce(asesora_id, usuario_id)`), como `fn_ventas_del_dia`.
--   · «Hoy» y los días son de Lima, y los rangos van por `created_at` (usan el índice de ventas, ADR-0194).
--
-- PEGAR EN PRODUCCIÓN: una sola parte (solo funciones: no toma las tablas de auth ni storage, ADR-0195). Idempotente.

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ── Quién está en turno en una tienda ─────────────────────────────────────────────────────────────────────────────────
-- `fn_asesoras_de_turno` lee los marcajes de Dynamic: si falla, el Observatorio sigue con lo demás (principio 9) y la
-- pantalla dice que no pudo leer el turno, en vez de decir que no hay nadie.
create or replace function retail.fn_observatorio_turno(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', a.persona_id, 'nombre', a.nombre_corto, 'estado', a.estado_ahora)
                            order by a.nombre_corto), '[]'::jsonb)
    into v
  from retail.fn_asesoras_de_turno(p_ubicacion_id) a
  where a.estado_ahora in ('presente', 'en_pausa');
  return v;
exception when others then
  return null;
end;
$$;

-- ── Toda CAYLA ────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function retail.fn_observatorio(p_dias integer default 60)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ahora timestamp := now() at time zone 'America/Lima';
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_dias integer := greatest(8, least(coalesce(p_dias, 60), 120));
  v_ini timestamptz;
  v_res jsonb;
begin
  if not retail.fn_es_admin() then
    raise exception 'El Observatorio es solo de las cuentas Admin.' using errcode = '42501';
  end if;
  -- Desde la medianoche de Lima del primer día de la ventana (que siempre incluye el mismo día de la semana pasada).
  v_ini := (v_hoy - (v_dias - 1))::timestamp at time zone 'America/Lima';

  with tiendas as materialized (
    select u.id, u.nombre, u.hora_cierre
    from retail.ubicaciones u
    where u.tipo = 'tienda' and u.activo
  ),
  v as materialized (
    select ve.id,
           ve.ubicacion_id as u,
           ve.created_at at time zone 'America/Lima' as lima,
           coalesce(ve.asesora_id, ve.usuario_id) as quien,
           coalesce(sum(vi.subtotal), 0) as s,
           coalesce(sum(vi.cantidad), 0) as p
    from retail.ventas ve
    join tiendas t on t.id = ve.ubicacion_id
    left join retail.venta_items vi on vi.venta_id = ve.id
    where ve.created_at >= v_ini
      and ve.estado = 'completada'
      and not coalesce(ve.es_prueba, false)
    group by ve.id
  ),
  dias as (
    select (v_hoy - g)::date as f from generate_series(0, v_dias - 1) g
  ),
  por_dia as (
    select v.u, v.lima::date as f, sum(v.s) as s, count(*) as t, sum(v.p) as p
    from v
    group by 1, 2
  )
  select jsonb_build_object(
    'hoy', v_hoy,
    'ahora_min', extract(hour from v_ahora)::int * 60 + extract(minute from v_ahora)::int,
    'tiendas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id,
               'nombre', t.nombre,
               'cierre', to_char(t.hora_cierre, 'HH24:MI'),
               'caja', (
                 select jsonb_build_object(
                          'desde', extract(hour from c.abierta_en at time zone 'America/Lima')::int * 60
                                   + extract(minute from c.abierta_en at time zone 'America/Lima')::int,
                          'por', coalesce(pc.nombres, ''))
                 from retail.cajas c
                 left join public.personas pc on pc.id = c.abierta_por
                 where c.ubicacion_id = t.id and c.estado = 'abierta' and not coalesce(c.es_prueba, false)
                 order by c.abierta_en desc
                 limit 1),
               'turno', retail.fn_observatorio_turno(t.id)
             ) order by t.nombre)
      from tiendas t), '[]'::jsonb),
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'u', t.id, 'f', d.f,
               's', coalesce(x.s, 0), 't', coalesce(x.t, 0), 'p', coalesce(x.p, 0),
               'm', (select pc.meta from retail.fn_parametros_caja(t.id, d.f) pc)
             ) order by d.f, t.nombre)
      from tiendas t
      cross join dias d
      left join por_dia x on x.u = t.id and x.f = d.f), '[]'::jsonb),
    'hoy_ventas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'u', v.u,
               'min', extract(hour from v.lima)::int * 60 + extract(minute from v.lima)::int,
               's', v.s, 'p', v.p,
               'q', coalesce(nullif(trim(coalesce(pe.nombres, '') || ' ' || coalesce(split_part(pe.apellidos, ' ', 1), '')), ''), '—')
             ) order by v.lima)
      from v
      left join public.personas pe on pe.id = v.quien
      where v.lima::date = v_hoy), '[]'::jsonb),
    'semana_pasada', coalesce((
      select jsonb_agg(jsonb_build_object(
               'u', v.u,
               'min', extract(hour from v.lima)::int * 60 + extract(minute from v.lima)::int,
               's', v.s
             ) order by v.lima)
      from v
      where v.lima::date = v_hoy - 7), '[]'::jsonb)
  )
  into v_res;

  return v_res;
end;
$$;

-- ── Una tienda ────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function retail.fn_observatorio_tienda(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_ini timestamptz := (((now() at time zone 'America/Lima')::date) - 29)::timestamp at time zone 'America/Lima';
  v_res jsonb;
begin
  if not retail.fn_es_admin() then
    raise exception 'El Observatorio es solo de las cuentas Admin.' using errcode = '42501';
  end if;
  if not exists (select 1 from retail.ubicaciones where id = p_ubicacion_id and tipo = 'tienda') then
    raise exception 'La ubicación no es una tienda.' using errcode = '22023';
  end if;

  with li as materialized (
    select ve.id as venta,
           (ve.created_at at time zone 'America/Lima')::date as f,
           extract(isodow from ve.created_at at time zone 'America/Lima')::int as dow,
           extract(hour from ve.created_at at time zone 'America/Lima')::int as h,
           coalesce(ve.asesora_id, ve.usuario_id) as quien,
           vi.subtotal as s,
           vi.cantidad as u,
           va.id as variante,
           va.producto_id,
           pr.referencia,
           coalesce(ca.nombre, 'Sin categoría') as cat,
           co.nombre as color,
           co.hex
    from retail.ventas ve
    join retail.venta_items vi on vi.venta_id = ve.id
    join retail.variantes va on va.id = vi.variante_id
    join retail.productos pr on pr.id = va.producto_id
    left join retail.categorias ca on ca.id = pr.categoria_id
    left join retail.colores co on co.codigo = va.color_codigo
    where ve.ubicacion_id = p_ubicacion_id
      and ve.created_at >= v_ini
      and ve.estado = 'completada'
      and not coalesce(ve.es_prueba, false)
  ),
  ventanas (clave, desde) as (
    values ('hoy', v_hoy), ('d7', v_hoy - 6), ('d30', v_hoy - 29)
  ),
  quietas as (
    -- Prendas con stock en la tienda que no se vendieron en 30 días (y que existen hace más de 30: lo recién llegado no
    -- cuenta como «quieto»).
    select st.variante_id, sum(st.cantidad) as unidades
    from retail.stock st
    join retail.variantes va on va.id = st.variante_id
    where st.ubicacion_id = p_ubicacion_id
      and va.created_at < now() - interval '30 days'
    group by st.variante_id
    having sum(st.cantidad) > 0
  )
  select jsonb_build_object(
    'hoy', v_hoy,
    'categorias', (
      select jsonb_object_agg(w.clave, coalesce((
               select jsonb_agg(jsonb_build_object('cat', x.cat, 's', x.s, 'u', x.u) order by x.s desc)
               from (select cat, sum(s) as s, sum(u) as u from li where li.f >= w.desde group by cat) x), '[]'::jsonb))
      from ventanas w),
    'productos', (
      select jsonb_object_agg(w.clave, coalesce((
               select jsonb_agg(jsonb_build_object('id', x.producto_id, 'n', x.referencia, 'c', x.color, 'hex', x.hex,
                                                   'cat', x.cat, 'u', x.u, 's', x.s) order by x.s desc)
               from (select producto_id, referencia, color, hex, cat, sum(u) as u, sum(s) as s
                     from li where li.f >= w.desde
                     group by producto_id, referencia, color, hex, cat
                     order by sum(s) desc
                     limit 12) x), '[]'::jsonb))
      from ventanas w),
    'equipo', (
      select jsonb_object_agg(w.clave, coalesce((
               select jsonb_agg(jsonb_build_object('id', x.quien, 'n', x.n, 's', x.s, 't', x.t) order by x.s desc)
               from (select li.quien,
                            coalesce(nullif(trim(coalesce(pe.nombres, '') || ' ' || coalesce(split_part(pe.apellidos, ' ', 1), '')), ''), '—') as n,
                            sum(li.s) as s,
                            count(distinct li.venta) as t
                     from li
                     left join public.personas pe on pe.id = li.quien
                     where li.f >= w.desde
                     group by li.quien, 2) x), '[]'::jsonb))
      from ventanas w),
    -- Promedio por día de la semana (1 = lunes) y hora, de las 4 semanas anteriores a hoy.
    'pico', coalesce((
      select jsonb_agg(jsonb_build_object('d', x.dow, 'h', x.h, 's', round(x.s / 4.0, 2)) order by x.dow, x.h)
      from (select dow, h, sum(s) as s from li where li.f >= v_hoy - 28 and li.f < v_hoy group by dow, h) x), '[]'::jsonb),
    'quietas', (
      select jsonb_build_object('variantes', count(*), 'unidades', coalesce(sum(q.unidades), 0))
      from quietas q
      where not exists (select 1 from li where li.variante = q.variante_id))
  )
  into v_res;

  return v_res;
end;
$$;

revoke all on function retail.fn_observatorio_turno(uuid) from public, anon;
revoke all on function retail.fn_observatorio(integer) from public, anon;
revoke all on function retail.fn_observatorio_tienda(uuid) from public, anon;
grant execute on function retail.fn_observatorio_turno(uuid) to authenticated;
grant execute on function retail.fn_observatorio(integer) to authenticated;
grant execute on function retail.fn_observatorio_tienda(uuid) to authenticated;
