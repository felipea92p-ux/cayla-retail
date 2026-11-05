-- ============================================================================
-- 20261105220000 — Lo que falta del mes, para medir «¿Ya pagaste el mes?» contra el mes entero (tarea 24 de «Las 36 de Finanzas»)
--
-- EL PROBLEMA PRIMERO. El punto de equilibrio divide los gastos YA REGISTRADOS entre el margen. El día 5 eso es casi nada: los fijos llegan en
-- el mes y la depreciación se asienta el último día. La pantalla decía «lo pagas el día 8» o «Pagado» en verde, y el equilibrio subía día a día.
--
-- LA DECISIÓN. Una lectura que dice, por ubicación, lo que este mes todavía va a gastar y el diario aún no tiene: los fijos activos sin gasto
-- del mes y la cuota de depreciación. Lo que se suma lo decide la web (`equilibrioMes`), con la planilla que falta devengar. Sin gastos no cambia
-- ninguna otra cifra: esto no es el Estado de resultados ni entra al diario.
--   · Un fijo con factura cuenta sin IGV, como el Estado de resultados. Se asume que `gastos_fijos.monto` es el total del papel, con IGV.
--   · Sin la parte de CLAURE, con el mismo reparto por categoría que `fn_claure_gastos_base`.
--   · `fn_depreciacion_mes` no sirve aquí: filtra por el módulo Gastos, y esta lectura la usa quien ve Reportes financieros.
--
-- SUPUESTO PARA EL CONTADOR: la parte de CLAURE de un fijo se calcula sobre el monto sin IGV, igual que el gasto ya registrado.
--
-- PERMISOS: los mismos del Estado de resultados (`fn_ve_diario_de_todo`, `fn_diario_ubicaciones`). Lo «de la empresa», solo quien ve todo.
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución, idempotente. Sin tablas ni políticas. Verificado: `pnpm pruebas:flujo-caja`.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_lo_que_falta_del_mes(p_mes date)
returns table (ubicacion_id uuid, fijos numeric, depreciacion numeric)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_lider boolean := retail.fn_ve_diario_de_todo();
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_ini date := date_trunc('month', p_mes)::date;
  v_fin date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_tasa numeric := retail.fn_tasa_igv((date_trunc('month', p_mes) + interval '1 month - 1 day')::date);
  v_claure uuid;
begin
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver lo que falta del mes necesita el módulo «Reportes financieros» en tu rol.' using errcode = '42501';
  end if;
  select e.id into v_claure from retail.empresas e where e.clave = 'claure' and e.activo and e.cuenta_corriente_desde is not null;

  return query
  with
  por_fijo as (
    select f.ubicacion_id,
           (case when f.comprobante_tipo = 'factura' then f.monto / (1 + v_tasa) else f.monto end)
             * (1 - coalesce((select r.pct_claure from retail.gasto_reparto_claure r
                               where r.categoria = f.categoria
                                 and exists (select 1 from retail.empresa_sedes es
                                              where es.empresa_id = v_claure and es.ubicacion_id = f.ubicacion_id)), 0) / 100) as monto
      from retail.gastos_fijos f
     where f.activo
       and ((f.ubicacion_id is null and v_lider) or f.ubicacion_id = any (v_ubics))
       and not exists (select 1 from retail.gastos y
                        where y.gasto_fijo_id = f.id and y.estado = 'vigente' and y.fecha >= v_ini and y.fecha <= v_fin)
  ),
  por_activo as (
    select a.ubicacion_id,
           least(a.costo - a.valor_residual, round((a.costo - a.valor_residual) / a.vida_util_meses * retail.fn_meses_depreciados(a.fecha_adquisicion, a.vida_util_meses, v_fin, a.fecha_baja), 2))
           - least(a.costo - a.valor_residual, round((a.costo - a.valor_residual) / a.vida_util_meses * retail.fn_meses_depreciados(a.fecha_adquisicion, a.vida_util_meses, v_ini - 1, a.fecha_baja), 2)) as monto
      from retail.activos_fijos a
     where a.estado in ('activo', 'baja')
       and ((a.ubicacion_id is null and v_lider) or a.ubicacion_id = any (v_ubics))
  ),
  juntos as (
    select p.ubicacion_id, p.monto as fijos, 0::numeric as depreciacion from por_fijo p
    union all
    select a.ubicacion_id, 0, a.monto from por_activo a where a.monto > 0
  )
  select j.ubicacion_id, round(sum(j.fijos), 2), round(sum(j.depreciacion), 2)
    from juntos j
   group by j.ubicacion_id;
end $$;
comment on function retail.fn_lo_que_falta_del_mes(date) is
  'Tarea 24: por ubicación, lo que el mes todavía va a gastar y el diario aún no tiene: fijos sin gasto (sin IGV ni la parte de CLAURE) y cuota de depreciación. Solo lee.';
revoke all on function retail.fn_lo_que_falta_del_mes(date) from public, anon;
grant execute on function retail.fn_lo_que_falta_del_mes(date) to authenticated;

reset lock_timeout;
