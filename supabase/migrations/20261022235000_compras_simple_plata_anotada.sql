-- ============================================================================
-- 20261022235000_compras_simple_plata_anotada.sql — CAYLA V2 · ADR-0480 (Compras simple), actividad 2
-- La compradora anota la plata que le dieron para comprar; Compras la confirma.
--
-- EL PROBLEMA PRIMERO. Hasta hoy la plata para comprar solo existía si alguien con «Fondos por rendir» la entregaba desde el escritorio
-- (`entregar_fondo`). En la calle pasa al revés: a la compradora le hacen un Yape o una transferencia, o le dan efectivo, y ella sale a
-- comprar. Felipe (2026-10-22, maqueta aprobada) decidió que **la misma compradora la anota desde el celular** (cómo le llegó, cuánto y la
-- foto del voucher) y que **Compras la confirma** en «Revisar compras». Mientras tanto ya puede usarla: sale «por confirmar».
--
-- QUÉ CREA
--   1. `fondo_plata_anotada`: cada plata que anotó una compradora. Nace «por_confirmar» y pasa una sola vez a «confirmada» (con el monto
--      que confirmó Compras, quién y cuándo). Nunca se borra ni se edita después (disparador). RLS encendido y SIN políticas: solo se lee
--      y se escribe por las funciones de abajo (ADR-0195: así la tabla no necesita `create policy`).
--   2. Al confirmar una plata que le llegó (transferencia, Yape o Plin, efectivo), la entrega al fondo de la compradora pasa por
--      `entregar_fondo`, desde la cuenta que eligió Compras (la pantalla sugiere el BCP: Felipe 2026-10-22). Así cada banco cuadra solo y
--      todo lo de los fondos (rendición, Balance, Diario) la ve como cualquier entrega.
--   3. «Ya tenía plata del fondo» (solo la primera vez, antes de su primer fondo): al confirmarla es el SALDO INICIAL de su fondo, con su
--      fecha (Felipe 2026-10-22: «saldo de apertura»). No le resta a ningún banco: esa plata salió antes del sistema. Es lo mismo que una
--      cuenta de dinero que nace después del arranque (el Balance ya lo explica: «… empieza con su saldo el …»). Por eso se afloja
--      `cuentas_dinero_fondo_sin_saldo`: un fondo puede empezar con saldo, pero solo con su fecha.
--   4. `fn_fondos` (la tabla «Quién tiene plata») sumaba solo los movimientos: ahora suma el saldo inicial al saldo y a «le entregaste»,
--      para que la fila cuadre (le entregaste − devolvió − gastó = tiene).
--   5. `fn_resolver_intento` sabe revisar «anotar_plata_compras» (la marca de cada envío sigue a lo que se manda, /chaos 2026-10-14).
--   6. Lecturas: `fn_mi_plata_compras()` (la compradora: cuánto tiene, lo por confirmar, lo que anotó) y `fn_plata_por_confirmar()`
--      (Compras: lo que falta confirmar, con su voucher).
--
-- PERMISOS. Anotar: el módulo «Mi plata para compras» (`ordenes_compra`), y la plata es de quien firma (`fn_actor_persona_id(true)`: con
-- su cuenta, ella; desde una terminal, el responsable del combo). Confirmar: el módulo «Revisar compras» (`fondos`), y nadie confirma su
-- propia plata (`fn_fondo_exigir_otra_persona`).
--
-- DESCARTÉ
--   · Un tipo de movimiento nuevo para «ya tenía» (Debe 1413 / Haber 591): obligaba a parchar ocho funciones que distinguen tipos
--     (validación, Diario, flujo de caja, listas de fondos). El saldo inicial ya lo entienden el saldo del fondo, la rendición y el Balance.
--   · Mover la plata al fondo en el momento de anotarla: un voucher falso de S/ 5 000 le restaría al BCP hasta que alguien lo viera.
--     Confirmando, el libro solo tiene lo que Compras miró. Mientras tanto, si la compradora gasta lo que aún no se confirma, su fondo
--     queda en negativo: es lo que CAYLA le debe (decisión 32), y al confirmar se compensa.
--   · Un depósito nuevo para la foto del voucher: va al de los gastos del viaje (`retail-gastos-viaje`), carpeta `plata/`, que ya leen
--     justo quien compra (`ordenes_compra`) y quien revisa (`fondos`). Sin políticas nuevas.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, después de 20261022225000). Una sola parte, sin políticas ni `drop trigger`: una
-- tabla nueva, una restricción cambiada en `cuentas_dinero` (con `lock_timeout`), funciones nuevas y dos reemplazos ANCLADOS
-- (`fn_fondos`, `fn_resolver_intento`): si su texto en producción no es el esperado, abortan sin cambiar nada. Idempotente. Sin
-- `select … into` dentro de textos entre comillas (ADR-0288).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 0. Las dos acciones firman sin combo con la cuenta de una persona (desde una terminal, el combo) ----------
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('plata_anotar', 'Anotar la plata que te dieron para comprar (con la cuenta de una persona firma ella, desde una terminal se elige quién)'),
  ('plata_confirmar', 'Confirmar la plata que anotó una compradora (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

-- ---------- 1. La plata anotada ----------
create table if not exists retail.fondo_plata_anotada (
  id uuid primary key default gen_random_uuid(),
  -- La compradora: la dueña del fondo al que va la plata.
  persona_id uuid not null references public.personas (id),
  medio text not null check (medio in ('transferencia', 'yape_plin', 'efectivo', 'ya_tenia')),
  monto numeric(12, 2) not null check (monto > 0 and monto <= 1000000),
  -- La foto del voucher (opcional): una ruta del depósito `retail-gastos-viaje`, carpeta `plata/`.
  foto_ruta text check (foto_ruta is null or (foto_ruta like 'plata/%' and char_length(foto_ruta) <= 300)),
  fecha date not null,
  estado text not null default 'por_confirmar' check (estado in ('por_confirmar', 'confirmada')),
  monto_confirmado numeric(12, 2) check (monto_confirmado is null or (monto_confirmado > 0 and monto_confirmado <= 1000000)),
  -- De dónde salió (solo la plata que le llegó; «ya tenía» no sale de ninguna cuenta) y el movimiento que la puso en su fondo.
  cuenta_origen_id uuid references retail.cuentas_dinero (id),
  movimiento_id uuid unique references retail.movimientos_dinero (id),
  confirmada_por uuid references public.personas (id),
  confirmada_en timestamptz,
  anotada_por uuid not null references public.personas (id),
  token_cliente uuid unique,
  created_at timestamptz not null default now(),
  constraint fondo_plata_anotada_estado check (
    (estado = 'por_confirmar' and monto_confirmado is null and cuenta_origen_id is null and movimiento_id is null
       and confirmada_por is null and confirmada_en is null)
    or (estado = 'confirmada' and monto_confirmado is not null and confirmada_por is not null and confirmada_en is not null
       and ((medio = 'ya_tenia') = (cuenta_origen_id is null)) and ((medio = 'ya_tenia') = (movimiento_id is null)))
  )
);
comment on table retail.fondo_plata_anotada is
  'ADR-0480: la plata que una compradora anotó para comprar (cómo le llegó, cuánto, el voucher) y su confirmación por Compras.';

-- «Ya tenía plata del fondo» se anota una sola vez por persona.
create unique index if not exists fondo_plata_anotada_ya_tenia_uq on retail.fondo_plata_anotada (persona_id) where medio = 'ya_tenia';
create index if not exists fondo_plata_anotada_por_confirmar on retail.fondo_plata_anotada (created_at) where estado = 'por_confirmar';
create index if not exists fondo_plata_anotada_persona on retail.fondo_plata_anotada (persona_id, created_at desc);

alter table retail.fondo_plata_anotada enable row level security;
revoke all on retail.fondo_plata_anotada from anon, authenticated;

-- Una plata anotada no se borra y solo cambia una vez: de «por confirmar» a «confirmada», sin tocar lo que anotó la compradora.
create or replace function retail.fn_fondo_plata_anotada_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'La plata anotada no se borra.' using errcode = 'P0001';
  end if;
  if old.estado <> 'por_confirmar' or new.estado <> 'confirmada'
     or (new.id, new.persona_id, new.medio, new.monto, new.foto_ruta, new.fecha, new.anotada_por, new.token_cliente, new.created_at)
        is distinct from (old.id, old.persona_id, old.medio, old.monto, old.foto_ruta, old.fecha, old.anotada_por, old.token_cliente, old.created_at) then
    raise exception 'La plata anotada solo cambia al confirmarla, una vez.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace trigger fondo_plata_anotada_inmutable
  before update or delete on retail.fondo_plata_anotada
  for each row execute function retail.fn_fondo_plata_anotada_inmutable();

-- ---------- 2. Un fondo puede empezar con saldo, con su fecha (el de «ya tenía») ----------
alter table retail.cuentas_dinero drop constraint if exists cuentas_dinero_fondo_sin_saldo;
alter table retail.cuentas_dinero add constraint cuentas_dinero_fondo_sin_saldo
  check (tipo <> 'fondo' or (saldo_inicial = 0 and saldo_desde is null) or (saldo_inicial > 0 and saldo_desde is not null));

-- ---------- 3. Anotar la plata (la compradora) ----------
create or replace function retail.anotar_plata_compras(
  p_medio text,
  p_monto numeric,
  p_foto_ruta text default null,
  p_token uuid default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_id uuid;
  v_monto numeric := round(p_monto, 2);
  v_foto text := nullif(trim(coalesce(p_foto_ruta, '')), '');
  v_persona uuid;
begin
  if not retail.fn_ve_modulo('ordenes_compra') then
    raise exception 'Anotar plata para comprar necesita el módulo Mi plata para compras en tu rol.' using errcode = '42501';
  end if;
  -- El token sigue al contenido (/chaos 2026-10-14): el mismo token con otra plata se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('anotar_plata_compras', p_token, md5(jsonb_build_array(p_medio, p_monto::text, v_foto)::text));
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('fondo_plata_anotada:' || p_token::text, 0));
    v_id := (select a.id from retail.fondo_plata_anotada a where a.token_cliente = p_token);
    if v_id is not null then
      return v_id;
    end if;
  end if;

  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'Elige quién anota la plata.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_medio is null or p_medio not in ('transferencia', 'yape_plin', 'efectivo', 'ya_tenia') then
    raise exception 'Elige cómo te llegó la plata.' using errcode = 'P0001';
  end if;
  if v_monto is null or v_monto = 'NaN'::numeric or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if v_monto > 1000000 then
    raise exception 'El monto es demasiado grande: revísalo.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if v_foto is not null and (v_foto not like 'plata/%' or char_length(v_foto) > 300) then
    raise exception 'La foto del voucher no se subió bien: vuelve a elegirla.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fondo:' || v_persona::text, 0));
  -- «Ya tenía» es solo la primera vez: antes de cualquier fondo y de cualquier otra plata anotada.
  if p_medio = 'ya_tenia' and (
       exists (select 1 from retail.cuentas_dinero c where c.tipo = 'fondo' and c.persona_id = v_persona)
       or exists (select 1 from retail.fondo_plata_anotada a where a.persona_id = v_persona)) then
    raise exception '«Ya tenía plata» se anota solo la primera vez. Lo que te sobró ya está en tu plata.' using errcode = 'P0001', hint = 'ya_tenia_solo_primera_vez';
  end if;

  insert into retail.fondo_plata_anotada (persona_id, medio, monto, foto_ruta, fecha, anotada_por, token_cliente)
  values (v_persona, p_medio, v_monto, v_foto, retail.fn_hoy_lima(), v_persona, p_token)
  returning id into v_id;

  -- Actividad (ADR-0207), en el módulo donde vive el botón. Si falla, igual queda.
  begin
    perform retail.fn_actividad_anotar('ordenes_compra', 'plata_anotada',
      case p_medio when 'ya_tenia' then 'anotó la plata para compras que ya tenía' else 'anotó plata para compras que le dieron' end,
      v_persona, retail.fn_actividad_terminal_ahora(), null, null, 'fondo_plata_anotada', v_id::text, now(),
      jsonb_build_object('medio', p_medio), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la plata %: %', v_id, sqlerrm;
  end;
  return v_id;
exception when unique_violation then
  if p_token is not null and exists (select 1 from retail.fondo_plata_anotada a where a.token_cliente = p_token) then
    return (select a.id from retail.fondo_plata_anotada a where a.token_cliente = p_token);
  end if;
  if p_medio = 'ya_tenia' then
    raise exception '«Ya tenía plata» se anota solo la primera vez. Lo que te sobró ya está en tu plata.' using errcode = 'P0001', hint = 'ya_tenia_solo_primera_vez';
  end if;
  raise;
end $$;

-- ---------- 4. Confirmar la plata (Compras) ----------
-- Volver a confirmar lo mismo (un doble clic, un reintento tras un corte) devuelve lo que ya quedó; con otros datos, lo dice.
create or replace function retail.confirmar_plata_compras(
  p_id uuid,
  p_monto numeric default null,
  p_cuenta_origen_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_a retail.fondo_plata_anotada%rowtype;
  v_monto numeric;
  v_actor uuid;
  v_fondo uuid;
  v_mov uuid;
  v_inicial numeric;
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Confirmar la plata necesita el módulo Revisar compras en tu rol.' using errcode = '42501';
  end if;
  for v_a in select * from retail.fondo_plata_anotada a where a.id = p_id for update loop
    exit;
  end loop;
  if v_a.id is null then
    raise exception 'Esa plata anotada no existe.' using errcode = 'P0001';
  end if;
  v_monto := round(coalesce(p_monto, v_a.monto), 2);

  if v_a.estado = 'confirmada' then
    if v_a.monto_confirmado = v_monto and v_a.cuenta_origen_id is not distinct from (case when v_a.medio = 'ya_tenia' then null else p_cuenta_origen_id end) then
      return jsonb_build_object('id', v_a.id, 'monto', v_a.monto_confirmado, 'movimiento_id', v_a.movimiento_id);
    end if;
    raise exception 'Esa plata ya se confirmó con otros datos: recarga la pantalla.' using errcode = 'P0001', hint = 'plata_ya_confirmada';
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién confirma la plata.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_fondo_exigir_otra_persona(v_a.persona_id, v_actor, 'Nadie confirma su propia plata');
  if v_monto is null or v_monto = 'NaN'::numeric or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if v_monto > 1000000 then
    raise exception 'El monto es demasiado grande: revísalo.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;

  if v_a.medio = 'ya_tenia' then
    -- El saldo inicial de su fondo, con la fecha en que lo anotó (es su primera plata: nada en su fondo es de antes).
    perform pg_advisory_xact_lock(hashtextextended('fondo:' || v_a.persona_id::text, 0));
    v_fondo := retail.fn_fondo_de(v_a.persona_id, true);
    v_inicial := (select c.saldo_inicial from retail.cuentas_dinero c where c.id = v_fondo);
    if coalesce(v_inicial, 0) <> 0 then
      raise exception 'Su fondo ya tiene la plata que tenía antes: no se anota dos veces.' using errcode = 'P0001';
    end if;
    perform set_config('retail.editando_cuenta', 'si', true);
    update retail.cuentas_dinero
       set saldo_inicial = v_monto,
           saldo_desde = least(v_a.fecha, coalesce((select min(d.fecha) from retail.movimientos_dinero d
                                                     where v_fondo in (d.cuenta_origen_id, d.cuenta_destino_id)), v_a.fecha))
     where id = v_fondo;
    perform set_config('retail.editando_cuenta', '', true);
  else
    if p_cuenta_origen_id is null then
      raise exception 'Elige de qué cuenta salió la plata.' using errcode = 'P0001';
    end if;
    -- La entrega es la de siempre: valida la cuenta (banco, caja fuerte o lo del líder), la fecha y que no sea su propio fondo.
    v_mov := retail.entregar_fondo(v_a.persona_id, p_cuenta_origen_id, v_monto,
      left('Plata para compras que anotó (' ||
           case v_a.medio when 'transferencia' then 'transferencia' when 'yape_plin' then 'Yape o Plin' else 'efectivo' end || ')', 200),
      v_a.fecha, null);
  end if;

  update retail.fondo_plata_anotada
     set estado = 'confirmada', monto_confirmado = v_monto,
         cuenta_origen_id = case when v_a.medio = 'ya_tenia' then null else p_cuenta_origen_id end,
         movimiento_id = v_mov, confirmada_por = v_actor, confirmada_en = now()
   where id = v_a.id;

  begin
    perform retail.fn_actividad_anotar('fondos', 'plata_confirmada',
      'confirmó la plata para compras de ' || coalesce((select trim(concat_ws(' ', p.nombres, p.apellidos)) from public.personas p where p.id = v_a.persona_id), 'una compradora')
        || case when v_monto <> v_a.monto then ' (con otro monto)' else '' end,
      v_actor, retail.fn_actividad_terminal_ahora(), null, null, 'fondo_plata_anotada', v_a.id::text, now(),
      jsonb_build_object('medio', v_a.medio, 'cambio_monto', v_monto <> v_a.monto), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la confirmación %: %', v_a.id, sqlerrm;
  end;
  return jsonb_build_object('id', v_a.id, 'monto', v_monto, 'movimiento_id', v_mov);
end $$;

-- ---------- 5. Lecturas ----------
-- La compradora: cuánto tiene para comprar (su fondo + lo por confirmar), si todavía puede anotar «ya tenía», y lo último que anotó.
create or replace function retail.fn_mi_plata_compras()
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_persona uuid;
  v_fondo uuid;
begin
  if not retail.fn_ve_modulo('ordenes_compra') then
    raise exception 'Ver tu plata para compras necesita el módulo Mi plata para compras en tu rol.' using errcode = '42501';
  end if;
  v_persona := retail.fn_persona_de_la_cuenta();
  if v_persona is null then
    return jsonb_build_object('persona', false);
  end if;
  v_fondo := retail.fn_fondo_de(v_persona, false);
  return jsonb_build_object(
    'persona', true,
    'saldo', case when v_fondo is null then 0 else retail.fn_fondo_saldo(v_fondo) end,
    'por_confirmar', coalesce((select sum(a.monto) from retail.fondo_plata_anotada a where a.persona_id = v_persona and a.estado = 'por_confirmar'), 0),
    'puede_ya_tenia', not exists (select 1 from retail.cuentas_dinero c where c.tipo = 'fondo' and c.persona_id = v_persona)
                      and not exists (select 1 from retail.fondo_plata_anotada a where a.persona_id = v_persona),
    'anotada', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'medio', a.medio, 'monto', a.monto, 'monto_confirmado', a.monto_confirmado,
                                          'estado', a.estado, 'fecha', a.fecha, 'creado_en', a.created_at, 'con_foto', a.foto_ruta is not null)
                       order by a.created_at desc)
        from (select * from retail.fondo_plata_anotada x where x.persona_id = v_persona order by x.created_at desc limit 30) a), '[]'::jsonb));
end $$;

-- Compras: la plata que falta confirmar, la más vieja primero, con la ruta de su voucher (la pantalla la firma).
create or replace function retail.fn_plata_por_confirmar()
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_yo uuid := retail.fn_persona_de_la_cuenta();
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Ver la plata por confirmar necesita el módulo Revisar compras en tu rol.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'persona_id', a.persona_id,
                                        'persona', trim(concat_ws(' ', p.nombres, p.apellidos)), 'medio', a.medio, 'monto', a.monto,
                                        'fecha', a.fecha, 'creado_en', a.created_at, 'foto_ruta', a.foto_ruta,
                                        'es_mia', v_yo is not null and a.persona_id = v_yo)
                     order by a.created_at)
      from retail.fondo_plata_anotada a join public.personas p on p.id = a.persona_id
     where a.estado = 'por_confirmar'), '[]'::jsonb);
end $$;

revoke all on function retail.anotar_plata_compras(text, numeric, text, uuid) from public, anon;
revoke all on function retail.confirmar_plata_compras(uuid, numeric, uuid) from public, anon;
revoke all on function retail.fn_mi_plata_compras() from public, anon;
revoke all on function retail.fn_plata_por_confirmar() from public, anon;
revoke all on function retail.fn_fondo_plata_anotada_inmutable() from public, anon, authenticated;
grant execute on function retail.anotar_plata_compras(text, numeric, text, uuid) to authenticated;
grant execute on function retail.confirmar_plata_compras(uuid, numeric, uuid) to authenticated;
grant execute on function retail.fn_mi_plata_compras() to authenticated;
grant execute on function retail.fn_plata_por_confirmar() to authenticated;

-- ---------- 6. Reemplazos anclados en dos funciones vivas ----------
-- Reemplaza un texto en la definición VIVA de una función, solo si aparece las veces esperadas; si ya está reemplazado, no hace nada.
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

-- 6a. «Quién tiene plata» suma el saldo inicial de un fondo (lo que «ya tenía»): al saldo y a «le entregaste», para que la fila cuadre.
select pg_temp.reemplazar('retail.fn_fondos()',
$v$           coalesce((select sum(l.monto) from libro l where l.cuenta_id = f.id), 0) as saldo,$v$,
$n$           -- ADR-0480: lo que «ya tenía» es el saldo inicial del fondo; cuenta como entregado.
           coalesce((select c.saldo_inicial from retail.cuentas_dinero c where c.id = f.id), 0) as inicial,
           coalesce((select c.saldo_inicial from retail.cuentas_dinero c where c.id = f.id), 0)
             + coalesce((select sum(l.monto) from libro l where l.cuenta_id = f.id), 0) as saldo,$n$,
1);
select pg_temp.reemplazar('retail.fn_fondos()',
$v$         s.saldo, s.entregado, s.devuelto, s.entregado - s.devuelto - s.saldo,$v$,
$n$         s.saldo, s.inicial + s.entregado, s.devuelto, s.inicial + s.entregado - s.devuelto - s.saldo,$n$,
1);

-- 6b. «Revisar si se guardó» conoce la plata anotada: la revisa la compradora o quien tiene «Mi plata para compras».
select pg_temp.reemplazar('retail.fn_resolver_intento(text, uuid)',
$v$                         'iniciar_traslado', 'enviar_pedido_a_otra_sede') then$v$,
$n$                         'iniciar_traslado', 'enviar_pedido_a_otra_sede', 'anotar_plata_compras') then$n$,
1);
select pg_temp.reemplazar('retail.fn_resolver_intento(text, uuid)',
$v$    elsif p_operacion = 'rendir_fondo' then$v$,
$n$    elsif p_operacion = 'anotar_plata_compras' then
      -- ADR-0480: la plata que anotó una compradora. Su persona es la compradora.
      for v_id, v_duena, v_datos in
        select a.id, a.persona_id, jsonb_build_object('id', a.id, 'medio', a.medio, 'monto', a.monto, 'creado_en', a.created_at)
          from retail.fondo_plata_anotada a where a.token_cliente = p_token
      loop
        exit;
      end loop;
    elsif p_operacion = 'rendir_fondo' then$n$,
1);
select pg_temp.reemplazar('retail.fn_resolver_intento(text, uuid)',
$v$    if v_id is not null and p_operacion in ('entregar_fondo', 'devolver_fondo', 'pagar_deuda_fondo', 'registrar_gasto_viaje', 'rendir_fondo') then$v$,
$n$    if v_id is not null and p_operacion in ('entregar_fondo', 'devolver_fondo', 'pagar_deuda_fondo', 'registrar_gasto_viaje', 'rendir_fondo', 'anotar_plata_compras') then$n$,
1);
select pg_temp.reemplazar('retail.fn_resolver_intento(text, uuid)',
$v$              or (p_operacion = 'registrar_gasto_viaje' and retail.fn_ve_modulo('ordenes_compra'))
              or (p_operacion <> 'registrar_gasto_viaje' and retail.fn_ve_modulo('fondos'))) then$v$,
$n$              or (p_operacion in ('registrar_gasto_viaje', 'anotar_plata_compras') and retail.fn_ve_modulo('ordenes_compra'))
              or (p_operacion not in ('registrar_gasto_viaje', 'anotar_plata_compras') and retail.fn_ve_modulo('fondos'))) then$n$,
1);
