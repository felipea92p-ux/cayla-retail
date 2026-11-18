-- ============================================================================
-- 20261114054000 — Los choques con la forma de la oferta, con su propio nombre: una sola firma por función (ADR-0655, actividad 8)
--
-- EL PROBLEMA. 20261114044000 le dio a `fn_choques_de_oferta` y a `fn_choques_de_oferta_sin_llave` una segunda firma (13 datos: la forma de un
--   monto) junto a la de siempre (10). El repo exige UNA firma por función de `retail` (`pnpm pruebas:una-sola-firma`, ADR-0009/0026: con dos,
--   PostgREST puede no saber a cuál llamar), y con dos firmas las pruebas que comparan funciones por nombre se confunden (pruebas:fuera-de-cayla).
--   Darle valores por defecto a la de 13 tampoco sirve: con la de 10 viva, una llamada de 10 datos es ambigua, y Postgres no deja quitar un valor
--   por defecto si se vuelve a pegar 20261114044000 (probado en local, 2026-11-14).
--
-- LO QUE HACE. La de 13 datos pasa a llamarse `fn_choques_de_oferta_con_forma_sin_llave` (sin llave, la usa el candado) y
--   `fn_choques_de_oferta_con_forma` (con la llave de campañas, la usa la hoja de un monto). La de 10 datos sigue con su nombre y su forma de
--   siempre (la usa la hoja para todo lo que no es un monto) y llama a la nueva. `fn_exigir_sin_choques` (el candado) llama a la nueva. Después se
--   borran las de 13 con el nombre viejo: nadie las llama (la hoja que las llamaría todavía no se publicó).
--
-- DESCARTÉ: editar 20261114044000 (ya está en producción: su historia no se reescribe; esta la hace converger).
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s, solo funciones (create/drop function: no toman las tablas de auth ni storage).
--   Va DESPUÉS de 20261114044000.
-- PRUEBA. `pnpm pruebas:monto-con-escalones` y `pnpm pruebas:una-sola-firma`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('retail.fn_escalones_validos(jsonb, text)') is null then
    raise exception 'Falta 20261114044000 (el monto con escalones): esta migración va después. No se aplicó nada.';
  end if;
end;
$$;

-- 1. La de 13 datos, con su nombre ---------------------------------------------------------------------------------------------------

create or replace function retail.fn_choques_de_oferta_con_forma_sin_llave(
  p_regla_id uuid,
  p_etiqueta_id uuid,
  p_desde date,
  p_hasta date,
  p_dias smallint[],
  p_solo uuid[],
  p_fuera uuid[],
  p_productos uuid[],
  p_claure boolean,
  p_sede_ids uuid[],
  p_tipo text,
  p_cuenta text,
  p_cede_a_otras boolean
) returns table (
  otra_tipo text, otra_id uuid, otra_nombre text, campana_nombre text, ubicacion_id uuid, ubicacion_nombre text, prendas integer, cedida boolean,
  otra_es_monto boolean, mias integer
)
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  with
  mia as (select coalesce(p_tipo, '') = 'monto' as es_monto, coalesce(p_cede_a_otras, false) as cede),
  -- Las prendas a la venta que alcanza esta oferta (de una vez, no una por una). Un monto de toda la compra: todas, salvo Claurè y lo que deja fuera.
  mias as materialized (
    select m.variante_id from retail.fn_variantes_de_oferta(p_etiqueta_id, p_solo, p_fuera, p_productos, p_claure) m
    where coalesce(p_cuenta, '') <> 'compra'
    union all
    select v.id
    from retail.variantes v
    join retail.productos p on p.id = v.producto_id
    where p_cuenta = 'compra' and v.activo
      and not coalesce(p.categoria_id = any (p_fuera), false)
      and (coalesce(p_claure, false) or p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure'))
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
           r.incluye_claure as claure, r.tipo = 'monto' as es_monto, r.cuenta, r.cede_a_otras as cede
    from retail.campana_reglas r
    join retail.etiquetas e on e.id = r.etiqueta_id and e.estado = 'aprobado' and e.activo
    where r.estado = 'activa' and r.id is distinct from p_regla_id
    union all
    -- El descuento de siempre alcanza a lo marcado y a las categorías de la campaña o insignia, Claurè incluida (como en la caja).
    select 'descuento', e.id, e.nombre, e.nombre, e.id, coalesce(e.vigente_desde, p_desde), coalesce(e.vigente_hasta, p_hasta), array[1, 2, 3, 4, 5, 6, 7]::smallint[],
           '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], true, false, null::text, false
    from retail.etiquetas e
    where e.estado = 'aprobado' and e.activo and e.descuento_pct is not null
  ),
  -- Un monto que cede a las otras («que las prendas con otra oferta no cuenten») no choca con lo que no es monto; dos montos, siempre.
  sin_las_que_ceden as (
    select o.* from otras o cross join mia
    where not (mia.es_monto and mia.cede and not o.es_monto)
      and not (o.es_monto and o.cede and not mia.es_monto)
  ),
  -- Comparten al menos un día: dentro de las fechas que se pisan, uno de la semana que las dos tienen.
  con_dia as (
    select o.* from sin_las_que_ceden o
    where o.desde <= p_hasta and o.hasta >= p_desde
      and exists (
        select 1 from generate_series(greatest(o.desde, p_desde), least(o.hasta, p_hasta), interval '1 day') d
        where extract(isodow from d)::smallint = any (o.dias) and extract(isodow from d)::smallint = any (p_dias)
      )
  ),
  -- Cuántas prendas tienen en común: un cruce de dos conjuntos por cada otra.
  con_prendas as (
    select o.*,
           case when o.cuenta = 'compra' then (
             select count(*)::integer
             from mias m
             join retail.variantes v on v.id = m.variante_id
             join retail.productos p on p.id = v.producto_id
             where not coalesce(p.categoria_id = any (o.fuera), false)
               and (coalesce(o.claure, false) or p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure'))
           ) else (
             select count(*)::integer
             from retail.fn_variantes_de_oferta(o.etiqueta_id, o.solo, o.fuera, o.productos, o.claure) x
             where x.variante_id in (select m.variante_id from mias m)
           ) end as prendas
    from con_dia o
  )
  select o.tipo, o.id, o.nombre, o.campana, t.id, t.nombre, o.prendas,
         o.tipo = 'oferta' and p_regla_id is not null and exists (
           select 1 from retail.campana_regla_cesiones c
           where (c.cede_regla_id = o.id and c.gana_regla_id = p_regla_id) or (c.cede_regla_id = p_regla_id and c.gana_regla_id = o.id)
         ),
         -- Para la hoja de un monto: si la otra es otro monto (esos no se resuelven con «que no cuenten») y cuántas prendas alcanza esta
         -- (si la otra las tiene todas, el monto no le llega a nadie en esa tienda).
         o.es_monto, (select count(*)::integer from mias)
  from con_prendas o
  join tiendas t
    on retail.fn_campana_rige_en_sede(o.etiqueta_id, t.id)
   and (o.tipo <> 'oferta'
        or not exists (select 1 from retail.campana_regla_sedes rs where rs.regla_id = o.id)
        or exists (select 1 from retail.campana_regla_sedes rs where rs.regla_id = o.id and rs.ubicacion_id = t.id))
  where o.prendas > 0
  order by o.tipo, o.nombre, t.nombre
$function$;

comment on function retail.fn_choques_de_oferta_con_forma_sin_llave(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean) is
  'ADR-0655. Los choques de una oferta CON su forma (un monto de toda la compra alcanza a todo; uno que cede a las otras solo choca con otro monto), sin mirar la llave: la usa el candado (fn_exigir_sin_choques). Dice además si la otra es un monto y cuántas prendas alcanza esta.';

revoke all on function retail.fn_choques_de_oferta_con_forma_sin_llave(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean)
  from public, anon, authenticated;

create or replace function retail.fn_choques_de_oferta_con_forma(
  p_regla_id uuid, p_etiqueta_id uuid, p_desde date, p_hasta date, p_dias smallint[], p_solo uuid[], p_fuera uuid[], p_productos uuid[],
  p_claure boolean, p_sede_ids uuid[], p_tipo text, p_cuenta text, p_cede_a_otras boolean
) returns table (
  otra_tipo text, otra_id uuid, otra_nombre text, campana_nombre text, ubicacion_id uuid, ubicacion_nombre text, prendas integer, cedida boolean,
  otra_es_monto boolean, mias integer
)
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  select c.* from retail.fn_choques_de_oferta_con_forma_sin_llave(p_regla_id, p_etiqueta_id, p_desde, p_hasta, p_dias, p_solo, p_fuera, p_productos,
    p_claure, p_sede_ids, p_tipo, p_cuenta, p_cede_a_otras) c
  where retail.fn_puede_campanas()
$function$;

comment on function retail.fn_choques_de_oferta_con_forma(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean) is
  'ADR-0655. Con qué ofertas activas y descuentos de siempre chocaría una oferta —guardada (p_regla_id) o todavía en la hoja (null)—, con su forma: la lee la hoja de un monto. Una fila por cada otra y cada tienda donde las dos rigen algún mismo día, con cuántas prendas tienen en común, si una cesión ya lo resuelve, si la otra es un monto y cuántas prendas alcanza esta. Lo demás lo pregunta fn_choques_de_oferta.';

revoke all on function retail.fn_choques_de_oferta_con_forma(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean) from public, anon;
grant execute on function retail.fn_choques_de_oferta_con_forma(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean) to authenticated;

-- 2. La de 10 datos y el candado, a la nueva -----------------------------------------------------------------------------------------

create or replace function retail.fn_choques_de_oferta_sin_llave(
  p_regla_id uuid, p_etiqueta_id uuid, p_desde date, p_hasta date, p_dias smallint[], p_solo uuid[], p_fuera uuid[], p_productos uuid[],
  p_claure boolean, p_sede_ids uuid[]
) returns table (
  otra_tipo text, otra_id uuid, otra_nombre text, campana_nombre text, ubicacion_id uuid, ubicacion_nombre text, prendas integer, cedida boolean
)
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  -- Una oferta que no es monto (la pantalla de siempre): no ve como choque un monto que cede a las otras.
  select c.otra_tipo, c.otra_id, c.otra_nombre, c.campana_nombre, c.ubicacion_id, c.ubicacion_nombre, c.prendas, c.cedida
  from retail.fn_choques_de_oferta_con_forma_sin_llave(p_regla_id, p_etiqueta_id, p_desde, p_hasta, p_dias, p_solo, p_fuera, p_productos, p_claure,
    p_sede_ids, null::text, null::text, false) c
$function$;

create or replace function retail.fn_exigir_sin_choques(p_regla_id uuid)
returns void
language plpgsql
security definer
set search_path to 'retail', 'public'
as $function$
declare
  v_r record;
  v_c record;
begin
  select * into v_r from retail.campana_reglas where id = p_regla_id;
  if not found or v_r.estado <> 'activa' then
    return;
  end if;
  for v_c in
    select * from retail.fn_choques_de_oferta_con_forma_sin_llave(
      v_r.id, v_r.etiqueta_id, v_r.desde, v_r.hasta, v_r.dias_semana,
      coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = v_r.id and rc.modo = 'solo'), '{}'::uuid[]),
      coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = v_r.id and rc.modo = 'fuera'), '{}'::uuid[]),
      coalesce((select array_agg(rp.producto_id) from retail.campana_regla_productos rp where rp.regla_id = v_r.id), '{}'::uuid[]),
      v_r.incluye_claure,
      coalesce((select array_agg(rs.ubicacion_id) from retail.campana_regla_sedes rs where rs.regla_id = v_r.id), '{}'::uuid[]),
      v_r.tipo, v_r.cuenta, v_r.cede_a_otras)
    where not cedida
    limit 1
  loop
    raise exception 'La oferta «%» choca con «%»% en %: % % tendría% dos ofertas el mismo día. Una prenda tiene una sola oferta por tienda y por día: %.',
      v_r.nombre, v_c.otra_nombre, case when v_c.otra_tipo = 'oferta' and v_c.campana_nombre <> v_c.otra_nombre then ' (de ' || v_c.campana_nombre || ')' else '' end,
      v_c.ubicacion_nombre, v_c.prendas, case when v_c.prendas = 1 then 'prenda' else 'prendas' end, case when v_c.prendas = 1 then '' else 'n' end,
      case when v_r.tipo = 'monto' and v_c.otra_tipo = 'oferta' then 'que esas prendas no cuenten para el monto, que la otra ceda, o cambia las tiendas, las fechas o las prendas'
           when v_r.tipo = 'monto' then 'que esas prendas no cuenten para el monto, o cambia las tiendas, las fechas o las prendas'
           when v_c.otra_tipo = 'oferta' then 'que la otra ceda, o cambia las tiendas, las fechas o las prendas'
           else 'retira ese descuento de siempre, o cambia las tiendas, las fechas o las prendas' end
      using errcode = 'P0001', hint = 'oferta_choca';
  end loop;
end;
$function$;

revoke all on function retail.fn_exigir_sin_choques(uuid) from public, anon, authenticated;

-- 3. Las de 13 datos con el nombre viejo: una sola firma por función ----------------------------------------------------------------------

drop function if exists retail.fn_choques_de_oferta(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean);
drop function if exists retail.fn_choques_de_oferta_sin_llave(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean);
