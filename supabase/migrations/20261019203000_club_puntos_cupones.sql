-- ============================================================================
-- 20261019203000_club_puntos_cupones.sql — CAYLA V2 · Club · puntos, actividad 3 de 12: canjear puntos en un cupón
-- Sigue a `20261019201000_club_puntos_base.sql` y `20261019202000_club_puntos_ganar.sql`. Tablas NUEVAS y funciones: sin políticas
-- y sin tocar ninguna tabla en uso (CLAUDE.md, «Políticas y deadlocks»).
--
-- EL PROBLEMA. Un cliente canjea sus puntos por un cupón con CÓDIGO que cualquiera puede usar (al portador), vale 7 días, se usa
-- una sola vez y, si vence, sus puntos vuelven al saldo. Felipe fue claro: un cupón NUNCA puede duplicarse. Tres formas de duplicar:
-- (1) dos cupones con el mismo código; (2) un doble toque o un reintento que crea dos cupones y descuenta los puntos dos veces;
-- (3) un cupón que vence y devuelve sus puntos dos veces. La base cierra las tres, no la pantalla.
--
-- QUÉ HACE
--   1. `club_cupones`: el cupón (código, dueña, puntos y soles, compra mínima, vence_el, origen, estado activo/usado/vencido). Solo
--      cambia de estado; lo demás no se edita; no se borra. Su canje (`canje_movimiento_id`) es único: un canje, un cupón.
--   2. `fn_club_cupon_codigo_nuevo()`: CAY-XXXX-XXXX con un alfabeto sin 0/O/1/I y bytes de `pgcrypto` (un cupón es al portador: el
--      código no se puede adivinar). El único del código y un reintento hacen imposible repetirlo.
--   3. `fn_club_cupon_crear`: el núcleo. Libera primero lo vencido de esa miembro, valida mínimo y múltiplos, usa la CLAVE DE LA
--      OPERACIÓN (token) para que un doble toque devuelva el MISMO cupón, descuenta los puntos (canje) y crea el cupón en una sola
--      transacción: o quedan las dos cosas o ninguna.
--   4. `fn_club_cupones_vencer`: marca como vencidos los cupones cuya fecha pasó y devuelve sus puntos UNA sola vez (el candado de
--      `fn_club_puntos_guardas` lo hace imposible dos veces).
--   5. Dos puertas: `canjear_puntos` (caja; la persona con el módulo Vender o Clientes) y `tienda_canjear_puntos` (la tienda web,
--      con su cuenta). Las dos devuelven el cupón en `jsonb`.
--
-- DECIDÍ: el cupón vale hasta el FIN del día `vence_el` (Lima): 7 días desde hoy es hoy + 7. La compra mínima es la parte entera
--   hacia arriba de 3 veces el valor (`ceil`), con la configuración de HOY: lo que prometió el cupón se queda escrito en él y un
--   cambio posterior de la configuración no lo toca.
-- DECIDÍ: si una miembro se anonimiza con un cupón vivo, el cupón vence igual pero no devuelve nada (sus puntos se fueron con su
--   ficha, Términos 5.7); el vencimiento no falla por eso.
-- DESCARTÉ: guardar el cupón dentro de `club_puntos_movimientos` (mezclaría estado con historia) y un código corto de 6 (adivinable).
-- SE ROMPE SI: alguien crea cupones a mano sin su canje (el único de `canje_movimiento_id` y la prueba «un canje, un cupón» lo
--   detectan) o cambia `vence_el` de un cupón vivo (el disparador lo impide).
--
-- CÓMO SE PEGA: este archivo SOLO en el SQL Editor de producción, después de `20261019202000`. Idempotente. `lock_timeout` 3 s.
-- Las puertas llaman a `fn_ve_modulo` y `fn_actor_persona_id(true)` (el responsable del combo, ADR-0161). CAÍDA EXTERNA: nada llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. La tabla ----------
create table if not exists retail.club_cupones (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text not null,
  clienta_id          uuid not null references retail.clientas (id),
  puntos              integer not null,
  valor               numeric(10,2) not null,
  compra_minima       numeric(10,2) not null,
  vence_el            date not null,
  origen              text not null,
  token               uuid,
  canje_movimiento_id uuid not null references retail.club_puntos_movimientos (id),
  estado              text not null default 'activo',
  creado_por          uuid references public.personas (id),
  creado_en           timestamptz not null default now(),
  usado_en            timestamptz,
  venta_id            uuid references retail.ventas (id),
  usado_por_clienta_id uuid references retail.clientas (id),
  vencido_en          timestamptz
);
comment on table retail.club_cupones is
  'Los cupones del Club: se crean al canjear puntos (club_puntos_movimientos tipo canje), valen hasta el fin de vence_el (Lima), se usan UNA vez (al portador: lo puede usar cualquiera) y, si vencen, devuelven sus puntos. Solo cambia el estado; lo demás no se edita ni se borra. RLS sin políticas y sin permisos para la API.';
comment on column retail.club_cupones.token is 'La clave de la operación que lo creó: repetirla (doble toque, reintento) devuelve este mismo cupón.';
comment on column retail.club_cupones.usado_por_clienta_id is 'Quién compró con el cupón, si estaba identificada (puede ser otra persona que la dueña).';

alter table retail.club_cupones drop constraint if exists club_cupones_codigo_formato;
alter table retail.club_cupones add constraint club_cupones_codigo_formato check (codigo ~ '^CAY-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$');
alter table retail.club_cupones drop constraint if exists club_cupones_valores;
alter table retail.club_cupones add constraint club_cupones_valores check (
  puntos >= 100 and puntos % 100 = 0 and valor > 0 and compra_minima >= valor and origen in ('web', 'caja'));
alter table retail.club_cupones drop constraint if exists club_cupones_estado_valido;
alter table retail.club_cupones add constraint club_cupones_estado_valido check (estado in ('activo', 'usado', 'vencido'));
alter table retail.club_cupones drop constraint if exists club_cupones_estado_coherente;
alter table retail.club_cupones add constraint club_cupones_estado_coherente check (
  ((estado = 'usado') = (usado_en is not null and venta_id is not null))
  and ((estado = 'vencido') = (vencido_en is not null))
  and (usado_por_clienta_id is null or estado = 'usado'));

-- Los candados de «nunca un cupón duplicado»: un código, una clave de operación y un canje por cupón.
create unique index if not exists club_cupones_codigo_unico on retail.club_cupones (codigo);
create unique index if not exists club_cupones_token_unico on retail.club_cupones (token) where token is not null;
create unique index if not exists club_cupones_un_canje_un_cupon on retail.club_cupones (canje_movimiento_id);
create index if not exists club_cupones_clienta_idx on retail.club_cupones (clienta_id, estado);
create index if not exists club_cupones_por_vencer_idx on retail.club_cupones (vence_el) where estado = 'activo';

alter table retail.club_cupones enable row level security;
revoke all on retail.club_cupones from public, anon, authenticated;

-- Solo cambia de estado: activo → usado o vencido; usado → activo o vencido (si se anula la venta); vencido es final. Nada se borra.
create or replace function retail.fn_club_cupones_guardas()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un cupón del Club no se borra: si ya no sirve, vence.' using errcode = 'P0001', hint = 'cupon_no_se_borra';
  end if;
  if new.id <> old.id or new.codigo <> old.codigo or new.clienta_id <> old.clienta_id or new.puntos <> old.puntos
     or new.valor <> old.valor or new.compra_minima <> old.compra_minima or new.vence_el <> old.vence_el
     or new.origen <> old.origen or new.token is distinct from old.token
     or new.canje_movimiento_id <> old.canje_movimiento_id or new.creado_en <> old.creado_en
     or new.creado_por is distinct from old.creado_por then
    raise exception 'Un cupón del Club no se edita: solo cambia de estado.' using errcode = 'P0001', hint = 'cupon_no_se_edita';
  end if;
  if old.estado = 'vencido' and new.estado <> 'vencido' then
    raise exception 'Un cupón vencido ya devolvió sus puntos: no vuelve a vivir.' using errcode = 'P0001', hint = 'cupon_vencido_es_final';
  end if;
  return new;
end;
$$;
comment on function retail.fn_club_cupones_guardas() is 'Disparador de club_cupones: solo cambia de estado (activo/usado/vencido), nada se edita ni se borra.';
revoke all on function retail.fn_club_cupones_guardas() from public, anon, authenticated;
create or replace trigger trg_club_cupones_guardas
  before update or delete on retail.club_cupones
  for each row execute function retail.fn_club_cupones_guardas();

-- ---------- 2. El código ----------
create or replace function retail.fn_club_cupon_codigo_nuevo()
returns text
language plpgsql
volatile
set search_path = retail, public, extensions
as $$
declare
  c_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := gen_random_bytes(8);
  v_texto text := '';
  k integer;
begin
  for k in 0 .. 7 loop
    v_texto := v_texto || substr(c_alfabeto, (get_byte(v_bytes, k) % 32) + 1, 1);
  end loop;
  return 'CAY-' || substr(v_texto, 1, 4) || '-' || substr(v_texto, 5, 4);
end;
$$;
comment on function retail.fn_club_cupon_codigo_nuevo() is 'Un código de cupón al azar (CAY-XXXX-XXXX, sin 0/O/1/I) con bytes de pgcrypto: es al portador, no se puede adivinar. Interna.';
revoke all on function retail.fn_club_cupon_codigo_nuevo() from public, anon, authenticated;

-- ---------- 3. Vencer lo que pasó de fecha y devolver sus puntos (una sola vez) ----------
create or replace function retail.fn_club_cupones_vencer(p_clienta_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_c record;
  v_n integer := 0;
begin
  for v_c in
    select k.id, k.clienta_id, k.puntos, k.canje_movimiento_id, k.codigo
      from retail.club_cupones k
     where k.estado = 'activo' and k.vence_el < v_hoy and (p_clienta_id is null or k.clienta_id = p_clienta_id)
     order by k.vence_el, k.id
       for update skip locked
  loop
    update retail.club_cupones set estado = 'vencido', vencido_en = now() where id = v_c.id and estado = 'activo';
    if found then
      v_n := v_n + 1;
      -- Los puntos vuelven al saldo. Si la miembro ya no existe como miembro (se anonimizó), no hay a quién devolverlos y el
      -- vencimiento sigue igual (Términos 5.7).
      begin
        perform retail.fn_club_puntos_anotar(v_c.clienta_id, 'devuelve', v_c.puntos, null, null, v_c.codigo,
                                             'Cupón vencido', null, v_c.canje_movimiento_id);
      exception when others then
        raise warning 'puntos: no se devolvieron los del cupón vencido % (%)', v_c.codigo, sqlerrm;
      end;
    end if;
  end loop;
  return v_n;
end;
$$;
comment on function retail.fn_club_cupones_vencer(uuid) is
  'Vence los cupones activos cuya fecha pasó (los de una miembro o todos) y devuelve sus puntos al saldo una sola vez. Idempotente. Interna: la llaman canjear_puntos, la tarea diaria y las lecturas de saldo.';
revoke all on function retail.fn_club_cupones_vencer(uuid) from public, anon, authenticated;

-- ---------- 4. El núcleo: crear un cupón ----------
-- Cómo se ve un cupón hacia afuera (la caja y la tienda lo muestran igual).
create or replace function retail.fn_club_cupon_json(p_cupon retail.club_cupones, p_repetido boolean)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object('codigo', p_cupon.codigo, 'puntos', p_cupon.puntos, 'valor', p_cupon.valor, 'compra_minima', p_cupon.compra_minima,
                            'vence_el', p_cupon.vence_el, 'estado', p_cupon.estado, 'repetido', p_repetido,
                            'saldo', retail.fn_club_puntos_saldo(p_cupon.clienta_id));
$$;
revoke all on function retail.fn_club_cupon_json(retail.club_cupones, boolean) from public, anon, authenticated;

create or replace function retail.fn_club_cupon_crear(
  p_clienta_id uuid,
  p_puntos integer,
  p_token uuid,
  p_origen text,
  p_persona uuid
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_cfg retail.club_puntos_config;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_cupon retail.club_cupones;
  v_codigo text;
  v_mov uuid;
  v_valor numeric;
  v_intento integer := 0;
begin
  if p_origen not in ('web', 'caja') then
    raise exception 'El cupón nace en la caja o en la tienda web.' using errcode = '22023', hint = 'cupon_origen_invalido';
  end if;

  -- Un doble toque, un reintento o dos pestañas con la MISMA clave devuelven el MISMO cupón; la misma clave con otra cosa se rechaza
  -- (como el token de registrar_venta: «el token sigue al contenido»). El único de `token` es el candado: si dos llamadas llegan a
  -- la vez, la segunda espera a que la primera termine y recibe su cupón.
  if p_token is not null then
    -- Dos llamadas con la misma clave se turnan ANTES de mirar los puntos: la segunda espera a la primera y recibe su cupón (sin esto,
    -- esperaría en el saldo y, al llegar su turno, vería «no alcanzan los puntos» en vez de su cupón).
    perform pg_advisory_xact_lock(hashtextextended('canjear_puntos:' || p_token::text, 0));
    select k.* into v_cupon from retail.club_cupones k where k.token = p_token;
    if found then
      if v_cupon.clienta_id <> p_clienta_id or v_cupon.puntos <> p_puntos or v_cupon.origen <> p_origen then
        raise exception 'Lo que mandas ahora no es lo que se mandó la primera vez con esta clave. Revisa si el canje anterior se guardó.'
          using errcode = 'P0001', hint = 'token_reusado';
      end if;
      return retail.fn_club_cupon_json(v_cupon, true);
    end if;
  end if;

  -- Lo vencido de esta miembro vuelve a su saldo ANTES de mirar si le alcanza.
  perform retail.fn_club_cupones_vencer(p_clienta_id);

  v_cfg := retail.fn_club_puntos_config(v_hoy);
  if p_puntos is null or p_puntos <= 0 or p_puntos % 100 <> 0 then
    raise exception 'Los puntos se canjean de 100 en 100.' using errcode = '22023', hint = 'canje_no_multiplo';
  end if;
  if p_puntos < v_cfg.canje_minimo_puntos then
    raise exception 'El canje mínimo es de % puntos.', v_cfg.canje_minimo_puntos using errcode = '22023', hint = 'canje_menor_al_minimo';
  end if;
  v_valor := retail.fn_club_puntos_valor(p_puntos, v_hoy);

  -- El canje y el cupón en UNA transacción: si el código choca (casi imposible), el intento entero se deshace —también el canje— y
  -- se prueba con otro. Nunca queda un canje sin cupón ni un cupón sin canje.
  loop
    v_intento := v_intento + 1;
    v_codigo := retail.fn_club_cupon_codigo_nuevo();
    begin
      v_mov := retail.fn_club_puntos_anotar(p_clienta_id, 'canje', -p_puntos, null, null, v_codigo, 'Canje por cupón', p_persona);
      insert into retail.club_cupones (codigo, clienta_id, puntos, valor, compra_minima, vence_el, origen, token, canje_movimiento_id, creado_por)
      values (v_codigo, p_clienta_id, p_puntos, v_valor, ceil(v_valor * v_cfg.compra_minima_x),
              v_hoy + v_cfg.vigencia_cupon_dias, p_origen, p_token, v_mov, p_persona)
      returning * into v_cupon;
      exit;
    exception when unique_violation then
      -- ¿Chocó el código (se reintenta) o la clave de la operación (otra llamada ganó la carrera: se devuelve su cupón)?
      select k.* into v_cupon from retail.club_cupones k where p_token is not null and k.token = p_token;
      if found then
        if v_cupon.clienta_id <> p_clienta_id or v_cupon.puntos <> p_puntos or v_cupon.origen <> p_origen then
          raise exception 'Lo que mandas ahora no es lo que se mandó la primera vez con esta clave. Revisa si el canje anterior se guardó.'
            using errcode = 'P0001', hint = 'token_reusado';
        end if;
        return retail.fn_club_cupon_json(v_cupon, true);
      end if;
      if v_intento >= 12 then
        raise exception 'No se pudo generar un código de cupón único: intenta de nuevo.' using errcode = 'P0001', hint = 'cupon_sin_codigo';
      end if;
    end;
  end loop;

  return retail.fn_club_cupon_json(v_cupon, false);
end;
$$;
comment on function retail.fn_club_cupon_crear(uuid, integer, uuid, text, uuid) is
  'Crea un cupón: descuenta los puntos (canje) y lo guarda en una sola transacción. La misma clave de operación devuelve el mismo cupón; el código es único con reintento. Interna: la llaman canjear_puntos y tienda_canjear_puntos.';
revoke all on function retail.fn_club_cupon_crear(uuid, integer, uuid, text, uuid) from public, anon, authenticated;

-- ---------- 5. Las dos puertas ----------
-- La caja: quien tiene el módulo Vender o Clientes canjea los puntos de la miembro del ticket.
create or replace function retail.canjear_puntos(p_clienta_id uuid, p_puntos integer, p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
begin
  if not (retail.fn_ve_modulo('vender') or retail.fn_ve_modulo('clientas')) then
    raise exception 'No tienes permiso para canjear puntos.' using errcode = '42501', hint = 'sin_permiso';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  return retail.fn_club_cupon_crear(p_clienta_id, p_puntos, p_token, 'caja', v_persona);
end;
$$;
comment on function retail.canjear_puntos(uuid, integer, uuid) is
  'Canjea puntos de una miembro por un cupón con código, desde la caja (módulo Vender o Clientes, con su responsable). La misma clave (p_token) devuelve el mismo cupón.';
revoke all on function retail.canjear_puntos(uuid, integer, uuid) from public, anon;
grant execute on function retail.canjear_puntos(uuid, integer, uuid) to authenticated;

-- La tienda web: el cliente canjea los suyos, con su cuenta.
create or replace function retail.tienda_canjear_puntos(p_usuario_web_id uuid, p_puntos integer, p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_clienta uuid;
begin
  if p_usuario_web_id is null then
    raise exception 'Entra con tu cuenta para canjear tus puntos.' using errcode = '42501', hint = 'sin_cuenta';
  end if;
  select w.clienta_id into v_clienta from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id and w.cerrada_en is null;
  if v_clienta is null then
    raise exception 'No encontramos tu cuenta.' using errcode = '42501', hint = 'sin_cuenta';
  end if;
  return retail.fn_club_cupon_crear(v_clienta, p_puntos, p_token, 'web', null);
end;
$$;
comment on function retail.tienda_canjear_puntos(uuid, integer, uuid) is
  'Canjea los puntos del cliente de la tienda web por un cupón con código. La llama el rol tienda_web con el usuario ya verificado por la web. La misma clave devuelve el mismo cupón.';
revoke all on function retail.tienda_canjear_puntos(uuid, integer, uuid) from public, anon, authenticated;
do $grant$
begin
  if exists (select 1 from pg_roles where rolname = 'tienda_web') then
    grant execute on function retail.tienda_canjear_puntos(uuid, integer, uuid) to tienda_web;
  end if;
end;
$grant$;
