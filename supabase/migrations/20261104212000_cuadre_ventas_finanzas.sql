-- ============================================================================
-- 20261104212000 — De Ventas a Finanzas: el cuadre, sede por sede (ADR-0609)
--
-- EL PROBLEMA PRIMERO (Felipe, 2026-11-04): «Vendido» de Ventas ▸ Reportes y «Ventas» de Finanzas no coinciden y nadie puede explicar por qué
-- desde la pantalla. Miden cosas distintas y las dos están bien: Ventas suma lo cobrado con IGV de las ventas vigentes; Finanzas, el ingreso
-- de CAYLA en el diario: sin IGV, sin lo de CLAURE, con devoluciones y diferencias de cambios.
--
-- CONTRATO de `fn_cuadre_ventas_finanzas(p_desde, p_hasta)`: una fila por sede con movimiento en el período, en céntimos exactos.
--   vendido + igv + anulaciones_otro_mes + devoluciones + cambios + claure + otras = ventas_netas     (SIEMPRE)
--   · vendido: la misma regla de `fn_reporte_ventas_mes`: líneas de ventas `completada`, no de prueba, por día de Lima.
--   · ventas_netas: cuentas de la sección «ventas» de `fn_diario`, igual que `fn_estado_resultados`. Se lee, no se recalcula.
--   · igv (negativo): el IGV que el diario separó de esas mismas ventas.
--   · anulaciones_otro_mes: la venta anulada (que el diario registra el día que ocurrió) más su reversa (el día que se anuló). Dentro del
--     mismo período se cancelan; distinto de cero, una venta y su anulación cayeron en períodos diferentes.
--   · devoluciones, cambios, claure: lo que esas reglas del diario movieron en las cuentas de ventas (sin IGV).
--   · otras: lo que queda. Es la prueba de honestidad: si el diario y las ventas se separan (un mes cerrado que se congeló antes de un
--     cambio, una regla nueva del diario), aparece aquí con su monto en vez de esconderse. Nunca se reparte.
-- Quién ve qué: lo mismo que el Estado de resultados (`fn_ve_diario_de_todo` / `fn_diario_ubicaciones`, ADR-0585), y desde `fn_finanzas_desde`.
-- Solo lectura.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución; una función y sus permisos, sin tablas ni políticas. Verificado: `pnpm pruebas:cuadre-ventas-finanzas`.
--
-- SE ROMPE SI: una regla nueva del diario mueve la cuenta 701x: cae en `otras`, a la vista, hasta que se le dé su fila.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_cuadre_ventas_finanzas(p_desde date, p_hasta date)
returns table (ubicacion_id uuid, nombre text, vendido numeric, igv numeric, anulaciones_otro_mes numeric, devoluciones numeric,
               cambios numeric, claure numeric, otras numeric, ventas_netas numeric)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_todo boolean := retail.fn_ve_diario_de_todo();
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_ini timestamptz;
  v_fin timestamptz;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas no es válido.' using errcode = 'P0001';
  end if;
  if not v_todo and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver el cuadre necesita el módulo «Reportes financieros» en tu rol.' using errcode = '42501';
  end if;
  -- ADR-0332: Finanzas cuenta desde su fecha de inicio; Ventas se recorta igual para comparar lo mismo.
  if retail.fn_finanzas_desde() is not null then
    if p_hasta < retail.fn_finanzas_desde() then
      return;
    end if;
    p_desde := greatest(p_desde, retail.fn_finanzas_desde());
  end if;
  v_ini := (p_desde::timestamp at time zone 'America/Lima');
  v_fin := ((p_hasta + 1)::timestamp at time zone 'America/Lima');

  return query
  with
  a as materialized (select * from retail.fn_diario(p_desde, p_hasta, null)),
  -- Cada venta del diario con su estado de hoy: el diario registra también las que luego se anularon.
  estado as materialized (
    select v.id, v.estado from retail.ventas v where v.id in (select a.origen_id from a where a.regla = 'venta')
  ),
  ingresos as (
    select a.ubicacion_id as u, a.regla, e.estado, sum(a.haber - a.debe) as monto
      from a
      join retail.cuentas k on k.codigo = a.cuenta and k.seccion_resultados = 'ventas'
      left join estado e on a.regla = 'venta' and e.id = a.origen_id
     group by a.ubicacion_id, a.regla, e.estado
  ),
  por_sede as (
    select i.u,
           coalesce(sum(i.monto), 0) as netas,
           coalesce(sum(i.monto) filter (where i.regla = 'venta' and i.estado is distinct from 'completada'), 0)
             + coalesce(sum(i.monto) filter (where i.regla = 'anulacion'), 0) as anuladas,
           coalesce(sum(i.monto) filter (where i.regla = 'devolucion'), 0) as devoluciones,
           coalesce(sum(i.monto) filter (where i.regla = 'cambio'), 0) as cambios,
           coalesce(sum(i.monto) filter (where i.regla like 'claure\_%'), 0) as claure
      from ingresos i
     group by i.u
  ),
  impuesto as (
    select a.ubicacion_id as u, sum(a.haber) as igv
      from a join estado e on e.id = a.origen_id
     where a.regla = 'venta' and a.cuenta = '4011' and e.estado = 'completada'
     group by a.ubicacion_id
  ),
  vendido as (
    select v.ubicacion_id as u, sum(vi.subtotal) as vendido
      from retail.ventas v
      join retail.venta_items vi on vi.venta_id = v.id
     where v.estado = 'completada' and not coalesce(v.es_prueba, false)
       and v.created_at >= v_ini and v.created_at < v_fin
       and (v_todo or v.ubicacion_id = any (v_ubics))
     group by v.ubicacion_id
  ),
  sedes as (select p.u from por_sede p union select x.u from vendido x)
  select s.u, coalesce(ub.nombre, 'De la empresa'),
         coalesce(x.vendido, 0)::numeric,
         -coalesce(t.igv, 0)::numeric,
         coalesce(p.anuladas, 0)::numeric,
         coalesce(p.devoluciones, 0)::numeric,
         coalesce(p.cambios, 0)::numeric,
         coalesce(p.claure, 0)::numeric,
         round(coalesce(p.netas, 0) - (coalesce(x.vendido, 0) - coalesce(t.igv, 0) + coalesce(p.anuladas, 0)
               + coalesce(p.devoluciones, 0) + coalesce(p.cambios, 0) + coalesce(p.claure, 0)), 2)::numeric,
         coalesce(p.netas, 0)::numeric
    from sedes s
    left join retail.ubicaciones ub on ub.id = s.u
    left join por_sede p on p.u is not distinct from s.u
    left join vendido x on x.u is not distinct from s.u
    left join impuesto t on t.u is not distinct from s.u
   order by ub.nombre nulls last;
end $$;
comment on function retail.fn_cuadre_ventas_finanzas(date, date) is
  'ADR-0609: de lo vendido en Ventas ▸ Reportes a las ventas netas de Finanzas, por sede: vendido + igv + anulaciones_otro_mes + devoluciones + cambios + claure + otras = ventas_netas. Solo lectura; ve lo mismo que el Estado de resultados.';
revoke all on function retail.fn_cuadre_ventas_finanzas(date, date) from public, anon;
grant execute on function retail.fn_cuadre_ventas_finanzas(date, date) to authenticated;

reset lock_timeout;
