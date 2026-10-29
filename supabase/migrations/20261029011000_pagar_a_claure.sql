-- ============================================================================
-- 20261029011000 — Pagar a CLAURE: el pago a Claudia sale de un banco de CAYLA y baja lo que se le debe
-- (ADR-0560; actividad 2 de 9)
--
-- EL PROBLEMA PRIMERO. La actividad 1 dice cuánto se le debe a Claudia (`fn_claure_cuenta`), pero nada registra que ya se le pagó:
-- el saldo solo subiría. Felipe (2026-10-28): el pago se registra desde Finanzas y desde el cierre de caja, puede ser parcial, dice de qué
-- banco salió y su n.º de operación, y baja el saldo. Es la misma plata que sale de un banco de CAYLA para pagar una deuda: el mismo
-- camino que el pago de la planilla y el pago a SUNAT (ADR-0417), con un tipo más.
--
-- CONTRATO (Liskov)
--   PROMETE: un tipo nuevo de `movimientos_dinero`, `pago_claure`: sale de un BANCO, no va a ninguna cuenta de dinero, sin comisión ni
--            caja, y es de la empresa (`ubicacion_id` nulo). Lo que baja es la deuda con CLAURE: el Diario lo asienta 479 | 104 (la 479,
--            «Otras cuentas por pagar — relacionadas», nace aquí como PROVISIONAL hasta el contador: cambiarla es cambiar una línea de
--            `fn_asientos_dinero_y_caja`, porque el Diario se arma al leer), así que el libro del banco, el Balance y el Cierre lo ven
--            solos. Se registra con `registrar_movimiento_dinero` (mismo doble-clic seguro, misma firma del responsable, mismo piso de
--            Finanzas) y se anula con `anular_movimiento_dinero`. `fn_claure_pagos()` lista los pagos vigentes a quien puede ver la cuenta con
--            CLAURE; el saldo es lo cobrado (actividad 1) menos esto, y nunca se guarda.
--   ASUME:   solo el líder lo registra (la regla de siempre para lo que sale de un banco). Pagar más de lo que se debe es posible a propósito:
--            el saldo queda a favor de CAYLA y se compensa en los siguientes cobros (decisión 19 de Felipe); la web lo avisa, la base no lo impide.
--   FALLA:   `P0001` si lleva destino, comisión, egreso de caja o no sale de un banco; `42501` sin ser líder.
--   NO HACE: no toca la cuenta de CLAURE (no existe ninguna); no reparte el pago por día ni por venta; no concilia nada. El Flujo real todavía
--            lo trata como «entre cuentas» (no lo cuenta ni como entrada ni como salida): decidir cómo cuenta CLAURE el Flujo es de la actividad 5.
--
-- CÓMO. Reemplazos anclados sobre las funciones VIVAS (`pg_temp.reemplazar`, el patrón de 20261016002000): cada uno aborta sin cambiar
-- nada si el texto que espera no está exactamente las veces que dice. Cada reemplazo va FUERA de los textos que ya guardan las migraciones y
-- pruebas del pago a SUNAT y del fondo (`pruebas:pago-planilla-y-sunat`, `pruebas:movimientos-dinero-inicio-y-empresa`): esas repegan sus
-- migraciones sobre la base ya migrada y abortan si su texto se parte («cambió desde que se escribió esta migración»). Por eso `pago_claure`
-- se suma al INICIO de la lista de tipos, antes de la regla de la caja, antes de `entre_cuentas` en los textos y antes de `pago_planilla` en
-- el Diario, y no junto a `pago_sunat`. Las dos restricciones de `movimientos_dinero` se reescriben enteras con todos los tipos (son `check`).
-- Un `alter table` con candado un instante (lock_timeout), sin políticas ni triggers nuevos. Idempotente: pegarla dos veces no cambia nada.
-- SE ROMPE SI: (1) alguna de las cuatro funciones cambió su texto desde que se escribió (aborta con el nombre de la función y no deja nada a
-- medias: todo va en una transacción); (2) hay un tipo de movimiento que esta lista de `check` no conoce (aquí están los de main al 2026-10-29).
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

-- ---------- 0. La cuenta contable de lo que se le debe (provisional hasta el contador) ----------
insert into retail.cuentas (codigo, nombre, tipo, seccion_resultados, orden)
values ('479', 'Otras cuentas por pagar — relacionadas (lo cobrado por CLAURE)', 'pasivo', null, 43)
on conflict (codigo) do nothing;

-- ---------- 1. El tipo nuevo, en las dos restricciones ----------
alter table retail.movimientos_dinero
  drop constraint if exists movimientos_dinero_tipo_check,
  add constraint movimientos_dinero_tipo_check check (tipo in (
    'aporte', 'prestamo', 'retiro', 'devolucion_prestamo', 'deposito', 'abono_tarjeta', 'pago_tarjeta', 'entre_cuentas',
    'entrega_fondo', 'devolucion_fondo', 'faltante_fondo_asumido', 'faltante_fondo_deuda', 'pago_deuda_fondo',
    'pago_planilla', 'pago_sunat', 'pago_claure')),
  -- Como un retiro: sale de una cuenta y no llega a ninguna (lo que baja es una deuda, que lleva el Diario).
  drop constraint if exists movimientos_dinero_puntas,
  add constraint movimientos_dinero_puntas check (
    case
      when tipo in ('aporte', 'prestamo', 'pago_deuda_fondo') then cuenta_origen_id is null and cuenta_destino_id is not null
      when tipo in ('retiro', 'devolucion_prestamo', 'faltante_fondo_asumido', 'faltante_fondo_deuda', 'pago_planilla', 'pago_sunat', 'pago_claure') then
        cuenta_origen_id is not null and cuenta_destino_id is null
      else cuenta_origen_id is not null and cuenta_destino_id is not null and cuenta_origen_id <> cuenta_destino_id
    end);

-- ---------- 2. El candado: de un banco, sin destino, sin comisión, sin caja; de la empresa ----------
-- Va antes de «Lo que sale de un cajón…»: las reglas generales de arriba no conocen este tipo (no lo rechazan), y sin este candado saldría
-- también de un cajón o de una máquina. El bloque de `pago_planilla` y `pago_sunat` sigue entero y con su única aparición.
select pg_temp.reemplazar('retail.fn_movimientos_dinero_validar()',
$v$  -- Lo que sale de un cajón es un egreso de caja:$v$,
$n$  -- ADR-0560: el pago a CLAURE sale de un banco y no va a ninguna cuenta de dinero; lo que baja es lo que se le debe (479). De la empresa.
  if new.tipo = 'pago_claure' then
    if new.cuenta_destino_id is not null or coalesce(v_o.tipo, '') <> 'banco' or new.caja_movimiento_id is not null
       or coalesce(new.comision, 0) <> 0 then
      raise exception 'El pago a CLAURE sale de un banco, sin destino, sin comisión y sin caja.' using errcode = 'P0001';
    end if;
    new.ubicacion_id := null;
    return new;
  end if;

  -- Lo que sale de un cajón es un egreso de caja:$n$,
1);

-- ---------- 3. La puerta: registrar_movimiento_dinero lo acepta (solo el líder, como todo lo que no es un depósito) ----------
select pg_temp.reemplazar('retail.registrar_movimiento_dinero(text, numeric, uuid, uuid, date, text, numeric, uuid, uuid, uuid)',
$v$p_tipo not in ('aporte', $v$,
$n$p_tipo not in ('pago_claure', 'aporte', $n$,
1);

-- ---------- 4. Cómo se llama ----------
select pg_temp.reemplazar('retail.fn_texto_movimiento_dinero(text)',
$v$    when 'entre_cuentas' then 'Entre cuentas'$v$,
$n$    when 'pago_claure' then 'Pago a CLAURE'
    when 'entre_cuentas' then 'Entre cuentas'$n$,
1);

-- ---------- 5. El Diario: lo que baja es la deuda con CLAURE (el debe); el haber sigue siendo el banco de donde salió ----------
-- Antes de `pago_planilla`: lo que guardan las pruebas del pago a SUNAT empieza en `when 'pago_planilla'` y llega hasta `as c_d`.
select pg_temp.reemplazar('retail.fn_asientos_dinero_y_caja(date, date, boolean, uuid[])',
$v$(case d.tipo when 'pago_planilla'$v$,
$n$(case d.tipo when 'pago_claure' then '479' when 'pago_planilla'$n$,
1);

-- ---------- 6. Los pagos vigentes, para quien ve la cuenta con CLAURE ----------
-- No es `fn_movimientos_dinero`: esa lista solo trae las últimas filas y, para quien no es líder, solo lo de su tienda; el saldo con CLAURE
-- tiene que restar TODOS los pagos, los vea quien los vea.
create or replace function retail.fn_claure_pagos()
returns table (id uuid, fecha date, cuenta_id uuid, cuenta_nombre text, monto numeric, referencia text, registrado_por text, creado_en timestamptz)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
begin
  if not retail.fn_es_lider() and coalesce(cardinality(retail.fn_cuentas_dinero_ubicaciones()), 0) = 0 then
    raise exception 'Ver la cuenta con CLAURE necesita el módulo Cuentas y dinero en tu rol.' using errcode = '42501';
  end if;
  return query
  select d.id, d.fecha, d.cuenta_origen_id, o.nombre, d.monto, d.referencia,
         nullif(trim(concat_ws(' ', pr.nombres, pr.apellidos)), ''), d.created_at
    from retail.movimientos_dinero d
    left join retail.cuentas_dinero o on o.id = d.cuenta_origen_id
    left join public.personas pr on pr.id = d.registrado_por
   where d.tipo = 'pago_claure' and d.estado = 'vigente'
   order by d.fecha desc, d.created_at desc;
end $$;

comment on function retail.fn_claure_pagos() is
  'ADR-0560: los pagos vigentes a CLAURE (movimientos_dinero.tipo = pago_claure), de más nuevo a más viejo. El saldo con CLAURE es lo cobrado (fn_claure_cuenta) menos estos pagos.';

revoke all on function retail.fn_claure_pagos() from public, anon;
grant execute on function retail.fn_claure_pagos() to authenticated;

-- ---------- 7. Que quedó como se prometió ----------
do $$
begin
  if position('''pago_claure''' in pg_get_constraintdef((select oid from pg_constraint where conname = 'movimientos_dinero_tipo_check'))) = 0 then
    raise exception 'ADR-0560: movimientos_dinero no acepta pago_claure';
  end if;
  if position('pago_claure' in pg_get_functiondef('retail.fn_movimientos_dinero_validar()'::regprocedure)) = 0
     or position('pago_claure' in pg_get_functiondef('retail.registrar_movimiento_dinero(text, numeric, uuid, uuid, date, text, numeric, uuid, uuid, uuid)'::regprocedure)) = 0
     or position('pago_claure' in pg_get_functiondef('retail.fn_texto_movimiento_dinero(text)'::regprocedure)) = 0
     or position('''479''' in pg_get_functiondef('retail.fn_asientos_dinero_y_caja(date, date, boolean, uuid[])'::regprocedure)) = 0 then
    raise exception 'ADR-0560: alguna función no quedó con el pago a CLAURE';
  end if;
end $$;
