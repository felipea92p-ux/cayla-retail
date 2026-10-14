-- Saldar la deuda de un faltante, fase 6 · actividad 7 (ADR-0362, decisiones 54, 71 y 73).
--
-- EL PROBLEMA PRIMERO. Desde la actividad 5, un faltante sin explicación (o con una que quien aprueba no acepta) queda como deuda de la
-- persona: sale de su fondo hacia la 1419 y se ve en «Tu fondo» y en Fondos por rendir. Pero no hay forma de saldarla: si la persona
-- devuelve la plata, nadie puede registrarlo, y la deuda queda a la vista para siempre aunque ya se pagó. Felipe decidió (71) que por ahora
-- se salda SOLO cuando la persona devuelve la plata: nada de descontarla del sueldo ni de conectarla con la planilla de Dynamic.
-- Además, el Balance no compara la 1413 (los fondos) ni la 1419 (estas deudas) por dos caminos, como hace con la caja y los bancos: un
-- asiento mal hecho en esas cuentas no lo vería nadie.
--
-- QUÉ CREA
--   1. Un tipo de movimiento de dinero nuevo, `pago_deuda_fondo`: la plata que la persona devuelve ENTRA a una cuenta de CAYLA (banco,
--      caja fuerte o lo que tiene el líder; nunca un cajón ni otro fondo) y no sale de ninguna. Es de una rendición (`rendicion_id`): paga
--      la deuda de esa rendición. El Diario lo asienta contra la 1419.
--   2. `pagar_deuda_fondo(persona, monto, cuenta, nota, fecha, token)`: lo registra QUIEN RECIBE la plata, con el módulo Fondos por rendir
--      (nunca la persona que debe, como lo que se devuelve de un fondo). No acepta más de lo que debe. Si debe de varias rendiciones, paga
--      primero la más vieja. El mismo token no duplica.
--   3. `anular_pago_deuda_fondo(id, motivo)`: un pago mal registrado se anula con su motivo, también por otra persona; la deuda vuelve.
--      «Cuentas y dinero» no lo anula ni lo ofrece para anular (como la plata de un fondo).
--   4. Las lecturas: `fn_deudas_fondo_de(corte)` (interna: rendición por rendición, el faltante, lo pagado y lo que debe) y
--      `fn_deudas_fondo()` (Fondos por rendir). `fn_fondos_movimientos` suma los pagos a la lista de entregas y devoluciones, y
--      `fn_mi_fondo_rendicion` («Tu fondo») dice lo que todavía debe, no el faltante entero.
--   5. El Balance: «¿Cuadra?» compara la 1413 contra lo que tiene cada persona en Fondos por rendir y la 1419 contra lo que falta pagar de
--      cada rendición con deuda (`fn_bal_otro_camino` suma la 1419; la 1413 ya venía en el libro de dinero).
--
-- DESCARTÉ
--   · Descontar la deuda del sueldo (con su autorización escrita, como decía la 54): Felipe lo dejó fuera por ahora (71).
--   · Un pago que no sea de una rendición: la deuda nace en una rendición y se salda contra ella; así cada rendición dice qué falta.
--   · Que el pago entre al fondo de la misma persona: sería declarar que tiene la plata sin que nadie la reciba (la decisión 26 pide el
--     control). La recibe otra persona, en una cuenta de CAYLA.
--   · Cambiar las columnas de una lectura ya pegada (`fn_rendiciones_fondo`): volver a pegar la 235000 fallaría. Lo que debe va en una
--     lectura nueva.
--
-- SE ROMPE SI
--   · Alguien registra la devolución de una deuda como «Lo que devuelve» de su fondo: la plata entraría a CAYLA pero la deuda seguiría.
--     La pantalla ofrece «Registrar su pago» solo donde hay deuda.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (autorización de Felipe para la fase 6). Una sola parte, después de 20261014002000: cambia tres restricciones de
-- `movimientos_dinero` y le suma un índice (sin políticas, sin `drop trigger`: ADR-0195), crea funciones y suma texto, con reemplazos
-- anclados, a siete funciones vivas (ninguno parte el texto que dejó otra migración). Sin `select … into` dentro de textos entre comillas
-- (ADR-0288). Los reemplazos abortan sin cambiar nada si la función viva cambió. Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

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

-- ---------- 1. El tipo nuevo ----------
alter table retail.movimientos_dinero
  drop constraint if exists movimientos_dinero_tipo_check,
  add constraint movimientos_dinero_tipo_check check (tipo in (
    'aporte', 'prestamo', 'retiro', 'devolucion_prestamo', 'deposito', 'abono_tarjeta', 'pago_tarjeta', 'entre_cuentas',
    'entrega_fondo', 'devolucion_fondo', 'faltante_fondo_asumido', 'faltante_fondo_deuda', 'pago_deuda_fondo')),
  -- Como un aporte: entra a una cuenta y no sale de ninguna (la plata viene de la persona).
  drop constraint if exists movimientos_dinero_puntas,
  add constraint movimientos_dinero_puntas check (
    case
      when tipo in ('aporte', 'prestamo', 'pago_deuda_fondo') then cuenta_origen_id is null and cuenta_destino_id is not null
      when tipo in ('retiro', 'devolucion_prestamo', 'faltante_fondo_asumido', 'faltante_fondo_deuda') then
        cuenta_origen_id is not null and cuenta_destino_id is null
      else cuenta_origen_id is not null and cuenta_destino_id is not null and cuenta_origen_id <> cuenta_destino_id
    end),
  -- El faltante y su pago son de una rendición; nada más lo es.
  drop constraint if exists movimientos_dinero_faltante_de_rendicion,
  add constraint movimientos_dinero_faltante_de_rendicion
    check ((tipo in ('faltante_fondo_asumido', 'faltante_fondo_deuda', 'pago_deuda_fondo')) = (rendicion_id is not null));
create index if not exists movimientos_dinero_rendicion_idx on retail.movimientos_dinero (rendicion_id) where rendicion_id is not null;

-- ---------- 2. Las funciones de dinero aprenden el pago (solo SUMAN texto, antes o después de lo que dejó la 235000) ----------
select pg_temp.reemplazar('retail.fn_movimientos_dinero_validar()',
$v$  -- ADR-0362 fase 6 · actividad 5: el faltante de una rendición sale del fondo y no va a ninguna cuenta (el Diario lo lleva a la$v$,
$n$  -- ADR-0362 fase 6 · actividad 7: lo que la persona devuelve de la deuda de un faltante entra a una cuenta de CAYLA (banco, caja
  -- fuerte o lo que tiene el líder) y no sale de ninguna: el Diario lo asienta contra la 1419. Ni cajón ni caja.
  if new.tipo = 'pago_deuda_fondo' then
    if new.cuenta_origen_id is not null or coalesce(v_d.tipo, '') not in ('banco', 'caja_fuerte', 'por_rendir')
       or new.caja_movimiento_id is not null or new.caja_ingreso_id is not null or new.rendicion_id is null then
      raise exception 'Lo que se paga de una deuda de fondo entra a un banco, a una caja fuerte o al líder, y es de una rendición.' using errcode = 'P0001';
    end if;
    new.ubicacion_id := v_d.ubicacion_id;
    return new;
  end if;

  -- ADR-0362 fase 6 · actividad 5: el faltante de una rendición sale del fondo y no va a ninguna cuenta (el Diario lo lleva a la$n$,
1);

select pg_temp.reemplazar('retail.fn_texto_movimiento_dinero(text)',
$v$    when 'faltante_fondo_deuda' then 'Faltante de fondo (deuda de la persona)'$v$,
$n$    when 'faltante_fondo_deuda' then 'Faltante de fondo (deuda de la persona)'
    when 'pago_deuda_fondo' then 'Pago de la deuda de un faltante'$n$,
1);

select pg_temp.reemplazar('retail.anular_movimiento_dinero(uuid, text)',
$v$  if v_m.tipo in ('faltante_fondo_asumido', 'faltante_fondo_deuda') then$v$,
$n$  if v_m.tipo = 'pago_deuda_fondo' then
    raise exception 'El pago de una deuda de fondo se anula en Compras ▸ Fondos por rendir.' using errcode = 'P0001';
  end if;
  if v_m.tipo in ('faltante_fondo_asumido', 'faltante_fondo_deuda') then$n$,
1);

select pg_temp.reemplazar('retail.fn_movimientos_dinero(uuid, integer)',
$v$           and d.tipo not in ('faltante_fondo_asumido', 'faltante_fondo_deuda')$v$,
$n$           and d.tipo not in ('faltante_fondo_asumido', 'faltante_fondo_deuda')
           and d.tipo <> 'pago_deuda_fondo'$n$,
1);

-- El Diario: entra a la cuenta de la plata (el debe, como cualquier movimiento) y sale de la 1419 (el haber). Provisional hasta el contador.
select pg_temp.reemplazar('retail.fn_asientos_dinero_y_caja(date, date, boolean, uuid[])',
$v$case md.tipo when 'aporte' then '52' when 'prestamo' then '47' else md.c_o end,$v$,
$n$case md.tipo when 'aporte' then '52' when 'prestamo' then '47' when 'pago_deuda_fondo' then '1419' else md.c_o end,$n$,
1);
select pg_temp.reemplazar('retail.fn_asientos_dinero_y_caja(date, date, boolean, uuid[])',
$v$case md.tipo when 'aporte' then 'Capital adicional del dueño' when 'prestamo' then 'CAYLA le debe al dueño'$v$,
$n$case md.tipo when 'aporte' then 'Capital adicional del dueño' when 'prestamo' then 'CAYLA le debe al dueño'
                when 'pago_deuda_fondo' then 'Se salda la deuda del faltante'$n$,
1);

-- ---------- 3. Lo que se debe ----------
-- Rendición por rendición: el faltante que quedó como deuda (lo que dice la rendición, no el movimiento: así el Balance compara dos
-- caminos de verdad), lo pagado hasta el corte y lo que falta. Solo las aprobadas con deuda.
create or replace function retail.fn_deudas_fondo_de(p_corte date)
returns table (
  rendicion_id uuid, cuenta_id uuid, persona_id uuid, desde date, aprobada_en timestamptz, faltante numeric, pagado numeric, debe numeric
)
language sql stable set search_path = retail, public, extensions as $$
  select r.id, r.cuenta_id, r.persona_id, (r.aprobada_en at time zone 'America/Lima')::date, r.aprobada_en, r.faltante,
         coalesce(p.pagado, 0), r.faltante - coalesce(p.pagado, 0)
    from retail.rendiciones_fondo r
    left join lateral (
      select sum(d.monto) as pagado from retail.movimientos_dinero d
       where d.rendicion_id = r.id and d.tipo = 'pago_deuda_fondo' and d.estado = 'vigente' and d.fecha <= p_corte
    ) p on true
   where r.estado = 'aprobada' and r.decision = 'deuda_persona' and r.faltante > 0
     and (r.aprobada_en at time zone 'America/Lima')::date <= p_corte;
$$;
comment on function retail.fn_deudas_fondo_de(date) is
  'ADR-0362 fase 6 · actividad 7: al corte, cada rendición aprobada con deuda: el faltante, lo pagado (pago_deuda_fondo vigentes) y lo que falta. Interna: la usan las lecturas, pagar_deuda_fondo y el otro camino de la 1419 en el Balance.';

-- Fondos por rendir: lo que debe cada persona, rendición por rendición (también lo ya pagado del todo, para la historia).
create or replace function retail.fn_deudas_fondo()
returns table (
  rendicion_id uuid, cuenta_id uuid, persona_id uuid, persona_nombre text, desde date, faltante numeric, pagado numeric, debe numeric,
  es_mio boolean
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_yo uuid := retail.fn_persona_de_la_cuenta();
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Ver los fondos necesita el módulo Fondos por rendir en tu rol.' using errcode = '42501';
  end if;
  return query
  select d.rendicion_id, d.cuenta_id, d.persona_id, trim(concat_ws(' ', pe.nombres, pe.apellidos)), d.desde, d.faltante, d.pagado, d.debe,
         d.persona_id is not distinct from v_yo
    from retail.fn_deudas_fondo_de(retail.fn_hoy_lima()) d
    join public.personas pe on pe.id = d.persona_id
   order by trim(concat_ws(' ', pe.nombres, pe.apellidos)), d.aprobada_en, d.rendicion_id;
end $$;

-- ---------- 4. Pagar la deuda ----------
create or replace function retail.pagar_deuda_fondo(
  p_persona_id uuid,
  p_monto numeric,
  p_cuenta_destino_id uuid,
  p_nota text default null,
  p_fecha date default null,
  p_token uuid default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_id uuid;
  v_primero uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_fecha date := coalesce(p_fecha, retail.fn_hoy_lima());
  v_monto numeric := round(p_monto, 2);
  v_resto numeric;
  v_parte numeric;
  v_debe numeric;
  v_nota text := nullif(trim(coalesce(p_nota, '')), '');
  v_d retail.cuentas_dinero%rowtype;
  v_actor uuid;
  r record;
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Registrar lo que alguien paga de su deuda necesita el módulo Fondos por rendir en tu rol.' using errcode = '42501';
  end if;
  -- Doble clic o reintento: el segundo intento espera al primero y devuelve SU pago.
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('movimientos_dinero:' || p_token::text, 0));
    v_id := (select d.id from retail.movimientos_dinero d where d.token_cliente = p_token);
    if v_id is not null then
      return v_id;
    end if;
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién recibe la plata.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_fondo_exigir_otra_persona(p_persona_id, v_actor, 'Lo que pagas de tu propia deuda lo registra quien recibe la plata');

  select * into v_d from retail.cuentas_dinero where id = p_cuenta_destino_id;
  if not found then
    raise exception 'Elige a dónde entró la plata.' using errcode = 'P0001';
  end if;
  if v_d.tipo not in ('banco', 'caja_fuerte', 'por_rendir') then
    raise exception 'Lo que se paga de una deuda entra a un banco, a una caja fuerte o al líder: «%» no lo es.', v_d.nombre
      using errcode = 'P0001';
  end if;
  if v_d.tipo = 'por_rendir' and not retail.fn_es_lider() then
    raise exception 'Lo que tiene el líder solo lo mueve el líder.' using errcode = '42501';
  end if;
  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;
  if p_monto <> v_monto then
    raise exception 'El monto admite como máximo 2 decimales.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_nota, '')) > 200 then
    raise exception 'La nota es muy larga (máximo 200 letras).' using errcode = 'P0001';
  end if;
  if v_fecha > v_hoy then
    raise exception 'La fecha no puede ser futura.' using errcode = 'P0001';
  end if;

  -- El candado del fondo de la persona: dos pagos a la vez no la dejan pagando más de lo que debe.
  perform pg_advisory_xact_lock(hashtextextended('fondo:' || p_persona_id::text, 0));
  v_debe := coalesce((select sum(x.debe) from retail.fn_deudas_fondo_de(v_hoy) x where x.persona_id = p_persona_id), 0);
  if v_debe <= 0 then
    raise exception 'Esa persona no debe nada por faltantes de su fondo.' using errcode = 'P0001', hint = 'fondo_sin_deuda';
  end if;
  if v_monto > v_debe then
    raise exception 'Debe S/ %: no puede pagar S/ %.', to_char(v_debe, 'FM999G999G990D00'), to_char(v_monto, 'FM999G999G990D00')
      using errcode = 'P0001', hint = 'fondo_deuda_excedida';
  end if;

  -- Lo más viejo primero: cada parte del pago va a la deuda de una rendición.
  v_resto := v_monto;
  for r in
    select x.rendicion_id, x.debe, x.desde from retail.fn_deudas_fondo_de(v_hoy) x
     where x.persona_id = p_persona_id and x.debe > 0
     order by x.aprobada_en, x.rendicion_id
  loop
    exit when v_resto <= 0;
    if v_fecha < r.desde then
      raise exception 'Esa deuda es del %: el pago no puede ser de antes.', to_char(r.desde, 'DD/MM/YYYY') using errcode = 'P0001';
    end if;
    v_parte := least(r.debe, v_resto);
    insert into retail.movimientos_dinero (tipo, fecha, cuenta_destino_id, monto, referencia, registrado_por, token_cliente, rendicion_id)
    values ('pago_deuda_fondo', v_fecha, v_d.id, v_parte, v_nota, v_actor, case when v_primero is null then p_token end, r.rendicion_id)
    returning id into v_id;
    v_primero := coalesce(v_primero, v_id);
    v_resto := v_resto - v_parte;
  end loop;
  return v_primero;
exception when unique_violation then
  if p_token is not null and exists (select 1 from retail.movimientos_dinero d where d.token_cliente = p_token) then
    return (select d.id from retail.movimientos_dinero d where d.token_cliente = p_token);
  end if;
  raise;
end $$;

-- Un pago mal registrado se anula con su motivo; la deuda vuelve. Tampoco lo anula la persona que debe.
create or replace function retail.anular_pago_deuda_fondo(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_m retail.movimientos_dinero%rowtype;
  v_actor uuid;
  v_duena uuid;
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Anular el pago de una deuda necesita el módulo Fondos por rendir en tu rol.' using errcode = '42501';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Di por qué se anula.' using errcode = 'P0001';
  end if;
  if char_length(trim(p_motivo)) > 200 then
    raise exception 'El motivo es muy largo (máximo 200 letras).' using errcode = 'P0001';
  end if;
  select * into v_m from retail.movimientos_dinero where id = p_id for update;
  if not found or v_m.tipo <> 'pago_deuda_fondo' then
    raise exception 'Ese movimiento no es el pago de una deuda de fondo.' using errcode = 'P0001';
  end if;
  if v_m.estado = 'anulado' then
    raise exception 'Ese pago ya estaba anulado.' using errcode = 'P0001';
  end if;
  v_duena := (select r.persona_id from retail.rendiciones_fondo r where r.id = v_m.rendicion_id);

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién anula.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_fondo_exigir_otra_persona(v_duena, v_actor, 'El pago de tu propia deuda no lo anulas tú');
  perform pg_advisory_xact_lock(hashtextextended('fondo:' || v_duena::text, 0));

  update retail.movimientos_dinero
     set estado = 'anulado', motivo_anulacion = trim(p_motivo), anulado_por = v_actor, anulado_en = now()
   where id = p_id;
end $$;

-- ---------- 5. Las lecturas que ya existían ----------
-- La lista de Fondos por rendir suma los pagos de deuda (la persona sale de su rendición; la cuenta es a donde entró la plata).
-- Mismas columnas que la 182000.
create or replace function retail.fn_fondos_movimientos(p_persona_id uuid default null, p_limite integer default 200)
returns table (
  id uuid, tipo text, fecha date, persona_id uuid, persona_nombre text, cuenta_id uuid, cuenta_nombre text, monto numeric,
  motivo text, estado text, motivo_anulacion text, registrado_por_nombre text, anulado_por_nombre text, creado_en timestamptz,
  puede_anular boolean
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_yo uuid := (select p.id from public.personas p where p.auth_user_id = auth.uid());
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Ver los fondos necesita el módulo Fondos por rendir en tu rol.' using errcode = '42501';
  end if;
  return query
  select x.* from (
    select d.id, d.tipo, d.fecha, f.persona_id, trim(concat_ws(' ', pe.nombres, pe.apellidos)) as persona_nombre,
           o.id as cuenta_id, o.nombre as cuenta_nombre, d.monto, d.referencia as motivo, d.estado, d.motivo_anulacion,
           trim(concat_ws(' ', pr.nombres, pr.apellidos)) as registrado_por_nombre, trim(concat_ws(' ', pa.nombres, pa.apellidos)) as anulado_por_nombre,
           d.created_at as creado_en, d.estado = 'vigente' and f.persona_id is distinct from v_yo as puede_anular
      from retail.movimientos_dinero d
      join retail.cuentas_dinero f on f.id = case when d.tipo = 'entrega_fondo' then d.cuenta_destino_id else d.cuenta_origen_id end
      join retail.cuentas_dinero o on o.id = case when d.tipo = 'entrega_fondo' then d.cuenta_origen_id else d.cuenta_destino_id end
      join public.personas pe on pe.id = f.persona_id
      left join public.personas pr on pr.id = d.registrado_por
      left join public.personas pa on pa.id = d.anulado_por
     where d.tipo in ('entrega_fondo', 'devolucion_fondo')
       and (p_persona_id is null or f.persona_id = p_persona_id)
    union all
    -- ADR-0362 fase 6 · actividad 7: lo que la persona pagó de la deuda de un faltante.
    select d.id, d.tipo, d.fecha, r.persona_id, trim(concat_ws(' ', pe.nombres, pe.apellidos)),
           o.id, o.nombre, d.monto, d.referencia, d.estado, d.motivo_anulacion,
           trim(concat_ws(' ', pr.nombres, pr.apellidos)), trim(concat_ws(' ', pa.nombres, pa.apellidos)),
           d.created_at, d.estado = 'vigente' and r.persona_id is distinct from v_yo
      from retail.movimientos_dinero d
      join retail.rendiciones_fondo r on r.id = d.rendicion_id
      join retail.cuentas_dinero o on o.id = d.cuenta_destino_id
      join public.personas pe on pe.id = r.persona_id
      left join public.personas pr on pr.id = d.registrado_por
      left join public.personas pa on pa.id = d.anulado_por
     where d.tipo = 'pago_deuda_fondo'
       and (p_persona_id is null or r.persona_id = p_persona_id)
  ) x
   order by x.fecha desc, x.creado_en desc
   limit greatest(coalesce(p_limite, 200), 1);
end $$;

-- «Tu fondo»: lo que todavía debe (el faltante menos lo que ya pagó), no el faltante entero.
select pg_temp.reemplazar('retail.fn_mi_fondo_rendicion()',
$v$         coalesce((select sum(r.faltante) from retail.rendiciones_fondo r
                    where r.cuenta_id = v_fondo and r.estado = 'aprobada' and r.decision = 'deuda_persona'), 0);$v$,
$n$         -- ADR-0362 fase 6 · actividad 7: lo que todavía debe (el faltante menos lo que ya pagó).
         coalesce((select sum(x.debe) from retail.fn_deudas_fondo_de(retail.fn_hoy_lima()) x where x.cuenta_id = v_fondo), 0);$n$,
1);

-- ---------- 6. El Balance: la 1413 y la 1419 por dos caminos ----------
select pg_temp.reemplazar('retail.fn_bal_otro_camino(date)',
$v$  select '122', -coalesce((select sum(x.monto) from retail.fn_bal_anticipos(p_corte) x), 0);$v$,
$n$  select '122', -coalesce((select sum(x.monto) from retail.fn_bal_anticipos(p_corte) x), 0)
  union all
  -- ADR-0362 fase 6 · actividad 7: lo que el personal debe por faltantes de fondo, rendición por rendición (la 1413 ya viene del libro).
  select '1419', coalesce((select sum(x.debe) from retail.fn_deudas_fondo_de(p_corte) x), 0);$n$,
1);

select pg_temp.reemplazar('retail.fn_conciliacion_contable(date)',
$v$      (13, '451', array['451'], 'Tarjeta de crédito', 'contra la tarjeta en Cuentas y dinero', -1),$v$,
$n$      (13, '451', array['451'], 'Tarjeta de crédito', 'contra la tarjeta en Cuentas y dinero', -1),
      -- ADR-0362 fase 6 · actividad 7: los fondos por rendir y lo que el personal debe por faltantes.
      (14, '1413', array['1413'], 'Fondos por rendir', 'contra lo que tiene cada persona en Fondos por rendir', 1),
      (15, '1419', array['1419'], 'Faltantes que debe el personal', 'contra lo que falta pagar de cada rendición con deuda', 1),$n$,
1);

-- ---------- 7. La firma ----------
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('fondo_deuda_pagar', 'Registrar lo que una persona paga de la deuda de un faltante de su fondo (con la cuenta de una persona firma ella, desde una terminal se elige quién)'),
  ('fondo_deuda_anular', 'Anular el pago de la deuda de un faltante de fondo (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

-- ---------- 8. Permisos ----------
revoke all on function retail.fn_deudas_fondo_de(date) from public, anon, authenticated;
revoke all on function retail.fn_deudas_fondo() from public, anon;
revoke all on function retail.pagar_deuda_fondo(uuid, numeric, uuid, text, date, uuid) from public, anon;
revoke all on function retail.anular_pago_deuda_fondo(uuid, text) from public, anon;
grant execute on function retail.fn_deudas_fondo() to authenticated, service_role;
grant execute on function retail.pagar_deuda_fondo(uuid, numeric, uuid, text, date, uuid) to authenticated, service_role;
grant execute on function retail.anular_pago_deuda_fondo(uuid, text) to authenticated, service_role;

reset lock_timeout;
notify pgrst, 'reload schema';
