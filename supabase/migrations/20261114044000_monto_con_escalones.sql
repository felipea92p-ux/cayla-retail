-- ============================================================================
-- 20261114044000 — «Gastar un monto y ahorrar», con hasta 3 escalones (ADR-0655, actividad 8, parte 1: la base)
--
-- EL PROBLEMA. Felipe aprobó (maqueta `docs/maquetas/campanas-y-ofertas-2026-11/`, 2026-11-13) la tercera forma de oferta: «desde S/ X
--   ahorra S/ Y o Y %, con hasta 3 escalones; cuenta solo prendas de la campaña o toda la compra». La base solo sabía de «un % menos» por
--   prenda y de los grupos de a N (3x2, N por S/, la N.ª al X %).
--
-- LO QUE HACE (la base; la caja, los apartados, la tienda web y la hoja vienen después, cada una con su PR).
--   1. Una forma nueva en `campana_reglas`: `tipo = 'monto'`, con
--        · `escalones` [{desde, ahorra}], de 1 a 3, cada uno desde más y ahorrando más que el anterior (`fn_escalones_validos`);
--        · `ahorro_en`: 'soles' (S/ 30 menos; menos que su «desde») o 'pct' (10 % menos, hasta 70 %, con el redondeo de la caja);
--        · `cuenta`: qué suma para llegar al monto: 'campana' (las prendas de la oferta: sus categorías o sus modelos) o 'compra' (todo
--          el ticket, salvo Claurè si no la incluye y las categorías que deja fuera);
--        · `cede_a_otras`: «que las prendas con otra oferta no cuenten» (la salida del choque que eligió Felipe, decisión 3).
--   2. LA cuenta (`fn_repartir_grupos`) sabe del monto: todas sus prendas son un grupo, vale el escalón más alto al que llega su total, y el
--      ahorro se reparte entre ellas en proporción a su precio, en céntimos exactos, como el 3x2 (decisión 7: cada prenda queda con lo que
--      pagó, para SUNAT y para un cambio o una devolución). Así la caja, `registrar_venta`, los apartados y la tienda web cobran el monto
--      sin tocar ninguna de sus funciones: todas leen `fn_ofertas_de_grupo`.
--   3. `fn_ofertas_de_grupo` toma el monto, con la regla de Felipe (decisión 3, «el monto no se junta con otra oferta»): una prenda que hoy
--      tiene un «% menos» (oferta, campaña o insignia) o una oferta de grupo NO cuenta para llegar al monto. Y dos arreglos que el monto
--      necesita (los dos se notan solo con ofertas que todavía no existen en producción: allí no hay ninguna regla guardada, 2026-11-14):
--        · una oferta de grupo que CEDIÓ a un «% menos» se callaba solo ante otras de grupo: con las dos activas, la prenda llevaba las dos
--          (la cesión dice lo contrario). Ahora mira todas las ofertas;
--        · con la tolerancia de una venta sin conexión (3 días), una oferta que ya terminó podía ganarle a la de hoy, y la caja (que cobra
--          la de hoy) quedaba fuera de lo que acepta `registrar_venta`. Ahora la de hoy gana siempre.
--   4. `fn_regla_alcanza_variante` sabe de «toda la compra», y `ofertas_de_grupo_vigentes` (la caja) deja el monto para su propia lectura
--      y calla, como la base, la oferta de grupo que cedió a cualquier otra. La lectura nueva, `ofertas_de_monto_vigentes(sede)`: los montos
--      de hoy con sus escalones y qué prendas alcanzan (o, de toda la compra, cuáles no), para que la caja arme el ticket sin preguntar en
--      cada prenda (vende sin conexión). Y la bolsa de la tienda web (`tienda_bolsa_grupos`) recibe, en un monto, sus escalones y lo que ya
--      suman sus prendas.
--   5. Los choques (20261113223000/230000): un monto de «toda la compra» choca con toda oferta de esas tiendas y días; uno que cede a las
--      otras no choca con ninguna (salvo con otro monto: dos montos nunca se reparten una prenda). `fn_choques_de_oferta` gana la forma de
--      la oferta (13 datos); la de 10 sigue, para la pantalla de antes, y responde lo mismo que antes.
--   6. `guardar_oferta_completa` valida y guarda el monto; `campana_reglas()` lo devuelve.
--   7. Los apartados: `separacion_ofertas_grupo` guarda también el trato de un monto (sus escalones), y los grupos del apartado lo usan.
--
-- QUÉ NO HACE TODAVÍA. La hoja no deja crear un monto (su tarjeta sigue apagada): la caja, los apartados y la tienda web lo muestran en
--   este mismo PR (parte 2), y la hoja lo habilita después (parte 3). Hasta entonces la base lo acepta y lo sabe cobrar, pero nadie lo arma.
--
-- DESCARTÉ: el ahorro del monto en una línea aparte al pie del ticket (como en la maqueta): SUNAT recibe el precio neto de cada línea, y una
--   devolución devuelve lo pagado por ESA prenda. Repartido dentro del descuento de cada prenda, las dos salen solas (como el 3x2).
-- DESCARTÉ: «que esas prendas no cuenten» como cesiones del monto a cada oferta que choca: un monto de toda la compra tendría que ceder a
--   cada oferta que se cree después, y a los descuentos de siempre de una campaña no se les puede ceder. Es una propiedad del monto.
-- DESCARTÉ: que el monto mire lo que se paga después de un descuento a mano: el 3x2 tampoco lo mira (Felipe 2026-11-13: lo a mano se suma).
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR (los cierra el esquema): un monto sin escalones o con más de 3, un escalón que ahorra más que su monto o
--   menos que el anterior, un monto que no dice qué cuenta, y una oferta que no es monto con escalones o «cede a las otras».
--
-- SE ROMPE SI: alguien vuelve a pegar 20261114003000 o 20261114032000 después de esta: dejarían la cuenta sin el monto (las pruebas pegan
--   esta al final de su cadena).
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: `alter table campana_reglas` y `separacion_ofertas_grupo` (columnas y
--   candados; sin políticas) y funciones. Va DESPUÉS de 20261114041000. Sin políticas ni disparadores nuevos (ADR-0195).
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:monto-con-escalones`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. La guarda -------------------------------------------------------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('retail.fn_repartir_grupos(jsonb)') is null then
    raise exception 'Falta fn_repartir_grupos (20261114032000): esta migración va después. No se aplicó nada.';
  end if;
  if to_regprocedure('retail.fn_variantes_de_oferta(uuid, uuid[], uuid[], uuid[], boolean)') is null then
    raise exception 'Falta fn_variantes_de_oferta (20261113230000). No se aplicó nada.';
  end if;
end;
$$;

-- 1. La forma «monto» -------------------------------------------------------------------------------------------------------------------

-- Los escalones de un monto: [{desde, ahorra}], de 1 a 3, cada uno desde más y ahorrando más que el anterior. En soles, el ahorro es menos
-- que su monto; en %, hasta 70 % (el tope de «un % menos»). Céntimos: dos decimales, nunca más.
create or replace function retail.fn_escalones_validos(p_escalones jsonb, p_ahorro_en text)
returns boolean
language sql
immutable
as $function$
  select coalesce(
    jsonb_typeof(p_escalones) = 'array'
    and jsonb_array_length(p_escalones) between 1 and 3
    and p_ahorro_en in ('soles', 'pct')
    and not exists (
      select 1
      from jsonb_array_elements(p_escalones) with ordinality t(e, n)
      where coalesce(jsonb_typeof(t.e -> 'desde'), '') <> 'number'
         or coalesce(jsonb_typeof(t.e -> 'ahorra'), '') <> 'number'
    )
    and not exists (
      select 1
      from jsonb_array_elements(p_escalones) with ordinality t(e, n)
      where (t.e ->> 'desde')::numeric <= 0
         or (t.e ->> 'ahorra')::numeric <= 0
         or (t.e ->> 'desde')::numeric <> round((t.e ->> 'desde')::numeric, 2)
         or (t.e ->> 'ahorra')::numeric <> round((t.e ->> 'ahorra')::numeric, 2)
         or (p_ahorro_en = 'soles' and (t.e ->> 'ahorra')::numeric >= (t.e ->> 'desde')::numeric)
         or (p_ahorro_en = 'pct' and (t.e ->> 'ahorra')::numeric > 70)
         or (t.n > 1 and ((t.e ->> 'desde')::numeric <= (p_escalones -> (t.n::integer - 2) ->> 'desde')::numeric
                       or (t.e ->> 'ahorra')::numeric <= (p_escalones -> (t.n::integer - 2) ->> 'ahorra')::numeric))
    ),
    false)
$function$;

comment on function retail.fn_escalones_validos(jsonb, text) is
  'ADR-0655. ¿Son válidos los escalones de un «Gastar un monto y ahorrar»? [{desde, ahorra}], de 1 a 3, cada uno desde más y ahorrando más que el anterior; en soles, el ahorro es menos que su monto; en %, hasta 70 %. La usa el candado campana_reglas_forma.';

alter table retail.campana_reglas add column if not exists escalones jsonb;
alter table retail.campana_reglas add column if not exists ahorro_en text;
alter table retail.campana_reglas add column if not exists cuenta text;
alter table retail.campana_reglas add column if not exists cede_a_otras boolean not null default false;

comment on column retail.campana_reglas.escalones is
  'ADR-0655. En «Gastar un monto y ahorrar» (monto): [{desde, ahorra}], de 1 a 3. Vale el escalón más alto al que llega lo que suman las prendas que cuentan.';
comment on column retail.campana_reglas.ahorro_en is 'ADR-0655. En un monto: «soles» (S/ 30 menos) o «pct» (10 % menos, con el redondeo de la caja).';
comment on column retail.campana_reglas.cuenta is
  'ADR-0655. En un monto, qué suma para llegar a él: «campana» (las prendas de la oferta) o «compra» (todo el ticket, salvo Claurè si no la incluye y las categorías que deja fuera).';
comment on column retail.campana_reglas.cede_a_otras is
  'ADR-0655. En un monto: «que las prendas con otra oferta no cuenten». Así no choca con ninguna otra oferta (salvo otro monto); sin esto, la hoja exige que la otra le ceda.';

do $$
begin
  -- Ya tiene el monto si nombra la forma 'monto' entre comillas («n_por_monto» no cuenta).
  if position('''monto''' in coalesce((select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'retail.campana_reglas'::regclass and conname = 'campana_reglas_forma'), '')) = 0 then
    alter table retail.campana_reglas drop constraint if exists campana_reglas_forma;
    -- Igual que en 20261114003000, más el monto. Su % no se mira (como el del 3x2): en el camino, la función de siempre le escribe uno y
    -- guardar_oferta_completa lo deja vacío al final.
    alter table retail.campana_reglas add constraint campana_reglas_forma check (coalesce(
      case tipo
        when 'pct' then porcentaje > 0 and porcentaje <= 70 and lleva is null and paga is null and monto is null
        when 'nxm' then lleva between 2 and 10 and paga between 1 and lleva - 1 and monto is null
        when 'n_por_monto' then lleva between 2 and 10 and monto > 0 and paga is null
        when 'nesima_pct' then lleva between 2 and 10 and porcentaje > 0 and porcentaje <= 100 and paga is null and monto is null
        when 'monto' then lleva is null and paga is null and monto is null and cuenta in ('campana', 'compra')
                          and retail.fn_escalones_validos(escalones, ahorro_en)
        else false
      end, false)
    );
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'retail.campana_reglas'::regclass and conname = 'campana_reglas_solo_el_monto') then
    alter table retail.campana_reglas add constraint campana_reglas_solo_el_monto
      check (tipo = 'monto' or (escalones is null and ahorro_en is null and cuenta is null and not cede_a_otras));
  end if;
end;
$$;

-- 2. LA cuenta, con el monto ------------------------------------------------------------------------------------------------------------

create or replace function retail.fn_repartir_grupos(p_unidades jsonb)
returns table (linea integer, regla_id uuid, descuento numeric, faltan integer)
language sql
stable
set search_path to 'retail', 'public'
as $function$
  with
  -- Cada prenda, ya con su oferta y su trato: [{linea, cent, regla_id, clave, tipo, lleva, paga, monto, porcentaje, escalones, ahorro_en}].
  con_oferta as (
    select (o.x ->> 'linea')::integer as linea, o.n as u, (o.x ->> 'cent')::bigint as cent, (o.x ->> 'regla_id')::uuid as regla_id,
           (o.x ->> 'clave')::uuid as clave, o.x ->> 'tipo' as tipo, (o.x ->> 'lleva')::integer as lleva, (o.x ->> 'paga')::integer as paga,
           (o.x ->> 'monto')::numeric as monto, (o.x ->> 'porcentaje')::numeric as porcentaje,
           o.x -> 'escalones' as escalones, o.x ->> 'ahorro_en' as ahorro_en
    from jsonb_array_elements(coalesce(p_unidades, '[]'::jsonb)) with ordinality o(x, n)
  ),
  -- De la más cara a la más barata (empate: el orden en que llegaron), en grupos de N; solo los grupos completos ahorran.
  ordenadas as (
    select c.*, row_number() over w as rn, count(*) over (partition by c.regla_id, c.clave) as n_cubo,
           sum(c.cent) over (partition by c.regla_id, c.clave) as total_cubo
    from con_oferta c
    window w as (partition by c.regla_id, c.clave order by c.cent desc, c.linea, c.u)
  ),
  -- ADR-0655 act. 8: un monto no arma grupos de a N: todas sus prendas son un grupo, y vale el escalón más alto al que llega su total.
  con_tramo as (
    select o.*, t.ahorra as tramo
    from ordenadas o
    left join lateral (
      select (e ->> 'ahorra')::numeric as ahorra
      from jsonb_array_elements(case when o.tipo = 'monto' and jsonb_typeof(o.escalones) = 'array' then o.escalones else '[]'::jsonb end) e
      where round((e ->> 'desde')::numeric * 100) <= o.total_cubo
      order by (e ->> 'desde')::numeric desc
      limit 1
    ) t on true
  ),
  en_grupo as (
    select o.*,
           case when o.tipo = 'monto' then 0 else (o.rn - 1) / o.lleva end as grupo,
           case when o.tipo = 'monto' then o.rn else (o.rn - 1) % o.lleva + 1 end as pos,
           case when o.tipo = 'monto' then o.tramo is not null else o.rn <= (o.n_cubo / o.lleva) * o.lleva end as completo
    from con_tramo o
  ),
  grupos as (
    select e.regla_id, e.clave, e.grupo, sum(e.cent) as total,
           case min(e.tipo)
             when 'nxm' then coalesce(sum(e.cent) filter (where e.pos > e.paga), 0)
             when 'n_por_monto' then greatest(sum(e.cent) - round(min(e.monto) * 100)::bigint, 0)
             when 'nesima_pct' then round(retail.fn_descuento_campana(min(e.cent)::numeric / 100, min(e.porcentaje)) * 100)::bigint
             -- El escalón en soles nunca ahorra más que lo que suma (el candado lo deja menor que su «desde»); en %, el redondeo de la caja.
             when 'monto' then case when min(e.ahorro_en) = 'soles' then least(round(min(e.tramo) * 100), sum(e.cent))
                                    else round(retail.fn_descuento_campana(sum(e.cent) / 100, min(e.tramo)) * 100) end
             else 0
           end as ahorro
    from en_grupo e
    where e.completo
    group by e.regla_id, e.clave, e.grupo
  ),
  -- El ahorro del grupo, repartido en proporción al precio, en céntimos exactos: lo que sobra del redondeo, a las de mayor resto.
  partes as (
    select e.linea, e.regla_id, e.clave, e.grupo, e.pos,
           -- División ENTERA: `sum()` de enteros es numeric en Postgres, y con `/` la base saldría con decimales y no quedaría nada que repartir.
           div(g.ahorro * e.cent, nullif(g.total, 0)) as base,
           mod(g.ahorro * e.cent, nullif(g.total, 0)) as resto,
           g.ahorro
    from en_grupo e
    join grupos g on g.regla_id = e.regla_id and g.clave = e.clave and g.grupo = e.grupo
  ),
  repartidas as (
    select p.linea,
           p.base + case when row_number() over (partition by p.regla_id, p.clave, p.grupo order by p.resto desc, p.pos)
                              <= p.ahorro - sum(p.base) over (partition by p.regla_id, p.clave, p.grupo)
                         then 1 else 0 end as parte
    from partes p
  ),
  por_linea as (
    select r.linea, sum(r.parte) as cent from repartidas r group by r.linea
  ),
  -- Cuántas prendas le faltan al último grupo de cada oferta (0 si todos están completos). Un monto no cuenta prendas: dice 0, y lo que le
  -- falta en soles lo dice cada pantalla con sus escalones.
  faltan_por_cubo as (
    select o.regla_id, o.clave,
           case when min(o.tipo) = 'monto' then 0
                when max(o.n_cubo) % max(o.lleva) = 0 then 0
                else max(o.lleva) - max(o.n_cubo) % max(o.lleva) end as faltan
    from ordenadas o group by o.regla_id, o.clave
  )
  select l.linea, l.regla_id, round(coalesce(pl.cent, 0)::numeric / 100, 2) as descuento, f.faltan::integer
  from (select distinct on (c.linea) c.linea, c.regla_id, c.clave from con_oferta c order by c.linea, c.u) l
  left join por_linea pl on pl.linea = l.linea
  join faltan_por_cubo f on f.regla_id = l.regla_id and f.clave = l.clave
  order by l.linea
$function$;

comment on function retail.fn_repartir_grupos(jsonb) is
  'ADR-0655. LA cuenta de «Llevar varias y pagar menos» y de «Gastar un monto y ahorrar», sin leer ninguna tabla: con cada prenda ya ligada a su oferta y su trato, arma los grupos de la más cara a la más barata (un monto es un solo grupo con todas sus prendas, y vale su escalón más alto alcanzado) y reparte el ahorro de cada grupo en proporción al precio, en céntimos exactos. La usan fn_ofertas_de_grupo (la caja, con las ofertas de hoy) y fn_grupos_de_separacion (un apartado, con el trato que guardó).';

revoke all on function retail.fn_repartir_grupos(jsonb) from public, anon, authenticated;

-- 3. «Toda la compra» -------------------------------------------------------------------------------------------------------------------

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
    else retail.fn_oferta_alcanza_variante(
      r.etiqueta_id,
      coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo'), '{}'::uuid[]),
      coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera'), '{}'::uuid[]),
      coalesce((select array_agg(rp.producto_id) from retail.campana_regla_productos rp where rp.regla_id = r.id), '{}'::uuid[]),
      r.incluye_claure,
      p_variante_id)
  end
  from retail.campana_reglas r
  where r.id = p_regla_id
$function$;

revoke all on function retail.fn_regla_alcanza_variante(uuid, uuid) from public, anon, authenticated;

-- 4. Las ofertas de un ticket, con el monto ---------------------------------------------------------------------------------------------

create or replace function retail.fn_ofertas_de_grupo(
  p_hoy date,
  p_ubicacion_id uuid,
  p_lineas jsonb,
  p_tolerancia_dias integer default 0
) returns table (
  linea integer, regla_id uuid, etiqueta_id uuid, etiqueta_nombre text, oferta_nombre text, descuento numeric, faltan integer
)
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  with
  -- Las líneas del ticket (en su orden: 1, 2, …) y cada prenda de cada línea, en céntimos.
  lineas as (
    select o.n::integer as linea, (o.x ->> 'variante_id')::uuid as variante_id,
           round((o.x ->> 'precio_unitario')::numeric * 100)::bigint as cent,
           greatest(coalesce((o.x ->> 'cantidad')::integer, 1), 0) as cantidad
    from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) with ordinality o(x, n)
  ),
  unidades as (
    select l.linea, l.variante_id, l.cent, g.u from lineas l cross join lateral generate_series(1, l.cantidad) g(u)
  ),
  -- TODAS las ofertas que rigen en esta tienda, también las de «% menos» (sirven para las cesiones), con las mismas condiciones que la caja
  -- usa para el % (fn_campanas_en_sede). `de_hoy`: rige hoy mismo; con la tolerancia de una venta sin conexión, la de hoy gana a una que ya
  -- terminó (así la venta en línea cae dentro de lo que acepta registrar_venta).
  todas as (
    select r.*, e.nombre as e_nombre,
           retail.fn_regla_rige_en(r.desde, r.hasta, r.dias_semana, p_hoy, 0) and (e.vigente_hasta is null or e.vigente_hasta >= p_hoy) as de_hoy
    from retail.campana_reglas r
    join retail.etiquetas e
      on e.id = r.etiqueta_id and e.estado = 'aprobado' and e.activo
     and (e.vigente_desde is null or e.vigente_desde <= p_hoy)
     and (e.vigente_hasta is null or e.vigente_hasta >= p_hoy - p_tolerancia_dias)
     and retail.fn_campana_rige_en_sede(e.id, p_ubicacion_id)
    where r.estado = 'activa'
      and retail.fn_regla_rige_en(r.desde, r.hasta, r.dias_semana, p_hoy, p_tolerancia_dias)
      and (
        not exists (select 1 from retail.campana_regla_sedes rs where rs.regla_id = r.id)
        or (p_ubicacion_id is not null and exists (select 1 from retail.campana_regla_sedes rs where rs.regla_id = r.id and rs.ubicacion_id = p_ubicacion_id))
      )
  ),
  vigentes as (select t.* from todas t where t.tipo <> 'pct'),
  -- Decisión 3 de Felipe: una prenda que HOY tiene un «% menos» (oferta, campaña o insignia; ya sin las que le cedieron) no cuenta para un monto.
  con_pct as (
    select c.variante_id
    from retail.fn_campanas_en_sede(p_hoy, 0, (select array_agg(distinct l.variante_id) from lineas l), p_ubicacion_id) c
    where coalesce(c.descuento_pct, 0) > 0
  ),
  -- La oferta de cada prenda (una sola por prenda, tienda y día: el candado de 20261113223000), salvo que haya cedido a otra que rige ahí.
  -- Primero las de hoy; después las de grupo antes que un monto (lo que ya tiene otra oferta no cuenta para el monto); después la más antigua.
  con_oferta as (
    select u.*, o.id as regla_id, o.etiqueta_id, o.e_nombre, o.nombre as o_nombre, o.tipo, o.lleva, o.paga, o.monto, o.porcentaje,
           o.escalones, o.ahorro_en,
           case when o.agrupa = 'modelo' then v.producto_id else '00000000-0000-0000-0000-000000000000'::uuid end as clave
    from unidades u
    join retail.variantes v on v.id = u.variante_id
    cross join lateral (
      select g.* from vigentes g
      where retail.fn_regla_alcanza_variante(g.id, u.variante_id)
        and not (g.tipo = 'monto' and u.variante_id in (select x.variante_id from con_pct x))
        and not exists (
          select 1
          from retail.campana_regla_cesiones c
          join todas w on w.id = c.gana_regla_id
          where c.cede_regla_id = g.id and retail.fn_regla_alcanza_variante(w.id, u.variante_id)
        )
      order by g.de_hoy desc, g.tipo = 'monto', g.creada_en, g.id
      limit 1
    ) o
  ),
  -- LA cuenta (ADR-0655): la misma para la caja y para los apartados.
  repartido as (
    select r.* from retail.fn_repartir_grupos((
      select coalesce(jsonb_agg(jsonb_build_object('linea', c.linea, 'cent', c.cent, 'regla_id', c.regla_id, 'clave', c.clave, 'tipo', c.tipo,
                                                   'lleva', c.lleva, 'paga', c.paga, 'monto', c.monto, 'porcentaje', c.porcentaje,
                                                   'escalones', c.escalones, 'ahorro_en', c.ahorro_en)
                                order by c.linea, c.u), '[]'::jsonb)
      from con_oferta c)) r
  )
  select l.linea, c.regla_id, c.etiqueta_id, c.e_nombre, c.o_nombre, r.descuento, r.faltan
  from lineas l
  join lateral (select distinct on (x.linea) x.* from con_oferta x where x.linea = l.linea order by x.linea) c on true
  join repartido r on r.linea = l.linea
  order by l.linea
$function$;

comment on function retail.fn_ofertas_de_grupo(date, uuid, jsonb, integer) is
  'ADR-0655. LA regla de las ofertas de grupo (3x2, N por S/, la N.ª al X %) y del monto con escalones en un ticket: cada prenda con la oferta que rige para ella hoy en esa tienda (una que cedió se calla donde rige la que gana; una prenda con un % menos o con oferta de grupo no cuenta para un monto), y su parte del ahorro (fn_repartir_grupos). La usan la caja, registrar_venta, los apartados y la tienda web.';

-- La caja lee el monto aparte (parte 2): aquí solo las de grupo. Y como la base, calla la oferta de grupo que cedió a CUALQUIER otra que rige.
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
           coalesce((select array_agg(rp.producto_id) from retail.campana_regla_productos rp where rp.regla_id = r.id), '{}'::uuid[]) as productos
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
    cross join lateral retail.fn_variantes_de_oferta(g.etiqueta_id, g.solo, g.fuera, g.productos, g.incluye_claure) x
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

comment on function retail.ofertas_de_grupo_vigentes(uuid) is
  'ADR-0655. Para la caja: la oferta de grupo (3x2, N por S/, la N.ª al X %) que rige hoy en esa tienda para cada prenda, con su forma y su modelo (sin las que cedieron a otra que rige ahí; el monto se lee aparte). La caja arma el ticket con la misma regla (lib/ofertas-de-grupo.ts) y registrar_venta la vuelve a exigir.';

revoke all on function retail.ofertas_de_grupo_vigentes(uuid) from public, anon;
grant execute on function retail.ofertas_de_grupo_vigentes(uuid) to authenticated;

-- Para la caja y los apartados: los montos que rigen hoy en esa tienda, de la más antigua a la más nueva (el orden de la base), con sus
-- escalones. Un monto de la campaña dice qué prendas alcanza; uno de toda la compra, cuáles NO (Claurè si no la incluye, lo que deja fuera y
-- donde cedió a otra): son pocas, y la caja vende sin conexión. Las prendas con un «% menos» o una oferta de grupo las salta la caja sola.
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
           coalesce((select array_agg(rp.producto_id) from retail.campana_regla_productos rp where rp.regla_id = r.id), '{}'::uuid[]) as productos
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
           from retail.fn_variantes_de_oferta(m.etiqueta_id, m.solo, m.fuera, m.productos, m.incluye_claure) x
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

comment on function retail.ofertas_de_monto_vigentes(uuid) is
  'ADR-0655. Para la caja y los apartados: los «Gastar un monto y ahorrar» que rigen hoy en esa tienda (en el orden de la base), con sus escalones; uno de la campaña con las prendas que alcanza, uno de toda la compra con las que NO. La caja arma el ticket con la misma cuenta (lib/ofertas-de-grupo.ts) y registrar_venta la vuelve a exigir.';

revoke all on function retail.ofertas_de_monto_vigentes(uuid) from public, anon;
grant execute on function retail.ofertas_de_monto_vigentes(uuid) to authenticated;

-- La bolsa de la tienda web: lo mismo de siempre y, en un monto, sus escalones y lo que ya suman sus prendas (para «te faltan S/ 20»).
create or replace function retail.tienda_bolsa_grupos(p_lineas jsonb, p_sede uuid default null)
returns jsonb
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  -- Las prendas de la bolsa como las lee `tienda_bolsa` (una id mal escrita no llega al cast; hasta 2 de una prenda), con su precio de lista
  -- en la tienda elegida, y de a una en el orden de la base: lo mismo que hará `tienda_separar` en esa tienda.
  with
  sede as (select retail.fn_tienda_sede_elegida(p_sede, retail.fn_tienda_sedes_web()) as id),
  crudo as (
    select e.n,
           case when jsonb_typeof(e.x) = 'object' and e.x ->> 'variante_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (e.x ->> 'variante_id')::uuid end as variante_id,
           case when jsonb_typeof(e.x) = 'object' and jsonb_typeof(e.x -> 'cantidad') = 'number' and (e.x ->> 'cantidad') ~ '^[0-9]{1,2}$'
                then (e.x ->> 'cantidad')::integer end as cantidad
    from jsonb_array_elements(case when jsonb_typeof(p_lineas) = 'array' then p_lineas else '[]'::jsonb end) with ordinality as e (x, n)
  ),
  entrada as (
    select c.variante_id, least(sum(c.cantidad), 2)::integer as cantidad
    from crudo c where c.variante_id is not null and c.cantidad between 1 and 20
    group by c.variante_id
  ),
  precios as (
    select pr.variante_id, pr.precio_lista from retail.fn_tienda_precio_talla(array(select en.variante_id from entrada en), (select id from sede)) pr
    where pr.se_ofrece
  ),
  u as (
    select en.variante_id, p.precio_lista as precio, k
    from entrada en join precios p on p.variante_id = en.variante_id
    cross join lateral generate_series(1, en.cantidad) k
  ),
  l as (select row_number() over (order by u.precio desc, u.variante_id, u.k)::integer as linea, u.* from u),
  g as (select * from retail.fn_ofertas_de_grupo(retail.fn_hoy_lima(), (select id from sede),
          (select coalesce(jsonb_agg(jsonb_build_object('variante_id', l.variante_id, 'precio_unitario', l.precio, 'cantidad', 1) order by l.linea), '[]'::jsonb) from l), 0)),
  por_variante as (
    select l.variante_id, sum(g.descuento) as ahorro, max(g.faltan) as faltan, (array_agg(g.regla_id))[1] as regla_id,
           (array_agg(g.etiqueta_nombre))[1] as campana
    from l join g on g.linea = l.linea group by l.variante_id
  ),
  -- Lo que ya suman las prendas que cuentan para cada monto.
  base_monto as (
    select g.regla_id, sum(l.precio) as base from l join g on g.linea = l.linea group by g.regla_id
  )
  select jsonb_build_object(
    'ahorro', coalesce((select sum(pv.ahorro) from por_variante pv), 0),
    'lineas', coalesce((
      select jsonb_object_agg(pv.variante_id::text, jsonb_build_object(
               'ahorro', pv.ahorro, 'faltan', pv.faltan, 'campana', pv.campana,
               'tipo', r.tipo, 'lleva', r.lleva, 'paga', r.paga, 'monto', r.monto, 'porcentaje', r.porcentaje)
             || case when r.tipo = 'monto'
                     then jsonb_build_object('escalones', r.escalones, 'ahorro_en', r.ahorro_en, 'cuenta', r.cuenta,
                                             'base', (select b.base from base_monto b where b.regla_id = pv.regla_id))
                     else '{}'::jsonb end)
      from por_variante pv join retail.campana_reglas r on r.id = pv.regla_id), '{}'::jsonb))
$function$;

-- 5. Los choques, con el monto ---------------------------------------------------------------------------------------------------------

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

revoke all on function retail.fn_choques_de_oferta_sin_llave(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean)
  from public, anon, authenticated;

-- La de 10 datos (la pantalla de antes, y quien no es monto) responde lo mismo de siempre: una oferta que no es monto.
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
  select c.otra_tipo, c.otra_id, c.otra_nombre, c.campana_nombre, c.ubicacion_id, c.ubicacion_nombre, c.prendas, c.cedida
  from retail.fn_choques_de_oferta_sin_llave(p_regla_id, p_etiqueta_id, p_desde, p_hasta, p_dias, p_solo, p_fuera, p_productos, p_claure,
    p_sede_ids, null::text, null::text, false) c
$function$;

create or replace function retail.fn_choques_de_oferta(
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
  select c.* from retail.fn_choques_de_oferta_sin_llave(p_regla_id, p_etiqueta_id, p_desde, p_hasta, p_dias, p_solo, p_fuera, p_productos, p_claure,
    p_sede_ids, p_tipo, p_cuenta, p_cede_a_otras) c
  where retail.fn_puede_campanas()
$function$;

comment on function retail.fn_choques_de_oferta(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean) is
  'ADR-0655. Con qué ofertas activas y descuentos de siempre chocaría una oferta —guardada (p_regla_id) o todavía en la hoja (null)—, con su forma: un monto de toda la compra alcanza a todo, y uno que cede a las otras solo choca con otro monto. Una fila por cada otra y cada tienda donde las dos rigen algún mismo día, con cuántas prendas tienen en común, si una cesión ya lo resuelve, si la otra es un monto y cuántas prendas alcanza esta (para avisar que la otra las tiene todas).';

revoke all on function retail.fn_choques_de_oferta(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean) from public, anon;
grant execute on function retail.fn_choques_de_oferta(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean) to authenticated;

-- El candado mira la oferta con su forma.
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

-- 6. Guardar un monto ------------------------------------------------------------------------------------------------------------------

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
  v_solo uuid[] := p_categorias_solo;
  v_productos uuid[] := p_producto_ids;
  v_antes jsonb;
  v_id uuid;
begin
  if v_tipo not in ('pct', 'nxm', 'n_por_monto', 'nesima_pct', 'monto') then
    raise exception 'Esa forma de oferta no existe.' using hint = 'oferta_forma';
  end if;
  if v_agrupa not in ('campana', 'modelo') then
    raise exception 'El grupo se arma con prendas de la campaña o del mismo modelo.' using hint = 'oferta_forma';
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
    -- Toda la compra no elige categorías ni prendas (solo puede dejar categorías fuera).
    if v_cuenta = 'compra' then
      v_solo := '{}'::uuid[]; v_productos := '{}'::uuid[];
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
  end if;

  -- Lo común (fechas, días, prendas, tiendas, quién) lo guarda y lo exige la función de siempre. El % que pide es el de la oferta, o uno
  -- cualquiera válido que se reemplaza abajo, en la misma transacción, por la forma de verdad. Las cesiones van DESPUÉS de la forma
  -- (guardar_oferta_y_ceder las ponía antes): `ceder_ofertas` revisa los choques en el acto, y un monto de toda la compra o que cede a
  -- las otras alcanza otras prendas que un «% menos» con sus mismas categorías.
  v_id := retail.guardar_oferta(p_regla_id, p_etiqueta_id, p_nombre, case when v_tipo = 'pct' then v_pct else 10 end, p_desde, p_hasta,
    p_dias_semana, v_solo, p_categorias_fuera, p_incluye_claure, p_sede_ids, v_productos, p_activar);

  update retail.campana_reglas
     set tipo = v_tipo, porcentaje = v_pct, lleva = v_lleva, paga = v_paga, monto = v_monto, agrupa = v_agrupa,
         escalones = v_escalones, ahorro_en = v_ahorro_en, cuenta = v_cuenta, cede_a_otras = v_cede
   where id = v_id;

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
  'ADR-0655. Guarda una oferta de cualquier forma: p_forma = {tipo: pct|nxm|n_por_monto|nesima_pct|monto, porcentaje, lleva, paga, monto, agrupa: campana|modelo; en un monto, escalones [{desde, ahorra}], ahorro_en: soles|pct, cuenta: campana|compra y cede_a_otras}. Lo común lo exigen guardar_oferta y ceder_ofertas (después de la forma), en la misma transacción.';

revoke all on function retail.guardar_oferta_completa(uuid, uuid, text, jsonb, date, date, smallint[], uuid[], uuid[], boolean, uuid[], uuid[], uuid[], boolean) from public, anon;
grant execute on function retail.guardar_oferta_completa(uuid, uuid, text, jsonb, date, date, smallint[], uuid[], uuid[], boolean, uuid[], uuid[], uuid[], boolean) to authenticated;

-- 7. La pantalla: la forma de cada oferta, con el monto ----------------------------------------------------------------------------------

drop function if exists retail.campana_reglas();
create function retail.campana_reglas()
returns table (
  id uuid, etiqueta_id uuid, nombre text, tipo text, porcentaje numeric, desde date, hasta date, dias_semana smallint[],
  incluye_claure boolean, estado text, categorias_solo uuid[], categorias_fuera uuid[], sedes uuid[],
  creada_por uuid, creada_en timestamptz, activada_por uuid, activada_en timestamptz, cambios integer, ultimo_cambio jsonb,
  productos_solo uuid[], ceden uuid[], lleva smallint, paga smallint, monto numeric, agrupa text,
  escalones jsonb, ahorro_en text, cuenta text, cede_a_otras boolean
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
         r.lleva, r.paga, r.monto, r.agrupa, r.escalones, r.ahorro_en, r.cuenta, r.cede_a_otras
  from retail.campana_reglas r
  -- Las lee quien tiene la llave de las campañas; sin ella, nada.
  where retail.fn_puede_campanas()
  order by r.creada_en desc, r.id
$function$;

comment on function retail.campana_reglas() is
  'Las ofertas de todas las campañas, con sus categorías, sus modelos elegidos (productos_solo), las que le ceden (ceden), su forma (tipo, porcentaje, lleva, paga, monto, agrupa y, en un monto, escalones, ahorro_en, cuenta y cede_a_otras; ADR-0655), cuántas veces cambiaron y cómo estaban antes del último cambio. Las lee quien tiene la llave de las campañas (fn_puede_campanas); sin ella, ninguna fila.';

revoke all on function retail.campana_reglas() from public, anon;
grant execute on function retail.campana_reglas() to authenticated;

-- 8. Los apartados: el trato de un monto ------------------------------------------------------------------------------------------------

alter table retail.separacion_ofertas_grupo add column if not exists escalones jsonb;
alter table retail.separacion_ofertas_grupo add column if not exists ahorro_en text;
alter table retail.separacion_ofertas_grupo add column if not exists cuenta text;
alter table retail.separacion_ofertas_grupo alter column lleva drop not null;

do $$
declare
  v_nombre text;
begin
  -- El candado de la forma (sin nombre en 20261114032000: Postgres le puso uno) pasa a saber del monto.
  for v_nombre in
    select c.conname from pg_constraint c
    where c.conrelid = 'retail.separacion_ofertas_grupo'::regclass and c.contype = 'c'
      and c.conname <> 'separacion_ofertas_grupo_forma'
      and pg_get_constraintdef(c.oid) like '%nesima_pct%' and pg_get_constraintdef(c.oid) not like '%''monto''%'
  loop
    execute format('alter table retail.separacion_ofertas_grupo drop constraint %I', v_nombre);
  end loop;
  if not exists (select 1 from pg_constraint where conrelid = 'retail.separacion_ofertas_grupo'::regclass and conname = 'separacion_ofertas_grupo_forma') then
    alter table retail.separacion_ofertas_grupo add constraint separacion_ofertas_grupo_forma check (coalesce(
      case tipo
        when 'monto' then lleva is null and cuenta in ('campana', 'compra') and retail.fn_escalones_validos(escalones, ahorro_en)
        when 'nxm' then lleva is not null and escalones is null
        when 'n_por_monto' then lleva is not null and escalones is null
        when 'nesima_pct' then lleva is not null and escalones is null
        else false
      end, false));
  end if;
end;
$$;

create or replace function retail.fn_guardar_ofertas_de_separacion(p_separacion_id uuid, p_reglas uuid[])
returns void
language sql
volatile
security definer
set search_path to 'retail', 'public'
as $function$
  -- La primera vez que una oferta entra al apartado se guarda su trato; después no se toca (el apartado vive con el trato de su día).
  insert into retail.separacion_ofertas_grupo (separacion_id, regla_id, etiqueta_id, nombre, etiqueta_nombre, tipo, lleva, paga, monto, porcentaje, agrupa,
                                               escalones, ahorro_en, cuenta)
  select p_separacion_id, r.id, r.etiqueta_id, r.nombre, e.nombre, r.tipo, r.lleva, r.paga, r.monto, r.porcentaje, r.agrupa,
         r.escalones, r.ahorro_en, r.cuenta
  from retail.campana_reglas r
  join retail.etiquetas e on e.id = r.etiqueta_id
  where r.id = any (coalesce(p_reglas, '{}'::uuid[])) and r.tipo <> 'pct'
  on conflict (separacion_id, regla_id) do nothing
$function$;

revoke all on function retail.fn_guardar_ofertas_de_separacion(uuid, uuid[]) from public, anon, authenticated;

create or replace function retail.fn_grupos_de_separacion(p_separacion_id uuid, p_quitar uuid[] default '{}'::uuid[], p_nuevas jsonb default '[]'::jsonb)
returns table (ref text, regla_id uuid, descuento numeric, faltan integer)
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  with
  -- Las prendas del apartado que van en una oferta de grupo o un monto (sin las que se quitan) y las que se suman ([{ref, variante_id,
  -- precio_unitario, regla_id}], de a una). Orden: de la más cara; empate, por prenda: el mismo de la pantalla (lib/ofertas-de-grupo.ts).
  unidades as (
    select 1 as tanda, row_number() over (order by si.id) as n, si.id::text as ref, si.variante_id, si.precio_unitario as precio, si.oferta_grupo_id as regla_id
    from retail.separacion_items si
    where si.separacion_id = p_separacion_id and si.oferta_grupo_id is not null
      and not (si.id = any (coalesce(p_quitar, '{}'::uuid[])))
    union all
    select 2, o.n, coalesce(o.x ->> 'ref', 'nueva-' || o.n), (o.x ->> 'variante_id')::uuid, (o.x ->> 'precio_unitario')::numeric,
           (o.x ->> 'regla_id')::uuid
    from jsonb_array_elements(coalesce(p_nuevas, '[]'::jsonb)) with ordinality o(x, n)
    where nullif(o.x ->> 'regla_id', '') is not null
  ),
  -- Cada una con su trato: el guardado; una oferta que todavía no entró al apartado (la vista previa de lo que se suma), con el de hoy.
  con_forma as (
    select row_number() over (order by u.precio desc, u.variante_id, u.tanda, u.n)::integer as linea, u.ref, u.regla_id,
           round(u.precio * 100)::bigint as cent,
           case when f.agrupa = 'modelo' then v.producto_id else '00000000-0000-0000-0000-000000000000'::uuid end as clave,
           f.tipo, f.lleva, f.paga, f.monto, f.porcentaje, f.escalones, f.ahorro_en
    from unidades u
    join retail.variantes v on v.id = u.variante_id
    join lateral (
      select g.tipo, g.lleva, g.paga, g.monto, g.porcentaje, g.agrupa, g.escalones, g.ahorro_en
        from retail.separacion_ofertas_grupo g where g.separacion_id = p_separacion_id and g.regla_id = u.regla_id
      union all
      select r.tipo, r.lleva, r.paga, r.monto, r.porcentaje, r.agrupa, r.escalones, r.ahorro_en
        from retail.campana_reglas r
       where r.id = u.regla_id and r.tipo <> 'pct'
         and not exists (select 1 from retail.separacion_ofertas_grupo g where g.separacion_id = p_separacion_id and g.regla_id = u.regla_id)
    ) f on true
  ),
  repartido as (
    select r.* from retail.fn_repartir_grupos((
      select coalesce(jsonb_agg(jsonb_build_object('linea', c.linea, 'cent', c.cent, 'regla_id', c.regla_id, 'clave', c.clave, 'tipo', c.tipo,
                                                   'lleva', c.lleva, 'paga', c.paga, 'monto', c.monto, 'porcentaje', c.porcentaje,
                                                   'escalones', c.escalones, 'ahorro_en', c.ahorro_en)
                                order by c.linea), '[]'::jsonb)
      from con_forma c)) r
  )
  select c.ref, c.regla_id, r.descuento, r.faltan
  from con_forma c join repartido r on r.linea = c.linea
  order by c.linea
$function$;

comment on function retail.fn_grupos_de_separacion(uuid, uuid[], jsonb) is
  'ADR-0655. Los grupos de un apartado con el trato que guardó (separacion_ofertas_grupo): para cada prenda que va en una oferta de grupo o un monto, su parte del ahorro y cuántas le faltan a su grupo. Con p_quitar y p_nuevas responde cómo quedaría una edición, sin escribir nada.';

revoke all on function retail.fn_grupos_de_separacion(uuid, uuid[], jsonb) from public, anon, authenticated;
