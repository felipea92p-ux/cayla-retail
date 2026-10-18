-- ============================================================================
-- 20261018040000_planilla_provision_por_sede.sql — CAYLA V2 (ADR-0453; Felipe 2026-10-17)
--
-- EL PROBLEMA PRIMERO. La planilla de Dynamic solo llega a retail cuando Dynamic la marca pagada (D-33, `planilla_por_sede`).
-- Su período va del 29 al 28 y se paga unos días DESPUÉS de cerrar: casi todo el mes, cada sede se ve SIN sueldos. El
-- «te quedan» del Resumen sale inflado, «Tu ritmo» pide menos de lo que hace falta vender, y el medidor de confianza dice
-- «Dynamic todavía no pagó el período: hasta que lo haga, el mes se ve sin sueldos» (ADR-0417). Pero Dynamic no está
-- ciego: calcula la boleta de cada persona hora por hora con las marcaciones del período abierto. Lo que falta es leerla.
--
-- QUÉ HACE. Dos funciones, solo lectura:
--   · `retail.fn_planilla_provision_calc(desde, hasta, hoy)` (interna): por cada período de Dynamic SIN pagar cuyo fin cae en
--     el rango, pide a Dynamic su propia proyección (`public.fn_proyeccion_periodo(periodo)`: la misma boleta que ve un admin
--     en la pantalla de Planilla de Dynamic, con la misma guardia de admin o líder) y la agrega POR SEDE:
--       devengado   lo que corresponde pagar hasta hoy: quien cobra por horas, lo que ya trabajó; quien tiene sueldo fijo,
--                   su sueldo en proporción a los días corridos del período. Es lo que Dynamic pagaría hoy.
--       al_cierre   lo que costaría el período entero: las horas al ritmo de lo trabajado y el sueldo fijo completo. Solo
--                   si ya corrieron 7 días (con menos, una semana rara decide el mes entero); si no, nulo.
--     La unidad es costo = `total + provision_total`, la MISMA definición de `planilla_por_sede` (lo que le cuesta a CAYLA).
--   · `retail.fn_planilla_provision(desde, hasta, ubicacion)` (la que llama la web): la anterior, acotada al alcance del
--     diario (`fn_diario_ubicaciones`): el líder ve todo; con «Reportes financieros», su sede.
--
-- DECISIONES DE FELIPE (2026-10-17).
--   1. Se ve en Resumen y Resultados como «estimado», FUERA DEL LIBRO: no entra al diario, al Balance ni al cierre. Cuando
--      Dynamic marca el período pagado, esta función deja de devolverlo y entra lo real (`planilla_por_sede` → diario).
--      Nunca se suman los dos: un período está pagado o no lo está.
--   2. Siempre el período ACTUAL, leído de las boletas; nunca «repetir el último período» ni promediar el historial.
--   3. Todas las sedes: tiendas, Taller y «de la empresa» (la central y la oficina de Trujillo). Sin configuración: todo
--      sale de Dynamic. Una sede nueva entra sola cuando Dynamic le pone al menos 3 personas.
--
-- QUÉ NO HACE. No escribe nada, no toca el diario ni el cierre, no guarda ninguna cifra (se recalcula en cada lectura), y
-- NUNCA devuelve el nombre ni el sueldo de una persona: solo importes por sede, con el MISMO piso que la vista
-- `planilla_por_sede` (una sede con menos de 3 personas en su boleta no se devuelve: con una sola, el agregado sería su
-- sueldo) y sin el grupo `prueba` (datos de ensayo de Dynamic). No reparte el período entre meses (D-35: el período que
-- termina en un mes es la planilla de ese mes). Un mes ya cerrado para esa unidad (`retail.periodos`) no recibe estimación:
-- lo cerrado se queda cerrado. No usa la tabla `colaboradores` de retail: el equipo de cada sede es el que Dynamic tiene.
--
-- PRINCIPIO 9 (todo puede fallar). Sin Dynamic en la base (local, CI) o sin que quien mira sea admin o líder allá
-- (`fn_planilla_visible()`), devuelve cero filas, sin error. Si Dynamic falla al proyectar UN período, se avisa en el log y
-- se sigue con los demás: una boleta rota nunca tira el Resumen ni los Resultados.
--
-- MEDIDO EN PRODUCCIÓN (2026-10-17, solo lectura): la boleta en vivo de un período ya pagado reproduce al céntimo lo que
-- Dynamic congeló en 4 de 5 sedes; y la fórmula de arriba, aplicada a la boleta del período ABIERTO, dio EXACTAMENTE el mismo
-- devengado que el cálculo de Dynamic cortado hoy (con sus bonos y descuentos sueltos), en las 5 sedes. Detalle en docs/adr/0453-*.md.
--
-- ESTADO: solo local hasta que Felipe la pegue en producción (prefijo `retail.` ya incluido). Es UN solo pegado: solo
-- `create or replace function`, `comment` y `grant`; ninguna política ni `alter` de tablas en uso (ADR-0195). Idempotente.
-- ============================================================================
set search_path = retail, public, extensions;

-- ---------- 1. El cálculo (interna: la web no la llama) ----------
create or replace function retail.fn_planilla_provision_calc(p_desde date, p_hasta date, p_hoy date default null)
returns table (
  ubicacion_id uuid, sede_codigo text, unidad text, periodo_id uuid, fecha_ini date, fecha_fin date,
  personas bigint, dias_periodo integer, dias_corridos integer, devengado numeric, al_cierre numeric
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_hoy date := coalesce(p_hoy, retail.fn_hoy_lima());
  r record;
  v jsonb;
  v_dias integer;
  v_corridos integer;
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
           case when v_corridos >= 7 then round(coalesce(m.horas, 0) * v_dias / v_corridos + coalesce(m.fijos, 0), 2) end
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
comment on function retail.fn_planilla_provision_calc(date, date, date) is
  'ADR-0453: lo que corresponde pagar de planilla, por sede, en cada período de Dynamic SIN pagar que termina en el rango: la boleta en vivo de Dynamic (fn_proyeccion_periodo) agregada por sede, hasta hoy (devengado) y al cierre del período (al_cierre, con 7 días corridos o más). Solo importes, nunca una persona; sedes con menos de 3 personas, ocultas; sin el grupo prueba. Vacía sin Dynamic o sin ser admin o líder allá. Interna: la web llama fn_planilla_provision.';

-- ---------- 2. La que llama la web (el alcance del diario) ----------
create or replace function retail.fn_planilla_provision(p_desde date, p_hasta date, p_ubicacion_id uuid default null)
returns table (
  ubicacion_id uuid, sede_codigo text, unidad text, periodo_id uuid, fecha_ini date, fecha_fin date,
  personas bigint, dias_periodo integer, dias_corridos integer, devengado numeric, al_cierre numeric
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_lider boolean := retail.fn_es_lider();
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_todo boolean;
begin
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver la planilla estimada necesita el módulo «Reportes financieros» en tu rol.' using errcode = '42501';
  end if;
  if p_ubicacion_id is not null then
    if not (p_ubicacion_id = any (v_ubics)) then
      raise exception 'No puedes ver los números de esa ubicación.' using errcode = '42501';
    end if;
    v_ubics := array[p_ubicacion_id];
  end if;
  v_todo := v_lider and p_ubicacion_id is null;
  return query
  select c.ubicacion_id, c.sede_codigo, c.unidad, c.periodo_id, c.fecha_ini, c.fecha_fin, c.personas, c.dias_periodo,
         c.dias_corridos, c.devengado, c.al_cierre
    from retail.fn_planilla_provision_calc(p_desde, p_hasta) c
   where v_todo or c.ubicacion_id = any (v_ubics);
end $$;
comment on function retail.fn_planilla_provision(date, date, uuid) is
  'ADR-0453: la planilla estimada de los períodos de Dynamic sin pagar (ver fn_planilla_provision_calc), acotada al alcance del diario: el líder ve todas las sedes y «de la empresa»; con Reportes financieros, su sede. Solo lectura; fuera del libro: no entra al diario, al Balance ni al cierre.';

-- ---------- 3. Quién puede llamarlas ----------
revoke all on function retail.fn_planilla_provision_calc(date, date, date) from public, anon, authenticated;
revoke all on function retail.fn_planilla_provision(date, date, uuid) from public, anon;
grant execute on function retail.fn_planilla_provision(date, date, uuid) to authenticated;

do $$
begin
  if to_regprocedure('retail.fn_planilla_provision(date, date, uuid)') is null
     or to_regprocedure('retail.fn_planilla_provision_calc(date, date, date)') is null then
    raise exception 'ADR-0453: alguna función no quedó creada';
  end if;
  if has_function_privilege('anon', 'retail.fn_planilla_provision(date, date, uuid)', 'execute')
     or has_function_privilege('authenticated', 'retail.fn_planilla_provision_calc(date, date, date)', 'execute') then
    raise exception 'ADR-0453: una función quedó con permisos de más';
  end if;
end $$;
