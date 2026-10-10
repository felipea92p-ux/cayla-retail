-- Caja ▸ Registrar ingreso, segunda parte (Felipe 2026-10-10, ADR-0371 «Actualización»): cada entrada dice de qué CUENTA sale.
--
-- EL PROBLEMA. `20261010160000` le dio nombre a las entradas del cajón, pero el dinero seguía apareciendo sin origen. La caja
-- fuerte es una cuenta de Finanzas ▸ Cuentas y dinero con su propio saldo: sube con cada cierre que guarda ahí y solo baja con
-- un depósito o un retiro. No había forma de devolver plata de la caja fuerte al cajón: un movimiento de dinero no podía tener
-- un cajón como destino. Si se sacaban S/ 100 de la caja fuerte para sencillo, el cajón subía S/ 100, la caja fuerte no bajaba,
-- y los S/ 100 se contaban dos veces. El flujo, además, los leía como «otros ingresos», como si CAYLA hubiera ganado plata.
-- Pasaba lo mismo con lo que trae el líder (el efectivo por rendir de un cierre «entregado al líder») y con el préstamo de otra
-- sede: a la sede que prestaba le faltaba esa plata al cerrar.
--
-- LA DECISIÓN (Felipe, 2026-10-10):
--   · Caja fuerte → cajón: baja sola la caja fuerte de esa sede (movimiento «entre cuentas»).
--   · Lo trae el líder: la hoja pregunta. «Se la llevó en un cierre» → baja el efectivo por rendir (entre cuentas); «es plata
--     del dueño» → aporte del dueño.
--   · Préstamo de otra sede: las dos puntas en un paso. Sale del cajón de la otra sede (con su caja abierta) y entra a este.
--     Quien ve Caja lo puede hacer, aunque la otra caja no sea suya: lo decidió Felipe.
--   · «Compra de insumos» deja de ser una salida de «Retiro o depósito»: es un gasto y va por el gasto rápido. Lo ya
--     registrado no se toca.
--
-- EL MODELO. Lo que SALE de un cajón ya se respaldaba con su egreso de caja (`movimientos_dinero.caja_movimiento_id`). Ahora,
-- en espejo, lo que ENTRA a un cajón se respalda con su ingreso de caja (`caja_ingreso_id`, columna nueva). Así el diario, el
-- flujo y el balance lo leen como cualquier otro movimiento de dinero: 101 contra 101 entre cuentas, 101 contra 52 si es aporte.
-- Tres motivos de entrada pasan a ser «de sistema»: solo los acepta `registrar_movimiento_caja` cuando llama
-- `registrar_ingreso_caja`, que crea las dos puntas juntas. Así no puede quedar un ingreso de la caja fuerte sin su contraparte.
--
-- CÓMO. Columna nueva y función nueva. Las funciones vivas se parchan por ancla, con una marca que las hace idempotentes; si un
-- ancla no aparece exactamente una vez, se detiene sin tocar nada. Sin políticas: se pega en una sola parte (ADR-0195).
-- Depende de `20261010160000` (sus motivos), que va antes.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. La columna: el ingreso de caja que respalda lo que entra a un cajón ---------------------------------------------------
alter table retail.movimientos_dinero add column if not exists caja_ingreso_id uuid references retail.caja_movimientos (id);
create unique index if not exists movimientos_dinero_caja_ingreso_uno
  on retail.movimientos_dinero (caja_ingreso_id) where caja_ingreso_id is not null and estado = 'vigente';
comment on column retail.movimientos_dinero.caja_ingreso_id is
  'El ingreso de caja que respalda lo que ENTRA a un cajón (espejo de caja_movimiento_id, que respalda lo que sale). No nulo ⇔ el destino es un cajón. Lo crea registrar_ingreso_caja (ADR-0371).';

-- 2. El parche por ancla -----------------------------------------------------------------------------------------------------
-- Cambia `p_viejo` por `p_nuevo` en la única función `retail.<p_nombre>`. Si la función ya trae `p_marca`, se salta (ya se
-- aplicó). Si no, exige que `p_viejo` aparezca exactamente una vez.
create function pg_temp.parchar(p_nombre text, p_viejo text, p_nuevo text, p_marca text)
returns void
language plpgsql
as $$
declare
  v_oids oid[];
  v_def text;
  v_veces int;
begin
  v_oids := array(select p.oid from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = p_nombre);
  if cardinality(v_oids) <> 1 then
    raise exception 'ADR-0371: se esperaba una sola función retail.% y hay %', p_nombre, cardinality(v_oids);
  end if;
  v_def := pg_get_functiondef(v_oids[1]);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_veces := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_veces <> 1 then
    raise exception 'ADR-0371: retail.% trae % veces el ancla (se esperaba 1): la base no es la que se revisó, no se toca nada. Ancla: %',
      p_nombre, v_veces, p_viejo;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$$;

-- 3. El vocabulario de la caja --------------------------------------------------------------------------------------------
-- Salidas: sin «Compra de insumos»; «Préstamo a otra sede» solo de sistema. Entradas: caja fuerte, líder y otra sede solo de
-- sistema (llegan con su contraparte por `registrar_ingreso_caja`); «Devolución de un retiro» sigue tipeable.
select pg_temp.parchar('registrar_movimiento_caja',
  $a$'Ajuste de caja (faltante)', 'Compra de insumos', 'Otro')$a$,
  $a$'Ajuste de caja (faltante)', 'Otro')$a$,
  $a$'Ajuste de caja (faltante)', 'Otro')$a$);
-- `coalesce`: sin él, en una sesión donde la marca nunca se puso `current_setting(…, true)` es NULL, `not (… and NULL)` es NULL
-- y el `if` no rechaza: un motivo de sistema se podía tipear suelto (pasaba también con «Pago a proveedor» y «Reembolso de
-- proveedor» desde 20260925150000; lo encontró scripts/pruebas/caja_ingresos_con_origen.mjs).
select pg_temp.parchar('registrar_movimiento_caja',
  $a$p_motivo = 'Pago a proveedor' and current_setting('retail.movimiento_de_sistema', true) = 'si')$a$,
  $a$p_motivo in ('Pago a proveedor', 'Préstamo a otra sede') and coalesce(current_setting('retail.movimiento_de_sistema', true), '') = 'si')$a$,
  $a$'Préstamo a otra sede'$a$);
select pg_temp.parchar('registrar_movimiento_caja',
  $a$'Sencillo de la caja fuerte', 'Entrega del líder', 'Préstamo de otra sede', 'Devolución de un retiro')$a$,
  $a$'Devolución de un retiro')$a$,
  $a$p_motivo in ('Reembolso de proveedor',$a$);
select pg_temp.parchar('registrar_movimiento_caja',
  $a$p_motivo = 'Reembolso de proveedor' and current_setting('retail.movimiento_de_sistema', true) = 'si')$a$,
  $a$p_motivo in ('Reembolso de proveedor', 'Sencillo de la caja fuerte', 'Entrega del líder', 'Préstamo de otra sede')
         and coalesce(current_setting('retail.movimiento_de_sistema', true), '') = 'si')$a$,
  $a$p_motivo in ('Reembolso de proveedor',$a$);

-- 4. Qué va en cada punta (el disparador de movimientos_dinero) -------------------------------------------------------------
-- Lo mismo de antes, más el espejo: un cajón puede ser DESTINO de un aporte, un préstamo del dueño o un movimiento entre
-- cuentas desde otro cajón, la caja fuerte o el efectivo por rendir, siempre con su ingreso de caja (uno, del mismo monto, de
-- esa tienda y que no respalde otra cosa). Y `caja_ingreso_id` tampoco se edita.
create or replace function retail.fn_movimientos_dinero_validar()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $function$
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
           new.caja_movimiento_id, new.caja_ingreso_id, new.ubicacion_id, new.referencia, new.registrado_por, new.token_cliente, new.created_at)
          is distinct from
          (old.id, old.tipo, old.fecha, old.cuenta_origen_id, old.cuenta_destino_id, old.monto, old.comision, old.gasto_comision_id,
           old.caja_movimiento_id, old.caja_ingreso_id, old.ubicacion_id, old.referencia, old.registrado_por, old.token_cliente, old.created_at) then
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
  if (new.tipo in ('aporte', 'prestamo') and v_d.tipo not in ('banco', 'caja_fuerte', 'por_rendir', 'cajon'))
     or (new.tipo in ('retiro', 'devolucion_prestamo') and v_o.tipo not in ('banco', 'cajon', 'caja_fuerte', 'por_rendir'))
     or (new.tipo = 'deposito' and (v_o.tipo not in ('cajon', 'caja_fuerte', 'por_rendir') or v_d.tipo <> 'banco'))
     or (new.tipo = 'abono_tarjeta' and (v_o.tipo <> 'por_abonar' or v_d.tipo <> 'banco'))
     or (new.tipo = 'pago_tarjeta' and (v_o.tipo <> 'banco' or v_d.tipo <> 'tarjeta_credito'))
     or (new.tipo = 'entre_cuentas' and not ((v_o.tipo = 'banco' and v_d.tipo = 'banco')
                                             or (v_d.tipo = 'cajon' and v_o.tipo in ('cajon', 'caja_fuerte', 'por_rendir')))) then
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
        when 'movimiento' then 'ya es un depósito o retiro' when 'pago' then 'es el pago a un proveedor' else 'está marcado «no es gasto»' end using errcode = 'P0001';
    end if;
  elsif new.caja_movimiento_id is not null then
    raise exception 'Solo lo que sale de un cajón se une a un egreso de caja.' using errcode = 'P0001';
  end if;

  -- El espejo (ADR-0371): lo que entra a un cajón es un ingreso de caja, uno, del mismo monto, de esa tienda, y sin otro dueño.
  if v_d.tipo = 'cajon' then
    if new.caja_ingreso_id is null then
      raise exception 'Lo que entra al cajón necesita su ingreso de caja.' using errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('ingreso:' || new.caja_ingreso_id::text, 0));
    select * into v_mov from retail.caja_movimientos where id = new.caja_ingreso_id;
    if not found or v_mov.tipo <> 'ingreso' then
      raise exception 'Lo que entra al cajón solo se respalda con un ingreso de caja.' using errcode = 'P0001';
    end if;
    select c.ubicacion_id into v_ubic from retail.cajas c where c.id = v_mov.caja_id;
    if v_ubic is distinct from v_d.ubicacion_id then
      raise exception 'Ese ingreso es de la caja de otra tienda.' using errcode = 'P0001';
    end if;
    if v_mov.monto <> new.monto then
      raise exception 'El monto (S/ %) no coincide con el ingreso de caja (S/ %).', new.monto, v_mov.monto using errcode = 'P0001';
    end if;
    if exists (select 1 from retail.movimientos_dinero d where d.caja_ingreso_id = new.caja_ingreso_id and d.estado = 'vigente') then
      raise exception 'Ese ingreso de caja ya tiene de dónde vino.' using errcode = 'P0001';
    end if;
  elsif new.caja_ingreso_id is not null then
    raise exception 'Solo lo que entra a un cajón se une a un ingreso de caja.' using errcode = 'P0001';
  end if;

  new.ubicacion_id := coalesce(v_o.ubicacion_id, v_d.ubicacion_id);
  return new;
end $function$;

-- 5. El libro de cuentas: el cajón no lleva su saldo en el libro (sale de sus cajas), igual que ya no llevaba lo que sale de él.
select pg_temp.parchar('fn_dinero_libro',
  $a$where d.estado = 'vigente' and d.cuenta_destino_id is not null and d.fecha <= p_hasta$a$,
  $a$where d.estado = 'vigente' and d.cuenta_destino_id is not null and d.caja_ingreso_id is null and d.fecha <= p_hasta$a$,
  $a$d.caja_ingreso_id is null$a$);

-- 6. El flujo: un ingreso de caja con su movimiento es plata del dueño (aporte o préstamo) o plata que cambió de lugar.
select pg_temp.parchar('fn_flujo_lineas',
  $a$then 'efectivo' else coalesce(vi.categoria, 'otros_ingresos') end$a$,
  $a$then 'efectivo' else coalesce(vi.categoria,
                    (select case when di.tipo in ('aporte', 'prestamo') then 'dueno_pone' else 'entre_cuentas' end
                       from retail.movimientos_dinero di where di.caja_ingreso_id = m.id and di.estado = 'vigente' limit 1),
                    'otros_ingresos') end$a$,
  $a$di.caja_ingreso_id = m.id$a$);

-- 7. El balance: un ingreso con su movimiento ya está en el diario (por el movimiento), no es un «ingreso sin origen».
select pg_temp.parchar('fn_bal_causas_dinero',
  $a$and not (cm.id = any (v_reemb_ids))$a$,
  $a$and not (cm.id = any (v_reemb_ids)
                or exists (select 1 from retail.movimientos_dinero di where di.caja_ingreso_id = cm.id and di.estado = 'vigente'))$a$,
  $a$di.caja_ingreso_id = cm.id$a$);

-- 8. Anular: lo que entró a un cajón desde Caja no se anula en Finanzas, porque la plata ya se contó en la caja y el ingreso no
--    se deshace. Si quedaría a medias (el ingreso sin su origen), mejor no dejarlo.
select pg_temp.parchar('anular_movimiento_dinero',
  $a$  v_actor := retail.fn_actor_persona_id(true);$a$,
  $a$  if v_m.caja_ingreso_id is not null then
    raise exception 'Este movimiento nació en Caja, con la plata que entró al cajón, y no se anula aquí: el ingreso ya está contado en la caja. Si fue un error, se corrige con una salida del cajón.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);$a$,
  $a$v_m.caja_ingreso_id is not null$a$);

-- 9. Registrar un ingreso de caja con su origen ---------------------------------------------------------------------------
-- CONTRATO. Promete: el ingreso de caja y, según el concepto, su contraparte, todo o nada:
--   caja_fuerte          → entre cuentas desde la caja fuerte de la sede;
--   lider + 'cierre'     → entre cuentas desde el efectivo por rendir;
--   lider + 'dueno'      → aporte del dueño;
--   otra_sede            → egreso «Préstamo a otra sede» en la caja abierta de esa sede + entre cuentas de cajón a cajón;
--   vuelve_retiro, sobrante, otro → solo el ingreso (como antes).
-- Asume: la caja es la abierta de quien registra (lo exige `registrar_movimiento_caja`: caja abierta, permiso, firma, nota).
-- Idempotente por `p_token` (el del ingreso de caja).
create or replace function retail.registrar_ingreso_caja(
  p_caja_id uuid,
  p_concepto text,
  p_monto numeric,
  p_nota text default null,
  p_de_donde text default null,
  p_sede_origen_id uuid default null,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $function$
declare
  v_caja retail.cajas%rowtype;
  v_otra retail.cajas%rowtype;
  v_monto numeric := round(p_monto, 2);
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_motivo text;
  v_tipo text;
  v_origen uuid;
  v_destino uuid;
  v_ingreso uuid;
  v_egreso uuid;
  v_actor uuid;
  v_sede text;
begin
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('caja_movimientos:' || p_token::text, 0));
    if exists (select 1 from retail.caja_movimientos where token_cliente = p_token) then
      return (select id from retail.caja_movimientos where token_cliente = p_token);
    end if;
  end if;

  v_motivo := case p_concepto
    when 'caja_fuerte' then 'Sencillo de la caja fuerte'
    when 'lider' then 'Entrega del líder'
    when 'otra_sede' then 'Préstamo de otra sede'
    when 'vuelve_retiro' then 'Devolución de un retiro'
    when 'sobrante' then 'Ajuste de caja (sobrante)'
    when 'otro' then 'Otro'
  end;
  if v_motivo is null then
    raise exception 'Di de dónde viene la plata.' using errcode = 'P0001';
  end if;
  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto debe ser mayor que cero.' using errcode = 'P0001';
  end if;
  select * into v_caja from retail.cajas where id = p_caja_id;
  if not found then
    raise exception 'La caja no existe.' using errcode = 'P0001';
  end if;
  v_sede := (select u.nombre from retail.ubicaciones u where u.id = v_caja.ubicacion_id);

  -- De qué cuenta sale.
  if p_concepto = 'caja_fuerte' then
    v_tipo := 'entre_cuentas';
    v_origen := (select c.id from retail.cuentas_dinero c
                  where c.tipo = 'caja_fuerte' and c.ubicacion_id = v_caja.ubicacion_id and c.archivada_en is null limit 1);
    if v_origen is null then
      raise exception '% no tiene caja fuerte en Finanzas ▸ Cuentas y dinero. Pídele al líder que la cree, o registra la entrada como «Otro».', v_sede
        using errcode = 'P0001';
    end if;
  elsif p_concepto = 'lider' then
    if p_de_donde = 'cierre' then
      v_tipo := 'entre_cuentas';
      -- La misma cuenta adonde va un cierre «entregado al líder» (`fn_dinero_libro`).
      v_origen := (select c.id from retail.cuentas_dinero c where c.tipo = 'por_rendir' and c.archivada_en is null order by c.created_at limit 1);
      if v_origen is null then
        raise exception 'No hay una cuenta de efectivo por rendir en Finanzas ▸ Cuentas y dinero: pídele al líder que la cree.' using errcode = 'P0001';
      end if;
    elsif p_de_donde = 'dueno' then
      v_tipo := 'aporte';
    else
      raise exception 'Di si es plata que el líder se llevó en un cierre o plata del dueño.' using errcode = 'P0001';
    end if;
  elsif p_concepto = 'otra_sede' then
    if p_sede_origen_id is null or p_sede_origen_id = v_caja.ubicacion_id then
      raise exception 'Elige qué otra sede presta la plata.' using errcode = 'P0001';
    end if;
    select * into v_otra from retail.cajas k
     where k.ubicacion_id = p_sede_origen_id and k.estado = 'abierta'
     order by k.abierta_en desc limit 1;
    if found then
      -- Las dos cajas, juntas y en orden de id: ninguna se cierra mientras se presta, y dos préstamos cruzados (A→B y B→A al
      -- mismo tiempo) no se traban entre sí. Compartido: una venta en cualquiera de las dos sigue sin esperar.
      perform 1 from retail.cajas k where k.id in (p_caja_id, v_otra.id) order by k.id for share;
      select * into v_otra from retail.cajas k where k.id = v_otra.id and k.estado = 'abierta';
    end if;
    if not found then
      raise exception 'La caja de % no está abierta: la plata tiene que salir de una caja abierta.',
        coalesce((select u.nombre from retail.ubicaciones u where u.id = p_sede_origen_id), 'esa sede') using errcode = 'P0001';
    end if;
    v_tipo := 'entre_cuentas';
    v_origen := (select c.id from retail.cuentas_dinero c where c.tipo = 'cajon' and c.ubicacion_id = p_sede_origen_id limit 1);
    if v_origen is null then
      raise exception 'El cajón de esa sede no está en Finanzas ▸ Cuentas y dinero: pídele al líder que lo agregue.' using errcode = 'P0001';
    end if;
  end if;
  if v_tipo is not null then
    v_destino := (select c.id from retail.cuentas_dinero c where c.tipo = 'cajon' and c.ubicacion_id = v_caja.ubicacion_id limit 1);
    if v_destino is null then
      raise exception 'El cajón de % no está en Finanzas ▸ Cuentas y dinero: pídele al líder que lo agregue, o registra la entrada como «Otro».', v_sede
        using errcode = 'P0001';
    end if;
  end if;

  -- El ingreso: la MISMA función de caja de siempre (caja abierta, permiso, firma, nota obligatoria). Los tres motivos con
  -- contraparte solo los acepta con esta marca, que dura la llamada.
  perform set_config('retail.movimiento_de_sistema', 'si', true);
  v_ingreso := retail.registrar_movimiento_caja(p_caja_id, 'ingreso', v_monto, v_motivo, v_nota, false, p_token);
  perform set_config('retail.movimiento_de_sistema', '', true);

  if v_tipo is null then
    return v_ingreso;
  end if;

  v_actor := retail.fn_actor_persona_id(true);

  -- La otra punta del préstamo: sale del cajón de la sede que presta (su caja está abierta y bloqueada arriba).
  if p_concepto = 'otra_sede' then
    insert into retail.caja_movimientos (caja_id, tipo, monto, motivo, nota, es_ajuste, usuario_id)
    values (v_otra.id, 'egreso', v_monto, 'Préstamo a otra sede', left('A ' || v_sede || coalesce(' — ' || v_nota, ''), 200), false, v_actor)
    returning id into v_egreso;
  end if;

  insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, cuenta_destino_id, monto, caja_movimiento_id, caja_ingreso_id,
                                         referencia, registrado_por)
  values (v_tipo, retail.fn_hoy_lima(), v_origen, v_destino, v_monto, v_egreso, v_ingreso,
          left(v_motivo || coalesce(' · ' || v_nota, ''), 200), v_actor);

  return v_ingreso;
end $function$;

comment on function retail.registrar_ingreso_caja(uuid, text, numeric, text, text, uuid, uuid) is
  'Caja ▸ Registrar ingreso (ADR-0371): el ingreso de caja y, según el concepto, de qué cuenta sale (caja fuerte, efectivo por rendir, aporte del dueño o el cajón de otra sede), todo o nada. Idempotente por p_token.';
revoke all on function retail.registrar_ingreso_caja(uuid, text, numeric, text, text, uuid, uuid) from public, anon;
grant execute on function retail.registrar_ingreso_caja(uuid, text, numeric, text, text, uuid, uuid) to authenticated;

reset lock_timeout;
