-- ============================================================================
-- 20261106235000 — Finanzas cuenta los sueldos de TODA sede, aunque tenga menos de 3 personas (ADR-0453, act. 2026-11-06)
--
-- EL PROBLEMA PRIMERO. La planilla de cada sede (pagada: la vista `planilla_por_sede`; estimada: `fn_planilla_provision_calc`) ocultaba
-- toda sede con menos de 3 personas, para que nadie pudiera deducir un sueldo (D-33). Pero no la pasaba a otra fila: la sacaba del
-- TOTAL. En noviembre de 2026 Tienda AQP bajó a 2 personas y sus sueldos desaparecieron: AQP se veía ganando y CAYLA entera más
-- rentable de lo que era. Al pagarse el período (28-nov) habría pasado lo mismo en el libro.
--
-- LA DECISIÓN (Felipe, 2026-11-06): contar siempre. El piso no protegía a nadie aquí: estas cifras solo las ve quien en Dynamic es
-- admin o líder (`fn_planilla_visible`), y esa persona ya ve cada boleta allá. Lo que sigue igual: nunca sale una persona ni su
-- nombre, solo importes por sede, y el grupo `prueba` no cuenta.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución, idempotente. Sin políticas ni `alter table`: no toma las tablas de `auth`/`storage`.
-- La función se corrige con un reemplazo anclado sobre su definición viva (si el ancla no aparece exactamente una vez, aborta entero).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- La estimada: sin piso de personas.
select pg_temp.reemplazar('retail.fn_planilla_provision_calc(date,date,date,timestamp with time zone)',
  $v$having count(*) >= 3$v$,
  $n$-- sin piso de personas: toda sede cuenta (ADR-0453, act. 2026-11-06)$n$, 1);

-- La pagada: la misma vista de 20261106011000, sin el `having`.
do $$
begin
  if to_regclass('public.v_planilla_pagada') is null or to_regclass('public.periodos_planilla') is null or to_regclass('public.sedes') is null
     or to_regclass('public.movimientos_planilla') is null then
    raise notice 'planilla_por_sede: Dynamic no está en esta base: no se toca la vista.';
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
      sum(v.total + coalesce(v.descuento_pension, 0) + coalesce(v.retencion_4ta, 0) + coalesce(v.aporte_essalud, 0) + v.provision_total
          - coalesce((select sum(m.monto) from public.movimientos_planilla m
                       where m.periodo_id = v.periodo_id and m.persona_id = v.persona_id and m.tipo = 'bono'
                         and m.categoria in ('gratificacion', 'cts', 'vacaciones', 'bonificacion_extraordinaria')), 0)) as costo_total,
      sum(coalesce(v.descuento_pension, 0) + coalesce(v.retencion_4ta, 0) + coalesce(v.aporte_essalud, 0)) as aportes
    from public.v_planilla_pagada v
    join public.periodos_planilla p on p.id = v.periodo_id and p.estado = 'pagado'
    join public.sedes s on s.codigo = v.sede_codigo
    where v.grupo is distinct from 'prueba'
    group by v.sede_codigo, s.tipo, p.id, p.fecha_ini, p.fecha_fin
  $vista$;

  comment on view retail.planilla_por_sede is
    'D-33 (act. ADR-0474 y ADR-0453 2026-11-06): lo que costó la planilla YA PAGADA de cada sede en cada período de Dynamic (29 al 28). costo_total es el COSTO REAL. Solo importes agregados por sede, nunca una persona; toda sede cuenta, aunque tenga 1 o 2 personas (el piso de 3 sacaba sus sueldos del total). security_invoker: solo quien es admin o líder en Dynamic ve filas.';
end $$;
