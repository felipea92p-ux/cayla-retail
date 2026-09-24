-- ============================================================================
-- 20260925110000 — Cuentas y dinero (ADR-0195 F3; docs/PLAN-FINANZAS.md §7 y §7 bis)
--
-- EL PROBLEMA PRIMERO
--   Hoy el sistema sabe CÓMO entró o salió cada sol (efectivo, Yape, transferencia…) pero no DÓNDE está: nadie puede
--   responder «¿cuánto hay en el BCP?», «¿cuánto guarda la caja fuerte de TRU?» o «¿cuánto le debe CAYLA a la tarjeta?».
--   Un depósito del cajón al banco es un egreso de caja con la nota «Depósito bancario» y ahí se pierde: el banco no sube
--   en ningún lado. Tampoco hay dónde anotar que el dueño puso plata (¿aporte o préstamo?), que el POS abonó lo cobrado
--   con tarjeta menos su comisión, ni que se pagó la tarjeta de crédito.
--
-- LAS REGLAS
--   1. `cuentas_dinero`: cada lugar donde CAYLA tiene plata, con su tipo y su cuenta contable (§7 bis):
--        cajón de tienda y caja fuerte (101, nacen solos con cada tienda y el Taller) · efectivo por rendir (101, una) ·
--        banco o billetera (104) · por abonar, el POS de tarjeta (105) · tarjeta de crédito de CAYLA (451, lo que se debe).
--      Se archiva, no se borra. Un banco nace con su saldo inicial «al empezar el día X»; desde ahí solo cambia con
--      movimientos.
--   2. `medios_de_cobro`: «en TRU, el Yape entra al BCP». Vender no cambia: el cobro guarda el medio y Finanzas deduce la
--      cuenta. Tiene VIGENCIA (solo agrega filas): si mañana el Yape de LIM pasa a Interbank, lo cobrado hasta hoy sigue
--      contando en el BCP. La primera vez que se configura un medio, vale para todo lo anterior.
--   3. `movimientos_dinero` (solo agrega filas; un error se ANULA con motivo): la plata cambia de lugar o entra/sale del
--      dueño. Situaciones 7, 8, 14, 17, 20 y 21 de §7 bis:
--        aporte · préstamo del dueño · retiro de utilidades · devolución de préstamo · depósito al banco (del cajón, de la
--        caja fuerte o de lo que tiene el líder) · abono de tarjeta (por abonar → banco, con la comisión del POS como
--        gasto `gastos_bancarios`, cuenta 639) · pago de la tarjeta de crédito · entre cuentas.
--      Si sale de un CAJÓN, la salida es un egreso de caja: se crea en la misma operación (caja abierta) o se toma uno
--      que la tienda ya registró. UN egreso de caja respalda UNA sola cosa: gasto, activo, «no es gasto» o movimiento
--      (`fn_egreso_ya_usado`, extendida por parche con ancla).
--   4. Un saldo NUNCA se guarda: se suma (`fn_cuentas_dinero_saldos(corte, ubicacion)`).
--        · Cajón: lo dice la caja (abierta: el esperado de `fn_calcular_esperado_caja`, solo para quien puede cerrar;
--          cerrada: el fondo que quedó).
--        · Caja fuerte y por rendir: los traslados del cierre (ADR-0186) ± movimientos.
--        · Bancos, POS y tarjeta: saldo inicial + cobros según `medios_de_cobro` + pagos de compras, gastos y activos
--          según su medio + movimientos. PROVISIONAL hasta F3b (la cuenta sellada en cada cobro y pago): hoy un pago no
--          dice de qué banco salió, así que se deduce del medio y de la tienda; lo que no se puede deducir (pagos en
--          efectivo a proveedores, pagos «de la empresa») queda «sin cuenta» y se muestra aparte.
--   5. Conciliación semanal (solo el líder): se anota el saldo que dice el banco en una fecha; el sistema muestra la
--      diferencia y las líneas del período para marcarlas revisadas (`conciliaciones`, `dinero_revisados`).
--   6. Permisos: módulo `cuentas_dinero` (delegable): con el módulo, una cuenta ve SU cajón y SU caja fuerte y registra
--      sus depósitos al banco. El líder ve y hace todo; conciliar y administrar cuentas y cobros, solo el líder.
--      Todo firma con el responsable (`fn_actor_persona_id(true)`). Tablas con RLS y SIN políticas: se leen por funciones.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — TRES EJECUCIONES SEPARADAS, EN ORDEN (CLAUDE.md «Políticas y deadlocks»):
--   PARTE 1 lo nuevo (tablas, reglas, lecturas; sobre las tablas en uso solo toma candados de FK, compatibles con leer)
--   PARTE 2 `ubicaciones`, sola: el disparador que crea el cajón y la caja fuerte de cada sede nueva
--   PARTE 3 los parches de «un egreso respalda una sola cosa» (solo funciones: no toma tablas)
--   Cada una con `lock_timeout = 3s`: si dice «lock timeout», se repite ESA parte. Todas son idempotentes. Sin políticas.
--   Antes: 20260924235000, 20260924235100, 20260925000000 (F2) y 20260925100000 (el módulo). En local y en el CI corre
--   entero.
-- SE ROMPE SI: la web nueva se publica antes (Cuentas y dinero y Configuración ▸ Cuentas y cobros llaman funciones que no
-- existirían). La web de hoy no se rompe si esto se pega primero: nada de lo que ya existe cambia de forma.
-- ============================================================================

-- ============================== PARTE 1 · lo nuevo ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Cuentas contables que faltaban (provisionales hasta el contador) ----------
-- La tarjeta de crédito es una deuda con el banco: 451 (Préstamos de instituciones financieras). La plata del dueño
-- (ADR-0195 D): el aporte va a capital adicional (52) y el préstamo es una deuda de CAYLA con él (47).
insert into retail.cuentas (codigo, nombre, tipo, seccion_resultados, orden) values
  ('451', 'Préstamos de instituciones financieras (tarjeta de crédito)', 'pasivo',     null, 40),
  ('47',  'Cuentas por pagar diversas — relacionadas (préstamo del dueño)', 'pasivo',  null, 41),
  ('52',  'Capital adicional (aportes del dueño)',                          'patrimonio', null, 42)
on conflict (codigo) do nothing;

-- ---------- 1. Las cuentas de dinero ----------
create table if not exists retail.cuentas_dinero (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (trim(nombre) <> '' and char_length(nombre) <= 80),
  tipo text not null check (tipo in ('cajon', 'caja_fuerte', 'por_rendir', 'banco', 'por_abonar', 'tarjeta_credito')),
  cuenta_contable text not null references retail.cuentas (codigo),
  -- La tienda o el Taller del cajón y de la caja fuerte. Las demás son de CAYLA entera.
  ubicacion_id uuid references retail.ubicaciones (id),
  -- Para reconocerla (los últimos dígitos, el CCI). Opcional.
  numero text check (numero is null or char_length(numero) <= 40),
  -- El saldo al EMPEZAR el día `saldo_desde`; desde ese día se suman los movimientos. Nulo = desde siempre (las cajas
  -- fuertes y lo que tiene el líder cuentan todos los traslados de los cierres).
  saldo_inicial numeric(12,2) not null default 0,
  saldo_desde date,
  orden integer not null default 100,
  archivada_en timestamptz,
  archivada_por uuid references public.personas (id),
  creada_por uuid references public.personas (id),
  created_at timestamptz not null default now(),
  constraint cuentas_dinero_contable_del_tipo check (
    (tipo in ('cajon', 'caja_fuerte', 'por_rendir') and cuenta_contable = '101')
    or (tipo = 'banco' and cuenta_contable = '104')
    or (tipo = 'por_abonar' and cuenta_contable = '105')
    or (tipo = 'tarjeta_credito' and cuenta_contable = '451')
  ),
  constraint cuentas_dinero_tienda_del_tipo check ((tipo in ('cajon', 'caja_fuerte')) = (ubicacion_id is not null)),
  -- El cajón lo dice la caja: no tiene saldo propio.
  constraint cuentas_dinero_cajon_sin_saldo check (tipo <> 'cajon' or (saldo_inicial = 0 and saldo_desde is null)),
  constraint cuentas_dinero_saldo_con_fecha check (saldo_inicial = 0 or saldo_desde is not null)
);
comment on table retail.cuentas_dinero is
  'Cada lugar donde CAYLA tiene plata (ADR-0195 F3): cajón y caja fuerte por sede, efectivo por rendir, bancos, POS por abonar y la tarjeta de crédito. Se archiva, no se borra. El saldo NO se guarda: fn_cuentas_dinero_saldos lo suma.';
create unique index if not exists cuentas_dinero_de_sede_uq on retail.cuentas_dinero (ubicacion_id, tipo) where tipo in ('cajon', 'caja_fuerte');
create unique index if not exists cuentas_dinero_por_rendir_uq on retail.cuentas_dinero ((tipo)) where tipo = 'por_rendir';
create unique index if not exists cuentas_dinero_nombre_uq on retail.cuentas_dinero (lower(nombre)) where archivada_en is null;

-- Nace el cajón y la caja fuerte de cada tienda y del Taller, y el efectivo que se entrega al líder.
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, ubicacion_id, orden)
select case when u.tipo = 'taller' then 'Fondo fijo · ' else 'Cajón · ' end || u.nombre, 'cajon', '101', u.id, 30
  from retail.ubicaciones u
 where u.activo and u.tipo in ('tienda', 'taller')
   and not exists (select 1 from retail.cuentas_dinero c where c.ubicacion_id = u.id and c.tipo = 'cajon');
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, ubicacion_id, orden)
select 'Caja fuerte · ' || u.nombre, 'caja_fuerte', '101', u.id, 40
  from retail.ubicaciones u
 where u.activo and u.tipo in ('tienda', 'taller')
   and not exists (select 1 from retail.cuentas_dinero c where c.ubicacion_id = u.id and c.tipo = 'caja_fuerte');
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, orden)
select 'Efectivo entregado al líder', 'por_rendir', '101', 50
 where not exists (select 1 from retail.cuentas_dinero c where c.tipo = 'por_rendir');

-- Una cuenta no se borra ni cambia de naturaleza: solo su nombre, su número, su orden y si está archivada. El cajón, la
-- caja fuerte y lo que tiene el líder nacen con el sistema y no se archivan.
create or replace function retail.fn_cuentas_dinero_inmutable() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Una cuenta no se borra: se archiva.' using errcode = 'P0001';
  end if;
  if (new.id, new.tipo, new.cuenta_contable, new.ubicacion_id, new.saldo_inicial, new.saldo_desde, new.creada_por, new.created_at)
     is distinct from
     (old.id, old.tipo, old.cuenta_contable, old.ubicacion_id, old.saldo_inicial, old.saldo_desde, old.creada_por, old.created_at) then
    raise exception 'De una cuenta solo cambia el nombre, el número o si está archivada: su tipo y su saldo inicial quedan.' using errcode = 'P0001';
  end if;
  if new.archivada_en is not null and old.archivada_en is null and new.tipo in ('cajon', 'caja_fuerte', 'por_rendir') then
    raise exception 'El cajón, la caja fuerte y el efectivo por rendir nacen con cada sede: no se archivan.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists cuentas_dinero_inmutable on retail.cuentas_dinero;
create trigger cuentas_dinero_inmutable before update or delete on retail.cuentas_dinero
  for each row execute function retail.fn_cuentas_dinero_inmutable();

-- ---------- 2. A qué cuenta entra cada cobro (con vigencia) ----------
create table if not exists retail.medios_de_cobro (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  medio text not null check (medio in ('yape', 'plin', 'tarjeta', 'transferencia')),
  -- Nula = se quitó la cuenta (vuelve a «sin cuenta»).
  cuenta_id uuid references retail.cuentas_dinero (id),
  vigente_desde date not null,
  registrado_por uuid references public.personas (id),
  created_at timestamptz not null default now()
);
comment on table retail.medios_de_cobro is
  'A qué cuenta entra cada medio de cobro en cada tienda (ADR-0195 F3). Solo agrega filas: la que rige un día es la de mayor vigente_desde ≤ ese día. Cambiarla no mueve lo pasado. El efectivo siempre cae al cajón de la tienda.';
create index if not exists medios_de_cobro_vigencia_idx on retail.medios_de_cobro (ubicacion_id, medio, vigente_desde desc, created_at desc);

create or replace function retail.fn_medios_de_cobro_validar() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
declare v_c retail.cuentas_dinero%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'A qué cuenta entra un cobro no se edita ni se borra: se cambia desde hoy (queda la historia).' using errcode = 'P0001';
  end if;
  if new.cuenta_id is not null then
    select * into v_c from retail.cuentas_dinero where id = new.cuenta_id;
    if not found or v_c.archivada_en is not null then
      raise exception 'Esa cuenta no existe o está archivada.' using errcode = 'P0001';
    end if;
    if new.medio = 'tarjeta' and v_c.tipo not in ('por_abonar', 'banco') then
      raise exception 'Lo cobrado con tarjeta entra a una cuenta «por abonar» (el POS) o a un banco.' using errcode = 'P0001';
    end if;
    if new.medio <> 'tarjeta' and v_c.tipo <> 'banco' then
      raise exception 'Yape, Plin y transferencias entran a un banco o billetera.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists medios_de_cobro_validar on retail.medios_de_cobro;
create trigger medios_de_cobro_validar before insert or update or delete on retail.medios_de_cobro
  for each row execute function retail.fn_medios_de_cobro_validar();

-- La cuenta a la que entraba un medio en una tienda un día dado. Uso interno (la leen las sumas de saldos).
create or replace function retail.fn_cuenta_de_cobro(p_ubicacion_id uuid, p_medio text, p_fecha date) returns uuid
language sql stable set search_path = retail, public, extensions as $$
  select m.cuenta_id from retail.medios_de_cobro m
   where m.ubicacion_id = p_ubicacion_id and m.medio = p_medio and m.vigente_desde <= p_fecha
   order by m.vigente_desde desc, m.created_at desc
   limit 1;
$$;

-- ---------- 3. Movimientos de dinero ----------
create table if not exists retail.movimientos_dinero (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('aporte', 'prestamo', 'retiro', 'devolucion_prestamo', 'deposito', 'abono_tarjeta', 'pago_tarjeta', 'entre_cuentas')),
  fecha date not null,
  cuenta_origen_id uuid references retail.cuentas_dinero (id),
  cuenta_destino_id uuid references retail.cuentas_dinero (id),
  -- Lo que LLEGA al destino (o lo que sale del origen cuando no hay destino).
  monto numeric(12,2) not null check (monto > 0),
  -- Solo el abono de tarjeta: lo que se queda el POS. Sale del «por abonar» junto con el monto y es un gasto 639.
  comision numeric(12,2) not null default 0 check (comision >= 0),
  gasto_comision_id uuid references retail.gastos (id),
  -- Si sale de un cajón: el egreso de caja que lo respalda (uno solo, y solo para esto).
  caja_movimiento_id uuid references retail.caja_movimientos (id),
  -- La tienda del movimiento (la de su cajón o caja fuerte), para «Ver» y para el permiso. Nula = de CAYLA entera.
  ubicacion_id uuid references retail.ubicaciones (id),
  referencia text check (referencia is null or char_length(referencia) <= 200),
  estado text not null default 'vigente' check (estado in ('vigente', 'anulado')),
  motivo_anulacion text,
  anulado_por uuid references public.personas (id),
  anulado_en timestamptz,
  registrado_por uuid references public.personas (id),
  token_cliente uuid unique,
  created_at timestamptz not null default now(),
  constraint movimientos_dinero_puntas check (
    case
      when tipo in ('aporte', 'prestamo') then cuenta_origen_id is null and cuenta_destino_id is not null
      when tipo in ('retiro', 'devolucion_prestamo') then cuenta_origen_id is not null and cuenta_destino_id is null
      else cuenta_origen_id is not null and cuenta_destino_id is not null and cuenta_origen_id <> cuenta_destino_id
    end
  ),
  constraint movimientos_dinero_comision check ((tipo = 'abono_tarjeta' or comision = 0) and ((comision > 0) = (gasto_comision_id is not null))),
  constraint movimientos_dinero_anulacion check (
    (estado = 'vigente' and motivo_anulacion is null and anulado_por is null and anulado_en is null)
    or (estado = 'anulado' and motivo_anulacion is not null and trim(motivo_anulacion) <> '' and anulado_en is not null)
  )
);
comment on table retail.movimientos_dinero is
  'La plata cambia de lugar o entra/sale del dueño (ADR-0195 F3): depósitos, abonos de tarjeta, pago de la tarjeta, entre cuentas, aportes, préstamos, retiros y devoluciones. No son ventas ni gastos. Solo se agregan filas; un error se anula con motivo.';
create unique index if not exists movimientos_dinero_egreso_uq on retail.movimientos_dinero (caja_movimiento_id)
  where estado = 'vigente' and caja_movimiento_id is not null;
create index if not exists movimientos_dinero_fecha_idx on retail.movimientos_dinero (fecha);
create index if not exists movimientos_dinero_ubicacion_idx on retail.movimientos_dinero (ubicacion_id, fecha);
create index if not exists movimientos_dinero_origen_idx on retail.movimientos_dinero (cuenta_origen_id);
create index if not exists movimientos_dinero_destino_idx on retail.movimientos_dinero (cuenta_destino_id);

create or replace function retail.fn_texto_movimiento_dinero(p_tipo text) returns text
language sql immutable set search_path = retail, public, extensions as $$
  select case p_tipo
    when 'aporte' then 'Aporte del dueño'
    when 'prestamo' then 'Préstamo del dueño'
    when 'retiro' then 'Retiro de utilidades'
    when 'devolucion_prestamo' then 'Devolución de préstamo al dueño'
    when 'deposito' then 'Depósito al banco'
    when 'abono_tarjeta' then 'Abono de tarjeta'
    when 'pago_tarjeta' then 'Pago de la tarjeta de crédito'
    when 'entre_cuentas' then 'Entre cuentas'
    else p_tipo end;
$$;

-- Candados que ni el dueño de la fila salta: qué tipo de cuenta va en cada punta, el egreso del cajón (uno solo y del
-- mismo monto) y que un movimiento solo cambia para anularse.
create or replace function retail.fn_movimientos_dinero_validar() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
declare
  v_o retail.cuentas_dinero%rowtype; v_d retail.cuentas_dinero%rowtype;
  v_mov retail.caja_movimientos%rowtype; v_ubic uuid; v_usado text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Un movimiento de dinero no se borra: se anula con un motivo.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    if old.estado = 'anulado' then
      raise exception 'Ese movimiento ya estaba anulado.' using errcode = 'P0001';
    end if;
    if new.estado <> 'anulado'
       or (new.id, new.tipo, new.fecha, new.cuenta_origen_id, new.cuenta_destino_id, new.monto, new.comision, new.gasto_comision_id,
           new.caja_movimiento_id, new.ubicacion_id, new.referencia, new.registrado_por, new.token_cliente, new.created_at)
          is distinct from
          (old.id, old.tipo, old.fecha, old.cuenta_origen_id, old.cuenta_destino_id, old.monto, old.comision, old.gasto_comision_id,
           old.caja_movimiento_id, old.ubicacion_id, old.referencia, old.registrado_por, old.token_cliente, old.created_at) then
      raise exception 'Un movimiento de dinero no se edita: se anula y se registra de nuevo.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- INSERT
  if new.estado <> 'vigente' then
    raise exception 'Un movimiento nace vigente.' using errcode = 'P0001';
  end if;
  if new.cuenta_origen_id is not null then
    select * into v_o from retail.cuentas_dinero where id = new.cuenta_origen_id;
    if v_o.archivada_en is not null then
      raise exception 'La cuenta «%» está archivada.', v_o.nombre using errcode = 'P0001';
    end if;
  end if;
  if new.cuenta_destino_id is not null then
    select * into v_d from retail.cuentas_dinero where id = new.cuenta_destino_id;
    if v_d.archivada_en is not null then
      raise exception 'La cuenta «%» está archivada.', v_d.nombre using errcode = 'P0001';
    end if;
  end if;

  -- Qué va en cada punta.
  if (new.tipo in ('aporte', 'prestamo') and v_d.tipo not in ('banco', 'caja_fuerte', 'por_rendir'))
     or (new.tipo in ('retiro', 'devolucion_prestamo') and v_o.tipo not in ('banco', 'cajon', 'caja_fuerte', 'por_rendir'))
     or (new.tipo = 'deposito' and (v_o.tipo not in ('cajon', 'caja_fuerte', 'por_rendir') or v_d.tipo <> 'banco'))
     or (new.tipo = 'abono_tarjeta' and (v_o.tipo <> 'por_abonar' or v_d.tipo <> 'banco'))
     or (new.tipo = 'pago_tarjeta' and (v_o.tipo <> 'banco' or v_d.tipo <> 'tarjeta_credito'))
     or (new.tipo = 'entre_cuentas' and (v_o.tipo <> 'banco' or v_d.tipo <> 'banco')) then
    raise exception 'Ese movimiento no va entre esas cuentas (%: de % a %).', retail.fn_texto_movimiento_dinero(new.tipo),
      coalesce(v_o.tipo, 'el dueño'), coalesce(v_d.tipo, 'el dueño') using errcode = 'P0001';
  end if;

  -- Lo que sale de un cajón es un egreso de caja: uno, del mismo monto, de esa tienda, y que no respalde otra cosa.
  if v_o.tipo = 'cajon' then
    if new.caja_movimiento_id is null then
      raise exception 'Lo que sale del cajón necesita su egreso de caja.' using errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('egreso:' || new.caja_movimiento_id::text, 0));
    select * into v_mov from retail.caja_movimientos where id = new.caja_movimiento_id;
    if not found or v_mov.tipo <> 'egreso' then
      raise exception 'Un movimiento solo se respalda con un egreso de caja.' using errcode = 'P0001';
    end if;
    select c.ubicacion_id into v_ubic from retail.cajas c where c.id = v_mov.caja_id;
    if v_ubic is distinct from v_o.ubicacion_id then
      raise exception 'Ese egreso es de la caja de otra tienda.' using errcode = 'P0001';
    end if;
    if v_mov.monto <> new.monto then
      raise exception 'El monto (S/ %) no coincide con el egreso de caja (S/ %).', new.monto, v_mov.monto using errcode = 'P0001';
    end if;
    v_usado := retail.fn_egreso_ya_usado(new.caja_movimiento_id, 'movimiento');
    if v_usado is not null then
      raise exception 'Ese egreso de caja ya se usó (%).', case v_usado when 'gasto' then 'es un gasto' when 'activo' then 'es un activo fijo'
        when 'movimiento' then 'ya es un depósito o retiro' else 'está marcado «no es gasto»' end using errcode = 'P0001';
    end if;
  elsif new.caja_movimiento_id is not null then
    raise exception 'Solo lo que sale de un cajón se une a un egreso de caja.' using errcode = 'P0001';
  end if;

  new.ubicacion_id := coalesce(v_o.ubicacion_id, v_d.ubicacion_id);
  return new;
end $$;
drop trigger if exists movimientos_dinero_validar on retail.movimientos_dinero;
create trigger movimientos_dinero_validar before insert or update or delete on retail.movimientos_dinero
  for each row execute function retail.fn_movimientos_dinero_validar();

-- ---------- 4. Conciliación ----------
create table if not exists retail.conciliaciones (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references retail.cuentas_dinero (id),
  -- El saldo que dice el banco AL CIERRE de ese día (lo que muestra la banca por internet).
  fecha date not null,
  saldo_banco numeric(12,2) not null,
  nota text check (nota is null or char_length(nota) <= 200),
  estado text not null default 'vigente' check (estado in ('vigente', 'anulada')),
  motivo_anulacion text,
  anulada_por uuid references public.personas (id),
  anulada_en timestamptz,
  registrado_por uuid references public.personas (id),
  created_at timestamptz not null default now(),
  constraint conciliaciones_anulacion check (
    (estado = 'vigente' and motivo_anulacion is null and anulada_en is null)
    or (estado = 'anulada' and motivo_anulacion is not null and trim(motivo_anulacion) <> '' and anulada_en is not null)
  )
);
comment on table retail.conciliaciones is
  'Lo que dice el banco en una fecha (ADR-0195 F3). El saldo del sistema NO se guarda: se suma al leer, y la diferencia sale de las dos. Se anula con motivo, no se borra.';
create unique index if not exists conciliaciones_dia_uq on retail.conciliaciones (cuenta_id, fecha) where estado = 'vigente';

-- Las líneas del período que el líder ya revisó contra el banco. La clave identifica la línea (un movimiento, un pago,
-- los cobros de un día con un medio en una tienda); `monto` es el que tenía al revisarla: si cambió, vuelve a pedirse.
create table if not exists retail.dinero_revisados (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references retail.cuentas_dinero (id),
  clave text not null check (char_length(clave) <= 200),
  monto numeric(12,2) not null,
  revisado_por uuid references public.personas (id),
  revisado_en timestamptz not null default now(),
  desmarcado_por uuid references public.personas (id),
  desmarcado_en timestamptz
);
create unique index if not exists dinero_revisados_vigente_uq on retail.dinero_revisados (cuenta_id, clave) where desmarcado_en is null;

create or replace function retail.fn_conciliaciones_solo_anular() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Una conciliación no se borra: se anula con un motivo.' using errcode = 'P0001';
  end if;
  if old.estado = 'anulada' or new.estado <> 'anulada'
     or (new.id, new.cuenta_id, new.fecha, new.saldo_banco, new.nota, new.registrado_por, new.created_at)
        is distinct from (old.id, old.cuenta_id, old.fecha, old.saldo_banco, old.nota, old.registrado_por, old.created_at) then
    raise exception 'Una conciliación no se edita: se anula y se anota de nuevo.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists conciliaciones_solo_anular on retail.conciliaciones;
create trigger conciliaciones_solo_anular before update or delete on retail.conciliaciones
  for each row execute function retail.fn_conciliaciones_solo_anular();

create or replace function retail.fn_dinero_revisados_solo_desmarcar() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Una revisión no se borra: se desmarca.' using errcode = 'P0001';
  end if;
  if old.desmarcado_en is not null or new.desmarcado_en is null
     or (new.id, new.cuenta_id, new.clave, new.monto, new.revisado_por, new.revisado_en)
        is distinct from (old.id, old.cuenta_id, old.clave, old.monto, old.revisado_por, old.revisado_en) then
    raise exception 'Una revisión solo cambia para desmarcarse.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists dinero_revisados_solo_desmarcar on retail.dinero_revisados;
create trigger dinero_revisados_solo_desmarcar before update or delete on retail.dinero_revisados
  for each row execute function retail.fn_dinero_revisados_solo_desmarcar();

-- ---------- 5. Quién ve qué ----------
-- El líder: todas las sedes activas. Con el módulo Cuentas y dinero: la suya. Sin él, ninguna.
create or replace function retail.fn_cuentas_dinero_ubicaciones() returns uuid[]
language sql stable security definer set search_path = retail, public, extensions as $$
  select case
    when retail.fn_es_lider() then
      (select coalesce(array_agg(u.id order by u.id), '{}') from retail.ubicaciones u where u.activo)
    when retail.fn_capacidad_por_modulos(array['cuentas_dinero']) and retail.fn_ubicacion_actual_persona() is not null then
      array[retail.fn_ubicacion_actual_persona()]
    else '{}'::uuid[]
  end;
$$;
comment on function retail.fn_cuentas_dinero_ubicaciones() is 'Las sedes cuyo dinero ve la cuenta: todas para el líder, la suya con el módulo Cuentas y dinero, ninguna sin él.';

create or replace function retail.fn_exigir_lider_dinero(p_que text) returns void
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if not retail.fn_es_lider() then
    raise exception '% es solo del líder.', p_que using errcode = '42501';
  end if;
end $$;

-- ---------- 6. El libro: cada entrada y salida de plata, con su cuenta ----------
-- USO INTERNO (sin permiso para nadie): lo leen las sumas de saldos y la conciliación, que ya piden su permiso.
-- Una fila por cosa que movió plata, con la cuenta que tocó (nula = «sin cuenta»: todavía no se sabe de dónde salió).
-- El CAJÓN no está aquí: su saldo lo dice la caja (lo que sale de un cajón ya es un egreso de caja).
-- PROVISIONAL hasta F3b: la cuenta de los cobros y pagos se deduce de su medio y su tienda (`medios_de_cobro` vigente ese
-- día); F3b la sella en cada cobro y pago y este libro pasará a leerla.
create or replace function retail.fn_dinero_libro(p_hasta date)
returns table (cuenta_id uuid, fecha date, monto numeric, clave text, detalle text, ubicacion_id uuid, origen text)
language sql stable set search_path = retail, public, extensions as $$
  with tarjeta as (
    -- La tarjeta de crédito que paga lo que dice «tarjeta» (provisional: la primera activa).
    select c.id from retail.cuentas_dinero c where c.tipo = 'tarjeta_credito' and c.archivada_en is null order by c.orden, c.created_at limit 1
  ),
  movs as (
    select d.cuenta_destino_id as cuenta_id, d.fecha, d.monto::numeric as monto, 'mov:' || d.id::text as clave,
           retail.fn_texto_movimiento_dinero(d.tipo) || coalesce(' · ' || d.referencia, '') as detalle, d.ubicacion_id, 'movimiento'::text as origen
      from retail.movimientos_dinero d
     where d.estado = 'vigente' and d.cuenta_destino_id is not null and d.fecha <= p_hasta
    union all
    select d.cuenta_origen_id, d.fecha, -(d.monto + d.comision), 'mov:' || d.id::text,
           retail.fn_texto_movimiento_dinero(d.tipo) || coalesce(' · ' || d.referencia, '') ||
             case when d.comision > 0 then ' (incluye comisión S/ ' || to_char(d.comision, 'FM999999990.00') || ')' else '' end,
           d.ubicacion_id, 'movimiento'
      from retail.movimientos_dinero d join retail.cuentas_dinero o on o.id = d.cuenta_origen_id
     where d.estado = 'vigente' and o.tipo <> 'cajon' and d.fecha <= p_hasta
  ),
  traslados as (
    select case t.destino
             when 'caja_fuerte' then (select f.id from retail.cuentas_dinero f where f.tipo = 'caja_fuerte' and f.ubicacion_id = k.ubicacion_id)
             when 'lider' then (select r.id from retail.cuentas_dinero r where r.tipo = 'por_rendir')
             -- «banco» sin decir cuál (hasta F3b): el banco de las transferencias de esa tienda.
             else retail.fn_cuenta_de_cobro(k.ubicacion_id, 'transferencia', (t.creado_en at time zone 'America/Lima')::date)
           end as cuenta_id,
           (t.creado_en at time zone 'America/Lima')::date as fecha, t.monto::numeric as monto, 'traslado:' || t.id::text as clave,
           'Cierre de caja · ' || u.nombre || case t.destino when 'caja_fuerte' then ' → caja fuerte' when 'lider' then ' → entregado al líder' else ' → depósito' end
             || coalesce(' · ' || t.referencia, '') as detalle,
           k.ubicacion_id, 'traslado'::text as origen
      from retail.caja_traslados t join retail.cajas k on k.id = t.caja_id join retail.ubicaciones u on u.id = k.ubicacion_id
     where not k.es_prueba and (t.creado_en at time zone 'America/Lima')::date <= p_hasta
  ),
  cobros_base as (
    select v.ubicacion_id, (v.created_at at time zone 'America/Lima')::date as fecha, vp.metodo as medio, vp.monto::numeric as monto
      from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id
     where v.estado = 'completada' and not v.es_prueba and vp.metodo in ('yape', 'plin', 'tarjeta', 'transferencia')
    union all
    select s.ubicacion_id, (sp.created_at at time zone 'America/Lima')::date, sp.metodo, sp.monto
      from retail.separacion_pagos sp join retail.separaciones s on s.id = sp.separacion_id
     where sp.metodo in ('yape', 'plin', 'tarjeta', 'transferencia')
    union all
    -- La diferencia de un cambio ya trae el signo (la clienta paga + / se le devuelve −).
    select cb.ubicacion_id, (cb.created_at at time zone 'America/Lima')::date, cb.metodo_pago_diferencia, cb.diferencia
      from retail.cambios cb
     where cb.metodo_pago_diferencia in ('yape', 'plin', 'tarjeta', 'transferencia') and cb.diferencia <> 0
    union all
    select dv.ubicacion_id, (dv.aprobado_en at time zone 'America/Lima')::date, dv.reembolso_metodo, -dv.reembolso_monto
      from retail.devoluciones dv
     where dv.estado = 'aprobada' and dv.reembolso_metodo in ('yape', 'plin', 'tarjeta', 'transferencia') and coalesce(dv.reembolso_monto, 0) > 0
  ),
  cobros as (
    -- Los cobros de un día con un medio en una tienda van en UNA línea: así llegan al banco (el lote del Yape, del POS).
    select retail.fn_cuenta_de_cobro(c.ubicacion_id, c.medio, c.fecha) as cuenta_id, c.fecha, sum(c.monto) as monto,
           'cobros:' || c.fecha::text || ':' || c.ubicacion_id::text || ':' || c.medio as clave,
           'Cobros con ' || case c.medio when 'yape' then 'Yape' when 'plin' then 'Plin' else c.medio end || ' · ' || u.nombre as detalle,
           c.ubicacion_id, 'cobros'::text as origen
      from cobros_base c join retail.ubicaciones u on u.id = c.ubicacion_id
     where c.fecha <= p_hasta
     group by c.ubicacion_id, c.fecha, c.medio, u.nombre
    having sum(c.monto) <> 0
  ),
  pagos as (
    -- Pagos de comprobantes de proveedor (mercadería, gasto o activo). En efectivo no dicen de dónde salieron (§7 bis:
    -- el hueco de los S/ 15,661), salvo los que ya son un egreso de caja (un gasto o activo pagado del cajón).
    select case
             when cp.metodo = 'tarjeta' then (select id from tarjeta)
             when cp.metodo in ('yape', 'plin') then retail.fn_cuenta_de_cobro(cp.ubicacion_id, cp.metodo, cp.fecha)
             when cp.metodo in ('transferencia', 'deposito', 'otro') then retail.fn_cuenta_de_cobro(cp.ubicacion_id, 'transferencia', cp.fecha)
           end as cuenta_id,
           cp.fecha, -cp.monto::numeric as monto, 'pago:' || cp.id::text as clave,
           'Pago a ' || pr.nombre || ' · ' || c.serie || '-' || c.numero as detalle, cp.ubicacion_id, 'pago'::text as origen
      from retail.compra_pagos cp
      join retail.compras c on c.id = cp.compra_id
      join retail.proveedores pr on pr.id = c.proveedor_id
     where cp.metodo <> 'saldo_a_favor' and cp.fecha <= p_hasta
       and not (cp.metodo = 'efectivo' and (
             exists (select 1 from retail.gastos g where g.compra_id = c.id and g.caja_movimiento_id is not null and g.estado = 'vigente')
          or exists (select 1 from retail.activos_fijos a where a.compra_id = c.id and a.caja_movimiento_id is not null and a.estado <> 'anulado')))
    union all
    -- Gastos sin comprobante pagados sin cajón. La comisión del POS no: esa plata ya la descontó el abono.
    select case
             when g.medio_pago = 'tarjeta' then (select id from tarjeta)
             when g.medio_pago in ('yape', 'plin') then retail.fn_cuenta_de_cobro(g.ubicacion_id, g.medio_pago, g.fecha)
             else retail.fn_cuenta_de_cobro(g.ubicacion_id, 'transferencia', g.fecha)
           end,
           g.fecha, -g.monto_total, 'gasto:' || g.id::text, 'Gasto · ' || g.descripcion, g.ubicacion_id, 'gasto'
      from retail.gastos g
     where g.compra_id is null and g.estado = 'vigente' and g.medio_pago <> 'efectivo' and g.fecha <= p_hasta
       and not exists (select 1 from retail.movimientos_dinero d where d.gasto_comision_id = g.id)
    union all
    select case
             when a.medio_pago = 'tarjeta' then (select id from tarjeta)
             when a.medio_pago in ('yape', 'plin') then retail.fn_cuenta_de_cobro(a.ubicacion_id, a.medio_pago, a.fecha_adquisicion)
             else retail.fn_cuenta_de_cobro(a.ubicacion_id, 'transferencia', a.fecha_adquisicion)
           end,
           a.fecha_adquisicion, -a.costo, 'activo:' || a.id::text, 'Activo · ' || a.nombre, a.ubicacion_id, 'activo'
      from retail.activos_fijos a
     where a.compra_id is null and a.estado <> 'anulado' and a.medio_pago is not null and a.medio_pago <> 'efectivo'
       and a.fecha_adquisicion <= p_hasta
  )
  select * from movs
  union all select * from traslados
  union all select * from cobros
  union all select * from pagos;
$$;
comment on function retail.fn_dinero_libro(date) is
  'USO INTERNO. Cada entrada y salida de plata hasta una fecha, con la cuenta que tocó (nula = sin cuenta). Provisional hasta F3b: la cuenta de cobros y pagos se deduce de su medio y tienda.';

-- ---------- 7. Lecturas ----------

-- Los saldos, SUMADOS al corte. El líder ve todas (con `p_ubicacion_id`, el cajón y la caja fuerte de esa sede y las
-- cuentas de CAYLA entera). Con el módulo: su cajón y su caja fuerte, y los bancos activos solo como destino (sin saldo).
create or replace function retail.fn_cuentas_dinero_saldos(p_corte date default null, p_ubicacion_id uuid default null)
returns table (id uuid, nombre text, tipo text, cuenta_contable text, ubicacion_id uuid, ubicacion_nombre text, numero text,
               saldo numeric, archivada boolean, solo_destino boolean, caja_id uuid, caja_abierta boolean, saldo_desde date,
               ultima_conciliacion date, ultimo_abono date, orden integer)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_hoy date := retail.fn_hoy_lima();
  v_corte date := coalesce(p_corte, retail.fn_hoy_lima());
  v_lider boolean := retail.fn_es_lider();
  v_ubics uuid[] := retail.fn_cuentas_dinero_ubicaciones();
  v_ve_caja boolean := retail.fn_puede_gestionar_caja();
begin
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver las cuentas necesita el módulo Cuentas y dinero en tu rol.' using errcode = '42501';
  end if;
  return query
  with visibles as (
    select c.*, (not v_lider and c.ubicacion_id is null) as solo_dest
      from retail.cuentas_dinero c
     where (v_lider and (p_ubicacion_id is null or c.ubicacion_id is null or c.ubicacion_id = p_ubicacion_id))
        or (not v_lider and (c.ubicacion_id = any (v_ubics) or (c.tipo = 'banco' and c.archivada_en is null)))
  ),
  libro as materialized (
    select l.cuenta_id, l.fecha, l.monto from retail.fn_dinero_libro(v_corte) l where l.cuenta_id is not null
  ),
  abiertas as (
    select k.id, k.ubicacion_id from retail.cajas k where k.estado = 'abierta' and not k.es_prueba
  )
  select v.id, v.nombre, v.tipo, v.cuenta_contable, v.ubicacion_id, u.nombre, v.numero,
         case
           when v.solo_dest then null
           when v.tipo = 'cajon' and ab.id is not null and v_corte >= v_hoy then
             -- Lo mismo que ve el cierre (ADR-0186): solo quien puede cerrar la caja.
             case when v_ve_caja then (select e.esperado from retail.fn_calcular_esperado_caja(ab.id) e) end
           when v.tipo = 'cajon' then
             coalesce((select coalesce(k.monto_fondo, k.monto_cierre_real) from retail.cajas k
                        where k.ubicacion_id = v.ubicacion_id and k.estado = 'cerrada' and not k.es_prueba
                          and (k.cerrada_en at time zone 'America/Lima')::date <= v_corte
                        order by k.cerrada_en desc limit 1), 0)
           else v.saldo_inicial + coalesce((select sum(l.monto) from libro l
                                              where l.cuenta_id = v.id and (v.saldo_desde is null or l.fecha >= v.saldo_desde)), 0)
         end,
         v.archivada_en is not null, v.solo_dest, ab.id, ab.id is not null, v.saldo_desde,
         (select max(cc.fecha) from retail.conciliaciones cc where cc.cuenta_id = v.id and cc.estado = 'vigente'),
         (select max(d.fecha) from retail.movimientos_dinero d where d.cuenta_origen_id = v.id and d.tipo = 'abono_tarjeta' and d.estado = 'vigente'),
         v.orden
    from visibles v
    left join retail.ubicaciones u on u.id = v.ubicacion_id
    left join abiertas ab on v.tipo = 'cajon' and ab.ubicacion_id = v.ubicacion_id
   order by v.orden, u.nombre nulls first, v.nombre;
end $$;
comment on function retail.fn_cuentas_dinero_saldos(date, uuid) is
  'Los saldos de las cuentas al corte, SUMADOS (nunca guardados). Cajón: lo que dice la caja. Bancos: provisional hasta F3b.';

-- Lo que movió plata y todavía no dice de qué cuenta (solo el líder): para decirlo en voz alta, no para esconderlo.
create or replace function retail.fn_dinero_sin_cuenta(p_desde date default null, p_hasta date default null)
returns table (origen text, n integer, monto numeric)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_hasta date := coalesce(p_hasta, retail.fn_hoy_lima()); v_desde date := coalesce(p_desde, date_trunc('month', retail.fn_hoy_lima())::date);
begin
  perform retail.fn_exigir_lider_dinero('Ver lo que no tiene cuenta');
  return query
  select l.origen, count(*)::integer, sum(l.monto)
    from retail.fn_dinero_libro(v_hasta) l
   where l.cuenta_id is null and l.fecha >= v_desde
   group by l.origen
   order by l.origen;
end $$;

-- Los bancos a los que se puede depositar (para elegir «¿a qué cuenta llegó?»). Sin el módulo, vacío (no falla: la
-- pantalla de Gastos lo pide para todos).
create or replace function retail.fn_cuentas_dinero_destinos()
returns table (id uuid, nombre text)
language sql stable security definer set search_path = retail, public, extensions as $$
  select c.id, c.nombre from retail.cuentas_dinero c
   where c.tipo = 'banco' and c.archivada_en is null
     and (retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['cuentas_dinero']))
   order by c.orden, c.nombre;
$$;

-- Los movimientos (vigentes y anulados: los anulados se quedan a la vista). El líder: todos o los de una sede. Con el
-- módulo: los de su sede.
create or replace function retail.fn_movimientos_dinero(p_ubicacion_id uuid default null, p_limite integer default 100)
returns table (id uuid, tipo text, fecha date, cuenta_origen_id uuid, origen_nombre text, origen_tipo text,
               cuenta_destino_id uuid, destino_nombre text, destino_tipo text, monto numeric, comision numeric,
               referencia text, ubicacion_id uuid, estado text, motivo_anulacion text, registrado_por_nombre text,
               anulado_por_nombre text, caja_movimiento_id uuid, creado_en timestamptz, puede_anular boolean)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_lider boolean := retail.fn_es_lider(); v_ubics uuid[] := retail.fn_cuentas_dinero_ubicaciones();
begin
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver los movimientos necesita el módulo Cuentas y dinero en tu rol.' using errcode = '42501';
  end if;
  return query
  select d.id, d.tipo, d.fecha, d.cuenta_origen_id, o.nombre, o.tipo, d.cuenta_destino_id, de.nombre, de.tipo, d.monto, d.comision,
         d.referencia, d.ubicacion_id, d.estado, d.motivo_anulacion,
         trim(concat_ws(' ', pr.nombres, pr.apellidos)), trim(concat_ws(' ', pa.nombres, pa.apellidos)),
         d.caja_movimiento_id, d.created_at,
         d.estado = 'vigente' and (v_lider or (d.tipo = 'deposito' and d.ubicacion_id = any (v_ubics)))
    from retail.movimientos_dinero d
    left join retail.cuentas_dinero o on o.id = d.cuenta_origen_id
    left join retail.cuentas_dinero de on de.id = d.cuenta_destino_id
    left join public.personas pr on pr.id = d.registrado_por
    left join public.personas pa on pa.id = d.anulado_por
   where (v_lider and (p_ubicacion_id is null or d.ubicacion_id = p_ubicacion_id))
      or (not v_lider and d.ubicacion_id = any (v_ubics))
   order by d.fecha desc, d.created_at desc
   limit greatest(p_limite, 1);
end $$;

-- La plata del dueño (solo el líder): aportes, préstamos, retiros y devoluciones vigentes.
create or replace function retail.fn_plata_del_dueno()
returns table (id uuid, tipo text, fecha date, monto numeric, referencia text, cuenta_nombre text)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
begin
  perform retail.fn_exigir_lider_dinero('La plata del dueño');
  return query
  select d.id, d.tipo, d.fecha, d.monto, d.referencia, coalesce(de.nombre, o.nombre)
    from retail.movimientos_dinero d
    left join retail.cuentas_dinero o on o.id = d.cuenta_origen_id
    left join retail.cuentas_dinero de on de.id = d.cuenta_destino_id
   where d.estado = 'vigente' and d.tipo in ('aporte', 'prestamo', 'retiro', 'devolucion_prestamo')
   order by d.fecha, d.created_at;
end $$;

-- A qué cuenta entra hoy cada medio en cada tienda (solo el líder). Una fila por tienda activa y medio, con o sin cuenta.
create or replace function retail.fn_medios_de_cobro()
returns table (ubicacion_id uuid, ubicacion_nombre text, medio text, cuenta_id uuid, cuenta_nombre text, vigente_desde date)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_hoy date := retail.fn_hoy_lima();
begin
  perform retail.fn_exigir_lider_dinero('Ver a qué cuenta entra cada cobro');
  return query
  select u.id, u.nombre, m.medio, x.cuenta_id, c.nombre, x.vigente_desde
    from retail.ubicaciones u
   cross join (values ('yape', 1), ('plin', 2), ('tarjeta', 3), ('transferencia', 4)) as m (medio, orden)
    left join lateral (
      select mc.cuenta_id, mc.vigente_desde from retail.medios_de_cobro mc
       where mc.ubicacion_id = u.id and mc.medio = m.medio and mc.vigente_desde <= v_hoy
       order by mc.vigente_desde desc, mc.created_at desc limit 1
    ) x on true
    left join retail.cuentas_dinero c on c.id = x.cuenta_id
   where u.activo and u.tipo = 'tienda'
   order by u.nombre, m.orden;
end $$;

-- Los egresos de una sede que un depósito o un retiro puede tomar: los que nada usa todavía, y los marcados «no es gasto»
-- como depósito o retiro (al tomarlos, la marca se revierte sola: ahora dicen a qué cuenta fue la plata).
create or replace function retail.fn_egresos_para_movimiento(p_ubicacion_id uuid)
returns table (id uuid, caja_id uuid, monto numeric, motivo text, nota text, creado_en timestamptz, marca text)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
begin
  if p_ubicacion_id is null or not (p_ubicacion_id = any (retail.fn_cuentas_dinero_ubicaciones())) then
    raise exception 'Esa sede no es tuya.' using errcode = '42501';
  end if;
  return query
  select m.id, m.caja_id, m.monto, m.motivo, m.nota, m.created_at,
         (select e.tipo from retail.egresos_no_gasto e where e.caja_movimiento_id = m.id and e.revertido_en is null)
    from retail.caja_movimientos m join retail.cajas k on k.id = m.caja_id
   where m.tipo = 'egreso' and k.ubicacion_id = p_ubicacion_id and not k.es_prueba
     and m.created_at >= now() - interval '60 days'
     and (retail.fn_egreso_ya_usado(m.id) is null
          or (retail.fn_egreso_ya_usado(m.id) = 'no_gasto'
              and exists (select 1 from retail.egresos_no_gasto e where e.caja_movimiento_id = m.id and e.revertido_en is null and e.tipo in ('deposito', 'retiro'))))
   order by m.created_at desc
   limit 50;
end $$;

-- Efectivo por tienda: lo que debería haber en cada cajón. La MISMA cuenta que el cierre (`fn_calcular_esperado_caja`,
-- ADR-0186) y el mismo candado: el esperado solo lo ve quien puede cerrar la caja. Sin caja abierta: lo que quedó.
create or replace function retail.fn_efectivo_por_tienda(p_ubicacion_id uuid default null)
returns table (ubicacion_id uuid, ubicacion_nombre text, caja_id uuid, abierta boolean, abierta_en timestamptz, abierta_por text,
               apertura numeric, ventas_efectivo numeric, ingresos numeric, egresos numeric, depositos numeric,
               reembolsos numeric, cambios numeric, esperado numeric, cerrada_en timestamptz, fondo numeric)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_ubics uuid[] := retail.fn_cuentas_dinero_ubicaciones(); v_ve_caja boolean := retail.fn_puede_gestionar_caja();
begin
  if coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver el efectivo necesita el módulo Cuentas y dinero en tu rol.' using errcode = '42501';
  end if;
  return query
  with ubics as (
    select u.id, u.nombre, u.tipo from retail.ubicaciones u
     where u.activo and u.tipo in ('tienda', 'taller') and u.id = any (v_ubics)
       and (p_ubicacion_id is null or u.id = p_ubicacion_id)
  ),
  abiertas as (
    select k.id, k.ubicacion_id, k.abierta_en, k.abierta_por from retail.cajas k
     where k.estado = 'abierta' and not k.es_prueba and k.ubicacion_id in (select ubics.id from ubics)
  ),
  filas as (
    -- Con la caja abierta: lo que calcula el cierre.
    select u.id as uid, u.nombre as unombre, u.tipo as utipo, ab.id as cid, true as abierta, ab.abierta_en,
           trim(concat_ws(' ', pe.nombres, pe.apellidos)) as abierta_por,
           e.apertura, e.ventas_efectivo, e.ingresos,
           e.egresos - coalesce(dep.monto, 0) as egresos, coalesce(dep.monto, 0) as depositos,
           e.reembolsos_efectivo, e.cambios_efectivo,
           case when v_ve_caja then e.esperado end as esperado,
           null::timestamptz as cerrada_en, null::numeric as fondo
      from ubics u
      join abiertas ab on ab.ubicacion_id = u.id
      cross join lateral retail.fn_calcular_esperado_caja(ab.id) e
      left join public.personas pe on pe.id = ab.abierta_por
      left join lateral (
        -- Los egresos de esta caja que fueron al banco (un depósito registrado, o la marca «no es gasto: depósito»).
        select sum(m.monto) as monto from retail.caja_movimientos m
         where m.caja_id = ab.id and m.tipo = 'egreso'
           and (exists (select 1 from retail.movimientos_dinero d where d.caja_movimiento_id = m.id and d.estado = 'vigente' and d.tipo = 'deposito')
                or exists (select 1 from retail.egresos_no_gasto x where x.caja_movimiento_id = m.id and x.revertido_en is null and x.tipo = 'deposito'))
      ) dep on true
    union all
    -- Sin caja abierta: lo que quedó en el cajón al último cierre.
    select u.id, u.nombre, u.tipo, null::uuid, false, null::timestamptz, null::text,
           null::numeric, null::numeric, null::numeric, null::numeric, null::numeric, null::numeric, null::numeric, null::numeric,
           ce.cerrada_en, ce.fondo
      from ubics u
      left join lateral (
        select k.cerrada_en, coalesce(k.monto_fondo, k.monto_cierre_real) as fondo from retail.cajas k
         where k.ubicacion_id = u.id and k.estado = 'cerrada' and not k.es_prueba
         order by k.cerrada_en desc limit 1
      ) ce on true
     where not exists (select 1 from abiertas ab where ab.ubicacion_id = u.id)
  )
  select f.uid, f.unombre, f.cid, f.abierta, f.abierta_en, f.abierta_por, f.apertura, f.ventas_efectivo, f.ingresos, f.egresos,
         f.depositos, f.reembolsos_efectivo, f.cambios_efectivo, f.esperado, f.cerrada_en, f.fondo
    from filas f
   order by (f.utipo = 'taller'), f.unombre;
end $$;

-- Los últimos cierres que no cuadraron (quien puede cerrar la caja; los demás, nada).
create or replace function retail.fn_cierres_con_diferencia(p_ubicacion_id uuid default null, p_dias integer default 14)
returns table (caja_id uuid, ubicacion_nombre text, cerrada_en timestamptz, diferencia numeric, cerrada_por text)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_ubics uuid[] := retail.fn_cuentas_dinero_ubicaciones();
begin
  if not retail.fn_puede_gestionar_caja() then
    return;
  end if;
  return query
  select k.id, u.nombre, k.cerrada_en, k.diferencia, trim(concat_ws(' ', pe.nombres, pe.apellidos))
    from retail.cajas k join retail.ubicaciones u on u.id = k.ubicacion_id
    left join public.personas pe on pe.id = k.cerrada_por
   where k.estado = 'cerrada' and not k.es_prueba and abs(coalesce(k.diferencia, 0)) >= 0.01
     and k.cerrada_en >= now() - make_interval(days => greatest(p_dias, 1))
     and k.ubicacion_id = any (v_ubics) and (p_ubicacion_id is null or k.ubicacion_id = p_ubicacion_id)
   order by k.cerrada_en desc
   limit 20;
end $$;

-- Las cuentas que se concilian contra un extracto (bancos, POS y tarjeta), con su última conciliación y cuántas líneas
-- del período abierto faltan revisar. Solo el líder.
create or replace function retail.fn_conciliacion_cuentas()
returns table (id uuid, nombre text, tipo text, saldo_hoy numeric, ultima_fecha date, ultimo_saldo_banco numeric,
               ultima_diferencia numeric, pendientes integer)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_hoy date := retail.fn_hoy_lima();
begin
  perform retail.fn_exigir_lider_dinero('La conciliación');
  return query
  with cuentas as (
    select c.* from retail.cuentas_dinero c where c.tipo in ('banco', 'por_abonar', 'tarjeta_credito') and c.archivada_en is null
  ),
  libro as materialized (
    select l.cuenta_id, l.fecha, l.monto, l.clave from retail.fn_dinero_libro(v_hoy) l
     where l.cuenta_id in (select cuentas.id from cuentas)
  ),
  ultima as (
    select distinct on (cc.cuenta_id) cc.cuenta_id, cc.fecha, cc.saldo_banco
      from retail.conciliaciones cc where cc.estado = 'vigente'
     order by cc.cuenta_id, cc.fecha desc
  )
  select c.id, c.nombre, c.tipo,
         c.saldo_inicial + coalesce((select sum(l.monto) from libro l where l.cuenta_id = c.id and (c.saldo_desde is null or l.fecha >= c.saldo_desde)), 0),
         ul.fecha, ul.saldo_banco,
         case when ul.fecha is not null then
           ul.saldo_banco - (c.saldo_inicial + coalesce((select sum(l.monto) from libro l
                              where l.cuenta_id = c.id and (c.saldo_desde is null or l.fecha >= c.saldo_desde) and l.fecha <= ul.fecha), 0))
         end,
         (select count(*)::integer from (
            select l.clave, sum(l.monto) as monto from libro l
             where l.cuenta_id = c.id and l.fecha > coalesce(ul.fecha, c.saldo_desde - 1, '-infinity'::date)
             group by l.clave
          ) x
          where not exists (select 1 from retail.dinero_revisados r
                             where r.cuenta_id = c.id and r.clave = x.clave and r.desmarcado_en is null and r.monto = x.monto))
    from cuentas c left join ultima ul on ul.cuenta_id = c.id
   order by c.orden, c.nombre;
end $$;

-- Una cuenta a una fecha: el saldo del sistema, lo que dijo el banco ese día (si se anotó), la diferencia, y las líneas
-- del período (desde la conciliación anterior) con su marca de revisada. Solo el líder.
create or replace function retail.fn_conciliacion(p_cuenta_id uuid, p_hasta date default null)
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_hasta date := least(coalesce(p_hasta, retail.fn_hoy_lima()), retail.fn_hoy_lima());
  v_c retail.cuentas_dinero%rowtype;
  v_desde date;
  v_res jsonb;
begin
  perform retail.fn_exigir_lider_dinero('La conciliación');
  select * into v_c from retail.cuentas_dinero where id = p_cuenta_id;
  if not found or v_c.tipo not in ('banco', 'por_abonar', 'tarjeta_credito') then
    raise exception 'Solo se concilian bancos, el POS y la tarjeta de crédito.' using errcode = 'P0001';
  end if;
  v_desde := coalesce(
    (select max(cc.fecha) + 1 from retail.conciliaciones cc where cc.cuenta_id = p_cuenta_id and cc.estado = 'vigente' and cc.fecha < v_hasta),
    v_c.saldo_desde,
    v_hasta - 30);

  with libro as materialized (
    select l.fecha, l.monto, l.clave, l.detalle from retail.fn_dinero_libro(v_hoy) l
     where l.cuenta_id = p_cuenta_id and (v_c.saldo_desde is null or l.fecha >= v_c.saldo_desde)
  ),
  lineas as (
    select l.clave, min(l.fecha) as fecha, sum(l.monto) as monto, min(l.detalle) as detalle
      from libro l where l.fecha between v_desde and v_hasta
     group by l.clave
  ),
  historial as (
    select cc.id, cc.fecha, cc.saldo_banco, cc.nota,
           v_c.saldo_inicial + coalesce((select sum(l.monto) from libro l where l.fecha <= cc.fecha), 0) as saldo_sistema,
           trim(concat_ws(' ', pe.nombres, pe.apellidos)) as registrado_por
      from retail.conciliaciones cc left join public.personas pe on pe.id = cc.registrado_por
     where cc.cuenta_id = p_cuenta_id and cc.estado = 'vigente'
     order by cc.fecha desc limit 12
  )
  select jsonb_build_object(
    'cuenta', jsonb_build_object('id', v_c.id, 'nombre', v_c.nombre, 'tipo', v_c.tipo, 'saldo_desde', v_c.saldo_desde),
    'desde', v_desde,
    'hasta', v_hasta,
    'saldo_sistema', v_c.saldo_inicial + coalesce((select sum(l.monto) from libro l where l.fecha <= v_hasta), 0),
    'conciliacion', (select jsonb_build_object('id', h.id, 'saldo_banco', h.saldo_banco, 'saldo_sistema', h.saldo_sistema,
                                               'diferencia', h.saldo_banco - h.saldo_sistema, 'nota', h.nota, 'registrado_por', h.registrado_por)
                       from historial h where h.fecha = v_hasta),
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'clave', li.clave, 'fecha', li.fecha, 'detalle', li.detalle, 'monto', li.monto,
               'revisado', r.id is not null and r.monto = li.monto,
               'monto_revisado', case when r.id is not null and r.monto <> li.monto then r.monto end,
               'revisado_por', case when r.id is not null then trim(concat_ws(' ', pe.nombres, pe.apellidos)) end)
             order by li.fecha desc, li.clave)
        from lineas li
        left join retail.dinero_revisados r on r.cuenta_id = p_cuenta_id and r.clave = li.clave and r.desmarcado_en is null
        left join public.personas pe on pe.id = r.revisado_por), '[]'::jsonb),
    'historial', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'fecha', h.fecha, 'saldo_banco', h.saldo_banco,
                                                              'saldo_sistema', h.saldo_sistema, 'diferencia', h.saldo_banco - h.saldo_sistema,
                                                              'nota', h.nota) order by h.fecha desc)
                             from historial h), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;

-- ---------- 8. Registrar y anular un movimiento ----------
-- CONTRATO. Promete: un movimiento vigente y, si sale de un cajón, su egreso de caja (creado en la misma operación con la
-- regla de caja de siempre, o uno ya registrado); si es un abono con comisión, su gasto 639 «de la empresa». Todo o nada.
-- Idempotente por `p_token`. Asume: el líder hace cualquiera; con el módulo, solo depósitos desde el cajón o la caja
-- fuerte de SU sede.
create or replace function retail.registrar_movimiento_dinero(
  p_tipo text,
  p_monto numeric,
  p_cuenta_origen_id uuid default null,
  p_cuenta_destino_id uuid default null,
  p_fecha date default null,
  p_referencia text default null,
  p_comision numeric default 0,
  p_caja_id uuid default null,
  p_caja_movimiento_id uuid default null,
  p_token uuid default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_id uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_fecha date := coalesce(p_fecha, retail.fn_hoy_lima());
  v_monto numeric := round(p_monto, 2);
  v_comision numeric := round(coalesce(p_comision, 0), 2);
  v_ref text := nullif(trim(coalesce(p_referencia, '')), '');
  v_lider boolean := retail.fn_es_lider();
  v_ubics uuid[] := retail.fn_cuentas_dinero_ubicaciones();
  v_o retail.cuentas_dinero%rowtype;
  v_d retail.cuentas_dinero%rowtype;
  v_actor uuid;
  v_egreso uuid := p_caja_movimiento_id;
  v_ubic_caja uuid;
  v_marca retail.egresos_no_gasto%rowtype;
  v_deuda numeric;
  v_gasto uuid;
begin
  -- Doble clic / reintento: el segundo intento espera al primero y devuelve SU movimiento (ADR-0190).
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('movimientos_dinero:' || p_token::text, 0));
    select id into v_id from retail.movimientos_dinero where token_cliente = p_token;
    if found then return v_id; end if;
  end if;

  if p_tipo is null or p_tipo not in ('aporte', 'prestamo', 'retiro', 'devolucion_prestamo', 'deposito', 'abono_tarjeta', 'pago_tarjeta', 'entre_cuentas') then
    raise exception 'Di qué pasó con la plata.' using errcode = 'P0001';
  end if;
  if p_cuenta_origen_id is not null then
    select * into v_o from retail.cuentas_dinero where id = p_cuenta_origen_id;
    if not found then raise exception 'La cuenta de origen no existe.' using errcode = 'P0001'; end if;
  end if;
  if p_cuenta_destino_id is not null then
    select * into v_d from retail.cuentas_dinero where id = p_cuenta_destino_id;
    if not found then raise exception 'La cuenta de destino no existe.' using errcode = 'P0001'; end if;
  end if;

  -- Permiso: el líder, todo. Con el módulo: solo depósitos desde el cajón o la caja fuerte de su sede.
  if not v_lider then
    if coalesce(cardinality(v_ubics), 0) = 0 then
      raise exception 'Registrar movimientos de dinero necesita el módulo Cuentas y dinero en tu rol.' using errcode = '42501';
    end if;
    if p_tipo <> 'deposito' then
      raise exception 'Tu rol solo registra depósitos de tu cajón o tu caja fuerte al banco; lo demás es del líder.' using errcode = '42501';
    end if;
    if v_o.ubicacion_id is null or not (v_o.ubicacion_id = any (v_ubics)) then
      raise exception 'Solo depositas lo de tu tienda.' using errcode = '42501';
    end if;
  end if;

  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;
  if v_comision < 0 or (v_comision > 0 and p_tipo <> 'abono_tarjeta') then
    raise exception 'Solo el abono de tarjeta lleva comisión, y no es negativa.' using errcode = 'P0001';
  end if;
  if v_fecha > v_hoy then
    raise exception 'La fecha no puede ser futura.' using errcode = 'P0001';
  end if;

  v_actor := retail.fn_actor_persona_id(true);

  -- Del cajón: su egreso de caja, nuevo (de la caja abierta) o uno que la tienda ya registró.
  if v_o.tipo = 'cajon' then
    if (p_caja_id is null) = (p_caja_movimiento_id is null) then
      raise exception 'Del cajón, la plata sale de la caja abierta o de un egreso ya registrado (uno de los dos).' using errcode = 'P0001';
    end if;
    if p_caja_id is not null then
      select ubicacion_id into v_ubic_caja from retail.cajas where id = p_caja_id;
      if v_ubic_caja is distinct from v_o.ubicacion_id then
        raise exception 'Esa caja no es la de %.', v_o.nombre using errcode = 'P0001';
      end if;
      -- La MISMA función de caja de siempre (caja abierta, permiso, firma): las reglas de caja viven en un solo lugar.
      v_egreso := retail.registrar_movimiento_caja(
        p_caja_id, 'egreso', v_monto,
        case when p_tipo = 'deposito' then 'Depósito bancario' else 'Retiro de efectivo' end,
        left(case when p_tipo = 'deposito' then 'Depósito a ' || v_d.nombre else retail.fn_texto_movimiento_dinero(p_tipo) end
             || coalesce(' — ' || v_ref, ''), 200),
        false, null::uuid);
      v_fecha := v_hoy;
    else
      select k.ubicacion_id, (m.created_at at time zone 'America/Lima')::date into v_ubic_caja, v_fecha
        from retail.caja_movimientos m join retail.cajas k on k.id = m.caja_id where m.id = p_caja_movimiento_id;
      if v_ubic_caja is distinct from v_o.ubicacion_id then
        raise exception 'Ese egreso es de la caja de otra tienda.' using errcode = 'P0001';
      end if;
      -- Si la tienda ya lo había marcado «no es gasto» como depósito (o retiro), ahora dice a qué cuenta fue: la marca se
      -- revierte en la misma operación y el movimiento toma su lugar.
      perform pg_advisory_xact_lock(hashtextextended('egreso:' || p_caja_movimiento_id::text, 0));
      select * into v_marca from retail.egresos_no_gasto e where e.caja_movimiento_id = p_caja_movimiento_id and e.revertido_en is null;
      if found then
        if (p_tipo = 'deposito' and v_marca.tipo = 'deposito') or (p_tipo in ('retiro', 'devolucion_prestamo') and v_marca.tipo = 'retiro') then
          update retail.egresos_no_gasto set revertido_en = now(), revertido_por = v_actor where id = v_marca.id;
        else
          raise exception 'Ese egreso está marcado «no es gasto» como otra cosa: revierte la marca primero.' using errcode = 'P0001';
        end if;
      end if;
    end if;
  elsif p_caja_id is not null or p_caja_movimiento_id is not null then
    raise exception 'Solo lo que sale de un cajón se une a la caja.' using errcode = 'P0001';
  end if;

  -- Una devolución no puede ser mayor que lo que CAYLA le debe al dueño.
  if p_tipo = 'devolucion_prestamo' then
    perform pg_advisory_xact_lock(hashtextextended('dinero:prestamos_dueno', 0));
    select coalesce(sum(case d.tipo when 'prestamo' then d.monto else -d.monto end), 0) into v_deuda
      from retail.movimientos_dinero d where d.estado = 'vigente' and d.tipo in ('prestamo', 'devolucion_prestamo');
    if v_monto > v_deuda then
      raise exception 'CAYLA te debe S/ %: una devolución no puede ser mayor. Si es plata que te llevas, es un retiro de utilidades.',
        to_char(v_deuda, 'FM999G999G990D00') using errcode = 'P0001';
    end if;
  end if;

  -- La comisión del POS es un gasto de la empresa (gastos bancarios, 639): ya la descontó el abono, no sale de otra cuenta.
  if v_comision > 0 then
    insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, igv, compra_id, medio_pago, caja_movimiento_id, registrado_por)
    values (null, 'gastos_bancarios', left('Comisión del POS · ' || v_o.nombre || coalesce(' · ' || v_ref, ''), 200), v_fecha, v_comision, 0,
            null, 'transferencia', null, v_actor)
    returning id into v_gasto;
  end if;

  insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, cuenta_destino_id, monto, comision, gasto_comision_id,
                                         caja_movimiento_id, referencia, registrado_por, token_cliente)
  values (p_tipo, v_fecha, p_cuenta_origen_id, p_cuenta_destino_id, v_monto, v_comision, v_gasto,
          v_egreso, v_ref, v_actor, p_token)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  if p_token is not null and exists (select 1 from retail.movimientos_dinero where token_cliente = p_token) then
    return (select id from retail.movimientos_dinero where token_cliente = p_token);
  end if;
  if p_caja_movimiento_id is not null then
    raise exception 'Ese egreso de caja ya es un depósito o un retiro.' using errcode = '23505';
  end if;
  raise;
end $$;

-- No toca la caja: si salió del cajón, la plata SÍ salió; el egreso vuelve a «por clasificar». La comisión se anula con él.
create or replace function retail.anular_movimiento_dinero(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_m retail.movimientos_dinero%rowtype; v_actor uuid; v_ubics uuid[] := retail.fn_cuentas_dinero_ubicaciones(); v_deuda numeric;
begin
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Di por qué se anula.' using errcode = 'P0001';
  end if;
  select * into v_m from retail.movimientos_dinero where id = p_id for update;
  if not found then
    raise exception 'Ese movimiento no existe.' using errcode = 'P0001';
  end if;
  if not retail.fn_es_lider() and not (v_m.tipo = 'deposito' and v_m.ubicacion_id = any (v_ubics)) then
    raise exception 'Solo el líder anula ese movimiento.' using errcode = '42501';
  end if;
  if v_m.estado = 'anulado' then
    raise exception 'Ese movimiento ya estaba anulado.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  update retail.movimientos_dinero set estado = 'anulado', motivo_anulacion = trim(p_motivo), anulado_por = v_actor, anulado_en = now()
   where id = p_id;
  -- Anular un préstamo no puede dejar devoluciones por más de lo prestado.
  if v_m.tipo = 'prestamo' then
    perform pg_advisory_xact_lock(hashtextextended('dinero:prestamos_dueno', 0));
    select coalesce(sum(case d.tipo when 'prestamo' then d.monto else -d.monto end), 0) into v_deuda
      from retail.movimientos_dinero d where d.estado = 'vigente' and d.tipo in ('prestamo', 'devolucion_prestamo');
    if v_deuda < 0 then
      raise exception 'Ese préstamo ya tiene devoluciones: anula primero las devoluciones.' using errcode = 'P0001';
    end if;
  end if;
  if v_m.gasto_comision_id is not null then
    update retail.gastos set estado = 'anulado', motivo_anulacion = 'Se anuló su abono de tarjeta: ' || trim(p_motivo),
                             anulado_por = v_actor, anulado_en = now()
     where id = v_m.gasto_comision_id and estado = 'vigente';
  end if;
end $$;

-- ---------- 9. Conciliar (solo el líder) ----------
create or replace function retail.registrar_conciliacion(p_cuenta_id uuid, p_fecha date, p_saldo_banco numeric, p_nota text default null)
returns uuid language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_c retail.cuentas_dinero%rowtype; v_id uuid;
begin
  perform retail.fn_exigir_lider_dinero('Conciliar');
  select * into v_c from retail.cuentas_dinero where id = p_cuenta_id;
  if not found or v_c.tipo not in ('banco', 'por_abonar', 'tarjeta_credito') then
    raise exception 'Solo se concilian bancos, el POS y la tarjeta de crédito.' using errcode = 'P0001';
  end if;
  if p_fecha is null or p_fecha > retail.fn_hoy_lima() then
    raise exception 'La fecha no puede ser futura.' using errcode = 'P0001';
  end if;
  if v_c.saldo_desde is not null and p_fecha < v_c.saldo_desde then
    raise exception 'La cuenta empieza el %: no se concilia antes.', to_char(v_c.saldo_desde, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  if p_saldo_banco is null then
    raise exception 'Escribe el saldo que dice el banco.' using errcode = 'P0001';
  end if;
  begin
    insert into retail.conciliaciones (cuenta_id, fecha, saldo_banco, nota, registrado_por)
    values (p_cuenta_id, p_fecha, round(p_saldo_banco, 2), nullif(trim(coalesce(p_nota, '')), ''), retail.fn_actor_persona_id(true))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ya anotaste lo que dice el banco ese día: anúlalo para corregirlo.' using errcode = '23505';
  end;
  return v_id;
end $$;

create or replace function retail.anular_conciliacion(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
begin
  perform retail.fn_exigir_lider_dinero('Conciliar');
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Di por qué se anula.' using errcode = 'P0001';
  end if;
  update retail.conciliaciones set estado = 'anulada', motivo_anulacion = trim(p_motivo), anulada_por = retail.fn_actor_persona_id(true), anulada_en = now()
   where id = p_id and estado = 'vigente';
  if not found then
    raise exception 'Esa conciliación no existe o ya se anuló.' using errcode = 'P0001';
  end if;
end $$;

-- Marcar (o desmarcar) líneas revisadas contra el banco. `p_lineas`: [{"clave": "...", "monto": 123.45}, ...].
create or replace function retail.marcar_revisados_dinero(p_cuenta_id uuid, p_lineas jsonb, p_revisado boolean default true)
returns integer language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_actor uuid; v_l jsonb; v_clave text; v_monto numeric; v_n integer := 0; v_r retail.dinero_revisados%rowtype;
begin
  perform retail.fn_exigir_lider_dinero('Conciliar');
  if not exists (select 1 from retail.cuentas_dinero where id = p_cuenta_id and tipo in ('banco', 'por_abonar', 'tarjeta_credito')) then
    raise exception 'Solo se concilian bancos, el POS y la tarjeta de crédito.' using errcode = 'P0001';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'Faltan las líneas.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  for v_l in select * from jsonb_array_elements(p_lineas) loop
    v_clave := v_l->>'clave';
    v_monto := round((v_l->>'monto')::numeric, 2);
    if v_clave is null or trim(v_clave) = '' or v_monto is null then
      raise exception 'Cada línea necesita su clave y su monto.' using errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('revisado:' || p_cuenta_id::text || ':' || v_clave, 0));
    select * into v_r from retail.dinero_revisados where cuenta_id = p_cuenta_id and clave = v_clave and desmarcado_en is null;
    if p_revisado then
      if found and v_r.monto = v_monto then
        continue;
      end if;
      if found then
        update retail.dinero_revisados set desmarcado_en = now(), desmarcado_por = v_actor where id = v_r.id;
      end if;
      insert into retail.dinero_revisados (cuenta_id, clave, monto, revisado_por) values (p_cuenta_id, v_clave, v_monto, v_actor);
      v_n := v_n + 1;
    elsif found then
      update retail.dinero_revisados set desmarcado_en = now(), desmarcado_por = v_actor where id = v_r.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- ---------- 10. Configuración ▸ Cuentas y cobros (solo el líder) ----------
create or replace function retail.crear_cuenta_dinero(p_nombre text, p_tipo text, p_saldo_inicial numeric default 0,
                                                      p_saldo_desde date default null, p_numero text default null)
returns uuid language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_id uuid; v_nombre text := trim(coalesce(p_nombre, '')); v_actor uuid;
begin
  perform retail.fn_exigir_lider_dinero('Agregar cuentas');
  if v_nombre = '' then
    raise exception 'La cuenta necesita un nombre.' using errcode = 'P0001';
  end if;
  if p_tipo is null or p_tipo not in ('banco', 'por_abonar', 'tarjeta_credito') then
    raise exception 'Se agregan bancos o billeteras, POS por abonar y tarjetas de crédito. Los cajones y cajas fuertes nacen con cada tienda.' using errcode = 'P0001';
  end if;
  if p_saldo_desde is not null and p_saldo_desde > retail.fn_hoy_lima() then
    raise exception 'La fecha del saldo inicial no puede ser futura.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  begin
    insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, numero, saldo_inicial, saldo_desde, orden, creada_por)
    values (v_nombre, p_tipo, case p_tipo when 'banco' then '104' when 'por_abonar' then '105' else '451' end,
            nullif(trim(coalesce(p_numero, '')), ''), round(coalesce(p_saldo_inicial, 0), 2),
            coalesce(p_saldo_desde, retail.fn_hoy_lima()),
            case p_tipo when 'banco' then 10 when 'por_abonar' then 20 else 60 end, v_actor)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ya hay una cuenta con ese nombre.' using errcode = '23505';
  end;
  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('cuenta_dinero_creada', jsonb_build_object('cuenta_id', v_id, 'nombre', v_nombre, 'tipo', p_tipo, 'saldo_inicial', coalesce(p_saldo_inicial, 0)), v_actor);
  return v_id;
end $$;

create or replace function retail.archivar_cuenta_dinero(p_id uuid, p_archivar boolean default true) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_c retail.cuentas_dinero%rowtype; v_actor uuid; v_hoy date := retail.fn_hoy_lima();
begin
  perform retail.fn_exigir_lider_dinero('Archivar cuentas');
  select * into v_c from retail.cuentas_dinero where id = p_id for update;
  if not found then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0001';
  end if;
  if p_archivar and exists (
       select 1 from retail.ubicaciones u cross join (values ('yape'), ('plin'), ('tarjeta'), ('transferencia')) m (medio)
        where retail.fn_cuenta_de_cobro(u.id, m.medio, v_hoy) = p_id) then
    raise exception 'Hoy entran cobros a esa cuenta: cámbialos a otra en «A qué cuenta entra cada cobro» antes de archivarla.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if p_archivar then
    update retail.cuentas_dinero set archivada_en = now(), archivada_por = v_actor where id = p_id and archivada_en is null;
  else
    begin
      update retail.cuentas_dinero set archivada_en = null, archivada_por = null where id = p_id and archivada_en is not null;
    exception when unique_violation then
      raise exception 'Ya hay otra cuenta activa con ese nombre.' using errcode = '23505';
    end;
  end if;
  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values (case when p_archivar then 'cuenta_dinero_archivada' else 'cuenta_dinero_reactivada' end,
          jsonb_build_object('cuenta_id', p_id, 'nombre', v_c.nombre), v_actor);
end $$;

-- «Desde hoy, el Yape de TRU entra a Interbank». La primera vez que se configura un medio en una tienda vale para todo
-- lo anterior (no había otra); después, cada cambio rige desde hoy y lo pasado no se mueve.
create or replace function retail.guardar_medio_de_cobro(p_ubicacion_id uuid, p_medio text, p_cuenta_id uuid) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_hoy date := retail.fn_hoy_lima(); v_actual uuid; v_hay boolean; v_actor uuid;
begin
  perform retail.fn_exigir_lider_dinero('Decir a qué cuenta entra cada cobro');
  if not exists (select 1 from retail.ubicaciones where id = p_ubicacion_id and activo and tipo = 'tienda') then
    raise exception 'Esa tienda no existe o no está activa.' using errcode = 'P0001';
  end if;
  if p_medio is null or p_medio not in ('yape', 'plin', 'tarjeta', 'transferencia') then
    raise exception 'El medio tiene que ser Yape, Plin, tarjeta o transferencia (el efectivo siempre cae al cajón).' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('medio_de_cobro:' || p_ubicacion_id::text || ':' || p_medio, 0));
  v_hay := exists (select 1 from retail.medios_de_cobro where ubicacion_id = p_ubicacion_id and medio = p_medio);
  v_actual := retail.fn_cuenta_de_cobro(p_ubicacion_id, p_medio, v_hoy);
  if v_hay and v_actual is not distinct from p_cuenta_id then
    return;
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  insert into retail.medios_de_cobro (ubicacion_id, medio, cuenta_id, vigente_desde, registrado_por)
  values (p_ubicacion_id, p_medio, p_cuenta_id, case when v_hay then v_hoy else '1900-01-01'::date end, v_actor);
  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('medio_de_cobro', jsonb_build_object('ubicacion_id', p_ubicacion_id, 'medio', p_medio, 'cuenta_id', p_cuenta_id, 'antes', v_actual), v_actor);
end $$;

-- ---------- 11. Permisos: nada se lee ni se escribe por fuera de las funciones ----------
alter table retail.cuentas_dinero enable row level security;
alter table retail.medios_de_cobro enable row level security;
alter table retail.movimientos_dinero enable row level security;
alter table retail.conciliaciones enable row level security;
alter table retail.dinero_revisados enable row level security;
revoke all on retail.cuentas_dinero, retail.medios_de_cobro, retail.movimientos_dinero, retail.conciliaciones, retail.dinero_revisados
  from public, anon, authenticated;

-- Internas: sin permiso para nadie (las llaman las funciones de arriba).
revoke all on function retail.fn_dinero_libro(date) from public, anon, authenticated;
revoke all on function retail.fn_cuenta_de_cobro(uuid, text, date) from public, anon, authenticated;
revoke all on function retail.fn_cuentas_dinero_inmutable() from public, anon, authenticated;
revoke all on function retail.fn_medios_de_cobro_validar() from public, anon, authenticated;
revoke all on function retail.fn_movimientos_dinero_validar() from public, anon, authenticated;
revoke all on function retail.fn_conciliaciones_solo_anular() from public, anon, authenticated;
revoke all on function retail.fn_dinero_revisados_solo_desmarcar() from public, anon, authenticated;
revoke all on function retail.fn_exigir_lider_dinero(text) from public, anon, authenticated;

-- Las de la pantalla (cada una pide su permiso adentro).
do $$
declare f text;
begin
  foreach f in array array[
    'retail.fn_texto_movimiento_dinero(text)',
    'retail.fn_cuentas_dinero_ubicaciones()',
    'retail.fn_cuentas_dinero_saldos(date, uuid)',
    'retail.fn_dinero_sin_cuenta(date, date)',
    'retail.fn_cuentas_dinero_destinos()',
    'retail.fn_movimientos_dinero(uuid, integer)',
    'retail.fn_plata_del_dueno()',
    'retail.fn_medios_de_cobro()',
    'retail.fn_egresos_para_movimiento(uuid)',
    'retail.fn_efectivo_por_tienda(uuid)',
    'retail.fn_cierres_con_diferencia(uuid, integer)',
    'retail.fn_conciliacion_cuentas()',
    'retail.fn_conciliacion(uuid, date)',
    'retail.registrar_movimiento_dinero(text, numeric, uuid, uuid, date, text, numeric, uuid, uuid, uuid)',
    'retail.anular_movimiento_dinero(uuid, text)',
    'retail.registrar_conciliacion(uuid, date, numeric, text)',
    'retail.anular_conciliacion(uuid, text)',
    'retail.marcar_revisados_dinero(uuid, jsonb, boolean)',
    'retail.crear_cuenta_dinero(text, text, numeric, date, text)',
    'retail.archivar_cuenta_dinero(uuid, boolean)',
    'retail.guardar_medio_de_cobro(uuid, text, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

reset lock_timeout;

-- ============================== PARTE 2 · ubicaciones (sola) ==============================
-- Una tienda o un taller nuevo nace con su cajón y su caja fuerte. Crear el disparador toma `ubicaciones` un instante
-- (nadie la escribe en el día a día; leerla sigue libre).
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_cuentas_de_sede_nueva() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
begin
  if new.tipo in ('tienda', 'taller') and new.activo then
    insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, ubicacion_id, orden)
    select case when new.tipo = 'taller' then 'Fondo fijo · ' else 'Cajón · ' end || new.nombre, 'cajon', '101', new.id, 30
     where not exists (select 1 from retail.cuentas_dinero c where c.ubicacion_id = new.id and c.tipo = 'cajon')
    on conflict do nothing;
    insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, ubicacion_id, orden)
    select 'Caja fuerte · ' || new.nombre, 'caja_fuerte', '101', new.id, 40
     where not exists (select 1 from retail.cuentas_dinero c where c.ubicacion_id = new.id and c.tipo = 'caja_fuerte')
    on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function retail.fn_cuentas_de_sede_nueva() from public, anon, authenticated;

drop trigger if exists ubicaciones_cuentas_de_dinero on retail.ubicaciones;
create trigger ubicaciones_cuentas_de_dinero after insert or update of tipo, activo on retail.ubicaciones
  for each row execute function retail.fn_cuentas_de_sede_nueva();

reset lock_timeout;

-- ============================== PARTE 3 · un egreso respalda una sola cosa ==============================
-- Parches por texto sobre la definición VIVA (como `pg_temp.solo_mercaderia` de 20260924235100): cada ancla tiene que
-- aparecer exactamente una vez, o la migración se detiene y avisa. Si la marca ya está, no se toca (se puede repetir).
-- Solo reemplaza funciones: no toma ninguna tabla.
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.parchar(p_firma text, p_patron text, p_nuevo text, p_marca text)
returns void language plpgsql as $$
declare v_def text; v_hay integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  select count(*) into v_hay from regexp_matches(v_def, p_patron, 'g');
  if v_hay <> 1 then
    raise exception '%: se esperaba 1 aparición de «%» y hay %. La función cambió en la base: revisar antes de pegar.', p_firma, p_patron, v_hay;
  end if;
  execute regexp_replace(v_def, p_patron, p_nuevo);
end $$;

do $$
begin
  -- ¿Ya lo usa algo? Ahora también un movimiento de dinero vigente (un depósito o un retiro que sale del cajón).
  perform pg_temp.parchar('retail.fn_egreso_ya_usado(uuid, text)',
    '(e\.revertido_en is null\) then ''no_gasto'')',
    E'\\1\n    when p_salvo is distinct from ''movimiento'' and exists (select 1 from retail.movimientos_dinero d where d.caja_movimiento_id = p_caja_movimiento_id and d.estado = ''vigente'') then ''movimiento''',
    'retail.movimientos_dinero');
  -- Un gasto no toma un egreso que ya es un depósito.
  perform pg_temp.parchar('retail.fn_gastos_validar()',
    '(v_usado := retail\.fn_egreso_ya_usado\(new\.caja_movimiento_id, ''gasto''\);)',
    E'\\1\n    if v_usado = ''movimiento'' then\n      raise exception ''Ese egreso ya es un depósito o un retiro (Cuentas y dinero): anúlalo primero.'' using errcode = ''P0001'';\n    end if;',
    '''movimiento''');
  -- Ni una marca «no es gasto».
  perform pg_temp.parchar('retail.fn_egresos_no_gasto_validar()',
    '(v_usado := retail\.fn_egreso_ya_usado\(new\.caja_movimiento_id, ''no_gasto''\);)',
    E'\\1\n  if v_usado = ''movimiento'' then\n    raise exception ''Ese egreso ya es un depósito o un retiro (Cuentas y dinero): anúlalo primero.'' using errcode = ''P0001'';\n  end if;',
    '''movimiento''');
  -- Ni un activo (el activo ya se niega a cualquier uso; aquí solo se corrige el texto del aviso).
  perform pg_temp.parchar('retail.fn_activos_validar()',
    'case v_usado when ''gasto'' then ''es un gasto'' else',
    'case v_usado when ''gasto'' then ''es un gasto'' when ''movimiento'' then ''es un depósito o un retiro'' else',
    '''movimiento''');
  -- La comisión de un abono de tarjeta se anula con su abono, no sola desde Gastos.
  perform pg_temp.parchar('retail.anular_gasto(uuid, text)',
    '(raise exception ''Ese gasto ya estaba anulado\.'' using errcode = ''P0001'';\s+end if;)',
    E'\\1\n  if exists (select 1 from retail.movimientos_dinero d where d.gasto_comision_id = p_gasto_id and d.estado = ''vigente'') then\n    raise exception ''Es la comisión de un abono de tarjeta: se anula anulando el abono, en Cuentas y dinero.'' using errcode = ''P0001'';\n  end if;',
    'retail.movimientos_dinero');
end $$;

reset lock_timeout;
