-- ============================================================================
-- 20261016173000 — Cobros con tarjeta y QR: Interbank, las cuentas «por depositar» y la máquina que cobra (ADR-0429;
-- decisión 3 del ADR-0417, aprobada por Felipe el 2026-10-15; actividad 1 de 6)
--
-- EL PROBLEMA PRIMERO (medido en producción el 2026-10-16, solo lectura)
--   Todo lo cobrado con tarjeta y con QR se sella en el BCP, como si llegara completo y al instante. En realidad lo cobra una
--   MÁQUINA (Izipay o Vendemás), que lo deposita en Interbank entre 1 y 3 días después y sin su comisión. Por eso el saldo del
--   BCP nunca cuadra con el banco, la comisión no existe en ningún lado y el diario asienta el QR como si fuera Yape (104).
--
-- LAS REGLAS
--   1. Nacen tres cuentas: «Interbank» (banco, 104) y las puentes «Por depositar Izipay» y «Por depositar Vendemás»
--      (por_abonar, 105). El saldo inicial de Interbank lo pone el líder desde Configuración ▸ Cuentas (nace en 0).
--   2. `pos_maquinas`: cada máquina de cobro (Izipay, Vendemás) con SU cuenta puente, 1 a 1. `pos_maquinas_sedes`: en qué
--      tienda opera y con qué medio (tarjeta, qr). Izipay: tarjeta y QR en las tres tiendas. Vendemás: tarjeta en TRU y AQP.
--   3. El destino POR DEFECTO sigue siendo «A qué cuenta entra cada cobro» (`medios_de_cobro`, que ya guarda historia), ahora
--      también para el QR y aceptando una cuenta puente para tarjeta y QR. Desde el 2026-09-30 (el primer cobro con tarjeta):
--      tarjeta → Vendemás donde opera, Izipay donde no; QR → Izipay. Candado: la puente de una máquina solo recibe lo que esa
--      máquina cobra en esa tienda con ese medio (`fn_pos_cuenta_sirve_en_sede`).
--   4. El sello del cobro (`fn_cuenta_sellada`) acepta para tarjeta y QR una cuenta ELEGIDA (la máquina que la hoja de cobro
--      marcó; actividad 2) y la valida contra la tienda; sin elegida, la de `medios_de_cobro` (el QR sin fila propia sigue
--      cayendo donde las transferencias, como hasta hoy). El sello sigue sin tumbar nunca una venta.
--   5. El diario asienta el QR que entra en la 105 (espera en la máquina), como la tarjeta. El abono y su comisión ya se
--      asientan bien (104 | 105 y 639 | 105): no se tocan.
--   6. `fn_pos_maquinas_de_sede(tienda)`: lo que la hoja de cobro necesita (máquinas de la tienda por medio y cuál es la de
--      defecto); `fn_pos_maquinas()`: la lista para Configuración (solo el líder).
--
-- CÓMO. Las funciones vivas se cambian con reemplazos anclados (`pg_temp.reemplazar`, el patrón de 20261014145000): cada uno
-- aborta sin cambiar nada si su ancla no aparece exactamente una vez. Las anclas son texto de la migración original, no de
-- un comentario que cambió entre producción y el repo (ADR-0310 / ADR-0311). Idempotente: pegarla dos veces no cambia nada.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, con el prefijo `retail.` escrito. No toca ninguna tabla que use la tienda:
-- `medios_de_cobro` solo la leen funciones (su `check` se reescribe); `cuentas_dinero` recibe tres filas; lo demás es nuevo o
-- son funciones. Sin políticas, sin `drop trigger`. `lock_timeout = 3s`.
-- SE ROMPE SI: (1) la web de la actividad 2 se publica antes que esto: la hoja pregunta `fn_pos_maquinas_de_sede`, no la
-- encuentra y no ofrece máquinas (nada se cae); (2) alguien crea una segunda máquina para QR en una tienda: la hoja empieza a
-- preguntar también por el QR (correcto, pero cambia la pantalla); (3) una venta corregida de efectivo a tarjeta
-- (`corregir_pagos_venta`) se sella con la máquina por defecto, sin preguntar.
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

-- ---------- 1. Las tres cuentas ----------
-- Interbank nace en 0 y sin fecha: el líder le pone su saldo inicial desde Configuración ▸ Cuentas (editar_cuenta_dinero lo
-- permite mientras no haya una conciliación). Las puentes no tienen saldo inicial: lo que esperan ahí son cobros sellados.
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, orden)
select 'Interbank', 'banco', '104', 10
 where not exists (select 1 from retail.cuentas_dinero c where lower(c.nombre) = 'interbank' and c.archivada_en is null);
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, orden)
select 'Por depositar Izipay', 'por_abonar', '105', 20
 where not exists (select 1 from retail.cuentas_dinero c where lower(c.nombre) = 'por depositar izipay' and c.archivada_en is null);
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, orden)
select 'Por depositar Vendemás', 'por_abonar', '105', 21
 where not exists (select 1 from retail.cuentas_dinero c where lower(c.nombre) = 'por depositar vendemás' and c.archivada_en is null);
insert into retail.configuracion_historial (que, detalle, hecho_por)
select 'cuenta_dinero_creada', jsonb_build_object('cuenta_id', c.id, 'nombre', c.nombre, 'tipo', c.tipo, 'saldo_inicial', 0, 'migracion', '20261016173000'), null
  from retail.cuentas_dinero c
 where lower(c.nombre) in ('interbank', 'por depositar izipay', 'por depositar vendemás') and c.archivada_en is null
   and not exists (select 1 from retail.configuracion_historial h where h.que = 'cuenta_dinero_creada' and h.detalle ->> 'cuenta_id' = c.id::text);

-- ---------- 2. Las máquinas de cobro ----------
create table if not exists retail.pos_maquinas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (trim(nombre) <> '' and char_length(nombre) <= 40),
  -- La cuenta puente donde espera lo que la máquina cobró y todavía no depositó. Una máquina, una cuenta.
  cuenta_id uuid not null unique references retail.cuentas_dinero (id),
  orden integer not null default 100,
  archivada_en timestamptz,
  creada_por uuid references public.personas (id),
  created_at timestamptz not null default now()
);
comment on table retail.pos_maquinas is
  'Las máquinas con las que CAYLA cobra con tarjeta o QR (Izipay, Vendemás; ADR-0429). Cada una tiene su cuenta «por depositar» (105), 1 a 1: ahí espera lo cobrado hasta que la máquina lo deposita, sin su comisión. Se archiva, no se borra.';
create unique index if not exists pos_maquinas_nombre_uq on retail.pos_maquinas (lower(nombre)) where archivada_en is null;

create table if not exists retail.pos_maquinas_sedes (
  maquina_id uuid not null references retail.pos_maquinas (id),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  medio text not null check (medio in ('tarjeta', 'qr')),
  created_at timestamptz not null default now(),
  primary key (maquina_id, ubicacion_id, medio)
);
comment on table retail.pos_maquinas_sedes is
  'En qué tienda opera cada máquina de cobro y con qué medio (ADR-0429). La hoja de cobro ofrece elegir solo donde hay más de una para ese medio; el destino por defecto lo dice medios_de_cobro.';

alter table retail.pos_maquinas enable row level security;
alter table retail.pos_maquinas_sedes enable row level security;

-- Una máquina no se borra y su cuenta puente es una «por depositar» viva; solo cambian el nombre, el orden y si está archivada.
create or replace function retail.fn_pos_maquinas_validar() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
declare v_c retail.cuentas_dinero%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'Una máquina de cobro no se borra: se archiva.' using errcode = 'P0001';
  end if;
  select * into v_c from retail.cuentas_dinero where id = new.cuenta_id;
  if not found or v_c.tipo <> 'por_abonar' then
    raise exception 'La cuenta de una máquina de cobro es una cuenta «por depositar» (105).' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' and v_c.archivada_en is not null then
    raise exception 'La cuenta «%» está archivada.', v_c.nombre using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (new.id, new.cuenta_id, new.creada_por, new.created_at) is distinct from (old.id, old.cuenta_id, old.creada_por, old.created_at) then
    raise exception 'De una máquina de cobro solo cambia el nombre, el orden o si está archivada: su cuenta queda.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create or replace trigger pos_maquinas_validar before insert or update or delete on retail.pos_maquinas
  for each row execute function retail.fn_pos_maquinas_validar();

-- Una máquina opera en tiendas; y no se le quita una tienda mientras sea ahí la cuenta por defecto de ese medio (quedaría un
-- destino que apunta a una máquina que «no está»: primero se cambia «A qué cuenta entra cada cobro»).
create or replace function retail.fn_pos_maquinas_sedes_validar() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from retail.pos_maquinas m
                where m.id = old.maquina_id
                  and retail.fn_cuenta_de_cobro(old.ubicacion_id, old.medio, retail.fn_hoy_lima()) = m.cuenta_id) then
      raise exception 'Esa máquina es hoy a donde entra % en esa tienda: primero cambia «A qué cuenta entra cada cobro».',
        case old.medio when 'qr' then 'el QR' else 'la tarjeta' end using errcode = 'P0001';
    end if;
    return old;
  end if;
  if not exists (select 1 from retail.ubicaciones u where u.id = new.ubicacion_id and u.tipo = 'tienda') then
    raise exception 'Una máquina de cobro opera en una tienda.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create or replace trigger pos_maquinas_sedes_validar before insert or update or delete on retail.pos_maquinas_sedes
  for each row execute function retail.fn_pos_maquinas_sedes_validar();

-- Las dos máquinas de hoy (Felipe, 2026-10-05): Izipay cobra tarjeta y QR en las tres tiendas; Vendemás, tarjeta en TRU y AQP.
insert into retail.pos_maquinas (nombre, cuenta_id, orden)
select 'Izipay', c.id, 10 from retail.cuentas_dinero c
 where lower(c.nombre) = 'por depositar izipay' and c.archivada_en is null
   and not exists (select 1 from retail.pos_maquinas m where lower(m.nombre) = 'izipay' and m.archivada_en is null);
insert into retail.pos_maquinas (nombre, cuenta_id, orden)
select 'Vendemás', c.id, 20 from retail.cuentas_dinero c
 where lower(c.nombre) = 'por depositar vendemás' and c.archivada_en is null
   and not exists (select 1 from retail.pos_maquinas m where lower(m.nombre) = 'vendemás' and m.archivada_en is null);

-- En qué tiendas opera cada una y a qué cuenta entra cada cobro desde el 30-sep: `fn_pos_sembrar_maquinas_en_tiendas()`, abajo
-- (sección 4), porque en una base NUEVA las tiendas llegan con el seed, después de las migraciones.

-- ---------- 3. Qué cuenta puente sirve en qué tienda ----------
-- Una cuenta «por depositar» que no es de ninguna máquina (el POS genérico de F3) sirve en cualquier tienda, como siempre.
-- La de una máquina solo sirve donde esa máquina opera con ese medio.
create or replace function retail.fn_pos_cuenta_sirve_en_sede(p_cuenta_id uuid, p_ubicacion_id uuid, p_medio text) returns boolean
language sql stable set search_path = retail, public, extensions as $$
  select not exists (select 1 from retail.pos_maquinas m where m.cuenta_id = p_cuenta_id)
      or exists (select 1 from retail.pos_maquinas m
                  join retail.pos_maquinas_sedes ms on ms.maquina_id = m.id
                 where m.cuenta_id = p_cuenta_id and m.archivada_en is null
                   and ms.ubicacion_id = p_ubicacion_id and ms.medio = p_medio);
$$;
comment on function retail.fn_pos_cuenta_sirve_en_sede(uuid, uuid, text) is
  'USO INTERNO (ADR-0429): si una cuenta «por depositar» puede recibir lo cobrado con ese medio en esa tienda. La de una máquina, solo donde la máquina opera con ese medio; una sin máquina, en cualquiera.';
revoke all on function retail.fn_pos_cuenta_sirve_en_sede(uuid, uuid, text) from public, anon, authenticated;

-- ---------- 4. «A qué cuenta entra cada cobro» aprende el QR y las puentes ----------
alter table retail.medios_de_cobro drop constraint if exists medios_de_cobro_medio_check;
alter table retail.medios_de_cobro add constraint medios_de_cobro_medio_check
  check (medio in ('yape', 'plin', 'tarjeta', 'transferencia', 'qr'));

select pg_temp.reemplazar('retail.fn_medios_de_cobro_validar()',
$v$    if new.medio = 'tarjeta' and v_c.tipo not in ('por_abonar', 'banco') then
      raise exception 'Lo cobrado con tarjeta entra a una cuenta «por abonar» (el POS) o a un banco.' using errcode = 'P0001';
    end if;
    if new.medio <> 'tarjeta' and v_c.tipo <> 'banco' then
      raise exception 'Yape, Plin y transferencias entran a un banco o billetera.' using errcode = 'P0001';
    end if;$v$,
$n$    -- ADR-0429: la tarjeta y el QR entran a la cuenta «por depositar» de la máquina que los cobra, o a un banco.
    if new.medio in ('tarjeta', 'qr') and v_c.tipo not in ('por_abonar', 'banco') then
      raise exception 'Lo cobrado con % entra a la cuenta «por depositar» de su máquina o a un banco.',
        case new.medio when 'qr' then 'QR' else 'tarjeta' end using errcode = 'P0001';
    end if;
    if new.medio in ('tarjeta', 'qr') and not retail.fn_pos_cuenta_sirve_en_sede(v_c.id, new.ubicacion_id, new.medio) then
      raise exception 'La máquina de «%» no cobra con % en esa tienda.', v_c.nombre,
        case new.medio when 'qr' then 'QR' else 'tarjeta' end using errcode = 'P0001';
    end if;
    if new.medio not in ('tarjeta', 'qr') and v_c.tipo <> 'banco' then
      raise exception 'Yape, Plin y transferencias entran a un banco o billetera.' using errcode = 'P0001';
    end if;$n$, 1);

select pg_temp.reemplazar('retail.guardar_medio_de_cobro(uuid, text, uuid)',
$v$  if p_medio is null or p_medio not in ('yape', 'plin', 'tarjeta', 'transferencia') then
    raise exception 'El medio tiene que ser Yape, Plin, tarjeta o transferencia (el efectivo siempre cae al cajón).' using errcode = 'P0001';$v$,
$n$  if p_medio is null or p_medio not in ('yape', 'plin', 'tarjeta', 'qr', 'transferencia') then
    raise exception 'El medio tiene que ser Yape, Plin, tarjeta, QR o transferencia (el efectivo siempre cae al cajón).' using errcode = 'P0001';$n$, 1);

select pg_temp.reemplazar('retail.fn_medios_de_cobro()',
$v$   cross join (values ('yape', 1), ('plin', 2), ('tarjeta', 3), ('transferencia', 4)) as m (medio, orden)$v$,
$n$   cross join (values ('yape', 1), ('plin', 2), ('tarjeta', 3), ('qr', 4), ('transferencia', 5)) as m (medio, orden)$n$, 1);

-- ---------- 4b. Enganchar las máquinas a las tiendas (hoy, y en una base nueva cuando llegan las tiendas) ----------
-- Izipay cobra tarjeta y QR en toda tienda activa; Vendemás, tarjeta en Trujillo y Arequipa (por el código de la sede en Dynamic o, si
-- no lo tiene, por el nombre). Y desde el primer cobro con tarjeta (2026-09-30): tarjeta → Vendemás donde opera, Izipay donde no;
-- QR → Izipay. Idempotente: solo agrega lo que falta. La llama esta migración (producción ya tiene sus tiendas) y `seed.sql` en el
-- local y el CI (ahí las tiendas nacen DESPUÉS de las migraciones). Lo ya sellado no se mueve aquí (eso es la actividad 5).
create or replace function retail.fn_pos_sembrar_maquinas_en_tiendas() returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_sedes integer; v_medios integer;
begin
  insert into retail.pos_maquinas_sedes (maquina_id, ubicacion_id, medio)
  select m.id, u.id, x.medio
    from retail.pos_maquinas m
   cross join retail.ubicaciones u
   cross join (values ('tarjeta'), ('qr')) as x (medio)
   where lower(m.nombre) = 'izipay' and m.archivada_en is null and u.activo and u.tipo = 'tienda'
  on conflict do nothing;
  insert into retail.pos_maquinas_sedes (maquina_id, ubicacion_id, medio)
  select m.id, u.id, 'tarjeta'
    from retail.pos_maquinas m
   cross join retail.ubicaciones u
    left join public.sedes s on s.id = u.sede_dynamic_id
   where lower(m.nombre) = 'vendemás' and m.archivada_en is null and u.activo and u.tipo = 'tienda'
     and (s.codigo in ('TRU', 'AQP') or u.nombre ilike '%TRU%' or u.nombre ilike '%AQP%' or u.nombre ilike '%Trujillo%' or u.nombre ilike '%Arequipa%')
  on conflict do nothing;
  get diagnostics v_sedes = row_count;

  insert into retail.medios_de_cobro (ubicacion_id, medio, cuenta_id, vigente_desde, registrado_por)
  select u.id, x.medio, m.cuenta_id, date '2026-09-30', null
    from retail.ubicaciones u
   cross join (values ('tarjeta'), ('qr')) as x (medio)
    join lateral (
      select mq.cuenta_id
        from retail.pos_maquinas mq
        join retail.pos_maquinas_sedes ms on ms.maquina_id = mq.id and ms.ubicacion_id = u.id and ms.medio = x.medio
       where mq.archivada_en is null
       order by case when lower(mq.nombre) = 'vendemás' then 0 else 1 end, mq.orden
       limit 1
    ) m on true
   where u.activo and u.tipo = 'tienda'
     and not exists (select 1 from retail.medios_de_cobro mc
                      where mc.ubicacion_id = u.id and mc.medio = x.medio and mc.cuenta_id = m.cuenta_id and mc.vigente_desde = date '2026-09-30');
  get diagnostics v_medios = row_count;
  insert into retail.configuracion_historial (que, detalle, hecho_por)
  select 'medio_de_cobro', jsonb_build_object('ubicacion_id', mc.ubicacion_id, 'medio', mc.medio, 'cuenta_id', mc.cuenta_id, 'vigente_desde', mc.vigente_desde, 'migracion', '20261016173000'), null
    from retail.medios_de_cobro mc
   where mc.vigente_desde = date '2026-09-30' and mc.registrado_por is null and mc.medio in ('tarjeta', 'qr')
     and not exists (select 1 from retail.configuracion_historial h
                      where h.que = 'medio_de_cobro' and h.detalle ->> 'migracion' = '20261016173000'
                        and h.detalle ->> 'ubicacion_id' = mc.ubicacion_id::text and h.detalle ->> 'medio' = mc.medio);
  return jsonb_build_object('tiendas_maquina', v_sedes, 'medios', v_medios);
end $$;
comment on function retail.fn_pos_sembrar_maquinas_en_tiendas() is
  'ADR-0429: engancha Izipay (tarjeta y QR) a toda tienda activa y Vendemás (tarjeta) a Trujillo y Arequipa, y pone esas puentes como destino de tarjeta y QR desde el 2026-09-30. Idempotente. La llaman la migración 20261016173000 y seed.sql.';
revoke all on function retail.fn_pos_sembrar_maquinas_en_tiendas() from public, anon, authenticated;
select retail.fn_pos_sembrar_maquinas_en_tiendas();

-- ---------- 5. El sello del cobro ----------
-- Un cobro con QR puede entrar a una cuenta «por depositar» (la de la máquina), igual que la tarjeta.
select pg_temp.reemplazar('retail.fn_cuenta_sirve(text, text, text)',
$v$    when p_medio in ('yape', 'plin', 'transferencia', 'deposito', 'otro', 'tarjeta', 'qr') then p_tipo = 'banco'$v$,
$n$    when p_medio = 'qr' and p_clase = 'cobro' then p_tipo in ('por_abonar', 'banco')
    when p_medio in ('yape', 'plin', 'transferencia', 'deposito', 'otro', 'tarjeta', 'qr') then p_tipo = 'banco'$n$, 1);

-- Sin elegida: el QR tiene su propia fila en «A qué cuenta entra cada cobro»; si la tienda no la tiene, cae donde las
-- transferencias (lo que pasaba hasta hoy).
select pg_temp.reemplazar('retail.fn_cuenta_sellada(text, text, uuid, date, uuid)',
$v$      when p_medio in ('yape', 'plin', 'tarjeta') and p_clase <> 'reembolso' then retail.fn_cuenta_de_cobro(p_ubicacion_id, p_medio, v_fecha)$v$,
$n$      when p_medio in ('yape', 'plin', 'tarjeta') and p_clase <> 'reembolso' then retail.fn_cuenta_de_cobro(p_ubicacion_id, p_medio, v_fecha)
      -- ADR-0429: el QR tiene su propia fila (la máquina que lo cobra); sin ella, cae donde las transferencias, como antes.
      when p_medio = 'qr' and p_clase <> 'reembolso' then
        coalesce(retail.fn_cuenta_de_cobro(p_ubicacion_id, 'qr', v_fecha), retail.fn_cuenta_de_cobro(p_ubicacion_id, 'transferencia', v_fecha))$n$, 1);
-- Con elegida: el aviso habla de tarjeta y de QR.
select pg_temp.reemplazar('retail.fn_cuenta_sellada(text, text, uuid, date, uuid)',
$v$      when p_medio = 'tarjeta' then 'Lo cobrado con tarjeta entra al POS (por abonar) o a un banco: «' || v_c.nombre || '» no lo es.'$v$,
$n$      when p_medio in ('tarjeta', 'qr') and p_clase = 'cobro' then 'Lo cobrado con ' || case p_medio when 'qr' then 'QR' else 'tarjeta' end
           || ' entra a la cuenta «por depositar» de su máquina o a un banco: «' || v_c.nombre || '» no lo es.'
      when p_medio = 'tarjeta' then 'Lo cobrado con tarjeta entra al POS (por abonar) o a un banco: «' || v_c.nombre || '» no lo es.'$n$, 1);
-- Y la puente de una máquina solo recibe lo que esa máquina cobra en esa tienda con ese medio.
select pg_temp.reemplazar('retail.fn_cuenta_sellada(text, text, uuid, date, uuid)',
$v$  -- El efectivo de una sede lo mueve quien opera esa sede; lo que tiene el líder, solo el líder.$v$,
$n$  -- ADR-0429: la puente de una máquina de cobro solo recibe lo que esa máquina cobra en esa tienda con ese medio.
  if p_clase = 'cobro' and p_medio in ('tarjeta', 'qr') and not retail.fn_pos_cuenta_sirve_en_sede(v_c.id, p_ubicacion_id, p_medio) then
    raise exception 'La máquina de «%» no cobra con % en esta tienda.', v_c.nombre, case p_medio when 'qr' then 'QR' else 'tarjeta' end using errcode = 'P0001';
  end if;
  -- El efectivo de una sede lo mueve quien opera esa sede; lo que tiene el líder, solo el líder.$n$, 1);

-- ---------- 6. El diario: el QR que entra espera en la máquina (105), como la tarjeta ----------
select pg_temp.reemplazar('retail.fn_asiento_cuenta_de_medio(text, text)',
$v$    when p_medio = 'tarjeta' then '105'$v$,
$n$    when p_medio = 'tarjeta' then '105'
    when p_medio = 'qr' and p_sentido = 'entra' then '105'   -- ADR-0429: el QR de la máquina espera en ella, como la tarjeta$n$, 1);

-- ---------- 7. Lecturas ----------
-- Lo que la hoja de cobro necesita de SU tienda: las máquinas por medio y cuál es la de defecto hoy. Quien opera en retail
-- (persona o terminal) la lee; sin acceso, vacío (la hoja no se cae).
create or replace function retail.fn_pos_maquinas_de_sede(p_ubicacion_id uuid)
returns table (maquina_id uuid, nombre text, cuenta_id uuid, medio text, por_defecto boolean)
language sql stable security definer set search_path = retail, public, extensions as $$
  select m.id, m.nombre, m.cuenta_id, ms.medio,
         retail.fn_cuenta_de_cobro(p_ubicacion_id, ms.medio, retail.fn_hoy_lima()) = m.cuenta_id
    from retail.pos_maquinas m
    join retail.pos_maquinas_sedes ms on ms.maquina_id = m.id
   where m.archivada_en is null and ms.ubicacion_id = p_ubicacion_id and retail.fn_tiene_acceso_retail()
   order by ms.medio, m.orden, m.nombre;
$$;
comment on function retail.fn_pos_maquinas_de_sede(uuid) is
  'ADR-0429: las máquinas de cobro de una tienda, por medio (tarjeta, qr), y cuál es hoy la de defecto (medios_de_cobro). La hoja de cobro de Vender ofrece elegir solo donde hay más de una para ese medio.';
revoke all on function retail.fn_pos_maquinas_de_sede(uuid) from public, anon;
grant execute on function retail.fn_pos_maquinas_de_sede(uuid) to authenticated;

-- Para Configuración ▸ Cuentas y cobros (solo el líder): una fila por máquina, tienda y medio; una máquina sin tiendas, una
-- fila con la tienda en nulo.
create or replace function retail.fn_pos_maquinas()
returns table (maquina_id uuid, nombre text, cuenta_id uuid, cuenta_nombre text, archivada boolean,
               ubicacion_id uuid, ubicacion_nombre text, medio text, por_defecto boolean)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_hoy date := retail.fn_hoy_lima();
begin
  perform retail.fn_exigir_lider_dinero('Ver las máquinas de cobro');
  return query
  select m.id, m.nombre, m.cuenta_id, c.nombre, m.archivada_en is not null,
         ms.ubicacion_id, u.nombre, ms.medio,
         case when ms.medio is null then null else retail.fn_cuenta_de_cobro(ms.ubicacion_id, ms.medio, v_hoy) = m.cuenta_id end
    from retail.pos_maquinas m
    join retail.cuentas_dinero c on c.id = m.cuenta_id
    left join retail.pos_maquinas_sedes ms on ms.maquina_id = m.id
    left join retail.ubicaciones u on u.id = ms.ubicacion_id
   order by m.archivada_en nulls first, m.orden, m.nombre, u.nombre, ms.medio;
end $$;
comment on function retail.fn_pos_maquinas() is 'ADR-0429: las máquinas de cobro con su cuenta puente, en qué tiendas operan y con qué medio. Solo el líder.';
revoke all on function retail.fn_pos_maquinas() from public, anon;
grant execute on function retail.fn_pos_maquinas() to authenticated;
-- Las funciones de los disparadores no las llama nadie.
revoke all on function retail.fn_pos_maquinas_validar() from public, anon, authenticated;
revoke all on function retail.fn_pos_maquinas_sedes_validar() from public, anon, authenticated;
