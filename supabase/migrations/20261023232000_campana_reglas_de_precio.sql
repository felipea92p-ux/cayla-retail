-- ============================================================================
-- 20261023232000 — Ofertas dentro de una campaña: las reglas de precio por campaña (Felipe 2026-10-23, «Tres preguntas»)
--
-- EL PROBLEMA. Una campaña (una fila de `retail.etiquetas` con estilo `campana`) guarda UN solo descuento (`descuento_pct`), con las
--   fechas, las categorías y las tiendas de la campaña entera. Felipe quiere registrar varias ofertas dentro de una campaña, cada una
--   con sus propias fechas, SUS DÍAS DE LA SEMANA (por ejemplo solo martes y jueves) y, si hace falta, solo algunas categorías de la
--   campaña. La maqueta es `docs/maquetas/ofertas-promociones-2026-10/` (formulario «Tres preguntas»).
--
-- LO QUE HACE (etapa 1 del plan por etapas del README de la maqueta: SOLO el tipo «un % menos»).
--   1. `retail.campana_reglas`: una fila por oferta, colgada de la campaña (`etiqueta_id`). Nace BORRADOR; solo un líder la ACTIVA.
--      Con `desde`, `hasta` y `dias_semana` (1 = lunes … 7 = domingo, como `isodow`). Nunca se borra: se RETIRA (estado
--      `desactivada`). `retail.campana_regla_categorias` guarda «solo estas categorías» y «dejar fuera estas». Cada cambio de una
--      oferta guarda cómo estaba en `retail.campana_regla_historial` (solo se agrega, nunca se edita).
--   2. `fn_campanas_en_sede` (LA función que lee la caja, los apartados, la tienda web, el club y las etiquetas de precio) lee TAMBIÉN
--      las reglas activas. Una oferta rige si la campaña está aprobada, activa y vigente, rige en la sede (ADR-0486), y si hoy cae
--      dentro de las fechas de la regla en uno de sus días. Alcanza a las prendas de la campaña (marcadas ∪ sus categorías) sin «dejar fuera»;
--      pero si la oferta elige «solo estas categorías», alcanza a las prendas de ESAS categorías, estén o no en la campaña (la oferta
--      dice dónde rige, Felipe 2026-10-23). Siempre sin las prendas de Claurè, salvo que la regla las incluya a propósito.
--      Devuelve UNA fila por prenda y campaña (la de mayor %), así que `registrar_venta` y los demás verifican igual que siempre. La
--      línea de venta sigue apuntando a la campaña (`descuento_etiqueta_id`).
--      Corre como `security definer`: las tablas de abajo se cierran a `authenticated` (RLS sin políticas), así que quien las lee
--      necesita permisos de dueño. Como invoker (la primera versión de este archivo) toda cuenta de la tienda recibía
--      `42501 permission denied for table campana_reglas` al preguntar «qué campaña rige hoy» (Vender, Etiquetas de precio,
--      Productos…): 14 177 errores en producción entre el 2026-10-23 y el 24, arreglados con un `alter` aparte (PR #1317).
--   3.`campana_reglas()` (la lee la pantalla), `guardar_campana_regla`, `activar_campana_regla` y `retirar_campana_regla`
--      (security definer, firman con `fn_actor_persona_id(true)`).
--
-- QUÉ NO HACE. No toca `etiquetas.descuento_pct`: el descuento de siempre de una campaña sigue valiendo y convive con las ofertas
--   (gana, por prenda, el mayor). No hay tipos nuevos (soles menos, precio único, 3x2…): la caja todavía no los cobra. Una oferta
--   rige en las tiendas de su campaña (ADR-0486) o, si se quiere, solo en algunas de ellas (`retail.campana_regla_sedes`: sin filas =
--   las de la campaña; nunca en una tienda donde la campaña no rige). No cambia `registrar_venta`.
--
-- DESCARTÉ: reescribir `registrar_venta` (42 mil caracteres con 40 parches): como la oferta devuelve el mismo tipo de fila que una
--   campaña (prenda, campaña, %), basta con que LA función que ya lee todo el mundo la conozca.
-- DESCARTÉ: dejar `fn_campanas_en_sede` como invoker y darle `grant select` a `authenticated` sobre las tablas: con RLS sin políticas la
--   función dejaría de fallar pero leería CERO ofertas sin avisar, y la etiqueta y Vender dirían un precio distinto del que cobra
--   `registrar_venta` (que es security definer y sí las ve). Una política nueva, además, toma las tablas de auth y storage (ADR-0195).
-- DESCARTÉ: guardar las reglas como filas de `etiquetas` o como columnas de la campaña: una campaña tiene VARIAS ofertas y cada una
--   cambia sola.
-- DESCARTÉ: que una oferta solo pueda bajar prendas que su campaña ya tiene (la primera versión): la hoja de la oferta lista TODAS las categorías,
--   como la hoja de la campaña, y una categoría que no estaba no podía elegirse. Costo asumido: esas prendas bajan de precio en la caja y en
--   la tienda sin entrar a la vitrina ni al pase de la campaña (leen las prendas de la campaña); quien las quiera ahí las marca en «Prendas».
-- DESCARTÉ: que elegir la categoría la sume a la campaña (`etiqueta_categorias`): ensancharía en silencio el descuento de siempre y las
--   demás ofertas «todas las de la campaña», y un borrador (que no cobra) cambiaría precios antes de que un líder lo active.
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR (los cierra el esquema, no la pantalla): un % fuera de 1–70; una oferta que termina antes de empezar;
--   días vacíos, repetidos o fuera de 1–7; una oferta activa sin quién y cuándo la activó; una categoría a la vez «solo» y «fuera»;
--   una oferta de días sueltos que NUNCA rige (ninguno de sus días cae en sus fechas) — la función que la guarda la rechaza; una oferta
--   en una tienda donde su campaña no rige.
--
-- ORDEN AL DESPLEGAR. Pegar esto en producción PRIMERO; la web nueva se publica DESPUÉS. Con la web vieja nada cambia (sin ofertas
--   activas, `fn_campanas_en_sede` da lo mismo que antes).
-- CÓMO SE PEGA. Este archivo tal cual en el SQL Editor, de una vez: idempotente, `lock_timeout` 3 s, sin políticas, sin `drop trigger`
--   y sin `alter` sobre tablas en uso. `pnpm pruebas:campana-reglas` es su prueba.
-- CAÍDA EXTERNA. Nada llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. La guarda: lo que se reescribe es lo de ADR-0486 o esto mismo --------------------------------------------------------------

do $$
declare
  v_cuerpo text;
begin
  v_cuerpo := (select prosrc from pg_proc where oid = to_regprocedure('retail.fn_campanas_en_sede(date,integer,uuid[],uuid)'));
  if v_cuerpo is null then
    raise exception 'retail.fn_campanas_en_sede no existe: esta migración va después de 20261023162000 (campañas por sede). No se aplicó nada.';
  end if;
  if position('campana_reglas' in v_cuerpo) = 0 and md5(v_cuerpo) <> '07857f883cfe94ab5e8d8c5acd35e6eb' then
    raise exception 'retail.fn_campanas_en_sede cambió desde que se escribió esta migración (md5 %): regenera esta migración desde su definición real. No se aplicó nada.', md5(v_cuerpo);
  end if;
end;
$$;

-- 1. Dos ayudas puras: los días de la semana --------------------------------------------------------------------------------------

-- Los días de una oferta: de 1 a 7 (1 = lunes … 7 = domingo), sin repetir y en orden.
create or replace function retail.fn_dias_semana_validos(p_dias smallint[])
returns boolean
language sql
immutable
set search_path to 'retail', 'public'
as $function$
  select p_dias is not null
     and cardinality(p_dias) between 1 and 7
     and p_dias = (select array_agg(d order by d) from (select distinct unnest(p_dias) as d) x)
     and not exists (select 1 from unnest(p_dias) d where d not between 1 and 7)
$function$;

-- ¿Alguno de los días elegidos cae en [desde, hasta]? Una oferta de días sueltos que nunca cae no se puede guardar.
create or replace function retail.fn_regla_tiene_dias(p_desde date, p_hasta date, p_dias smallint[])
returns boolean
language sql
immutable
set search_path to 'retail', 'public'
as $function$
  select exists (
    select 1 from generate_series(0, least(greatest(p_hasta - p_desde, 0), 400)) k
     where extract(isodow from (p_desde + k))::smallint = any (p_dias)
  )
$function$;

-- ¿Rige la oferta hoy? Hoy, o en alguno de los días de gracia de una venta sin conexión (la misma tolerancia de las campañas):
-- alguna fecha de [hoy - tolerancia, hoy] cae dentro de las fechas de la oferta y en uno de sus días.
create or replace function retail.fn_regla_rige_en(p_desde date, p_hasta date, p_dias smallint[], p_hoy date, p_tolerancia_dias integer default 0)
returns boolean
language sql
immutable
set search_path to 'retail', 'public'
as $function$
  select exists (
    select 1 from generate_series(0, greatest(coalesce(p_tolerancia_dias, 0), 0)) k
     where (p_hoy - k) between p_desde and p_hasta
       and extract(isodow from (p_hoy - k))::smallint = any (p_dias)
  )
$function$;

-- 2. Las tablas ------------------------------------------------------------------------------------------------------------------

create table if not exists retail.campana_reglas (
  id uuid primary key default gen_random_uuid(),
  etiqueta_id uuid not null references retail.etiquetas (id),
  nombre text not null,
  tipo text not null default 'pct',
  porcentaje numeric(5, 2) not null,
  desde date not null,
  hasta date not null,
  dias_semana smallint[] not null default array[1, 2, 3, 4, 5, 6, 7]::smallint[],
  incluye_claure boolean not null default false,
  estado text not null default 'borrador',
  creada_por uuid,
  creada_en timestamptz not null default now(),
  activada_por uuid,
  activada_en timestamptz,
  actualizada_en timestamptz not null default now(),
  constraint campana_reglas_nombre check (btrim(nombre) <> '' and length(nombre) <= 80),
  constraint campana_reglas_tipo check (tipo in ('pct')),
  constraint campana_reglas_porcentaje check (porcentaje > 0 and porcentaje <= 70),
  constraint campana_reglas_fechas check (hasta >= desde),
  constraint campana_reglas_dias check (retail.fn_dias_semana_validos(dias_semana)),
  constraint campana_reglas_estado check (estado in ('borrador', 'activa', 'desactivada')),
  constraint campana_reglas_activa_firmada check (estado <> 'activa' or (activada_en is not null and activada_por is not null))
);

create index if not exists campana_reglas_etiqueta_idx on retail.campana_reglas (etiqueta_id);
create index if not exists campana_reglas_activas_idx on retail.campana_reglas (etiqueta_id) where estado = 'activa';

create table if not exists retail.campana_regla_categorias (
  regla_id uuid not null references retail.campana_reglas (id) on delete cascade,
  categoria_id uuid not null references retail.categorias (id),
  modo text not null,
  primary key (regla_id, categoria_id),
  constraint campana_regla_categorias_modo check (modo in ('solo', 'fuera'))
);

create table if not exists retail.campana_regla_sedes (
  regla_id uuid not null references retail.campana_reglas (id) on delete cascade,
  ubicacion_id uuid not null references retail.ubicaciones (id),
  primary key (regla_id, ubicacion_id)
);

create table if not exists retail.campana_regla_historial (
  id uuid primary key default gen_random_uuid(),
  regla_id uuid not null references retail.campana_reglas (id),
  antes jsonb not null,
  por uuid,
  en timestamptz not null default now()
);

create index if not exists campana_regla_historial_regla_idx on retail.campana_regla_historial (regla_id, en desc);

alter table retail.campana_reglas enable row level security;
alter table retail.campana_regla_categorias enable row level security;
alter table retail.campana_regla_sedes enable row level security;
alter table retail.campana_regla_historial enable row level security;
revoke all on table retail.campana_reglas from public, anon, authenticated;
revoke all on table retail.campana_regla_categorias from public, anon, authenticated;
revoke all on table retail.campana_regla_sedes from public, anon, authenticated;
revoke all on table retail.campana_regla_historial from public, anon, authenticated;

comment on table retail.campana_reglas is
  'Las ofertas de una campaña (etiqueta con estilo campana): hoy solo «un % menos», con fechas propias, días de la semana (1 lunes … 7 domingo) y, si se quiere, solo algunas categorías de la campaña. Nace borrador; un líder la activa; se retira, nunca se borra. Se lee con campana_reglas() y se escribe con guardar_campana_regla, activar_campana_regla y retirar_campana_regla. La caja las lee a través de fn_campanas_en_sede.';
comment on table retail.campana_regla_categorias is
  'De una oferta: las categorías a las que se limita (modo solo) o que se dejan fuera (modo fuera). Sin filas: todas las prendas de la campaña.';
comment on table retail.campana_regla_sedes is
  'De una oferta: las tiendas donde rige, dentro de las de su campaña. Sin filas: en todas las de la campaña. Con sede desconocida (null) solo rigen las ofertas sin filas.';
comment on table retail.campana_regla_historial is
  'Cómo estaba una oferta antes de cada cambio (solo se agrega). Lo escribe guardar_campana_regla y lo lee campana_reglas() como cambios y último cambio.';

-- 3. LA lectura: lo que la caja y todo lo demás preguntan ---------------------------------------------------------------------------

create or replace function retail.fn_campanas_en_sede(
  p_hoy date,
  p_tolerancia_dias integer default 0,
  p_variante_ids uuid[] default null,
  p_ubicacion_id uuid default null
) returns table (variante_id uuid, etiqueta_id uuid, etiqueta_nombre text, descuento_pct numeric)
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  -- Una fila por prenda y campaña: la de mayor % entre el descuento de siempre de la campaña y sus ofertas activas.
  select distinct on (x.variante_id, x.etiqueta_id) x.variante_id, x.etiqueta_id, x.etiqueta_nombre, x.descuento_pct
  from (
    -- 1. Lo de siempre: el % de la campaña, por prenda marcada o por categoría de la campaña.
    select v.id as variante_id, e.id as etiqueta_id, e.nombre as etiqueta_nombre, e.descuento_pct
    from retail.variantes v
    join retail.productos p on p.id = v.producto_id
    join retail.etiquetas e
      on e.estado = 'aprobado' and e.activo and e.descuento_pct is not null
     and (e.vigente_desde is null or e.vigente_desde <= p_hoy)
     and (e.vigente_hasta is null or e.vigente_hasta >= p_hoy - p_tolerancia_dias)
     and retail.fn_campana_rige_en_sede(e.id, p_ubicacion_id)
    where (p_variante_ids is null or v.id = any (p_variante_ids))
      and (
        exists (select 1 from retail.variante_etiquetas ve where ve.variante_id = v.id and ve.etiqueta_id = e.id)
        or exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = e.id and ec.categoria_id = p.categoria_id)
      )
    union all
    -- 2. Las ofertas activas de campañas aprobadas, activas, vigentes y que rigen en la sede.
    select v.id, e.id, e.nombre, r.porcentaje
    from retail.campana_reglas r
    join retail.etiquetas e
      on e.id = r.etiqueta_id and e.estado = 'aprobado' and e.activo
     and (e.vigente_desde is null or e.vigente_desde <= p_hoy)
     and (e.vigente_hasta is null or e.vigente_hasta >= p_hoy - p_tolerancia_dias)
     and retail.fn_campana_rige_en_sede(e.id, p_ubicacion_id)
    join retail.variantes v on (p_variante_ids is null or v.id = any (p_variante_ids))
    join retail.productos p on p.id = v.producto_id
    where r.estado = 'activa' and r.tipo = 'pct'
      and retail.fn_regla_rige_en(r.desde, r.hasta, r.dias_semana, p_hoy, p_tolerancia_dias)
      -- Las prendas de la oferta: con «solo estas categorías», las de esas categorías (estén o no en la campaña: la oferta dice dónde rige);
      -- sin ninguna, las de la campaña (marcadas a mano o por una de sus categorías).
      and (
        exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo' and rc.categoria_id = p.categoria_id)
        or (
          not exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo')
          and (
            exists (select 1 from retail.variante_etiquetas ve where ve.variante_id = v.id and ve.etiqueta_id = e.id)
            or exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = e.id and ec.categoria_id = p.categoria_id)
          )
        )
      )
      -- «Dejar fuera» estas categorías.
      and not exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera' and rc.categoria_id = p.categoria_id)
      -- Las tiendas de la oferta (dentro de las de su campaña, que ya se exigieron arriba): sin filas, todas; con filas, solo esas. Sin sede, solo las sin filas.
      and (
        not exists (select 1 from retail.campana_regla_sedes rs where rs.regla_id = r.id)
        or (p_ubicacion_id is not null and exists (select 1 from retail.campana_regla_sedes rs where rs.regla_id = r.id and rs.ubicacion_id = p_ubicacion_id))
      )
      -- Las prendas de Claurè no entran, salvo que la oferta las incluya a propósito.
      and (r.incluye_claure or p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure'))
  ) x
  order by x.variante_id, x.etiqueta_id, x.descuento_pct desc
$function$;

comment on function retail.fn_campanas_en_sede(date, integer, uuid[], uuid) is
  'Las campañas (aprobadas, activas, vigentes) que alcanzan a cada variante EN esa sede, con su mayor %: el descuento de siempre de la campaña (por etiqueta manual o por categoría) o una de sus ofertas activas (fechas, días de la semana; con «solo estas categorías» rige en ellas aunque la campaña no las tenga; sin ellas, en las prendas de la campaña menos las que deja fuera). UNA fila por prenda y campaña. Fuente única de la regla; la caja, registrar_venta, los apartados, la tienda web, el club y las etiquetas de precio la leen.';

-- 4. Para la pantalla: leer las ofertas de todas las campañas ---------------------------------------------------------------------

-- Cambia lo que devuelve (suma `sedes`): no se puede reemplazar, se suelta y se crea. `drop function` no toma los candados de las políticas.
drop function if exists retail.campana_reglas();
create function retail.campana_reglas()
returns table (
  id uuid, etiqueta_id uuid, nombre text, tipo text, porcentaje numeric, desde date, hasta date, dias_semana smallint[],
  incluye_claure boolean, estado text, categorias_solo uuid[], categorias_fuera uuid[], sedes uuid[],
  creada_por uuid, creada_en timestamptz, activada_por uuid, activada_en timestamptz, cambios integer, ultimo_cambio jsonb
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
         (select h.antes from retail.campana_regla_historial h where h.regla_id = r.id and h.antes ? 'porcentaje' order by h.en desc, h.id desc limit 1)
  from retail.campana_reglas r
  -- Las lee quien tiene la llave de las campañas (la misma de quien ve la pantalla); sin ella, nada.
  where retail.fn_puede_campanas()
  order by r.creada_en desc, r.id
$function$;

comment on function retail.campana_reglas() is
  'Las ofertas de todas las campañas, con sus categorías, cuántas veces cambiaron y cómo estaban antes del último cambio. Las lee quien tiene la llave de las campañas (fn_puede_campanas); sin ella, ninguna fila.';

-- 5. Guardar una oferta ---------------------------------------------------------------------------------------------------------------

-- Suma `p_sede_ids`: otra firma, así que la de antes se suelta (el repo no admite dos firmas con el mismo nombre, ADR-0009).
drop function if exists retail.guardar_campana_regla(uuid, uuid, text, numeric, date, date, smallint[], uuid[], uuid[], boolean, boolean);
drop function if exists retail.guardar_campana_regla(uuid, uuid, text, numeric, date, date, smallint[], uuid[], uuid[], boolean, uuid[], boolean);
create function retail.guardar_campana_regla(
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
  p_activar boolean
) returns uuid
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_lider boolean := retail.fn_es_lider();
  v_actor uuid;
  v_e record;
  v_r record;
  v_nombre text;
  v_dias smallint[];
  v_solo uuid[];
  v_fuera uuid[];
  v_sedes uuid[];
  v_sedes_campana uuid[];
  v_id uuid;
  v_estado text;
  v_mueve_fechas boolean;
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Registrar una oferta necesita el módulo «Campañas», «Campañas de la tienda web» o «Insignias» en tu rol.' using errcode = '42501', hint = 'oferta_sin_modulo';
  end if;
  if coalesce(p_activar, false) and not v_lider then
    raise exception 'Solo un líder activa una oferta: guárdala como borrador y que un líder la active.' using errcode = '42501', hint = 'oferta_solo_lider';
  end if;
  -- Quién la guarda: el responsable de esta cuenta (CLAUDE.md, «Módulos y roles»).
  v_actor := retail.fn_actor_persona_id(true);

  -- La campaña: existe, es una campaña, está aprobada y activa. `for share` la deja quieta mientras se guarda (nadie le cambia las fechas).
  select e.id, e.nombre, e.estilo, e.estado, e.activo, e.vigente_desde, e.vigente_hasta into v_e
    from retail.etiquetas e where e.id = p_etiqueta_id for share;
  if not found or v_e.estilo <> 'campana' then
    raise exception 'Esa campaña ya no existe. Recarga la pantalla.';
  end if;
  if v_e.estado <> 'aprobado' or not v_e.activo then
    raise exception 'La campaña «%» no está activa: reactívala antes de ponerle ofertas.', v_e.nombre;
  end if;

  if p_regla_id is not null then
    select * into v_r from retail.campana_reglas where id = p_regla_id for update;
    if not found or v_r.etiqueta_id <> p_etiqueta_id then
      raise exception 'Esa oferta ya no existe. Recarga la pantalla.';
    end if;
    if v_r.estado = 'desactivada' then
      raise exception 'Esa oferta ya se retiró. Registra una nueva.';
    end if;
    if v_r.estado = 'activa' and not v_lider then
      raise exception 'Solo un líder cambia una oferta que ya rige.' using errcode = '42501', hint = 'oferta_solo_lider';
    end if;
  end if;

  v_nombre := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  if v_nombre = '' then
    raise exception 'La oferta necesita un nombre.';
  end if;
  if length(v_nombre) > 80 then
    raise exception 'El nombre de la oferta es muy largo: hasta 80 letras.';
  end if;

  if p_porcentaje is null or p_porcentaje <= 0 or p_porcentaje > 70 then
    raise exception 'El descuento de una oferta tiene que ir de 1 a 70 %%.';
  end if;

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Pon cuándo empieza y cuándo termina la oferta (el inicio no puede ser posterior al fin).';
  end if;
  if p_hasta - p_desde > 400 then
    raise exception 'Una oferta no puede durar más de un año.';
  end if;
  -- Hoy o después (al editar sin mover las fechas no se vuelve a pedir: puede ser la edición anterior de una campaña que se repite).
  if p_regla_id is null then
    v_mueve_fechas := true;
  else
    v_mueve_fechas := p_desde is distinct from v_r.desde or p_hasta is distinct from v_r.hasta;
  end if;
  if v_mueve_fechas and p_desde < v_hoy then
    raise exception 'La oferta no puede empezar antes de hoy.';
  end if;
  -- Dentro de las fechas de la campaña (si las tiene).
  if (v_e.vigente_desde is not null and p_desde < v_e.vigente_desde) or (v_e.vigente_hasta is not null and p_hasta > v_e.vigente_hasta) then
    raise exception 'Las fechas de la oferta tienen que caber dentro de las de la campaña «%» (% a %).', v_e.nombre,
      coalesce(to_char(v_e.vigente_desde, 'DD/MM/YYYY'), '…'), coalesce(to_char(v_e.vigente_hasta, 'DD/MM/YYYY'), '…');
  end if;

  -- Los días de la semana: de 1 a 7, sin repetir; sin ninguno, todos.
  v_dias := coalesce((select array_agg(d order by d) from (select distinct unnest(p_dias_semana) as d) x),
                     case when p_dias_semana is null then array[1, 2, 3, 4, 5, 6, 7]::smallint[] else '{}'::smallint[] end);
  if cardinality(v_dias) = 0 then
    raise exception 'Elige al menos un día de la semana.';
  end if;
  if not retail.fn_dias_semana_validos(v_dias) then
    raise exception 'Los días de la semana van del 1 (lunes) al 7 (domingo).';
  end if;
  -- Estado imposible: una oferta que nunca rige.
  if not retail.fn_regla_tiene_dias(p_desde, p_hasta, v_dias) then
    raise exception 'Entre el % y el % no cae ninguno de los días elegidos: la oferta no regiría nunca. Cambia los días o las fechas.',
      to_char(p_desde, 'DD/MM'), to_char(p_hasta, 'DD/MM');
  end if;

  -- Las categorías: «solo» y «dejar fuera», que existan y que no se pisen.
  v_solo := coalesce((select array_agg(distinct c) from unnest(coalesce(p_categorias_solo, '{}'::uuid[])) c), '{}'::uuid[]);
  v_fuera := coalesce((select array_agg(distinct c) from unnest(coalesce(p_categorias_fuera, '{}'::uuid[])) c), '{}'::uuid[]);
  if exists (select 1 from unnest(v_solo || v_fuera) c where not exists (select 1 from retail.categorias k where k.id = c)) then
    raise exception 'Una de las categorías ya no existe. Recarga la pantalla.';
  end if;
  if exists (select 1 from unnest(v_solo) c where c = any (v_fuera)) then
    raise exception 'Una categoría no puede estar a la vez en «solo estas» y en «dejar fuera».';
  end if;

  -- Las tiendas: tiendas activas, dentro de las de la campaña. Elegirlas TODAS es no limitar (así una tienda nueva no queda fuera).
  v_sedes := coalesce((select array_agg(distinct s) from unnest(coalesce(p_sede_ids, '{}'::uuid[])) s), '{}'::uuid[]);
  if exists (select 1 from unnest(v_sedes) s where not exists (select 1 from retail.ubicaciones u where u.id = s and u.tipo = 'tienda' and u.activo)) then
    raise exception 'Una de las tiendas ya no está activa. Recarga la pantalla.';
  end if;
  v_sedes_campana := coalesce((select array_agg(cs.ubicacion_id) from retail.campana_sedes cs where cs.etiqueta_id = p_etiqueta_id), '{}'::uuid[]);
  if cardinality(v_sedes_campana) > 0 and exists (select 1 from unnest(v_sedes) s where not (s = any (v_sedes_campana))) then
    raise exception 'La campaña «%» solo rige en algunas tiendas: una oferta no puede regir en una tienda donde la campaña no rige.', v_e.nombre;
  end if;
  if cardinality(v_sedes) > 0 and v_sedes @> (case when cardinality(v_sedes_campana) > 0 then v_sedes_campana
                                                    else coalesce((select array_agg(u.id) from retail.ubicaciones u where u.tipo = 'tienda' and u.activo), '{}'::uuid[]) end) then
    v_sedes := '{}'::uuid[];
  end if;

  if p_regla_id is null then
    v_estado := case when coalesce(p_activar, false) then 'activa' else 'borrador' end;
    insert into retail.campana_reglas (etiqueta_id, nombre, tipo, porcentaje, desde, hasta, dias_semana, incluye_claure, estado, creada_por, activada_por, activada_en)
      values (p_etiqueta_id, v_nombre, 'pct', p_porcentaje, p_desde, p_hasta, v_dias, coalesce(p_incluye_claure, false), v_estado, v_actor,
              case when v_estado = 'activa' then v_actor end, case when v_estado = 'activa' then now() end)
      returning id into v_id;
  else
    v_id := p_regla_id;
    v_estado := case when v_r.estado = 'borrador' and coalesce(p_activar, false) then 'activa' else v_r.estado end;
    -- Cómo estaba, antes de cambiarla.
    insert into retail.campana_regla_historial (regla_id, antes, por)
      values (v_id, jsonb_build_object(
        'nombre', v_r.nombre, 'porcentaje', v_r.porcentaje, 'desde', v_r.desde, 'hasta', v_r.hasta, 'dias_semana', to_jsonb(v_r.dias_semana),
        'incluye_claure', v_r.incluye_claure, 'estado', v_r.estado,
        'sedes', coalesce((select jsonb_agg(rs.ubicacion_id order by rs.ubicacion_id) from retail.campana_regla_sedes rs where rs.regla_id = v_id), '[]'::jsonb),
        'categorias_solo', coalesce((select jsonb_agg(rc.categoria_id order by rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = v_id and rc.modo = 'solo'), '[]'::jsonb),
        'categorias_fuera', coalesce((select jsonb_agg(rc.categoria_id order by rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = v_id and rc.modo = 'fuera'), '[]'::jsonb)),
        v_actor);
    update retail.campana_reglas
       set nombre = v_nombre, porcentaje = p_porcentaje, desde = p_desde, hasta = p_hasta, dias_semana = v_dias,
           incluye_claure = coalesce(p_incluye_claure, false), estado = v_estado, actualizada_en = now(),
           activada_por = case when v_estado = 'activa' and v_r.estado <> 'activa' then v_actor else activada_por end,
           activada_en = case when v_estado = 'activa' and v_r.estado <> 'activa' then now() else activada_en end
     where id = v_id;
    delete from retail.campana_regla_categorias where regla_id = v_id;
    delete from retail.campana_regla_sedes where regla_id = v_id;
  end if;

  insert into retail.campana_regla_categorias (regla_id, categoria_id, modo)
    select v_id, c, 'solo' from unnest(v_solo) c
    union all
    select v_id, c, 'fuera' from unnest(v_fuera) c;
  insert into retail.campana_regla_sedes (regla_id, ubicacion_id)
    select v_id, s from unnest(v_sedes) s;

  return v_id;
end;
$function$;

comment on function retail.guardar_campana_regla(uuid, uuid, text, numeric, date, date, smallint[], uuid[], uuid[], boolean, uuid[], boolean) is
  'Crea (p_regla_id nulo) o cambia una oferta de una campaña. Nace borrador; p_activar (solo un líder) la deja activa. Cambiar una oferta que ya rige es de un líder. Valida el %, las fechas (dentro de la campaña y no antes de hoy), los días (que alguno caiga en las fechas) y las categorías. Al cambiarla guarda cómo estaba. Devuelve el id.';

-- 6. Activar y retirar ---------------------------------------------------------------------------------------------------------------

create or replace function retail.activar_campana_regla(p_regla_id uuid)
returns void
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_actor uuid;
  v_r record;
  v_e record;
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Activar una oferta necesita el módulo «Campañas», «Campañas de la tienda web» o «Insignias» en tu rol.' using errcode = '42501', hint = 'oferta_sin_modulo';
  end if;
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder activa una oferta.' using errcode = '42501', hint = 'oferta_solo_lider';
  end if;
  v_actor := retail.fn_actor_persona_id(true);

  select * into v_r from retail.campana_reglas where id = p_regla_id for update;
  if not found then
    raise exception 'Esa oferta ya no existe. Recarga la pantalla.';
  end if;
  if v_r.estado = 'activa' then
    return;
  end if;
  select e.id, e.nombre, e.estado, e.activo into v_e from retail.etiquetas e where e.id = v_r.etiqueta_id for share;
  if v_e.estado <> 'aprobado' or not v_e.activo then
    raise exception 'La campaña «%» no está activa: reactívala antes de activar sus ofertas.', v_e.nombre;
  end if;
  if v_r.hasta < v_hoy then
    raise exception 'Esa oferta ya terminó (era hasta el %). Cambia sus fechas para volver a usarla.', to_char(v_r.hasta, 'DD/MM/YYYY');
  end if;

  insert into retail.campana_regla_historial (regla_id, antes, por)
    values (p_regla_id, jsonb_build_object('estado', v_r.estado), v_actor);
  update retail.campana_reglas
     set estado = 'activa', activada_por = v_actor, activada_en = now(), actualizada_en = now()
   where id = p_regla_id;
end;
$function$;

comment on function retail.activar_campana_regla(uuid) is
  'Un líder activa una oferta (borrador o retirada) que todavía no terminó. Desde ese momento la caja la cobra. Guarda quién la activó y cómo estaba.';

create or replace function retail.retirar_campana_regla(p_regla_id uuid)
returns void
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_actor uuid;
  v_r record;
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Retirar una oferta necesita el módulo «Campañas», «Campañas de la tienda web» o «Insignias» en tu rol.' using errcode = '42501', hint = 'oferta_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);

  select * into v_r from retail.campana_reglas where id = p_regla_id for update;
  if not found then
    raise exception 'Esa oferta ya no existe. Recarga la pantalla.';
  end if;
  if v_r.estado = 'desactivada' then
    return;
  end if;
  -- Retirar una oferta que ya rige cambia el precio en la caja: es de un líder. Un borrador lo descarta quien lo guardó o cualquiera con la llave.
  if v_r.estado = 'activa' and not retail.fn_es_lider() then
    raise exception 'Solo un líder retira una oferta que ya rige.' using errcode = '42501', hint = 'oferta_solo_lider';
  end if;

  insert into retail.campana_regla_historial (regla_id, antes, por)
    values (p_regla_id, jsonb_build_object('estado', v_r.estado), v_actor);
  update retail.campana_reglas set estado = 'desactivada', actualizada_en = now() where id = p_regla_id;
end;
$function$;

comment on function retail.retirar_campana_regla(uuid) is
  'Retira una oferta (queda desactivada; nunca se borra). Si ya rige, es de un líder; un borrador lo descarta quien tiene la llave de las campañas.';

-- 7. Permisos ------------------------------------------------------------------------------------------------------------------------------

revoke all on function retail.fn_dias_semana_validos(smallint[]) from public, anon;
grant execute on function retail.fn_dias_semana_validos(smallint[]) to authenticated;
revoke all on function retail.fn_regla_tiene_dias(date, date, smallint[]) from public, anon;
grant execute on function retail.fn_regla_tiene_dias(date, date, smallint[]) to authenticated;
revoke all on function retail.fn_regla_rige_en(date, date, smallint[], date, integer) from public, anon;
grant execute on function retail.fn_regla_rige_en(date, date, smallint[], date, integer) to authenticated;
revoke all on function retail.fn_campanas_en_sede(date, integer, uuid[], uuid) from public, anon;
grant execute on function retail.fn_campanas_en_sede(date, integer, uuid[], uuid) to authenticated;
revoke all on function retail.campana_reglas() from public, anon;
grant execute on function retail.campana_reglas() to authenticated;
revoke all on function retail.guardar_campana_regla(uuid, uuid, text, numeric, date, date, smallint[], uuid[], uuid[], boolean, uuid[], boolean) from public, anon;
grant execute on function retail.guardar_campana_regla(uuid, uuid, text, numeric, date, date, smallint[], uuid[], uuid[], boolean, uuid[], boolean) to authenticated;
revoke all on function retail.activar_campana_regla(uuid) from public, anon;
grant execute on function retail.activar_campana_regla(uuid) to authenticated;
revoke all on function retail.retirar_campana_regla(uuid) from public, anon;
grant execute on function retail.retirar_campana_regla(uuid) to authenticated;
