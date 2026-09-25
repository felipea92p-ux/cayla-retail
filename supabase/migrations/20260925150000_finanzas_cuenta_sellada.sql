-- ============================================================================
-- 20260925150000 — La cuenta sellada en cada movimiento de plata (ADR-0195 F3b; docs/PLAN-FINANZAS.md §7 bis)
--
-- EL PROBLEMA PRIMERO
--   Ningún cobro ni pago guarda DE QUÉ CUENTA de CAYLA salió o a cuál entró. Cuentas y dinero (F3) deduce el saldo de los
--   bancos mirando el medio y la tienda, y lo que no puede deducir queda «sin cuenta». Hueco concreto: un pago en
--   efectivo a un proveedor no dice si salió del cajón o de la caja fuerte, y `fn_calcular_esperado_caja` no lo
--   descuenta del cierre: si salió del cajón, la tienda cierra con un faltante que no existía (12 pagos por S/ 15,661 en
--   la medición del 2026-09-24).
--
-- LAS REGLAS
--   1. Todo lo que mueve plata guarda el MEDIO (cómo) y la CUENTA (dónde), y la cuenta se SELLA AL GUARDAR: si mañana
--      cambia a qué banco cae el Yape de LIM, lo pasado no se mueve (`medios_de_cobro` solo decide lo que se cobra desde
--      ese día).
--   2. Cobros (situaciones 1–5 de §7 bis: venta, abono de apartado, diferencia de un cambio, proforma cobrada): la
--      cuenta la pone la base, sola, con un disparador `BEFORE INSERT` (`fn_cuenta_sellada`, clase «cobro»): el
--      efectivo al cajón de esa tienda y lo demás a la cuenta de `medios_de_cobro` vigente. El mostrador no elige nada.
--      Si la tienda no configuró ese medio, queda en nulo («sin cuenta»). NUNCA tumba una venta: si el sello falla,
--      el cobro queda sin cuenta y se sigue.
--   3. Donde una persona decide de dónde sale la plata (pagos a proveedores de Compras, Por pagar y Producción; gastos y
--      activos; devoluciones a una clienta o del adelanto de un apartado; reembolso de un proveedor; el banco del
--      cierre) la función recibe la cuenta ELEGIDA y la base la valida: que sirva para ese medio (efectivo → cajón, caja
--      fuerte o por rendir; Yape, Plin y transferencias → banco; tarjeta → tarjeta de crédito, banco o POS), que no esté
--      archivada, y que el efectivo de una sede solo lo mueva quien opera esa sede (lo que tiene el líder, solo él). Si no
--      llega ninguna, se sella la propuesta: la misma deducción que usaba F3.
--   4. Si un pago sale de un CAJÓN, crea su salida de caja en la misma operación (la MISMA `registrar_movimiento_caja`
--      de siempre: caja abierta, permiso y firma) y así resta del cierre. Lo que sale del cajón sale hoy. Si un reembolso
--      de proveedor entra a un cajón, crea su ingreso de caja.
--   5. Un egreso de caja respalda UNA sola cosa: gasto, activo, «no es gasto», movimiento de dinero o PAGO a un
--      proveedor (`fn_egreso_ya_usado`, extendida por parche con ancla). Única excepción: el gasto o activo con factura
--      pagado del cajón comparte su egreso con el pago de ESA factura (es una sola salida de plata).
--   6. Una cuenta sellada no cambia: disparadores que lo impiden en cada tabla. Nada se borra.
--   7. Lo pasado NO se toca: los cobros viejos quedan sin sello y el libro los sigue deduciendo como en F3; los pagos
--      viejos que no dicen su cuenta se completan UNA vez desde Cuentas y dinero (`asignar_cuenta_pasada`, solo el
--      líder), en una tabla aparte (`cuentas_asignadas`, solo agrega filas), SIN crear egresos ni tocar cierres hechos.
--   8. Los saldos (`fn_dinero_libro`) usan la cuenta sellada cuando existe, luego la asignada, y deducen solo cuando las
--      dos faltan. El aviso «movieron plata sin decir de qué cuenta» se achica solo.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — DIEZ EJECUCIONES SEPARADAS, EN ORDEN (CLAUDE.md «Políticas y deadlocks»):
--   PARTE 1  lo nuevo: el sello, las lecturas y la tabla `cuentas_asignadas` (no toca tablas en uso)
--   PARTE 2  `venta_pagos`, sola          PARTE 3  `separacion_pagos`, sola      PARTE 4  `cambios`, sola
--   PARTE 5  `devoluciones`, sola         PARTE 6  `separaciones`, sola          PARTE 7  `caja_traslados`, sola
--   PARTE 8  `compra_pagos`, sola
--   PARTE 9  gastos, activos, reembolsos de proveedores y pagos de Producción (tablas que la tienda no usa en el día)
--   PARTE 10 las funciones: firmas nuevas (con la vieja quitada), parches por ancla y el libro de saldos
--   Cada una con `lock_timeout = 3s`: si dice «lock timeout», se repite ESA parte. Todas son idempotentes. Sin políticas.
--   Antes deben estar F2 (20260924235000, 20260924235100, 20260925000000) y F3 (20260925110000, sus tres partes).
--   En local y en el CI corre entero.
-- SE ROMPE SI: la web nueva se publica antes (manda `p_cuenta_id` y parámetros que no existirían). La web de hoy NO se
-- rompe si esto se pega primero: cada firma nueva solo agrega un parámetro opcional al final, y los cobros y pagos que
-- llegan sin cuenta se sellan solos con la propuesta.
-- ============================================================================

-- ============================== PARTE 1 · lo nuevo ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Qué cuenta sirve para qué medio ----------
-- `p_clase`: «cobro» (la plata de las clientas: entra por la tienda y, si se le devuelve, sale por el mismo camino),
-- «pago» (sale hacia un proveedor o un gasto) o «reembolso» (un proveedor le devuelve plata a CAYLA).
create or replace function retail.fn_cuenta_sirve(p_clase text, p_medio text, p_tipo text) returns boolean
language sql immutable set search_path = retail, public, extensions as $$
  select case
    when p_medio = 'efectivo' and p_clase = 'cobro' then p_tipo = 'cajon'
    when p_medio = 'efectivo' then p_tipo in ('cajon', 'caja_fuerte', 'por_rendir')
    when p_medio = 'tarjeta' and p_clase = 'pago' then p_tipo in ('tarjeta_credito', 'banco')
    when p_medio = 'tarjeta' and p_clase = 'cobro' then p_tipo in ('por_abonar', 'banco')
    when p_medio in ('yape', 'plin', 'transferencia', 'deposito', 'otro', 'tarjeta') then p_tipo = 'banco'
    else false
  end;
$$;
comment on function retail.fn_cuenta_sirve(text, text, text) is
  'Si una cuenta de ese tipo sirve para mover plata con ese medio (ADR-0195 F3b). Efectivo: cajón, caja fuerte o por rendir (un cobro, solo el cajón). Tarjeta: al pagar, la tarjeta de crédito o un banco; al cobrar, el POS o un banco. Lo demás: un banco o billetera.';

create or replace function retail.fn_cuenta_de_cajon(p_ubicacion_id uuid) returns uuid
language sql stable set search_path = retail, public, extensions as $$
  select c.id from retail.cuentas_dinero c where c.tipo = 'cajon' and c.ubicacion_id = p_ubicacion_id;
$$;

-- ---------- 2. El sello ----------
-- La cuenta que queda en un cobro o un pago. Con una cuenta ELEGIDA, la valida y la devuelve (o se detiene con un aviso
-- en palabras del negocio). Sin elegida, devuelve la propuesta: la misma deducción de F3. Nunca lee ni escribe saldos.
create or replace function retail.fn_cuenta_sellada(p_clase text, p_medio text, p_ubicacion_id uuid, p_fecha date, p_elegida uuid)
returns uuid
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_c retail.cuentas_dinero%rowtype;
  v_fecha date := coalesce(p_fecha, retail.fn_hoy_lima());
begin
  if p_clase is null or p_clase not in ('cobro', 'pago', 'reembolso') then
    raise exception 'Clase de movimiento desconocida: %', coalesce(p_clase, '(vacía)') using errcode = 'P0001';
  end if;
  -- El anticipo (lo que ya entró al abonar) y el saldo a favor de un proveedor no mueven plata: no tienen cuenta.
  if p_medio is null or p_medio in ('anticipo', 'saldo_a_favor') then
    if p_elegida is not null then
      raise exception 'Ese medio no mueve plata: no lleva cuenta.' using errcode = 'P0001';
    end if;
    return null;
  end if;
  -- Lo que una clienta paga (o se le devuelve) en efectivo es del cajón de esa tienda: nadie lo elige.
  if p_clase = 'cobro' and p_medio = 'efectivo' then
    return retail.fn_cuenta_de_cajon(p_ubicacion_id);
  end if;

  if p_elegida is null then
    return case
      -- Una salida o entrada de efectivo la dice una persona (cajón, caja fuerte o lo que tiene el líder).
      when p_medio = 'efectivo' then null
      when p_medio = 'tarjeta' and p_clase = 'pago' then
        (select c.id from retail.cuentas_dinero c where c.tipo = 'tarjeta_credito' and c.archivada_en is null order by c.orden, c.created_at limit 1)
      when p_medio in ('yape', 'plin', 'tarjeta') and p_clase <> 'reembolso' then retail.fn_cuenta_de_cobro(p_ubicacion_id, p_medio, v_fecha)
      else retail.fn_cuenta_de_cobro(p_ubicacion_id, 'transferencia', v_fecha)
    end;
  end if;

  select * into v_c from retail.cuentas_dinero where id = p_elegida;
  if not found then
    raise exception 'Esa cuenta no existe. Recarga la pantalla.' using errcode = 'P0001';
  end if;
  if v_c.archivada_en is not null then
    raise exception 'La cuenta «%» está archivada: elige otra.', v_c.nombre using errcode = 'P0001';
  end if;
  if not retail.fn_cuenta_sirve(p_clase, p_medio, v_c.tipo) then
    raise exception '%', case
      when p_medio = 'efectivo' then 'En efectivo, la plata sale o entra de un cajón, una caja fuerte o el efectivo por rendir: «' || v_c.nombre || '» no guarda efectivo.'
      when p_medio = 'tarjeta' and p_clase = 'pago' then 'Lo pagado con tarjeta sale de la tarjeta de crédito o de un banco: «' || v_c.nombre || '» no lo es.'
      when p_medio = 'tarjeta' then 'Lo cobrado con tarjeta entra al POS (por abonar) o a un banco: «' || v_c.nombre || '» no lo es.'
      else 'Con ' || case p_medio when 'yape' then 'Yape' when 'plin' then 'Plin' when 'deposito' then 'un depósito' else 'una transferencia' end
           || ', la plata va por un banco o billetera: «' || v_c.nombre || '» no lo es.'
    end using errcode = 'P0001';
  end if;
  -- El efectivo de una sede lo mueve quien opera esa sede; lo que tiene el líder, solo el líder.
  if v_c.tipo in ('cajon', 'caja_fuerte') and not retail.fn_es_lider() and not retail.fn_puede_operar_ubicacion(v_c.ubicacion_id) then
    raise exception 'El efectivo de «%» no es de tu tienda.', v_c.nombre using errcode = '42501';
  end if;
  if v_c.tipo = 'por_rendir' and not retail.fn_es_lider() then
    raise exception 'Lo que tiene el líder solo lo mueve el líder.' using errcode = '42501';
  end if;
  return v_c.id;
end $$;
comment on function retail.fn_cuenta_sellada(text, text, uuid, date, uuid) is
  'USO INTERNO (disparadores de sello, ADR-0195 F3b). Valida la cuenta elegida para ese medio o devuelve la propuesta (la deducción de F3). El efectivo de un cobro siempre es el cajón de su tienda.';

-- Lo que sale (o entra) de un CAJÓN es un movimiento de su caja abierta, hoy: se crea con la MISMA función de caja de
-- siempre (caja abierta, permiso de la sede y firma). Devuelve el movimiento.
create or replace function retail.fn_movimiento_de_cajon(p_cuenta_id uuid, p_tipo text, p_monto numeric, p_fecha date, p_motivo text, p_nota text)
returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_ubic uuid; v_nombre text; v_caja uuid;
begin
  select c.ubicacion_id, u.nombre into v_ubic, v_nombre
    from retail.cuentas_dinero c join retail.ubicaciones u on u.id = c.ubicacion_id
   where c.id = p_cuenta_id and c.tipo = 'cajon';
  if v_ubic is null then
    raise exception 'Esa cuenta no es un cajón.' using errcode = 'P0001';
  end if;
  if p_fecha is distinct from retail.fn_hoy_lima() then
    raise exception 'Lo que % del cajón es de hoy, de la caja abierta. Si fue otro día, elige de dónde % de verdad (la caja fuerte, por ejemplo).',
      case p_tipo when 'ingreso' then 'entra al' else 'sale' end, case p_tipo when 'ingreso' then 'entró' else 'salió' end using errcode = 'P0001';
  end if;
  select k.id into v_caja from retail.cajas k where k.ubicacion_id = v_ubic and k.estado = 'abierta' order by k.abierta_en desc limit 1;
  if v_caja is null then
    raise exception 'La caja de % no está abierta: ábrela para que la plata % del cajón. Si fue de otro lado, elige de dónde.',
      v_nombre, case p_tipo when 'ingreso' then 'entre' else 'salga' end using errcode = 'P0001';
  end if;
  return retail.registrar_movimiento_caja(v_caja, p_tipo, p_monto, p_motivo, left(p_nota, 200), false, null::uuid);
end $$;

-- Un pago que ya trae su egreso (el gasto o activo con factura pagado del cajón): que sea un egreso de ESE cajón, del
-- mismo monto, y que no respalde nada más.
create or replace function retail.fn_exigir_egreso_del_pago(p_caja_movimiento_id uuid, p_cuenta_id uuid, p_monto numeric)
returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_mov retail.caja_movimientos%rowtype; v_ubic uuid; v_usado text;
begin
  perform pg_advisory_xact_lock(hashtextextended('egreso:' || p_caja_movimiento_id::text, 0));
  select * into v_mov from retail.caja_movimientos where id = p_caja_movimiento_id;
  if not found or v_mov.tipo <> 'egreso' then
    raise exception 'Un pago del cajón se respalda con un egreso de caja.' using errcode = 'P0001';
  end if;
  select k.ubicacion_id into v_ubic from retail.cajas k where k.id = v_mov.caja_id;
  if v_ubic is distinct from (select c.ubicacion_id from retail.cuentas_dinero c where c.id = p_cuenta_id and c.tipo = 'cajon') then
    raise exception 'Ese egreso es de la caja de otra tienda.' using errcode = 'P0001';
  end if;
  if v_mov.monto <> p_monto then
    raise exception 'El pago (S/ %) no coincide con el egreso de caja (S/ %).', p_monto, v_mov.monto using errcode = 'P0001';
  end if;
  if exists (select 1 from retail.compra_pagos cp where cp.caja_movimiento_id = p_caja_movimiento_id)
     or exists (select 1 from retail.comprobantes_produccion_pagos pp where pp.caja_movimiento_id = p_caja_movimiento_id) then
    raise exception 'Ese egreso de caja ya es el pago a un proveedor.' using errcode = 'P0001';
  end if;
  v_usado := retail.fn_egreso_ya_usado(p_caja_movimiento_id, 'pago');
  if v_usado is not null then
    raise exception 'Ese egreso de caja ya se usó (%).', case v_usado when 'gasto' then 'es un gasto' when 'activo' then 'es un activo fijo'
      when 'movimiento' then 'es un depósito o un retiro' else 'está marcado «no es gasto»' end using errcode = 'P0001';
  end if;
end $$;

-- ---------- 3. Los disparadores del sello (se enganchan a su tabla en las partes 2 a 9) ----------

-- Cobros de una venta (situaciones 1, 2 y 5): el sello NUNCA tumba una venta.
create or replace function retail.fn_venta_pagos_sellar() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_ubic uuid;
begin
  if tg_op = 'UPDATE' then
    if new.cuenta_dinero_id is distinct from old.cuenta_dinero_id then
      raise exception 'La cuenta de un cobro se sella al cobrar: no cambia.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  begin
    select v.ubicacion_id into v_ubic from retail.ventas v where v.id = new.venta_id;
    new.cuenta_dinero_id := retail.fn_cuenta_sellada('cobro', new.metodo, v_ubic, retail.fn_hoy_lima(), new.cuenta_dinero_id);
  exception when others then
    new.cuenta_dinero_id := null;
  end;
  return new;
end $$;

-- Abonos y adelantos de un apartado (situación 3).
create or replace function retail.fn_separacion_pagos_sellar() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_ubic uuid;
begin
  if tg_op = 'UPDATE' then
    if new.cuenta_dinero_id is distinct from old.cuenta_dinero_id then
      raise exception 'La cuenta de un abono se sella al cobrar: no cambia.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  begin
    select s.ubicacion_id into v_ubic from retail.separaciones s where s.id = new.separacion_id;
    new.cuenta_dinero_id := retail.fn_cuenta_sellada('cobro', new.metodo, v_ubic, retail.fn_hoy_lima(), new.cuenta_dinero_id);
  exception when others then
    new.cuenta_dinero_id := null;
  end;
  return new;
end $$;

-- La diferencia de un cambio (situación 4): entre o salga, va por los medios de la tienda, sola.
create or replace function retail.fn_cambios_sellar() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
begin
  if tg_op = 'UPDATE' then
    if new.cuenta_dinero_id is distinct from old.cuenta_dinero_id then
      raise exception 'La cuenta de un cambio se sella al registrarlo: no cambia.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if coalesce(new.diferencia, 0) = 0 or new.metodo_pago_diferencia is null then
    new.cuenta_dinero_id := null;
    return new;
  end if;
  begin
    new.cuenta_dinero_id := retail.fn_cuenta_sellada('cobro', new.metodo_pago_diferencia, new.ubicacion_id, retail.fn_hoy_lima(), new.cuenta_dinero_id);
  exception when others then
    new.cuenta_dinero_id := null;
  end;
  return new;
end $$;

-- Devolución de plata a una clienta (situación 9): se sella al APROBAR. En efectivo, el cajón (ya resta del cierre).
-- Con otro medio, la cuenta elegida en «Sale de» o, si no llegó, la de la tienda.
create or replace function retail.fn_devoluciones_sellar() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
begin
  if tg_op = 'UPDATE' and old.estado = 'aprobada' then
    if new.reembolso_cuenta_id is distinct from old.reembolso_cuenta_id then
      raise exception 'La cuenta de un reembolso se sella al aprobarlo: no cambia.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.estado is distinct from 'aprobada' then
    if new.reembolso_cuenta_id is not null then
      raise exception 'La cuenta del reembolso se sella al aprobar la devolución.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if coalesce(new.reembolso_monto, 0) <= 0 or new.reembolso_metodo is null then
    if new.reembolso_cuenta_id is not null then
      raise exception 'Sin reembolso no hay cuenta de la que salga la plata.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.reembolso_cuenta_id is null then
    begin
      new.reembolso_cuenta_id := retail.fn_cuenta_sellada('cobro', new.reembolso_metodo, new.ubicacion_id, retail.fn_hoy_lima(), null);
    exception when others then
      new.reembolso_cuenta_id := null;
    end;
  else
    new.reembolso_cuenta_id := retail.fn_cuenta_sellada('cobro', new.reembolso_metodo, new.ubicacion_id, retail.fn_hoy_lima(), new.reembolso_cuenta_id);
  end if;
  return new;
end $$;

-- Devolución del adelanto de un apartado (situación 10): se sella al pasar a «devuelta», igual que la 9.
create or replace function retail.fn_separaciones_sellar() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
begin
  if tg_op = 'UPDATE' and old.estado = 'devuelta' then
    if new.devolucion_cuenta_id is distinct from old.devolucion_cuenta_id then
      raise exception 'La cuenta de una devolución se sella al registrarla: no cambia.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.estado is distinct from 'devuelta' then
    if new.devolucion_cuenta_id is not null then
      raise exception 'La cuenta de la devolución se sella al registrarla.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.devolucion_medio_real is null or coalesce(new.adelanto, 0) <= 0 then
    new.devolucion_cuenta_id := null;
    return new;
  end if;
  if new.devolucion_cuenta_id is null then
    begin
      new.devolucion_cuenta_id := retail.fn_cuenta_sellada('cobro', new.devolucion_medio_real, new.ubicacion_id, retail.fn_hoy_lima(), null);
    exception when others then
      new.devolucion_cuenta_id := null;
    end;
  else
    new.devolucion_cuenta_id := retail.fn_cuenta_sellada('cobro', new.devolucion_medio_real, new.ubicacion_id, retail.fn_hoy_lima(), new.devolucion_cuenta_id);
  end if;
  return new;
end $$;

-- El traslado del cierre de caja (situación 19): caja fuerte y líder salen solos; el banco, el que se eligió en «¿A qué
-- banco?» o, si no llegó, el de las transferencias de esa tienda. Nunca tumba un cierre por una propuesta.
create or replace function retail.fn_caja_traslados_sellar() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_ubic uuid; v_c retail.cuentas_dinero%rowtype; v_cta uuid;
begin
  if tg_op = 'UPDATE' then
    if new.cuenta_dinero_id is distinct from old.cuenta_dinero_id then
      raise exception 'La cuenta de un traslado se sella al cerrar la caja: no cambia.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  select k.ubicacion_id into v_ubic from retail.cajas k where k.id = new.caja_id;
  if new.destino = 'banco' then
    if new.cuenta_dinero_id is null then
      begin
        new.cuenta_dinero_id := retail.fn_cuenta_de_cobro(v_ubic, 'transferencia', retail.fn_hoy_lima());
      exception when others then
        new.cuenta_dinero_id := null;
      end;
    else
      select * into v_c from retail.cuentas_dinero where id = new.cuenta_dinero_id;
      if not found or v_c.tipo <> 'banco' then
        raise exception 'El depósito del cierre va a un banco o billetera.' using errcode = 'P0001';
      end if;
      if v_c.archivada_en is not null then
        raise exception 'La cuenta «%» está archivada: elige otra.', v_c.nombre using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;
  v_cta := case new.destino
             when 'caja_fuerte' then (select f.id from retail.cuentas_dinero f where f.tipo = 'caja_fuerte' and f.ubicacion_id = v_ubic)
             when 'lider' then (select r.id from retail.cuentas_dinero r where r.tipo = 'por_rendir')
           end;
  if new.cuenta_dinero_id is not null and new.cuenta_dinero_id is distinct from v_cta then
    raise exception 'Solo el depósito en el banco elige su cuenta.' using errcode = 'P0001';
  end if;
  new.cuenta_dinero_id := v_cta;
  return new;
end $$;

-- Pagos a proveedores de Compras y Por pagar (situación 11). Del cajón: su egreso, en la misma operación.
create or replace function retail.fn_compra_pagos_sellar() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_tipo text; v_det text;
begin
  if tg_op = 'UPDATE' then
    if (new.cuenta_dinero_id, new.caja_movimiento_id) is distinct from (old.cuenta_dinero_id, old.caja_movimiento_id) then
      raise exception 'La cuenta de un pago se sella al pagar: no cambia.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.metodo = 'saldo_a_favor' then
    if new.cuenta_dinero_id is not null or new.caja_movimiento_id is not null then
      raise exception 'El saldo a favor no sale de ninguna cuenta.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  -- Ya trae su egreso (el gasto o activo con factura pagado del cajón): la cuenta es el cajón de esa caja.
  if new.caja_movimiento_id is not null and new.cuenta_dinero_id is null then
    select c.id into new.cuenta_dinero_id
      from retail.caja_movimientos m join retail.cajas k on k.id = m.caja_id
      join retail.cuentas_dinero c on c.tipo = 'cajon' and c.ubicacion_id = k.ubicacion_id
     where m.id = new.caja_movimiento_id;
  end if;
  new.cuenta_dinero_id := retail.fn_cuenta_sellada('pago', new.metodo, new.ubicacion_id, new.fecha, new.cuenta_dinero_id);
  select c.tipo into v_tipo from retail.cuentas_dinero c where c.id = new.cuenta_dinero_id;
  if v_tipo = 'cajon' then
    if new.caja_movimiento_id is null then
      select pr.nombre || ' · ' || co.serie || '-' || co.numero into v_det
        from retail.compras co join retail.proveedores pr on pr.id = co.proveedor_id where co.id = new.compra_id;
      new.caja_movimiento_id := retail.fn_movimiento_de_cajon(new.cuenta_dinero_id, 'egreso', new.monto, new.fecha,
                                                              'Pago a proveedor', 'Pago a ' || coalesce(v_det, 'un proveedor'));
    else
      perform retail.fn_exigir_egreso_del_pago(new.caja_movimiento_id, new.cuenta_dinero_id, new.monto);
    end if;
  elsif new.caja_movimiento_id is not null then
    raise exception 'Solo lo que sale de un cajón se une a un egreso de caja.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Pagos a proveedores del Taller (situación 12): igual que la 11. El Taller no cobra, así que sin elegida no hay propuesta.
create or replace function retail.fn_produccion_pagos_sellar() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_tipo text; v_det text;
begin
  new.cuenta_dinero_id := retail.fn_cuenta_sellada('pago', new.metodo, null, new.fecha, new.cuenta_dinero_id);
  select c.tipo into v_tipo from retail.cuentas_dinero c where c.id = new.cuenta_dinero_id;
  if v_tipo = 'cajon' then
    if new.caja_movimiento_id is null then
      select pr.nombre || ' · ' || co.serie || '-' || co.numero into v_det
        from retail.comprobantes_produccion co join retail.proveedores_produccion pr on pr.id = co.proveedor_id where co.id = new.comprobante_id;
      new.caja_movimiento_id := retail.fn_movimiento_de_cajon(new.cuenta_dinero_id, 'egreso', new.monto, new.fecha,
                                                              'Pago a proveedor', 'Pago del Taller a ' || coalesce(v_det, 'un proveedor'));
    else
      perform retail.fn_exigir_egreso_del_pago(new.caja_movimiento_id, new.cuenta_dinero_id, new.monto);
    end if;
  elsif new.caja_movimiento_id is not null then
    raise exception 'Solo lo que sale de un cajón se une a un egreso de caja.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Un proveedor devuelve plata (situación 6): «Entra a». Al cajón, con su ingreso de caja.
create or replace function retail.fn_proveedor_creditos_sellar() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_tipo text; v_prov text;
begin
  if new.tipo <> 'reembolso' then
    if new.cuenta_dinero_id is not null or new.caja_movimiento_id is not null then
      raise exception 'Solo un reembolso mueve plata: una nota o una aplicación no tienen cuenta.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  new.cuenta_dinero_id := retail.fn_cuenta_sellada('reembolso', new.metodo, null, new.fecha, new.cuenta_dinero_id);
  select c.tipo into v_tipo from retail.cuentas_dinero c where c.id = new.cuenta_dinero_id;
  if v_tipo = 'cajon' then
    if new.caja_movimiento_id is not null then
      raise exception 'El ingreso de caja del reembolso lo crea la base.' using errcode = 'P0001';
    end if;
    select p.nombre into v_prov from retail.proveedores p where p.id = new.proveedor_id;
    new.caja_movimiento_id := retail.fn_movimiento_de_cajon(new.cuenta_dinero_id, 'ingreso', new.monto, new.fecha,
                                                            'Reembolso de proveedor', 'Devolución de ' || coalesce(v_prov, 'un proveedor'));
  elsif new.caja_movimiento_id is not null then
    raise exception 'Solo lo que entra a un cajón se une a un ingreso de caja.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Gastos y activos sin comprobante (situación 13): «Salió de». Del cajón, el egreso ya lo creó la regla de siempre
-- (`fn_comprobante_y_pago`); de la caja fuerte o de lo que tiene el líder, no hay egreso: la cuenta lo dice.
-- Con comprobante, la cuenta va en su pago (`compra_pagos`).
create or replace function retail.fn_gastos_sellar() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_tipo text;
begin
  if tg_op = 'UPDATE' then
    if new.cuenta_dinero_id is distinct from old.cuenta_dinero_id then
      raise exception 'La cuenta de un gasto se sella al registrarlo: no cambia.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.compra_id is not null then
    if new.cuenta_dinero_id is not null then
      raise exception 'Con comprobante, la cuenta va en su pago.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.caja_movimiento_id is not null then
    select c.id into new.cuenta_dinero_id
      from retail.caja_movimientos m join retail.cajas k on k.id = m.caja_id
      join retail.cuentas_dinero c on c.tipo = 'cajon' and c.ubicacion_id = k.ubicacion_id
     where m.id = new.caja_movimiento_id;
    return new;
  end if;
  new.cuenta_dinero_id := retail.fn_cuenta_sellada('pago', new.medio_pago, new.ubicacion_id, new.fecha, new.cuenta_dinero_id);
  select c.tipo into v_tipo from retail.cuentas_dinero c where c.id = new.cuenta_dinero_id;
  if v_tipo = 'cajon' then
    raise exception 'Del cajón, el gasto sale de la caja abierta con su egreso.' using errcode = 'P0001';
  end if;
  if new.medio_pago = 'efectivo' and new.cuenta_dinero_id is null then
    raise exception 'En efectivo, di de dónde salió: el cajón, la caja fuerte o lo que tiene el líder.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function retail.fn_activos_sellar() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_tipo text;
begin
  if tg_op = 'UPDATE' then
    if new.cuenta_dinero_id is distinct from old.cuenta_dinero_id then
      raise exception 'La cuenta de un activo se sella al registrarlo: no cambia.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.compra_id is not null then
    if new.cuenta_dinero_id is not null then
      raise exception 'Con comprobante, la cuenta va en su pago.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.caja_movimiento_id is not null then
    select c.id into new.cuenta_dinero_id
      from retail.caja_movimientos m join retail.cajas k on k.id = m.caja_id
      join retail.cuentas_dinero c on c.tipo = 'cajon' and c.ubicacion_id = k.ubicacion_id
     where m.id = new.caja_movimiento_id;
    return new;
  end if;
  if new.medio_pago is null then
    return new;
  end if;
  new.cuenta_dinero_id := retail.fn_cuenta_sellada('pago', new.medio_pago, new.ubicacion_id, new.fecha_adquisicion, new.cuenta_dinero_id);
  select c.tipo into v_tipo from retail.cuentas_dinero c where c.id = new.cuenta_dinero_id;
  if v_tipo = 'cajon' then
    raise exception 'Del cajón, el activo sale de la caja abierta con su egreso.' using errcode = 'P0001';
  end if;
  if new.medio_pago = 'efectivo' and new.cuenta_dinero_id is null then
    raise exception 'En efectivo, di de dónde salió: el cajón, la caja fuerte o lo que tiene el líder.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------- 4. Lo pasado: decir UNA vez de qué cuenta fue un pago que no lo dijo ----------
-- No crea egresos ni toca cierres hechos: si salió de un cajón ya cerrado, ese cierre ya lo absorbió como faltante.
create table if not exists retail.cuentas_asignadas (
  id uuid primary key default gen_random_uuid(),
  origen text not null check (origen in ('pago', 'pagoprod', 'reembolso', 'gasto', 'activo', 'traslado')),
  origen_id uuid not null,
  cuenta_id uuid not null references retail.cuentas_dinero (id),
  asignado_por uuid references public.personas (id),
  created_at timestamptz not null default now(),
  constraint cuentas_asignadas_una_vez unique (origen, origen_id)
);
comment on table retail.cuentas_asignadas is
  'De qué cuenta fue un pago que se guardó sin decirlo (ADR-0195 F3b): se dice una vez, después. Solo agrega filas; el libro la usa cuando el pago no tiene cuenta sellada. No crea egresos ni toca cierres.';

create or replace function retail.fn_cuentas_asignadas_inmutable() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  raise exception 'Lo que se dijo de un pago pasado no se edita ni se borra.' using errcode = 'P0001';
end $$;
drop trigger if exists cuentas_asignadas_inmutable on retail.cuentas_asignadas;
create trigger cuentas_asignadas_inmutable before update or delete on retail.cuentas_asignadas
  for each row execute function retail.fn_cuentas_asignadas_inmutable();

alter table retail.cuentas_asignadas enable row level security;
revoke all on retail.cuentas_asignadas from public, anon, authenticated;

-- ---------- 5. Lecturas para la pantalla ----------
-- Las cuentas que ESTA cuenta puede elegir en «Sale de» / «Entra a» / «¿A qué banco?», con la propuesta para cada medio
-- en esa tienda (`propuesta_para`). El líder: todas las activas. Los demás: bancos, POS y tarjeta, y el cajón y la caja
-- fuerte de las sedes que opera. Sin saldos: nombres, para elegir.
create or replace function retail.fn_cuentas_para_elegir(p_clase text default 'pago', p_ubicacion_id uuid default null)
returns table (id uuid, nombre text, tipo text, ubicacion_id uuid, ubicacion_nombre text, caja_abierta boolean, propuesta_para text[])
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_lider boolean := retail.fn_es_lider();
  v_hoy date := retail.fn_hoy_lima();
  v_clase text := coalesce(p_clase, 'pago');
begin
  if v_clase not in ('cobro', 'pago', 'reembolso') then
    raise exception 'Clase de movimiento desconocida: %', v_clase using errcode = 'P0001';
  end if;
  return query
  with visibles as (
    select c.* from retail.cuentas_dinero c
     where c.archivada_en is null
       and (v_lider
            or c.tipo in ('banco', 'por_abonar', 'tarjeta_credito')
            or (c.tipo in ('cajon', 'caja_fuerte') and retail.fn_puede_operar_ubicacion(c.ubicacion_id)))
  ),
  abiertas as (
    select distinct k.ubicacion_id from retail.cajas k where k.estado = 'abierta'
  ),
  medios as (
    select m.medio from unnest(array['efectivo', 'yape', 'plin', 'tarjeta', 'transferencia', 'deposito', 'otro']) as m (medio)
  ),
  propuestas as (
    -- La propuesta de cada medio: la de Configuración (o la del cajón) y, si no hay, la primera cuenta que sirve.
    select md.medio,
           coalesce(
             case
               when md.medio = 'efectivo' and v_clase = 'cobro' then retail.fn_cuenta_de_cajon(p_ubicacion_id)
               when md.medio = 'efectivo' then
                 case when p_ubicacion_id in (select a.ubicacion_id from abiertas a) then retail.fn_cuenta_de_cajon(p_ubicacion_id)
                      else (select f.id from retail.cuentas_dinero f where f.tipo = 'caja_fuerte' and f.ubicacion_id = p_ubicacion_id) end
               else retail.fn_cuenta_sellada(v_clase, md.medio, p_ubicacion_id, v_hoy, null)
             end,
             (select v.id from visibles v
               where retail.fn_cuenta_sirve(v_clase, md.medio, v.tipo) and md.medio <> 'efectivo'
               order by v.orden, v.nombre limit 1)
           ) as cuenta_id
      from medios md
  )
  select v.id, v.nombre, v.tipo, v.ubicacion_id, u.nombre,
         v.tipo = 'cajon' and v.ubicacion_id in (select a.ubicacion_id from abiertas a),
         coalesce((select array_agg(p.medio order by p.medio) from propuestas p where p.cuenta_id = v.id), '{}'::text[])
    from visibles v
    left join retail.ubicaciones u on u.id = v.ubicacion_id
   order by v.orden, u.nombre nulls first, v.nombre;
end $$;
comment on function retail.fn_cuentas_para_elegir(text, uuid) is
  'Las cuentas que se pueden elegir al pagar, devolver o recibir plata (ADR-0195 F3b), con la propuesta de cada medio para esa tienda. Sin saldos.';

-- Lo que movió plata y todavía no dice de qué cuenta, uno por uno, para decirlo (solo el líder). Sale del mismo libro de
-- los saldos: lo que aquí aparece es exactamente lo que el aviso de Cuentas y dinero cuenta como «sin cuenta».
create or replace function retail.fn_pagos_sin_cuenta()
returns table (clave text, origen text, fecha date, detalle text, medio text, monto numeric, ubicacion_nombre text)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
begin
  perform retail.fn_exigir_lider_dinero('Decir de qué cuenta fue lo pasado');
  return query
  with l as (
    select l.clave, l.origen, l.fecha, l.detalle, l.monto, l.ubicacion_id,
           split_part(l.clave, ':', 1) as pref, split_part(l.clave, ':', 2)::uuid as oid
      from retail.fn_dinero_libro(retail.fn_hoy_lima()) l
     where l.cuenta_id is null and split_part(l.clave, ':', 1) in ('pago', 'pagoprod', 'reembolso', 'gasto', 'activo', 'traslado')
  )
  select l.clave, l.pref, l.fecha, l.detalle,
         case l.pref
           when 'pago' then (select cp.metodo from retail.compra_pagos cp where cp.id = l.oid)
           when 'pagoprod' then (select pp.metodo from retail.comprobantes_produccion_pagos pp where pp.id = l.oid)
           when 'reembolso' then (select pc.metodo from retail.proveedor_creditos pc where pc.id = l.oid)
           when 'gasto' then (select g.medio_pago from retail.gastos g where g.id = l.oid)
           when 'activo' then (select a.medio_pago from retail.activos_fijos a where a.id = l.oid)
           else 'transferencia'
         end,
         l.monto, u.nombre
    from l left join retail.ubicaciones u on u.id = l.ubicacion_id
   order by l.fecha desc, l.clave;
end $$;

-- «Salió de la caja fuerte de TRU»: se dice una vez, sin crear egresos ni tocar cierres. Solo el líder.
create or replace function retail.asignar_cuenta_pasada(p_clave text, p_cuenta_id uuid) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_pref text := split_part(coalesce(p_clave, ''), ':', 1);
  v_oid uuid;
  v_medio text;
  v_id uuid;
begin
  perform retail.fn_exigir_lider_dinero('Decir de qué cuenta fue lo pasado');
  if v_pref not in ('pago', 'pagoprod', 'reembolso', 'gasto', 'activo', 'traslado') then
    raise exception 'Eso no es un pago que se pueda completar.' using errcode = 'P0001';
  end if;
  begin
    v_oid := split_part(p_clave, ':', 2)::uuid;
  exception when others then
    raise exception 'Eso no es un pago que se pueda completar.' using errcode = 'P0001';
  end;
  if p_cuenta_id is null then
    raise exception 'Elige de qué cuenta fue.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cuenta_asignada:' || p_clave, 0));
  if not exists (select 1 from retail.fn_dinero_libro(retail.fn_hoy_lima()) l where l.clave = p_clave and l.cuenta_id is null) then
    raise exception 'Ese movimiento ya dice de qué cuenta es.' using errcode = 'P0001';
  end if;
  v_medio := case v_pref
    when 'pago' then (select cp.metodo from retail.compra_pagos cp where cp.id = v_oid)
    when 'pagoprod' then (select pp.metodo from retail.comprobantes_produccion_pagos pp where pp.id = v_oid)
    when 'reembolso' then (select pc.metodo from retail.proveedor_creditos pc where pc.id = v_oid)
    when 'gasto' then (select g.medio_pago from retail.gastos g where g.id = v_oid)
    when 'activo' then (select a.medio_pago from retail.activos_fijos a where a.id = v_oid)
    else 'transferencia'
  end;
  -- La misma regla del sello: que la cuenta sirva para ese medio (el traslado del cierre, solo un banco).
  perform retail.fn_cuenta_sellada(case when v_pref = 'reembolso' then 'reembolso' else 'pago' end, v_medio, null, null, p_cuenta_id);
  insert into retail.cuentas_asignadas (origen, origen_id, cuenta_id, asignado_por)
  values (v_pref, v_oid, p_cuenta_id, retail.fn_actor_persona_id(true))
  returning id into v_id;
  return v_id;
end $$;

-- ---------- 6. Permisos ----------
do $$
declare f text;
begin
  -- Internas: sin permiso para nadie (las llaman los disparadores y las funciones de arriba).
  foreach f in array array[
    'retail.fn_cuenta_de_cajon(uuid)',
    'retail.fn_cuenta_sellada(text, text, uuid, date, uuid)',
    'retail.fn_movimiento_de_cajon(uuid, text, numeric, date, text, text)',
    'retail.fn_exigir_egreso_del_pago(uuid, uuid, numeric)',
    'retail.fn_venta_pagos_sellar()',
    'retail.fn_separacion_pagos_sellar()',
    'retail.fn_cambios_sellar()',
    'retail.fn_devoluciones_sellar()',
    'retail.fn_separaciones_sellar()',
    'retail.fn_caja_traslados_sellar()',
    'retail.fn_compra_pagos_sellar()',
    'retail.fn_produccion_pagos_sellar()',
    'retail.fn_proveedor_creditos_sellar()',
    'retail.fn_gastos_sellar()',
    'retail.fn_activos_sellar()',
    'retail.fn_cuentas_asignadas_inmutable()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  -- Las de la pantalla (cada una pide su permiso adentro).
  foreach f in array array[
    'retail.fn_cuenta_sirve(text, text, text)',
    'retail.fn_cuentas_para_elegir(text, uuid)',
    'retail.fn_pagos_sin_cuenta()',
    'retail.asignar_cuenta_pasada(text, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

reset lock_timeout;

-- ============================== PARTE 2 · venta_pagos (sola) ==============================
-- Toma `venta_pagos` un instante (columna nueva, sin valor por defecto: no reescribe la tabla). Si dice «lock timeout»,
-- Vender la estaba usando: se repite.
set search_path = retail, public, extensions;
set lock_timeout = '3s';
alter table retail.venta_pagos add column if not exists cuenta_dinero_id uuid references retail.cuentas_dinero (id);
comment on column retail.venta_pagos.cuenta_dinero_id is
  'Dónde entró la plata, sellada al cobrar (ADR-0195 F3b): el cajón en efectivo, la cuenta de medios_de_cobro en lo demás. Nula: el anticipo, o la tienda no configuró ese medio (el libro la deduce).';
create or replace trigger venta_pagos_sellar_cuenta before insert or update of cuenta_dinero_id on retail.venta_pagos
  for each row execute function retail.fn_venta_pagos_sellar();
reset lock_timeout;

-- ============================== PARTE 3 · separacion_pagos (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';
alter table retail.separacion_pagos add column if not exists cuenta_dinero_id uuid references retail.cuentas_dinero (id);
comment on column retail.separacion_pagos.cuenta_dinero_id is 'Dónde entró el abono, sellada al cobrar (ADR-0195 F3b).';
create or replace trigger separacion_pagos_sellar_cuenta before insert or update of cuenta_dinero_id on retail.separacion_pagos
  for each row execute function retail.fn_separacion_pagos_sellar();
reset lock_timeout;

-- ============================== PARTE 4 · cambios (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';
alter table retail.cambios add column if not exists cuenta_dinero_id uuid references retail.cuentas_dinero (id);
comment on column retail.cambios.cuenta_dinero_id is 'Por dónde entró o salió la diferencia, sellada al registrar el cambio (ADR-0195 F3b).';
create or replace trigger cambios_sellar_cuenta before insert or update of cuenta_dinero_id on retail.cambios
  for each row execute function retail.fn_cambios_sellar();
reset lock_timeout;

-- ============================== PARTE 5 · devoluciones (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';
alter table retail.devoluciones add column if not exists reembolso_cuenta_id uuid references retail.cuentas_dinero (id);
comment on column retail.devoluciones.reembolso_cuenta_id is
  'De qué cuenta salió el reembolso, sellada al aprobar (ADR-0195 F3b): el cajón en efectivo; con otro medio, la elegida en «Sale de».';
create or replace trigger devoluciones_sellar_cuenta before insert or update on retail.devoluciones
  for each row execute function retail.fn_devoluciones_sellar();
reset lock_timeout;

-- ============================== PARTE 6 · separaciones (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';
alter table retail.separaciones add column if not exists devolucion_cuenta_id uuid references retail.cuentas_dinero (id);
comment on column retail.separaciones.devolucion_cuenta_id is
  'De qué cuenta salió el adelanto devuelto, sellada al registrarlo (ADR-0195 F3b): el cajón en efectivo; con otro medio, la elegida en «Sale de».';
create or replace trigger separaciones_sellar_cuenta before insert or update on retail.separaciones
  for each row execute function retail.fn_separaciones_sellar();
reset lock_timeout;

-- ============================== PARTE 7 · caja_traslados (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';
alter table retail.caja_traslados add column if not exists cuenta_dinero_id uuid references retail.cuentas_dinero (id);
comment on column retail.caja_traslados.cuenta_dinero_id is
  'A qué cuenta fue el traslado del cierre (ADR-0195 F3b): la caja fuerte de la sede, lo que tiene el líder o el banco elegido en «¿A qué banco?».';
create or replace trigger caja_traslados_sellar_cuenta before insert or update of cuenta_dinero_id on retail.caja_traslados
  for each row execute function retail.fn_caja_traslados_sellar();
reset lock_timeout;

-- ============================== PARTE 8 · compra_pagos (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';
alter table retail.compra_pagos add column if not exists cuenta_dinero_id uuid references retail.cuentas_dinero (id);
alter table retail.compra_pagos add column if not exists caja_movimiento_id uuid references retail.caja_movimientos (id);
comment on column retail.compra_pagos.cuenta_dinero_id is 'De qué cuenta salió el pago, sellada al pagar (ADR-0195 F3b). Nula: saldo a favor, o un pago viejo que no lo dijo.';
comment on column retail.compra_pagos.caja_movimiento_id is 'Si salió de un cajón: su egreso de caja (uno por pago; resta del cierre).';
create unique index if not exists compra_pagos_egreso_uq on retail.compra_pagos (caja_movimiento_id) where caja_movimiento_id is not null;
create or replace trigger compra_pagos_sellar_cuenta before insert or update of cuenta_dinero_id, caja_movimiento_id on retail.compra_pagos
  for each row execute function retail.fn_compra_pagos_sellar();
reset lock_timeout;

-- ============================== PARTE 9 · gastos, activos, reembolsos y pagos de Producción ==============================
-- Tablas que la tienda no usa en el día (las escribe Finanzas, Compras ▸ notas de crédito y Producción).
set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.comprobantes_produccion_pagos add column if not exists cuenta_dinero_id uuid references retail.cuentas_dinero (id);
alter table retail.comprobantes_produccion_pagos add column if not exists caja_movimiento_id uuid references retail.caja_movimientos (id);
create unique index if not exists comprobantes_produccion_pagos_egreso_uq on retail.comprobantes_produccion_pagos (caja_movimiento_id)
  where caja_movimiento_id is not null;
create or replace trigger comprobantes_produccion_pagos_sellar_cuenta before insert on retail.comprobantes_produccion_pagos
  for each row execute function retail.fn_produccion_pagos_sellar();

alter table retail.proveedor_creditos add column if not exists cuenta_dinero_id uuid references retail.cuentas_dinero (id);
alter table retail.proveedor_creditos add column if not exists caja_movimiento_id uuid references retail.caja_movimientos (id);
create or replace trigger proveedor_creditos_sellar_cuenta before insert on retail.proveedor_creditos
  for each row execute function retail.fn_proveedor_creditos_sellar();

-- Un gasto o activo en efectivo puede salir de la caja fuerte o de lo que tiene el líder: sin egreso de caja, con cuenta.
alter table retail.gastos add column if not exists cuenta_dinero_id uuid references retail.cuentas_dinero (id);
alter table retail.gastos drop constraint if exists gastos_pago_coherente;
alter table retail.gastos add constraint gastos_pago_coherente check (
  (compra_id is null and medio_pago is not null
     and (caja_movimiento_id is null or medio_pago = 'efectivo')
     and (medio_pago <> 'efectivo' or caja_movimiento_id is not null or cuenta_dinero_id is not null))
  or (compra_id is not null and medio_pago is null and cuenta_dinero_id is null));
create or replace trigger gastos_sellar_cuenta before insert or update of cuenta_dinero_id on retail.gastos
  for each row execute function retail.fn_gastos_sellar();

alter table retail.activos_fijos add column if not exists cuenta_dinero_id uuid references retail.cuentas_dinero (id);
alter table retail.activos_fijos drop constraint if exists activos_fijos_pago_coherente;
alter table retail.activos_fijos add constraint activos_fijos_pago_coherente check (
  (compra_id is null and medio_pago is not null
     and (caja_movimiento_id is null or medio_pago = 'efectivo')
     and (medio_pago <> 'efectivo' or caja_movimiento_id is not null or cuenta_dinero_id is not null))
  or (compra_id is not null and medio_pago is null and cuenta_dinero_id is null));
create or replace trigger activos_fijos_sellar_cuenta before insert or update of cuenta_dinero_id on retail.activos_fijos
  for each row execute function retail.fn_activos_sellar();

reset lock_timeout;

-- ============================== PARTE 10 · las funciones ==============================
-- Parches por texto sobre la definición VIVA (como `pg_temp.solo_mercaderia` de 20260924235100 y `pg_temp.parchar` de
-- F3): cada ancla tiene que aparecer exactamente una vez, o la migración se detiene y avisa. Si la marca ya está, no se
-- toca (se puede repetir). Cuando cambia la firma (un parámetro opcional al FINAL), se crea la nueva, se quita la vieja
-- (sin sobrecargas) y se copian sus permisos. Solo reemplaza funciones: no toma ninguna tabla.
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Un texto literal como patrón: escapa lo especial y acepta cualquier espacio o salto de línea donde hay espacios.
create or replace function pg_temp.lit(p text) returns text language sql immutable as $f$
  select regexp_replace(regexp_replace(p, '([.^$*+?(){}|\[\]\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
$f$;

create or replace function pg_temp.reescribir(p_firma text, p_firma_nueva text, p_marca text, p_cambios text[])
returns void language plpgsql as $f$
declare
  v_vieja regprocedure := to_regprocedure(p_firma);
  v_nueva regprocedure := to_regprocedure(coalesce(p_firma_nueva, p_firma));
  v_def text; v_hay integer; v_auth boolean; i integer;
begin
  -- ¿Ya está? (la parte se puede repetir)
  if v_nueva is not null and position(p_marca in pg_get_functiondef(v_nueva)) > 0 then
    if p_firma_nueva is not null and v_vieja is not null then
      execute 'drop function ' || p_firma;
    end if;
    return;
  end if;
  if v_vieja is null then
    raise exception '%: no está en la base. Revisar antes de pegar.', p_firma;
  end if;
  v_def := pg_get_functiondef(v_vieja);
  for i in 1 .. coalesce(array_length(p_cambios, 1), 0) / 2 loop
    select count(*) into v_hay from regexp_matches(v_def, p_cambios[2 * i - 1], 'g');
    if v_hay <> 1 then
      raise exception '%: se esperaba 1 aparición de «%» y hay %. La función cambió en la base: revisar antes de pegar.',
        p_firma, p_cambios[2 * i - 1], v_hay;
    end if;
    v_def := regexp_replace(v_def, p_cambios[2 * i - 1], p_cambios[2 * i]);
  end loop;
  if position(p_marca in v_def) = 0 then
    raise exception '%: el parche no dejó su marca «%».', p_firma, p_marca;
  end if;
  v_auth := has_function_privilege('authenticated', v_vieja, 'execute');
  execute v_def;
  if p_firma_nueva is not null then
    execute 'drop function ' || p_firma;
    execute format('revoke all on function %s from public, anon', p_firma_nueva);
    if v_auth then
      execute format('grant execute on function %s to authenticated', p_firma_nueva);
    else
      execute format('revoke all on function %s from authenticated', p_firma_nueva);
    end if;
  end if;
end $f$;

do $do$
begin
  -- ---- Situación 19 · el cierre pide «¿A qué banco?» ----
  perform pg_temp.reescribir('retail.cerrar_caja(uuid,numeric,numeric,text,text)', 'retail.cerrar_caja(uuid,numeric,numeric,text,text,uuid)',
    'p_traslado_cuenta_id', array[
      pg_temp.lit($q$p_traslado_referencia text DEFAULT NULL::text)$q$),
      $q$p_traslado_referencia text DEFAULT NULL::text, p_traslado_cuenta_id uuid DEFAULT NULL::uuid)$q$,
      pg_temp.lit($q$insert into caja_traslados (caja_id, destino, monto, referencia, registrado_por)$q$),
      $q$insert into caja_traslados (caja_id, destino, monto, referencia, registrado_por, cuenta_dinero_id)$q$,
      pg_temp.lit($q$nullif(btrim(p_traslado_referencia), ''), v_persona)$q$),
      $q$nullif(btrim(p_traslado_referencia), ''), v_persona, case when p_traslado_destino = 'banco' then p_traslado_cuenta_id end)$q$
    ]);

  -- ---- Situación 9 · devolución a una clienta: «Sale de» ----
  perform pg_temp.reescribir('retail.aprobar_devolucion(uuid,numeric,text)', 'retail.aprobar_devolucion(uuid,numeric,text,uuid)',
    'p_reembolso_cuenta_id', array[
      pg_temp.lit($q$p_reembolso_metodo text DEFAULT NULL::text)$q$),
      $q$p_reembolso_metodo text DEFAULT NULL::text, p_reembolso_cuenta_id uuid DEFAULT NULL::uuid)$q$,
      pg_temp.lit($q$reembolso_metodo = p_reembolso_metodo,$q$),
      $q$reembolso_metodo = p_reembolso_metodo, reembolso_cuenta_id = case when coalesce(p_reembolso_monto, 0) > 0 and p_reembolso_metodo <> 'efectivo' then p_reembolso_cuenta_id end,$q$
    ]);

  -- ---- Situación 10 · devolución del adelanto de un apartado: «Sale de» ----
  perform pg_temp.reescribir('retail.registrar_devolucion_separacion(uuid,text,text,text)', 'retail.registrar_devolucion_separacion(uuid,text,text,text,uuid)',
    'p_cuenta_id', array[
      pg_temp.lit($q$p_cci text DEFAULT NULL::text)$q$),
      $q$p_cci text DEFAULT NULL::text, p_cuenta_id uuid DEFAULT NULL::uuid)$q$,
      pg_temp.lit($q$devolucion_medio_real = p_medio,$q$),
      $q$devolucion_medio_real = p_medio, devolucion_cuenta_id = case when p_medio <> 'efectivo' then p_cuenta_id end,$q$
    ]);

  -- ---- Situación 6 · el proveedor devuelve plata: «Entra a» ----
  perform pg_temp.reescribir('retail.fn_insertar_reembolso_proveedor(uuid,numeric,text,text,date,text,uuid,uuid)',
    'retail.fn_insertar_reembolso_proveedor(uuid,numeric,text,text,date,text,uuid,uuid,uuid)',
    'p_cuenta_id', array[
      pg_temp.lit($q$p_nota_credito_id uuid DEFAULT NULL::uuid)$q$),
      $q$p_nota_credito_id uuid DEFAULT NULL::uuid, p_cuenta_id uuid DEFAULT NULL::uuid)$q$,
      pg_temp.lit($q$usuario_id, nota_credito_id)$q$),
      $q$usuario_id, nota_credito_id, cuenta_dinero_id)$q$,
      pg_temp.lit($q$p_persona, p_nota_credito_id)$q$),
      $q$p_persona, p_nota_credito_id, p_cuenta_id)$q$
    ]);
  perform pg_temp.reescribir('retail.registrar_reembolso_proveedor(uuid,numeric,text,text,date,text)',
    'retail.registrar_reembolso_proveedor(uuid,numeric,text,text,date,text,uuid)',
    'p_cuenta_id', array[
      pg_temp.lit($q$p_nota text DEFAULT NULL::text)$q$),
      $q$p_nota text DEFAULT NULL::text, p_cuenta_id uuid DEFAULT NULL::uuid)$q$,
      pg_temp.lit($q$v_persona, null)$q$),
      $q$v_persona, null, p_cuenta_id)$q$
    ]);
  perform pg_temp.reescribir('retail.registrar_nota_credito_compra(uuid,text,date,numeric,text,text,uuid,text,text,date,text)',
    'retail.registrar_nota_credito_compra(uuid,text,date,numeric,text,text,uuid,text,text,date,text,uuid)',
    'p_reembolso_cuenta_id', array[
      pg_temp.lit($q$p_reembolso_referencia text DEFAULT NULL::text)$q$),
      $q$p_reembolso_referencia text DEFAULT NULL::text, p_reembolso_cuenta_id uuid DEFAULT NULL::uuid)$q$,
      pg_temp.lit($q$v_fecha, null, v_persona, v_id)$q$),
      $q$v_fecha, null, v_persona, v_id, p_reembolso_cuenta_id)$q$
    ]);

  -- ---- Situación 13 · gastos y activos: «Salió de» ----
  -- El paso compartido: del cajón, la plata sale de su caja abierta (la misma regla de siempre); de la caja fuerte o de
  -- lo que tiene el líder, en efectivo y sin egreso. El pago de la factura lleva la cuenta y, del cajón, su egreso.
  perform pg_temp.reescribir('retail.fn_comprobante_y_pago(text,uuid,date,numeric,text,jsonb,text,uuid,uuid,text,text,uuid)',
    'retail.fn_comprobante_y_pago(text,uuid,date,numeric,text,jsonb,text,uuid,uuid,text,text,uuid,uuid)',
    'p_cuenta_id', array[
      pg_temp.lit($q$p_actor uuid, OUT o_compra_id uuid$q$),
      $q$p_actor uuid, p_cuenta_id uuid DEFAULT NULL::uuid, OUT o_compra_id uuid$q$,
      '(' || pg_temp.lit($q$v_ubic_caja uuid;$q$) || ')',
      E'\\1\n  v_cta_tipo text;\n  v_cta_ubic uuid;',
      '(' || pg_temp.lit($q$if p_medio_pago = 'efectivo' then$q$) || ')',
      $q$-- ADR-0195 F3b: «Salió de». Del cajón, la plata sale de su caja abierta; de la caja fuerte o de lo que tiene el
  -- líder, en efectivo y sin egreso de caja (la cuenta lo dice).
  if p_cuenta_id is not null then
    select c.tipo, c.ubicacion_id into v_cta_tipo, v_cta_ubic from retail.cuentas_dinero c where c.id = p_cuenta_id;
    if v_cta_tipo = 'cajon' and p_caja_id is null and p_caja_movimiento_id is null then
      select k.id into p_caja_id from retail.cajas k where k.ubicacion_id = v_cta_ubic and k.estado = 'abierta' order by k.abierta_en desc limit 1;
      if p_caja_id is null then
        raise exception 'La caja de esa tienda no está abierta: ábrela para que salga del cajón, o elige de dónde salió.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  if p_medio_pago = 'efectivo' and coalesce(v_cta_tipo, 'cajon') = 'cajon' then$q$,
      pg_temp.lit($q$insert into retail.compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, ubicacion_id)$q$),
      $q$insert into retail.compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, ubicacion_id, cuenta_dinero_id, caja_movimiento_id)$q$,
      pg_temp.lit($q$p_actor, p_ubicacion_id);$q$),
      $q$p_actor, p_ubicacion_id, case when coalesce(v_cta_tipo, 'cajon') = 'cajon' and o_caja_movimiento_id is not null then null else p_cuenta_id end,
              case when p_medio_pago = 'efectivo' then o_caja_movimiento_id end);$q$
    ]);
  perform pg_temp.reescribir('retail.registrar_gasto(uuid,text,text,date,numeric,jsonb,text,uuid,uuid,text,uuid,uuid)',
    'retail.registrar_gasto(uuid,text,text,date,numeric,jsonb,text,uuid,uuid,text,uuid,uuid,uuid)',
    'p_cuenta_id', array[
      pg_temp.lit($q$p_gasto_fijo_id uuid DEFAULT NULL::uuid)$q$),
      $q$p_gasto_fijo_id uuid DEFAULT NULL::uuid, p_cuenta_id uuid DEFAULT NULL::uuid)$q$,
      pg_temp.lit($q$trim(p_descripcion), v_actor);$q$),
      $q$trim(p_descripcion), v_actor, p_cuenta_id);$q$,
      pg_temp.lit($q$registrado_por, token_cliente, gasto_fijo_id)$q$),
      $q$registrado_por, token_cliente, gasto_fijo_id, cuenta_dinero_id)$q$,
      pg_temp.lit($q$v_actor, p_token, p_gasto_fijo_id)$q$),
      $q$v_actor, p_token, p_gasto_fijo_id, case when v_pago.o_compra_id is null and v_pago.o_caja_movimiento_id is null then p_cuenta_id end)$q$
    ]);
  perform pg_temp.reescribir('retail.registrar_activo(uuid,text,text,date,numeric,jsonb,text,uuid,uuid,text,integer,text,uuid)',
    'retail.registrar_activo(uuid,text,text,date,numeric,jsonb,text,uuid,uuid,text,integer,text,uuid,uuid)',
    'p_cuenta_id', array[
      pg_temp.lit($q$p_token uuid DEFAULT NULL::uuid)$q$),
      $q$p_token uuid DEFAULT NULL::uuid, p_cuenta_id uuid DEFAULT NULL::uuid)$q$,
      pg_temp.lit($q$trim(p_nombre), v_actor);$q$),
      $q$trim(p_nombre), v_actor, p_cuenta_id);$q$,
      pg_temp.lit($q$registrado_por, token_cliente)$q$),
      $q$registrado_por, token_cliente, cuenta_dinero_id)$q$,
      pg_temp.lit($q$v_pago.o_caja_movimiento_id, v_actor, p_token)$q$),
      $q$v_pago.o_caja_movimiento_id, v_actor, p_token, case when v_pago.o_compra_id is null and v_pago.o_caja_movimiento_id is null then p_cuenta_id end)$q$
    ]);

  -- ---- Situación 11 · pagos de Compras y Por pagar: «Sale de» (cada medio trae su `cuenta_id`) ----
  perform pg_temp.reescribir('retail.registrar_compra(uuid,text,text,text,uuid,jsonb,text,date,date,numeric,jsonb,text,numeric,uuid,date)', null,
    'cuenta_dinero_id', array[
      pg_temp.lit($q$insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, ubicacion_id)$q$),
      $q$insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, ubicacion_id, cuenta_dinero_id)$q$,
      pg_temp.lit($q$then null else p_ubicacion_destino_id end$q$),
      $q$then null else p_ubicacion_destino_id end, nullif(v_pago ->> 'cuenta_id', '')::uuid$q$
    ]);
  perform pg_temp.reescribir('retail.registrar_pagos_compra(uuid,jsonb,date,uuid,uuid)', null,
    'cuenta_dinero_id', array[
      pg_temp.lit($q$usuario_id, pago_grupo_id, ubicacion_id)$q$),
      $q$usuario_id, pago_grupo_id, ubicacion_id, cuenta_dinero_id)$q$,
      pg_temp.lit($q$v_persona, p_token, p_ubicacion_id)$q$),
      $q$v_persona, p_token, p_ubicacion_id, nullif(v_pago ->> 'cuenta_id', '')::uuid)$q$
    ]);
  perform pg_temp.reescribir('retail.registrar_pago_compras_medios(uuid,jsonb,jsonb,date,uuid,numeric,uuid)', null,
    'v_med_cuentas', array[
      '(' || pg_temp.lit($q$v_med_refs text[] := '{}';$q$) || ')',
      E'\\1\n  v_med_cuentas uuid[] := ''{}'';',
      '(' || pg_temp.lit($q$v_med_suma := v_med_suma + v_monto;$q$) || ')',
      E'v_med_cuentas := v_med_cuentas || nullif(v_med ->> ''cuenta_id'', '''')::uuid;\n      \\1',
      pg_temp.lit($q$pago_grupo_id, ubicacion_id) values (v_compra_ids[v_i], v_fecha, v_tomar, v_med_metodos[v_k], nullif(v_med_refs[v_k], ''), v_persona, v_grupo, p_ubicacion_id)$q$),
      $q$pago_grupo_id, ubicacion_id, cuenta_dinero_id)
        values (v_compra_ids[v_i], v_fecha, v_tomar, v_med_metodos[v_k], nullif(v_med_refs[v_k], ''), v_persona, v_grupo, p_ubicacion_id, v_med_cuentas[v_k])$q$
    ]);

  -- ---- Situación 12 · pagos de Producción: «Sale de» ----
  perform pg_temp.reescribir('retail.registrar_comprobante_produccion(uuid,text,text,text,jsonb,text,date,date,numeric,jsonb,text,numeric,uuid)', null,
    'cuenta_dinero_id', array[
      pg_temp.lit($q$insert into retail.comprobantes_produccion_pagos (comprobante_id, fecha, monto, metodo, referencia, usuario_id)$q$),
      $q$insert into retail.comprobantes_produccion_pagos (comprobante_id, fecha, monto, metodo, referencia, usuario_id, cuenta_dinero_id)$q$,
      pg_temp.lit($q$nullif(btrim(coalesce(v_pago ->> 'referencia', '')), ''), v_persona);$q$),
      $q$nullif(btrim(coalesce(v_pago ->> 'referencia', '')), ''), v_persona, nullif(v_pago ->> 'cuenta_id', '')::uuid);$q$
    ]);
  perform pg_temp.reescribir('retail.registrar_pago_comprobante_produccion(uuid,jsonb,date,uuid)', null,
    'cuenta_dinero_id', array[
      pg_temp.lit($q$referencia, usuario_id, grupo_id)$q$),
      $q$referencia, usuario_id, grupo_id, cuenta_dinero_id)$q$,
      pg_temp.lit($q$v_persona, v_grupo);$q$),
      $q$v_persona, v_grupo, nullif(v_pago ->> 'cuenta_id', '')::uuid);$q$
    ]);

  -- ---- Un egreso respalda UNA sola cosa: ahora también un pago a un proveedor ----
  perform pg_temp.reescribir('retail.fn_egreso_ya_usado(uuid,text)', null, 'retail.compra_pagos', array[
    '(' || pg_temp.lit($q$d.estado = 'vigente') then 'movimiento'$q$) || ')',
    E'\\1\n    when p_salvo is distinct from ''pago'' and (exists (select 1 from retail.compra_pagos cp where cp.caja_movimiento_id = p_caja_movimiento_id)\n                                             or exists (select 1 from retail.comprobantes_produccion_pagos pp where pp.caja_movimiento_id = p_caja_movimiento_id)) then ''pago'''
  ]);
  -- El gasto o activo con factura pagado del cajón comparte el egreso con el pago de SU factura (una sola salida de
  -- plata); cualquier otro pago lo bloquea.
  perform pg_temp.reescribir('retail.fn_gastos_validar()', null, 'el pago a un proveedor', array[
    '(' || pg_temp.lit($q$v_usado := retail.fn_egreso_ya_usado(new.caja_movimiento_id, 'gasto');$q$) || ')',
    E'\\1\n    if v_usado = ''pago'' and not exists (select 1 from retail.comprobantes_produccion_pagos pp where pp.caja_movimiento_id = new.caja_movimiento_id)\n       and exists (select 1 from retail.compra_pagos cp where cp.caja_movimiento_id = new.caja_movimiento_id and cp.compra_id = new.compra_id) then\n      v_usado := null;\n    elsif v_usado = ''pago'' then\n      raise exception ''Ese egreso ya es el pago a un proveedor.'' using errcode = ''P0001'';\n    end if;'
  ]);
  perform pg_temp.reescribir('retail.fn_activos_validar()', null, 'el pago a un proveedor', array[
    '(' || pg_temp.lit($q$v_usado := retail.fn_egreso_ya_usado(new.caja_movimiento_id, 'activo');$q$) || ')',
    E'\\1\n    if v_usado = ''pago'' and not exists (select 1 from retail.comprobantes_produccion_pagos pp where pp.caja_movimiento_id = new.caja_movimiento_id)\n       and exists (select 1 from retail.compra_pagos cp where cp.caja_movimiento_id = new.caja_movimiento_id and cp.compra_id = new.compra_id) then\n      v_usado := null;\n    elsif v_usado = ''pago'' then\n      raise exception ''Ese egreso ya es el pago a un proveedor.'' using errcode = ''P0001'';\n    end if;'
  ]);
  perform pg_temp.reescribir('retail.fn_egresos_no_gasto_validar()', null, 'el pago a un proveedor', array[
    '(' || pg_temp.lit($q$v_usado := retail.fn_egreso_ya_usado(new.caja_movimiento_id, 'no_gasto');$q$) || ')',
    E'\\1\n  if v_usado = ''pago'' then\n    raise exception ''Ese egreso ya es el pago a un proveedor: no se marca.'' using errcode = ''P0001'';\n  end if;'
  ]);
  perform pg_temp.reescribir('retail.fn_movimientos_dinero_validar()', null, 'el pago a un proveedor', array[
    pg_temp.lit($q$when 'movimiento' then 'ya es un depósito o retiro'$q$),
    $q$when 'movimiento' then 'ya es un depósito o retiro' when 'pago' then 'es el pago a un proveedor'$q$
  ]);
end $do$;

-- ---------- El libro de saldos: la cuenta sellada primero, la asignada después, y la deducción solo si faltan las dos ----------
-- USO INTERNO (sin permiso para nadie): lo leen las sumas de saldos y la conciliación, que ya piden su permiso.
-- El CAJÓN no está aquí: su saldo lo dice la caja (lo que sale o entra de un cajón ya es un movimiento de caja).
create or replace function retail.fn_dinero_libro(p_hasta date)
returns table (cuenta_id uuid, fecha date, monto numeric, clave text, detalle text, ubicacion_id uuid, origen text)
language sql stable set search_path = retail, public, extensions as $$
  with tarjeta as (
    -- Deducción para lo viejo pagado «con tarjeta»: la primera tarjeta de crédito activa.
    select c.id from retail.cuentas_dinero c where c.tipo = 'tarjeta_credito' and c.archivada_en is null order by c.orden, c.created_at limit 1
  ),
  asignadas as (
    select a.origen, a.origen_id, a.cuenta_id from retail.cuentas_asignadas a
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
    select coalesce(t.cuenta_dinero_id,
             case t.destino
               when 'caja_fuerte' then (select f.id from retail.cuentas_dinero f where f.tipo = 'caja_fuerte' and f.ubicacion_id = k.ubicacion_id)
               when 'lider' then (select r.id from retail.cuentas_dinero r where r.tipo = 'por_rendir')
               else coalesce((select x.cuenta_id from asignadas x where x.origen = 'traslado' and x.origen_id = t.id),
                             retail.fn_cuenta_de_cobro(k.ubicacion_id, 'transferencia', (t.creado_en at time zone 'America/Lima')::date))
             end) as cuenta_id,
           (t.creado_en at time zone 'America/Lima')::date as fecha, t.monto::numeric as monto, 'traslado:' || t.id::text as clave,
           'Cierre de caja · ' || u.nombre || case t.destino when 'caja_fuerte' then ' → caja fuerte' when 'lider' then ' → entregado al líder' else ' → depósito' end
             || coalesce(' · ' || t.referencia, '') as detalle,
           k.ubicacion_id, 'traslado'::text as origen
      from retail.caja_traslados t join retail.cajas k on k.id = t.caja_id join retail.ubicaciones u on u.id = k.ubicacion_id
     where not k.es_prueba and (t.creado_en at time zone 'America/Lima')::date <= p_hasta
  ),
  cobros_base as (
    select v.ubicacion_id, (v.created_at at time zone 'America/Lima')::date as fecha, vp.metodo as medio, vp.monto::numeric as monto,
           vp.cuenta_dinero_id as sellada
      from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id
     where v.estado = 'completada' and not v.es_prueba and vp.metodo in ('yape', 'plin', 'tarjeta', 'transferencia')
    union all
    select s.ubicacion_id, (sp.created_at at time zone 'America/Lima')::date, sp.metodo, sp.monto, sp.cuenta_dinero_id
      from retail.separacion_pagos sp join retail.separaciones s on s.id = sp.separacion_id
     where sp.metodo in ('yape', 'plin', 'tarjeta', 'transferencia')
    union all
    -- La diferencia de un cambio ya trae el signo (la clienta paga + / se le devuelve −).
    select cb.ubicacion_id, (cb.created_at at time zone 'America/Lima')::date, cb.metodo_pago_diferencia, cb.diferencia, cb.cuenta_dinero_id
      from retail.cambios cb
     where cb.metodo_pago_diferencia in ('yape', 'plin', 'tarjeta', 'transferencia') and cb.diferencia <> 0
    union all
    select dv.ubicacion_id, (dv.aprobado_en at time zone 'America/Lima')::date, dv.reembolso_metodo, -dv.reembolso_monto, dv.reembolso_cuenta_id
      from retail.devoluciones dv
     where dv.estado = 'aprobada' and dv.reembolso_metodo in ('yape', 'plin', 'tarjeta', 'transferencia') and coalesce(dv.reembolso_monto, 0) > 0
    union all
    -- F3b: el adelanto devuelto de un apartado (situación 10).
    select s.ubicacion_id, (s.devuelta_en at time zone 'America/Lima')::date, s.devolucion_medio_real, -s.adelanto, s.devolucion_cuenta_id
      from retail.separaciones s
     where s.estado = 'devuelta' and s.devuelta_en is not null and s.devolucion_medio_real in ('yape', 'plin', 'tarjeta', 'transferencia')
       and coalesce(s.adelanto, 0) > 0
  ),
  cobros as (
    -- Los cobros de un día con un medio en una tienda van en UNA línea por cuenta: así llegan al banco (el lote del Yape).
    select c.cuenta_id, c.fecha, sum(c.monto) as monto,
           'cobros:' || c.fecha::text || ':' || c.ubicacion_id::text || ':' || c.medio as clave,
           'Cobros con ' || case c.medio when 'yape' then 'Yape' when 'plin' then 'Plin' else c.medio end || ' · ' || u.nombre as detalle,
           c.ubicacion_id, 'cobros'::text as origen
      from (select b.ubicacion_id, b.fecha, b.medio, b.monto,
                   coalesce(b.sellada, retail.fn_cuenta_de_cobro(b.ubicacion_id, b.medio, b.fecha)) as cuenta_id
              from cobros_base b where b.fecha <= p_hasta) c
      join retail.ubicaciones u on u.id = c.ubicacion_id
     group by c.ubicacion_id, c.fecha, c.medio, u.nombre, c.cuenta_id
    having sum(c.monto) <> 0
  ),
  pagos as (
    -- Pagos de comprobantes de proveedor (mercadería, gasto o activo).
    select coalesce(cp.cuenta_dinero_id,
                    (select x.cuenta_id from asignadas x where x.origen = 'pago' and x.origen_id = cp.id),
                    case
                      when cp.metodo = 'tarjeta' then (select id from tarjeta)
                      when cp.metodo in ('yape', 'plin') then retail.fn_cuenta_de_cobro(cp.ubicacion_id, cp.metodo, cp.fecha)
                      when cp.metodo in ('transferencia', 'deposito', 'otro') then retail.fn_cuenta_de_cobro(cp.ubicacion_id, 'transferencia', cp.fecha)
                    end) as cuenta_id,
           cp.fecha, -cp.monto::numeric as monto, 'pago:' || cp.id::text as clave,
           'Pago a ' || pr.nombre || ' · ' || c.serie || '-' || c.numero as detalle, cp.ubicacion_id, 'pago'::text as origen
      from retail.compra_pagos cp
      join retail.compras c on c.id = cp.compra_id
      join retail.proveedores pr on pr.id = c.proveedor_id
     where cp.metodo <> 'saldo_a_favor' and cp.fecha <= p_hasta
       -- Lo viejo pagado del cajón con un gasto o activo (antes de F3b el pago no guardaba su cuenta): ya está en la caja.
       and not (cp.cuenta_dinero_id is null and cp.metodo = 'efectivo' and (
             exists (select 1 from retail.gastos g where g.compra_id = c.id and g.caja_movimiento_id is not null and g.estado = 'vigente')
          or exists (select 1 from retail.activos_fijos a where a.compra_id = c.id and a.caja_movimiento_id is not null and a.estado <> 'anulado')))
    union all
    -- F3b: pagos a proveedores del Taller (situación 12).
    select coalesce(pp.cuenta_dinero_id, (select x.cuenta_id from asignadas x where x.origen = 'pagoprod' and x.origen_id = pp.id)),
           pp.fecha, -pp.monto::numeric, 'pagoprod:' || pp.id::text,
           'Pago del Taller a ' || prp.nombre || ' · ' || co.serie || '-' || co.numero, null::uuid, 'pago'
      from retail.comprobantes_produccion_pagos pp
      join retail.comprobantes_produccion co on co.id = pp.comprobante_id
      join retail.proveedores_produccion prp on prp.id = co.proveedor_id
     where pp.fecha <= p_hasta
    union all
    -- F3b: un proveedor devuelve plata (situación 6).
    select coalesce(pc.cuenta_dinero_id, (select x.cuenta_id from asignadas x where x.origen = 'reembolso' and x.origen_id = pc.id)),
           pc.fecha, pc.monto::numeric, 'reembolso:' || pc.id::text,
           'Reembolso de ' || pv.nombre || coalesce(' · ' || pc.referencia, ''), null::uuid, 'reembolso'
      from retail.proveedor_creditos pc join retail.proveedores pv on pv.id = pc.proveedor_id
     where pc.tipo = 'reembolso' and pc.fecha <= p_hasta
    union all
    -- Gastos sin comprobante pagados sin cajón. La comisión del POS no: esa plata ya la descontó el abono.
    select coalesce(g.cuenta_dinero_id,
                    (select x.cuenta_id from asignadas x where x.origen = 'gasto' and x.origen_id = g.id),
                    case
                      when g.medio_pago = 'efectivo' then null
                      when g.medio_pago = 'tarjeta' then (select id from tarjeta)
                      when g.medio_pago in ('yape', 'plin') then retail.fn_cuenta_de_cobro(g.ubicacion_id, g.medio_pago, g.fecha)
                      else retail.fn_cuenta_de_cobro(g.ubicacion_id, 'transferencia', g.fecha)
                    end),
           g.fecha, -g.monto_total, 'gasto:' || g.id::text, 'Gasto · ' || g.descripcion, g.ubicacion_id, 'gasto'
      from retail.gastos g
     where g.compra_id is null and g.estado = 'vigente' and g.caja_movimiento_id is null and g.fecha <= p_hasta
       and not exists (select 1 from retail.movimientos_dinero d where d.gasto_comision_id = g.id)
    union all
    select coalesce(a.cuenta_dinero_id,
                    (select x.cuenta_id from asignadas x where x.origen = 'activo' and x.origen_id = a.id),
                    case
                      when a.medio_pago = 'efectivo' then null
                      when a.medio_pago = 'tarjeta' then (select id from tarjeta)
                      when a.medio_pago in ('yape', 'plin') then retail.fn_cuenta_de_cobro(a.ubicacion_id, a.medio_pago, a.fecha_adquisicion)
                      else retail.fn_cuenta_de_cobro(a.ubicacion_id, 'transferencia', a.fecha_adquisicion)
                    end),
           a.fecha_adquisicion, -a.costo, 'activo:' || a.id::text, 'Activo · ' || a.nombre, a.ubicacion_id, 'activo'
      from retail.activos_fijos a
     where a.compra_id is null and a.estado <> 'anulado' and a.medio_pago is not null and a.caja_movimiento_id is null
       and a.fecha_adquisicion <= p_hasta
  ),
  todo as (
    select * from movs
    union all select * from traslados
    union all select * from cobros
    union all select * from pagos
  )
  select t.* from todo t
   where t.cuenta_id is null
      or not exists (select 1 from retail.cuentas_dinero c where c.id = t.cuenta_id and c.tipo = 'cajon');
$$;
comment on function retail.fn_dinero_libro(date) is
  'USO INTERNO. Cada entrada y salida de plata hasta una fecha, con la cuenta que tocó: la sellada (F3b), si no la asignada después, y si no la deducida de su medio y tienda (lo viejo). Nula = sin cuenta. El cajón no está: lo dice la caja.';
revoke all on function retail.fn_dinero_libro(date) from public, anon, authenticated;

reset lock_timeout;
