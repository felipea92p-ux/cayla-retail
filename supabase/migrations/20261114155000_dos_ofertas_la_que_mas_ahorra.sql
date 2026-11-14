-- ============================================================================
-- 20261114155000 — Una prenda con una rebaja y un 3x2: la que más le ahorra al cliente, nunca las dos (ADR-0655, decisión 2 de Felipe)
--
-- EL PROBLEMA. Una prenda puede quedar con una rebaja (un «% menos», o el descuento de siempre de su campaña) y una oferta de grupo (3x2,
--   N por S/, la N.ª al X %) a la vez sin pasar por la hoja de la oferta, que es la que frena el choque: al marcarla con una insignia,
--   sumarle una categoría a una insignia, mover su modelo de categoría, crear un modelo o reactivar una campaña. La caja, los apartados y
--   la tienda web cobraban LAS DOS (la rebaja y, encima, su parte del 3x2): un regalo doble que nadie configuró.
--
-- LA REGLA (Felipe 2026-11-14, «Como Shopify: la mejor»). Mientras nadie elija en Campañas cuál queda, se cobra la que más le ahorra al
--   cliente en ESA compra, nunca las dos: con un polo, su −20 %; con tres, el 3x2. Por cada oferta de grupo (y modelo, si arma por modelo)
--   se comparan dos cuentas:
--     A · todas sus prendas van con la oferta (los grupos de siempre); la que no completa un grupo conserva su rebaja;
--     B · las prendas con rebaja se quedan con ella y no entran; las demás arman sus grupos.
--   Gana la que más ahorra; si empatan, B (la rebaja que el cliente ve en la etiqueta no cambia). Sin rebajas, A y B son la misma cuenta y
--   nada cambia. Una prenda con parte del grupo (descuento > 0) nunca lleva su rebaja: esa es la marca que leen todas las pantallas.
--   Un descuento a mano sigue sumándose a la parte del grupo (Felipe 2026-11-13); el monto sigue sin contar las prendas con rebaja.
--
-- LO QUE HACE.
--   1. `fn_cuenta_de_grupos(unidades)`: la cuenta de siempre (20261114044000), con otro nombre.
--   2. `fn_repartir_grupos(unidades)`: LA cuenta, ahora con la rebaja de cada prenda (`rebaja`, en céntimos): compara A y B por oferta.
--      Responde lo mismo de siempre (línea, oferta, su parte, cuántas faltan para otro grupo con todas sus prendas).
--   3. `fn_ofertas_de_grupo`: cada prenda lleva su rebaja de hoy (la mayor, la misma que exige `registrar_venta`). Así la caja
--      (`registrar_venta`, `fn_exigir_ofertas_de_grupo`), los apartados y la tienda web eligen igual.
--   4. `registrar_venta`: una línea con parte del grupo no exige ni acepta su rebaja (`venta_dos_ofertas` si la manda); un descuento a mano
--      sí se suma.
--   5. Apartados: `separacion_items` guarda la rebaja del día de cada prenda de una oferta de grupo (`rebaja_unitaria`,
--      `rebaja_etiqueta_id`). `fn_regrupar_separacion` la saca mientras la prenda vaya con su grupo y se la devuelve si deja de ir (al quitar
--      otra del 3x2). `fn_grupos_de_separacion` y `previsualizar_edicion_separacion` hacen la misma cuenta, y `separar_prendas` cobra el
--      total sin la rebaja de las que van con su grupo.
--   6. Tienda web: `crear_pedido_web` deja solo la parte del grupo en la prenda que va con su grupo (`tienda_separar` le manda las dos), y
--      `tienda_bolsa_grupos` dice qué rebaja deja cada prenda (`deja_rebaja`), para que la bolsa muestre el precio que se cobrará.
--
-- DESCARTÉ:
--   · «gana la rebaja» siempre (la regla del monto): con tres polos el cliente no recibe el 3x2, que le conviene más (Felipe eligió la mejor);
--   · elegir prenda por prenda la mejor combinación: son 2^n cuentas y nadie podría explicar el resultado en la caja. Por oferta, A o B, se
--     dice en una frase («con estas 3, el 3x2 te ahorra más»);
--   · que la caja elija: dos clientes pagarían distinto por lo mismo el mismo día y la base no podría comprobarlo.
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR: una línea de venta, de apartado o de pedido web con parte de una oferta de grupo Y su rebaja de campaña.
--   La venta lo rechaza (`venta_dos_ofertas`); el apartado y el pedido web lo arma la base.
--
-- SE ROMPE SI: alguien vuelve a pegar 20261114003000, 20261114032000 o 20261114044000 después de esta: dejan la cuenta sin la rebaja (las
--   pruebas pegan esta al final de su cadena). Los reemplazos anclados se detienen si su texto cambió, sin tocar nada. El parche de
--   `registrar_venta` está en `scripts/pruebas/registrar-venta-antes-de-precio-sede.mjs` (DESHACER/REHACER_DOS_OFERTAS).
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: dos columnas en `separacion_items` (sin políticas) y funciones. Va DESPUÉS
--   de 20261114142000. Sin políticas ni disparadores (ADR-0195).
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:dos-ofertas-la-mejor`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. La guarda -------------------------------------------------------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('retail.fn_repartir_grupos(jsonb)') is null
     or position('''monto''' in coalesce((select prosrc from pg_proc where oid = to_regprocedure('retail.fn_repartir_grupos(jsonb)')), '')) = 0 then
    raise exception 'Falta la cuenta con el monto (20261114044000): esta migración va después. No se aplicó nada.';
  end if;
  if position('v_grupo' in coalesce((select prosrc from pg_proc where oid = to_regprocedure('retail.crear_pedido_web(uuid, uuid, jsonb, uuid)')), '')) = 0 then
    raise exception 'Falta la tienda web con ofertas de grupo (20261114041000). No se aplicó nada.';
  end if;
  if to_regprocedure('retail.fn_dia_de_la_venta()') is null then
    raise exception 'Falta la venta sin conexión con las ofertas de su hora (20261114132000). No se aplicó nada.';
  end if;
end;
$$;

-- 1. La cuenta de siempre, con otro nombre ----------------------------------------------------------------------------------------------

create or replace function retail.fn_cuenta_de_grupos(p_unidades jsonb)
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

comment on function retail.fn_cuenta_de_grupos(jsonb) is
  'ADR-0655. La cuenta de los grupos sin rebajas (la de siempre): de la más cara a la más barata, de a N (un monto, todas juntas), y el ahorro repartido en proporción al precio, en céntimos exactos. La llama fn_repartir_grupos dos veces, para comparar.';

revoke all on function retail.fn_cuenta_de_grupos(jsonb) from public, anon, authenticated;

-- 2. LA cuenta, con la rebaja de cada prenda ------------------------------------------------------------------------------------------

create or replace function retail.fn_repartir_grupos(p_unidades jsonb)
returns table (linea integer, regla_id uuid, descuento numeric, faltan integer)
language sql
stable
set search_path to 'retail', 'public'
as $function$
  with
  -- Cada prenda con lo que le ahorraría su rebaja, en céntimos (0 si no tiene; nunca en un monto: con rebaja no cuenta para él).
  u as (
    select o.x, o.n, (o.x ->> 'linea')::integer as linea, (o.x ->> 'regla_id')::uuid as regla_id, (o.x ->> 'clave')::uuid as clave,
           case when o.x ->> 'tipo' = 'monto' then 0 else greatest(coalesce((o.x ->> 'rebaja')::numeric, 0), 0)::bigint end as rebaja
    from jsonb_array_elements(coalesce(p_unidades, '[]'::jsonb)) with ordinality o(x, n)
  ),
  -- A: todas van con su oferta (la cuenta de siempre). B: las que tienen rebaja se quedan con ella y no entran.
  a as (select * from retail.fn_cuenta_de_grupos(p_unidades)),
  b as (select * from retail.fn_cuenta_de_grupos((select coalesce(jsonb_agg(u.x order by u.n), '[]'::jsonb) from u where u.rebaja = 0))),
  -- Cada línea: todas sus prendas son la misma (misma oferta, misma rebaja).
  lin as (
    select u.linea, (array_agg(u.regla_id))[1] as regla_id, (array_agg(u.clave))[1] as clave, sum(u.rebaja) as rebaja
    from u group by u.linea
  ),
  -- Lo que ahorra cada oferta (por modelo, si arma por modelo) con A y con B: la parte de cada línea o, si no la tiene, su rebaja.
  cubos as (
    select l.regla_id, l.clave, bool_or(l.rebaja > 0) as hay_rebaja,
           sum(case when round(coalesce(a.descuento, 0) * 100) > 0 then round(a.descuento * 100) else l.rebaja end) as con_a,
           sum(case when l.rebaja > 0 then l.rebaja else round(coalesce(b.descuento, 0) * 100) end) as con_b
    from lin l
    left join a on a.linea = l.linea
    left join b on b.linea = l.linea
    group by l.regla_id, l.clave
  )
  -- La que más ahorra; si empatan, B (la rebaja de la etiqueta no cambia). Cuántas faltan: las de A (para otro grupo con todas sus prendas).
  select l.linea, l.regla_id,
         case when c.hay_rebaja and c.con_b >= c.con_a
              then case when l.rebaja > 0 then 0::numeric else coalesce(b.descuento, 0) end
              else coalesce(a.descuento, 0) end as descuento,
         a.faltan
  from lin l
  join a on a.linea = l.linea
  join cubos c on c.regla_id = l.regla_id and c.clave = l.clave
  left join b on b.linea = l.linea
  order by l.linea
$function$;

comment on function retail.fn_repartir_grupos(jsonb) is
  'ADR-0655. LA cuenta de «Llevar varias y pagar menos» y de «Gastar un monto y ahorrar», sin leer ninguna tabla. Decisión 2 de Felipe (2026-11-14): una prenda con rebaja (`rebaja`, en céntimos) y oferta de grupo lleva la que más le ahorra al cliente en esa compra, nunca las dos: por cada oferta compara A (todas con la oferta; la que no completa un grupo conserva su rebaja) y B (las rebajadas quedan fuera con su rebaja), y gana la que más ahorra (empate: B). Una línea con parte (descuento > 0) deja su rebaja. La usan fn_ofertas_de_grupo (caja, tienda web) y fn_grupos_de_separacion (apartados).';

-- 3. Las ofertas de un ticket, con la rebaja de cada prenda ---------------------------------------------------------------------------

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
  -- Decisión 2 (2026-11-14): y su rebaja (la mayor, la misma que exige registrar_venta) entra a LA cuenta, que elige la que más ahorra.
  con_pct as (
    select c.variante_id, max(c.descuento_pct) as pct
    from retail.fn_campanas_en_sede(p_hoy, 0, (select array_agg(distinct l.variante_id) from lineas l), p_ubicacion_id) c
    where coalesce(c.descuento_pct, 0) > 0
    group by c.variante_id
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
                                                   'escalones', c.escalones, 'ahorro_en', c.ahorro_en,
                                                   -- Decisión 2: lo que la rebaja de la prenda le ahorraría (céntimos), para elegir la mejor.
                                                   'rebaja', case when c.tipo <> 'monto' then
                                                               (select round(retail.fn_descuento_campana(c.cent::numeric / 100, x.pct) * 100)
                                                                  from con_pct x where x.variante_id = c.variante_id) end)
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
  'ADR-0655. LA regla de las ofertas de grupo (3x2, N por S/, la N.ª al X %) y del monto con escalones en un ticket: cada prenda con la oferta que rige para ella hoy en esa tienda (una que cedió se calla donde rige la que gana; una prenda con un % menos o con oferta de grupo no cuenta para un monto), y su parte del ahorro (fn_repartir_grupos). Decisión 2 (2026-11-14): con rebaja y oferta de grupo, la que más le ahorra al cliente, nunca las dos; una línea con parte (descuento > 0) deja su rebaja. La usan la caja, registrar_venta, los apartados y la tienda web.';

-- 4. Los apartados: la rebaja del día de cada prenda de una oferta de grupo -------------------------------------------------------------

alter table retail.separacion_items add column if not exists rebaja_unitaria numeric(10, 2);
alter table retail.separacion_items add column if not exists rebaja_etiqueta_id uuid references retail.etiquetas (id);

comment on column retail.separacion_items.rebaja_unitaria is
  'ADR-0655, decisión 2. En una prenda de una oferta de grupo: la rebaja de campaña que tenía el día en que entró al apartado (0 si no tenía). Se cobra solo mientras la prenda no vaya con su grupo (nunca las dos); null mientras no se guardó.';
comment on column retail.separacion_items.rebaja_etiqueta_id is
  'ADR-0655, decisión 2. La campaña de rebaja_unitaria: vuelve a descuento_etiqueta_id cuando la prenda deja de ir con su grupo.';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'retail.separacion_items'::regclass and conname = 'separacion_items_rebaja_valida') then
    alter table retail.separacion_items add constraint separacion_items_rebaja_valida
      check (rebaja_unitaria is null or (rebaja_unitaria >= 0 and rebaja_unitaria < precio_unitario and round(rebaja_unitaria, 2) = rebaja_unitaria));
  end if;
end;
$$;

-- 5. Los grupos de un apartado, con la rebaja de cada prenda --------------------------------------------------------------------------

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
    select 1 as tanda, row_number() over (order by si.id) as n, si.id::text as ref, si.variante_id, si.precio_unitario as precio, si.oferta_grupo_id as regla_id,
           si.rebaja_unitaria as rebaja
    from retail.separacion_items si
    where si.separacion_id = p_separacion_id and si.oferta_grupo_id is not null
      and not (si.id = any (coalesce(p_quitar, '{}'::uuid[])))
    union all
    select 2, o.n, coalesce(o.x ->> 'ref', 'nueva-' || o.n), (o.x ->> 'variante_id')::uuid, (o.x ->> 'precio_unitario')::numeric,
           (o.x ->> 'regla_id')::uuid, null::numeric
    from jsonb_array_elements(coalesce(p_nuevas, '[]'::jsonb)) with ordinality o(x, n)
    where nullif(o.x ->> 'regla_id', '') is not null
  ),
  -- Decisión 2 (Felipe 2026-11-14): la rebaja de cada prenda es la de su día (la guardó fn_regrupar_separacion); la que todavía no la tiene
  -- (se está apartando o sumando ahora mismo) lleva la de hoy.
  hoy as (
    select c.variante_id, max(c.descuento_pct) as pct
    from retail.fn_campanas_en_sede(retail.fn_hoy_lima(), 0,
           coalesce((select array_agg(distinct u.variante_id) from unidades u where u.rebaja is null), '{}'::uuid[]),
           (select s.ubicacion_id from retail.separaciones s where s.id = p_separacion_id)) c
    where coalesce(c.descuento_pct, 0) > 0
    group by c.variante_id
  ),
  -- Cada una con su trato: el guardado; una oferta que todavía no entró al apartado (la vista previa de lo que se suma), con el de hoy.
  con_forma as (
    select row_number() over (order by u.precio desc, u.variante_id, u.tanda, u.n)::integer as linea, u.ref, u.regla_id,
           round(u.precio * 100)::bigint as cent,
           case when f.agrupa = 'modelo' then v.producto_id else '00000000-0000-0000-0000-000000000000'::uuid end as clave,
           f.tipo, f.lleva, f.paga, f.monto, f.porcentaje, f.escalones, f.ahorro_en,
           case when f.tipo <> 'monto' then round(coalesce(u.rebaja, retail.fn_descuento_campana(u.precio, h.pct), 0) * 100) end as rebaja
    from unidades u
    join retail.variantes v on v.id = u.variante_id
    left join hoy h on h.variante_id = u.variante_id
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
                                                   'escalones', c.escalones, 'ahorro_en', c.ahorro_en, 'rebaja', c.rebaja)
                                order by c.linea), '[]'::jsonb)
      from con_forma c)) r
  )
  select c.ref, c.regla_id, r.descuento, r.faltan
  from con_forma c join repartido r on r.linea = c.linea
  order by c.linea
$function$;

comment on function retail.fn_grupos_de_separacion(uuid, uuid[], jsonb) is
  'ADR-0655. Los grupos de un apartado con el trato que guardó (separacion_ofertas_grupo): para cada prenda que va en una oferta de grupo o un monto, su parte del ahorro y cuántas le faltan a su grupo, con su rebaja del día (decisión 2: la que más ahorra, nunca las dos). Con p_quitar y p_nuevas responde cómo quedaría una edición, sin escribir nada.';

-- 6. Cada prenda del apartado con lo que le toca: su parte del grupo o su rebaja ------------------------------------------------------

create or replace function retail.fn_regrupar_separacion(p_separacion_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path to 'retail', 'public'
as $function$
declare
  r record;
  v_pct numeric;
  v_etq uuid;
  v_fijo numeric;
  v_desc numeric;
begin
  -- Decisión 2 (Felipe 2026-11-14): la rebaja del día se guarda la primera vez que la prenda entra al apartado (esto corre en la misma
  -- transacción en que se aparta o se suma): la de su campaña si entró con ella; si entró con un descuento a mano, la que hoy le daría su
  -- campaña (LA cuenta decide con la rebaja, como en la caja).
  for r in
    select si.id, si.variante_id, si.precio_unitario, si.descuento_unitario - si.descuento_grupo_unitario as base, si.descuento_etiqueta_id,
           s.ubicacion_id
    from retail.separacion_items si
    join retail.separaciones s on s.id = si.separacion_id
    where si.separacion_id = p_separacion_id and si.oferta_grupo_id is not null and si.rebaja_unitaria is null
  loop
    if r.descuento_etiqueta_id is not null then
      update retail.separacion_items set rebaja_unitaria = r.base, rebaja_etiqueta_id = r.descuento_etiqueta_id where id = r.id;
    else
      v_etq := null;
      v_pct := null;
      select c.etiqueta_id, c.descuento_pct into v_etq, v_pct
        from retail.fn_campanas_en_sede(retail.fn_hoy_lima(), 0, array[r.variante_id], r.ubicacion_id) c
       order by c.descuento_pct desc, c.etiqueta_nombre, c.etiqueta_id
       limit 1;
      update retail.separacion_items
         set rebaja_unitaria = case when v_pct is null then 0 else retail.fn_descuento_campana(r.precio_unitario, v_pct) end,
             rebaja_etiqueta_id = case when v_pct is null then null else v_etq end
       where id = r.id;
    end if;
  end loop;

  for r in
    select si.id, si.precio_unitario, si.motivo_descuento, si.descuento_unitario, si.descuento_grupo_unitario as antes,
           si.descuento_etiqueta_id, si.rebaja_unitaria, si.rebaja_etiqueta_id, g.descuento,
           p.referencia || ' (' || coalesce(v.codigo, v.sku, 'sin código') || ')' as prenda
    from retail.fn_grupos_de_separacion(p_separacion_id) g
    join retail.separacion_items si on si.id = g.ref::uuid
    join retail.variantes v on v.id = si.variante_id
    join retail.productos p on p.id = v.producto_id
  loop
    if r.motivo_descuento is not null then
      -- Un descuento a mano se SUMA a la parte del grupo (Felipe 2026-11-13).
      v_fijo := r.descuento_unitario - r.antes;
      if v_fijo + r.descuento >= r.precio_unitario then
        raise exception 'El descuento a mano de % más su oferta la dejan en cero: baja el descuento a mano.', r.prenda
          using errcode = 'P0001', hint = 'separacion_descuento_supera_precio', detail = r.prenda;
      end if;
      v_desc := v_fijo + r.descuento;
      v_etq := null;
    elsif r.descuento > 0 then
      -- Va con su grupo: deja su rebaja, nunca las dos.
      v_desc := r.descuento;
      v_etq := null;
    else
      -- No va con su grupo (no lo completa, o su rebaja le ahorra más): su rebaja del día.
      v_desc := coalesce(r.rebaja_unitaria, 0);
      v_etq := case when v_desc > 0 then r.rebaja_etiqueta_id end;
    end if;
    if r.antes is distinct from r.descuento or r.descuento_unitario is distinct from v_desc or r.descuento_etiqueta_id is distinct from v_etq then
      update retail.separacion_items
         set descuento_grupo_unitario = r.descuento, descuento_unitario = v_desc, descuento_etiqueta_id = v_etq
       where id = r.id;
    end if;
  end loop;
end;
$function$;

comment on function retail.fn_regrupar_separacion(uuid) is
  'ADR-0655. Deja en cada prenda de un apartado su parte del ahorro de su oferta de grupo, con el trato guardado (fn_grupos_de_separacion). Decisión 2 (2026-11-14): la que va con su grupo deja su rebaja del día (rebaja_unitaria) y la que deja de ir la recupera; un descuento a mano se suma. La llaman separar_prendas al apartar y editar_separacion después de quitar o sumar.';

revoke all on function retail.fn_regrupar_separacion(uuid) from public, anon, authenticated;

-- 7. La vista previa de una edición, con la misma cuenta ------------------------------------------------------------------------------

create or replace function retail.previsualizar_edicion_separacion(
  p_separacion_id uuid,
  p_quitar uuid[] default '{}'::uuid[],
  p_agregar jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'retail', 'public'
as $function$
declare
  s retail.separaciones%rowtype;
  v_hoy date := retail.fn_hoy_lima();
  v_nuevas jsonb;
  v_res jsonb;
begin
  if not retail.fn_ve_modulo('apartados') then
    raise exception 'Tu rol no tiene el módulo Apartados' using errcode = '42501';
  end if;
  select * into s from retail.separaciones where id = p_separacion_id;
  if not found or not retail.fn_puede_operar_ubicacion(s.ubicacion_id) then
    raise exception 'Ese apartado no existe';
  end if;

  -- Lo que se suma, de a una prenda, con su precio de hoy, el descuento que manda la hoja y la oferta de grupo que hoy le rige (la misma
  -- cuenta que editar_separacion).
  with e as (
    select o.n, (o.x ->> 'variante_id')::uuid as variante_id, least(greatest(coalesce((o.x ->> 'cantidad')::integer, 0), 0), 10) as cantidad,
           coalesce((o.x ->> 'descuento_unitario')::numeric, 0) as base,
           btrim(coalesce(o.x ->> 'motivo_descuento', '')) as motivo
    from jsonb_array_elements(coalesce(p_agregar, '[]'::jsonb)) with ordinality o(x, n)
    where nullif(o.x ->> 'variante_id', '') is not null
  ),
  l as (
    select row_number() over (order by x.variante_id)::integer as linea, x.variante_id, x.precio
    from (select d.variante_id, retail.fn_precio_en_sede(d.variante_id, s.ubicacion_id) as precio from (select distinct e.variante_id from e) d) x
    where x.precio is not null
  ),
  g as (
    select * from retail.fn_ofertas_de_grupo(v_hoy, s.ubicacion_id,
      (select coalesce(jsonb_agg(jsonb_build_object('variante_id', l.variante_id, 'precio_unitario', l.precio, 'cantidad', 1) order by l.linea), '[]'::jsonb) from l), 0)
  )
  -- Decisión 2 (Felipe 2026-11-14): una prenda que entra con un descuento a mano lo conserva (se suma a su parte del grupo); la de campaña
  -- es su rebaja, que deja si va con su grupo (la misma regla que editar_separacion: a mano es lo que pasa la campaña).
  select coalesce(jsonb_agg(jsonb_build_object('ref', 'nueva-' || e.n || '-' || k.k, 'variante_id', e.variante_id, 'precio_unitario', l.precio,
                                               'base', e.base, 'regla_id', g.regla_id,
                                               'manual', e.motivo <> 'campana' and e.base > coalesce(retail.fn_descuento_campana(l.precio, c.pct), 0) + 0.011)
                            order by e.n, k.k), '[]'::jsonb)
    into v_nuevas
  from e
  join l on l.variante_id = e.variante_id
  left join g on g.linea = l.linea
  left join lateral (
    select max(x.descuento_pct) as pct from retail.fn_campanas_en_sede(v_hoy, 0, array[e.variante_id], s.ubicacion_id) x where coalesce(x.descuento_pct, 0) > 0
  ) c on true
  cross join lateral generate_series(1, e.cantidad) k(k);

  with
  partes as (select * from retail.fn_grupos_de_separacion(s.id, p_quitar, v_nuevas)),
  -- Decisión 2 (Felipe 2026-11-14): `fijo` es lo que la prenda lleva siempre (un descuento a mano, o el de una prenda sin oferta de grupo);
  -- `rebaja`, la de su campaña, que vale solo si no va con su grupo. Nunca las dos (la misma cuenta que fn_regrupar_separacion).
  quedan as (
    select si.id::text as ref, si.variante_id, si.cantidad, si.precio_unitario,
           case when si.oferta_grupo_id is null or si.motivo_descuento is not null then si.descuento_unitario - si.descuento_grupo_unitario else 0 end as fijo,
           case when si.oferta_grupo_id is not null and si.motivo_descuento is null
                then coalesce(si.rebaja_unitaria, si.descuento_unitario - si.descuento_grupo_unitario) else 0 end as rebaja,
           si.oferta_grupo_id
    from retail.separacion_items si
    where si.separacion_id = s.id and not (si.id = any (coalesce(p_quitar, '{}'::uuid[])))
    union all
    select x ->> 'ref', (x ->> 'variante_id')::uuid, 1, (x ->> 'precio_unitario')::numeric,
           case when (x ->> 'manual')::boolean or nullif(x ->> 'regla_id', '') is null then (x ->> 'base')::numeric else 0 end,
           case when (x ->> 'manual')::boolean or nullif(x ->> 'regla_id', '') is null then 0 else (x ->> 'base')::numeric end,
           nullif(x ->> 'regla_id', '')::uuid
    from jsonb_array_elements(v_nuevas) x
  ),
  lineas as (
    select q.*, coalesce(p.descuento, 0) as grupo, p.faltan,
           q.fijo + case when coalesce(p.descuento, 0) > 0 then coalesce(p.descuento, 0) else q.rebaja end as descuento
    from quedan q left join partes p on p.ref = q.ref
  )
  select jsonb_build_object(
           'total', round(coalesce(sum((l.precio_unitario - l.descuento) * l.cantidad), 0), 2),
           'ahorro_grupo', round(coalesce(sum(l.grupo * l.cantidad), 0), 2),
           'lineas', coalesce(jsonb_agg(jsonb_build_object('ref', l.ref, 'variante_id', l.variante_id, 'cantidad', l.cantidad,
                                                           'precio_unitario', l.precio_unitario, 'descuento_unitario', l.descuento,
                                                           'descuento_grupo_unitario', l.grupo, 'oferta_grupo_id', l.oferta_grupo_id,
                                                           'faltan', l.faltan, 'deja_rebaja', l.grupo > 0 and l.rebaja > 0) order by l.ref), '[]'::jsonb))
    into v_res
  from lineas l;

  return v_res || jsonb_build_object('saldo', round((v_res ->> 'total')::numeric - s.adelanto, 2));
end;
$function$;

comment on function retail.previsualizar_edicion_separacion(uuid, uuid[], jsonb) is
  'ADR-0655. Cómo quedaría un apartado al quitar y sumar prendas, sin guardar nada: el total, el saldo y lo que ahorra cada prenda con las ofertas de grupo (el trato guardado y la oferta de hoy para lo que se suma). Decisión 2: la que va con su grupo deja su rebaja (deja_rebaja). La hoja de editar manda ese total a editar_separacion_con_total.';

-- 8. La bolsa de la tienda web: qué rebaja deja cada prenda ---------------------------------------------------------------------------

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
    select pr.variante_id, pr.precio_lista, coalesce(pr.descuento, 0) as rebaja
    from retail.fn_tienda_precio_talla(array(select en.variante_id from entrada en), (select id from sede)) pr
    where pr.se_ofrece
  ),
  u as (
    select en.variante_id, p.precio_lista as precio, p.rebaja, k
    from entrada en join precios p on p.variante_id = en.variante_id
    cross join lateral generate_series(1, en.cantidad) k
  ),
  l as (select row_number() over (order by u.precio desc, u.variante_id, u.k)::integer as linea, u.* from u),
  g as (select * from retail.fn_ofertas_de_grupo(retail.fn_hoy_lima(), (select id from sede),
          (select coalesce(jsonb_agg(jsonb_build_object('variante_id', l.variante_id, 'precio_unitario', l.precio, 'cantidad', 1) order by l.linea), '[]'::jsonb) from l), 0)),
  por_variante as (
    select l.variante_id, sum(g.descuento) as ahorro, max(g.faltan) as faltan, (array_agg(g.regla_id))[1] as regla_id,
           (array_agg(g.etiqueta_nombre))[1] as campana,
           -- Decisión 2 (Felipe 2026-11-14): la rebaja que dejan las prendas que van con su grupo (nunca las dos; tienda_separar la saca).
           sum(case when g.descuento > 0 then l.rebaja else 0 end) as deja_rebaja
    from l join g on g.linea = l.linea group by l.variante_id
  ),
  -- Lo que ya suman las prendas que cuentan para cada monto.
  base_monto as (
    select g.regla_id, sum(l.precio) as base from l join g on g.linea = l.linea group by g.regla_id
  )
  select jsonb_build_object(
    'ahorro', coalesce((select sum(pv.ahorro) from por_variante pv), 0),
    'deja_rebaja', coalesce((select sum(pv.deja_rebaja) from por_variante pv), 0),
    'lineas', coalesce((
      select jsonb_object_agg(pv.variante_id::text, jsonb_build_object(
               'ahorro', pv.ahorro, 'faltan', pv.faltan, 'campana', pv.campana, 'deja_rebaja', pv.deja_rebaja,
               'tipo', r.tipo, 'lleva', r.lleva, 'paga', r.paga, 'monto', r.monto, 'porcentaje', r.porcentaje)
             || case when r.tipo = 'monto'
                     then jsonb_build_object('escalones', r.escalones, 'ahorro_en', r.ahorro_en, 'cuenta', r.cuenta,
                                             'base', (select b.base from base_monto b where b.regla_id = pv.regla_id))
                     else '{}'::jsonb end)
      from por_variante pv join retail.campana_reglas r on r.id = pv.regla_id), '{}'::jsonb))
$function$;

-- 9. Los reemplazos anclados ---------------------------------------------------------------------------------------------------------

create or replace function pg_temp.reemplazar_dos_ofertas(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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

-- 9a. registrar_venta: la línea que va con su grupo deja su rebaja.
select pg_temp.reemplazar_dos_ofertas(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_venta'),
  $rv$    v_c_unit := case when v_c_pct is null then 0
                     else retail.fn_descuento_campana((v_item ->> 'precio_unitario')::numeric, v_c_pct) end;
$rv$,
  $rn$    v_c_unit := case when v_c_pct is null then 0
                     else retail.fn_descuento_campana((v_item ->> 'precio_unitario')::numeric, v_c_pct) end;
    -- ADR-0655 (decisión 2 de Felipe, 2026-11-14): una prenda que va con su oferta de grupo deja su rebaja, nunca las dos (LA regla eligió
    -- la que más le ahorra al cliente en este ticket). Su rebaja no se exige ni se acepta; un descuento a mano sí se suma a su parte.
    if v_grupo > 0 then
      if v_motivo = 'campana' then
        raise exception 'venta_dos_ofertas'
          using detail = v_referencia || ' (' || v_sku || ')',
                hint = 'Esta prenda va con su oferta de grupo: su rebaja no se suma. Vuelve a abrir el cobro.';
      end if;
      v_c_id := null;
      v_c_nombre := null;
      v_c_pct := null;
      v_c_unit := 0;
    end if;
$rn$,
  1);

-- 9b. separar_prendas: el total sin la rebaja de las prendas que van con su grupo.
select pg_temp.reemplazar_dos_ofertas(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'separar_prendas'),
  $v$  end loop;

  if p_comprobante_tipo = 'boleta' and v_total > c_tope_boleta_sin_dni and v_dni is null then$v$,
  $n$  end loop;

  -- ADR-0655 (decisión 2 de Felipe, 2026-11-14): una prenda que va con su oferta de grupo deja su rebaja, nunca las dos (LA regla elige la
  -- que más le ahorra a la clienta). Arriba se restó la rebaja de cada prenda con campaña: la de las que van con su grupo vuelve al total
  -- (fn_regrupar_separacion la saca de su fila). Un descuento a mano no vuelve: se suma a la parte del grupo.
  if v_grupos <> '{}'::jsonb then
    v_total := v_total + coalesce((
      with u as (
        select (o.e ->> 'variante_id')::uuid as variante_id, retail.fn_precio_en_sede((o.e ->> 'variante_id')::uuid, p_ubicacion_id) as precio
        from jsonb_array_elements(p_items) o(e)
        cross join lateral generate_series(1, least(greatest(coalesce((o.e ->> 'cantidad')::integer, 0), 0), 10))
        where nullif(o.e ->> 'variante_id', '') is not null
      ),
      l as (select row_number() over (order by u.precio desc, u.variante_id)::integer as linea, u.* from u where u.precio is not null),
      g as (select * from retail.fn_ofertas_de_grupo(v_hoy, p_ubicacion_id,
              (select coalesce(jsonb_agg(jsonb_build_object('variante_id', l.variante_id, 'precio_unitario', l.precio, 'cantidad', 1) order by l.linea), '[]'::jsonb) from l), 0)),
      c as (
        select x.variante_id, max(x.descuento_pct) as pct
        from retail.fn_campanas_en_sede(v_hoy, 0, (select array_agg(distinct l.variante_id) from l), p_ubicacion_id) x
        where coalesce(x.descuento_pct, 0) > 0
        group by x.variante_id
      )
      select sum(retail.fn_descuento_campana(l.precio, c.pct))
      from l
      join g on g.linea = l.linea
      join c on c.variante_id = l.variante_id
      where g.descuento > 0 and not (v_manuales ? l.variante_id::text)
    ), 0);
  end if;

  if p_comprobante_tipo = 'boleta' and v_total > c_tope_boleta_sin_dni and v_dni is null then$n$,
  1);

-- 9c. crear_pedido_web: la prenda que va con su grupo lleva solo su parte (tienda_separar le suma la parte a su rebaja).
select pg_temp.reemplazar_dos_ofertas(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'crear_pedido_web'),
  $v$    -- ADR-0655: la parte de una oferta de grupo está dentro del descuento, no pide campaña y sí su oferta.
$v$,
  $n$    -- ADR-0655 (decisión 2 de Felipe, 2026-11-14): una prenda que va con su oferta de grupo deja su rebaja, nunca las dos (LA regla eligió
    -- la que más le ahorra a la clienta en su bolsa): su descuento es solo su parte del grupo.
    if v_grupo > 0 and v_grupo <= v_descuento and v_etiqueta is not null then
      v_descuento := v_grupo;
      v_etiqueta := null;
    end if;
    -- ADR-0655: la parte de una oferta de grupo está dentro del descuento, no pide campaña y sí su oferta.
$n$,
  1);

notify pgrst, 'reload schema';
