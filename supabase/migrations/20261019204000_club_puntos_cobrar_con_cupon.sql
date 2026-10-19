-- ============================================================================
-- 20261019204000_club_puntos_cobrar_con_cupon.sql — CAYLA V2 · Club · puntos, actividad 4 de 12: cobrar con cupón
-- Sigue a `20261019203000_club_puntos_cupones.sql`. Tabla nueva `club_cupon_intentos` y funciones; y reemplazos ANCLADOS sobre
-- `registrar_venta` (dinero y boleta). Sin políticas y sin tocar tablas en uso (CLAUDE.md, «Políticas y deadlocks»).
--
-- EL PROBLEMA. La caja tiene que poder cobrar con el CÓDIGO de un cupón: el descuento se reparte por prenda (la boleta lleva el
-- descuento de cada línea), el cupón se gasta una sola vez aunque dos cajas lo intenten a la vez, lo puede usar cualquiera (al
-- portador) y, si la venta se anula, el cupón vuelve a vivir. Y nadie puede probar códigos hasta acertar uno.
--
-- QUÉ HACE
--   1. `fn_club_neto_items` y `fn_club_repartir_vale`: la regla del reparto, en un solo lugar de la base. Es la MISMA que ya usaba
--      el vale de aniversario y que la web replica (apps/web/lib/club-aniversario-canje-reglas.ts, `repartirVale`): céntimos enteros,
--      proporcional al neto de cada línea hacia abajo, y el resto de a 1 céntimo por unidad, de la mayor fracción a la menor.
--   2. `validar_cupon(código, total)`: lo que la caja pregunta ANTES de cobrar («¿sirve este código?»). Cuenta los códigos que no
--      existen (5 en 5 minutos bloquean los códigos en esa cuenta: nadie adivina cupones probando) y NUNCA revela de quién es más
--      que su nombre de pila.
--   3. `registrar_venta`: el código del cupón viaja en `p_codigo_descuento` (un parámetro que ya existía y que nadie usa desde el
--      2026-10-01: la firma NO cambia, así que nada de lo que ya llama a la función se rompe). La base lee el cupón con candado de fila,
--      exige que esté activo, vigente y que la compra llegue a su mínimo, calcula el reparto y rechaza una caja que mande otra
--      cosa; al guardar la venta, el cupón queda USADO con su venta y, si la compradora estaba identificada, con su ficha.
--   4. Un disparador: al anular una venta, el cupón que usó vuelve a vivir (o, si ya pasó su fecha, vence y devuelve sus puntos).
--
-- DECIDÍ: el cupón es al portador: puede usarlo una compra con otra ficha o SIN ficha; los puntos de esa compra son de quien se
--   identifica (si es miembro), no de la dueña del cupón. Un solo cupón por compra y no se junta con el 10 % de cumpleaños ni con
--   el vale de aniversario (esos se retiran en la actividad 11; mientras tanto, `club_un_cupon_por_compra`).
-- DECIDÍ: una pieza de liquidación no se vende con un cupón (precio final, sin regalos del club): `liquidacion_sin_descuentos`.
-- DESCARTÉ: cambiar la firma de `registrar_venta` (rompe las pruebas, la cola sin conexión del navegador y el tipo de la web) y
--   registrar los códigos fallidos desde `registrar_venta` (un error deshace lo que se escribió: el registro vive en `validar_cupon`).
-- SE ROMPE SI: `registrar_venta` se redefine otra vez y pierde estos trozos (la prueba (n) mira el texto vivo), o si alguien cambia
--   `fn_club_repartir_vale` sin cambiar la regla de la web (la prueba (b) las compara con la tabla de ejemplos).
--
-- CÓMO SE PEGA: este archivo SOLO en el SQL Editor de producción, después de `20261019203000`. Idempotente. Los reemplazos son
-- anclados: si un trozo no está exactamente una vez, la migración se detiene sin tocar nada. `lock_timeout` 3 s. Dentro de los
-- textos entre comillas no hay ningún `select … into` (ADR-0288: el SQL Editor lo confunde con un SELECT INTO).
-- CAÍDA EXTERNA. Nada de esto llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. La regla del reparto ----------
-- Lo que queda por descontar de cada línea, en céntimos, SIN la parte del club: Σ (precio − (descuento total − parte del club)) × cantidad.
create or replace function retail.fn_club_neto_items(p_items jsonb)
returns bigint
language sql
immutable
set search_path = retail, public, extensions
as $$
  select coalesce(sum(greatest(
           round((e ->> 'precio_unitario')::numeric * 100)
             - round((coalesce((e ->> 'descuento_unitario')::numeric, 0) - coalesce((e ->> 'descuento_club_unitario')::numeric, 0)) * 100), 0)::bigint
           * (e ->> 'cantidad')::integer), 0)
    from jsonb_array_elements(p_items) e;
$$;
comment on function retail.fn_club_neto_items(jsonb) is
  'El neto de la compra en céntimos sin la parte del club (lo que el cupón puede descontar). Es el total contra el que se mide la compra mínima.';
revoke all on function retail.fn_club_neto_items(jsonb) from public, anon;
grant execute on function retail.fn_club_neto_items(jsonb) to authenticated;

-- El reparto de un monto entre las líneas: la parte POR UNIDAD de cada línea, en soles, en el orden de p_items. Nunca pasa el neto
-- de una línea, ni el total, ni el monto.
create or replace function retail.fn_club_repartir_vale(p_items jsonb, p_monto numeric)
returns numeric[]
language plpgsql
immutable
set search_path = retail, public, extensions
as $$
declare
  v_netos bigint[] := '{}';
  v_cants integer[] := '{}';
  v_unid bigint[] := '{}';
  v_orden integer[];
  v_total bigint := 0;
  v_vale bigint;
  v_resto bigint;
  v_neto bigint;
  v_q integer;
  v_sumo boolean := true;
  v_i integer;
  v_item jsonb;
  v_partes numeric[] := '{}';
begin
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_q := (v_item ->> 'cantidad')::integer;
    if v_q is null or v_q <= 0 then
      raise exception 'La cantidad de cada prenda tiene que ser mayor que cero.';
    end if;
    v_neto := greatest(round((v_item ->> 'precio_unitario')::numeric * 100)
                       - round((coalesce((v_item ->> 'descuento_unitario')::numeric, 0)
                                - coalesce((v_item ->> 'descuento_club_unitario')::numeric, 0)) * 100), 0)::bigint;
    v_netos := v_netos || v_neto;
    v_cants := v_cants || v_q;
    v_total := v_total + v_neto * v_q;
  end loop;
  if v_total <= 0 then
    raise exception 'En esta venta no queda nada que descontar con el cupón: no se canjea.' using hint = 'cupon_sin_monto';
  end if;
  v_vale := least(greatest(round(p_monto * 100), 0)::bigint, v_total);
  -- Una venta en S/ 0 no se puede cobrar (todo pago es mayor que cero) ni emitir: un cupón que cubre TODA la compra se rechaza
  -- con un aviso claro. (La compra mínima de 3 veces su valor lo evita; esto es el candado de atrás.)
  if v_vale >= v_total then
    raise exception 'El cupón cubre toda la compra, y una venta en S/ 0 no se puede cobrar ni emitir: suma otra prenda o úsalo en una compra mayor.'
      using hint = 'cupon_cubre_todo';
  end if;
  v_resto := v_vale;
  for i in 1 .. array_length(v_netos, 1) loop
    v_unid := v_unid || ((v_vale * v_netos[i]) / v_total);
    v_resto := v_resto - v_unid[i] * v_cants[i];
  end loop;
  v_orden := (select array_agg(g.i order by (v_vale * v_netos[g.i]) % v_total desc, g.i)
                from generate_subscripts(v_netos, 1) as g(i));
  while v_resto > 0 and v_sumo loop
    v_sumo := false;
    foreach v_i in array v_orden loop
      continue when v_cants[v_i] > v_resto or v_unid[v_i] >= v_netos[v_i];
      v_unid[v_i] := v_unid[v_i] + 1;
      v_resto := v_resto - v_cants[v_i];
      v_sumo := true;
      exit when v_resto = 0;
    end loop;
  end loop;
  for i in 1 .. array_length(v_unid, 1) loop
    v_partes := v_partes || round(v_unid[i]::numeric / 100, 2);
  end loop;
  return v_partes;
end;
$$;
comment on function retail.fn_club_repartir_vale(jsonb, numeric) is
  'Reparte un monto del Club entre las líneas de una venta, en céntimos enteros: la MISMA regla que repartirVale de la web. Devuelve la parte por unidad de cada línea. Rechaza una venta sin nada que descontar y un monto que cubre toda la compra.';
revoke all on function retail.fn_club_repartir_vale(jsonb, numeric) from public, anon;
grant execute on function retail.fn_club_repartir_vale(jsonb, numeric) to authenticated;

-- ---------- 2. Preguntar antes de cobrar: «¿sirve este código?» ----------
create table if not exists retail.club_cupon_intentos (
  id        bigint generated always as identity primary key,
  clave     uuid not null,
  creado_en timestamptz not null default now()
);
comment on table retail.club_cupon_intentos is
  'Los códigos de cupón que NO existían, por cuenta (auth.uid()): 5 en 5 minutos bloquean los códigos de esa cuenta. Se limpian solos a las 24 horas. RLS sin políticas y sin permisos para la API.';
create index if not exists club_cupon_intentos_clave_idx on retail.club_cupon_intentos (clave, creado_en desc);
alter table retail.club_cupon_intentos enable row level security;
revoke all on retail.club_cupon_intentos from public, anon, authenticated;

create or replace function retail.validar_cupon(p_codigo text, p_total numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_clave uuid := auth.uid();
  v_k retail.club_cupones;
  v_fallos integer;
  v_nombre text;
begin
  if not (retail.fn_ve_modulo('vender') or retail.fn_ve_modulo('clientas')) then
    raise exception 'No tienes permiso para usar cupones.' using errcode = '42501', hint = 'sin_permiso';
  end if;
  if v_clave is null then
    raise exception 'Entra a tu cuenta para usar cupones.' using errcode = '42501', hint = 'sin_permiso';
  end if;
  delete from retail.club_cupon_intentos where creado_en < now() - interval '24 hours';

  select count(*) into v_fallos from retail.club_cupon_intentos i where i.clave = v_clave and i.creado_en > now() - interval '5 minutes';
  if v_fallos >= 5 then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado');
  end if;

  select k.* into v_k from retail.club_cupones k where k.codigo = v_codigo;
  if v_k.id is null then
    insert into retail.club_cupon_intentos (clave) values (v_clave);
    return jsonb_build_object('ok', false, 'motivo', 'no_existe', 'intentos', v_fallos + 1);
  end if;
  if v_k.estado = 'usado' then
    return jsonb_build_object('ok', false, 'motivo', 'usado');
  end if;
  if v_k.estado = 'vencido' or v_k.vence_el < v_hoy then
    return jsonb_build_object('ok', false, 'motivo', 'vencido', 'vence_el', v_k.vence_el);
  end if;
  if p_total is not null and p_total < v_k.compra_minima then
    return jsonb_build_object('ok', false, 'motivo', 'minimo', 'compra_minima', v_k.compra_minima, 'faltan', v_k.compra_minima - p_total);
  end if;

  select retail.fn_club_nombre_de_pila(c.nombre) into v_nombre from retail.clientas c where c.id = v_k.clienta_id and not c.anonimizada;
  return jsonb_build_object('ok', true, 'codigo', v_k.codigo, 'valor', v_k.valor, 'compra_minima', v_k.compra_minima,
                            'vence_el', v_k.vence_el, 'puntos', v_k.puntos, 'de', v_nombre);
end;
$$;
comment on function retail.validar_cupon(text, numeric) is
  'La caja pregunta si un código de cupón sirve ANTES de cobrar: ok con su valor, o el motivo (no_existe, usado, vencido, minimo, bloqueado). Cuenta los códigos que no existen: 5 en 5 minutos bloquean la cuenta. Solo revela el nombre de pila de la dueña.';
revoke all on function retail.validar_cupon(text, numeric) from public, anon;
grant execute on function retail.validar_cupon(text, numeric) to authenticated;

-- ---------- 3. Anular la venta devuelve el cupón ----------
create or replace function retail.fn_club_cupon_al_anular_venta()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_c record;
begin
  begin
    for v_c in
      select k.id, k.clienta_id, k.puntos, k.canje_movimiento_id, k.codigo, k.vence_el
        from retail.club_cupones k where k.venta_id = new.id and k.estado = 'usado' for update
    loop
      if v_c.vence_el >= v_hoy then
        -- Sigue vigente: vuelve a vivir con el tiempo que le quedaba.
        update retail.club_cupones set estado = 'activo', usado_en = null, venta_id = null, usado_por_clienta_id = null where id = v_c.id;
      else
        -- Ya pasó su fecha: vence ahora y devuelve sus puntos (una sola vez).
        update retail.club_cupones set estado = 'vencido', vencido_en = now(), usado_en = null, venta_id = null, usado_por_clienta_id = null where id = v_c.id;
        begin
          perform retail.fn_club_puntos_anotar(v_c.clienta_id, 'devuelve', v_c.puntos, null, null, v_c.codigo, 'Cupón vencido', null, v_c.canje_movimiento_id);
        exception when others then
          raise warning 'puntos: no se devolvieron los del cupón % (%)', v_c.codigo, sqlerrm;
        end;
      end if;
    end loop;
  exception when others then
    raise warning 'puntos: no se devolvió el cupón de la venta anulada % (%)', new.id, sqlerrm;
  end;
  return null;
end;
$$;
comment on function retail.fn_club_cupon_al_anular_venta() is
  'Disparador de ventas: al anular una venta, el cupón que usó vuelve a vivir (o, si ya pasó su fecha, vence y devuelve sus puntos). No puede tumbar la anulación.';
revoke all on function retail.fn_club_cupon_al_anular_venta() from public, anon, authenticated;

create or replace trigger trg_club_cupon_al_anular_venta
  after update of estado on retail.ventas
  for each row
  when (new.estado = 'anulada' and old.estado is distinct from 'anulada')
  execute function retail.fn_club_cupon_al_anular_venta();

-- ---------- 4. registrar_venta: el cupón en la venta (reemplazos anclados) ----------
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

-- 4a. La variable del cupón.
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$  v_idx integer := 0;$v$,
  $v$  v_cup retail.club_cupones;            -- el cupón del Club que se usa en esta venta (su código viaja en p_codigo_descuento)
  v_idx integer := 0;$v$,
  1);

-- 4b. Un solo cupón por compra: el cupón no se junta con el 10 % de cumpleaños ni con el vale de aniversario.
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$  if p_canjear_cumpleanos and p_canjear_aniversario then$v$,
  $v$  if nullif(btrim(coalesce(p_codigo_descuento, '')), '') is not null and (p_canjear_cumpleanos or p_canjear_aniversario) then
    raise exception 'El cupón no se junta con el cumpleaños ni con el vale de aniversario: elige uno.'
      using hint = 'club_un_cupon_por_compra';
  end if;
  if p_canjear_cumpleanos and p_canjear_aniversario then$v$,
  1);

-- 4c. El cupón: leerlo con candado, validarlo y calcular su reparto (antes de mirar las líneas).
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'venta');$v$,
  $v$  -- Puntos del Club (actividad 4): el cupón. Cobrar manda el CÓDIGO (en p_codigo_descuento) y el reparto por línea; la base lee el
  -- cupón con candado de fila (dos cajas con el mismo cupón se turnan: la segunda lo ve usado), exige que esté activo, vigente y que la
  -- compra llegue a su mínimo, y calcula el reparto con la misma regla de la web. Es al portador: no importa de quién es.
  if nullif(btrim(coalesce(p_codigo_descuento, '')), '') is not null then
    select k.* into v_cup from retail.club_cupones k where k.codigo = upper(btrim(p_codigo_descuento)) for update;
    -- Un reintento de ESTA venta que esperó en el cupón mientras la primera se guardaba: ya está, se devuelve.
    if p_token is not null then
      select * into v_existente from ventas where token_cliente = p_token;
      if found then return v_existente.id; end if;
    end if;
    if v_cup.id is null then
      raise exception 'Ese cupón no existe: revisa el código.' using hint = 'cupon_no_existe';
    end if;
    if v_cup.estado = 'usado' then
      raise exception 'Ese cupón ya se usó.' using hint = 'cupon_ya_usado';
    end if;
    if v_cup.estado = 'vencido' or v_cup.vence_el < v_hoy then
      raise exception 'Ese cupón venció el %.', to_char(v_cup.vence_el, 'DD/MM/YYYY') using hint = 'cupon_vencido';
    end if;
    if retail.fn_club_neto_items(p_items) < round(v_cup.compra_minima * 100) then
      raise exception 'Este cupón pide una compra de S/ % o más.', v_cup.compra_minima
        using hint = 'cupon_compra_minima', detail = v_cup.compra_minima::text;
    end if;
    v_aniv_partes := retail.fn_club_repartir_vale(p_items, v_cup.valor);
  end if;

  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'venta');$v$,
  1);

-- 4d. Cada línea: la parte del cupón que manda la caja tiene que ser la que calcula la base.
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$    if p_canjear_aniversario then
      -- ADR-0288 G-13: la parte del vale de esta línea$v$,
  $v$    if v_cup.id is not null then
      -- Puntos del Club: la parte del cupón de esta línea es la del reparto de arriba, exacta al céntimo.
      if v_club <> v_aniv_partes[v_idx] then
        raise exception 'El cupón en % no es el que corresponde (S/% y la caja mandó S/%). Vuelve a abrir el cobro.',
          v_referencia || ' (' || v_sku || ')', v_aniv_partes[v_idx], v_club
          using detail = v_referencia || ' (' || v_sku || ')', hint = 'cupon_descuento_distinto';
      end if;
      v_club_monto := v_club_monto + v_club * (v_item ->> 'cantidad')::integer;
    elsif p_canjear_aniversario then
      -- ADR-0288 G-13: la parte del vale de esta línea$v$,
  1);

-- 4e. Un cupón que no descuenta nada se gastaría por nada.
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$  -- ADR-0288 G-13: un vale que no descuenta nada gastaría el aniversario por nada.$v$,
  $v$  -- Puntos del Club: un cupón que no descuenta nada se gastaría por nada.
  if v_cup.id is not null and v_club_monto <= 0 then
    raise exception 'En esta venta no queda nada que descontar con el cupón: no se canjea.' using hint = 'cupon_sin_monto';
  end if;
  -- ADR-0288 G-13: un vale que no descuenta nada gastaría el aniversario por nada.$v$,
  1);

-- 4f. Guardar la venta y gastar el cupón en la MISMA transacción.
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$  for v_item in select * from jsonb_array_elements(p_items) loop
    select costo into v_costo from variantes where id = (v_item ->> 'variante_id')::uuid;
    if v_costo is null then$v$,
  $v$  -- Puntos del Club: el cupón queda USADO con su venta (y con la ficha de quien compró, si estaba identificada). Ya está bloqueado:
  -- nadie más lo usó entre la lectura y aquí.
  if v_cup.id is not null then
    update retail.club_cupones set estado = 'usado', usado_en = now(), venta_id = v_venta_id, usado_por_clienta_id = p_cliente_id
     where id = v_cup.id and estado = 'activo';
    if not found then
      raise exception 'Ese cupón ya se usó.' using hint = 'cupon_ya_usado';
    end if;
    -- La actividad, sin datos de la clienta ni de la dueña: la venta y cuánto descontó. Si no se anota, la venta sigue.
    begin
      perform retail.fn_actividad_anotar(
        'vender', 'cupon_club_usado',
        'usó un cupón del club: ' || retail.fn_actividad_soles(v_club_monto),
        v_persona, (select v.terminal_id from ventas v where v.id = v_venta_id), p_ubicacion_id, null,
        'ventas', v_venta_id::text, now(),
        jsonb_build_object('valor', v_cup.valor, 'monto', v_club_monto), 'vivo');
    exception when others then
      raise warning 'actividad: no se anotó el cupón de la venta % (%)', v_venta_id, sqlerrm;
    end;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select costo into v_costo from variantes where id = (v_item ->> 'variante_id')::uuid;
    if v_costo is null then$v$,
  1);

-- 4g. Una pieza de liquidación no se vende con un cupón (precio final, sin regalos del club). Solo si la función la conoce.
do $liq$
declare
  v_def text := pg_get_functiondef('retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)'::regprocedure);
begin
  if position('fn_validar_linea_liquidacion' in v_def) > 0 then
    perform pg_temp.reemplazar(
      'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
      $v$fn_validar_linea_liquidacion(v_item, p_ubicacion_id, p_canjear_cumpleanos or p_canjear_aniversario);$v$,
      $v$fn_validar_linea_liquidacion(v_item, p_ubicacion_id, p_canjear_cumpleanos or p_canjear_aniversario
                                      or nullif(btrim(coalesce(p_codigo_descuento, '')), '') is not null);$v$,
      1);
  end if;
end;
$liq$;
