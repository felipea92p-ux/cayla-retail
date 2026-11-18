-- ============================================================================
-- 20261114170000 — El aviso de Campañas: qué prendas tienen dos ofertas y cuál se queda (ADR-0655, decisión 2 de Felipe, parte 3)
--
-- EL PROBLEMA. Una prenda puede quedar con dos ofertas por una puerta de fuera de la hoja (marcarla con una insignia, sumarle una categoría a
--   una insignia, mover su modelo, crear un modelo, reactivar una campaña). Desde 20261114155000 la caja cobra la que más le ahorra al cliente,
--   nunca las dos, pero nadie se entera de que pasó. Felipe (2026-11-14): avisarle a quien configura, en Campañas, para que elija cuál queda.
--   Lo que ya existía no alcanza: `ceder_ofertas` reemplaza TODAS las cesiones de la que gana y le vuelve a exigir que no tenga ningún choque
--   abierto, así que con dos choques no se podía resolver el primero.
--
-- COMO SHOPIFY (investigado 2026-11-14): la combinación se decide por descuento, no por producto, y vale para todo lo que cubre; para que un
--   producto lleve uno y no el otro, se lo saca de uno de los dos. Aquí, igual: se elige por par de ofertas y vale para todas las prendas que
--   comparten; para una sola prenda, se edita la oferta.
--
-- LO QUE HACE.
--   1. `campanas_ofertas_que_chocan()`: los pares de ofertas activas (o una oferta y un descuento de siempre) que hoy comparten prendas en
--      alguna tienda y algún día sin una cesión que lo resuelva, cada par una vez, con sus tiendas, cuántas prendas y sus modelos. Con la
--      misma regla que el candado (`fn_choques_de_oferta_con_forma_sin_llave`). Solo lee; solo para quien tiene la llave de las campañas.
--   2. `elegir_oferta_que_queda(gana, cede)`: guarda UNA cesión («donde rigen las dos, vale esta»), sin tocar las demás de la que gana ni
--      exigirle sus otros choques: cada par se resuelve solo. Firma el responsable (`fn_actor_persona_id(true)`) y queda en la historia de
--      la oferta, como `ceder_ofertas`. Un descuento de siempre no cede: se cambia la campaña o la oferta.
--
-- DESCARTÉ: elegir prenda por prenda (una tabla nueva de cesiones por prenda que leerían la caja, los apartados, la tienda web y el candado,
--   para un caso que Shopify resuelve editando el descuento); y reusar `ceder_ofertas` (exige que la oferta no tenga otro choque abierto).
--
-- SE ROMPE SI: alguien cambia la firma de `fn_choques_de_oferta_con_forma_sin_llave` (14 datos): la lectura deja de responder.
-- CÓMO SE PEGA. Una sola parte, idempotente: dos funciones, sin tablas ni políticas. Va DESPUÉS de 20261114155000.
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:aviso-dos-ofertas`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('retail.fn_choques_de_oferta_con_forma_sin_llave(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean)') is null
     or to_regprocedure('retail.fn_cuenta_de_grupos(jsonb)') is null then
    raise exception 'Faltan los choques con forma (20261114060000) o la regla de las dos ofertas (20261114155000): pega antes esas. No se aplicó nada.';
  end if;
end;
$$;

-- 1. Qué ofertas comparten prendas sin resolver ---------------------------------------------------------------------------------------

create or replace function retail.campanas_ofertas_que_chocan()
returns table (
  oferta_id uuid, oferta_nombre text, oferta_campana text,
  otra_tipo text, otra_id uuid, otra_nombre text, otra_campana text,
  tiendas text[], prendas integer, modelos jsonb
)
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  with
  hoy as (select retail.fn_hoy_lima() as d),
  -- Las ofertas activas que todavía rigen o van a regir, con lo que el candado necesita saber de cada una.
  activas as (
    select r.id, r.nombre, e.nombre as campana, r.etiqueta_id, r.desde, r.hasta, r.dias_semana, r.incluye_claure, r.tipo, r.cuenta, r.cede_a_otras,
           coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo'), '{}'::uuid[]) as solo,
           coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera'), '{}'::uuid[]) as fuera,
           coalesce((select array_agg(rp.producto_id) from retail.campana_regla_productos rp where rp.regla_id = r.id), '{}'::uuid[]) as productos,
           coalesce((select array_agg(ri.etiqueta_id) from retail.campana_regla_insignias ri where ri.regla_id = r.id), '{}'::uuid[]) as insignias,
           coalesce((select array_agg(rs.ubicacion_id) from retail.campana_regla_sedes rs where rs.regla_id = r.id), '{}'::uuid[]) as sedes
    from retail.campana_reglas r
    join retail.etiquetas e on e.id = r.etiqueta_id and e.estado = 'aprobado' and e.activo
    cross join hoy
    where r.estado = 'activa' and r.hasta >= hoy.d and (e.vigente_hasta is null or e.vigente_hasta >= hoy.d)
  ),
  -- Con quién choca cada una (la regla del candado), sin las que una cesión ya resuelve.
  choques as (
    select a.id as oferta_id, c.otra_tipo, c.otra_id, c.ubicacion_nombre, c.prendas
    from activas a
    cross join lateral retail.fn_choques_de_oferta_con_forma_sin_llave(a.id, a.etiqueta_id, a.desde, a.hasta, a.dias_semana, a.solo, a.fuera,
      a.productos, a.insignias, a.incluye_claure, a.sedes, a.tipo, a.cuenta, a.cede_a_otras) c
    where not c.cedida
  ),
  -- Cada par una vez: dos ofertas se ven las dos desde cada lado (se juntan por la de menor id); un descuento de siempre, desde la oferta.
  pares as (
    select case when c.otra_tipo = 'oferta' and c.otra_id < c.oferta_id then c.otra_id else c.oferta_id end as a,
           c.otra_tipo as tipo_b,
           case when c.otra_tipo = 'oferta' and c.otra_id < c.oferta_id then c.oferta_id else c.otra_id end as b,
           array_agg(distinct regexp_replace(c.ubicacion_nombre, '^Tienda\s+', '', 'i')) as tiendas,
           max(c.prendas)::integer as prendas
    from choques c
    group by 1, 2, 3
  ),
  -- Las prendas de cada lado, para decir cuáles comparten (un descuento de siempre: lo marcado y sus categorías, como en el candado).
  con_modelos as (
    select p.*,
           (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'nombre', m.referencia) order by m.referencia), '[]'::jsonb)
              from (select distinct pr.id, pr.referencia
                      from retail.fn_variantes_de_oferta_con_insignias(oa.etiqueta_id, oa.solo, oa.fuera, oa.productos, oa.insignias, oa.incluye_claure) x
                      join retail.variantes v on v.id = x.variante_id
                      join retail.productos pr on pr.id = v.producto_id
                     where x.variante_id in (
                       select y.variante_id
                       from retail.fn_variantes_de_oferta_con_insignias(
                              coalesce(ob.etiqueta_id, p.b), coalesce(ob.solo, '{}'::uuid[]), coalesce(ob.fuera, '{}'::uuid[]),
                              coalesce(ob.productos, '{}'::uuid[]), coalesce(ob.insignias, '{}'::uuid[]), coalesce(ob.incluye_claure, true)) y)
                     order by pr.referencia
                     limit 60) m) as modelos
    from pares p
    join activas oa on oa.id = p.a
    left join activas ob on p.tipo_b = 'oferta' and ob.id = p.b
  )
  select m.a, oa.nombre, oa.campana,
         m.tipo_b, m.b, coalesce(ob.nombre, e.nombre), coalesce(ob.campana, e.nombre),
         (select array_agg(t order by t) from unnest(m.tiendas) t), m.prendas, m.modelos
  from con_modelos m
  join activas oa on oa.id = m.a
  left join activas ob on m.tipo_b = 'oferta' and ob.id = m.b
  left join retail.etiquetas e on m.tipo_b = 'descuento' and e.id = m.b
  where retail.fn_puede_campanas()
  order by m.prendas desc, oa.nombre, 6
$function$;

comment on function retail.campanas_ofertas_que_chocan() is
  'ADR-0655, decisión 2 de Felipe (2026-11-14). Los pares de ofertas activas (o una oferta y un descuento de siempre) que comparten prendas en alguna tienda y algún día sin una cesión que lo resuelva, cada par una vez: sus tiendas, cuántas prendas y sus modelos (hasta 60). Es el aviso de Campañas; mientras nadie elige, la caja cobra la que más le ahorra al cliente. Solo lee, solo con la llave de las campañas.';

revoke all on function retail.campanas_ofertas_que_chocan() from public, anon;
grant execute on function retail.campanas_ofertas_que_chocan() to authenticated;

-- 2. Cuál se queda, par por par -------------------------------------------------------------------------------------------------------

create or replace function retail.elegir_oferta_que_queda(p_gana_regla_id uuid, p_cede_regla_id uuid)
returns void
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_actor uuid;
  v_antes uuid[];
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Elegir qué oferta queda necesita el módulo «Campañas», «Campañas de la tienda web» o «Insignias» en tu rol.'
      using errcode = '42501', hint = 'oferta_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if p_gana_regla_id is null or p_cede_regla_id is null or p_gana_regla_id = p_cede_regla_id then
    raise exception 'Elige una de las dos ofertas.';
  end if;
  if not exists (select 1 from retail.campana_reglas where id = p_gana_regla_id)
     or not exists (select 1 from retail.campana_reglas where id = p_cede_regla_id) then
    raise exception 'Una de las dos ofertas ya no existe. Recarga la pantalla.';
  end if;
  if exists (select 1 from retail.campana_regla_cesiones c where c.gana_regla_id = p_cede_regla_id and c.cede_regla_id = p_gana_regla_id) then
    raise exception 'Ya elegiste la otra: dos ofertas no pueden cederse una a la otra.';
  end if;
  if exists (select 1 from retail.campana_regla_cesiones c where c.gana_regla_id = p_gana_regla_id and c.cede_regla_id = p_cede_regla_id) then
    return;
  end if;

  -- La historia de la que gana guarda qué le cedían antes (como en ceder_ofertas).
  v_antes := coalesce((select array_agg(c.cede_regla_id order by c.cede_regla_id) from retail.campana_regla_cesiones c where c.gana_regla_id = p_gana_regla_id), '{}'::uuid[]);
  insert into retail.campana_regla_historial (regla_id, antes, por) values (p_gana_regla_id, jsonb_build_object('ceden', to_jsonb(v_antes)), v_actor);

  -- Solo este par. Los otros choques de la que gana se resuelven cada uno en su fila del aviso (ceder_ofertas los exigía todos de una vez).
  insert into retail.campana_regla_cesiones (cede_regla_id, gana_regla_id, creada_por) values (p_cede_regla_id, p_gana_regla_id, v_actor)
    on conflict (cede_regla_id, gana_regla_id) do nothing;
end;
$function$;

comment on function retail.elegir_oferta_que_queda(uuid, uuid) is
  'ADR-0655, decisión 2 de Felipe (2026-11-14). El aviso de Campañas: donde rigen las dos, vale p_gana_regla_id (p_cede_regla_id le cede). Guarda solo esa cesión, sin tocar las demás de la que gana ni exigirle sus otros choques; firma el responsable y queda en la historia de la oferta.';

revoke all on function retail.elegir_oferta_que_queda(uuid, uuid) from public, anon;
grant execute on function retail.elegir_oferta_que_queda(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
