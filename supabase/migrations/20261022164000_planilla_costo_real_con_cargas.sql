-- ============================================================================
-- 20261022164000_planilla_costo_real_con_cargas.sql — CAYLA V2 (ADR-0474, decisión de Felipe 2026-10-22; toca ADR-0133 y ADR-0453)
--
-- EL PROBLEMA PRIMERO. El costo de planilla que retail asienta en la cuenta 62 era `total + provision_total` (la definición de Dynamic:
-- `v_planilla_pagada.costo_total`). Pero `total` es lo que RECIBE la persona, ya sin la AFP ni la renta de 4ª que se le retienen, y al empleador
-- le cuesta además su EsSalud. Medido en septiembre (28 personas, sin «prueba»): neto S/ 30 062 + AFP 2 214 + renta de 4ª 87 = bruto S/ 32 364;
-- + EsSalud del empleador 2 476 + provisiones 3 363 (que ya traen la bonificación extraordinaria) = S/ 38 203 de costo real, contra los
-- S/ 33 426 que veía el Estado de resultados: 12,5 % de menos en el gasto fijo más grande, así que el resultado del mes parecía mejor de lo que es.
--
-- QUÉ HACE. El costo de planilla de retail pasa a ser el COSTO REAL:
--     costo = total + descuento_pension (AFP) + retencion_4ta + aporte_essalud + provision_total      (= bruto + EsSalud + provisiones)
--   1. `retail.planilla_por_sede.costo_total` (lo PAGADO): la misma suma, sobre la foto congelada de Dynamic. `pagado` (el neto) y `provisiones` no
--      cambian: el Flujo de caja sigue leyendo `pagado`. Lo lee también Producción ▸ Eficiencia (el costo de la planilla del Taller por prenda sube igual).
--   2. `fn_planilla_provision_calc` (lo PROVISIONADO de un período sin pagar): la misma suma por persona, con una diferencia que importa: el EsSalud
--      de un período abierto es el del MES ENTERO (1 992,60 tanto cortado a mitad de mes como completo: sale del piso de EsSalud, no de las horas),
--      así que se prorratea por días corridos, igual que el sueldo fijo; la AFP y la renta de 4ª sí crecen con las horas y entran como están.
--   3. `fn_planilla_hoy_por_sede` (lo de HOY): la tasa por hora pasa a la base del bruto, `(pago_base + provision_total) / horas_mes` (antes restaba la AFP para
--      parecerse al neto), y la movilidad por día no cambia. Retrotest 5 al 21 de octubre contra lo que Dynamic sumó con la definición nueva: ≈ −1,6 % en los
--      días normales (13 de 17 dentro de ±5 %; los otros cuatro, los mismos de siempre: 7, 8, 10 y 15 de octubre).
--
-- QUÉ NO CAMBIA. Un mes CERRADO se queda cerrado (su diario está congelado). Pero producción no tiene ningún mes cerrado todavía: al pegar esto cambia de
-- inmediato la planilla de septiembre y de cualquier período ya pagado que se mire en un mes abierto (septiembre: +S/ 4 777). Es lo que se quiere.
-- La cuenta sigue siendo la 62 junta; si el contador prefiere separar 621, 627 y 629, es otra decisión (ADR-0474).
--
-- SE ROMPE SI: Dynamic renombra `descuento_pension`, `retencion_4ta` o `aporte_essalud` en `v_planilla_pagada` o `descuento_afp`, `retencion_4ta`,
-- `aporte_essalud` en su boleta (la provisión los toma como 0 y el costo vuelve a verse corto, sin error), o cambia cómo calcula el piso de EsSalud
-- (si dejara de ser el mes entero en un período abierto, el prorrateo por días lo sobrestimaría).
--
-- ESTADO: es UN solo pegado. `create or replace view` de una vista (se crea solo si Dynamic está en la base, como la original) y `create or replace`
-- de dos funciones que NO cambian de forma; sin tablas, políticas ni `alter`. Idempotente. Seguro en cualquier orden con la web (no cambia nada que ella lea).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Lo PAGADO: el costo real por sede y período ----------
do $$
begin
  if to_regclass('public.v_planilla_pagada') is null or to_regclass('public.periodos_planilla') is null or to_regclass('public.sedes') is null then
    raise notice 'planilla_por_sede: Dynamic (v_planilla_pagada / periodos_planilla / sedes) no está en esta base: no se toca la vista.';
    return;
  end if;

  execute $vista$
    create or replace view retail.planilla_por_sede with (security_invoker = true) as
    select
      v.sede_codigo,
      s.tipo                          as sede_tipo,
      p.id                            as periodo_id,
      p.fecha_ini,
      p.fecha_fin,
      count(distinct v.persona_id)    as personas,
      sum(v.total)                    as pagado,
      sum(v.provision_total)          as provisiones,
      sum(v.total + coalesce(v.descuento_pension, 0) + coalesce(v.retencion_4ta, 0) + coalesce(v.aporte_essalud, 0) + v.provision_total) as costo_total
    from public.v_planilla_pagada v
    join public.periodos_planilla p on p.id = v.periodo_id and p.estado = 'pagado'
    join public.sedes s on s.codigo = v.sede_codigo
    where v.grupo is distinct from 'prueba'
    group by v.sede_codigo, s.tipo, p.id, p.fecha_ini, p.fecha_fin
    having count(distinct v.persona_id) >= 3
  $vista$;

  execute $c$
    comment on view retail.planilla_por_sede is
      'D-33 (act. ADR-0474): lo que costó la planilla YA PAGADA de cada sede en cada período de Dynamic (29 al 28). costo_total es el COSTO REAL: lo pagado (neto) + la AFP y la renta de 4ª retenidas + el EsSalud del empleador + las provisiones. pagado es solo el neto. Solo importes agregados, nunca una persona identificable; grupos de menos de 3 personas ocultos. security_invoker: solo quien es admin o líder en Dynamic ve filas.'
  $c$;

  execute 'revoke all on retail.planilla_por_sede from public, anon';
  execute 'grant select on retail.planilla_por_sede to authenticated';
end $$;

-- ---------- 2. Lo de HOY: la tasa por hora sobre el bruto ----------
create or replace function retail.fn_planilla_hoy_por_sede(p_proyeccion jsonb, p_hoy date, p_ahora timestamptz)
returns table (sede text, estimado numeric, personas integer)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  -- Candado 1: un feriado no se estima (Dynamic le suma el pago del feriado a todos y el modelo por hora no lo ve).
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_proyeccion -> 'feriados', '[]'::jsonb)) x
     where x ->> 'fecha' = p_hoy::text
  ) then
    return;
  end if;
  -- Sin marcaciones de Dynamic (local, CI): no hay nada que estimar, y no es un error.
  if to_regclass('public.marcajes') is null then
    return;
  end if;

  return query execute $q$
    with filas as (
      select (f ->> 'persona_id')::uuid as persona_id,
             f ->> 'sede' as sede,
             -- La base del costo real es el BRUTO: el pago por hora más lo que se provisiona por esa hora (la AFP ya no se resta).
             ((f ->> 'pago_base')::numeric + coalesce((f ->> 'provision_total')::numeric, 0))
               / nullif((f ->> 'horas_mes')::numeric, 0) as por_hora,
             coalesce((f ->> 'monto_movilidad')::numeric, 0) / nullif((f ->> 'dias_trabajados')::numeric, 0) as por_dia
        from jsonb_array_elements(coalesce($1 -> 'filas', '[]'::jsonb)) f
       where coalesce(f ->> 'tipo_vinculo', '') <> 'prueba'
         and not coalesce((f ->> 'sueldo_fijo')::boolean, false)
         and f ->> 'sede' is not null
    ),
    m as (
      select mk.persona_id, mk.tipo::text as tipo, mk.timestamp_marca as ts,
             lag(mk.tipo::text) over w as tipo_ant, lag(mk.timestamp_marca) over w as ts_ant,
             lead(mk.tipo::text) over w as tipo_sig, row_number() over w as n
        from public.marcajes mk
       where mk.persona_id in (select persona_id from filas)
         and coalesce(mk.fecha_jornada, (mk.timestamp_marca at time zone 'America/Lima')::date) = $2
         and mk.anulada_at is null
      window w as (partition by mk.persona_id order by mk.timestamp_marca)
    ),
    por_persona as (
      select persona_id,
             min(ts) filter (where tipo = 'entrada') as entrada,
             count(*) filter (where tipo = 'entrada') as n_entradas,
             bool_or(tipo = 'salida_final') as cerrada,
             bool_or(n = 1 and tipo <> 'entrada') as empieza_mal,
             -- un retorno que no sigue a su salida, o una salida que sigue con algo que no es su retorno: secuencia rara
             bool_or(starts_with(tipo, 'retorno_') and not (starts_with(coalesce(tipo_ant, ''), 'salida_') and tipo_ant <> 'salida_final')) as retorno_suelto,
             bool_or(starts_with(tipo, 'salida_') and tipo <> 'salida_final' and tipo_sig is not null and not starts_with(tipo_sig, 'retorno_')) as salida_rota,
             coalesce(sum(ts - ts_ant) filter (where starts_with(tipo, 'retorno_') and starts_with(coalesce(tipo_ant, ''), 'salida_') and tipo_ant <> 'salida_final'), interval '0') as ausencias,
             max(ts) filter (where starts_with(tipo, 'salida_') and tipo <> 'salida_final' and tipo_sig is null) as ausente_desde
        from m
       group by persona_id
    ),
    horas as (
      -- Candado 2: una sola entrada, sin salida final, secuencia regular. En una ausencia (almuerzo…) cuenta hasta que salió.
      select p.persona_id,
             (extract(epoch from (coalesce(p.ausente_desde, $3) - p.entrada) - p.ausencias) / 3600.0)::numeric as h
        from por_persona p
       where p.n_entradas = 1 and not p.cerrada and not p.empieza_mal and not p.retorno_suelto and not p.salida_rota
         and p.entrada <= $3
    )
    select f.sede, round(sum(h.h * f.por_hora + coalesce(f.por_dia, 0)), 2), count(*)::integer
      from horas h
      join filas f on f.persona_id = h.persona_id
     where h.h > 0 and h.h <= 14 and f.por_hora is not null
     group by f.sede
  $q$ using p_proyeccion, p_hoy, p_ahora;
end $$;
comment on function retail.fn_planilla_hoy_por_sede(jsonb, date, timestamptz) is
  'ADR-0453 (act. 2026-10-22) y ADR-0474: por sede, lo que llevan hoy las personas que están en su jornada (sin salida final): horas de hoy × la tasa por hora del BRUTO de su boleta ((pago_base + provision_total) / horas_mes) + su movilidad del día. Sin feriado, sin jornada rara; solo importes. Interna: la llama fn_planilla_provision_calc.';

-- ---------- 3. Lo PROVISIONADO: el costo real de un período sin pagar ----------
create or replace function retail.fn_planilla_provision_calc(p_desde date, p_hasta date, p_hoy date default null, p_ahora timestamptz default null)
returns table (
  ubicacion_id uuid, sede_codigo text, unidad text, periodo_id uuid, fecha_ini date, fecha_fin date,
  personas bigint, dias_periodo integer, dias_corridos integer, devengado numeric, al_cierre numeric, hoy_estimado numeric
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_hoy date := coalesce(p_hoy, retail.fn_hoy_lima());
  v_ahora timestamptz := coalesce(p_ahora, now());
  r record;
  v jsonb;
  v_dias integer;
  v_corridos integer;
  v_hoy_json jsonb;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas no es válido.' using errcode = 'P0001';
  end if;
  -- Sin Dynamic, o sin ser admin o líder allá, no hay nada que mostrar: no es un error.
  if not retail.fn_planilla_visible()
     or to_regprocedure('public.fn_proyeccion_periodo(uuid)') is null
     or to_regclass('public.periodos_planilla') is null then
    return;
  end if;

  for r in
    select pp.id, pp.fecha_ini, pp.fecha_fin
      from public.periodos_planilla pp
     where pp.estado <> 'pagado' and pp.fecha_fin between p_desde and p_hasta
     order by pp.fecha_fin
  loop
    begin
      v := public.fn_proyeccion_periodo(r.id);
    exception when others then
      raise warning 'fn_planilla_provision: Dynamic no pudo proyectar el período % (%).', r.id, sqlerrm;
      continue;
    end;
    v_dias := r.fecha_fin - r.fecha_ini + 1;
    v_corridos := greatest(0, least(v_dias, v_hoy - r.fecha_ini + 1));

    -- Lo de HOY por sede (solo si hoy cae dentro de este período). Después de leer la boleta, nunca antes: si una jornada cierra entre las
    -- dos lecturas se pierde un instante, jamás se cuenta dos veces. Si falla, la provisión de siempre sale igual (principio 9).
    v_hoy_json := '{}'::jsonb;
    if v_hoy between r.fecha_ini and r.fecha_fin then
      begin
        select coalesce(jsonb_object_agg(h.sede, h.estimado), '{}'::jsonb) into v_hoy_json
          from retail.fn_planilla_hoy_por_sede(v, v_hoy, v_ahora) h;
      exception when others then
        raise warning 'fn_planilla_provision: no pude estimar hoy para el período % (%).', r.id, sqlerrm;
        v_hoy_json := '{}'::jsonb;
      end;
    end if;

    return query
    with filas as (
      select f ->> 'sede' as sede,
             coalesce((f ->> 'sueldo_fijo')::boolean, false) as fijo,
             -- COSTO REAL (ADR-0474): lo que recibe + la AFP y la renta de 4ª retenidas (son del bruto) + las provisiones.
             coalesce((f ->> 'total')::numeric, 0) + coalesce((f ->> 'descuento_afp')::numeric, 0) + coalesce((f ->> 'retencion_4ta')::numeric, 0)
               + coalesce((f ->> 'provision_total')::numeric, 0) as costo,
             -- El EsSalud del empleador de un período abierto es el del MES entero (sale del piso, no de las horas): corre por días, como un fijo.
             coalesce((f ->> 'aporte_essalud')::numeric, 0) as essalud
        from jsonb_array_elements(coalesce(v -> 'filas', '[]'::jsonb)) f
       where coalesce(f ->> 'tipo_vinculo', '') <> 'prueba'
    ),
    por_sede as (
      select fl.sede, count(*) as n,
             sum(fl.costo) filter (where not fl.fijo) as horas,
             coalesce(sum(fl.costo) filter (where fl.fijo), 0) + coalesce(sum(fl.essalud), 0) as fijos
        from filas fl
       where fl.sede is not null
       group by fl.sede
      having count(*) >= 3
    ),
    -- Mismo mapeo que `fn_planilla_periodos`: la sede de Dynamic se une por `sede_dynamic_id`; la de tipo taller es el Taller de
    -- retail (su código `LIM` NO es la tienda de Lima); la central y la oficina son «de la empresa» (ubicación nula).
    mapeo as (
      select ps.sede, ps.n, ps.horas, ps.fijos,
             coalesce(u.id, case when s.tipo = 'taller' then
               (select t.id from retail.ubicaciones t where t.tipo = 'taller' order by t.activo desc, t.created_at limit 1) end) as ubic
        from por_sede ps
        left join public.sedes s on s.codigo = ps.sede
        left join retail.ubicaciones u on u.sede_dynamic_id = s.id
    )
    select m.ubic, m.sede::text,
           (case when ub.id is null then 'empresa' when ub.tipo = 'taller' then 'taller' else 'tienda' end)::text,
           r.id, r.fecha_ini, r.fecha_fin, m.n::bigint, v_dias, v_corridos,
           round(coalesce(m.horas, 0) + coalesce(m.fijos, 0) * v_corridos / v_dias, 2),
           case when v_corridos >= 7 then round(coalesce(m.horas, 0) * v_dias / v_corridos + coalesce(m.fijos, 0), 2) end,
           (v_hoy_json ->> m.sede)::numeric
      from mapeo m
      left join retail.ubicaciones ub on ub.id = m.ubic
     -- Lo cerrado se queda cerrado: una unidad con el mes cerrado lee su diario congelado, sin estimación.
     where not exists (
       select 1 from retail.periodos pr
        where pr.estado = 'cerrado' and pr.mes = date_trunc('month', r.fecha_fin)::date
          and ((m.ubic is not null and pr.alcance = 'ubicacion' and pr.ubicacion_id = m.ubic)
            or (m.ubic is null and pr.alcance = 'empresa')));
  end loop;
end $$;
comment on function retail.fn_planilla_provision_calc(date, date, date, timestamptz) is
  'ADR-0453 y ADR-0474: lo que corresponde pagar de planilla, por sede, en cada período de Dynamic SIN pagar que termina en el rango, como COSTO REAL: lo pagado + AFP y renta de 4ª retenidas + provisiones (hasta hoy, por las horas) y el EsSalud del empleador (el del mes entero, por días corridos). devengado = hasta hoy; al_cierre = el período entero (con 7 días corridos o más); hoy_estimado = lo que llevan hoy las personas en su jornada (sin feriado, sin jornada rara; nulo si no se puede). Solo importes, nunca una persona; sedes con menos de 3 personas, ocultas; sin el grupo prueba. Vacía sin Dynamic o sin ser admin o líder allá. Interna: la web llama fn_planilla_provision.';

-- ---------- 4. Quién puede llamarlas (igual que antes) ----------
revoke all on function retail.fn_planilla_hoy_por_sede(jsonb, date, timestamptz) from public, anon, authenticated;
revoke all on function retail.fn_planilla_provision_calc(date, date, date, timestamptz) from public, anon, authenticated;

do $$
begin
  if to_regprocedure('retail.fn_planilla_provision(date, date, uuid)') is null
     or to_regprocedure('retail.fn_planilla_provision_calc(date, date, date, timestamptz)') is null
     or to_regprocedure('retail.fn_planilla_hoy_por_sede(jsonb, date, timestamptz)') is null then
    raise exception 'ADR-0474: alguna función de la provisión no existe (falta 20261022081000)';
  end if;
  if has_function_privilege('authenticated', 'retail.fn_planilla_provision_calc(date, date, date, timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'retail.fn_planilla_hoy_por_sede(jsonb, date, timestamptz)', 'execute') then
    raise exception 'ADR-0474: una función interna quedó con permisos de más';
  end if;
end $$;
