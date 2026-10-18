-- ============================================================================
-- 20261016190000 — El depósito de la máquina se cruza contra los días pendientes y la diferencia es la comisión real
-- (ADR-0429; decisión 3 del ADR-0417; actividad 3 de 6)
--
-- EL PROBLEMA PRIMERO. Lo cobrado con tarjeta y QR espera en la cuenta «por depositar» de su máquina (actividades 1 y 2).
-- Izipay y Vendemás depositan en Interbank uno a tres días después, sin su comisión, y a veces varios días en un solo
-- depósito. Hasta hoy el «abono de tarjeta» se registraba tecleando el monto Y la comisión a mano: nada cruzaba el depósito
-- con lo cobrado, y la puente podía quedar con un saldo que nadie sabía de qué día era.
--
-- CONTRATO (Liskov)
--   PROMETE: `registrar_abono_pos(máquina, banco, fecha, neto, días, referencia, token)` toma los DÍAS pendientes marcados
--            (los renglones «cobros:<día>:<tienda>:<medio>» de la puente, los mismos que ve Conciliación), suma su bruto, y
--            registra UN abono por el neto que llegó con `comisión = bruto − neto` (el gasto 639 lo crea `registrar_movimiento_dinero`,
--            como siempre). Deja escrito qué días cubrió (`pos_abonos_lotes`): un día se liquida una sola vez mientras su abono
--            esté vigente; anular el abono los libera. `fn_pos_pendientes(máquina)` dice qué días siguen sin depósito y hace
--            cuántos días esperan. Todo o nada; idempotente por `token`.
--   ASUME:   solo el líder (la regla de siempre para el abono); la máquina es una cuenta «por depositar» y el destino un banco;
--            el depósito no es anterior al último día que cubre ni futuro; el neto no supera el bruto (una comisión negativa es
--            un error de marcado, no un dato).
--   NO HACE: no estima comisiones ni avisa de depósitos atrasados (actividad 4); no toca lo ya registrado a mano.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, después de 20261016173000. Una tabla nueva (RLS sin políticas: se lee por
-- funciones) y funciones nuevas; el texto «Abono de tarjeta» pasa a «Depósito de la máquina» con un reemplazo anclado sobre
-- la función viva. No toma ninguna tabla que use la tienda. Idempotente.
-- SE ROMPE SI: (1) la máquina deposita tarjeta y QR juntos y la persona marca solo los días de un medio: la comisión saldría
-- negativa y la función lo rechaza pidiendo marcar los dos; (2) una devolución con tarjeta cae en un día ya liquidado: el
-- renglón del día cambia de monto y Conciliación lo vuelve a pedir (`dinero_revisados` por monto), pero el lote ya está
-- cruzado con el bruto de entonces: la diferencia aparece como saldo en la puente, a la vista, hasta el próximo depósito.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

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

-- ---------- 1. Qué días cubrió cada depósito ----------
create table if not exists retail.pos_abonos_lotes (
  id uuid primary key default gen_random_uuid(),
  movimiento_dinero_id uuid not null references retail.movimientos_dinero (id),
  -- La cuenta «por depositar» de la máquina (la misma que el origen del abono).
  cuenta_id uuid not null references retail.cuentas_dinero (id),
  -- El renglón del libro que cubre: `cobros:<fecha>:<ubicacion_id>:<medio>`, el mismo que usa Conciliación.
  clave text not null check (clave like 'cobros:%'),
  fecha date not null,
  ubicacion_id uuid not null references retail.ubicaciones (id),
  medio text not null check (medio in ('tarjeta', 'qr')),
  -- Lo cobrado ese día con ese medio en esa tienda, al momento de liquidarlo.
  bruto numeric(12,2) not null,
  created_at timestamptz not null default now(),
  unique (movimiento_dinero_id, clave)
);
comment on table retail.pos_abonos_lotes is
  'Qué días (tienda y medio) cubrió cada depósito de una máquina de cobro (ADR-0429). La suma de sus brutos menos lo que llegó al banco es la comisión real del abono. Solo agrega filas: anular el abono libera sus días.';
create index if not exists pos_abonos_lotes_cuenta_clave_idx on retail.pos_abonos_lotes (cuenta_id, clave);
alter table retail.pos_abonos_lotes enable row level security;

create or replace function retail.fn_pos_abonos_lotes_inmutable() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  raise exception 'Los días que cubrió un depósito no se editan ni se borran: se anula el depósito y se registra de nuevo.' using errcode = 'P0001';
end $$;
create or replace trigger pos_abonos_lotes_inmutable before update or delete on retail.pos_abonos_lotes
  for each row execute function retail.fn_pos_abonos_lotes_inmutable();
revoke all on function retail.fn_pos_abonos_lotes_inmutable() from public, anon, authenticated;

-- ---------- 2. Lo que una máquina todavía no depositó ----------
-- Los renglones «cobros» de su cuenta puente que ningún abono vigente cubre, con cuántos días llevan esperando. Solo el líder.
create or replace function retail.fn_pos_pendientes(p_cuenta_id uuid)
returns table (clave text, fecha date, ubicacion_id uuid, ubicacion_nombre text, medio text, bruto numeric, dias integer)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_hoy date := retail.fn_hoy_lima();
begin
  perform retail.fn_exigir_lider_dinero('Ver lo que una máquina no depositó');
  if not exists (select 1 from retail.cuentas_dinero c where c.id = p_cuenta_id and c.tipo = 'por_abonar') then
    raise exception 'Esa cuenta no es la de una máquina de cobro («por depositar»).' using errcode = 'P0001';
  end if;
  return query
  select l.clave, l.fecha, l.ubicacion_id, u.nombre, split_part(l.clave, ':', 4), l.monto, (v_hoy - l.fecha)::integer
    from retail.fn_dinero_libro(v_hoy) l
    left join retail.ubicaciones u on u.id = l.ubicacion_id
   where l.cuenta_id = p_cuenta_id and l.origen = 'cobros' and l.monto <> 0
     and not exists (select 1 from retail.pos_abonos_lotes a join retail.movimientos_dinero d on d.id = a.movimiento_dinero_id
                      where a.cuenta_id = p_cuenta_id and a.clave = l.clave and d.estado = 'vigente')
   order by l.fecha, u.nombre, split_part(l.clave, ':', 4);
end $$;
comment on function retail.fn_pos_pendientes(uuid) is
  'ADR-0429: los días (tienda y medio) cobrados con una máquina que ningún depósito vigente cubre todavía, con su bruto y cuántos días esperan. Solo el líder.';
revoke all on function retail.fn_pos_pendientes(uuid) from public, anon;
grant execute on function retail.fn_pos_pendientes(uuid) to authenticated;

-- ---------- 3. Registrar el depósito y cruzarlo ----------
create or replace function retail.registrar_abono_pos(
  p_cuenta_id uuid,
  p_banco_id uuid,
  p_fecha date,
  p_neto numeric,
  p_claves text[],
  p_referencia text default null,
  p_token uuid default null
) returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_c retail.cuentas_dinero%rowtype;
  v_b retail.cuentas_dinero%rowtype;
  v_claves text[] := (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(p_claves, '{}')) x where x is not null and x <> '');
  v_fecha date := coalesce(p_fecha, retail.fn_hoy_lima());
  v_neto numeric := round(coalesce(p_neto, 0), 2);
  v_bruto numeric;
  v_ultimo date;
  v_n integer;
  v_comision numeric;
  v_id uuid;
begin
  perform retail.fn_exigir_lider_dinero('Registrar el depósito de una máquina');

  -- Doble clic / reintento: el mismo token devuelve el mismo abono (lo guarda `registrar_movimiento_dinero`).
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('movimientos_dinero:' || p_token::text, 0));
    select d.id into v_id from retail.movimientos_dinero d where d.token_cliente = p_token;
    if found then
      return (select jsonb_build_object('movimiento_id', d.id, 'neto', d.monto, 'comision', d.comision, 'bruto', d.monto + d.comision,
                                        'dias', (select count(*) from retail.pos_abonos_lotes a where a.movimiento_dinero_id = d.id))
                from retail.movimientos_dinero d where d.id = v_id);
    end if;
  end if;

  select * into v_c from retail.cuentas_dinero where id = p_cuenta_id;
  if not found or v_c.tipo <> 'por_abonar' then
    raise exception 'Elige la máquina: una cuenta «por depositar».' using errcode = 'P0001';
  end if;
  select * into v_b from retail.cuentas_dinero where id = p_banco_id;
  if not found or v_b.tipo <> 'banco' then
    raise exception 'El depósito llega a un banco.' using errcode = 'P0001';
  end if;
  if cardinality(v_claves) = 0 then
    raise exception 'Marca qué días cubre este depósito.' using errcode = 'P0001';
  end if;
  if v_neto <= 0 then
    raise exception 'Di cuánto llegó al banco.' using errcode = 'P0001';
  end if;
  if v_fecha > retail.fn_hoy_lima() then
    raise exception 'La fecha no puede ser futura.' using errcode = 'P0001';
  end if;

  -- Un depósito a la vez por máquina: dos personas no liquidan el mismo día dos veces.
  perform pg_advisory_xact_lock(hashtextextended('pos_abono:' || p_cuenta_id::text, 0));

  select count(*), coalesce(sum(p.bruto), 0), max(p.fecha) into v_n, v_bruto, v_ultimo
    from retail.fn_pos_pendientes(p_cuenta_id) p where p.clave = any (v_claves);
  if v_n <> cardinality(v_claves) then
    raise exception 'Alguno de esos días ya se liquidó o cambió: recarga la pantalla y vuelve a marcar.' using errcode = 'P0001';
  end if;
  if v_bruto <= 0 then
    raise exception 'Esos días no tienen nada cobrado por depositar.' using errcode = 'P0001';
  end if;
  if v_fecha < v_ultimo then
    raise exception 'El depósito (%) no puede ser anterior al último día que cubre (%).', to_char(v_fecha, 'DD/MM'), to_char(v_ultimo, 'DD/MM') using errcode = 'P0001';
  end if;
  v_comision := round(v_bruto - v_neto, 2);
  if v_comision < 0 then
    raise exception 'Llegó S/ % y esos días suman S/ %: el depósito no puede ser mayor que lo cobrado. Marca los días que faltan (¿tarjeta y QR juntos?) o revisa el monto.',
      to_char(v_neto, 'FM999G999G990D00'), to_char(v_bruto, 'FM999G999G990D00') using errcode = 'P0001';
  end if;

  -- El abono de siempre: baja la puente por el bruto, sube el banco por el neto y crea el gasto 639 de la comisión.
  v_id := retail.registrar_movimiento_dinero(
    p_tipo => 'abono_tarjeta', p_monto => v_neto, p_cuenta_origen_id => p_cuenta_id, p_cuenta_destino_id => p_banco_id,
    p_fecha => v_fecha, p_referencia => p_referencia, p_comision => v_comision, p_token => p_token);

  insert into retail.pos_abonos_lotes (movimiento_dinero_id, cuenta_id, clave, fecha, ubicacion_id, medio, bruto)
  select v_id, p_cuenta_id, p.clave, p.fecha, p.ubicacion_id, p.medio, p.bruto
    from retail.fn_pos_pendientes(p_cuenta_id) p where p.clave = any (v_claves);

  return jsonb_build_object('movimiento_id', v_id, 'bruto', v_bruto, 'neto', v_neto, 'comision', v_comision, 'dias', v_n);
end $$;
comment on function retail.registrar_abono_pos(uuid, uuid, date, numeric, text[], text, uuid) is
  'ADR-0429: el depósito de una máquina de cobro cruzado contra los días que cubre: un abono por el neto con comisión = bruto − neto y el rastro de qué días liquidó. Solo el líder; todo o nada; idempotente por token.';
revoke all on function retail.registrar_abono_pos(uuid, uuid, date, numeric, text[], text, uuid) from public, anon;
grant execute on function retail.registrar_abono_pos(uuid, uuid, date, numeric, text[], text, uuid) to authenticated;

-- ---------- 4. El nombre: lo que llega es el depósito de la máquina ----------
select pg_temp.reemplazar('retail.fn_texto_movimiento_dinero(text)',
$v$    when 'abono_tarjeta' then 'Abono de tarjeta'$v$,
$n$    when 'abono_tarjeta' then 'Depósito de la máquina'$n$, 1);
