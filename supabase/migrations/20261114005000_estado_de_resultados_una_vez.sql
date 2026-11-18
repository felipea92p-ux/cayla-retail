-- ============================================================================
-- 20261114005000 — El estado de resultados del mes se arma UNA vez por carga del Resumen (ADR-0661, actualización 2026-11-14)
--
-- EL PROBLEMA PRIMERO. Una carga de Finanzas ▸ Resumen arma `fn_estado_resultados(1 del mes, hoy)` TRES veces: en `resultados_mes`, dentro de
-- `fn_presupuesto_vs_real` y dentro de `fn_balance_por_tienda`. Es la pieza más cara de Finanzas (~2 s en producción) y la base tiene 2 núcleos:
-- medido el 2026-11-14 desde las 00:07 UTC, una carga pide ~9–10 s de CPU (el Resumen 3,8 s, el balance 1,8 s, Movimientos 6 × 0,63 s).
--
-- LO QUE CAMBIA. Las reglas no se tocan: `fn_presupuesto_vs_real` y `fn_balance_por_tienda` pasan a ser envoltorios de `…_de`, que son su
-- MISMO cuerpo (copiado de la definición viva) con un solo cambio: aceptan un estado de resultados ya armado y lo usan SOLO si es el mismo que
-- iban a armar (las mismas fechas y la misma sede); si no viene, o no calza, lo arman como siempre. `fn_resumen_finanzas_partes` guarda el del
-- mes al armar `resultados_mes` y se lo pasa al presupuesto y, si se le pide la parte nueva `balance` (no entra en la lectura entera), al balance
-- de cada sede a hoy. Las `…_de` no las puede llamar nadie de afuera (solo las funciones que las envuelven): no se le puede pasar un estado de
-- resultados inventado. Para pasarlo nace el tipo `retail.fila_estado_resultados`, con las columnas de `fn_estado_resultados`.
--
-- IDÉNTICO. Ni una cifra cambia: md5 de la salida antes y después (`fn_presupuesto_vs_real`, `fn_balance_por_tienda` y `fn_resumen_finanzas`) y
-- la parte `balance` igual a `fn_balance_por_tienda(hoy)`; `pnpm pruebas:resumen-por-partes` lo exige para siempre.
--
-- ANTES DE PEGAR. Una sola parte, sin políticas, sin `alter table`, sin `drop`: un tipo y cinco `create or replace function` con sus permisos.
-- Frena sin cambiar nada si alguna de las tres funciones vivas no es la de main (ni ya la de esta migración). Se puede pegar dos veces. La web
-- funciona antes y después. Termina con «QUEDÓ BIEN».
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. El candado: los cuerpos vivos son los de main (o ya los de esta migración); las `…_de`, si existen, las de aquí.
do $candado$
declare
  v_md5 text;
begin
  v_md5 := (select md5(p.prosrc) from pg_proc p where p.oid = 'retail.fn_presupuesto_vs_real(date,uuid,date)'::regprocedure);
  if v_md5 not in ('8e4dda50ecffdcfdbc35cc9591f93e37', 'b36503a9d736d942fc40a9e130bec5d3') then
    raise exception '20261114005000: fn_presupuesto_vs_real cambió (md5 %; se esperaba 8e4dda50… de main). No se cambió nada.', v_md5;
  end if;
  v_md5 := (select md5(p.prosrc) from pg_proc p where p.oid = 'retail.fn_balance_por_tienda(date)'::regprocedure);
  if v_md5 not in ('5b2010a2226f18290a4ad959a6ca81a2', '39b774054c027a1b45913b831b25220c') then
    raise exception '20261114005000: fn_balance_por_tienda cambió (md5 %; se esperaba 5b2010a2… de main). No se cambió nada.', v_md5;
  end if;
  v_md5 := (select md5(p.prosrc) from pg_proc p where p.oid = 'retail.fn_resumen_finanzas_partes(uuid,boolean,text[])'::regprocedure);
  if v_md5 not in ('cb1b94d1868ad74b9b3c975f4ab6870c', '861131fe7b72e780ae3843957046bf55') then
    raise exception '20261114005000: fn_resumen_finanzas_partes cambió (md5 %; se esperaba cb1b94d1…, la de 20261113235000). No se cambió nada.', v_md5;
  end if;
  v_md5 := (select md5(p.prosrc) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'fn_presupuesto_vs_real_de');
  if v_md5 is not null and v_md5 <> '381116ebfab98298e69c1cd99e5ddc22' then
    raise exception '20261114005000: fn_presupuesto_vs_real_de ya existe con otro cuerpo (md5 %). No se cambió nada.', v_md5;
  end if;
  v_md5 := (select md5(p.prosrc) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'fn_balance_por_tienda_de');
  if v_md5 is not null and v_md5 <> 'c3511dc5fe9611e92e681a365fda055a' then
    raise exception '20261114005000: fn_balance_por_tienda_de ya existe con otro cuerpo (md5 %). No se cambió nada.', v_md5;
  end if;
  -- El tipo tiene que tener las columnas de `fn_estado_resultados`, en su orden: si la función cambió, se frena aquí.
  if pg_get_function_result('retail.fn_estado_resultados(date,date,uuid)'::regprocedure) <> 'TABLE(ubicacion_id uuid, unidad text, nombre text, orden integer, ventas_netas numeric, costo_ventas numeric, fletes numeric, mermas numeric, margen_bruto numeric, planilla numeric, depreciacion numeric, gastos_operacion numeric, resultado numeric, igv_ventas numeric, detalle_gastos jsonb, detalle_mermas jsonb, unidades_sin_costo bigint, mermas_sin_costo bigint, asientos_descuadrados bigint, planilla_visible boolean, planilla_nota text)' then
    raise exception '20261114005000: fn_estado_resultados devuelve otras columnas que las de esta migración. No se cambió nada.';
  end if;
end
$candado$;

-- 2. Una fila del estado de resultados, para pasarlo ya armado. Si ya existe (segunda pegada), se deja.
do $tipo$
begin
  if to_regtype('retail.fila_estado_resultados') is null then
    create type retail.fila_estado_resultados as (ubicacion_id uuid, unidad text, nombre text, orden integer, ventas_netas numeric, costo_ventas numeric, fletes numeric, mermas numeric, margen_bruto numeric, planilla numeric, depreciacion numeric, gastos_operacion numeric, resultado numeric, igv_ventas numeric, detalle_gastos jsonb, detalle_mermas jsonb, unidades_sin_costo bigint, mermas_sin_costo bigint, asientos_descuadrados bigint, planilla_visible boolean, planilla_nota text);
  end if;
end
$tipo$;

-- 3. El presupuesto contra lo real, con el estado de resultados que le pasen si es el mismo que iba a armar.
create or replace function retail.fn_presupuesto_vs_real_de(p_mes date, p_ubicacion_id uuid, p_hoy date, p_er retail.fila_estado_resultados[], p_er_desde date, p_er_hasta date, p_er_ubicacion uuid)
returns table(ubicacion_id uuid, unidad text, nombre text, orden integer, linea text, linea_nombre text, tipo text, orden_linea integer, presupuesto numeric, a_la_fecha numeric, proyeccion numeric, fijo numeric, avance numeric, se_pasa boolean, estado text, momento text, dia integer, dias integer)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_hoy date := coalesce(p_hoy, retail.fn_hoy_lima());
  v_lider boolean := retail.fn_ve_diario_de_todo();
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_todo boolean;
  v_ini date;
  v_fin date;
  v_dias integer;
  v_dia integer;
  v_momento text;
  v_corte date;
  v_tasa numeric;
  -- 20261114005000: ¿quien llama ya armó este mismo estado de resultados (mismas fechas, misma sede)? Entonces se usa ese.
  v_usa_er boolean;
begin
  if p_mes is null then
    raise exception 'Falta el mes.' using errcode = 'P0001';
  end if;
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver el presupuesto necesita el módulo «Reportes financieros» en tu rol.' using errcode = '42501';
  end if;
  if p_ubicacion_id is not null then
    if not (p_ubicacion_id = any (v_ubics)) then
      raise exception 'No puedes ver los números de esa ubicación.' using errcode = '42501';
    end if;
    v_ubics := array[p_ubicacion_id];
  end if;
  v_todo := v_lider and p_ubicacion_id is null;
  v_ini := date_trunc('month', p_mes)::date;
  v_fin := (v_ini + interval '1 month - 1 day')::date;
  v_dias := extract(day from v_fin)::integer;
  v_tasa := retail.fn_tasa_igv(v_ini);
  if v_hoy < v_ini then
    v_momento := 'por_venir'; v_dia := 0;
  elsif v_hoy > v_fin then
    v_momento := 'cerrado'; v_dia := v_dias;
  else
    v_momento := 'en_curso'; v_dia := extract(day from v_hoy)::integer;
  end if;
  v_corte := greatest(v_ini, least(v_hoy, v_fin));
  v_usa_er := p_er is not null and p_er_desde = v_ini and p_er_hasta = v_corte and p_er_ubicacion is not distinct from p_ubicacion_id;

  return query
  with
  -- Lo real: el Estado de resultados del día 1 al de corte (un mes por venir no tiene nada todavía).
  er as materialized (
    select e.* from unnest(p_er) e
     where v_usa_er and v_momento <> 'por_venir' and e.unidad <> 'consolidado'
    union all
    select e.* from retail.fn_estado_resultados(v_ini, v_corte, p_ubicacion_id) e
     where not v_usa_er and v_momento <> 'por_venir' and e.unidad <> 'consolidado'
  ),
  -- Las unidades: las del Estado de resultados, más las tiendas y el Taller activos (o con tope ese mes), más la empresa.
  unid as (
    select e.ubicacion_id as u, e.unidad as un, e.nombre as nom, e.orden as ord from er e
    union
    select ub.id, case ub.tipo when 'taller' then 'taller' else 'tienda' end, ub.nombre, case ub.tipo when 'taller' then 2 else 1 end
      from retail.ubicaciones ub
     where ub.tipo in ('tienda', 'taller')
       and ((v_todo and (ub.activo or exists (select 1 from retail.presupuestos p where p.mes = v_ini and p.ubicacion_id = ub.id and p.monto is not null)))
            or (not v_todo and ub.id = any (v_ubics)))
    union
    select null::uuid, 'empresa'::text, 'De la empresa'::text, 3 where v_todo
  ),
  lin as (select l.cuenta as cta, l.nombre as lnom, l.orden as lord from retail.fn_presupuesto_lineas(v_ini) l),
  topes as (select p.ubicacion_id as u, p.cuenta as cta, p.monto from retail.presupuestos p where p.mes = v_ini and p.monto is not null),
  gasto_real as (
    select e.ubicacion_id as u, x ->> 'cuenta' as cta, sum((x ->> 'monto')::numeric) as monto
      from er e, jsonb_array_elements(e.detalle_gastos) x
     group by 1, 2
  ),
  -- Lo fijo que ya llegó (sin IGV, como lo asienta el diario).
  fijo_real as (
    select g.ubicacion_id as u, k.cuenta_pcge as cta, sum(g.monto_total - g.igv) as monto
      from retail.gastos g join retail.categorias_gasto k on k.codigo = g.categoria
     where v_momento = 'en_curso' and g.estado = 'vigente' and g.gasto_fijo_id is not null
       and g.fecha between v_ini and v_corte
     group by 1, 2
  ),
  -- Lo fijo que falta: cada fijo activo sin gasto este mes, por su monto esperado sin el IGV de su factura (o el gasto ya
  -- registrado con fecha posterior al corte, por lo que se registró).
  fijo_pend as (
    select f.ubicacion_id as u, k.cuenta_pcge as cta,
           sum(case when g.id is not null then g.monto_total - g.igv
                    when f.comprobante_tipo = 'factura' then f.monto - round(f.monto - f.monto / (1 + v_tasa), 2)
                    else f.monto end) as monto
      from retail.gastos_fijos f
      join retail.categorias_gasto k on k.codigo = f.categoria
      left join lateral (
        select x.id, x.fecha, x.monto_total, x.igv from retail.gastos x
         where x.gasto_fijo_id = f.id and x.estado = 'vigente' and x.fecha between v_ini and v_fin
         order by x.fecha limit 1
      ) g on true
     where v_momento = 'en_curso' and f.activo and (g.id is null or g.fecha > v_corte)
     group by 1, 2
  ),
  g_lineas as (
    select un.u, un.un, un.nom, un.ord, l.cta, l.lnom, l.lord,
           t.monto as pres, coalesce(gr.monto, 0) as re, coalesce(fr.monto, 0) as fre, coalesce(fp.monto, 0) as fpe
      from unid un
      cross join lin l
      left join topes t on t.u is not distinct from un.u and t.cta = l.cta
      left join gasto_real gr on gr.u is not distinct from un.u and gr.cta = l.cta
      left join fijo_real fr on fr.u is not distinct from un.u and fr.cta = l.cta
      left join fijo_pend fp on fp.u is not distinct from un.u and fp.cta = l.cta
     where t.monto is not null or coalesce(gr.monto, 0) <> 0 or coalesce(fp.monto, 0) <> 0
  ),
  -- La meta del mes es la de F1 (una sola meta), sin IGV; la de los días 1..corte, con la misma regla día por día.
  metas as (
    select un.u,
           round(retail.fn_meta_mes(un.u, v_ini) / (1 + v_tasa), 2) as meta_mes,
           case when v_momento = 'en_curso' then
             round((select sum(pc.meta) from generate_series(v_ini, v_corte, interval '1 day') d,
                            lateral retail.fn_parametros_caja(un.u, d::date) pc) / (1 + v_tasa), 2)
           end as meta_fecha
      from unid un where un.un = 'tienda' and un.u is not null
  ),
  v_lineas as (
    select un.u, un.un, un.nom, un.ord, m.meta_mes, m.meta_fecha, coalesce(e.ventas_netas, 0) as re
      from unid un
      left join er e on e.ubicacion_id is not distinct from un.u and e.unidad = un.un
      left join metas m on m.u is not distinct from un.u
     where un.un = 'tienda' or m.meta_mes is not null or coalesce(e.ventas_netas, 0) <> 0
  ),
  todas as (
    select v.u, v.un, v.nom, v.ord, 'ventas'::text as lin, 'Ventas'::text as lnom, 'meta'::text as tp, 0 as lord,
           v.meta_mes as pres, v.re,
           case v_momento
             when 'por_venir' then null
             when 'cerrado' then v.re
             else round(case when v.meta_fecha > 0 and v.meta_mes > 0 then v.re * v.meta_mes / v.meta_fecha
                             when v_dia > 0 then v.re * v_dias / v_dia
                             else v.re end, 2)
           end as proy,
           null::numeric as fij
      from v_lineas v
    union all
    select g.u, g.un, g.nom, g.ord, g.cta, g.lnom, 'tope', g.lord, g.pres, g.re,
           case v_momento
             when 'por_venir' then null
             when 'cerrado' then g.re
             else round(g.fre + g.fpe + case when g.re - g.fre > 0 and v_dia > 0 then (g.re - g.fre) * v_dias / v_dia
                                             else g.re - g.fre end, 2)
           end,
           case when v_momento = 'en_curso' then g.fre + g.fpe end
      from g_lineas g
  ),
  -- CAYLA: la suma exacta de las unidades (solo el líder sin filtro).
  cons as (
    select null::uuid as u, 'consolidado'::text as un, 'CAYLA'::text as nom, 4 as ord, t.lin, t.lnom, t.tp, t.lord,
           sum(t.pres) as pres, sum(t.re) as re, sum(t.proy) as proy, sum(t.fij) as fij
      from todas t
     where v_todo
     group by t.lin, t.lnom, t.tp, t.lord
  ),
  z as (
    select t.*, case when t.pres > 0 and t.proy is not null then round(t.proy / t.pres, 4) end as av from todas t
    union all
    select c.*, case when c.pres > 0 and c.proy is not null then round(c.proy / c.pres, 4) end from cons c
  )
  select z.u, z.un, z.nom, z.ord, z.lin, z.lnom, z.tp, z.lord,
         z.pres, round(z.re, 2), z.proy, z.fij, z.av,
         (z.tp = 'tope' and z.av > 1.05),
         case
           when z.tp = 'tope' and z.pres is null then 'sin_tope'
           when z.tp = 'meta' and z.pres is null then 'sin_meta'
           when v_momento = 'por_venir' then 'por_empezar'
           when z.tp = 'tope' and z.av > 1.05 then 'se_pasa'
           when z.tp = 'tope' and z.av > 1 then 'al_filo'
           when z.tp = 'tope' then 'dentro'
           when v_momento = 'cerrado' and z.av >= 1 then 'cumplida'
           when z.av < 0.95 or (v_momento = 'cerrado' and z.av < 1) then 'bajo_meta'
           else 'en_camino'
         end,
         v_momento, v_dia, v_dias
    from z
   order by z.ord, z.nom, z.lord, z.lnom;
end $$;

revoke all on function retail.fn_presupuesto_vs_real_de(date, uuid, date, retail.fila_estado_resultados[], date, date, uuid) from public, anon, authenticated;

create or replace function retail.fn_presupuesto_vs_real(p_mes date, p_ubicacion_id uuid default null, p_hoy date default null)
returns table(ubicacion_id uuid, unidad text, nombre text, orden integer, linea text, linea_nombre text, tipo text, orden_linea integer, presupuesto numeric, a_la_fecha numeric, proyeccion numeric, fijo numeric, avance numeric, se_pasa boolean, estado text, momento text, dia integer, dias integer)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select * from retail.fn_presupuesto_vs_real_de(p_mes, p_ubicacion_id, p_hoy, null, null, null, null)
$$;

-- 4. El balance de cada sede, igual.
create or replace function retail.fn_balance_por_tienda_de(p_corte date, p_er retail.fila_estado_resultados[], p_er_desde date, p_er_hasta date, p_er_ubicacion uuid)
returns table(ubicacion_id uuid, nombre text, tipo text, caja numeric, caja_visible boolean, mercaderia numeric, activos_fijos numeric, activos_costo numeric, activos_depreciacion numeric, facturas_por_pagar numeric, invertido numeric, ventas_mes numeric, utilidad_mes numeric, rinde numeric, desde date, hasta date, planilla_visible boolean)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_corte date := coalesce(p_corte, retail.fn_hoy_lima());
  v_desde date := date_trunc('month', coalesce(p_corte, retail.fn_hoy_lima()))::date;
  v_lider boolean := retail.fn_ve_diario_de_todo();
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_ve_caja boolean := retail.fn_puede_gestionar_caja();
  -- 20261114005000: ¿quien llama ya armó este mismo estado de resultados (mismas fechas, misma sede)? Entonces se usa ese.
  v_usa_er boolean := p_er is not null and p_er_desde = v_desde and p_er_hasta = v_corte
                      and p_er_ubicacion is not distinct from (case when v_lider then null else v_ubics[1] end);
begin
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver lo que es de tu tienda necesita el módulo «Reportes financieros» en tu rol.' using errcode = '42501';
  end if;
  return query
  with
  un as (
    select u.id, u.nombre, u.tipo from retail.ubicaciones u
     where u.tipo in ('tienda', 'taller') and u.id = any (v_ubics) and (u.activo or not v_lider)
  ),
  din as (select d.ubicacion_id, sum(d.saldo) as saldo, bool_or(d.tipo = 'cajon' and d.caja_abierta) as abierta
            from retail.fn_bal_dinero(v_corte) d where d.tipo in ('cajon', 'caja_fuerte') group by d.ubicacion_id),
  sto as (select s.ubicacion_id, s.valor from retail.fn_bal_stock(v_corte) s),
  act as (select a.ubicacion_id, sum(a.costo) as costo, sum(a.depreciacion) as dep from retail.fn_bal_activos(v_corte) a group by a.ubicacion_id),
  fac as (select f.ubicacion_id, f.saldo from retail.fn_bal_facturas_de_tienda(v_corte) f),
  er as (select e.ubicacion_id, e.ventas_netas, e.resultado, e.planilla_visible
           from unnest(p_er) e
          where v_usa_er and e.ubicacion_id is not null
         union all
         select e.ubicacion_id, e.ventas_netas, e.resultado, e.planilla_visible
           from retail.fn_estado_resultados(v_desde, v_corte, case when v_lider then null else v_ubics[1] end) e
          where not v_usa_er and e.ubicacion_id is not null),
  base as (
    select un.id, un.nombre, un.tipo,
           -- El esperado de una caja abierta lo ve solo quien puede cerrarla (ADR-0186, como en Cuentas y dinero).
           case when coalesce(din.abierta, false) and v_corte >= retail.fn_hoy_lima() and not v_ve_caja then null
                else coalesce(din.saldo, 0) end as caja,
           coalesce(sto.valor, 0) as merc,
           coalesce(act.costo, 0) as costo, coalesce(act.dep, 0) as dep,
           coalesce(fac.saldo, 0) as fac,
           er.ventas_netas, er.resultado, coalesce(er.planilla_visible, false) as pv
      from un
      left join din on din.ubicacion_id = un.id
      left join sto on sto.ubicacion_id = un.id
      left join act on act.ubicacion_id = un.id
      left join fac on fac.ubicacion_id = un.id
      left join er on er.ubicacion_id = un.id
  )
  select b.id, b.nombre, b.tipo, b.caja, b.caja is not null, b.merc, b.costo - b.dep, b.costo, b.dep, b.fac,
         coalesce(b.caja, 0) + b.merc + b.costo - b.dep - b.fac,
         coalesce(b.ventas_netas, 0), coalesce(b.resultado, 0),
         case when b.tipo = 'tienda' and coalesce(b.caja, 0) + b.merc + b.costo - b.dep - b.fac > 0
              then round(coalesce(b.resultado, 0) / (coalesce(b.caja, 0) + b.merc + b.costo - b.dep - b.fac), 4) end,
         v_desde, v_corte, b.pv
    from base b
   order by case b.tipo when 'tienda' then 1 else 2 end, b.nombre;
end $$;

revoke all on function retail.fn_balance_por_tienda_de(date, retail.fila_estado_resultados[], date, date, uuid) from public, anon, authenticated;

create or replace function retail.fn_balance_por_tienda(p_corte date default null)
returns table(ubicacion_id uuid, nombre text, tipo text, caja numeric, caja_visible boolean, mercaderia numeric, activos_fijos numeric, activos_costo numeric, activos_depreciacion numeric, facturas_por_pagar numeric, invertido numeric, ventas_mes numeric, utilidad_mes numeric, rinde numeric, desde date, hasta date, planilla_visible boolean)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select * from retail.fn_balance_por_tienda_de(p_corte, null, null, null, null)
$$;

-- 5. La lectura por partes: guarda el estado de resultados del mes y se lo pasa al presupuesto y al balance; la parte `balance` es nueva.
create or replace function retail.fn_resumen_finanzas_partes(p_ubicacion_id uuid default null, p_solo_empresa boolean default false, p_partes text[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_lider boolean := coalesce(retail.fn_es_lider(), false);
  v_hoy date := retail.fn_hoy_lima();
  v_mes date := date_trunc('month', retail.fn_hoy_lima())::date;
  v_mes_ant date := (date_trunc('month', retail.fn_hoy_lima()) - interval '1 month')::date;
  v_fin_ant date := (date_trunc('month', retail.fn_hoy_lima()) - interval '1 day')::date;
  v_ubic uuid;
  v_empresa boolean := false;
  v_todas boolean;
  v_tipo text;
  v_nombre text;
  v_param jsonb;
  v_dias integer := 7;
  v_out jsonb := '{}'::jsonb;
  v_ms jsonb := '{}'::jsonb;
  v_sec jsonb;
  v_t0 timestamptz;
  -- 20261113235000: sin `p_partes`, todas (lo que fue siempre `fn_resumen_finanzas`); con ellas, solo esas.
  v_todo boolean := p_partes is null;
  -- 20261114005000: el estado de resultados del mes, armado UNA vez en esta lectura; el presupuesto y el balance lo usan en vez de rearmarlo.
  v_er retail.fila_estado_resultados[];
begin
  if not v_todo and exists (select 1 from unnest(p_partes) x where x is null or x <> all (array[
       'resultados_mes', 'resultados_anterior', 'presupuesto', 'cuentas', 'por_pagar', 'flujo', 'igv',
       'campanas', 'egresos', 'fijos', 'raros', 'cierre', 'sin_cuenta', 'balance'])) then
    raise exception 'El Resumen no tiene esa parte: %.', array_to_string(p_partes, ', ') using errcode = '22023';
  end if;

  if not v_lider and not coalesce(retail.fn_capacidad_por_modulos(array['reportes_financieros']), false) then
    raise exception 'El Resumen de Finanzas necesita el módulo «Reportes financieros» en tu rol.' using errcode = '42501';
  end if;

  -- Qué se mira (regla 2).
  if v_lider then
    v_ubic := p_ubicacion_id;
    v_empresa := coalesce(p_solo_empresa, false) and p_ubicacion_id is null;
  else
    v_ubic := retail.fn_ubicacion_actual_persona();
    if v_ubic is null then
      raise exception 'Tu cuenta no tiene una sede: el Resumen muestra la tienda donde trabajas.' using errcode = '42501';
    end if;
    if coalesce(p_solo_empresa, false) or (p_ubicacion_id is not null and p_ubicacion_id <> v_ubic) then
      raise exception 'Con «Reportes financieros» ves solo tu tienda.' using errcode = '42501';
    end if;
  end if;
  if v_ubic is not null then
    select u.tipo, u.nombre into v_tipo, v_nombre from retail.ubicaciones u where u.id = v_ubic;
    if not found then
      raise exception 'Esa ubicación no existe.' using errcode = 'P0001';
    end if;
  elsif v_empresa then
    v_tipo := 'empresa'; v_nombre := 'De la empresa';
  else
    v_tipo := 'todas'; v_nombre := 'CAYLA';
  end if;
  v_todas := v_ubic is null and not v_empresa;

  -- Los umbrales de Configuración ▸ Caja y avisos (mínimo de caja, días para «vence pronto», % de «fuera de lo normal»).
  begin
    v_param := retail.fn_parametros_finanzas();
    v_dias := coalesce((v_param ->> 'aviso_vence_dias')::integer, 7);
  exception
    when insufficient_privilege then v_param := jsonb_build_object('sin_permiso', sqlerrm);
    when others then v_param := jsonb_build_object('falla', sqlerrm);
  end;

  v_out := jsonb_build_object(
    'hoy', v_hoy, 'mes', v_mes, 'mes_anterior', v_mes_ant, 'lider', v_lider,
    'ver', jsonb_build_object('ubicacion_id', v_ubic, 'solo_empresa', v_empresa, 'todas', v_todas, 'tipo', v_tipo, 'nombre', v_nombre),
    'parametros', v_param,
    -- Para «Ver» del líder: las tiendas y el Taller activos (la empresa la agrega la pantalla).
    'unidades', case when v_lider then coalesce((
        select jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre, 'tipo', u.tipo)
                         order by case u.tipo when 'tienda' then 1 else 2 end, u.nombre)
          from retail.ubicaciones u where u.activo and u.tipo in ('tienda', 'taller')), '[]'::jsonb)
      else '[]'::jsonb end
  );

  -- F5 · El mes en curso a la fecha (lo vendido) y el último mes completo (utilidad, punto de equilibrio, quién perdió).
  if v_todo or 'resultados_mes' = any (p_partes) then
    v_t0 := clock_timestamp();
    begin
      v_er := array(select e::retail.fila_estado_resultados from retail.fn_estado_resultados(v_mes, v_hoy, v_ubic) e);
      select jsonb_build_object('desde', v_mes, 'hasta', v_hoy,
                                'filas', coalesce(jsonb_agg(to_jsonb(r) order by r.orden, r.nombre), '[]'::jsonb))
        into v_sec
        from unnest(v_er) r
       where not v_empresa or r.unidad = 'empresa';
    exception
      when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
      when others then v_sec := jsonb_build_object('falla', sqlerrm);
    end;
    v_out := v_out || jsonb_build_object('resultados_mes', v_sec);
    v_ms := v_ms || jsonb_build_object('resultados_mes', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  if v_todo or 'resultados_anterior' = any (p_partes) then
    v_t0 := clock_timestamp();
    begin
      select jsonb_build_object('desde', v_mes_ant, 'hasta', v_fin_ant,
                                'filas', coalesce(jsonb_agg(to_jsonb(r) order by r.orden, r.nombre), '[]'::jsonb))
        into v_sec
        from retail.fn_estado_resultados(v_mes_ant, v_fin_ant, v_ubic) r
       where not v_empresa or r.unidad = 'empresa';
    exception
      when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
      when others then v_sec := jsonb_build_object('falla', sqlerrm);
    end;
    v_out := v_out || jsonb_build_object('resultados_anterior', v_sec);
    v_ms := v_ms || jsonb_build_object('resultados_anterior', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- Presupuesto · la meta de ventas del mes y los topes. Mirando CAYLA entera basta la fila de CAYLA y lo que se pasa.
  if v_todo or 'presupuesto' = any (p_partes) then
    v_t0 := clock_timestamp();
    begin
      select jsonb_build_object('filas', coalesce(jsonb_agg(to_jsonb(p) order by p.orden, p.nombre, p.orden_linea), '[]'::jsonb))
        into v_sec
        from retail.fn_presupuesto_vs_real_de(v_mes, v_ubic, null, v_er, v_mes, v_hoy, v_ubic) p
       where case when v_todas then p.unidad = 'consolidado' or p.se_pasa
                  when v_empresa then p.unidad = 'empresa'
                  else true end;
    exception
      when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
      when others then v_sec := jsonb_build_object('falla', sqlerrm);
    end;
    v_out := v_out || jsonb_build_object('presupuesto', v_sec);
    v_ms := v_ms || jsonb_build_object('presupuesto', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F3 · Los saldos de hoy. Una tienda: su cajón y su caja fuerte; la empresa: lo que no es de ninguna tienda.
  if v_todo or 'cuentas' = any (p_partes) then
    v_t0 := clock_timestamp();
    begin
      select jsonb_build_object('filas', coalesce(jsonb_agg(to_jsonb(c) order by c.orden, c.nombre), '[]'::jsonb))
        into v_sec
        from retail.fn_cuentas_dinero_saldos(v_hoy, v_ubic) c
       where not c.archivada
         and case when v_todas then true
                  when v_empresa then c.ubicacion_id is null
                  else c.ubicacion_id = v_ubic end;
    exception
      when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
      when others then v_sec := jsonb_build_object('falla', sqlerrm);
    end;
    v_out := v_out || jsonb_build_object('cuentas', v_sec);
    v_ms := v_ms || jsonb_build_object('cuentas', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F4 · Lo que se debe: el total, y cada comprobante vencido o que vence en los próximos `aviso_vence_dias`.
  if v_todo or 'por_pagar' = any (p_partes) then
    v_t0 := clock_timestamp();
    begin
      select jsonb_build_object('dias', v_dias, 'total', coalesce(sum(p.saldo), 0), 'n', count(*),
                                'filas', coalesce(jsonb_agg(to_jsonb(p) order by p.vence, p.proveedor, p.documento)
                                                    filter (where p.vence <= v_hoy + v_dias), '[]'::jsonb))
        into v_sec
        from retail.fn_por_pagar_consolidado(v_ubic, null, v_empresa) p;
    exception
      when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
      when others then v_sec := jsonb_build_object('falla', sqlerrm);
    end;
    v_out := v_out || jsonb_build_object('por_pagar', v_sec);
    v_ms := v_ms || jsonb_build_object('por_pagar', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F6 · Las próximas 6 semanas, los días de caja y la semana bajo el mínimo: son de CAYLA entera. CON los cobros día a día desde
  -- 20261109175000: la página de Resumen los necesita para «Tu caja en las próximas dos semanas» y antes volvía a pedir la proyección entera
  -- aparte (~2 s más por carga); ahora usa esta. Pesa unos KB más en la respuesta.
  if v_todo or 'flujo' = any (p_partes) then
    v_t0 := clock_timestamp();
    if v_todas then
      begin
        v_sec := retail.fn_flujo_caja_proyeccion(6);
      exception
        when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
        when others then v_sec := jsonb_build_object('falla', sqlerrm);
      end;
    else
      v_sec := jsonb_build_object('no_aplica', true);
    end if;
    v_out := v_out || jsonb_build_object('flujo', v_sec);
    v_ms := v_ms || jsonb_build_object('flujo', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F8 · El IGV del mes en curso (y el del anterior, que es el que se declara ahora) y el límite de 300 UIT.
  if v_todo or 'igv' = any (p_partes) then
    v_t0 := clock_timestamp();
    if v_todas then
      begin
        v_sec := retail.fn_impuestos_panel(v_mes);
      exception
        when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
        when others then v_sec := jsonb_build_object('falla', sqlerrm);
      end;
    else
      v_sec := jsonb_build_object('no_aplica', true);
    end if;
    v_out := v_out || jsonb_build_object('igv', v_sec);
    v_ms := v_ms || jsonb_build_object('igv', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F5 · Campañas que empiezan en las próximas dos semanas (el veredicto lo da la regla de F5 en la web). Solo donde se
  -- vende: CAYLA entera o una tienda (el Taller y la empresa no tienen meta de ventas que subir).
  if v_todo or 'campanas' = any (p_partes) then
    v_t0 := clock_timestamp();
    if v_todas or v_tipo = 'tienda' then
      begin
        select jsonb_build_object('filas', coalesce(jsonb_agg(to_jsonb(c) order by c.desde, c.nombre), '[]'::jsonb))
          into v_sec
          from retail.fn_campanas_reporte(v_ubic) c
         where c.momento = 'viene' and c.desde > v_hoy and c.desde <= v_hoy + 14;
      exception
        when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
        when others then v_sec := jsonb_build_object('falla', sqlerrm);
      end;
    else
      v_sec := jsonb_build_object('no_aplica', true);
    end if;
    v_out := v_out || jsonb_build_object('campanas', v_sec);
    v_ms := v_ms || jsonb_build_object('campanas', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F2 · Egresos de caja sin clasificar (siempre son de una caja, así que no aplican a «De la empresa»).
  if v_todo or 'egresos' = any (p_partes) then
    v_t0 := clock_timestamp();
    if not v_empresa then
      begin
        with e as materialized (select * from retail.fn_egresos_sin_clasificar(v_ubic, 1000)),
        x as (select e.ubicacion_id, e.ubicacion_nombre, count(*) as n, sum(e.monto) as monto
                from e group by e.ubicacion_id, e.ubicacion_nombre)
        select jsonb_build_object(
                 'n', (select count(*) from e), 'monto', coalesce((select sum(e.monto) from e), 0),
                 'desde', (select min(e.creado_en) from e),
                 'por_ubicacion', coalesce((select jsonb_agg(jsonb_build_object('ubicacion_id', x.ubicacion_id, 'nombre', x.ubicacion_nombre,
                                                                                'n', x.n, 'monto', x.monto)
                                                             order by x.n desc, x.ubicacion_nombre) from x), '[]'::jsonb))
          into v_sec;
      exception
        when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
        when others then v_sec := jsonb_build_object('falla', sqlerrm);
      end;
    else
      v_sec := jsonb_build_object('no_aplica', true);
    end if;
    v_out := v_out || jsonb_build_object('egresos', v_sec);
    v_ms := v_ms || jsonb_build_object('egresos', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F2b · Gastos fijos que ya debieron llegar este mes y no se registraron.
  if v_todo or 'fijos' = any (p_partes) then
    v_t0 := clock_timestamp();
    begin
      select jsonb_build_object('filas', coalesce(jsonb_agg(to_jsonb(f) order by f.fecha_esperada, f.descripcion), '[]'::jsonb))
        into v_sec
        from retail.fn_gastos_fijos_mes(v_mes, v_ubic, v_empresa) f
       where f.estado = 'falta';
    exception
      when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
      when others then v_sec := jsonb_build_object('falla', sqlerrm);
    end;
    v_out := v_out || jsonb_build_object('fijos', v_sec);
    v_ms := v_ms || jsonb_build_object('fijos', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F10 · Gastos fuera de lo normal (regla 4).
  if v_todo or 'raros' = any (p_partes) then
    v_t0 := clock_timestamp();
    begin
      select jsonb_build_object('pct', v_param -> 'aviso_gasto_pct',
                                'filas', coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb))
        into v_sec
        from retail.fn_gastos_fuera_de_lo_normal(v_ubic, v_empresa, null) r;
    exception
      when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
      when others then v_sec := jsonb_build_object('falla', sqlerrm);
    end;
    v_out := v_out || jsonb_build_object('raros', v_sec);
    v_ms := v_ms || jsonb_build_object('raros', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F9 · El mes anterior: qué unidades ya se cerraron. El cierre es solo del líder (el módulo no se delega). No se llama a
  -- `fn_cierre_mes_estado` (recorre el diario del mes entero): basta saber qué está cerrado.
  if v_todo or 'cierre' = any (p_partes) then
    v_t0 := clock_timestamp();
    if v_lider then
      begin
        with per as (select * from retail.fn_periodos_mes(v_mes_ant)),
        uni as (
          select 'ubicacion'::text as alc, u.id as uid, u.nombre::text as nom, case u.tipo when 'taller' then 2 else 1 end as ord
            from retail.ubicaciones u
           where u.activo and (v_todas or u.id = v_ubic)
          union all
          select 'empresa', null::uuid, 'De la empresa', 3 where v_todas or v_empresa
        )
        select jsonb_build_object(
                 'mes', v_mes_ant,
                 'consolidado', exists (select 1 from per where per.alcance = 'consolidado' and per.estado = 'cerrado'),
                 'unidades', coalesce(jsonb_agg(jsonb_build_object(
                               'alcance', uni.alc, 'ubicacion_id', uni.uid, 'nombre', uni.nom,
                               'cerrada', exists (select 1 from per where per.alcance = uni.alc
                                                    and per.ubicacion_id is not distinct from uni.uid and per.estado = 'cerrado'))
                             order by uni.ord, uni.nom), '[]'::jsonb))
          into v_sec
          from uni;
      exception
        when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
        when others then v_sec := jsonb_build_object('falla', sqlerrm);
      end;
    else
      v_sec := jsonb_build_object('no_aplica', true);
    end if;
    v_out := v_out || jsonb_build_object('cierre', v_sec);
    v_ms := v_ms || jsonb_build_object('cierre', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F3 · Lo que este mes movió plata sin decir de qué cuenta (no suma en ningún saldo). Es de CAYLA entera.
  if v_todo or 'sin_cuenta' = any (p_partes) then
    v_t0 := clock_timestamp();
    if v_todas or v_empresa then
      begin
        select jsonb_build_object('filas', coalesce(jsonb_agg(to_jsonb(s) order by s.origen), '[]'::jsonb))
          into v_sec
          from retail.fn_dinero_sin_cuenta(v_mes, v_hoy) s;
      exception
        when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
        when others then v_sec := jsonb_build_object('falla', sqlerrm);
      end;
    else
      v_sec := jsonb_build_object('no_aplica', true);
    end if;
    v_out := v_out || jsonb_build_object('sin_cuenta', v_sec);
    v_ms := v_ms || jsonb_build_object('sin_cuenta', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- 20261114005000 · El balance de cada sede a hoy («Cada sede, junta»), con el MISMO estado de resultados del mes si se pidió junto con
  -- `resultados_mes`. No es parte de la lectura entera (`p_partes` null): solo si se pide; fuera de aquí sigue siendo `fn_balance_por_tienda`.
  if 'balance' = any (p_partes) then
    v_t0 := clock_timestamp();
    begin
      select jsonb_build_object('corte', v_hoy,
                                'filas', coalesce(jsonb_agg(to_jsonb(b) - 'ordinality' order by b.ordinality), '[]'::jsonb))
        into v_sec
        from retail.fn_balance_por_tienda_de(v_hoy, v_er, v_mes, v_hoy, v_ubic) with ordinality b;
    exception
      when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
      when others then v_sec := jsonb_build_object('falla', sqlerrm);
    end;
    v_out := v_out || jsonb_build_object('balance', v_sec);
    v_ms := v_ms || jsonb_build_object('balance', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  return v_out || jsonb_build_object('ms', v_ms);
end 
$$;

-- 6. Comprobar: los cinco cuerpos son los de esta migración, y las `…_de` no las llama nadie de afuera.
do $comprobar$
begin
  if (select md5(prosrc) from pg_proc where oid = 'retail.fn_presupuesto_vs_real(date,uuid,date)'::regprocedure) <> 'b36503a9d736d942fc40a9e130bec5d3'
     or (select md5(prosrc) from pg_proc where oid = 'retail.fn_balance_por_tienda(date)'::regprocedure) <> '39b774054c027a1b45913b831b25220c'
     or (select md5(prosrc) from pg_proc where oid = 'retail.fn_presupuesto_vs_real_de(date,uuid,date,retail.fila_estado_resultados[],date,date,uuid)'::regprocedure) <> '381116ebfab98298e69c1cd99e5ddc22'
     or (select md5(prosrc) from pg_proc where oid = 'retail.fn_balance_por_tienda_de(date,retail.fila_estado_resultados[],date,date,uuid)'::regprocedure) <> 'c3511dc5fe9611e92e681a365fda055a'
     or (select md5(prosrc) from pg_proc where oid = 'retail.fn_resumen_finanzas_partes(uuid,boolean,text[])'::regprocedure) <> '861131fe7b72e780ae3843957046bf55' then
    raise exception '20261114005000: las funciones no quedaron como dice esta migración.';
  end if;
  if has_function_privilege('authenticated', 'retail.fn_presupuesto_vs_real_de(date,uuid,date,retail.fila_estado_resultados[],date,date,uuid)', 'execute')
     or has_function_privilege('anon', 'retail.fn_balance_por_tienda_de(date,retail.fila_estado_resultados[],date,date,uuid)', 'execute')
     or has_function_privilege('authenticated', 'retail.fn_balance_por_tienda_de(date,retail.fila_estado_resultados[],date,date,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'retail.fn_presupuesto_vs_real(date,uuid,date)', 'execute')
     or not has_function_privilege('authenticated', 'retail.fn_balance_por_tienda(date)', 'execute') then
    raise exception '20261114005000: los permisos no quedaron como dice esta migración.';
  end if;
end
$comprobar$;

select '20261114005000 · QUEDÓ BIEN: el estado de resultados del mes se arma una vez' as resultado;
