-- ============================================================================
-- 20261118234000 — «Una prenda, una oferta por tienda y por día», también con variantes sueltas (ADR-0682; Felipe 2026-11-18)
--
-- EL PROBLEMA. 20261118232000 dejó que una oferta elija tallas y colores sueltos. La regla de los choques —la que avisa en la hoja ANTES de
--   guardar y la que frena al activar— armaba las prendas de cada oferta con sus listas de categorías, modelos e insignias, sin las
--   variantes: una oferta «solo en la Blusa Emma negra M» se revisaba como si alcanzara a toda su campaña (choques que no existen), y dos
--   ofertas en la misma talla no chocaban.
--
-- LO QUE HACE.
--   1. La regla de los choques pasa a `fn_choques_de_oferta_por_variante_sin_llave`: la de 20261114060000 (con lo que le sumó
--      20261116173000) y un dato más, `p_variantes`. Las prendas de ESTA oferta suman sus variantes sueltas (y con variantes y nada más no
--      caen en las de su campaña); las de las OTRAS, guardadas, salen de `fn_variantes_de_regla` (la misma regla que cobra la caja).
--   2. `fn_choques_de_oferta_por_variante`: la misma, con la llave de las campañas, para la hoja de una oferta (lo que se está armando,
--      todavía sin guardar).
--   3. `fn_choques_de_oferta_con_forma_sin_llave` (la de 14 datos) conserva su firma y pasa a ser una puerta: llama a la nueva con las
--      variantes GUARDADAS de la oferta. Así el candado (`fn_exigir_sin_choques`), el aviso de dos ofertas y la hoja de una versión anterior
--      ven las variantes sin cambiar una línea.
--   4. El aviso de dos ofertas (`campanas_ofertas_que_chocan`) nombra las prendas que comparten con la regla de cada oferta guardada.
--
-- DECIDÍ una función con nombre nuevo y que la de antes la llame: la regla queda en UN lugar. DESCARTÉ sumarle un dato a la de 14 (dejaría
--   dos firmas vivas mientras las pruebas de 20261114060000 la vuelvan a crear, `pruebas:una-sola-firma`) y DESCARTÉ dejar la de 14 con su
--   cuerpo y copiar la regla en la nueva (dos copias que divergen con el primer arreglo).
-- UN DETALLE QUE SE VE RARO, A PROPÓSITO: la puerta lleva en un comentario dos pares de líneas de la regla. 20261116173000 («las bolsas no
--   cuentan para un monto») busca esas líneas en ESTA función para saberse aplicada; sin ellas, volver a pegarla (lo hacen sus pruebas) se
--   detendría con «el ancla aparece 0 veces». La regla de verdad ya las lleva en la función nueva.
-- SE ROMPE SI: alguien cambia la regla de los choques en la puerta de 14 y no en la nueva: la prueba compara las dos.
--
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: funciones y dos reemplazos anclados, sin tablas. Va DESPUÉS de 20261118232000.
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:ofertas-por-variante` («Los choques con variantes sueltas»).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regclass('retail.campana_regla_variantes') is null or to_regprocedure('retail.fn_variantes_de_regla(uuid)') is null then
    raise exception 'Faltan piezas (la tabla de variantes de una oferta, 20261118232000): pega antes esa migración. No se aplicó nada.';
  end if;
end;
$$;

-- 1. La regla de los choques, con las variantes sueltas ------------------------------------------------------------------------------------

create or replace function retail.fn_choques_de_oferta_por_variante_sin_llave(p_regla_id uuid, p_etiqueta_id uuid, p_desde date, p_hasta date, p_dias smallint[], p_solo uuid[], p_fuera uuid[], p_productos uuid[], p_insignias uuid[], p_variantes uuid[], p_claure boolean, p_sede_ids uuid[], p_tipo text, p_cuenta text, p_cede_a_otras boolean)
returns table (otra_tipo text, otra_id uuid, otra_nombre text, campana_nombre text, ubicacion_id uuid, ubicacion_nombre text, prendas integer, cedida boolean, otra_es_monto boolean, mias integer)
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  with
  mia as (select coalesce(p_tipo, '') = 'monto' as es_monto, coalesce(p_cede_a_otras, false) as cede),
  -- Las prendas a la venta que alcanza esta oferta (de una vez, no una por una). Un monto de toda la compra: todas, salvo Claurè y lo que deja fuera.
  mias as materialized (
    select m.variante_id from retail.fn_variantes_de_oferta_con_insignias(p_etiqueta_id, p_solo, p_fuera, p_productos, p_insignias, p_claure) m
    where coalesce(p_cuenta, '') <> 'compra'
      -- ADR-0682: con variantes sueltas y nada más (ni categorías, ni modelos, ni insignias), la oferta no cae en las prendas de su campaña.
      and not (cardinality(coalesce(p_variantes, '{}'::uuid[])) > 0 and cardinality(coalesce(p_solo, '{}'::uuid[])) = 0
               and cardinality(coalesce(p_productos, '{}'::uuid[])) = 0 and cardinality(coalesce(p_insignias, '{}'::uuid[])) = 0)
    union all
    select v.id
    from retail.variantes v
    join retail.productos p on p.id = v.producto_id
    where p_cuenta = 'compra' and v.activo
      and not coalesce(p.categoria_id = any (p_fuera), false)
      and retail.fn_categoria_entra_a_motores(p.categoria_id)
      and (coalesce(p_claure, false) or p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure'))
    union
    -- ADR-0682: sus variantes sueltas (sin repetir las que ya entran por lo demás), con las mismas salvedades.
    select v.id
    from retail.variantes v
    join retail.productos p on p.id = v.producto_id
    where v.id = any (coalesce(p_variantes, '{}'::uuid[])) and v.activo and coalesce(p_cuenta, '') <> 'compra'
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
           coalesce((select array_agg(ri.etiqueta_id) from retail.campana_regla_insignias ri where ri.regla_id = r.id), '{}'::uuid[]) as insignias,
           r.incluye_claure as claure, r.tipo = 'monto' as es_monto, r.cuenta, r.cede_a_otras as cede
    from retail.campana_reglas r
    join retail.etiquetas e on e.id = r.etiqueta_id and e.estado = 'aprobado' and e.activo
    where r.estado = 'activa' and r.id is distinct from p_regla_id
    union all
    -- El descuento de siempre alcanza a lo marcado y a las categorías de la campaña o insignia, Claurè incluida (como en la caja).
    select 'descuento', e.id, e.nombre, e.nombre, e.id, coalesce(e.vigente_desde, p_desde), coalesce(e.vigente_hasta, p_hasta), array[1, 2, 3, 4, 5, 6, 7]::smallint[],
           '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], true, false, null::text, false
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
               and retail.fn_categoria_entra_a_motores(p.categoria_id)
               and (coalesce(o.claure, false) or p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure'))
           ) else (
             select count(*)::integer
             -- ADR-0682: una oferta guardada, por su regla (con sus variantes sueltas); un descuento de siempre, por sus listas.
             from (
               select y.variante_id from retail.fn_variantes_de_regla(o.id) y where o.tipo = 'oferta'
               union all
               select y.variante_id from retail.fn_variantes_de_oferta_con_insignias(o.etiqueta_id, o.solo, o.fuera, o.productos, o.insignias, o.claure) y where o.tipo <> 'oferta'
             ) x
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

comment on function retail.fn_choques_de_oferta_por_variante_sin_llave(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean) is
  'ADR-0655, ADR-0682. LA regla de los choques de una oferta, con su forma, sus insignias y sus variantes sueltas: con qué ofertas activas o descuentos de siempre comparte prendas, tienda y día. Sin llave: la llaman el candado y las puertas.';
revoke all on function retail.fn_choques_de_oferta_por_variante_sin_llave(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean) from public, anon, authenticated;

-- 2. La puerta de la hoja: lo que se está armando, con la llave de las campañas -----------------------------------------------------------

create or replace function retail.fn_choques_de_oferta_por_variante(p_regla_id uuid, p_etiqueta_id uuid, p_desde date, p_hasta date, p_dias smallint[], p_solo uuid[], p_fuera uuid[], p_productos uuid[], p_insignias uuid[], p_variantes uuid[], p_claure boolean, p_sede_ids uuid[], p_tipo text, p_cuenta text, p_cede_a_otras boolean)
returns table (otra_tipo text, otra_id uuid, otra_nombre text, campana_nombre text, ubicacion_id uuid, ubicacion_nombre text, prendas integer, cedida boolean, otra_es_monto boolean, mias integer)
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  select c.* from retail.fn_choques_de_oferta_por_variante_sin_llave(p_regla_id, p_etiqueta_id, p_desde, p_hasta, p_dias, p_solo, p_fuera, p_productos, p_insignias, p_variantes, p_claure, p_sede_ids, p_tipo, p_cuenta, p_cede_a_otras) c
  where retail.fn_puede_campanas()
$function$;

comment on function retail.fn_choques_de_oferta_por_variante(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean) is
  'ADR-0682. Los choques de la oferta que se está armando en la hoja, con sus variantes sueltas (todavía sin guardar). Solo con la llave de las campañas.';
revoke all on function retail.fn_choques_de_oferta_por_variante(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean) from public, anon;
grant execute on function retail.fn_choques_de_oferta_por_variante(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean) to authenticated;

-- 3. La de 14 datos queda como puerta: las variantes GUARDADAS de la oferta --------------------------------------------------------------

create or replace function retail.fn_choques_de_oferta_con_forma_sin_llave(p_regla_id uuid, p_etiqueta_id uuid, p_desde date, p_hasta date, p_dias smallint[], p_solo uuid[], p_fuera uuid[], p_productos uuid[], p_insignias uuid[], p_claure boolean, p_sede_ids uuid[], p_tipo text, p_cuenta text, p_cede_a_otras boolean)
returns table (otra_tipo text, otra_id uuid, otra_nombre text, campana_nombre text, ubicacion_id uuid, ubicacion_nombre text, prendas integer, cedida boolean, otra_es_monto boolean, mias integer)
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  -- ADR-0682: la regla vive en fn_choques_de_oferta_por_variante_sin_llave. Esta firma queda para lo que ya la llama (el candado, el aviso de
  -- dos ofertas, la hoja de una versión anterior) y le pasa las variantes sueltas que la oferta tiene GUARDADAS.
  /* 20261116173000 («las bolsas no cuentan para un monto») busca estas líneas aquí para saberse aplicada; la regla las lleva en la otra función:
      and not coalesce(p.categoria_id = any (p_fuera), false)
      and retail.fn_categoria_entra_a_motores(p.categoria_id)
             where not coalesce(p.categoria_id = any (o.fuera), false)
               and retail.fn_categoria_entra_a_motores(p.categoria_id)
  */
  select c.* from retail.fn_choques_de_oferta_por_variante_sin_llave(
    p_regla_id, p_etiqueta_id, p_desde, p_hasta, p_dias, p_solo, p_fuera, p_productos, p_insignias,
    coalesce((select array_agg(rv.variante_id) from retail.campana_regla_variantes rv where rv.regla_id = p_regla_id), '{}'::uuid[]),
    p_claure, p_sede_ids, p_tipo, p_cuenta, p_cede_a_otras) c
$function$;

revoke all on function retail.fn_choques_de_oferta_con_forma_sin_llave(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean) from public, anon, authenticated;

-- 4. El aviso de dos ofertas: las prendas que comparten, con la regla de cada oferta guardada ----------------------------------------------

create or replace function pg_temp.reemplazar_choques_por_variante(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text := pg_get_functiondef(p_firma::regprocedure);
  v_veces integer;
begin
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_veces := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_veces <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real. No se aplicó nada.',
      p_firma, v_veces;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_choques_por_variante(
  'retail.campanas_ofertas_que_chocan()',
  $v$from retail.fn_variantes_de_oferta_con_insignias(oa.etiqueta_id, oa.solo, oa.fuera, oa.productos, oa.insignias, oa.incluye_claure) x$v$,
  $n$from retail.fn_variantes_de_regla(oa.id) x -- ADR-0682: la regla de la oferta guardada, con sus variantes sueltas$n$
);

select pg_temp.reemplazar_choques_por_variante(
  'retail.campanas_ofertas_que_chocan()',
  $v$                       from retail.fn_variantes_de_oferta_con_insignias(
                              coalesce(ob.etiqueta_id, p.b), coalesce(ob.solo, '{}'::uuid[]), coalesce(ob.fuera, '{}'::uuid[]),
                              coalesce(ob.productos, '{}'::uuid[]), coalesce(ob.insignias, '{}'::uuid[]), coalesce(ob.incluye_claure, true)) y)$v$,
  $n$                       -- ADR-0682: la otra, si es una oferta guardada, por su regla (con sus variantes sueltas); si es un descuento de siempre, por sus listas.
                       from (
                         select z.variante_id from retail.fn_variantes_de_regla(ob.id) z where ob.id is not null
                         union all
                         select z.variante_id from retail.fn_variantes_de_oferta_con_insignias(
                              coalesce(ob.etiqueta_id, p.b), coalesce(ob.solo, '{}'::uuid[]), coalesce(ob.fuera, '{}'::uuid[]),
                              coalesce(ob.productos, '{}'::uuid[]), coalesce(ob.insignias, '{}'::uuid[]), coalesce(ob.incluye_claure, true)) z where ob.id is null
                       ) y)$n$
);
