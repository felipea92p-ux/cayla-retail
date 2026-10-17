-- ============================================================================
-- 20261016002000_pago_planilla_y_sunat.sql — CAYLA V2 (ADR-0417, Fase 1; situaciones 15 y 16 del plan de Finanzas §7 bis)
--
-- EL PROBLEMA PRIMERO. Dos deudas suben cada mes y nunca bajan. La planilla entra al diario cuando Dynamic la marca pagada
-- (62 Sueldos | 41 Remuneraciones por pagar), pero la salida del banco nunca se registra: la 41 crece para siempre. El IGV
-- sube con cada venta (4011) y baja con cada factura de compra, pero el pago a SUNAT no existe como movimiento: la 4011
-- acumula lo ya pagado. El Balance dice que CAYLA debe más de lo real, y «¿me alcanza?» no ve dos salidas grandes del banco.
--
-- CONTRATO (Liskov)
--   PROMETE: dos tipos nuevos de `movimientos_dinero`, `pago_planilla` y `pago_sunat`: salen de un BANCO y no van a ninguna
--            cuenta de dinero; lo que baja es la deuda. El Diario los asienta 41 | 104 y 4011 | 104 (`fn_asientos_dinero_y_caja`),
--            así que el Balance, Cuentas y dinero (el libro del banco), el Flujo real y el Cierre los ven solos. Se registran
--            con `registrar_movimiento_dinero` (mismo doble-clic seguro, misma firma del responsable) y se anulan con
--            `anular_movimiento_dinero`. Son de la empresa (`ubicacion_id` nulo), nunca de una tienda.
--   ASUME:   solo el líder los registra (la regla de siempre: quien no es líder solo deposita de su tienda). El pago a SUNAT
--            es el del IGV: el 1 % de renta a cuenta se registra como gasto de la categoría «tributos» (cuenta 64), como hoy.
--   FALLA:   `P0001` si lleva destino, comisión, egreso de caja, o si no sale de un banco; `42501` sin ser líder.
--   NO HACE: no toca Dynamic (quién paga y cuándo sigue allá); no baja la 41 por persona ni por sede; no concilia nada.
--
-- CÓMO. Reemplazos anclados sobre las funciones VIVAS (`pg_temp.reemplazar`, el patrón de 20261014145000): cada uno aborta
-- sin cambiar nada si el texto que espera no está exactamente una vez. Las anclas son texto de la migración ORIGINAL
-- (20260925110000 y 20260925170000), no de un parche posterior, para que funcione tanto si los parches de octubre ya se
-- pegaron como si no. Las restricciones de `movimientos_dinero` se reescriben enteras con TODOS los tipos (son `check`, no
-- funciones). Idempotente: pegarla dos veces no cambia nada.
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

-- ---------- 1. Los dos tipos nuevos ----------
alter table retail.movimientos_dinero
  drop constraint if exists movimientos_dinero_tipo_check,
  add constraint movimientos_dinero_tipo_check check (tipo in (
    'aporte', 'prestamo', 'retiro', 'devolucion_prestamo', 'deposito', 'abono_tarjeta', 'pago_tarjeta', 'entre_cuentas',
    'entrega_fondo', 'devolucion_fondo', 'faltante_fondo_asumido', 'faltante_fondo_deuda', 'pago_deuda_fondo',
    'pago_planilla', 'pago_sunat')),
  -- Como un retiro: sale de una cuenta y no llega a ninguna (lo que baja es una deuda, que lleva el Diario).
  drop constraint if exists movimientos_dinero_puntas,
  add constraint movimientos_dinero_puntas check (
    case
      when tipo in ('aporte', 'prestamo', 'pago_deuda_fondo') then cuenta_origen_id is null and cuenta_destino_id is not null
      when tipo in ('retiro', 'devolucion_prestamo', 'faltante_fondo_asumido', 'faltante_fondo_deuda', 'pago_planilla', 'pago_sunat') then
        cuenta_origen_id is not null and cuenta_destino_id is null
      else cuenta_origen_id is not null and cuenta_destino_id is not null and cuenta_origen_id <> cuenta_destino_id
    end);

-- ---------- 2. El candado: de un banco, sin destino, sin comisión, sin caja; de la empresa ----------
select pg_temp.reemplazar('retail.fn_movimientos_dinero_validar()',
$v$  -- Qué va en cada punta.$v$,
$n$  -- ADR-0417 (situaciones 15 y 16): el pago de la planilla y el pago a SUNAT salen de un banco y no van a ninguna cuenta de
  -- dinero; lo que baja es una deuda (41 · 4011), que lleva el Diario. Son de la empresa, no de una tienda.
  if new.tipo in ('pago_planilla', 'pago_sunat') then
    if new.cuenta_destino_id is not null or coalesce(v_o.tipo, '') <> 'banco' or new.caja_movimiento_id is not null
       or coalesce(new.comision, 0) <> 0 then
      raise exception 'El pago de la planilla y el pago a SUNAT salen de un banco, sin destino, sin comisión y sin caja.' using errcode = 'P0001';
    end if;
    new.ubicacion_id := null;
    return new;
  end if;

  -- Qué va en cada punta.$n$,
1);

-- ---------- 3. La puerta: registrar_movimiento_dinero los acepta (solo el líder, como todo lo que no es un depósito) ----------
select pg_temp.reemplazar('retail.registrar_movimiento_dinero(text, numeric, uuid, uuid, date, text, numeric, uuid, uuid, uuid)',
$v$'abono_tarjeta', 'pago_tarjeta', 'entre_cuentas') then$v$,
$n$'abono_tarjeta', 'pago_tarjeta', 'entre_cuentas', 'pago_planilla', 'pago_sunat') then$n$,
1);

-- ---------- 4. Cómo se llaman ----------
select pg_temp.reemplazar('retail.fn_texto_movimiento_dinero(text)',
$v$    when 'entre_cuentas' then 'Entre cuentas'$v$,
$n$    when 'entre_cuentas' then 'Entre cuentas'
    when 'pago_planilla' then 'Pago de la planilla'
    when 'pago_sunat' then 'Pago a SUNAT (IGV)'$n$,
1);

-- ---------- 5. El Diario: lo que baja es la deuda (el debe); el haber sigue siendo el banco de donde salió ----------
-- El ancla es el ARRANQUE del `case` del debe (lo que otras migraciones agregaron después de él no importa).
select pg_temp.reemplazar('retail.fn_asientos_dinero_y_caja(date, date, boolean, uuid[])',
$v$case md.tipo when 'retiro' then '591'$v$,
$n$case md.tipo when 'pago_planilla' then '41' when 'pago_sunat' then '4011' when 'retiro' then '591'$n$,
1);

-- ---------- 6. Que quedó como se prometió ----------
do $$
begin
  if position('''pago_sunat''' in pg_get_constraintdef((select oid from pg_constraint where conname = 'movimientos_dinero_tipo_check'))) = 0 then
    raise exception 'ADR-0417: movimientos_dinero no acepta pago_sunat';
  end if;
  if position('pago_planilla' in pg_get_functiondef('retail.fn_movimientos_dinero_validar()'::regprocedure)) = 0
     or position('pago_planilla' in pg_get_functiondef('retail.registrar_movimiento_dinero(text, numeric, uuid, uuid, date, text, numeric, uuid, uuid, uuid)'::regprocedure)) = 0
     or position('''41''' in pg_get_functiondef('retail.fn_asientos_dinero_y_caja(date, date, boolean, uuid[])'::regprocedure)) = 0 then
    raise exception 'ADR-0417: alguna función no quedó con el pago de planilla';
  end if;
end $$;
