-- ============================================================================
-- 20261116175000 — Las campañas de la caja no se cuelgan con «que la otra ceda» (ADR-0655, casuística 2026-11-16)
--
-- EL PROBLEMA. `fn_campanas_en_sede` (las campañas y rebajas de hoy que leen Vender, Apartar, Existencias y `registrar_venta`) calla a
--   una oferta que CEDIÓ donde la otra rige. Lo preguntaba prenda por prenda: por cada prenda del catálogo y cada cesión llamaba a
--   `fn_regla_alcanza_variante`, que arma sus listas con subconsultas. Con tres rebajas cediéndose sobre una categoría, la lectura de la
--   caja pasó de 19 ms a 11 s en una base local de ~2.000 prendas (verificado el 2026-11-16 en la casuística): la API la corta y Vender dice
--   «No se pudieron cargar las campañas de hoy». Producción tiene ~3.900 prendas y ninguna cesión todavía (0 filas al 2026-11-16): el
--   primer «Elegir cuál queda» del aviso de dos ofertas la habría colgado.
--
-- LO QUE HACE.
--   · `fn_variantes_de_regla(regla)`: las prendas a la venta que alcanza una oferta guardada, de una vez. Es la regla de
--     `fn_regla_alcanza_variante` en conjunto: un monto de toda la compra, todo salvo lo que deja fuera, Claurè y lo que no es mercadería de
--     piso (20261116173000); lo demás, `fn_variantes_de_oferta_con_insignias` (la misma que usan los choques, probada contra la de una prenda).
--   · `fn_campanas_en_sede` arma primero `calladas` (oferta que cede → prendas donde rige la que gana) y pregunta ahí. Mismo resultado.
--   DECIDÍ el conjunto (como 20261113230000 hizo con los choques). DESCARTÉ un índice o cachear la función: el costo era llamar una
--     función con subconsultas miles de veces, no leer filas.
--   SE ROMPE SI la regla de alcance cambia en `fn_regla_alcanza_variante` y no en `fn_variantes_de_regla`: `pruebas:ofertas-candados`
--     compara las dos sobre todas las ofertas de la base.
--   Una prenda DESACTIVADA (no se vende) de una oferta que cedió puede mostrar las dos: el conjunto, como los choques, mira las prendas a
--     la venta.
--
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: una función nueva y dos reemplazos anclados en `fn_campanas_en_sede`.
--   Va DESPUÉS de 20261116173000 (que cambió la regla del monto de toda la compra).
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:ofertas-candados` («Las campañas de la caja con cesiones»).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_variantes_de_regla(p_regla_id uuid)
returns table (variante_id uuid)
language sql
stable
set search_path to 'retail', 'public'
as $function$
  -- Un monto de toda la compra: toda prenda a la venta, salvo lo que deja fuera, Claurè (si no la incluye) y lo que no es de piso.
  select v.id
  from retail.campana_reglas r
  join retail.variantes v on v.activo
  join retail.productos p on p.id = v.producto_id
  where r.id = p_regla_id and r.cuenta = 'compra'
    and not exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera' and rc.categoria_id = p.categoria_id)
    and retail.fn_categoria_entra_a_motores(p.categoria_id)
    and (coalesce(r.incluye_claure, false) or p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure'))
  union all
  -- Lo demás: sus categorías, modelos e insignias, o las de su campaña (la regla de fn_oferta_alcanza_variante_con_insignias, en conjunto).
  select x.variante_id
  from retail.campana_reglas r
  cross join lateral retail.fn_variantes_de_oferta_con_insignias(
    r.etiqueta_id,
    coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo'), '{}'::uuid[]),
    coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera'), '{}'::uuid[]),
    coalesce((select array_agg(rp.producto_id) from retail.campana_regla_productos rp where rp.regla_id = r.id), '{}'::uuid[]),
    coalesce((select array_agg(ri.etiqueta_id) from retail.campana_regla_insignias ri where ri.regla_id = r.id), '{}'::uuid[]),
    r.incluye_claure) x
  where r.id = p_regla_id and coalesce(r.cuenta, '') <> 'compra'
$function$;

comment on function retail.fn_variantes_de_regla(uuid) is
  'ADR-0655 (casuística 2026-11-16). Las prendas a la venta que alcanza una oferta guardada, de una vez: la regla de fn_regla_alcanza_variante en conjunto. La usa fn_campanas_en_sede para callar a la oferta que cedió.';

revoke all on function retail.fn_variantes_de_regla(uuid) from public, anon, authenticated;

create or replace function pg_temp.reemplazar_calladas(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text := pg_get_functiondef(p_firma::regprocedure);
  v_n integer;
begin
  if position(p_nuevo in v_def) > 0 then
    return; -- ya aplicado
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). No se aplicó nada.', p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- Primero el conjunto al principio de la consulta; después la condición que lo usa (su ancla es el bloque prenda por prenda).
select pg_temp.reemplazar_calladas(
  'retail.fn_campanas_en_sede(date, integer, uuid[], uuid)',
  $v$  -- Una fila por prenda y campaña: la de mayor % entre el descuento de siempre de la campaña y sus ofertas activas.
  select distinct on (x.variante_id, x.etiqueta_id) x.variante_id, x.etiqueta_id, x.etiqueta_nombre, x.descuento_pct$v$,
  $n$  -- 20261116175000: las prendas en las que una oferta que cedió se calla, de una vez (antes, prenda por prenda: 11 s con tres cesiones).
  with calladas as materialized (
    select c.cede_regla_id, x.variante_id
    from retail.campana_regla_cesiones c
    join retail.campana_reglas g on g.id = c.gana_regla_id and g.estado = 'activa'
    join retail.etiquetas ge
      on ge.id = g.etiqueta_id and ge.estado = 'aprobado' and ge.activo
     and (ge.vigente_desde is null or ge.vigente_desde <= p_hoy)
     and (ge.vigente_hasta is null or ge.vigente_hasta >= p_hoy - p_tolerancia_dias)
     and retail.fn_campana_rige_en_sede(ge.id, p_ubicacion_id)
    cross join lateral retail.fn_variantes_de_regla(g.id) x
    where retail.fn_regla_rige_en(g.desde, g.hasta, g.dias_semana, p_hoy, p_tolerancia_dias)
      and (
        not exists (select 1 from retail.campana_regla_sedes gs where gs.regla_id = g.id)
        or (p_ubicacion_id is not null and exists (select 1 from retail.campana_regla_sedes gs where gs.regla_id = g.id and gs.ubicacion_id = p_ubicacion_id))
      )
      and (p_variante_ids is null or x.variante_id = any (p_variante_ids))
  )
  -- Una fila por prenda y campaña: la de mayor % entre el descuento de siempre de la campaña y sus ofertas activas.
  select distinct on (x.variante_id, x.etiqueta_id) x.variante_id, x.etiqueta_id, x.etiqueta_nombre, x.descuento_pct$n$
);
select pg_temp.reemplazar_calladas(
  'retail.fn_campanas_en_sede(date, integer, uuid[], uuid)',
  $v$      and not exists (
        select 1
        from retail.campana_regla_cesiones c
        join retail.campana_reglas g on g.id = c.gana_regla_id and g.estado = 'activa'
        join retail.etiquetas ge
          on ge.id = g.etiqueta_id and ge.estado = 'aprobado' and ge.activo
         and (ge.vigente_desde is null or ge.vigente_desde <= p_hoy)
         and (ge.vigente_hasta is null or ge.vigente_hasta >= p_hoy - p_tolerancia_dias)
         and retail.fn_campana_rige_en_sede(ge.id, p_ubicacion_id)
        where c.cede_regla_id = r.id
          and retail.fn_regla_rige_en(g.desde, g.hasta, g.dias_semana, p_hoy, p_tolerancia_dias)
          and (
            not exists (select 1 from retail.campana_regla_sedes gs where gs.regla_id = g.id)
            or (p_ubicacion_id is not null and exists (select 1 from retail.campana_regla_sedes gs where gs.regla_id = g.id and gs.ubicacion_id = p_ubicacion_id))
          )
          and retail.fn_regla_alcanza_variante(g.id, v.id)
      )$v$,
  $n$      and not exists (select 1 from calladas k where k.cede_regla_id = r.id and k.variante_id = v.id)$n$
);
