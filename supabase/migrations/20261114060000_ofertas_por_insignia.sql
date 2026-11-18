-- ============================================================================
-- 20261114060000 — Una oferta también puede elegir prendas por su INSIGNIA (ADR-0655; Felipe 2026-11-14)
--
-- EL PROBLEMA. Felipe: «en campañas se puede aplicar a insignias, no solo a prendas específicas o categorías específicas sino también a
--   insignias específicas». Una oferta elegía sus prendas por categoría (`campana_regla_categorias`, modo «solo») o prenda por prenda
--   (`campana_regla_productos`); sin ninguna, rige en las prendas de su campaña. Un «−20 % en todo lo de Rotación» o un 3x2 en «Artesanal»
--   no se podía armar.
--
-- LO QUE HACE.
--   1. `retail.campana_regla_insignias` (regla_id, etiqueta_id): las insignias que alcanza una oferta. Las prendas de una insignia son las
--      que la llevan: marcadas a mano (`variante_etiquetas`) o por una categoría de la insignia (`etiqueta_categorias`), lo mismo que la
--      muestra. Se SUMAN a las categorías y a los modelos elegidos; una oferta con insignias (y sin categorías ni modelos) rige solo en ellas,
--      no en las prendas de su campaña. «Dejar fuera», Claurè y las tiendas siguen igual.
--   2. LA regla de alcance, con insignias, en una sola función: `fn_oferta_alcanza_variante_con_insignias` (una prenda) y
--      `fn_variantes_de_oferta_con_insignias` (todas, de una vez). Las de siempre (`fn_oferta_alcanza_variante`, `fn_variantes_de_oferta`)
--      conservan su firma y llaman a las nuevas sin insignias: otras pruebas vuelven a pegar las migraciones que las crearon, y cambiarles la
--      firma dejaría dos vivas (`pruebas:una-sola-firma`).
--   3. `fn_campanas_en_sede` (la caja, la tienda web, los apartados, el club y las etiquetas de precio): dos reemplazos anclados FUERA del
--      texto que dejaron 20261113210000 y 20261113223000 (sus pruebas lo vuelven a pegar). `fn_regla_alcanza_variante` (las ofertas de grupo y
--      el monto), `ofertas_de_grupo_vigentes` y `ofertas_de_monto_vigentes` (la caja) leen las insignias de la oferta.
--   4. Los choques: `fn_choques_de_oferta_con_forma(_sin_llave)` gana `p_insignias` (una oferta en la hoja, antes de guardarla; esa función es
--      de hoy, 20261114054000, y solo la llama la hoja nueva); el candado mira las insignias guardadas.
--   5. `guardar_oferta_completa` guarda las insignias (`p_forma.insignias`: así no cambia su firma), con la historia de las de antes; un monto
--      de toda la compra no las lleva. `campana_reglas()` las devuelve.
--   La huella del catálogo de la tienda web (que la caja ahora lee una tabla y una función más) va en 20261114061000.
--
-- DESCARTÉ: guardar las prendas de la insignia en `campana_regla_productos`: una prenda que se marca con la insignia DESPUÉS no entraría, y la
--   insignia se pone por prenda (talla y color), no por modelo.
-- DESCARTÉ: un séptimo dato en `fn_oferta_alcanza_variante`: con la de 6 viva (la vuelven a crear las pruebas de 20261113223000), una
--   llamada de 6 datos queda ambigua.
-- DESCARTÉ: mirar si la insignia está vigente por fechas: las insignias no llevan fechas (las que llevaban descuento pasaron a campañas,
--   20261113234000), y la caja tampoco las mira para mostrarla.
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR (los cierra el esquema y la función que guarda): una insignia repetida en la misma oferta (clave primaria);
--   una oferta que elige una CAMPAÑA como insignia (guardar_oferta_completa lo rechaza); una oferta borrada que deja insignias sueltas (cascada).
--
-- SE ROMPE SI: alguien cambia el bloque de prendas de una oferta de `fn_campanas_en_sede` antes de pegar esto: el ancla no aparece y se detiene.
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: una tabla NUEVA (RLS encendido sin políticas: solo la leen funciones security
--   definer, ADR-0195), reemplazos anclados y funciones; sin `alter` de tablas en uso. Va DESPUÉS de 20261114054000, y ANTES de 20261114061000.
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:ofertas-por-insignia`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. La guarda -------------------------------------------------------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('retail.fn_choques_de_oferta_con_forma_sin_llave(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean)') is null
     and to_regprocedure('retail.fn_choques_de_oferta_con_forma_sin_llave(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean)') is null then
    raise exception 'Falta 20261114054000 (los choques con la forma): esta migración va después. No se aplicó nada.';
  end if;
end;
$$;

-- 1. Las insignias de una oferta --------------------------------------------------------------------------------------------------------

create table if not exists retail.campana_regla_insignias (
  regla_id uuid not null references retail.campana_reglas (id) on delete cascade,
  etiqueta_id uuid not null references retail.etiquetas (id),
  primary key (regla_id, etiqueta_id)
);

create index if not exists campana_regla_insignias_etiqueta_idx on retail.campana_regla_insignias (etiqueta_id);

alter table retail.campana_regla_insignias enable row level security;
revoke all on table retail.campana_regla_insignias from public, anon, authenticated;

comment on table retail.campana_regla_insignias is
  'ADR-0655. Las insignias cuyas prendas alcanza una oferta (las que la llevan, marcadas a mano o por una categoría de la insignia). Se suman a sus categorías «solo» y a sus modelos elegidos; con insignias y sin categorías ni modelos, la oferta rige solo en ellas. La escribe guardar_oferta_completa; la leen las funciones de la regla de alcance.';

-- 2. LA regla de alcance, con insignias ---------------------------------------------------------------------------------------------------

-- Sin `security definer` ni `set search_path` a propósito (como la de siempre): así Postgres la mete dentro de la consulta que la llama.
create or replace function retail.fn_oferta_alcanza_variante_con_insignias(
  p_etiqueta_id uuid, p_solo uuid[], p_fuera uuid[], p_productos uuid[], p_insignias uuid[], p_claure boolean, p_variante_id uuid
) returns boolean
language sql
stable
as $function$
  select exists (
    select 1
    from retail.variantes v
    join retail.productos p on p.id = v.producto_id
    where v.id = p_variante_id
      and (
        coalesce(p.categoria_id = any (p_solo), false)
        or coalesce(p.id = any (p_productos), false)
        -- Una prenda que lleva una de las insignias elegidas: marcada a mano o por una categoría de la insignia.
        or exists (select 1 from retail.variante_etiquetas ve where ve.variante_id = v.id and ve.etiqueta_id = any (p_insignias))
        or exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = any (p_insignias) and ec.categoria_id = p.categoria_id)
        or (
          cardinality(coalesce(p_solo, '{}'::uuid[])) = 0 and cardinality(coalesce(p_productos, '{}'::uuid[])) = 0
          and cardinality(coalesce(p_insignias, '{}'::uuid[])) = 0
          and (
            exists (select 1 from retail.variante_etiquetas ve where ve.variante_id = v.id and ve.etiqueta_id = p_etiqueta_id)
            or exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = p_etiqueta_id and ec.categoria_id = p.categoria_id)
          )
        )
      )
      and not coalesce(p.categoria_id = any (p_fuera), false)
      and (coalesce(p_claure, false) or p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure'))
  )
$function$;

comment on function retail.fn_oferta_alcanza_variante_con_insignias(uuid, uuid[], uuid[], uuid[], uuid[], boolean, uuid) is
  'ADR-0655. ¿Una oferta (su campaña, categorías «solo», «fuera», modelos elegidos, insignias elegidas y si incluye Claurè) alcanza a esta prenda? Categorías, modelos e insignias se suman; sin ninguno, las prendas de su campaña. Sin fechas ni tienda. Es la regla del bloque de ofertas de fn_campanas_en_sede.';

revoke all on function retail.fn_oferta_alcanza_variante_con_insignias(uuid, uuid[], uuid[], uuid[], uuid[], boolean, uuid) from public, anon, authenticated;

create or replace function retail.fn_variantes_de_oferta_con_insignias(
  p_etiqueta_id uuid, p_solo uuid[], p_fuera uuid[], p_productos uuid[], p_insignias uuid[], p_claure boolean
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
      or v.id in (select ve.variante_id from retail.variante_etiquetas ve where ve.etiqueta_id = any (p_insignias))
      or p.categoria_id in (select ec.categoria_id from retail.etiqueta_categorias ec where ec.etiqueta_id = any (p_insignias))
      or (
        cardinality(coalesce(p_solo, '{}'::uuid[])) = 0 and cardinality(coalesce(p_productos, '{}'::uuid[])) = 0
        and cardinality(coalesce(p_insignias, '{}'::uuid[])) = 0
        and (
          v.id in (select ve.variante_id from retail.variante_etiquetas ve where ve.etiqueta_id = p_etiqueta_id)
          or p.categoria_id in (select ec.categoria_id from retail.etiqueta_categorias ec where ec.etiqueta_id = p_etiqueta_id)
        )
      )
    )
    and not coalesce(p.categoria_id = any (p_fuera), false)
    and (coalesce(p_claure, false) or p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure'))
$function$;

comment on function retail.fn_variantes_de_oferta_con_insignias(uuid, uuid[], uuid[], uuid[], uuid[], boolean) is
  'ADR-0655. Las prendas a la venta que alcanza una oferta, con sus insignias elegidas, de una vez. Misma regla que fn_oferta_alcanza_variante_con_insignias (pruebas:ofertas-por-insignia exige que coincidan).';

revoke all on function retail.fn_variantes_de_oferta_con_insignias(uuid, uuid[], uuid[], uuid[], uuid[], boolean) from public, anon, authenticated;

-- Las de siempre, con su firma, llaman a las nuevas sin insignias: una sola regla.
create or replace function retail.fn_oferta_alcanza_variante(
  p_etiqueta_id uuid, p_solo uuid[], p_fuera uuid[], p_productos uuid[], p_claure boolean, p_variante_id uuid
) returns boolean
language sql
stable
as $function$
  select retail.fn_oferta_alcanza_variante_con_insignias(p_etiqueta_id, p_solo, p_fuera, p_productos, '{}'::uuid[], p_claure, p_variante_id)
$function$;

create or replace function retail.fn_variantes_de_oferta(
  p_etiqueta_id uuid, p_solo uuid[], p_fuera uuid[], p_productos uuid[], p_claure boolean
) returns table (variante_id uuid)
language sql
stable
as $function$
  select x.variante_id from retail.fn_variantes_de_oferta_con_insignias(p_etiqueta_id, p_solo, p_fuera, p_productos, '{}'::uuid[], p_claure) x
$function$;

-- Una oferta guardada: sus insignias, de la tabla.
create or replace function retail.fn_regla_alcanza_variante(p_regla_id uuid, p_variante_id uuid)
returns boolean
language sql
stable
as $function$
  select case
    -- ADR-0655 act. 8: un monto de toda la compra alcanza a toda prenda, salvo Claurè (si no la incluye) y las categorías que deja fuera.
    when r.cuenta = 'compra' then exists (
      select 1
      from retail.variantes v
      join retail.productos p on p.id = v.producto_id
      where v.id = p_variante_id
        and not exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera' and rc.categoria_id = p.categoria_id)
        and (coalesce(r.incluye_claure, false) or p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure'))
    )
    else retail.fn_oferta_alcanza_variante_con_insignias(
      r.etiqueta_id,
      coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo'), '{}'::uuid[]),
      coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera'), '{}'::uuid[]),
      coalesce((select array_agg(rp.producto_id) from retail.campana_regla_productos rp where rp.regla_id = r.id), '{}'::uuid[]),
      coalesce((select array_agg(ri.etiqueta_id) from retail.campana_regla_insignias ri where ri.regla_id = r.id), '{}'::uuid[]),
      r.incluye_claure,
      p_variante_id)
  end
  from retail.campana_reglas r
  where r.id = p_regla_id
$function$;

revoke all on function retail.fn_regla_alcanza_variante(uuid, uuid) from public, anon, authenticated;

-- 3. La caja: fn_campanas_en_sede, con dos reemplazos anclados fuera de los de 20261113210000 y 20261113223000 ------------------------

-- Los dos reemplazos van JUNTOS, en una sola vuelta: cada `execute` vuelve a crear la función, y con uno solo quedaría con paréntesis abiertos.
create or replace function pg_temp.reemplazar_por_insignia(p_firma text, p_viejo_a text, p_nuevo_a text, p_viejo_b text, p_nuevo_b text)
returns void
language plpgsql
as $f$
declare
  v_def text := pg_get_functiondef(p_firma::regprocedure);
  v_a integer;
  v_b integer;
begin
  -- Ya aplicado = los dos textos nuevos están.
  if position(p_nuevo_a in v_def) > 0 and position(p_nuevo_b in v_def) > 0 then
    return;
  end if;
  v_a := (length(v_def) - length(replace(v_def, p_viejo_a, ''))) / length(p_viejo_a);
  v_b := (length(v_def) - length(replace(v_def, p_viejo_b, ''))) / length(p_viejo_b);
  if v_a <> 1 or v_b <> 1 then
    raise exception '% cambió desde que se escribió esta migración: las anclas aparecen % y % veces (se esperaba 1 y 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_a, v_b;
  end if;
  execute replace(replace(v_def, p_viejo_a, p_nuevo_a), p_viejo_b, p_nuevo_b);
end;
$f$;

-- (a) Delante del bloque de prendas de la oferta: una prenda con una de sus insignias entra; con insignias y sin categorías ni modelos, el
--     bloque de siempre ya no cae en «las prendas de la campaña». (b) Cierra lo que abrió (a).
select pg_temp.reemplazar_por_insignia(
  'retail.fn_campanas_en_sede(date, integer, uuid[], uuid)',
  $v$      -- sin ninguna, las de la campaña (marcadas a mano o por una de sus categorías).
      and (
$v$,
  $n$      -- sin ninguna, las de la campaña (marcadas a mano o por una de sus categorías).
      -- ADR-0655 (por insignia): o una prenda que lleva una de las insignias elegidas (marcada a mano o por una categoría de la insignia).
      -- Una oferta con insignias y sin categorías ni modelos rige solo en ellas, no en las prendas de la campaña.
      and (
        exists (
          select 1 from retail.campana_regla_insignias ri
          where ri.regla_id = r.id
            and (exists (select 1 from retail.variante_etiquetas ve where ve.variante_id = v.id and ve.etiqueta_id = ri.etiqueta_id)
                 or exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = ri.etiqueta_id and ec.categoria_id = p.categoria_id))
        )
        or (
          not (
            exists (select 1 from retail.campana_regla_insignias ri where ri.regla_id = r.id)
            and not exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo')
            and not exists (select 1 from retail.campana_regla_productos rp where rp.regla_id = r.id)
          )
          and (
$n$,
  -- (b) El cierre de los dos paréntesis que abrió (a).
  $v$      )
      -- «Dejar fuera» estas categorías.
$v$,
  $n$      )
        ) -- ADR-0655 (por insignia): cierra el bloque de prendas de la campaña
      )
      -- «Dejar fuera» estas categorías.
$n$
);

-- 4. Lo que lee la caja para las ofertas de grupo y el monto: con las insignias de cada oferta ---------------------------------------

create or replace function retail.ofertas_de_grupo_vigentes(p_ubicacion_id uuid)
returns table (
  variante_id uuid, regla_id uuid, producto_id uuid, tipo text, lleva smallint, paga smallint, monto numeric, porcentaje numeric, agrupa text,
  oferta_nombre text, etiqueta_nombre text
)
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  with
  hoy as (select retail.fn_hoy_lima() as d),
  todas as (
    select r.*, e.nombre as e_nombre,
           coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo'), '{}'::uuid[]) as solo,
           coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera'), '{}'::uuid[]) as fuera,
           coalesce((select array_agg(rp.producto_id) from retail.campana_regla_productos rp where rp.regla_id = r.id), '{}'::uuid[]) as productos,
           coalesce((select array_agg(ri.etiqueta_id) from retail.campana_regla_insignias ri where ri.regla_id = r.id), '{}'::uuid[]) as insignias
    from retail.campana_reglas r
    join retail.etiquetas e on e.id = r.etiqueta_id and e.estado = 'aprobado' and e.activo
    cross join hoy
    where r.estado = 'activa'
      and (e.vigente_desde is null or e.vigente_desde <= hoy.d)
      and (e.vigente_hasta is null or e.vigente_hasta >= hoy.d)
      and retail.fn_campana_rige_en_sede(e.id, p_ubicacion_id)
      and retail.fn_regla_rige_en(r.desde, r.hasta, r.dias_semana, hoy.d, 0)
      and (
        not exists (select 1 from retail.campana_regla_sedes rs where rs.regla_id = r.id)
        or (p_ubicacion_id is not null and exists (select 1 from retail.campana_regla_sedes rs where rs.regla_id = r.id and rs.ubicacion_id = p_ubicacion_id))
      )
  ),
  vigentes as (select t.* from todas t where t.tipo not in ('pct', 'monto')),
  alcanza as (
    select g.id as regla_id, x.variante_id
    from vigentes g
    cross join lateral retail.fn_variantes_de_oferta_con_insignias(g.etiqueta_id, g.solo, g.fuera, g.productos, g.insignias, g.incluye_claure) x
  ),
  -- Una oferta que cedió se calla donde la que gana también alcanza (como en fn_ofertas_de_grupo): sea de grupo, de «% menos» o un monto.
  sin_cedidas as (
    select a.* from alcanza a
    where not exists (
      select 1 from retail.campana_regla_cesiones c
      join todas w on w.id = c.gana_regla_id
      where c.cede_regla_id = a.regla_id and retail.fn_regla_alcanza_variante(w.id, a.variante_id)
    )
  )
  select distinct on (s.variante_id) s.variante_id, g.id, v.producto_id, g.tipo, g.lleva, g.paga, g.monto, g.porcentaje, g.agrupa, g.nombre, g.e_nombre
  from sin_cedidas s
  join vigentes g on g.id = s.regla_id
  join retail.variantes v on v.id = s.variante_id
  -- Sin llave, como campanas_vigentes: lo que da una oferta es público (la tienda web también lo muestra).
  order by s.variante_id, g.creada_en, g.id
$function$;

create or replace function retail.ofertas_de_monto_vigentes(p_ubicacion_id uuid)
returns table (
  regla_id uuid, oferta_nombre text, etiqueta_nombre text, escalones jsonb, ahorro_en text, cuenta text, variantes uuid[], excluidas uuid[]
)
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  with
  hoy as (select retail.fn_hoy_lima() as d),
  todas as (
    select r.*, e.nombre as e_nombre,
           coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo'), '{}'::uuid[]) as solo,
           coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera'), '{}'::uuid[]) as fuera,
           coalesce((select array_agg(rp.producto_id) from retail.campana_regla_productos rp where rp.regla_id = r.id), '{}'::uuid[]) as productos,
           coalesce((select array_agg(ri.etiqueta_id) from retail.campana_regla_insignias ri where ri.regla_id = r.id), '{}'::uuid[]) as insignias
    from retail.campana_reglas r
    join retail.etiquetas e on e.id = r.etiqueta_id and e.estado = 'aprobado' and e.activo
    cross join hoy
    where r.estado = 'activa'
      and (e.vigente_desde is null or e.vigente_desde <= hoy.d)
      and (e.vigente_hasta is null or e.vigente_hasta >= hoy.d)
      and retail.fn_campana_rige_en_sede(e.id, p_ubicacion_id)
      and retail.fn_regla_rige_en(r.desde, r.hasta, r.dias_semana, hoy.d, 0)
      and (
        not exists (select 1 from retail.campana_regla_sedes rs where rs.regla_id = r.id)
        or (p_ubicacion_id is not null and exists (select 1 from retail.campana_regla_sedes rs where rs.regla_id = r.id and rs.ubicacion_id = p_ubicacion_id))
      )
  )
  select m.id, m.nombre, m.e_nombre, m.escalones, m.ahorro_en, m.cuenta,
         case when m.cuenta = 'compra' then null else coalesce((
           select array_agg(x.variante_id order by x.variante_id)
           from retail.fn_variantes_de_oferta_con_insignias(m.etiqueta_id, m.solo, m.fuera, m.productos, m.insignias, m.incluye_claure) x
           where not exists (
             select 1 from retail.campana_regla_cesiones c join todas w on w.id = c.gana_regla_id
             where c.cede_regla_id = m.id and retail.fn_regla_alcanza_variante(w.id, x.variante_id))
         ), '{}'::uuid[]) end,
         case when m.cuenta = 'compra' then coalesce((
           select array_agg(v.id order by v.id)
           from retail.variantes v
           where not retail.fn_regla_alcanza_variante(m.id, v.id)
              or exists (
                select 1 from retail.campana_regla_cesiones c join todas w on w.id = c.gana_regla_id
                where c.cede_regla_id = m.id and retail.fn_regla_alcanza_variante(w.id, v.id))
         ), '{}'::uuid[]) else '{}'::uuid[] end
  from todas m
  where m.tipo = 'monto'
  order by m.creada_en, m.id
$function$;

-- 5. Los choques: la oferta de la hoja trae sus insignias; el candado, las guardadas --------------------------------------------------

drop function if exists retail.fn_choques_de_oferta_con_forma(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean);

create or replace function retail.fn_choques_de_oferta_con_forma_sin_llave(
  p_regla_id uuid,
  p_etiqueta_id uuid,
  p_desde date,
  p_hasta date,
  p_dias smallint[],
  p_solo uuid[],
  p_fuera uuid[],
  p_productos uuid[],
  p_insignias uuid[],
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
    select m.variante_id from retail.fn_variantes_de_oferta_con_insignias(p_etiqueta_id, p_solo, p_fuera, p_productos, p_insignias, p_claure) m
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
               and (coalesce(o.claure, false) or p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure'))
           ) else (
             select count(*)::integer
             from retail.fn_variantes_de_oferta_con_insignias(o.etiqueta_id, o.solo, o.fuera, o.productos, o.insignias, o.claure) x
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

comment on function retail.fn_choques_de_oferta_con_forma_sin_llave(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean) is
  'ADR-0655. Los choques de una oferta CON su forma y sus insignias (un monto de toda la compra alcanza a todo; uno que cede a las otras solo choca con otro monto), sin mirar la llave: la usa el candado (fn_exigir_sin_choques). Dice además si la otra es un monto y cuántas prendas alcanza esta.';

revoke all on function retail.fn_choques_de_oferta_con_forma_sin_llave(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean)
  from public, anon, authenticated;

create or replace function retail.fn_choques_de_oferta_con_forma(
  p_regla_id uuid, p_etiqueta_id uuid, p_desde date, p_hasta date, p_dias smallint[], p_solo uuid[], p_fuera uuid[], p_productos uuid[],
  p_insignias uuid[], p_claure boolean, p_sede_ids uuid[], p_tipo text, p_cuenta text, p_cede_a_otras boolean
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
    p_insignias, p_claure, p_sede_ids, p_tipo, p_cuenta, p_cede_a_otras) c
  where retail.fn_puede_campanas()
$function$;

comment on function retail.fn_choques_de_oferta_con_forma(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean) is
  'ADR-0655. Con qué ofertas activas y descuentos de siempre chocaría una oferta —guardada (p_regla_id) o todavía en la hoja (null)—, con su forma y sus insignias: la lee la hoja. Una fila por cada otra y cada tienda donde las dos rigen algún mismo día, con cuántas prendas tienen en común, si una cesión ya lo resuelve, si la otra es un monto y cuántas prendas alcanza esta.';

revoke all on function retail.fn_choques_de_oferta_con_forma(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean) from public, anon;
grant execute on function retail.fn_choques_de_oferta_con_forma(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean) to authenticated;

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
  -- Una oferta que no es monto y sin insignias (la pantalla de siempre): no ve como choque un monto que cede a las otras.
  select c.otra_tipo, c.otra_id, c.otra_nombre, c.campana_nombre, c.ubicacion_id, c.ubicacion_nombre, c.prendas, c.cedida
  from retail.fn_choques_de_oferta_con_forma_sin_llave(p_regla_id, p_etiqueta_id, p_desde, p_hasta, p_dias, p_solo, p_fuera, p_productos, '{}'::uuid[],
    p_claure, p_sede_ids, null::text, null::text, false) c
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
      coalesce((select array_agg(ri.etiqueta_id) from retail.campana_regla_insignias ri where ri.regla_id = v_r.id), '{}'::uuid[]),
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

drop function if exists retail.fn_choques_de_oferta_con_forma_sin_llave(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean);

-- 6. Guardar las insignias de una oferta -------------------------------------------------------------------------------------------------

create or replace function retail.guardar_oferta_completa(
  p_regla_id uuid,
  p_etiqueta_id uuid,
  p_nombre text,
  p_forma jsonb,
  p_desde date,
  p_hasta date,
  p_dias_semana smallint[],
  p_categorias_solo uuid[],
  p_categorias_fuera uuid[],
  p_incluye_claure boolean,
  p_sede_ids uuid[],
  p_producto_ids uuid[],
  p_cede_regla_ids uuid[],
  p_activar boolean
) returns uuid
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_tipo text := coalesce(p_forma ->> 'tipo', 'pct');
  v_pct numeric := nullif(p_forma ->> 'porcentaje', '')::numeric;
  v_lleva smallint := nullif(p_forma ->> 'lleva', '')::smallint;
  v_paga smallint := nullif(p_forma ->> 'paga', '')::smallint;
  v_monto numeric := nullif(p_forma ->> 'monto', '')::numeric;
  v_agrupa text := coalesce(nullif(p_forma ->> 'agrupa', ''), 'campana');
  v_escalones jsonb := p_forma -> 'escalones';
  v_ahorro_en text := nullif(p_forma ->> 'ahorro_en', '');
  v_cuenta text := nullif(p_forma ->> 'cuenta', '');
  v_cede boolean := coalesce(nullif(p_forma ->> 'cede_a_otras', '')::boolean, false);
  -- ADR-0655 (por insignia): las insignias cuyas prendas alcanza, en la forma para no cambiar la firma. Sin la clave, no se tocan.
  v_tocar_insignias boolean := p_forma ? 'insignias';
  v_insignias uuid[] := coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(
                          case when jsonb_typeof(p_forma -> 'insignias') = 'array' then p_forma -> 'insignias' else '[]'::jsonb end) x), '{}'::uuid[]);
  v_solo uuid[] := p_categorias_solo;
  v_productos uuid[] := p_producto_ids;
  v_antes jsonb;
  v_antes_insignias uuid[];
  v_id uuid;
begin
  if v_tipo not in ('pct', 'nxm', 'n_por_monto', 'nesima_pct', 'monto') then
    raise exception 'Esa forma de oferta no existe.' using hint = 'oferta_forma';
  end if;
  if v_agrupa not in ('campana', 'modelo') then
    raise exception 'El grupo se arma con prendas de la campaña o del mismo modelo.' using hint = 'oferta_forma';
  end if;
  if cardinality(v_insignias) > 20 then
    raise exception 'Una oferta puede elegir hasta 20 insignias.' using hint = 'oferta_forma';
  end if;
  if exists (select 1 from unnest(v_insignias) x where not exists (select 1 from retail.etiquetas e where e.id = x and e.estilo <> 'campana')) then
    raise exception 'Una de las insignias elegidas ya no existe o es una campaña. Vuelve a abrir la hoja y elígelas de nuevo.' using hint = 'oferta_forma';
  end if;
  if v_tipo = 'pct' then
    v_lleva := null; v_paga := null; v_monto := null;
  elsif v_tipo = 'monto' then
    if v_ahorro_en is null or v_ahorro_en not in ('soles', 'pct') then
      raise exception 'El ahorro de un monto va en soles o en %%.' using hint = 'oferta_forma';
    end if;
    if v_cuenta is null or v_cuenta not in ('campana', 'compra') then
      raise exception 'Elige qué cuenta para llegar al monto: toda la compra o solo las prendas de la campaña.' using hint = 'oferta_forma';
    end if;
    if not retail.fn_escalones_validos(v_escalones, v_ahorro_en) then
      raise exception '%', case
          when v_ahorro_en = 'soles' then 'De 1 a 3 escalones: cada uno desde más y ahorrando más que el anterior, y el ahorro menor que su monto.'
          else 'De 1 a 3 escalones: cada uno desde más y ahorrando más que el anterior, hasta 70 %.' end
        using hint = 'oferta_forma';
    end if;
    v_lleva := null; v_paga := null; v_monto := null; v_pct := null; v_agrupa := 'campana';
    -- Toda la compra no elige categorías, prendas ni insignias (solo puede dejar categorías fuera).
    if v_cuenta = 'compra' then
      v_solo := '{}'::uuid[]; v_productos := '{}'::uuid[]; v_insignias := '{}'::uuid[]; v_tocar_insignias := true;
    end if;
  else
    if v_lleva is null or v_lleva < 2 or v_lleva > 10 then
      raise exception 'Un grupo se arma con 2 a 10 prendas.' using hint = 'oferta_forma';
    end if;
    if v_tipo = 'nxm' and (v_paga is null or v_paga < 1 or v_paga >= v_lleva) then
      raise exception 'En «lleva %, paga M», M tiene que ser de 1 a %.', v_lleva, v_lleva - 1 using hint = 'oferta_forma';
    end if;
    if v_tipo = 'n_por_monto' and (v_monto is null or v_monto <= 0) then
      raise exception 'Pon cuánto cuesta el grupo.' using hint = 'oferta_forma';
    end if;
    if v_tipo = 'nesima_pct' and (v_pct is null or v_pct <= 0 or v_pct > 100) then
      raise exception 'El descuento de la %.ª va de 1 a 100 %%.', v_lleva using hint = 'oferta_forma';
    end if;
    if v_tipo <> 'nxm' then v_paga := null; end if;
    if v_tipo <> 'n_por_monto' then v_monto := null; end if;
    if v_tipo <> 'nesima_pct' then v_pct := null; end if;
  end if;
  if v_tipo <> 'monto' then
    v_escalones := null; v_ahorro_en := null; v_cuenta := null; v_cede := false;
  end if;

  if p_regla_id is not null then
    select jsonb_build_object('tipo', tipo, 'lleva', lleva, 'paga', paga, 'monto', monto, 'agrupa', agrupa, 'porcentaje', porcentaje,
                              'escalones', escalones, 'ahorro_en', ahorro_en, 'cuenta', cuenta, 'cede_a_otras', cede_a_otras)
      into v_antes from retail.campana_reglas where id = p_regla_id;
    v_antes_insignias := coalesce((select array_agg(ri.etiqueta_id order by ri.etiqueta_id) from retail.campana_regla_insignias ri where ri.regla_id = p_regla_id), '{}'::uuid[]);
  end if;

  -- Lo común (fechas, días, prendas, tiendas, quién) lo guarda y lo exige la función de siempre. El % que pide es el de la oferta, o uno
  -- cualquiera válido que se reemplaza abajo, en la misma transacción, por la forma de verdad. Las insignias y las cesiones van DESPUÉS de la
  -- forma: `ceder_ofertas` revisa los choques en el acto, con la oferta como queda.
  v_id := retail.guardar_oferta(p_regla_id, p_etiqueta_id, p_nombre, case when v_tipo = 'pct' then v_pct else 10 end, p_desde, p_hasta,
    p_dias_semana, v_solo, p_categorias_fuera, p_incluye_claure, p_sede_ids, v_productos, p_activar);

  update retail.campana_reglas
     set tipo = v_tipo, porcentaje = v_pct, lleva = v_lleva, paga = v_paga, monto = v_monto, agrupa = v_agrupa,
         escalones = v_escalones, ahorro_en = v_ahorro_en, cuenta = v_cuenta, cede_a_otras = v_cede
   where id = v_id;

  if v_tocar_insignias then
    delete from retail.campana_regla_insignias ri where ri.regla_id = v_id and not (ri.etiqueta_id = any (v_insignias));
    insert into retail.campana_regla_insignias (regla_id, etiqueta_id)
      select v_id, x from unnest(v_insignias) x
      on conflict (regla_id, etiqueta_id) do nothing;
    -- La historia (solo se agrega) guarda las insignias de antes cuando cambiaron.
    if p_regla_id is not null
       and v_antes_insignias is distinct from coalesce((select array_agg(x order by x) from unnest(v_insignias) x), '{}'::uuid[]) then
      insert into retail.campana_regla_historial (regla_id, antes, por)
        values (v_id, jsonb_build_object('insignias', to_jsonb(v_antes_insignias)), retail.fn_actor_persona_id(true));
    end if;
  end if;

  perform retail.ceder_ofertas(v_id, p_cede_regla_ids);

  -- La historia (solo se agrega) guarda la forma de antes cuando cambió.
  if v_antes is not null
     and v_antes is distinct from jsonb_build_object('tipo', v_tipo, 'lleva', v_lleva, 'paga', v_paga, 'monto', v_monto, 'agrupa', v_agrupa, 'porcentaje', v_pct,
                                                     'escalones', v_escalones, 'ahorro_en', v_ahorro_en, 'cuenta', v_cuenta, 'cede_a_otras', v_cede) then
    insert into retail.campana_regla_historial (regla_id, antes, por) values (v_id, jsonb_build_object('forma', v_antes), retail.fn_actor_persona_id(true));
  end if;
  return v_id;
end;
$function$;

comment on function retail.guardar_oferta_completa(uuid, uuid, text, jsonb, date, date, smallint[], uuid[], uuid[], boolean, uuid[], uuid[], uuid[], boolean) is
  'ADR-0655. Guarda una oferta de cualquier forma: p_forma = {tipo: pct|nxm|n_por_monto|nesima_pct|monto, porcentaje, lleva, paga, monto, agrupa: campana|modelo; en un monto, escalones [{desde, ahorra}], ahorro_en: soles|pct, cuenta: campana|compra y cede_a_otras; y, en cualquiera, insignias [ids]: las insignias cuyas prendas alcanza (sin la clave no se tocan)}. Lo común lo exigen guardar_oferta y ceder_ofertas (después de la forma y las insignias), en la misma transacción.';

revoke all on function retail.guardar_oferta_completa(uuid, uuid, text, jsonb, date, date, smallint[], uuid[], uuid[], boolean, uuid[], uuid[], uuid[], boolean) from public, anon;
grant execute on function retail.guardar_oferta_completa(uuid, uuid, text, jsonb, date, date, smallint[], uuid[], uuid[], boolean, uuid[], uuid[], uuid[], boolean) to authenticated;

-- 7. La pantalla: las insignias de cada oferta --------------------------------------------------------------------------------------------

drop function if exists retail.campana_reglas();
create function retail.campana_reglas()
returns table (
  id uuid, etiqueta_id uuid, nombre text, tipo text, porcentaje numeric, desde date, hasta date, dias_semana smallint[],
  incluye_claure boolean, estado text, categorias_solo uuid[], categorias_fuera uuid[], sedes uuid[],
  creada_por uuid, creada_en timestamptz, activada_por uuid, activada_en timestamptz, cambios integer, ultimo_cambio jsonb,
  productos_solo uuid[], ceden uuid[], lleva smallint, paga smallint, monto numeric, agrupa text,
  escalones jsonb, ahorro_en text, cuenta text, cede_a_otras boolean, insignias uuid[]
)
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  select r.id, r.etiqueta_id, r.nombre, r.tipo, r.porcentaje, r.desde, r.hasta, r.dias_semana, r.incluye_claure, r.estado,
         coalesce((select array_agg(rc.categoria_id order by rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo'), '{}'::uuid[]),
         coalesce((select array_agg(rc.categoria_id order by rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera'), '{}'::uuid[]),
         coalesce((select array_agg(rs.ubicacion_id order by rs.ubicacion_id) from retail.campana_regla_sedes rs where rs.regla_id = r.id), '{}'::uuid[]),
         r.creada_por, r.creada_en, r.activada_por, r.activada_en,
         -- «Cambios» son las EDICIONES: solo las filas de la historia que guardaron cómo estaba (llevan el porcentaje).
         (select count(*)::integer from retail.campana_regla_historial h where h.regla_id = r.id and h.antes ? 'porcentaje'),
         (select h.antes from retail.campana_regla_historial h where h.regla_id = r.id and h.antes ? 'porcentaje' order by h.en desc, h.id desc limit 1),
         coalesce((select array_agg(rp.producto_id order by rp.producto_id) from retail.campana_regla_productos rp where rp.regla_id = r.id), '{}'::uuid[]),
         coalesce((select array_agg(c.cede_regla_id order by c.cede_regla_id) from retail.campana_regla_cesiones c where c.gana_regla_id = r.id), '{}'::uuid[]),
         r.lleva, r.paga, r.monto, r.agrupa, r.escalones, r.ahorro_en, r.cuenta, r.cede_a_otras,
         coalesce((select array_agg(ri.etiqueta_id order by ri.etiqueta_id) from retail.campana_regla_insignias ri where ri.regla_id = r.id), '{}'::uuid[])
  from retail.campana_reglas r
  -- Las lee quien tiene la llave de las campañas; sin ella, nada.
  where retail.fn_puede_campanas()
  order by r.creada_en desc, r.id
$function$;

comment on function retail.campana_reglas() is
  'Las ofertas de todas las campañas, con sus categorías, sus modelos elegidos (productos_solo), sus insignias elegidas (insignias), las que le ceden (ceden), su forma (tipo, porcentaje, lleva, paga, monto, agrupa y, en un monto, escalones, ahorro_en, cuenta y cede_a_otras; ADR-0655), cuántas veces cambiaron y cómo estaban antes del último cambio. Las lee quien tiene la llave de las campañas (fn_puede_campanas); sin ella, ninguna fila.';

revoke all on function retail.campana_reglas() from public, anon;
grant execute on function retail.campana_reglas() to authenticated;
