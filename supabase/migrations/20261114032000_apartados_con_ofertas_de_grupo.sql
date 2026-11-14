-- ============================================================================
-- 20261114032000 — Los apartados con «Llevar varias y pagar menos» (ADR-0655, actividad 6, parte 4 de 4: los apartados)
--
-- EL PROBLEMA. La caja ya cobra el 3x2 (20261114011000), pero un apartado solo conocía el «% menos» por prenda: tres polos de un 3x2 se
--   apartaban a precio completo. Felipe (2026-11-13): «si una clienta separa una oferta antes que termine, esos productos ya quedaron
--   separados así como está en ese día». Y al editar un apartado con un 3x2 adentro (quitar o sumar), Felipe pidió la mejor alternativa.
--
-- LA REGLA (ADR-0655, «Parte 4»). Cada prenda entra al apartado con la oferta de SU día, y los grupos se arman con el trato que el
--   apartado guardó:
--   · al apartar, el apartado guarda el trato de cada oferta de grupo de ese día (`separacion_ofertas_grupo`: la forma y el nombre) y cada
--     prenda de la oferta va en su fila (cantidad 1, con su apartado de stock) con `oferta_grupo_id` y su parte del ahorro;
--   · al QUITAR una prenda, los grupos de esa oferta se vuelven a armar con lo que queda y el trato guardado: de tres polos de un 3x2
--     quedan dos y pagan completo (ya no son tres); de cuatro quedan tres y el 3x2 sigue (lo que hacen las cuentas abiertas de NCR y
--     Dynamics 365: recalcular la promoción, con el precio prometido congelado);
--   · al SUMAR, la prenda nueva toma la oferta que rige HOY para ella: si es la misma que ya está en el apartado, se junta con el trato
--     guardado y puede completar el grupo; si la oferta ya terminó, entra a su precio de hoy, sin grupo;
--   · la hoja de editar muestra el total nuevo antes de confirmar (`previsualizar_edicion_separacion`) y guarda con
--     `editar_separacion_con_total`, que no guarda si el total cambió entre medio (`separacion_total_cambio`).
--
-- LO QUE HACE.
--   1. `separacion_ofertas_grupo` (el trato de ese día) y, en `separacion_items` (y su archivo `separacion_items_retirados`),
--      `descuento_grupo_unitario` (DENTRO de `descuento_unitario`, como en la venta) y `oferta_grupo_id`, con sus candados: la parte del
--      grupo no pasa el descuento, lleva su oferta, la oferta tiene su trato guardado y una fila con oferta es de UNA prenda.
--   2. `fn_repartir_grupos(unidades)`: LA cuenta de los grupos (de la más cara, de a N, el ahorro repartido en proporción al precio en
--      céntimos exactos), ahora sola y pura. `fn_ofertas_de_grupo` (la caja) la usa sin cambiar lo que responde; los apartados también:
--      una sola cuenta para el ticket, el apartado y su edición.
--   3. `fn_grupos_de_separacion` / `fn_regrupar_separacion`: los grupos de un apartado con su trato guardado, y su parte en cada fila.
--   4. `separar_prendas`: arma los grupos con LA regla de hoy, exige que la pantalla mande la parte de cada prenda
--      (`separacion_grupo_no_coincide`) y guarda el trato y las filas de a una.
--   5. `editar_separacion`: la prenda que se suma toma la oferta de hoy y los grupos se vuelven a armar (su firma no cambia: la nombra
--      20261013201000, que sus pruebas vuelven a pegar). `previsualizar_edicion_separacion` y `editar_separacion_con_total` (que exige
--      el total que se vio) son las dos nuevas de la hoja.
--   6. `entregar_separacion`: la venta lleva la parte del grupo de cada prenda, sin motivo (como la caja), y el comprobante sale con lo que
--      se pagó por cada una.
--   7. `buscar_separaciones` devuelve la parte del grupo y su trato, para que las pantallas digan «3 x 2 · Verano».
--
-- QUÉ NO HACE. La tienda web (`tienda_separar`) sigue sin grupos: es la actividad 7. `separar_prendas_online` y
--   `separar_pedido_para_apartar` llaman a `separar_prendas` y heredan la regla.
--
-- DESCARTÉ:
--   · «una prenda de un grupo no se quita sola»: obliga a liberar el apartado entero (y devolver el adelanto) por una prenda;
--   · «las que quedan conservan su parte» (como una devolución): deja un 3x2 de dos prendas; bastaría apartar tres y quitar una. En un
--     apartado la venta todavía no se cerró;
--   · «la que se suma va en un apartado nuevo»: choca con el tope de 3 apartados abiertos por cliente (20261016003000);
--   · «todo el apartado con la oferta de hoy»: rompe lo que Felipe decidió (lo apartado queda como estaba ese día);
--   · correr la edición en seco para la vista previa: `fn_actor_persona_id(true)` exige el responsable antes de que la hoja lo pida.
--
-- SE ROMPE SI: alguien cambia las líneas ancladas de las cuatro funciones antes de pegar esto (los reemplazos se detienen sin tocar nada);
--   o si `fn_ofertas_de_grupo` y `fn_repartir_grupos` dejan de responder lo mismo que antes del corte (`pnpm pruebas:ofertas-de-grupo`).
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: una tabla nueva sin políticas (RLS encendido: solo la leen funciones
--   `security definer`), `alter table` de dos tablas de apartados (columnas y candados, sin políticas) y funciones. Va DESPUÉS de
--   20261114011000.
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:apartados-ofertas-de-grupo`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('retail.fn_ofertas_de_grupo(date, uuid, jsonb, integer)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'venta_items' and column_name = 'descuento_grupo_unitario') then
    raise exception 'Faltan 20261114003000 y 20261114011000: esta migración va después. No se aplicó nada.';
  end if;
end;
$$;

-- 1. El trato de ese día y la parte del grupo en cada prenda apartada ----------------------------------------------------------------

create table if not exists retail.separacion_ofertas_grupo (
  separacion_id uuid not null references retail.separaciones (id),
  regla_id uuid not null references retail.campana_reglas (id),
  etiqueta_id uuid not null references retail.etiquetas (id),
  nombre text not null,
  etiqueta_nombre text not null,
  tipo text not null check (tipo in ('nxm', 'n_por_monto', 'nesima_pct')),
  lleva smallint not null check (lleva >= 2),
  paga smallint,
  monto numeric(10, 2),
  porcentaje numeric(5, 2),
  agrupa text not null check (agrupa in ('campana', 'modelo')),
  guardada_en timestamptz not null default now(),
  primary key (separacion_id, regla_id)
);

comment on table retail.separacion_ofertas_grupo is
  'ADR-0655. El trato de cada oferta de grupo (3x2, N por S/, la N.ª al X %) tal como era el día en que entró al apartado: los grupos del apartado se arman con esto, aunque la oferta cambie o termine después.';

alter table retail.separacion_ofertas_grupo enable row level security;
revoke all on table retail.separacion_ofertas_grupo from public, anon, authenticated;

alter table retail.separacion_items add column if not exists descuento_grupo_unitario numeric(10, 2) not null default 0;
alter table retail.separacion_items add column if not exists oferta_grupo_id uuid;
alter table retail.separacion_items_retirados add column if not exists descuento_grupo_unitario numeric(10, 2) not null default 0;
alter table retail.separacion_items_retirados add column if not exists oferta_grupo_id uuid references retail.campana_reglas (id);

comment on column retail.separacion_items.descuento_grupo_unitario is
  'ADR-0655. La parte del ahorro de su oferta de grupo que le toca a esta prenda. Está DENTRO de descuento_unitario (como en venta_items): precio_unitario − descuento_unitario es lo que se paga.';
comment on column retail.separacion_items.oferta_grupo_id is
  'ADR-0655. La oferta de grupo con la que la prenda entró al apartado (su trato, en separacion_ofertas_grupo). Una fila con oferta es de una sola prenda.';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'retail.separacion_items'::regclass and conname = 'separacion_items_oferta_guardada') then
    alter table retail.separacion_items add constraint separacion_items_oferta_guardada
      foreign key (separacion_id, oferta_grupo_id) references retail.separacion_ofertas_grupo (separacion_id, regla_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'retail.separacion_items'::regclass and conname = 'separacion_items_grupo_dentro_del_descuento') then
    alter table retail.separacion_items add constraint separacion_items_grupo_dentro_del_descuento
      check (descuento_grupo_unitario >= 0 and descuento_grupo_unitario <= descuento_unitario);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'retail.separacion_items'::regclass and conname = 'separacion_items_grupo_con_oferta') then
    alter table retail.separacion_items add constraint separacion_items_grupo_con_oferta
      check (descuento_grupo_unitario = 0 or oferta_grupo_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'retail.separacion_items'::regclass and conname = 'separacion_items_grupo_de_a_una') then
    alter table retail.separacion_items add constraint separacion_items_grupo_de_a_una
      check (oferta_grupo_id is null or cantidad = 1);
  end if;
  -- Un descuento dice de dónde viene (campaña o motivo a mano); la parte de la oferta de grupo viene de su oferta y no cuenta ahí.
  if position('descuento_grupo_unitario' in coalesce((select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'retail.separacion_items'::regclass and conname = 'separacion_items_descuento_con_origen'), '')) = 0 then
    alter table retail.separacion_items drop constraint if exists separacion_items_descuento_con_origen;
    alter table retail.separacion_items add constraint separacion_items_descuento_con_origen check (
      ((descuento_unitario - descuento_grupo_unitario > 0) = (descuento_etiqueta_id is not null or motivo_descuento is not null))
      and not (descuento_etiqueta_id is not null and motivo_descuento is not null)
    );
  end if;
end;
$$;

-- 2. LA cuenta de los grupos, sola y pura -------------------------------------------------------------------------------------------

create or replace function retail.fn_repartir_grupos(p_unidades jsonb)
returns table (linea integer, regla_id uuid, descuento numeric, faltan integer)
language sql
stable
set search_path to 'retail', 'public'
as $function$
  with
  -- Cada prenda, ya con su oferta y su trato: [{linea, cent, regla_id, clave, tipo, lleva, paga, monto, porcentaje}], en su orden.
  con_oferta as (
    select (o.x ->> 'linea')::integer as linea, o.n as u, (o.x ->> 'cent')::bigint as cent, (o.x ->> 'regla_id')::uuid as regla_id,
           (o.x ->> 'clave')::uuid as clave, o.x ->> 'tipo' as tipo, (o.x ->> 'lleva')::integer as lleva, (o.x ->> 'paga')::integer as paga,
           (o.x ->> 'monto')::numeric as monto, (o.x ->> 'porcentaje')::numeric as porcentaje
    from jsonb_array_elements(coalesce(p_unidades, '[]'::jsonb)) with ordinality o(x, n)
  ),
  -- De la más cara a la más barata (empate: el orden en que llegaron), en grupos de N; solo los grupos completos ahorran.
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
  select l.linea, l.regla_id, round(coalesce(pl.cent, 0)::numeric / 100, 2) as descuento, f.faltan::integer
  from (select distinct on (c.linea) c.linea, c.regla_id, c.clave from con_oferta c order by c.linea, c.u) l
  left join por_linea pl on pl.linea = l.linea
  join faltan_por_cubo f on f.regla_id = l.regla_id and f.clave = l.clave
  order by l.linea
$function$;

comment on function retail.fn_repartir_grupos(jsonb) is
  'ADR-0655. LA cuenta de «Llevar varias y pagar menos», sin leer ninguna tabla: con cada prenda ya ligada a su oferta y su trato, arma los grupos de la más cara a la más barata y reparte el ahorro de cada grupo en proporción al precio, en céntimos exactos. La usan fn_ofertas_de_grupo (la caja, con las ofertas de hoy) y fn_grupos_de_separacion (un apartado, con el trato que guardó).';

revoke all on function retail.fn_repartir_grupos(jsonb) from public, anon, authenticated;

-- La caja sigue respondiendo lo mismo: arma las prendas con su oferta de hoy y le pasa la cuenta a fn_repartir_grupos.
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
  -- LA cuenta (ADR-0655, parte 4): la misma para la caja y para los apartados.
  repartido as (
    select r.* from retail.fn_repartir_grupos((
      select coalesce(jsonb_agg(jsonb_build_object('linea', c.linea, 'cent', c.cent, 'regla_id', c.regla_id, 'clave', c.clave, 'tipo', c.tipo,
                                                   'lleva', c.lleva, 'paga', c.paga, 'monto', c.monto, 'porcentaje', c.porcentaje)
                                order by c.linea, c.u), '[]'::jsonb)
      from con_oferta c)) r
  )
  select l.linea, c.regla_id, c.etiqueta_id, c.e_nombre, c.o_nombre, r.descuento, r.faltan
  from lineas l
  join lateral (select distinct on (x.linea) x.* from con_oferta x where x.linea = l.linea order by x.linea) c on true
  join repartido r on r.linea = l.linea
  order by l.linea
$function$;

-- 3. Los grupos de un apartado, con el trato que guardó ---------------------------------------------------------------------------

create or replace function retail.fn_guardar_ofertas_de_separacion(p_separacion_id uuid, p_reglas uuid[])
returns void
language sql
volatile
security definer
set search_path to 'retail', 'public'
as $function$
  -- La primera vez que una oferta entra al apartado se guarda su trato; después no se toca (el apartado vive con el trato de su día).
  insert into retail.separacion_ofertas_grupo (separacion_id, regla_id, etiqueta_id, nombre, etiqueta_nombre, tipo, lleva, paga, monto, porcentaje, agrupa)
  select p_separacion_id, r.id, r.etiqueta_id, r.nombre, e.nombre, r.tipo, r.lleva, r.paga, r.monto, r.porcentaje, r.agrupa
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
  -- Las prendas del apartado que van en una oferta de grupo (sin las que se quitan) y las que se suman ([{ref, variante_id,
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
           f.tipo, f.lleva, f.paga, f.monto, f.porcentaje
    from unidades u
    join retail.variantes v on v.id = u.variante_id
    join lateral (
      select g.tipo, g.lleva, g.paga, g.monto, g.porcentaje, g.agrupa
        from retail.separacion_ofertas_grupo g where g.separacion_id = p_separacion_id and g.regla_id = u.regla_id
      union all
      select r.tipo, r.lleva, r.paga, r.monto, r.porcentaje, r.agrupa
        from retail.campana_reglas r
       where r.id = u.regla_id and r.tipo <> 'pct'
         and not exists (select 1 from retail.separacion_ofertas_grupo g where g.separacion_id = p_separacion_id and g.regla_id = u.regla_id)
    ) f on true
  ),
  repartido as (
    select r.* from retail.fn_repartir_grupos((
      select coalesce(jsonb_agg(jsonb_build_object('linea', c.linea, 'cent', c.cent, 'regla_id', c.regla_id, 'clave', c.clave, 'tipo', c.tipo,
                                                   'lleva', c.lleva, 'paga', c.paga, 'monto', c.monto, 'porcentaje', c.porcentaje)
                                order by c.linea), '[]'::jsonb)
      from con_forma c)) r
  )
  select c.ref, c.regla_id, r.descuento, r.faltan
  from con_forma c join repartido r on r.linea = c.linea
  order by c.linea
$function$;

comment on function retail.fn_grupos_de_separacion(uuid, uuid[], jsonb) is
  'ADR-0655. Los grupos de un apartado con el trato que guardó (separacion_ofertas_grupo): para cada prenda que va en una oferta de grupo, su parte del ahorro y cuántas le faltan a su grupo. Con p_quitar y p_nuevas responde cómo quedaría una edición, sin escribir nada.';

revoke all on function retail.fn_grupos_de_separacion(uuid, uuid[], jsonb) from public, anon, authenticated;

create or replace function retail.fn_regrupar_separacion(p_separacion_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path to 'retail', 'public'
as $function$
declare
  r record;
begin
  for r in
    select si.id, si.precio_unitario, si.descuento_unitario - si.descuento_grupo_unitario as base, si.descuento_grupo_unitario as antes,
           g.descuento, p.referencia || ' (' || coalesce(v.codigo, v.sku, 'sin código') || ')' as prenda
    from retail.fn_grupos_de_separacion(p_separacion_id) g
    join retail.separacion_items si on si.id = g.ref::uuid
    join retail.variantes v on v.id = si.variante_id
    join retail.productos p on p.id = v.producto_id
  loop
    if r.base + r.descuento >= r.precio_unitario then
      raise exception 'El descuento a mano de % más su oferta la dejan en cero: baja el descuento a mano.', r.prenda
        using errcode = 'P0001', hint = 'separacion_descuento_supera_precio', detail = r.prenda;
    end if;
    if r.antes is distinct from r.descuento then
      update retail.separacion_items set descuento_grupo_unitario = r.descuento, descuento_unitario = r.base + r.descuento where id = r.id;
    end if;
  end loop;
end;
$function$;

comment on function retail.fn_regrupar_separacion(uuid) is
  'ADR-0655. Deja en cada prenda de un apartado su parte del ahorro de su oferta de grupo, con el trato guardado (fn_grupos_de_separacion). La llaman separar_prendas al apartar y editar_separacion después de quitar o sumar.';

revoke all on function retail.fn_regrupar_separacion(uuid) from public, anon, authenticated;

-- 4. Los reemplazos anclados ---------------------------------------------------------------------------------------------------------

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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

-- 4a. separar_prendas: los grupos con LA regla de hoy, la parte que mandó la pantalla, el trato y las filas de a una.

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'separar_prendas'),
  $v$  v_ya integer;
begin$v$,
  $n$  v_ya integer;
  v_grupos jsonb := '{}'::jsonb;  -- ADR-0655: {variante_id: {t: su parte de las ofertas de grupo, r: la oferta}}
  v_g numeric;
  v_g_total numeric := 0;
begin$n$,
  1);

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'separar_prendas'),
  $v$  -- Las prendas: se agrupan por variante (escanear dos veces la misma suma cantidad) y el precio se$v$,
  $n$  -- ADR-0655: las ofertas de grupo (3x2, N por S/, la N.ª al X %) con LA regla de hoy, de a una prenda, de la más cara (empate: por
  -- prenda, como la pantalla): lo que ahorra cada prenda. Lo que se aparta queda con el trato de hoy (Felipe 2026-11-13). Más de 10 de una
  -- prenda no se cuenta: el tope de 2 por prenda la rechaza más abajo.
  v_grupos := (
    with u as (
      select (o.e ->> 'variante_id')::uuid as variante_id, retail.fn_precio_en_sede((o.e ->> 'variante_id')::uuid, p_ubicacion_id) as precio
      from jsonb_array_elements(p_items) o(e)
      cross join lateral generate_series(1, least(greatest(coalesce((o.e ->> 'cantidad')::integer, 0), 0), 10))
      where nullif(o.e ->> 'variante_id', '') is not null
    ),
    l as (select row_number() over (order by u.precio desc, u.variante_id)::integer as linea, u.* from u where u.precio is not null),
    g as (select * from retail.fn_ofertas_de_grupo(v_hoy, p_ubicacion_id,
            (select coalesce(jsonb_agg(jsonb_build_object('variante_id', l.variante_id, 'precio_unitario', l.precio, 'cantidad', 1) order by l.linea), '[]'::jsonb) from l), 0))
    select coalesce(jsonb_object_agg(x.variante_id, jsonb_build_object('t', x.t, 'r', x.r)), '{}'::jsonb)
    from (select l.variante_id::text as variante_id, sum(g.descuento) as t, (array_agg(g.regla_id))[1] as r
            from l join g on g.linea = l.linea group by l.variante_id) x
  );

  -- Las prendas: se agrupan por variante (escanear dos veces la misma suma cantidad) y el precio se$n$,
  1);

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'separar_prendas'),
  $v$           max((e ->> 'precio_unitario')::numeric) as precio_unitario,
           max(coalesce((e ->> 'descuento_unitario')::numeric, 0)) as descuento_unitario,$v$,
  $n$           max((e ->> 'precio_unitario')::numeric) as precio_unitario,
           sum(coalesce((e ->> 'descuento_grupo')::numeric, 0)) as descuento_grupo,  -- ADR-0655: la parte de la oferta de grupo, de la línea
           max(coalesce((e ->> 'descuento_unitario')::numeric, 0)) as descuento_unitario,$n$,
  1);

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'separar_prendas'),
  $v$    v_total := v_total + (v_precio - v_c_unit) * v_item.cantidad;
    end if;
  end loop;$v$,
  $n$    v_total := v_total + (v_precio - v_c_unit) * v_item.cantidad;
    end if;
    -- ADR-0655: la parte de la oferta de grupo que mostró la pantalla tiene que ser la de LA regla (si no, la clienta vio otro total).
    v_g := coalesce((v_grupos -> v_item.variante_id::text ->> 't')::numeric, 0);
    if abs(round(v_item.descuento_grupo, 2) - v_g) > 0.005 then
      raise exception 'separacion_grupo_no_coincide'
        using detail = v_ref || ' (' || v_sku || ')',
              hint = format('Su oferta de hoy le da S/%s y la pantalla mandó S/%s. Vuelve a abrir el apartado.', v_g, round(v_item.descuento_grupo, 2));
    end if;
    v_total := v_total - v_g;
    v_g_total := v_g_total + v_g;
  end loop;$n$,
  1);

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'separar_prendas'),
  $v$  loop
    v_apartado := apartar_stock(v_item.variante_id, p_ubicacion_id, v_item.cantidad,$v$,
  $n$  loop
    -- ADR-0655: una prenda de una oferta de grupo se aparta de a una (su fila y su apartado), con su oferta y el trato de hoy; su parte
    -- del ahorro la pone fn_regrupar_separacion, abajo.
    if v_grupos ? v_item.variante_id::text then
      perform retail.fn_guardar_ofertas_de_separacion(v_id, array[(v_grupos -> v_item.variante_id::text ->> 'r')::uuid]);
      select retail.fn_precio_en_sede(v.id, p_ubicacion_id) into v_precio from variantes v where v.id = v_item.variante_id;
      v_c_etq := null; v_c_pct := null;
      select c.etiqueta_id, c.descuento_pct into v_c_etq, v_c_pct
        from fn_campanas_en_sede(v_hoy, 0, array[v_item.variante_id], p_ubicacion_id) c
       order by c.descuento_pct desc, c.etiqueta_nombre, c.etiqueta_id
       limit 1;
      v_desc := case when v_manuales ? v_item.variante_id::text then (v_manuales -> v_item.variante_id::text ->> 'd')::numeric
                     when v_c_pct is null then 0 else retail.fn_descuento_campana(v_precio, v_c_pct) end;
      for v_unidad in 1 .. v_item.cantidad loop
        v_apartado := apartar_stock(v_item.variante_id, p_ubicacion_id, 1,
                                    v_nombres || ' ' || v_apellidos, coalesce(v_celular, 'DNI ' || v_dni, 'sin celular'), v_vence,
                                    'Apartado ' || v_codigo, null::uuid);
        update apartados set separacion_id = v_id where id = v_apartado;
        insert into separacion_items (separacion_id, variante_id, cantidad, precio_unitario, descuento_unitario, descuento_etiqueta_id, apartado_id,
                                      motivo_descuento, motivo_descuento_detalle, argumento_descuento, oferta_grupo_id)
          values (v_id, v_item.variante_id, 1, v_precio, v_desc,
                  case when v_desc > 0 and not (v_manuales ? v_item.variante_id::text) then v_c_etq end, v_apartado,
                  v_manuales -> v_item.variante_id::text ->> 'm', v_manuales -> v_item.variante_id::text ->> 'o',
                  v_manuales -> v_item.variante_id::text ->> 'a', (v_grupos -> v_item.variante_id::text ->> 'r')::uuid);
      end loop;
      continue;
    end if;
    v_apartado := apartar_stock(v_item.variante_id, p_ubicacion_id, v_item.cantidad,$n$,
  1);

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'separar_prendas'),
  $v$  -- El adelanto. Solo el efectivo entra al cajón (ingreso de caja, que `cerrar_caja` ya suma).$v$,
  $n$  -- ADR-0655: cada prenda de una oferta de grupo, con su parte del ahorro (la misma cuenta que al editar el apartado). Tiene que dar
  -- lo que se cobró arriba; si no, no se guarda nada.
  if v_grupos <> '{}'::jsonb then
    perform retail.fn_regrupar_separacion(v_id);
    if abs((select coalesce(sum(si.descuento_grupo_unitario * si.cantidad), 0) from separacion_items si where si.separacion_id = v_id) - v_g_total) > 0.005 then
      raise exception 'El ahorro de las ofertas de grupo no cuadra al guardarlo (se esperaba S/%). No se apartó nada.', v_g_total;
    end if;
  end if;

  -- El adelanto. Solo el efectivo entra al cajón (ingreso de caja, que `cerrar_caja` ya suma).$n$,
  1);

-- 4b. editar_separacion: la oferta de hoy para lo que se suma y los grupos armados de nuevo. (Su firma no cambia: 20261013201000 la nombra
-- con sus cuatro parámetros y sus pruebas la vuelven a pegar. El total esperado lo exige editar_separacion_con_total, en el punto 5.)

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'editar_separacion'),
  $v$  v_manual boolean;  -- ADR-0584: la prenda que entra trae un descuento a mano, ya exigido
begin$v$,
  $n$  v_manual boolean;  -- ADR-0584: la prenda que entra trae un descuento a mano, ya exigido
  v_reglas jsonb := '{}'::jsonb;  -- ADR-0655: {variante_id: la oferta de grupo que hoy rige para la prenda que se suma}
  v_base numeric;
begin$n$,
  1);

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'editar_separacion'),
  $v$  for v_item in
    select (e ->> 'variante_id')::uuid as variante_id,
           sum((e ->> 'cantidad')::integer)::integer as cantidad,
           max((e ->> 'precio_unitario')::numeric) as precio_unitario,$v$,
  $n$  -- ADR-0655: la oferta de grupo que rige HOY para cada prenda que se suma (la que entra, entra con la oferta de su día).
  v_reglas := (
    with l as (
      select row_number() over (order by x.variante_id)::integer as linea, x.variante_id, x.precio
      from (select d.variante_id, retail.fn_precio_en_sede(d.variante_id, s.ubicacion_id) as precio
              from (select distinct (e ->> 'variante_id')::uuid as variante_id
                      from jsonb_array_elements(coalesce(p_agregar, '[]'::jsonb)) e where nullif(e ->> 'variante_id', '') is not null) d) x
      where x.precio is not null
    )
    select coalesce(jsonb_object_agg(l.variante_id::text, g.regla_id), '{}'::jsonb)
    from retail.fn_ofertas_de_grupo(v_hoy, s.ubicacion_id,
           (select coalesce(jsonb_agg(jsonb_build_object('variante_id', l.variante_id, 'precio_unitario', l.precio, 'cantidad', 1) order by l.linea), '[]'::jsonb) from l), 0) g
    join l on l.linea = g.linea
  );

  for v_item in
    select (e ->> 'variante_id')::uuid as variante_id,
           sum((e ->> 'cantidad')::integer)::integer as cantidad,
           max((e ->> 'precio_unitario')::numeric) as precio_unitario,$n$,
  1);

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'editar_separacion'),
  $v$    v_apartado := apartar_stock(v_item.variante_id, s.ubicacion_id, v_item.cantidad,$v$,
  $n$    -- ADR-0655: una prenda que hoy va en una oferta de grupo entra de a una, con su oferta; sus grupos se arman abajo con el trato que el
    -- apartado guardó (si la oferta ya estaba en el apartado, se junta con lo que había y puede completar el grupo).
    if v_reglas ? v_item.variante_id::text then
      perform retail.fn_guardar_ofertas_de_separacion(s.id, array[(v_reglas ->> v_item.variante_id::text)::uuid]);
      v_base := case when v_manual then round(v_item.descuento_unitario, 2) else v_c_unit end;
      for v_unidad in 1 .. v_item.cantidad loop
        v_apartado := apartar_stock(v_item.variante_id, s.ubicacion_id, 1,
                                    s.clienta_nombres || ' ' || s.clienta_apellidos, s.clienta_celular, s.vence_el,
                                    'Apartado ' || s.codigo, null::uuid);
        update apartados set separacion_id = s.id where id = v_apartado;
        insert into separacion_items (separacion_id, variante_id, cantidad, precio_unitario, descuento_unitario, descuento_etiqueta_id, apartado_id,
                                      motivo_descuento, motivo_descuento_detalle, argumento_descuento, oferta_grupo_id)
          values (s.id, v_item.variante_id, 1, v_precio, v_base, case when not v_manual and v_c_unit > 0 then v_c_etq end, v_apartado,
                  case when v_manual then v_item.motivo_descuento end,
                  case when v_manual and v_item.motivo_descuento = 'otro' then nullif(v_item.motivo_descuento_detalle, '') end,
                  case when v_manual then nullif(v_item.argumento_descuento, '') end,
                  (v_reglas ->> v_item.variante_id::text)::uuid);
      end loop;
      continue;
    end if;
    v_apartado := apartar_stock(v_item.variante_id, s.ubicacion_id, v_item.cantidad,$n$,
  1);

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'editar_separacion'),
  $v$  select coalesce(sum((precio_unitario - descuento_unitario) * cantidad), 0), coalesce(jsonb_agg(to_jsonb(si) order by si.id), '[]'::jsonb)
    into v_total, v_despues$v$,
  $n$  -- ADR-0655: los grupos del apartado, armados de nuevo con lo que queda y el trato guardado: si se quitó una prenda de un 3x2, las que
  -- quedan pagan lo que les toca sin ella; si se sumó la que faltaba, el grupo se completa.
  perform retail.fn_regrupar_separacion(s.id);

  select coalesce(sum((precio_unitario - descuento_unitario) * cantidad), 0), coalesce(jsonb_agg(to_jsonb(si) order by si.id), '[]'::jsonb)
    into v_total, v_despues$n$,
  1);

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'editar_separacion'),
  $v$      from jsonb_array_elements(v_quitados) q;

  return jsonb_build_object('edicion_id', v_edicion, 'total', v_total, 'saldo', round(v_total - s.adelanto, 2));$v$,
  $n$      from jsonb_array_elements(v_quitados) q;
  -- ADR-0655: lo que se quita pasa al archivo con la parte de su oferta de grupo que tenía al quitarla.
  update separacion_items_retirados ri
     set descuento_grupo_unitario = coalesce((q ->> 'descuento_grupo_unitario')::numeric, 0), oferta_grupo_id = (q ->> 'oferta_grupo_id')::uuid
    from jsonb_array_elements(v_quitados) q
   where ri.id = (q ->> 'id')::uuid and ri.edicion_id = v_edicion and nullif(q ->> 'oferta_grupo_id', '') is not null;

  return jsonb_build_object('edicion_id', v_edicion, 'total', v_total, 'saldo', round(v_total - s.adelanto, 2));$n$,
  1);

-- 4c. entregar_separacion: la venta lleva la parte del grupo de cada prenda, sin motivo (como la caja), y su oferta.

-- (El `insert` de siempre queda tal cual, en el `else`: lo dejó 20261030220000 y sus pruebas lo vuelven a pegar. La prenda de un grupo va
-- por su propio `insert`, porque su parte no lleva motivo y un motivo «campaña» sin campaña no pasa `venta_items_campana_coherente`.)
select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'entregar_separacion'),
  $v$    select costo into v_costo from variantes where id = v_it.variante_id;
    insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario,
                             motivo_descuento, descuento_etiqueta_id, motivo_descuento_detalle, argumento_descuento)
      values (v_venta, v_it.variante_id, v_it.cantidad, v_it.precio_unitario, v_it.descuento_unitario, coalesce(v_costo, 0),
              -- ADR-0584: el motivo de un descuento a mano viaja tal cual; el de campaña, como siempre.
              case when v_it.motivo_descuento is not null then v_it.motivo_descuento
                   when v_it.descuento_unitario > 0 then 'campana' end,
              v_it.descuento_etiqueta_id, v_it.motivo_descuento_detalle, v_it.argumento_descuento)
      returning id into v_item_id;$v$,
  $n$    select costo into v_costo from variantes where id = v_it.variante_id;
    if v_it.descuento_grupo_unitario > 0 then
      -- ADR-0655: la parte de una oferta de grupo no lleva motivo (como en la caja) y viaja con su oferta; lo demás del descuento (a
      -- mano o de campaña), con su motivo como siempre.
      insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario,
                               motivo_descuento, descuento_etiqueta_id, motivo_descuento_detalle, argumento_descuento,
                               descuento_grupo_unitario, oferta_grupo_id)
        values (v_venta, v_it.variante_id, v_it.cantidad, v_it.precio_unitario, v_it.descuento_unitario, coalesce(v_costo, 0),
                case when v_it.motivo_descuento is not null then v_it.motivo_descuento
                     when v_it.descuento_unitario - v_it.descuento_grupo_unitario > 0 then 'campana' end,
                v_it.descuento_etiqueta_id, v_it.motivo_descuento_detalle, v_it.argumento_descuento,
                v_it.descuento_grupo_unitario, v_it.oferta_grupo_id)
        returning id into v_item_id;
    else
    insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario,
                             motivo_descuento, descuento_etiqueta_id, motivo_descuento_detalle, argumento_descuento)
      values (v_venta, v_it.variante_id, v_it.cantidad, v_it.precio_unitario, v_it.descuento_unitario, coalesce(v_costo, 0),
              -- ADR-0584: el motivo de un descuento a mano viaja tal cual; el de campaña, como siempre.
              case when v_it.motivo_descuento is not null then v_it.motivo_descuento
                   when v_it.descuento_unitario > 0 then 'campana' end,
              v_it.descuento_etiqueta_id, v_it.motivo_descuento_detalle, v_it.argumento_descuento)
      returning id into v_item_id;
    end if;$n$,
  1);

-- 4d. buscar_separaciones: la parte del grupo de cada prenda y su trato, para que las pantallas digan «3 x 2 · Verano».

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'buscar_separaciones'),
  $v$         (select jsonb_agg(jsonb_build_object('id', si.id, 'variante_id', si.variante_id, 'sku', v.sku, 'referencia', p.referencia,$v$,
  $n$         (select jsonb_agg(jsonb_build_object('id', si.id,
                                              -- ADR-0655: la parte de la oferta de grupo y su trato (al frente: lo de atrás lo dejaron
                                              -- otras migraciones que sus pruebas vuelven a pegar).
                                              'descuento_grupo_unitario', si.descuento_grupo_unitario,
                                              'oferta_grupo', (select jsonb_build_object('regla_id', og.regla_id, 'nombre', og.nombre,
                                                                 'etiqueta', og.etiqueta_nombre, 'tipo', og.tipo, 'lleva', og.lleva, 'paga', og.paga,
                                                                 'monto', og.monto, 'porcentaje', og.porcentaje)
                                                                 from separacion_ofertas_grupo og
                                                                where og.separacion_id = si.separacion_id and og.regla_id = si.oferta_grupo_id),
                                              'variante_id', si.variante_id, 'sku', v.sku, 'referencia', p.referencia,$n$,
  1);

-- 5. La vista previa de una edición: el total nuevo antes de confirmar --------------------------------------------------------------

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
           coalesce((o.x ->> 'descuento_unitario')::numeric, 0) as base
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
  select coalesce(jsonb_agg(jsonb_build_object('ref', 'nueva-' || e.n || '-' || k.k, 'variante_id', e.variante_id, 'precio_unitario', l.precio,
                                               'base', e.base, 'regla_id', g.regla_id) order by e.n, k.k), '[]'::jsonb)
    into v_nuevas
  from e
  join l on l.variante_id = e.variante_id
  left join g on g.linea = l.linea
  cross join lateral generate_series(1, e.cantidad) k(k);

  with
  partes as (select * from retail.fn_grupos_de_separacion(s.id, p_quitar, v_nuevas)),
  quedan as (
    select si.id::text as ref, si.variante_id, si.cantidad, si.precio_unitario, si.descuento_unitario - si.descuento_grupo_unitario as base,
           si.oferta_grupo_id
    from retail.separacion_items si
    where si.separacion_id = s.id and not (si.id = any (coalesce(p_quitar, '{}'::uuid[])))
    union all
    select x ->> 'ref', (x ->> 'variante_id')::uuid, 1, (x ->> 'precio_unitario')::numeric, (x ->> 'base')::numeric, nullif(x ->> 'regla_id', '')::uuid
    from jsonb_array_elements(v_nuevas) x
  ),
  lineas as (
    select q.*, coalesce(p.descuento, 0) as grupo, p.faltan from quedan q left join partes p on p.ref = q.ref
  )
  select jsonb_build_object(
           'total', round(coalesce(sum((l.precio_unitario - l.base - l.grupo) * l.cantidad), 0), 2),
           'ahorro_grupo', round(coalesce(sum(l.grupo * l.cantidad), 0), 2),
           'lineas', coalesce(jsonb_agg(jsonb_build_object('ref', l.ref, 'variante_id', l.variante_id, 'cantidad', l.cantidad,
                                                           'precio_unitario', l.precio_unitario, 'descuento_unitario', l.base + l.grupo,
                                                           'descuento_grupo_unitario', l.grupo, 'oferta_grupo_id', l.oferta_grupo_id,
                                                           'faltan', l.faltan) order by l.ref), '[]'::jsonb))
    into v_res
  from lineas l;

  return v_res || jsonb_build_object('saldo', round((v_res ->> 'total')::numeric - s.adelanto, 2));
end;
$function$;

comment on function retail.previsualizar_edicion_separacion(uuid, uuid[], jsonb) is
  'ADR-0655. Cómo quedaría un apartado al quitar y sumar prendas, sin guardar nada: el total, el saldo y lo que ahorra cada prenda con las ofertas de grupo (el trato guardado y la oferta de hoy para lo que se suma). La hoja de editar manda ese total a editar_separacion_con_total.';

revoke all on function retail.previsualizar_edicion_separacion(uuid, uuid[], jsonb) from public, anon;
grant execute on function retail.previsualizar_edicion_separacion(uuid, uuid[], jsonb) to authenticated;

-- La edición que exige el total que se vio: la hoja manda el de la vista previa; si al guardar da otro (la oferta terminó a medianoche,
-- otra persona editó el mismo apartado), no se guarda nada y la hoja vuelve a mostrar el nuevo.
create or replace function retail.editar_separacion_con_total(
  p_separacion_id uuid,
  p_quitar uuid[] default '{}'::uuid[],
  p_agregar jsonb default '[]'::jsonb,
  p_token uuid default null,
  p_total_esperado numeric default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_res jsonb;
begin
  v_res := retail.editar_separacion(p_separacion_id, p_quitar, p_agregar, p_token);
  if p_total_esperado is not null and abs((v_res ->> 'total')::numeric - p_total_esperado) > 0.005 then
    raise exception 'El total del apartado cambió mientras lo editabas: ahora queda en S/%. Revisa y vuelve a confirmar.',
      to_char((v_res ->> 'total')::numeric, 'FM999999990.00')
      using errcode = 'P0001', hint = 'separacion_total_cambio', detail = to_char((v_res ->> 'total')::numeric, 'FM999999990.00');
  end if;
  return v_res;
end;
$function$;

comment on function retail.editar_separacion_con_total(uuid, uuid[], jsonb, uuid, numeric) is
  'ADR-0655. editar_separacion, pero solo si el total que queda es el que la hoja mostró (previsualizar_edicion_separacion): si no, el error deshace la edición entera (separacion_total_cambio).';

revoke all on function retail.editar_separacion_con_total(uuid, uuid[], jsonb, uuid, numeric) from public, anon;
grant execute on function retail.editar_separacion_con_total(uuid, uuid[], jsonb, uuid, numeric) to authenticated;

notify pgrst, 'reload schema';
