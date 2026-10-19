-- ============================================================================
-- 20261019201000_club_puntos_base.sql — CAYLA V2 · Club · puntos, actividad 1 de 12: la base
-- Decisiones de Felipe (2026-10-19), maqueta `docs/maquetas/puntos-2026-10/`, backlog `docs/backlog/2026-10-19-cayla-points-loyalty-d8d7d5.md`.
-- Una sola parte: tablas NUEVAS, sin políticas y sin tocar ninguna tabla en uso (CLAUDE.md, «Políticas y deadlocks»).
--
-- EL PROBLEMA. El Club premia con un 10 % en el cumpleaños y un vale al año; Felipe lo cambia por PUNTOS por compra (1 punto por
-- S/ 1 pagado, 100 puntos = S/ 5), canjeables por un cupón con código. Un saldo de puntos es dinero que CAYLA le debe al cliente:
-- si puede quedar negativo, duplicarse o editarse a mano, el diseño está mal (principios 2 y 4 de CLAUDE.md).
--
-- QUÉ HACE
--   1. `club_puntos_config`: la configuración del programa, por VERSIONES con fecha de vigencia (puntos por sol, soles por cada
--      100 puntos, canje mínimo, compra mínima del cupón, vigencia del cupón, regalo de cumpleaños y tope de costo). Solo se agrega.
--      Cambiar lo que valen los puntos o el canje rige desde dentro de 15 días (los Términos, 5.9); lo demás, desde hoy.
--   2. `club_puntos_movimientos`: LA fuente de verdad. Cada punto ganado, canjeado, devuelto, revertido o perdido es una fila que
--      solo se agrega (como `movimientos` con el stock). El signo lo manda el tipo. Una reversa apunta al movimiento que deshace
--      (`de_movimiento_id`) y nunca quita más de lo que ese movimiento dio.
--   3. `club_puntos_saldos`: el saldo, DERIVADO. Lo mantiene un disparador desde los movimientos y no puede ser negativo.
--   4. Funciones internas (sin permiso para la API; las llamarán `registrar_venta` y las demás actividades): leer la configuración,
--      anotar un movimiento (con todas sus reglas) y recalcular el saldo desde los movimientos (para auditar).
--   5. `guardar_beneficios_puntos`: guarda una versión nueva de la configuración. Solo el líder, con su responsable; la pantalla y
--      el módulo «Beneficios del club» llegan en la actividad 8. NO toca `club_textos`: los Términos los publica el abogado.
--
-- DECIDÍ: el saldo es una tabla derivada por disparador (como `stock`), no una vista: se lee barato y la CHECK `saldo >= 0` es un
--   candado que ningún camino puede saltarse. Además `fn_club_puntos_anotar` bloquea la fila del saldo ANTES de mirar si alcanza,
--   así dos cajas que gastan los mismos puntos a la vez se turnan y la segunda recibe `puntos_insuficientes`.
-- DECIDÍ: solo una MIEMBRO del club (club_desde, no anonimizada, ficha no unida) gana o gasta puntos. Una ficha «Identificado»
--   (solo documento) no aceptó los Términos: sus compras no suman (decisión de Felipe, ver el backlog).
-- DESCARTÉ: que la configuración viva en `configuracion_empresa` (una fila editable): borraría el «antes» y no habría aviso de 15
--   días. Y descarté guardar los 3 años de conservación como parámetro: lo fijan los Términos (5.7).
-- SE ROMPE SI: una función nueva escribe en `club_puntos_saldos` a mano (el disparador y la CHECK lo detectan al primer
--   desajuste: `fn_club_puntos_saldo_calculado` debe dar siempre lo mismo que el saldo guardado).
--
-- CÓMO SE PEGA: este archivo SOLO en el SQL Editor de producción. Idempotente (se puede pegar dos veces). `lock_timeout` de 3 s.
-- CONCURRENCIA. Ver el DECIDÍ del saldo; el orden de llaves de una venta es ficha (`clientas`), venta (`ventas`), saldo.
-- CAÍDA EXTERNA. Nada de esto llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. La configuración, por versiones ----------
create table if not exists retail.club_puntos_config (
  id                   bigint generated always as identity primary key,
  vigente_desde        date          not null,
  puntos_por_sol       numeric(8,2)  not null,
  soles_por_100        numeric(10,2) not null,
  canje_minimo_puntos  integer       not null,
  compra_minima_x      numeric(6,2)  not null,
  vigencia_cupon_dias  integer       not null,
  regalo_cumple_puntos integer       not null,
  tope_costo_pct       numeric(5,2)  not null,
  creada_por           uuid references public.personas (id),
  creada_en            timestamptz   not null default now()
);
comment on table retail.club_puntos_config is
  'La configuración del programa de puntos del Club, por VERSIONES (solo se agrega). La vigente un día es la última con vigente_desde <= ese día (empata la más nueva): retail.fn_club_puntos_config(). Cambiar soles_por_100 o canje_minimo_puntos rige desde dentro de 15 días (Términos 5.9). RLS sin políticas y sin permisos para la API.';

alter table retail.club_puntos_config drop constraint if exists club_puntos_config_valores;
alter table retail.club_puntos_config add constraint club_puntos_config_valores check (
  puntos_por_sol > 0 and puntos_por_sol <= 100
  and soles_por_100 > 0 and soles_por_100 <= 1000
  and canje_minimo_puntos >= 100 and canje_minimo_puntos % 100 = 0 and canje_minimo_puntos <= 100000
  and compra_minima_x >= 1 and compra_minima_x <= 20
  and vigencia_cupon_dias between 1 and 90
  and regalo_cumple_puntos between 0 and 10000
  and tope_costo_pct >= 0 and tope_costo_pct <= 100);
create index if not exists club_puntos_config_vigencia_idx on retail.club_puntos_config (vigente_desde desc, id desc);

alter table retail.club_puntos_config enable row level security;
revoke all on retail.club_puntos_config from public, anon, authenticated;

-- La versión de arranque: lo decidido el 2026-10-19 (1 punto por S/ 1, 100 puntos = S/ 5, canje desde 200, cupón desde 3 veces su
-- valor, 7 días, 100 puntos de cumpleaños, tope de costo del 2 %).
insert into retail.club_puntos_config
  (vigente_desde, puntos_por_sol, soles_por_100, canje_minimo_puntos, compra_minima_x, vigencia_cupon_dias, regalo_cumple_puntos, tope_costo_pct)
select date '2026-01-01', 1, 5, 200, 3, 7, 100, 2
 where not exists (select 1 from retail.club_puntos_config);

-- ---------- 2. Los movimientos: la fuente de verdad ----------
-- Las llaves en el orden de una venta: la ficha (`clientas`) primero, la venta (`ventas`) después y `personas` al final.
create table if not exists retail.club_puntos_movimientos (
  id             uuid primary key default gen_random_uuid(),
  clienta_id     uuid not null references retail.clientas (id),
  tipo           text not null,
  puntos         integer not null,
  venta_id       uuid references retail.ventas (id),
  anio           smallint,
  referencia     text,
  nota           text,
  registrado_por uuid references public.personas (id),
  created_at     timestamptz not null default now(),
  de_movimiento_id uuid references retail.club_puntos_movimientos (id)
);
-- (por si la tabla nació sin la columna al pegar una versión anterior de este archivo)
alter table retail.club_puntos_movimientos add column if not exists de_movimiento_id uuid references retail.club_puntos_movimientos (id);
comment on table retail.club_puntos_movimientos is
  'Cada punto del Club (actividad 1 de los puntos): una fila que SOLO se agrega. tipo: compra (+, una por venta), cumple (+, una por socia y año), canje (−, al crear un cupón), devuelve (+, un cupón vencido o sin usar devuelve sus puntos), revierte (−, anulación o devolución de una compra), pierde (−, a los 3 años sin compras) y ajuste (±, del líder). El saldo es club_puntos_saldos, derivado por disparador. RLS sin políticas y sin permisos para la API.';
comment on column retail.club_puntos_movimientos.anio is 'Año de Lima del regalo de cumpleaños: uno por socia y año.';
comment on column retail.club_puntos_movimientos.de_movimiento_id is 'El movimiento que corrige: una reversa (revierte) apunta a la compra o al regalo que deshace; un cupón vencido (devuelve) apunta a su canje.';
comment on column retail.club_puntos_movimientos.referencia is 'Qué lo originó cuando no es una venta (el código de un cupón, por ejemplo).';

alter table retail.club_puntos_movimientos drop constraint if exists club_puntos_mov_tipo_valido;
alter table retail.club_puntos_movimientos add constraint club_puntos_mov_tipo_valido
  check (tipo in ('compra', 'cumple', 'canje', 'devuelve', 'revierte', 'pierde', 'ajuste'));
alter table retail.club_puntos_movimientos drop constraint if exists club_puntos_mov_signo;
alter table retail.club_puntos_movimientos add constraint club_puntos_mov_signo check (
  puntos <> 0
  and ((tipo in ('compra', 'cumple', 'devuelve') and puntos > 0)
    or (tipo in ('canje', 'revierte', 'pierde') and puntos < 0)
    or tipo = 'ajuste'));
alter table retail.club_puntos_movimientos drop constraint if exists club_puntos_mov_anio_del_cumple;
alter table retail.club_puntos_movimientos add constraint club_puntos_mov_anio_del_cumple
  check ((tipo = 'cumple') = (anio is not null) and (anio is null or anio between 2026 and 2200));
alter table retail.club_puntos_movimientos drop constraint if exists club_puntos_mov_tope;
alter table retail.club_puntos_movimientos add constraint club_puntos_mov_tope check (abs(puntos) <= 10000000);

alter table retail.club_puntos_movimientos drop constraint if exists club_puntos_mov_de_movimiento;
alter table retail.club_puntos_movimientos add constraint club_puntos_mov_de_movimiento
  check ((tipo in ('revierte', 'devuelve')) = (de_movimiento_id is not null));

-- El candado de «una sola vez» de la compra: una venta da puntos una sola vez. (El regalo de cumpleaños —uno por año, pero que se
-- puede volver a dar si se anuló la venta que lo dio— lo vigila el disparador fn_club_puntos_guardas, no un único.)
create unique index if not exists club_puntos_mov_una_compra_por_venta
  on retail.club_puntos_movimientos (venta_id) where tipo = 'compra';
drop index if exists retail.club_puntos_mov_un_cumple_por_anio;
create index if not exists club_puntos_mov_de_idx on retail.club_puntos_movimientos (de_movimiento_id) where de_movimiento_id is not null;
create index if not exists club_puntos_mov_clienta_idx on retail.club_puntos_movimientos (clienta_id, created_at desc);
create index if not exists club_puntos_mov_venta_idx on retail.club_puntos_movimientos (venta_id) where venta_id is not null;

alter table retail.club_puntos_movimientos enable row level security;
revoke all on retail.club_puntos_movimientos from public, anon, authenticated;

-- ---------- 3. El saldo, derivado ----------
create table if not exists retail.club_puntos_saldos (
  clienta_id     uuid primary key references retail.clientas (id),
  saldo          integer not null default 0,
  actualizado_en timestamptz not null default now()
);
comment on table retail.club_puntos_saldos is
  'El saldo de puntos de cada miembro: DERIVADO de club_puntos_movimientos por disparador, nunca se edita a mano y no puede ser negativo. RLS sin políticas y sin permisos para la API.';
alter table retail.club_puntos_saldos drop constraint if exists club_puntos_saldo_no_negativo;
alter table retail.club_puntos_saldos add constraint club_puntos_saldo_no_negativo check (saldo >= 0);
alter table retail.club_puntos_saldos enable row level security;
revoke all on retail.club_puntos_saldos from public, anon, authenticated;

-- ---------- 4. Los candados: solo se agrega, y el saldo sigue a los movimientos ----------
create or replace function retail.fn_club_puntos_solo_agregar()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  raise exception 'Los puntos del Club solo se agregan: un movimiento no se edita ni se borra. Si algo cambió, se registra un movimiento nuevo.'
    using errcode = 'P0001', hint = 'puntos_solo_agregar';
end;
$$;
comment on function retail.fn_club_puntos_solo_agregar() is
  'Disparador de club_puntos_movimientos y club_puntos_config: prohíbe editar y borrar (principio 4: una sola fuente de verdad que solo se agrega).';
revoke all on function retail.fn_club_puntos_solo_agregar() from public, anon, authenticated;

create or replace trigger trg_club_puntos_mov_solo_agregar
  before update or delete on retail.club_puntos_movimientos
  for each row execute function retail.fn_club_puntos_solo_agregar();
create or replace trigger trg_club_puntos_config_solo_agregar
  before update or delete on retail.club_puntos_config
  for each row execute function retail.fn_club_puntos_solo_agregar();

-- Las guardas que un único no puede expresar. Corren ANTES de cada inserción y toman primero la fila del saldo de la miembro, así que
-- cualquier camino (la función de anotar o un SQL a mano) se turna con los demás en la misma miembro:
--   · el regalo de cumpleaños: uno por miembro y año, salvo que el que se dio ya tenga su reversa (se anuló la venta que lo dio);
--   · una reversa: apunta a una compra o un regalo de la MISMA miembro y de la MISMA venta, y todas las reversas de un movimiento
--     nunca suman más que lo que ese movimiento dio;
--   · una devolución de puntos (un cupón vencido): apunta a un canje de la MISMA miembro y todas sus devoluciones nunca suman más
--     de lo que costó ese canje.
create or replace function retail.fn_club_puntos_guardas()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_orig record;
  v_ya_revertido integer;
begin
  insert into retail.club_puntos_saldos (clienta_id, saldo) values (new.clienta_id, 0) on conflict (clienta_id) do nothing;
  perform 1 from retail.club_puntos_saldos s where s.clienta_id = new.clienta_id for update;

  if new.tipo = 'cumple' then
    if exists (select 1 from retail.club_puntos_movimientos m
                where m.clienta_id = new.clienta_id and m.tipo = 'cumple' and m.anio = new.anio
                  and not exists (select 1 from retail.club_puntos_movimientos r where r.tipo = 'revierte' and r.de_movimiento_id = m.id)) then
      raise exception 'El regalo de cumpleaños de este año ya se dio.' using errcode = '23505', hint = 'puntos_cumple_ya_regalado';
    end if;
  elsif new.tipo = 'revierte' then
    select m.clienta_id, m.tipo, m.puntos, m.venta_id into v_orig from retail.club_puntos_movimientos m where m.id = new.de_movimiento_id;
    if not found or v_orig.clienta_id <> new.clienta_id or v_orig.tipo not in ('compra', 'cumple')
       or v_orig.venta_id is distinct from new.venta_id then
      raise exception 'Una reversa deshace una compra o un regalo de la misma miembro y de la misma venta.' using errcode = '23514', hint = 'puntos_reversa_invalida';
    end if;
    select coalesce(sum(-r.puntos), 0) into v_ya_revertido
      from retail.club_puntos_movimientos r where r.tipo = 'revierte' and r.de_movimiento_id = new.de_movimiento_id;
    if v_ya_revertido - new.puntos > v_orig.puntos then
      raise exception 'Esa reversa quita más de lo que dio el movimiento.' using errcode = '23514', hint = 'puntos_reversa_excede';
    end if;
  elsif new.tipo = 'devuelve' then
    -- Un cupón que vence (o se anula la venta donde se usó) devuelve los puntos de SU canje, una sola vez y nunca más de lo que costó.
    select m.clienta_id, m.tipo, m.puntos, m.venta_id into v_orig from retail.club_puntos_movimientos m where m.id = new.de_movimiento_id;
    if not found or v_orig.clienta_id <> new.clienta_id or v_orig.tipo <> 'canje' then
      raise exception 'Una devolución de puntos deshace un canje de la misma miembro.' using errcode = '23514', hint = 'puntos_devolucion_invalida';
    end if;
    select coalesce(sum(d.puntos), 0) into v_ya_revertido
      from retail.club_puntos_movimientos d where d.tipo = 'devuelve' and d.de_movimiento_id = new.de_movimiento_id;
    if v_ya_revertido + new.puntos > -v_orig.puntos then
      raise exception 'Esa devolución de puntos pasa de lo que costó el canje.' using errcode = '23514', hint = 'puntos_devolucion_excede';
    end if;
  end if;
  return new;
end;
$$;
comment on function retail.fn_club_puntos_guardas() is
  'Disparador de club_puntos_movimientos (antes de insertar): serializa por miembro y vigila el regalo de cumpleaños (uno por año, reversible) y las reversas (nunca más de lo que dio el movimiento).';
revoke all on function retail.fn_club_puntos_guardas() from public, anon, authenticated;

create or replace trigger trg_club_puntos_guardas
  before insert on retail.club_puntos_movimientos
  for each row execute function retail.fn_club_puntos_guardas();

create or replace function retail.fn_club_puntos_aplicar_saldo()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  -- Primero se actualiza la fila que ya existe; solo si no hay se inserta. Un `insert … on conflict` NO sirve aquí: Postgres
  -- revisa la CHECK saldo >= 0 sobre la fila PROPUESTA (con puntos negativos) antes de ver el conflicto, y rechazaría un canje
  -- válido (lo encontró la prueba (g) de scripts/pruebas/club_puntos_base.mjs).
  update retail.club_puntos_saldos s
     set saldo = s.saldo + new.puntos, actualizado_en = now()
   where s.clienta_id = new.clienta_id;
  if not found then
    insert into retail.club_puntos_saldos (clienta_id, saldo, actualizado_en) values (new.clienta_id, new.puntos, now());
  end if;
  return null;
end;
$$;
comment on function retail.fn_club_puntos_aplicar_saldo() is
  'Disparador de club_puntos_movimientos: mantiene club_puntos_saldos desde cada movimiento nuevo. La CHECK saldo >= 0 hace imposible un saldo negativo por cualquier camino.';
revoke all on function retail.fn_club_puntos_aplicar_saldo() from public, anon, authenticated;

create or replace trigger trg_club_puntos_aplicar_saldo
  after insert on retail.club_puntos_movimientos
  for each row execute function retail.fn_club_puntos_aplicar_saldo();

-- ---------- 5. Funciones internas ----------
-- La configuración vigente un día (hoy, en Lima, si no se dice): la última versión con vigente_desde <= ese día.
create or replace function retail.fn_club_puntos_config(p_fecha date default null)
returns retail.club_puntos_config
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select c.*
    from retail.club_puntos_config c
   where c.vigente_desde <= coalesce(p_fecha, (now() at time zone 'America/Lima')::date)
   order by c.vigente_desde desc, c.id desc
   limit 1;
$$;
comment on function retail.fn_club_puntos_config(date) is
  'La configuración del programa de puntos vigente un día (hoy en Lima por defecto). Interna: la leen registrar_venta y las pantallas a través de sus propias funciones.';
revoke all on function retail.fn_club_puntos_config(date) from public, anon, authenticated;

-- Cuántos soles valen N puntos: solo cuentan los bloques completos de 100.
create or replace function retail.fn_club_puntos_valor(p_puntos integer, p_fecha date default null)
returns numeric
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select floor(greatest(coalesce(p_puntos, 0), 0) / 100.0) * (retail.fn_club_puntos_config(p_fecha)).soles_por_100;
$$;
revoke all on function retail.fn_club_puntos_valor(integer, date) from public, anon, authenticated;

-- El saldo guardado y el saldo recalculado desde los movimientos: tienen que ser siempre iguales.
create or replace function retail.fn_club_puntos_saldo(p_clienta_id uuid)
returns integer
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce((select s.saldo from retail.club_puntos_saldos s where s.clienta_id = p_clienta_id), 0);
$$;
revoke all on function retail.fn_club_puntos_saldo(uuid) from public, anon, authenticated;

create or replace function retail.fn_club_puntos_saldo_calculado(p_clienta_id uuid)
returns integer
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(sum(m.puntos), 0)::integer from retail.club_puntos_movimientos m where m.clienta_id = p_clienta_id;
$$;
comment on function retail.fn_club_puntos_saldo_calculado(uuid) is
  'El saldo recalculado sumando los movimientos. Sirve para auditar: debe ser igual a fn_club_puntos_saldo.';
revoke all on function retail.fn_club_puntos_saldo_calculado(uuid) from public, anon, authenticated;

-- (la firma de 8 parámetros de una versión anterior de este archivo, si alguien la pegó)
drop function if exists retail.fn_club_puntos_anotar(uuid, text, integer, uuid, smallint, text, text, uuid);

-- Anota un movimiento con TODAS sus reglas. La usan registrar_venta y las demás funciones del programa; nadie escribe en
-- club_puntos_movimientos por otro camino. Devuelve el id del movimiento.
create or replace function retail.fn_club_puntos_anotar(
  p_clienta_id uuid,
  p_tipo text,
  p_puntos integer,
  p_venta_id uuid default null,
  p_anio smallint default null,
  p_referencia text default null,
  p_nota text default null,
  p_persona uuid default null,
  p_de_movimiento_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ficha record;
  v_saldo integer;
  v_id uuid;
begin
  if p_clienta_id is null or p_tipo is null or p_puntos is null or p_puntos = 0 then
    raise exception 'Falta la clienta, el tipo o los puntos del movimiento.' using errcode = '22023', hint = 'puntos_movimiento_incompleto';
  end if;

  -- La ficha primero (el orden de una venta): y solo una MIEMBRO gana o gasta puntos.
  select c.id, c.club_desde, c.anonimizada, c.fusionada_en_id into v_ficha
    from retail.clientas c where c.id = p_clienta_id for key share;
  if not found then
    raise exception 'Esa clienta no está en la libreta.' using errcode = 'P0001', hint = 'clienta_no_existe';
  end if;
  if v_ficha.anonimizada then
    raise exception 'Esta clienta pidió borrar sus datos: no puede tener puntos.' using errcode = 'P0001', hint = 'clienta_anonimizada';
  end if;
  if v_ficha.fusionada_en_id is not null then
    raise exception 'Esta ficha se unió a otra: los puntos van a la ficha que quedó.' using errcode = 'P0001', hint = 'clienta_unida';
  end if;
  if v_ficha.club_desde is null then
    raise exception 'Solo las miembros del club ganan puntos: pídele que se una al club (cartel o tienda web).'
      using errcode = 'P0001', hint = 'puntos_no_es_miembro';
  end if;

  -- El saldo: la fila se crea si falta y se BLOQUEA antes de mirar si alcanza, así dos cajas se turnan.
  insert into retail.club_puntos_saldos (clienta_id, saldo) values (p_clienta_id, 0) on conflict (clienta_id) do nothing;
  select s.saldo into v_saldo from retail.club_puntos_saldos s where s.clienta_id = p_clienta_id for update;
  if p_puntos < 0 and v_saldo + p_puntos < 0 then
    raise exception 'No alcanzan los puntos: tiene % y se piden %.', v_saldo, -p_puntos
      using errcode = 'P0001', hint = 'puntos_insuficientes';
  end if;

  insert into retail.club_puntos_movimientos (clienta_id, tipo, puntos, venta_id, anio, referencia, nota, registrado_por, de_movimiento_id)
  values (p_clienta_id, p_tipo, p_puntos, p_venta_id, p_anio, nullif(btrim(p_referencia), ''), nullif(btrim(p_nota), ''), p_persona, p_de_movimiento_id)
  returning id into v_id;
  return v_id;
end;
$$;
comment on function retail.fn_club_puntos_anotar(uuid, text, integer, uuid, smallint, text, text, uuid, uuid) is
  'El único camino para anotar puntos: valida que sea miembro, bloquea el saldo, impide quedar en negativo y deja que los candados de la tabla hagan imposible dar puntos dos veces por la misma venta o el mismo cumpleaños. Interna.';
revoke all on function retail.fn_club_puntos_anotar(uuid, text, integer, uuid, smallint, text, text, uuid, uuid) from public, anon, authenticated;

-- ---------- 6. Guardar una versión nueva de la configuración ----------
create or replace function retail.guardar_beneficios_puntos(
  p_puntos_por_sol numeric,
  p_soles_por_100 numeric,
  p_canje_minimo integer,
  p_compra_minima_x numeric,
  p_vigencia_dias integer,
  p_regalo_cumple integer,
  p_tope_costo_pct numeric,
  p_vigente_desde date default null
)
returns date
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_ultima retail.club_puntos_config;
  v_toca_lo_ganado boolean;
  v_desde date;
begin
  if not retail.fn_es_lider() then
    raise exception 'Los beneficios del club los cambia el líder.' using errcode = '42501', hint = 'solo_lider';
  end if;
  v_persona := retail.fn_actor_persona_id(true);

  if p_puntos_por_sol is null or p_puntos_por_sol <= 0 or p_puntos_por_sol > 100 then
    raise exception 'Los puntos por cada S/ 1 van de 0.01 a 100.' using errcode = '22023', hint = 'puntos_config_invalida', detail = 'puntos_por_sol';
  end if;
  if p_soles_por_100 is null or p_soles_por_100 <= 0 or p_soles_por_100 > 1000 or p_soles_por_100 <> round(p_soles_por_100, 2) then
    raise exception 'Lo que valen 100 puntos va de S/ 0.01 a S/ 1 000.' using errcode = '22023', hint = 'puntos_config_invalida', detail = 'soles_por_100';
  end if;
  if p_canje_minimo is null or p_canje_minimo < 100 or p_canje_minimo > 100000 or p_canje_minimo % 100 <> 0 then
    raise exception 'El canje mínimo va de 100 puntos en múltiplos de 100.' using errcode = '22023', hint = 'puntos_config_invalida', detail = 'canje_minimo';
  end if;
  if p_compra_minima_x is null or p_compra_minima_x < 1 or p_compra_minima_x > 20 or p_compra_minima_x <> round(p_compra_minima_x, 2) then
    raise exception 'La compra mínima del cupón va de 1 a 20 veces su valor.' using errcode = '22023', hint = 'puntos_config_invalida', detail = 'compra_minima_x';
  end if;
  if p_vigencia_dias is null or p_vigencia_dias < 1 or p_vigencia_dias > 90 then
    raise exception 'La vigencia del cupón va de 1 a 90 días.' using errcode = '22023', hint = 'puntos_config_invalida', detail = 'vigencia';
  end if;
  if p_regalo_cumple is null or p_regalo_cumple < 0 or p_regalo_cumple > 10000 then
    raise exception 'El regalo de cumpleaños va de 0 a 10 000 puntos.' using errcode = '22023', hint = 'puntos_config_invalida', detail = 'regalo_cumple';
  end if;
  if p_tope_costo_pct is null or p_tope_costo_pct < 0 or p_tope_costo_pct > 100 or p_tope_costo_pct <> round(p_tope_costo_pct, 2) then
    raise exception 'El tope de costo va de 0 a 100 %%.' using errcode = '22023', hint = 'puntos_config_invalida', detail = 'tope_costo';
  end if;

  -- Se compara con la ÚLTIMA versión (incluida una ya programada), no con la de hoy: guardar dos veces lo mismo no hace nada.
  select c.* into v_ultima from retail.club_puntos_config c order by c.vigente_desde desc, c.id desc limit 1 for update;
  if v_ultima.puntos_por_sol = p_puntos_por_sol and v_ultima.soles_por_100 = p_soles_por_100
     and v_ultima.canje_minimo_puntos = p_canje_minimo and v_ultima.compra_minima_x = p_compra_minima_x
     and v_ultima.vigencia_cupon_dias = p_vigencia_dias and v_ultima.regalo_cumple_puntos = p_regalo_cumple
     and v_ultima.tope_costo_pct = p_tope_costo_pct then
    return v_ultima.vigente_desde;
  end if;

  -- Lo que toca lo que los clientes YA ganaron (cuánto valen sus puntos y desde cuántos se canjea) rige con 15 días de aviso.
  v_toca_lo_ganado := v_ultima.soles_por_100 <> p_soles_por_100 or v_ultima.canje_minimo_puntos <> p_canje_minimo;
  v_desde := coalesce(p_vigente_desde, case when v_toca_lo_ganado then v_hoy + 15 else v_hoy end);
  if v_desde < v_hoy then
    raise exception 'La fecha de vigencia no puede ser anterior a hoy.' using errcode = '22023', hint = 'puntos_config_invalida', detail = 'vigente_desde';
  end if;
  if v_toca_lo_ganado and v_desde < v_hoy + 15 then
    raise exception 'Cambiar lo que valen los puntos o el canje exige avisar con 15 días: rige desde el % como pronto.', to_char(v_hoy + 15, 'DD/MM/YYYY')
      using errcode = '22023', hint = 'cambio_con_aviso', detail = (v_hoy + 15)::text;
  end if;

  insert into retail.club_puntos_config
    (vigente_desde, puntos_por_sol, soles_por_100, canje_minimo_puntos, compra_minima_x, vigencia_cupon_dias, regalo_cumple_puntos, tope_costo_pct, creada_por)
  values (v_desde, p_puntos_por_sol, p_soles_por_100, p_canje_minimo, p_compra_minima_x, p_vigencia_dias, p_regalo_cumple, p_tope_costo_pct, v_persona);

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('puntos_club',
          jsonb_build_object(
            'vigente_desde', v_desde,
            'antes', jsonb_build_object('puntos_por_sol', v_ultima.puntos_por_sol, 'soles_por_100', v_ultima.soles_por_100,
                                        'canje_minimo', v_ultima.canje_minimo_puntos, 'compra_minima_x', v_ultima.compra_minima_x,
                                        'vigencia_dias', v_ultima.vigencia_cupon_dias, 'regalo_cumple', v_ultima.regalo_cumple_puntos,
                                        'tope_costo_pct', v_ultima.tope_costo_pct),
            'despues', jsonb_build_object('puntos_por_sol', p_puntos_por_sol, 'soles_por_100', p_soles_por_100,
                                          'canje_minimo', p_canje_minimo, 'compra_minima_x', p_compra_minima_x,
                                          'vigencia_dias', p_vigencia_dias, 'regalo_cumple', p_regalo_cumple,
                                          'tope_costo_pct', p_tope_costo_pct)),
          v_persona);
  return v_desde;
end;
$$;
comment on function retail.guardar_beneficios_puntos(numeric, numeric, integer, numeric, integer, integer, numeric, date) is
  'Guarda una versión nueva de la configuración de los puntos del Club. Solo el líder, con su responsable. Cambiar lo que valen los puntos o el canje mínimo rige desde dentro de 15 días (hint cambio_con_aviso si se pide antes); lo demás, desde hoy. Anota quién y cuándo en configuracion_historial. No toca club_textos.';
revoke all on function retail.guardar_beneficios_puntos(numeric, numeric, integer, numeric, integer, integer, numeric, date) from public, anon;
grant execute on function retail.guardar_beneficios_puntos(numeric, numeric, integer, numeric, integer, integer, numeric, date) to authenticated;
