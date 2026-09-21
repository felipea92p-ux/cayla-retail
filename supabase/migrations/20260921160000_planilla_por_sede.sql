-- ============================================================================
-- 20260921160000_planilla_por_sede.sql — CAYLA V2 (ADR-0133, F7; decisión D-33 de DECISIONES-2026-09-12)
--
-- PROBLEMA. El Taller se mide por lo que cuesta cada prenda que sale de él (D-31: «costo absorbido»), y el gasto más grande del Taller es la
-- planilla —sueldos, provisiones y aportes—, que vive en Dynamic (el sistema de personal). D-33 decidió que retail LEE ese número de allá, sin duplicarlo
-- ni pedírselo a nadie: «retail necesita cuánto costó la planilla del Taller en agosto, no cuánto gana fulana». Esa ventana entre los dos sistemas
-- (la «vista puente» de `docs/datos/14-DYNAMIC.md` §7.2) nunca se construyó.
--
-- QUÉ HACE. Una vista `retail.planilla_por_sede`, `security_invoker = true`, que agrega la planilla YA PAGADA por sede y período:
--   · fuente: `public.v_planilla_pagada` (la foto congelada de Dynamic: la versión vigente de cada período y grupo) + `public.periodos_planilla`
--     (solo `estado = 'pagado'`) + `public.sedes` (para saber cuál es el Taller: `tipo = 'taller'`, nunca por su código — `LIM` es el Taller, no la tienda de Lima).
--   · devuelve SOLO importes agregados: personas, pagado (`total`), provisiones y `costo_total` (= lo que le costó a CAYLA). **Nunca** el nombre ni el
--     sueldo de una persona identificable: no expone `persona_id` ni `nombre`, y **oculta cualquier grupo de menos de 3 personas** (con una sola, el agregado
--     sería su sueldo).
--   · excluye el grupo `prueba` (datos de ensayo de Dynamic).
-- Al ser `security_invoker`, la vista la lee CADA persona con SUS propios permisos de Dynamic: solo quien allá es admin o líder de desarrollo organizacional
-- ve filas (`fn_es_admin_o_lider()`); para cualquier otra persona la vista sale VACÍA. Retail no abre ninguna puerta nueva a la planilla ni se salta su RLS.
--
-- QUÉ NO HACE. No escribe nada, no duplica ninguna tabla de Dynamic, no reparte la planilla entre meses (la regla del contador, D-35: aquí el período es el de
-- Dynamic, del 29 al 28) y no toca ninguna tabla de Dynamic.
--
-- LOCAL. Las bases locales solo tienen un STUB de Dynamic (`personas`, `sedes`): sin `v_planilla_pagada` ni `periodos_planilla`. Por eso la vista se crea SOLO
-- si esos dos objetos existen; si no, esta migración avisa y no hace nada (nunca rompe un `db reset`). La app tolera que la vista falte.
--
-- ESTADO: solo local hasta que Felipe la pegue en producción (prefijo `retail.` ya incluido). Idempotente.
-- ============================================================================

do $$
begin
  if to_regclass('public.v_planilla_pagada') is null or to_regclass('public.periodos_planilla') is null or to_regclass('public.sedes') is null then
    raise notice 'planilla_por_sede: Dynamic (v_planilla_pagada / periodos_planilla / sedes) no está en esta base: no se crea la vista.';
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
      sum(v.costo_total)              as costo_total
    from public.v_planilla_pagada v
    join public.periodos_planilla p on p.id = v.periodo_id and p.estado = 'pagado'
    join public.sedes s on s.codigo = v.sede_codigo
    where v.grupo is distinct from 'prueba'
    group by v.sede_codigo, s.tipo, p.id, p.fecha_ini, p.fecha_fin
    having count(distinct v.persona_id) >= 3
  $vista$;

  execute $c$
    comment on view retail.planilla_por_sede is
      'D-33: lo que costó la planilla YA PAGADA de cada sede en cada período de Dynamic (29 al 28). Solo importes agregados, nunca una persona identificable; grupos de menos de 3 personas ocultos. security_invoker: solo quien es admin o líder en Dynamic ve filas.'
  $c$;

  execute 'revoke all on retail.planilla_por_sede from public, anon';
  execute 'grant select on retail.planilla_por_sede to authenticated';
end $$;
