-- ============================================================================
-- 20261015003000_finanzas_caja_fuerte_y_gasto_desde_el_inicio_parte2.sql — CAYLA V2 (/chaos de Finanzas, ADR-0412, 2026-10-14) · PARTE 2 de 2
--
-- EL PROBLEMA PRIMERO. /chaos de Finanzas (2026-10-13, repetido el 2026-10-14 sobre main):
--   1. Un retiro de S/ 99 999 de la caja fuerte de Lima, que no tiene esa plata, se guardaba: su saldo quedaba en negativo. Una caja
--      fuerte es efectivo en un cajón con llave; un saldo bajo cero es un estado imposible (o plata que salió y nadie anotó de dónde).
--      La plata sale de una caja fuerte por cinco caminos (un movimiento de dinero, un gasto, un activo, el pago de una factura de
--      proveedor y el de una del Taller, cada uno con su cuenta o asignado después en `cuentas_asignadas`), y su saldo se calcula del
--      libro (`fn_dinero_libro`), no se guarda: no alcanza con mirar una sola función.
--   2. Un gasto fechado en 1990 se guardaba. Finanzas cuenta desde `parametros_finanzas.inicio_finanzas` (ADR-0332, hoy 2026-10-01): un
--      gasto anterior queda fuera de todos los reportes sin que nadie lo vea.
--
-- LA DECISIÓN (Felipe 2026-10-14).
--   1. La caja fuerte no queda bajo cero, igual que la caja de la tienda (ADR-0398). Disparadores DIFERIDOS (al confirmar, para que una
--      función que escribe la salida antes que la entrada no rebote a medio camino) en las tablas por donde sale o deja de entrar plata
--      de una cuenta; llaman a `fn_exigir_efectivo_en_cuenta`, que toma un candado por cuenta (dos retiros a la vez se ordenan y el
--      segundo ve el primero), recalcula el saldo con la MISMA fórmula que Cuentas y dinero (`fn_cuentas_dinero_saldos`) y, si quedó
--      bajo cero, rechaza (`efectivo_insuficiente`). La cifra sale solo para quien ve esa cuenta en Cuentas y dinero.
--      Solo la caja fuerte: el cajón ya lo cuida la caja (ADR-0398) y el banco puede quedar en negativo mientras su saldo en el sistema
--      esté incompleto (Felipe: «el banco sí puede»). `caja_traslados` (lo que el cierre manda a la caja fuerte) no lleva disparador:
--      ninguna función lo edita ni lo borra, y lo que entra no puede dejar un saldo negativo.
--   2. `registrar_gasto` rechaza una fecha anterior al inicio de Finanzas (`gasto_antes_del_inicio`), con un mensaje que dice qué hacer.
--      Solo ahí, el gasto que se anota a mano: un candado en la tabla frenaría también la factura de septiembre que Compras registra en
--      octubre (su gasto lleva la fecha de la factura), y eso es otra pregunta.
--   3. El token sigue al contenido en `registrar_movimiento_dinero`, `registrar_activo` y `cargar_activo_inicial` (/chaos 2026-10-14, TOK-F1
--      a F3: con el mismo token y otro monto devolvían lo del primer envío y la pantalla anunciaba lo segundo). La misma pieza de ADR-0398.
--
-- CONTRATO (Liskov)
--   PROMETE: ninguna transacción confirma una caja fuerte con saldo bajo cero; `registrar_gasto` no guarda un gasto anterior al inicio
--            de Finanzas (si no hay inicio elegido, no frena nada); el mismo token con otro contenido en las tres funciones de arriba
--            responde `token_reusado` sin escribir nada. Lo demás sigue igual.
--   ASUME:   `fn_dinero_libro`, `fn_cuentas_dinero_ubicaciones`, `fn_ve_finanzas_de_todo` y `fn_intento_con_huella` (ADR-0398) vivos; ninguna caja fuerte bajo cero al pegar
--            (en producción, ninguna, el 2026-10-14). `registrar_gasto` con su chequeo de fecha futura (ancla verificada en local y en
--            producción el 2026-10-14).
--   NO HACE: no toca filas ni políticas; no cambia qué valida cada función fuera de esto.
--
-- CÓMO SE PEGA. Una sola parte: funciones nuevas, disparadores (`create constraint trigger` si no existe; nunca `drop trigger`, ADR-0195)
-- y reemplazos ANCLADOS en `registrar_gasto`, `registrar_movimiento_dinero`, `registrar_activo` y `cargar_activo_inicial` (cada uno se
-- detiene sin tocar nada si su ancla no aparece una vez). Sin políticas. Idempotente.
-- ============================================================================
set lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1. La caja fuerte no queda bajo cero.
-- ----------------------------------------------------------------------------
create or replace function retail.fn_exigir_efectivo_en_cuenta(p_cuenta_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_tipo text;
  v_nombre text;
  v_ubicacion uuid;
  v_saldo numeric;
begin
  if p_cuenta_id is null then
    return;
  end if;
  for v_tipo, v_nombre, v_ubicacion in
    select c.tipo, c.nombre, c.ubicacion_id from retail.cuentas_dinero c where c.id = p_cuenta_id
  loop
    exit;
  end loop;
  if v_tipo is distinct from 'caja_fuerte' then
    return;
  end if;
  -- El último candado de la operación: dos salidas a la vez de la misma cuenta se ordenan aquí y la segunda ve la primera.
  perform pg_advisory_xact_lock(hashtextextended('efectivo_de_cuenta:' || p_cuenta_id::text, 0));
  -- La misma fórmula de Cuentas y dinero (`fn_cuentas_dinero_saldos`), sin corte: también cuenta lo fechado a futuro.
  v_saldo := (select c.saldo_inicial + coalesce((select sum(l.monto) from retail.fn_dinero_libro('9999-12-31'::date) l
                                                   where l.cuenta_id = c.id and (c.saldo_desde is null or l.fecha >= c.saldo_desde)), 0)
                from retail.cuentas_dinero c where c.id = p_cuenta_id);
  if v_saldo < 0 then
    if retail.fn_ve_finanzas_de_todo() or v_ubicacion = any (coalesce(retail.fn_cuentas_dinero_ubicaciones(), '{}'::uuid[])) then
      raise exception 'No hay tanta plata en «%»: con esto quedaría en S/ %. Revisa el monto o sácalo de otra cuenta.',
        v_nombre, to_char(v_saldo, 'FM999999990.00')
        using errcode = 'P0001', hint = 'efectivo_insuficiente';
    end if;
    raise exception 'No hay tanta plata en «%» para esto. Revisa el monto o sácalo de otra cuenta.', v_nombre
      using errcode = 'P0001', hint = 'efectivo_insuficiente';
  end if;
end;
$$;

comment on function retail.fn_exigir_efectivo_en_cuenta(uuid) is
  'Interna: rechaza (efectivo_insuficiente) si el saldo de una caja fuerte quedó bajo cero. La llaman disparadores diferidos (ADR-0412).';
revoke all on function retail.fn_exigir_efectivo_en_cuenta(uuid) from public, anon, authenticated;

create or replace function retail.trg_efectivo_en_cuenta()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_filas jsonb[] := '{}';
  v_fila jsonb;
  v_col text;
  v_id uuid;
  v_ids uuid[] := '{}';
begin
  if tg_op <> 'DELETE' then
    v_filas := v_filas || to_jsonb(new);
  end if;
  if tg_op <> 'INSERT' then
    v_filas := v_filas || to_jsonb(old);
  end if;
  -- Toda cuenta que la fila nombra, antes y después del cambio: de la que sale, a la que deja de entrar, la que se le asigna.
  foreach v_fila in array v_filas loop
    foreach v_col in array array['cuenta_origen_id', 'cuenta_destino_id', 'cuenta_dinero_id', 'cuenta_id'] loop
      v_id := nullif(v_fila ->> v_col, '')::uuid;
      if v_id is not null and not (v_id = any (v_ids)) then
        v_ids := v_ids || v_id;
      end if;
    end loop;
    if tg_table_name = 'cuentas_dinero' then
      v_id := (v_fila ->> 'id')::uuid;
      if not (v_id = any (v_ids)) then
        v_ids := v_ids || v_id;
      end if;
    end if;
  end loop;
  foreach v_id in array v_ids loop
    perform retail.fn_exigir_efectivo_en_cuenta(v_id);
  end loop;
  return null;
end;
$$;

comment on function retail.trg_efectivo_en_cuenta() is
  'Disparador diferido: al confirmar algo que saca o deja de meter plata en una cuenta, exige que una caja fuerte no quede bajo cero (ADR-0412).';
revoke all on function retail.trg_efectivo_en_cuenta() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'movimientos_dinero_efectivo_en_cuenta' and tgrelid = 'retail.movimientos_dinero'::regclass) then
    create constraint trigger movimientos_dinero_efectivo_en_cuenta
      after insert or update or delete on retail.movimientos_dinero
      deferrable initially deferred
      for each row execute function retail.trg_efectivo_en_cuenta();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'gastos_efectivo_en_cuenta' and tgrelid = 'retail.gastos'::regclass) then
    create constraint trigger gastos_efectivo_en_cuenta
      after insert or update or delete on retail.gastos
      deferrable initially deferred
      for each row execute function retail.trg_efectivo_en_cuenta();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'activos_fijos_efectivo_en_cuenta' and tgrelid = 'retail.activos_fijos'::regclass) then
    create constraint trigger activos_fijos_efectivo_en_cuenta
      after insert or update or delete on retail.activos_fijos
      deferrable initially deferred
      for each row execute function retail.trg_efectivo_en_cuenta();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'compra_pagos_efectivo_en_cuenta' and tgrelid = 'retail.compra_pagos'::regclass) then
    create constraint trigger compra_pagos_efectivo_en_cuenta
      after insert or update or delete on retail.compra_pagos
      deferrable initially deferred
      for each row execute function retail.trg_efectivo_en_cuenta();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'comprobantes_produccion_pagos_efectivo_en_cuenta' and tgrelid = 'retail.comprobantes_produccion_pagos'::regclass) then
    create constraint trigger comprobantes_produccion_pagos_efectivo_en_cuenta
      after insert or update or delete on retail.comprobantes_produccion_pagos
      deferrable initially deferred
      for each row execute function retail.trg_efectivo_en_cuenta();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'cuentas_asignadas_efectivo_en_cuenta' and tgrelid = 'retail.cuentas_asignadas'::regclass) then
    create constraint trigger cuentas_asignadas_efectivo_en_cuenta
      after insert or update or delete on retail.cuentas_asignadas
      deferrable initially deferred
      for each row execute function retail.trg_efectivo_en_cuenta();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'cuentas_dinero_efectivo_en_cuenta' and tgrelid = 'retail.cuentas_dinero'::regclass) then
    create constraint trigger cuentas_dinero_efectivo_en_cuenta
      after update of saldo_inicial, saldo_desde, tipo on retail.cuentas_dinero
      deferrable initially deferred
      for each row execute function retail.trg_efectivo_en_cuenta();
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. `registrar_gasto` no guarda un gasto anterior al inicio de Finanzas.
-- ----------------------------------------------------------------------------
-- Inserta `p_bloque` antes de la primera aparición de `p_ancla`, que tiene que aparecer exactamente `p_veces` veces.
-- Si `p_marca` ya está en la función, no hace nada.
create or replace function pg_temp.insertar_antes(p_firma text, p_ancla text, p_veces integer, p_bloque text, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_ancla, ''))) / length(p_ancla);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_ancla, v_n;
  end if;
  execute overlay(v_def placing p_bloque || p_ancla from position(p_ancla in v_def) for length(p_ancla));
end;
$f$;

select pg_temp.insertar_antes(
  'retail.registrar_gasto(uuid, text, text, date, numeric, jsonb, text, uuid, uuid, text, uuid, uuid, uuid)',
  $v$  if p_fecha is null or p_fecha > retail.fn_hoy_lima() then$v$, 1,
  $v$  -- Finanzas cuenta desde su inicio (ADR-0332): un gasto anterior no entraría a ningún reporte (gasto_antes_del_inicio, ADR-0412).
  if p_fecha < retail.fn_finanzas_desde() then
    raise exception 'Finanzas cuenta desde el %: un gasto anterior no entraría a ningún reporte. Si lo pagaste ahora, ponle la fecha del pago.',
      to_char(retail.fn_finanzas_desde(), 'DD/MM/YYYY')
      using errcode = 'P0001', hint = 'gasto_antes_del_inicio';
  end if;
$v$,
  $v$gasto_antes_del_inicio$v$);

-- ----------------------------------------------------------------------------
-- 3. El token sigue al contenido en las tres funciones de Finanzas que todavía no lo comparaban (/chaos 2026-10-14, TOK-F1 a F3).
-- ----------------------------------------------------------------------------
-- La misma pieza de ADR-0398, ADR-0401 y ADR-0409: el mismo token con otro contenido se rechaza (token_reusado) en vez de devolver lo
-- del primer envío. La huella es `md5(row(…)::text)`: un `numeric` en `NaN` no se puede pasar a jsonb.
select pg_temp.insertar_antes(
  'retail.registrar_movimiento_dinero(text, numeric, uuid, uuid, date, text, numeric, uuid, uuid, uuid)',
  $v$  if p_token is not null then$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otro monto, otras cuentas u otra fecha se rechaza (token_reusado, ADR-0412).
  perform retail.fn_intento_con_huella('registrar_movimiento_dinero', p_token, md5(row(p_tipo, p_monto, p_cuenta_origen_id, p_cuenta_destino_id, p_fecha, p_referencia, p_comision, p_caja_id, p_caja_movimiento_id)::text));
$v$,
  $v$fn_intento_con_huella('registrar_movimiento_dinero'$v$);

select pg_temp.insertar_antes(
  'retail.registrar_activo(uuid, text, text, date, numeric, jsonb, text, uuid, uuid, text, integer, text, uuid, uuid)',
  $v$  if p_token is not null then$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otro activo, otro costo u otro pago se rechaza (token_reusado, ADR-0412).
  perform retail.fn_intento_con_huella('registrar_activo', p_token, md5(row(p_ubicacion_id, p_tipo, p_nombre, p_fecha, p_monto_total, p_comprobante, p_medio_pago, p_caja_id, p_caja_movimiento_id, p_referencia, p_vida_util_meses, p_serie, p_cuenta_id)::text));
$v$,
  $v$fn_intento_con_huella('registrar_activo'$v$);

select pg_temp.insertar_antes(
  'retail.cargar_activo_inicial(uuid, text, text, date, numeric, integer, text, text, uuid)',
  $v$  if p_token is not null then$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otro activo u otro costo se rechaza (token_reusado, ADR-0412).
  perform retail.fn_intento_con_huella('cargar_activo_inicial', p_token, md5(row(p_ubicacion_id, p_tipo, p_nombre, p_fecha, p_costo, p_vida_util_meses, p_serie, p_nota)::text));
$v$,
  $v$fn_intento_con_huella('cargar_activo_inicial'$v$);
