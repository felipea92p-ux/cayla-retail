-- ============================================================================
-- 20261113230000 — Los choques de una oferta, de una vez (ADR-0655, actividad 4; arreglo de 20261113223000)
--
-- EL PROBLEMA. `fn_choques_de_oferta_sin_llave` (20261113223000) preguntaba prenda por prenda «¿esta oferta la alcanza?»: con 3.920 prendas
--   a la venta y 5 descuentos de siempre son ~23.000 llamadas, y en producción tardaba 2,9 s (medido el 2026-11-13 con `explain analyze`).
--   La hoja la pregunta mientras se edita y el candado la corre al activar: las dos esperaban esos 2,9 s.
--
-- LO QUE HACE. `fn_variantes_de_oferta(...)` devuelve de una vez el conjunto de prendas que alcanza una oferta (la misma regla que
--   `fn_oferta_alcanza_variante`, que sigue para la caja), y `fn_choques_de_oferta_sin_llave` cruza conjuntos en vez de preguntar una por una.
--   La misma consulta hecha así en producción tardó 64 ms. No cambia qué dice ni a quién: misma firma, mismas filas.
--
-- DESCARTÉ: un índice: no faltaba ninguno, sobraban llamadas.
-- SE ROMPE SI: la regla de alcance cambia en una de las dos funciones y no en la otra: `pruebas:campana-reglas` exige que coincidan.
-- CÓMO SE PEGA. Una sola parte, idempotente: dos `create or replace function`, sin tablas ni políticas. Va DESPUÉS de 20261113223000.
-- CAÍDA EXTERNA. Nada llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('retail.fn_choques_de_oferta_sin_llave(uuid,uuid,date,date,smallint[],uuid[],uuid[],uuid[],boolean,uuid[])') is null then
    raise exception 'Falta fn_choques_de_oferta_sin_llave: esta migración va después de 20261113223000. No se aplicó nada.';
  end if;
end;
$$;

-- Las prendas a la venta que alcanza una oferta, de una vez. Misma regla que fn_oferta_alcanza_variante.
-- Sin `security definer` ni `set search_path` a propósito: Postgres la mete dentro de la consulta que la llama (20261101004000).
create or replace function retail.fn_variantes_de_oferta(
  p_etiqueta_id uuid, p_solo uuid[], p_fuera uuid[], p_productos uuid[], p_claure boolean
) returns table (variante_id uuid)
language sql
stable
as $function$
  select v.id
  from retail.variantes v
  join retail.productos p on p.id = v.producto_id
  where v.activo
    and (
      coalesce(p.categoria_id = any (p_solo), false)
      or coalesce(p.id = any (p_productos), false)
      or (
        cardinality(coalesce(p_solo, '{}'::uuid[])) = 0 and cardinality(coalesce(p_productos, '{}'::uuid[])) = 0
        and (
          v.id in (select ve.variante_id from retail.variante_etiquetas ve where ve.etiqueta_id = p_etiqueta_id)
          or p.categoria_id in (select ec.categoria_id from retail.etiqueta_categorias ec where ec.etiqueta_id = p_etiqueta_id)
        )
      )
    )
    and not coalesce(p.categoria_id = any (p_fuera), false)
    and (coalesce(p_claure, false) or p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure'))
$function$;

comment on function retail.fn_variantes_de_oferta(uuid, uuid[], uuid[], uuid[], boolean) is
  'ADR-0655. Las prendas a la venta que alcanza una oferta (o, con todo vacío y Claurè incluida, el descuento de siempre de una campaña o insignia), de una vez. Misma regla que fn_oferta_alcanza_variante (pruebas:campana-reglas exige que coincidan); la usa fn_choques_de_oferta_sin_llave.';

revoke all on function retail.fn_variantes_de_oferta(uuid, uuid[], uuid[], uuid[], boolean) from public, anon, authenticated;

create or replace function retail.fn_choques_de_oferta_sin_llave(
  p_regla_id uuid,
  p_etiqueta_id uuid,
  p_desde date,
  p_hasta date,
  p_dias smallint[],
  p_solo uuid[],
  p_fuera uuid[],
  p_productos uuid[],
  p_claure boolean,
  p_sede_ids uuid[]
) returns table (
  otra_tipo text, otra_id uuid, otra_nombre text, campana_nombre text, ubicacion_id uuid, ubicacion_nombre text, prendas integer, cedida boolean
)
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  with
  -- Las prendas a la venta que alcanza esta oferta (de una vez, no una por una).
  mias as materialized (
    select m.variante_id from retail.fn_variantes_de_oferta(p_etiqueta_id, p_solo, p_fuera, p_productos, p_claure) m
  ),
  -- Las tiendas donde rige: las de su campaña y, si eligió algunas, solo esas.
  tiendas as (
    select u.id, u.nombre from retail.ubicaciones u
    where u.tipo = 'tienda' and u.activo
      and retail.fn_campana_rige_en_sede(p_etiqueta_id, u.id)
      and (cardinality(coalesce(p_sede_ids, '{}'::uuid[])) = 0 or u.id = any (p_sede_ids))
  ),
  -- Las otras: ofertas activas de campañas activas, y descuentos de siempre (campañas e insignias), con fechas que se pisan.
  otras as (
    select 'oferta'::text as tipo, r.id, r.nombre, e.nombre as campana, r.etiqueta_id,
           greatest(r.desde, coalesce(e.vigente_desde, r.desde)) as desde, least(r.hasta, coalesce(e.vigente_hasta, r.hasta)) as hasta, r.dias_semana as dias,
           coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo'), '{}'::uuid[]) as solo,
           coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera'), '{}'::uuid[]) as fuera,
           coalesce((select array_agg(rp.producto_id) from retail.campana_regla_productos rp where rp.regla_id = r.id), '{}'::uuid[]) as productos,
           r.incluye_claure as claure
    from retail.campana_reglas r
    join retail.etiquetas e on e.id = r.etiqueta_id and e.estado = 'aprobado' and e.activo
    where r.estado = 'activa' and r.id is distinct from p_regla_id
    union all
    -- El descuento de siempre alcanza a lo marcado y a las categorías de la campaña o insignia, Claurè incluida (como en la caja).
    select 'descuento', e.id, e.nombre, e.nombre, e.id, coalesce(e.vigente_desde, p_desde), coalesce(e.vigente_hasta, p_hasta), array[1, 2, 3, 4, 5, 6, 7]::smallint[],
           '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], true
    from retail.etiquetas e
    where e.estado = 'aprobado' and e.activo and e.descuento_pct is not null
  ),
  -- Comparten al menos un día: dentro de las fechas que se pisan, uno de la semana que las dos tienen.
  con_dia as (
    select o.* from otras o
    where o.desde <= p_hasta and o.hasta >= p_desde
      and exists (
        select 1 from generate_series(greatest(o.desde, p_desde), least(o.hasta, p_hasta), interval '1 day') d
        where extract(isodow from d)::smallint = any (o.dias) and extract(isodow from d)::smallint = any (p_dias)
      )
  ),
  -- Cuántas prendas tienen en común: un cruce de dos conjuntos por cada otra.
  con_prendas as (
    select o.*, (
      select count(*)::integer
      from retail.fn_variantes_de_oferta(o.etiqueta_id, o.solo, o.fuera, o.productos, o.claure) x
      where x.variante_id in (select m.variante_id from mias m)
    ) as prendas
    from con_dia o
  )
  select o.tipo, o.id, o.nombre, o.campana, t.id, t.nombre, o.prendas,
         o.tipo = 'oferta' and p_regla_id is not null and exists (
           select 1 from retail.campana_regla_cesiones c
           where (c.cede_regla_id = o.id and c.gana_regla_id = p_regla_id) or (c.cede_regla_id = p_regla_id and c.gana_regla_id = o.id)
         )
  from con_prendas o
  join tiendas t
    on retail.fn_campana_rige_en_sede(o.etiqueta_id, t.id)
   and (o.tipo <> 'oferta'
        or not exists (select 1 from retail.campana_regla_sedes rs where rs.regla_id = o.id)
        or exists (select 1 from retail.campana_regla_sedes rs where rs.regla_id = o.id and rs.ubicacion_id = t.id))
  where o.prendas > 0
  order by o.tipo, o.nombre, t.nombre
$function$;

revoke all on function retail.fn_choques_de_oferta_sin_llave(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], boolean, uuid[]) from public, anon, authenticated;
