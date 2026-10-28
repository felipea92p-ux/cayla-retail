-- ============================================================================
-- 20261022081000_planilla_provision_hoy_por_horario.sql — CAYLA V2 (ADR-0453, actualización 2026-10-22; Felipe 2026-10-22)
--
-- EL PROBLEMA PRIMERO. La provisión de sueldos (20261018040000) devuelve lo que Dynamic ya sabe: las horas de las jornadas CERRADAS.
-- Dynamic no cuenta el día en curso: `fn_recalcular_jornada` solo llena `horas_trabajadas` cuando hay entrada Y salida final, así que una
-- persona que está en horario vale 0 hasta que cierra su jornada, y la cifra del mes siempre va un día atrás en horas (el sueldo fijo sí
-- corre por días corridos). Felipe pidió estimar también lo de hoy «por horario».
--
-- QUÉ HACE. Suma a cada fila de la provisión una columna nueva, `hoy_estimado`: lo que llevan hoy, hasta este momento, las personas que
-- están en su jornada. NO es un cálculo de Dynamic: es de retail, con las tasas de la propia boleta y las marcaciones de hoy:
--     horas de hoy  = (ahora − entrada) − las ausencias ya cerradas (cada `salida_*` hasta su `retorno_*`, la MISMA regla que
--                     `fn_recalcular_jornada`); si está en una ausencia (almuerzo…), solo hasta que salió.
--     costo de hoy  = horas × (pago_base − descuento_afp + provision_total) / horas_mes   [por hora]
--                   + monto_movilidad / dias_trabajados                                     [por día presente]
--   Medido en producción el 2026-10-22 contra 17 días reales de la planilla (cada día estimado con lo que se sabía el día anterior y
--   comparado con lo que Dynamic sumó de verdad): 13 de 17 días dentro de ±5 % (≈ ±S/ 35 de S/ 1 200); el costo PROMEDIO por hora
--   (total/horas) sobrestima 13 % porque mezcla la movilidad, que se paga por día. Por eso son dos tasas.
--
-- LOS TRES CANDADOS (lo que hace fiable el número).
--   1. SIN FERIADO. Si hoy es feriado en la boleta de Dynamic (`feriados`), no se estima: ese día Dynamic suma el pago del feriado a todos
--      (+S/ 956 el 2026-10-08) y el modelo por hora falla un 46 %. `hoy_estimado` sale nulo.
--   2. SIN JORNADA RARA. Entra solo quien tiene UNA entrada, ninguna salida final y una secuencia regular (cada retorno sigue a su salida;
--      empieza por la entrada) y 0 < horas ≤ 14. Una marca suelta, doble o una jornada de 20 horas se descarta: mejor no contarla que contarla mal.
--      Tampoco entra quien no tiene tasa (`horas_mes` = 0: empezó este período), ni «prueba», ni quien cobra sueldo fijo (ya corre por días).
--   3. SE REEMPLAZA AL CERRAR. La estimación solo cuenta jornadas SIN salida final. Apenas la persona marca su salida, Dynamic recalcula, sus
--      horas reales entran al `devengado` y deja de entrar a `hoy_estimado`: nunca se suman las dos. La boleta se lee ANTES que las
--      marcaciones: si una jornada cierra entre las dos lecturas, se pierde un instante, nunca se cuenta doble.
--
-- QUÉ NO CAMBIA. `devengado` y `al_cierre` quedan como estaban (`hoy_estimado` va aparte: la web lo suma al devengado y dice cuánto es de hoy).
-- Nunca devuelve una persona: solo importes por sede, con el mismo piso de 3 personas y sin el grupo `prueba`. Sigue siendo solo lectura.
-- Principio 9: sin `public.marcajes` (local, CI), con la columna renombrada o si algo falla, `hoy_estimado` sale nulo y se avisa en el log; la
-- provisión de siempre se devuelve igual.
--
-- SE ROMPE SI: Dynamic renombra `pago_base`, `descuento_afp`, `provision_total`, `monto_movilidad`, `horas_mes` o `dias_trabajados` en su boleta
-- (la estimación sale nula, sin error), o agrega otro concepto que crezca con cada hora (un bono por hora): el modelo lo subestimaría.
--
-- ESTADO: es UN solo pegado. Cambia la forma de lo que devuelven las dos funciones (una columna más), así que hace `drop function` de las dos
-- y las crea de nuevo; `drop function` NO toma bloqueos sobre `auth` ni `storage`. Sin tablas, sin políticas, sin `alter`. Idempotente.
-- Seguro en cualquier orden con la web: una web vieja ignora la columna nueva; una web nueva sin esta migración lee el devengado de siempre.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Las dos funciones de ADR-0453 cambian lo que devuelven: se crean de nuevo (nadie más las llama: la web usa la pública).
drop function if exists retail.fn_planilla_provision(date, date, uuid);
drop function if exists retail.fn_planilla_provision_calc(date, date, date);

-- ---------- 1. Lo que llevan HOY las personas que están en su jornada (interna) ----------
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
             ((f ->> 'pago_base')::numeric - coalesce((f ->> 'descuento_afp')::numeric, 0) + coalesce((f ->> 'provision_total')::numeric, 0))
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
  'ADR-0453 (act. 2026-10-22): por sede, lo que llevan hoy las personas que están en su jornada (sin salida final): horas de hoy × la tasa por hora de su boleta + su movilidad del día. Sin feriado, sin jornada rara; solo importes. Interna: la llama fn_planilla_provision_calc.';

-- ---------- 2. El cálculo (interna: la web no la llama) ----------
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
             coalesce((f ->> 'total')::numeric, 0) + coalesce((f ->> 'provision_total')::numeric, 0) as costo
        from jsonb_array_elements(coalesce(v -> 'filas', '[]'::jsonb)) f
       where coalesce(f ->> 'tipo_vinculo', '') <> 'prueba'
    ),
    por_sede as (
      select fl.sede, count(*) as n,
             sum(fl.costo) filter (where not fl.fijo) as horas,
             sum(fl.costo) filter (where fl.fijo) as fijos
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
  'ADR-0453: lo que corresponde pagar de planilla, por sede, en cada período de Dynamic SIN pagar que termina en el rango: la boleta en vivo de Dynamic (fn_proyeccion_periodo) agregada por sede, hasta hoy (devengado), al cierre del período (al_cierre, con 7 días corridos o más) y, aparte, lo que llevan hoy las personas en su jornada (hoy_estimado, act. 2026-10-22: sin feriado, sin jornada rara; nulo si no se puede). Solo importes, nunca una persona; sedes con menos de 3 personas, ocultas; sin el grupo prueba. Vacía sin Dynamic o sin ser admin o líder allá. Interna: la web llama fn_planilla_provision.';

-- ---------- 3. La que llama la web (el alcance del diario) ----------
create or replace function retail.fn_planilla_provision(p_desde date, p_hasta date, p_ubicacion_id uuid default null)
returns table (
  ubicacion_id uuid, sede_codigo text, unidad text, periodo_id uuid, fecha_ini date, fecha_fin date,
  personas bigint, dias_periodo integer, dias_corridos integer, devengado numeric, al_cierre numeric, hoy_estimado numeric
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_ve_todo boolean := coalesce(retail.fn_ve_finanzas_de_todo(), false);
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_todo boolean;
begin
  if not v_ve_todo and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver la planilla estimada necesita el módulo «Reportes financieros» en tu rol.' using errcode = '42501';
  end if;
  if p_ubicacion_id is not null then
    if not (p_ubicacion_id = any (v_ubics)) then
      raise exception 'No puedes ver los números de esa ubicación.' using errcode = '42501';
    end if;
    v_ubics := array[p_ubicacion_id];
  end if;
  v_todo := v_ve_todo and p_ubicacion_id is null;
  return query
  select c.ubicacion_id, c.sede_codigo, c.unidad, c.periodo_id, c.fecha_ini, c.fecha_fin, c.personas, c.dias_periodo,
         c.dias_corridos, c.devengado, c.al_cierre, c.hoy_estimado
    from retail.fn_planilla_provision_calc(p_desde, p_hasta) c
   where v_todo or c.ubicacion_id = any (v_ubics);
end $$;
comment on function retail.fn_planilla_provision(date, date, uuid) is
  'ADR-0453: la planilla estimada de los períodos de Dynamic sin pagar (ver fn_planilla_provision_calc), acotada al mismo alcance que el Estado de resultados (fn_ve_finanzas_de_todo): quien ve todo ve todas las sedes y «de la empresa»; con solo Reportes financieros, su sede. Incluye hoy_estimado (act. 2026-10-22). Solo lectura; fuera del libro: no entra al diario, al Balance ni al cierre.';

-- ---------- 4. Quién puede llamarlas ----------
revoke all on function retail.fn_planilla_hoy_por_sede(jsonb, date, timestamptz) from public, anon, authenticated;
revoke all on function retail.fn_planilla_provision_calc(date, date, date, timestamptz) from public, anon, authenticated;
revoke all on function retail.fn_planilla_provision(date, date, uuid) from public, anon;
grant execute on function retail.fn_planilla_provision(date, date, uuid) to authenticated;

do $$
begin
  if to_regprocedure('retail.fn_planilla_provision(date, date, uuid)') is null
     or to_regprocedure('retail.fn_planilla_provision_calc(date, date, date, timestamptz)') is null
     or to_regprocedure('retail.fn_planilla_hoy_por_sede(jsonb, date, timestamptz)') is null then
    raise exception 'ADR-0453: alguna función no quedó creada';
  end if;
  if has_function_privilege('anon', 'retail.fn_planilla_provision(date, date, uuid)', 'execute')
     or has_function_privilege('authenticated', 'retail.fn_planilla_provision_calc(date, date, date, timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'retail.fn_planilla_hoy_por_sede(jsonb, date, timestamptz)', 'execute') then
    raise exception 'ADR-0453: una función quedó con permisos de más';
  end if;
end $$;
