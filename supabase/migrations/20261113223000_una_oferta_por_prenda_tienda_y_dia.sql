-- ============================================================================
-- 20261113223000 — Una prenda, una oferta por tienda y por día (ADR-0655, actividad 4; Felipe 2026-11-13)
--
-- EL PROBLEMA. Dos ofertas activas podían alcanzar la misma prenda en la misma tienda el mismo día (de la misma campaña o de dos
--   campañas, o una oferta y el «descuento de siempre» de una campaña o de una insignia). La caja cobraba la de mayor % y la hoja solo
--   avisaba «gana el mejor precio». Felipe decidió: «No deberían sumarse dos ofertas de la misma prenda» y que el sistema avise y NO
--   deje aplicar una doble oferta; pero el 3x2 de polos en Trujillo y el −20 % de polos en Arequipa sí conviven (otra tienda). Y cuando
--   chocan, la otra puede CEDER: donde las dos valdrían, vale la nueva (maqueta `docs/maquetas/campanas-y-ofertas-2026-11/`).
--
-- LO QUE HACE.
--   1. `retail.campana_regla_cesiones` (cede_regla_id, gana_regla_id): «donde las dos rigen —misma prenda, misma tienda, mismo día—, vale la
--      que gana y la que cede se calla». No copia fechas ni prendas: la regla se evalúa en la caja con lo que cada oferta tiene ese día.
--   2. `fn_oferta_alcanza_variante` y `fn_regla_alcanza_variante`: ¿esta oferta alcanza a esta prenda? (sin fechas ni tienda). Es la misma
--      regla del bloque de ofertas de `fn_campanas_en_sede`; `pruebas:campana-reglas` exige que digan lo mismo.
--   3. `fn_choques_de_oferta(...)`: con qué ofertas activas (y descuentos de siempre de campañas o insignias) chocaría una oferta —guardada
--      o todavía en la hoja—, tienda por tienda, con cuántas prendas en común y si ya está resuelto por una cesión. La lee la hoja.
--   4. El candado: un disparador DIFERIDO (al cerrar la transacción) sobre `campana_reglas` que, para toda oferta que queda ACTIVA, exige
--      que no choque sin una cesión. Diferido porque `guardar_oferta` agrega las prendas sueltas después de `guardar_campana_regla`: el
--      candado mira la oferta ya completa. Vale para guardar activando, para «Activar» y para cualquier otro camino. Un borrador no se mira.
--   5. `ceder_ofertas(gana, cede[])`: deja las cesiones de una oferta (reemplaza el conjunto) y, si la que gana ya está activa, vuelve a exigir
--      el candado (quitar una cesión no puede dejar un choque abierto).
--      `guardar_oferta_y_ceder(...)` guarda la oferta y sus cesiones en una transacción (lo que llama la hoja).
--   6. `fn_campanas_en_sede` (la caja) suma, por reemplazo anclado, que una oferta que cedió no cuenta donde la que gana rige.
--   7. `campana_reglas()` devuelve también `ceden`: qué ofertas le ceden a cada una.
--
-- QUÉ NO HACE. No cambia `registrar_venta` ni el descuento de siempre (una oferta que choca con uno se resuelve retirándolo, o cambiando
--   la oferta). No vigila los cambios de alcance que vienen de FUERA de la oferta (marcar una prenda a mano en otra campaña, sumarle una
--   categoría a la campaña, ponerle descuento a una insignia): el candado mira las ofertas al guardarlas o activarlas, que es lo que pidió
--   Felipe («al configurar»). Producción al 2026-11-13: 0 ofertas activas vigentes, 0 campañas con descuento de siempre y 4 insignias con
--   descuento (la actividad 5 las pasa a campañas): nada existente queda bloqueado.
--
-- DESCARTÉ: copiar en la que cede una «excepción» con fechas, tiendas y prendas: se desfasaría en cuanto cambie cualquiera de las dos.
-- DESCARTÉ: resolver el choque en la caja («gana el mayor %», como hasta hoy): Felipe pidió que nunca haya dos ofertas sobre una prenda.
-- DESCARTÉ: revisar el choque al final de `guardar_campana_regla`: `guardar_oferta` agrega los modelos después y el candado vería la oferta
--   sin ellos.
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR (los cierra el esquema): una oferta activa que comparte prenda, tienda y día con otra activa sin una
--   cesión entre las dos (disparador diferido); una oferta que se cede a sí misma; dos ofertas que se ceden una a la otra.
--
-- SE ROMPE SI: alguien cambia el final del bloque de ofertas de `fn_campanas_en_sede` (la línea de Claurè) o `campana_reglas()` antes de pegar
--   esto: las guardas se detienen sin tocar nada.
--
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: una tabla NUEVA con RLS sin políticas, funciones, un reemplazo anclado y un
--   disparador nuevo (`create constraint trigger`, solo si no existe; ni `drop trigger` ni políticas, ADR-0195). Va DESPUÉS de 20261113210000.
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:campana-reglas` (escenarios «Una oferta por prenda, tienda y día»).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. Las guardas -------------------------------------------------------------------------------------------------------------------

do $$
declare
  v_caja text := (select prosrc from pg_proc where oid = to_regprocedure('retail.fn_campanas_en_sede(date,integer,uuid[],uuid)'));
  v_reglas text := (select prosrc from pg_proc where oid = to_regprocedure('retail.campana_reglas()'));
begin
  if v_caja is null or position('campana_regla_productos' in v_caja) = 0 then
    raise exception 'fn_campanas_en_sede no tiene las prendas elegidas: esta migración va después de 20261113210000. No se aplicó nada.';
  end if;
  if v_reglas is null or position('campana_regla_productos' in v_reglas) = 0 then
    raise exception 'campana_reglas() no es la de 20261113210000: esta migración va después. No se aplicó nada.';
  end if;
end;
$$;

-- 1. Las cesiones ----------------------------------------------------------------------------------------------------------------

create table if not exists retail.campana_regla_cesiones (
  cede_regla_id uuid not null references retail.campana_reglas (id) on delete cascade,
  gana_regla_id uuid not null references retail.campana_reglas (id) on delete cascade,
  creada_por uuid,
  creada_en timestamptz not null default now(),
  primary key (cede_regla_id, gana_regla_id),
  constraint campana_regla_cesiones_no_a_si_misma check (cede_regla_id <> gana_regla_id)
);

create index if not exists campana_regla_cesiones_gana_idx on retail.campana_regla_cesiones (gana_regla_id);

alter table retail.campana_regla_cesiones enable row level security;
revoke all on table retail.campana_regla_cesiones from public, anon, authenticated;

comment on table retail.campana_regla_cesiones is
  'Una oferta que CEDE a otra (ADR-0655): donde las dos rigen —misma prenda, misma tienda, mismo día— vale la que gana y la que cede se calla (fn_campanas_en_sede). Se escribe con ceder_ofertas y se lee con fn_choques_de_oferta y campana_reglas().';

-- 2. ¿Esta oferta alcanza a esta prenda? (la regla del bloque de ofertas de fn_campanas_en_sede, sin fechas ni tienda) ---------------

create or replace function retail.fn_oferta_alcanza_variante(
  p_etiqueta_id uuid, p_solo uuid[], p_fuera uuid[], p_productos uuid[], p_claure boolean, p_variante_id uuid
) returns boolean
language sql
stable
-- Sin `security definer` ni `set search_path` a propósito: así Postgres la mete dentro de la consulta que la llama (con ellos, cada llamada
-- cuesta ~100 veces más; 20261101004000). Nombra todo con `retail.` y la llaman funciones `security definer`.
as $function$
  select exists (
    select 1
    from retail.variantes v
    join retail.productos p on p.id = v.producto_id
    where v.id = p_variante_id
      and (
        coalesce(p.categoria_id = any (p_solo), false)
        or coalesce(p.id = any (p_productos), false)
        or (
          cardinality(coalesce(p_solo, '{}'::uuid[])) = 0 and cardinality(coalesce(p_productos, '{}'::uuid[])) = 0
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

comment on function retail.fn_oferta_alcanza_variante(uuid, uuid[], uuid[], uuid[], boolean, uuid) is
  'ADR-0655. ¿Una oferta (su campaña, categorías «solo», «fuera», modelos elegidos y si incluye Claurè) alcanza a esta prenda? Sin fechas ni tienda. Es la regla del bloque de ofertas de fn_campanas_en_sede (pruebas:campana-reglas exige que coincidan). Con todo vacío y Claurè incluida, es el alcance del descuento de siempre de una campaña o insignia.';

create or replace function retail.fn_regla_alcanza_variante(p_regla_id uuid, p_variante_id uuid)
returns boolean
language sql
stable
as $function$
  select retail.fn_oferta_alcanza_variante(
    r.etiqueta_id,
    coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo'), '{}'::uuid[]),
    coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera'), '{}'::uuid[]),
    coalesce((select array_agg(rp.producto_id) from retail.campana_regla_productos rp where rp.regla_id = r.id), '{}'::uuid[]),
    r.incluye_claure,
    p_variante_id)
  from retail.campana_reglas r
  where r.id = p_regla_id
$function$;

-- 3. Los choques de una oferta, tienda por tienda --------------------------------------------------------------------------------

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
  -- Las prendas a la venta que alcanza esta oferta.
  mias as (
    select v.id from retail.variantes v
    where v.activo and retail.fn_oferta_alcanza_variante(p_etiqueta_id, p_solo, p_fuera, p_productos, p_claure, v.id)
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
    -- (Sus listas se leen una sola vez aquí, no una vez por prenda.)
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
  -- Cuántas prendas tienen en común.
  con_prendas as (
    select o.*, (
      select count(*)::integer from mias m
      where retail.fn_oferta_alcanza_variante(o.etiqueta_id, o.solo, o.fuera, o.productos, o.claure, m.id)
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

-- La que lee la hoja: la misma, solo para quien tiene la llave de las campañas (sin ella, ninguna fila). El candado usa la de arriba.
create or replace function retail.fn_choques_de_oferta(
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
  select c.* from retail.fn_choques_de_oferta_sin_llave(p_regla_id, p_etiqueta_id, p_desde, p_hasta, p_dias, p_solo, p_fuera, p_productos, p_claure, p_sede_ids) c
  where retail.fn_puede_campanas()
$function$;

comment on function retail.fn_choques_de_oferta(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], boolean, uuid[]) is
  'ADR-0655. Con qué ofertas activas y descuentos de siempre (campañas e insignias) chocaría una oferta —guardada (p_regla_id) o todavía en la hoja (null)—: una fila por cada otra y cada tienda donde las dos rigen algún mismo día, con cuántas prendas tienen en común y si una cesión ya lo resuelve. La hoja la lee; el candado de campana_reglas la usa.';

revoke all on function retail.fn_choques_de_oferta(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], boolean, uuid[]) from public, anon;
grant execute on function retail.fn_choques_de_oferta(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], boolean, uuid[]) to authenticated;
revoke all on function retail.fn_oferta_alcanza_variante(uuid, uuid[], uuid[], uuid[], boolean, uuid) from public, anon, authenticated;
revoke all on function retail.fn_regla_alcanza_variante(uuid, uuid) from public, anon, authenticated;

-- 4. El candado: una oferta activa no choca sin una cesión ------------------------------------------------------------------------

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
    select * from retail.fn_choques_de_oferta_sin_llave(
      v_r.id, v_r.etiqueta_id, v_r.desde, v_r.hasta, v_r.dias_semana,
      coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = v_r.id and rc.modo = 'solo'), '{}'::uuid[]),
      coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = v_r.id and rc.modo = 'fuera'), '{}'::uuid[]),
      coalesce((select array_agg(rp.producto_id) from retail.campana_regla_productos rp where rp.regla_id = v_r.id), '{}'::uuid[]),
      v_r.incluye_claure,
      coalesce((select array_agg(rs.ubicacion_id) from retail.campana_regla_sedes rs where rs.regla_id = v_r.id), '{}'::uuid[]))
    where not cedida
    limit 1
  loop
    raise exception 'La oferta «%» choca con «%»% en %: % % tendría% dos ofertas el mismo día. Una prenda tiene una sola oferta por tienda y por día: %.',
      v_r.nombre, v_c.otra_nombre, case when v_c.otra_tipo = 'oferta' and v_c.campana_nombre <> v_c.otra_nombre then ' (de ' || v_c.campana_nombre || ')' else '' end,
      v_c.ubicacion_nombre, v_c.prendas, case when v_c.prendas = 1 then 'prenda' else 'prendas' end, case when v_c.prendas = 1 then '' else 'n' end,
      case when v_c.otra_tipo = 'oferta' then 'que la otra ceda, o cambia las tiendas, las fechas o las prendas'
           else 'retira ese descuento de siempre, o cambia las tiendas, las fechas o las prendas' end
      using errcode = 'P0001', hint = 'oferta_choca';
  end loop;
end;
$function$;

revoke all on function retail.fn_exigir_sin_choques(uuid) from public, anon, authenticated;

create or replace function retail.fn_campana_regla_sin_choques()
returns trigger
language plpgsql
security definer
set search_path to 'retail', 'public'
as $function$
begin
  -- Al cerrar la transacción: mira la oferta como quedó (también sus prendas sueltas, que guardar_oferta agrega al final).
  perform retail.fn_exigir_sin_choques(new.id);
  return null;
end;
$function$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'retail.campana_reglas'::regclass and tgname = 'campana_reglas_sin_choques') then
    create constraint trigger campana_reglas_sin_choques
      after insert or update on retail.campana_reglas
      deferrable initially deferred
      for each row
      when (new.estado = 'activa')
      execute function retail.fn_campana_regla_sin_choques();
  end if;
end;
$$;

-- 5. Ceder ------------------------------------------------------------------------------------------------------------------------

create or replace function retail.ceder_ofertas(p_gana_regla_id uuid, p_cede_regla_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_actor uuid;
  v_antes uuid[];
  v_cede uuid[] := coalesce((select array_agg(distinct x) from unnest(coalesce(p_cede_regla_ids, '{}'::uuid[])) x where x is not null), '{}'::uuid[]);
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Ceder una oferta necesita el módulo «Campañas», «Campañas de la tienda web» o «Insignias» en tu rol.' using errcode = '42501', hint = 'oferta_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if not exists (select 1 from retail.campana_reglas where id = p_gana_regla_id) then
    raise exception 'Esa oferta ya no existe. Recarga la pantalla.';
  end if;
  if p_gana_regla_id = any (v_cede) then
    raise exception 'Una oferta no puede cederse a sí misma.';
  end if;
  if exists (select 1 from unnest(v_cede) x where not exists (select 1 from retail.campana_reglas r where r.id = x)) then
    raise exception 'Una de las ofertas que cede ya no existe. Recarga la pantalla.';
  end if;
  if exists (select 1 from retail.campana_regla_cesiones c where c.gana_regla_id = any (v_cede) and c.cede_regla_id = p_gana_regla_id) then
    raise exception 'Esta oferta ya le cede a una de esas: dos ofertas no pueden cederse una a la otra.';
  end if;

  -- La historia guarda qué le cedían antes (solo se agrega; sin «porcentaje», no cuenta como una edición de la oferta).
  v_antes := coalesce((select array_agg(c.cede_regla_id order by c.cede_regla_id) from retail.campana_regla_cesiones c where c.gana_regla_id = p_gana_regla_id), '{}'::uuid[]);
  if v_antes is distinct from coalesce((select array_agg(x order by x) from unnest(v_cede) x), '{}'::uuid[]) then
    insert into retail.campana_regla_historial (regla_id, antes, por) values (p_gana_regla_id, jsonb_build_object('ceden', to_jsonb(v_antes)), v_actor);
  end if;

  -- Las cesiones son configuración de la oferta que gana (como sus tiendas): el conjunto se reemplaza.
  delete from retail.campana_regla_cesiones c where c.gana_regla_id = p_gana_regla_id and not (c.cede_regla_id = any (v_cede));
  insert into retail.campana_regla_cesiones (cede_regla_id, gana_regla_id, creada_por)
    select x, p_gana_regla_id, v_actor from unnest(v_cede) x
    on conflict (cede_regla_id, gana_regla_id) do nothing;

  -- Quitar una cesión no puede dejar un choque abierto.
  perform retail.fn_exigir_sin_choques(p_gana_regla_id);
end;
$function$;

comment on function retail.ceder_ofertas(uuid, uuid[]) is
  'ADR-0655. Deja qué ofertas le CEDEN a esta (reemplaza el conjunto): donde las dos rigen, vale esta. Lo hace quien tiene la llave de las campañas; si esta ya está activa, vuelve a exigir que no quede ningún choque sin resolver.';

revoke all on function retail.ceder_ofertas(uuid, uuid[]) from public, anon;
grant execute on function retail.ceder_ofertas(uuid, uuid[]) to authenticated;

-- 5b. Guardar y ceder en una transacción (lo que llama la hoja) -----------------------------------------------------------------------
-- Primero la oferta (nueva o editada, con sus modelos), después quiénes le ceden; el candado mira todo junto al cerrar. Así una oferta nueva que
-- choca se guarda activa con su cesión de una vez, y una que ya regía cambia de tiendas o de prendas sin quedar un instante en falta.

create or replace function retail.guardar_oferta_y_ceder(
  p_regla_id uuid,
  p_etiqueta_id uuid,
  p_nombre text,
  p_porcentaje numeric,
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
  v_id uuid;
begin
  v_id := retail.guardar_oferta(p_regla_id, p_etiqueta_id, p_nombre, p_porcentaje, p_desde, p_hasta, p_dias_semana, p_categorias_solo,
    p_categorias_fuera, p_incluye_claure, p_sede_ids, p_producto_ids, p_activar);
  perform retail.ceder_ofertas(v_id, p_cede_regla_ids);
  return v_id;
end;
$function$;

comment on function retail.guardar_oferta_y_ceder(uuid, uuid, text, numeric, date, date, smallint[], uuid[], uuid[], boolean, uuid[], uuid[], uuid[], boolean) is
  'ADR-0655. guardar_oferta + ceder_ofertas en una transacción: la oferta con sus modelos y las ofertas que le ceden. Lo que exige cada una lo exigen ellas.';

revoke all on function retail.guardar_oferta_y_ceder(uuid, uuid, text, numeric, date, date, smallint[], uuid[], uuid[], boolean, uuid[], uuid[], uuid[], boolean) from public, anon;
grant execute on function retail.guardar_oferta_y_ceder(uuid, uuid, text, numeric, date, date, smallint[], uuid[], uuid[], boolean, uuid[], uuid[], uuid[], boolean) to authenticated;

-- 6. La caja: una oferta que cedió no cuenta donde la que gana rige -------------------------------------------------------------------

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  -- Ya aplicado = el ancla no está y el texto nuevo sí.
  if v_n = 0 and position(p_nuevo in v_def) > 0 then
    return;
  end if;
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_anclado(
  'retail.fn_campanas_en_sede(date, integer, uuid[], uuid)',
  $v$      and (r.incluye_claure or p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure'))
  ) x$v$,
  $n$      and (r.incluye_claure or p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure'))
      -- ADR-0655: una oferta que CEDIÓ a otra se calla donde la otra rige (misma prenda, misma tienda, mismo día).
      and not exists (
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
      )
  ) x$n$
);

-- 7. La pantalla: qué ofertas le ceden a cada una ----------------------------------------------------------------------------------

drop function if exists retail.campana_reglas();
create function retail.campana_reglas()
returns table (
  id uuid, etiqueta_id uuid, nombre text, tipo text, porcentaje numeric, desde date, hasta date, dias_semana smallint[],
  incluye_claure boolean, estado text, categorias_solo uuid[], categorias_fuera uuid[], sedes uuid[],
  creada_por uuid, creada_en timestamptz, activada_por uuid, activada_en timestamptz, cambios integer, ultimo_cambio jsonb,
  productos_solo uuid[], ceden uuid[]
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
         -- «Cambios» son las EDICIONES (la historia guarda también cada activación y retiro, pero eso no es «cambiarla»): solo las filas que
         -- guardaron cómo estaba (llevan el porcentaje).
         (select count(*)::integer from retail.campana_regla_historial h where h.regla_id = r.id and h.antes ? 'porcentaje'),
         (select h.antes from retail.campana_regla_historial h where h.regla_id = r.id and h.antes ? 'porcentaje' order by h.en desc, h.id desc limit 1),
         coalesce((select array_agg(rp.producto_id order by rp.producto_id) from retail.campana_regla_productos rp where rp.regla_id = r.id), '{}'::uuid[]),
         coalesce((select array_agg(c.cede_regla_id order by c.cede_regla_id) from retail.campana_regla_cesiones c where c.gana_regla_id = r.id), '{}'::uuid[])
  from retail.campana_reglas r
  -- Las lee quien tiene la llave de las campañas (la misma de quien ve la pantalla); sin ella, nada.
  where retail.fn_puede_campanas()
  order by r.creada_en desc, r.id
$function$;

comment on function retail.campana_reglas() is
  'Las ofertas de todas las campañas, con sus categorías, sus modelos elegidos (productos_solo), las ofertas que le ceden (ceden, ADR-0655), cuántas veces cambiaron y cómo estaban antes del último cambio. Las lee quien tiene la llave de las campañas (fn_puede_campanas); sin ella, ninguna fila.';

revoke all on function retail.campana_reglas() from public, anon;
grant execute on function retail.campana_reglas() to authenticated;
