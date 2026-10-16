-- ============================================================================
-- 20261016183000_pago_planilla_anclas_que_no_rompen_al_fondo.sql — CAYLA V2 (ADR-0417, Fase 1; corrige a 20261016002000)
--
-- EL PROBLEMA PRIMERO. 20261016002000 (el pago de la planilla y el pago a SUNAT) ya está en producción y hace lo que promete,
-- pero metió su texto DENTRO del texto que otras migraciones vivas esperan encontrar entero cuando se vuelven a pegar (las
-- suites del CI pegan dos veces las migraciones del fondo por rendir, 20261013181000 … 20261014222000, sobre la base ya migrada):
--   · en el Diario (`fn_asientos_dinero_y_caja`) puso `when 'pago_planilla' then '41' when 'pago_sunat' then '4011'` al INICIO
--     del `case` del debe, y la 235000 (rendición del fondo) ancla ese `case` entero: al repegarla no encuentra su texto y
--     aborta («cambió desde que se escribió esta migración»). La suite `rendicion_fondo` salió 0/12 en el PR #1127.
--   · en el candado (`fn_movimientos_dinero_validar`) puso su bloque justo ANTES de «-- Qué va en cada punta.», que es el
--     final del texto que la 235000 deja; y en los nombres (`fn_texto_movimiento_dinero`) puso sus dos `when` entre «Entre
--     cuentas» y «Entrega de fondo», que la 182000 deja juntos. Repegar esas dos no aborta, pero duplica su bloque.
--
-- CÓMO. Se MUEVE el texto de la 002000 a lugares donde ningún parche vivo ancla (la regla que la 235000 escribió para sí
-- misma: un bloque que se SUMA sin partir lo que otra dejó): el mapeo 41 / 4011 pasa al `c_d` del CTE `md`, de donde el `case`
-- del debe lee su `else`; el bloque del candado va DESPUÉS de «-- Qué va en cada punta.» (sigue corriendo antes de las reglas
-- generales); y los dos nombres van al final del `case`, antes de `else p_tipo`. Lo que cada función HACE no cambia: 41 | 104
-- y 4011 | 104, los mismos candados, los mismos textos. Idempotente: cada paso lleva una marca que solo existe después de
-- moverse; si la ve, no toca nada. Sobre una base donde la 002000 nunca corrió, aborta: primero va la 002000.
-- Verificado como las demás: `scripts/pruebas/pago_planilla_y_sunat.mjs` (las anclas del fondo siguen enteras) y
-- `scripts/pruebas/rendicion_fondo.mjs` (repega la 235000 y vuelve a 12/12).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Mueve texto dentro de una función viva. Con `p_marca` (un texto que solo existe DESPUÉS de moverlo): si ya está, no hace nada.
-- Sin marca: mueve el texto viejo cada vez que lo encuentra (así, si alguien vuelve a pegar la 002000 encima, esta lo vuelve a
-- sacar de donde rompe a las demás). El texto viejo, si está, tiene que aparecer exactamente una vez.
create or replace function pg_temp.mover(p_firma text, p_viejo text, p_nuevo text, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if p_marca is not null and position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n = 0 and p_marca is null then
    return;
  end if;
  if v_n <> 1 then
    raise exception '% no tiene exactamente una vez el texto que 20261016183000 mueve (hay %): ¿corrió 20261016002000 antes? Regenera el movimiento desde la definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. El Diario: el mapeo 41 / 4011 sale del arranque del case (texto de la 235000) y entra al CTE ----------
select pg_temp.mover('retail.fn_asientos_dinero_y_caja(date, date, boolean, uuid[])',
$v$(case md.tipo when 'pago_planilla' then '41' when 'pago_sunat' then '4011' when 'retiro' then '591'$v$,
$n$(case md.tipo when 'retiro' then '591'$n$,
null);

select pg_temp.mover('retail.fn_asientos_dinero_y_caja(date, date, boolean, uuid[])',
$v$de.cuenta_contable as c_d, de.nombre as n_d$v$,
$n$(case d.tipo when 'pago_planilla' then '41' when 'pago_sunat' then '4011' else de.cuenta_contable end) as c_d, de.nombre as n_d$n$,
$m$else de.cuenta_contable end) as c_d$m$);

-- ---------- 2. El candado: el bloque pasa a DESPUÉS de «Qué va en cada punta» (sigue antes de las reglas generales) ----------
select pg_temp.mover('retail.fn_movimientos_dinero_validar()',
$v$  -- ADR-0417 (situaciones 15 y 16): el pago de la planilla y el pago a SUNAT salen de un banco y no van a ninguna cuenta de
  -- dinero; lo que baja es una deuda (41 · 4011), que lleva el Diario. Son de la empresa, no de una tienda.
  if new.tipo in ('pago_planilla', 'pago_sunat') then
    if new.cuenta_destino_id is not null or coalesce(v_o.tipo, '') <> 'banco' or new.caja_movimiento_id is not null
       or coalesce(new.comision, 0) <> 0 then
      raise exception 'El pago de la planilla y el pago a SUNAT salen de un banco, sin destino, sin comisión y sin caja.' using errcode = 'P0001';
    end if;
    new.ubicacion_id := null;
    return new;
  end if;

  -- Qué va en cada punta.$v$,
$n$  -- Qué va en cada punta.
  -- ADR-0417 (situaciones 15 y 16): el pago de la planilla y el pago a SUNAT salen de un banco y no van a ninguna cuenta de
  -- dinero; lo que baja es una deuda (41 · 4011), que lleva el Diario. Son de la empresa, no de una tienda. Va antes de las
  -- reglas generales de abajo, que no lo conocen (y después del texto de la 235000, que lo ancla entero: 20261016183000).
  if new.tipo in ('pago_planilla', 'pago_sunat') then
    if new.cuenta_destino_id is not null or coalesce(v_o.tipo, '') <> 'banco' or new.caja_movimiento_id is not null
       or coalesce(new.comision, 0) <> 0 then
      raise exception 'El pago de la planilla y el pago a SUNAT salen de un banco, sin destino, sin comisión y sin caja.' using errcode = 'P0001';
    end if;
    new.ubicacion_id := null;
    return new;
  end if;$n$,
$m$  -- Qué va en cada punta.
  -- ADR-0417 (situaciones 15 y 16)$m$);

-- Si alguien vuelve a pegar la 002000 encima, deja otra copia del bloque ANTES de la línea: esta la saca (el bloque bueno ya está después).
select pg_temp.mover('retail.fn_movimientos_dinero_validar()',
$v$  -- ADR-0417 (situaciones 15 y 16): el pago de la planilla y el pago a SUNAT salen de un banco y no van a ninguna cuenta de
  -- dinero; lo que baja es una deuda (41 · 4011), que lleva el Diario. Son de la empresa, no de una tienda.
  if new.tipo in ('pago_planilla', 'pago_sunat') then
    if new.cuenta_destino_id is not null or coalesce(v_o.tipo, '') <> 'banco' or new.caja_movimiento_id is not null
       or coalesce(new.comision, 0) <> 0 then
      raise exception 'El pago de la planilla y el pago a SUNAT salen de un banco, sin destino, sin comisión y sin caja.' using errcode = 'P0001';
    end if;
    new.ubicacion_id := null;
    return new;
  end if;

  -- Qué va en cada punta.$v$,
$n$  -- Qué va en cada punta.$n$,
null);

-- ---------- 3. Los nombres: al final del case, antes de `else p_tipo` (la 182000 vuelve a ver «Entre cuentas» y «Entrega de fondo» juntos) ----------
select pg_temp.mover('retail.fn_texto_movimiento_dinero(text)',
$v$    when 'entre_cuentas' then 'Entre cuentas'
    when 'pago_planilla' then 'Pago de la planilla'
    when 'pago_sunat' then 'Pago a SUNAT (IGV)'$v$,
$n$    when 'entre_cuentas' then 'Entre cuentas'$n$,
null);

select pg_temp.mover('retail.fn_texto_movimiento_dinero(text)',
$v$    else p_tipo end;$v$,
$n$    when 'pago_planilla' then 'Pago de la planilla'
    when 'pago_sunat' then 'Pago a SUNAT (IGV)'
    else p_tipo end;$n$,
$m$    when 'pago_sunat' then 'Pago a SUNAT (IGV)'
    else p_tipo end;$m$);

-- ---------- 4. Que quedó como se prometió: el mapeo en el CTE y los textos de la 235000 y la 182000 enteros ----------
do $$
declare
  v_a text := pg_get_functiondef('retail.fn_asientos_dinero_y_caja(date, date, boolean, uuid[])'::regprocedure);
  v_v text := pg_get_functiondef('retail.fn_movimientos_dinero_validar()'::regprocedure);
  v_t text := pg_get_functiondef('retail.fn_texto_movimiento_dinero(text)'::regprocedure);
begin
  if position($x$when 'pago_planilla' then '41' when 'pago_sunat' then '4011' else de.cuenta_contable end) as c_d$x$ in v_a) = 0
     or position($x$(case md.tipo when 'retiro' then '591' when 'devolucion_prestamo' then '47'$x$ in v_a) = 0 then
    raise exception 'ADR-0417 (183000): el Diario no quedó con el mapeo 41/4011 en el CTE y el case de la 235000 entero';
  end if;
  if position($x$  -- Qué va en cada punta.
  -- ADR-0417 (situaciones 15 y 16)$x$ in v_v) = 0
     or position($x$    new.ubicacion_id := null;
    return new;
  end if;

  -- Qué va en cada punta.$x$ in v_v) > 0 then
    raise exception 'ADR-0417 (183000): el candado no quedó después de «Qué va en cada punta»';
  end if;
  if position($x$    when 'pago_sunat' then 'Pago a SUNAT (IGV)'
    else p_tipo end;$x$ in v_t) = 0
     or position($x$    when 'entre_cuentas' then 'Entre cuentas'
    when 'entrega_fondo' then 'Entrega de fondo'$x$ in v_t) = 0 then
    raise exception 'ADR-0417 (183000): los nombres no quedaron al final del case, o la 182000 perdió su texto';
  end if;
end $$;
