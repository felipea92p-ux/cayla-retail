-- ============================================================================
-- 20261114003000 — «Llevar varias y pagar menos»: el 3x2, «N por S/» y «la N.ª al X %» (ADR-0655, actividad 6, parte 1 de 4: la base)
--
-- EL PROBLEMA. Una oferta solo podía ser «un % menos» por prenda (`campana_reglas.tipo = 'pct'`). Felipe pidió habilitar «Llevar varias y
--   pagar menos» (maqueta `docs/maquetas/campanas-y-ofertas-2026-11/`): el descuento ya no depende de una prenda sino de cuántas lleva el
--   cliente, así que no cabe en `fn_campanas_en_sede` (una fila por prenda, un %).
--
-- LO QUE HACE (solo la base; la hoja, la caja y los apartados son las partes 2, 3 y 4, cada una con su PR).
--   1. Tres formas nuevas de oferta en `campana_reglas`:
--        · `nxm`          «lleva N, paga M» (3x2: lleva 3, paga 2): las N−M más baratas de cada grupo van gratis;
--        · `n_por_monto`  «N por S/ X» (3 por S/ 100): el grupo cuesta X (si sumaba más);
--        · `nesima_pct`   «la N.ª al X %» (la 2.ª al 50 %): la más barata del grupo lleva X % menos (con el redondeo de la caja, fn_descuento_campana).
--      Y con qué se arma el grupo (`agrupa`): con cualquier prenda que alcanza la oferta (`campana`) o solo con prendas del mismo modelo
--      (`modelo`). `porcentaje` queda vacío en las dos que no lo usan. Cada forma tiene su candado de valores.
--   2. `fn_ofertas_de_grupo(hoy, sede, líneas, tolerancia)`: LA regla, una sola, que arma los grupos de un ticket y reparte el ahorro entre
--      sus prendas. La usará la caja (para mostrar) y `registrar_venta` (para exigir y validar). Decisiones de Felipe (2026-11-13):
--        · varios grupos: se ordenan de la más cara a la más barata y se arman de a N; en cada grupo, lo de la forma (en el 3x2, la más
--          barata gratis). Empate de precio: el orden del ticket. Lo que no completa un grupo paga su precio (y la regla dice cuántas faltan);
--        · el ahorro de cada grupo se reparte entre sus prendas en proporción a su precio, en céntimos exactos (lo que sobra del redondeo va a
--          la de mayor resto): cada prenda queda con su parte y así va a SUNAT y a un cambio o devolución (decisión 7 de la maqueta: el
--          ejemplo 79.90 · 49.90 · 39.90 en 3x2 queda 61.11 · 38.17 · 30.52);
--        · una prenda tiene una sola oferta por tienda y por día (20261113223000): la regla toma la oferta de grupo que rige para cada
--          prenda, con las mismas fechas, días, tiendas, alcance y cesiones que la caja usa para el %.
--   3. `guardar_oferta_completa(...)`: guarda una oferta de cualquier forma (encima de `guardar_oferta_y_ceder`, en la misma transacción),
--      con la historia de su forma anterior.
--   4. `campana_reglas()` devuelve también la forma (`lleva`, `paga`, `monto`, `agrupa`).
--
-- QUÉ NO HACE TODAVÍA. La caja no cobra una oferta de grupo (parte 3): `fn_campanas_en_sede`, `registrar_venta`, la tienda web y los apartados
--   siguen leyendo solo las de `tipo = 'pct'` (todas filtran por tipo; revisado en producción el 2026-11-13). Hasta la parte 3, la hoja no
--   deja activar una oferta de grupo (parte 2): esta base la acepta, pero nadie la cobra.
--
-- DESCARTÉ: reusar `fn_club_repartir_vale` para el reparto: reparte por LÍNEA (con su cantidad) y, si las cantidades no dividen el monto,
--   deja céntimos sin repartir; aquí se reparte por PRENDA, y la suma es siempre exacta.
-- DESCARTÉ: guardar el resultado del reparto en una tabla: es una cuenta sobre el ticket; quien vende la pide y `registrar_venta` la vuelve a
--   hacer (una sola fuente de verdad).
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR (los cierra el esquema): una oferta de grupo sin su N, un 3x2 que paga más de lo que lleva, un «N por S/»
--   sin monto, un «% menos» con N.
--
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: `alter table campana_reglas` (columnas y candados; la tabla casi no se escribe
--   y no lleva políticas) y funciones. Va DESPUÉS de 20261113230000. Sin políticas ni disparadores nuevos (ADR-0195).
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:ofertas-de-grupo`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. La guarda -------------------------------------------------------------------------------------------------------------------------

do $$
begin
  if position('campana_regla_cesiones' in coalesce((select prosrc from pg_proc where oid = to_regprocedure('retail.campana_reglas()')), '')) = 0 then
    raise exception 'campana_reglas() no es la de 20261113223000: esta migración va después. No se aplicó nada.';
  end if;
  if to_regprocedure('retail.guardar_oferta_y_ceder(uuid, uuid, text, numeric, date, date, smallint[], uuid[], uuid[], boolean, uuid[], uuid[], uuid[], boolean)') is null then
    raise exception 'Falta guardar_oferta_y_ceder (20261113223000). No se aplicó nada.';
  end if;
end;
$$;

-- 1. Las formas de una oferta ----------------------------------------------------------------------------------------------------------

alter table retail.campana_reglas add column if not exists lleva smallint;
alter table retail.campana_reglas add column if not exists paga smallint;
alter table retail.campana_reglas add column if not exists monto numeric(10, 2);
alter table retail.campana_reglas add column if not exists agrupa text not null default 'campana';
alter table retail.campana_reglas alter column porcentaje drop not null;

comment on column retail.campana_reglas.lleva is 'ADR-0655. Cuántas prendas arman un grupo (3 en un 3x2, 3 en «3 por S/ 100», 2 en «la 2.ª al 50 %»). Solo en las ofertas de grupo.';
comment on column retail.campana_reglas.paga is 'ADR-0655. En «lleva N, paga M» (nxm), cuántas se pagan: las N−M más baratas de cada grupo van gratis.';
comment on column retail.campana_reglas.monto is 'ADR-0655. En «N por S/ X» (n_por_monto), lo que cuesta el grupo.';
comment on column retail.campana_reglas.agrupa is 'ADR-0655. Con qué se arma el grupo: «campana» (cualquier prenda que alcanza la oferta) o «modelo» (solo prendas del mismo modelo).';

do $$
begin
  alter table retail.campana_reglas drop constraint if exists campana_reglas_tipo;
  alter table retail.campana_reglas drop constraint if exists campana_reglas_porcentaje;
  if not exists (select 1 from pg_constraint where conrelid = 'retail.campana_reglas'::regclass and conname = 'campana_reglas_forma') then
    -- `coalesce(…, false)`: un CHECK deja pasar lo que da NULL, y un 3x2 sin su N daría NULL. El % de un 3x2 o de un «N por S/» no se mira:
    -- guardar_oferta_completa lo deja vacío al final, pero en el camino la función de siempre le escribe uno.
    alter table retail.campana_reglas add constraint campana_reglas_forma check (coalesce(
      case tipo
        when 'pct' then porcentaje > 0 and porcentaje <= 70 and lleva is null and paga is null and monto is null
        when 'nxm' then lleva between 2 and 10 and paga between 1 and lleva - 1 and monto is null
        when 'n_por_monto' then lleva between 2 and 10 and monto > 0 and paga is null
        when 'nesima_pct' then lleva between 2 and 10 and porcentaje > 0 and porcentaje <= 100 and paga is null and monto is null
        else false
      end, false)
    );
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'retail.campana_reglas'::regclass and conname = 'campana_reglas_agrupa') then
    alter table retail.campana_reglas add constraint campana_reglas_agrupa check (agrupa in ('campana', 'modelo'));
  end if;
end;
$$;

-- 2. LA regla de los grupos ------------------------------------------------------------------------------------------------------------

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
  -- Las ofertas de grupo que rigen hoy en esta tienda (las mismas condiciones que la caja usa para el %: fn_campanas_en_sede).
  vigentes as (
    select r.*, e.nombre as e_nombre
    from retail.campana_reglas r
    join retail.etiquetas e
      on e.id = r.etiqueta_id and e.estado = 'aprobado' and e.activo
     and (e.vigente_desde is null or e.vigente_desde <= p_hoy)
     and (e.vigente_hasta is null or e.vigente_hasta >= p_hoy - p_tolerancia_dias)
     and retail.fn_campana_rige_en_sede(e.id, p_ubicacion_id)
    where r.estado = 'activa' and r.tipo <> 'pct'
      and retail.fn_regla_rige_en(r.desde, r.hasta, r.dias_semana, p_hoy, p_tolerancia_dias)
      and (
        not exists (select 1 from retail.campana_regla_sedes rs where rs.regla_id = r.id)
        or (p_ubicacion_id is not null and exists (select 1 from retail.campana_regla_sedes rs where rs.regla_id = r.id and rs.ubicacion_id = p_ubicacion_id))
      )
  ),
  -- La oferta de grupo de cada prenda (una sola por prenda, tienda y día: el candado de 20261113223000), salvo que haya cedido donde la otra rige.
  con_oferta as (
    select u.*, o.id as regla_id, o.etiqueta_id, o.e_nombre, o.nombre as o_nombre, o.tipo, o.lleva, o.paga, o.monto, o.porcentaje,
           case when o.agrupa = 'modelo' then v.producto_id else '00000000-0000-0000-0000-000000000000'::uuid end as clave
    from unidades u
    join retail.variantes v on v.id = u.variante_id
    cross join lateral (
      select g.* from vigentes g
      where retail.fn_regla_alcanza_variante(g.id, u.variante_id)
        and not exists (
          select 1
          from retail.campana_regla_cesiones c
          join vigentes w on w.id = c.gana_regla_id
          where c.cede_regla_id = g.id and retail.fn_regla_alcanza_variante(w.id, u.variante_id)
        )
      order by g.creada_en, g.id
      limit 1
    ) o
  ),
  -- De la más cara a la más barata (empate: el orden del ticket), en grupos de N; solo los grupos completos ahorran.
  ordenadas as (
    select c.*, row_number() over w as rn, count(*) over (partition by c.regla_id, c.clave) as n_cubo
    from con_oferta c
    window w as (partition by c.regla_id, c.clave order by c.cent desc, c.linea, c.u)
  ),
  en_grupo as (
    select o.*, (o.rn - 1) / o.lleva as grupo, (o.rn - 1) % o.lleva + 1 as pos, o.rn <= (o.n_cubo / o.lleva) * o.lleva as completo
    from ordenadas o
  ),
  grupos as (
    select e.regla_id, e.clave, e.grupo, sum(e.cent) as total,
           case min(e.tipo)
             when 'nxm' then coalesce(sum(e.cent) filter (where e.pos > e.paga), 0)
             when 'n_por_monto' then greatest(sum(e.cent) - round(min(e.monto) * 100)::bigint, 0)
             when 'nesima_pct' then round(retail.fn_descuento_campana(min(e.cent)::numeric / 100, min(e.porcentaje)) * 100)::bigint
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
  -- Cuántas prendas le faltan al último grupo de cada oferta (0 si todos están completos).
  faltan_por_cubo as (
    select o.regla_id, o.clave, case when max(o.n_cubo) % max(o.lleva) = 0 then 0 else max(o.lleva) - max(o.n_cubo) % max(o.lleva) end as faltan
    from ordenadas o group by o.regla_id, o.clave
  )
  select l.linea, c.regla_id, c.etiqueta_id, c.e_nombre, c.o_nombre,
         round(coalesce(pl.cent, 0)::numeric / 100, 2) as descuento,
         f.faltan::integer
  from lineas l
  join lateral (select distinct on (x.linea) x.* from con_oferta x where x.linea = l.linea order by x.linea) c on true
  left join por_linea pl on pl.linea = l.linea
  join faltan_por_cubo f on f.regla_id = c.regla_id and f.clave = c.clave
  order by l.linea
$function$;

comment on function retail.fn_ofertas_de_grupo(date, uuid, jsonb, integer) is
  'ADR-0655. LA regla de «Llevar varias y pagar menos» (3x2, N por S/, la N.ª al X %): con las líneas de un ticket [{variante_id, precio_unitario, cantidad}], dice para cada línea con una oferta de grupo cuál es, cuánto ahorra la línea (su parte del ahorro de sus grupos, en proporción al precio, en céntimos exactos) y cuántas prendas le faltan al último grupo. Grupos de la más cara a la más barata (Felipe 2026-11-13). Las líneas sin oferta de grupo no salen.';

revoke all on function retail.fn_ofertas_de_grupo(date, uuid, jsonb, integer) from public, anon;
grant execute on function retail.fn_ofertas_de_grupo(date, uuid, jsonb, integer) to authenticated;

-- 3. Guardar una oferta de cualquier forma ----------------------------------------------------------------------------------------------

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
  v_antes jsonb;
  v_id uuid;
begin
  if v_tipo not in ('pct', 'nxm', 'n_por_monto', 'nesima_pct') then
    raise exception 'Esa forma de oferta no existe.' using hint = 'oferta_forma';
  end if;
  if v_agrupa not in ('campana', 'modelo') then
    raise exception 'El grupo se arma con prendas de la campaña o del mismo modelo.' using hint = 'oferta_forma';
  end if;
  if v_tipo = 'pct' then
    v_lleva := null; v_paga := null; v_monto := null;
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

  if p_regla_id is not null then
    select jsonb_build_object('tipo', tipo, 'lleva', lleva, 'paga', paga, 'monto', monto, 'agrupa', agrupa, 'porcentaje', porcentaje)
      into v_antes from retail.campana_reglas where id = p_regla_id;
  end if;

  -- Lo común (fechas, días, prendas, tiendas, cesiones, quién) lo guarda y lo exige la función de siempre. El % que pide es el de la oferta,
  -- o uno cualquiera válido que se reemplaza abajo, en la misma transacción, por la forma de verdad.
  v_id := retail.guardar_oferta_y_ceder(p_regla_id, p_etiqueta_id, p_nombre, case when v_tipo = 'pct' then v_pct else 10 end, p_desde, p_hasta,
    p_dias_semana, p_categorias_solo, p_categorias_fuera, p_incluye_claure, p_sede_ids, p_producto_ids, p_cede_regla_ids, p_activar);

  update retail.campana_reglas
     set tipo = v_tipo, porcentaje = v_pct, lleva = v_lleva, paga = v_paga, monto = v_monto, agrupa = v_agrupa
   where id = v_id;

  -- La historia (solo se agrega) guarda la forma de antes cuando cambió.
  if v_antes is not null
     and v_antes is distinct from jsonb_build_object('tipo', v_tipo, 'lleva', v_lleva, 'paga', v_paga, 'monto', v_monto, 'agrupa', v_agrupa, 'porcentaje', v_pct) then
    insert into retail.campana_regla_historial (regla_id, antes, por) values (v_id, jsonb_build_object('forma', v_antes), retail.fn_actor_persona_id(true));
  end if;
  return v_id;
end;
$function$;

comment on function retail.guardar_oferta_completa(uuid, uuid, text, jsonb, date, date, smallint[], uuid[], uuid[], boolean, uuid[], uuid[], uuid[], boolean) is
  'ADR-0655. Guarda una oferta de cualquier forma: p_forma = {tipo: pct|nxm|n_por_monto|nesima_pct, porcentaje, lleva, paga, monto, agrupa: campana|modelo}. Lo común lo exige guardar_oferta_y_ceder, en la misma transacción.';

revoke all on function retail.guardar_oferta_completa(uuid, uuid, text, jsonb, date, date, smallint[], uuid[], uuid[], boolean, uuid[], uuid[], uuid[], boolean) from public, anon;
grant execute on function retail.guardar_oferta_completa(uuid, uuid, text, jsonb, date, date, smallint[], uuid[], uuid[], boolean, uuid[], uuid[], uuid[], boolean) to authenticated;

-- 4. La pantalla: la forma de cada oferta ----------------------------------------------------------------------------------------------

drop function if exists retail.campana_reglas();
create function retail.campana_reglas()
returns table (
  id uuid, etiqueta_id uuid, nombre text, tipo text, porcentaje numeric, desde date, hasta date, dias_semana smallint[],
  incluye_claure boolean, estado text, categorias_solo uuid[], categorias_fuera uuid[], sedes uuid[],
  creada_por uuid, creada_en timestamptz, activada_por uuid, activada_en timestamptz, cambios integer, ultimo_cambio jsonb,
  productos_solo uuid[], ceden uuid[], lleva smallint, paga smallint, monto numeric, agrupa text
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
         r.lleva, r.paga, r.monto, r.agrupa
  from retail.campana_reglas r
  -- Las lee quien tiene la llave de las campañas; sin ella, nada.
  where retail.fn_puede_campanas()
  order by r.creada_en desc, r.id
$function$;

comment on function retail.campana_reglas() is
  'Las ofertas de todas las campañas, con sus categorías, sus modelos elegidos (productos_solo), las que le ceden (ceden), su forma (tipo, porcentaje, lleva, paga, monto, agrupa; ADR-0655), cuántas veces cambiaron y cómo estaban antes del último cambio. Las lee quien tiene la llave de las campañas (fn_puede_campanas); sin ella, ninguna fila.';

revoke all on function retail.campana_reglas() from public, anon;
grant execute on function retail.campana_reglas() to authenticated;
