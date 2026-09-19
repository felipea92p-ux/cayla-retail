-- 20260918197000_fn_estado_resultados.sql — ADR-0109 y ADR-0120, tarea 4
--
-- EL ESTADO DE RESULTADOS de un mes calendario de Lima, por sede y consolidado. Lee SOLO de
-- `fn_asientos` (el diario derivado): no repite ninguna regla de posteo, así ventas, costo, mermas y
-- gastos salen de la misma fuente que saldrá el Balance. Estructura del manual contable §3:
--
--     Ventas (7011 + 7012)            netas de IGV
--   − Costo de ventas (691)
--   − Fletes de compra (609)          (todavía sin fuente: siempre 0 y la pantalla lo dice)
--   − Mermas (659)
--   = MARGEN BRUTO
--   − Gastos de operación (62, 631, 634, 635, 636, 637, 656)
--   = UTILIDAD OPERATIVA
--
-- Una fila por sede activa (aunque esté en cero: una tarjeta en cero es información), una para
-- «De la empresa» (gastos sin sede; solo tiene gastos) y una CONSOLIDADA que suma todas.
--
-- AVISOS (lo que vuelve honestas las cifras; un número falso es peor que ninguno):
--   · unidades_sin_costo   unidades vendidas cuyo costo no está cargado (costo_unitario = 0): su costo NO
--                          entra y el margen está inflado en esa medida. No cuenta el «Monto manual».
--   · mermas_sin_costo     unidades de merma que no se pudieron valorizar (costo 0): la merma está subestimada.
--   · asientos_descuadrados  asientos con debe ≠ haber: una fuente tiene datos que no cuadran.

set search_path = retail, public, extensions;

create function retail.fn_estado_resultados(p_mes date default null)
returns table (
  ubicacion_id uuid, nombre text, es_consolidado boolean,
  ventas_netas numeric, costo_ventas numeric, fletes numeric, mermas numeric, margen_bruto numeric,
  gastos_operacion numeric, utilidad_operativa numeric,
  igv_ventas numeric, ventas_brutas numeric,
  detalle_mermas jsonb, detalle_gastos jsonb,
  unidades_sin_costo bigint, mermas_sin_costo bigint, asientos_descuadrados bigint
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_desde date;
  v_hasta date;
  v_ini timestamptz;
  v_fin timestamptz;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder de equipo puede ver el Estado de Resultados';
  end if;
  -- Cualquier fecha del mes sirve; sin fecha, el mes en curso de Lima.
  v_desde := date_trunc('month', coalesce(p_mes, retail.fn_hoy_lima())::timestamp)::date;
  v_hasta := (v_desde + interval '1 month')::date - 1;
  v_ini := (v_desde::timestamp at time zone 'America/Lima');
  v_fin := ((v_hasta + 1)::timestamp at time zone 'America/Lima');

  return query
  with
  a as (select * from retail.fn_asientos(v_desde, v_hasta, null)),
  -- Cada cuenta de resultados con su signo natural (ingreso: haber − debe; gasto: debe − haber).
  r as (
    select a.ubicacion_id as u, c.seccion_resultados as sec, c.codigo as cta, c.nombre as cnombre,
           sum(case when c.tipo = 'ingreso' then a.haber - a.debe else a.debe - a.haber end) as monto
      from a join retail.cuentas c on c.codigo = a.cuenta
     where c.seccion_resultados is not null
     group by a.ubicacion_id, c.seccion_resultados, c.codigo, c.nombre
  ),
  -- IGV de las ventas (débito fiscal): solo de las reglas de venta; el IGV de los gastos es crédito y va aparte.
  iva as (
    select a.ubicacion_id as u, sum(a.haber - a.debe) as igv
      from a where a.cuenta = '4011' and a.regla in ('venta', 'anulacion', 'devolucion', 'cambio')
     group by a.ubicacion_id
  ),
  merm as (
    select a.ubicacion_id as u, a.regla as regla, sum(a.debe - a.haber) as monto
      from a where a.cuenta = '659' group by a.ubicacion_id, a.regla
  ),
  sc as (
    select v.ubicacion_id as u, sum(vi.cantidad)::bigint as n
      from retail.ventas v join retail.venta_items vi on vi.venta_id = v.id
     where v.estado = 'completada' and v.created_at >= v_ini and v.created_at < v_fin
       and vi.costo_unitario = 0
       and vi.variante_id <> '22222222-2222-4222-8222-222222222222'   -- «Monto manual»: no tiene costo por definición
     group by v.ubicacion_id
  ),
  msc as (
    select m.ubicacion_id as u, sum(abs(m.cantidad))::bigint as n
      from retail.movimientos m
     where m.created_at >= v_ini and m.created_at < v_fin
       and retail.fn_es_merma(m.tipo, m.motivo, m.cantidad)
       and retail.fn_costo_variante_al(m.variante_id, m.created_at) = 0
     group by m.ubicacion_id
  ),
  dz as (
    select x.u, count(*)::bigint as n
      from (select a.ubicacion_id as u, a.asiento from a group by a.ubicacion_id, a.asiento
             having round(sum(a.debe), 2) <> round(sum(a.haber), 2)) x
     group by x.u
  ),
  base as (
    select ub.id as id, ub.nombre as nombre, 1 as ord from retail.ubicaciones ub
     where ub.activo or exists (select 1 from a where a.ubicacion_id = ub.id)
    union all
    select null::uuid, 'De la empresa', 2
  ),
  por as (
    select b.id, b.nombre, b.ord,
           coalesce(sum(r.monto) filter (where r.sec = 'ventas'), 0) as ventas,
           coalesce(sum(r.monto) filter (where r.sec = 'costo_ventas'), 0) as costo,
           coalesce(sum(r.monto) filter (where r.sec = 'fletes'), 0) as fletes,
           coalesce(sum(r.monto) filter (where r.sec = 'mermas'), 0) as mermas,
           coalesce(sum(r.monto) filter (where r.sec = 'gastos_operacion'), 0) as gastos
      from base b left join r on r.u is not distinct from b.id
     group by b.id, b.nombre, b.ord
  ),
  filas as (
    select p.id, p.nombre, false as consolidado, p.ord,
           p.ventas, p.costo, p.fletes, p.mermas, p.gastos,
           coalesce((select i.igv from iva i where i.u is not distinct from p.id), 0) as igv,
           coalesce((select jsonb_agg(jsonb_build_object('regla', m.regla, 'monto', m.monto) order by m.monto desc)
                       from merm m where m.u is not distinct from p.id), '[]'::jsonb) as det_mermas,
           coalesce((select jsonb_agg(jsonb_build_object('cuenta', x.cta, 'nombre', x.cnombre, 'monto', x.monto) order by x.monto desc)
                       from r x where x.u is not distinct from p.id and x.sec = 'gastos_operacion'), '[]'::jsonb) as det_gastos,
           coalesce((select s.n from sc s where s.u is not distinct from p.id), 0) as sin_costo,
           coalesce((select s.n from msc s where s.u is not distinct from p.id), 0) as merma_sin_costo,
           coalesce((select s.n from dz s where s.u is not distinct from p.id), 0) as descuadres
      from por p
  ),
  consolidado as (
    select null::uuid as id, 'Consolidado'::text as nombre, true as consolidado, 3 as ord,
           coalesce(sum(f.ventas), 0), coalesce(sum(f.costo), 0), coalesce(sum(f.fletes), 0),
           coalesce(sum(f.mermas), 0), coalesce(sum(f.gastos), 0), coalesce(sum(f.igv), 0),
           coalesce((select jsonb_agg(jsonb_build_object('regla', q.regla, 'monto', q.monto) order by q.monto desc)
                       from (select m.regla, sum(m.monto) as monto from merm m group by m.regla) q), '[]'::jsonb),
           coalesce((select jsonb_agg(jsonb_build_object('cuenta', q.cta, 'nombre', q.cnombre, 'monto', q.monto) order by q.monto desc)
                       from (select x.cta, x.cnombre, sum(x.monto) as monto from r x where x.sec = 'gastos_operacion' group by x.cta, x.cnombre) q), '[]'::jsonb),
           coalesce(sum(f.sin_costo), 0)::bigint, coalesce(sum(f.merma_sin_costo), 0)::bigint, coalesce(sum(f.descuadres), 0)::bigint
      from filas f
  )
  select z.id, z.nombre, z.consolidado,
         z.ventas, z.costo, z.fletes, z.mermas,
         z.ventas - z.costo - z.fletes - z.mermas,
         z.gastos,
         z.ventas - z.costo - z.fletes - z.mermas - z.gastos,
         z.igv, z.ventas + z.igv,
         z.det_mermas, z.det_gastos, z.sin_costo, z.merma_sin_costo, z.descuadres
    from (
      select f.id, f.nombre, f.consolidado, f.ord, f.ventas, f.costo, f.fletes, f.mermas, f.gastos, f.igv,
             f.det_mermas, f.det_gastos, f.sin_costo, f.merma_sin_costo, f.descuadres from filas f
      union all
      select c.* from consolidado c
    ) z
   order by z.ord, z.nombre;
end;
$$;

revoke all on function retail.fn_estado_resultados(date) from public, anon;
grant execute on function retail.fn_estado_resultados(date) to authenticated;

comment on function retail.fn_estado_resultados(date) is
  'Estado de Resultados de un mes de Lima por sede, «De la empresa» y consolidado. Lee solo de fn_asientos (ADR-0109/0120). Solo líder.';
