-- ============================================================================
-- 20261029142000 — El IGV de lo vendido de CLAURE se le descuenta a Claudia en el aviso del cierre de caja (ADR-0560; actividad 10)
--
-- EL PROBLEMA PRIMERO. Las boletas de lo que vende CLAURE en Tienda Lima salen con el RUC de CAYLA: es CAYLA quien declara y paga a SUNAT el IGV de esas ventas (la
-- 4011 del Diario). Hasta la actividad 9 lo que se le debía a Claudia era lo COBRADO entero, con ese IGV adentro: CAYLA ponía de su bolsillo un impuesto de ventas ajenas.
-- Felipe (2026-10-29): «se le descuenta a Claudia». Así lo que se le debe es la base sin IGV, que es exactamente lo que el Diario ya reclasifica a la 479
-- (`fn_asientos_claure`, actividad 5): el saldo y la contabilidad dicen lo mismo.
--
-- CONTRATO (Liskov)
--   PROMETE: `fn_claure_cierre(caja)` calcula el saldo con Claudia como  cobrado − devuelto − IGV − comisión − pagado − gastos suyos  (antes, sin el IGV), igual que la
--            pantalla CLAURE de Finanzas (`resumenClaure`, en la web). El IGV es el NETO de ventas y devoluciones (`fn_claure_filas.igv`: negativo en una devolución) y el
--            bloque «hoy» trae `igv`. Lo demás de la respuesta es EXACTAMENTE lo de antes (mismas claves, mismo candado).
--   ASUME:   `fn_claure_filas` ya trae `igv` por fila (lo cobrado menos lo cobrado ÷ (1 + la tasa de ese día)); la comisión del POS sigue calculándose sobre lo cobrado.
--   NO HACE: no cambia `fn_claure_filas`, el Diario ni ninguna tabla; la pantalla CLAURE y el Resumen se corrigen en la web (el saldo se calcula allí).
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, después de 20261029044000 (que dejó a `fn_claure_cierre` con los gastos). Son cinco reemplazos anclados sobre una función
-- propia; ABORTAN SIN CAMBIAR NADA si el texto no es el esperado (dice cuál). Sin políticas ni `alter table`; idempotente (si el nuevo texto ya está, no hace nada).
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

-- 1. Las dos variables del IGV (el total hasta el día del cierre y el de ese día).
select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
  $v$  v_gastos numeric := 0; v_gastos_hoy numeric := 0;$v$,
  $n$  v_gastos numeric := 0; v_gastos_hoy numeric := 0;
  v_igv numeric := 0; v_igv_hoy numeric := 0;$n$, 1);

-- 2. El IGV neto (ventas − devoluciones) hasta ese día y el de ese día, de las mismas filas que el cobrado.
select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
  $v$  v_cobrado_ant := v_cobrado - v_cobrado_hoy;$v$,
  $n$  v_igv := (select coalesce(sum(coalesce(f.igv, 0)), 0) from retail.fn_claure_filas(array[v_caja.ubicacion_id]) f where f.contado and f.fecha <= v_fecha);
  v_igv_hoy := (select coalesce(sum(coalesce(f.igv, 0)), 0) from retail.fn_claure_filas(array[v_caja.ubicacion_id]) f where f.contado and f.fecha = v_fecha);

  v_cobrado_ant := v_cobrado - v_cobrado_hoy;$n$, 1);

-- 3. El saldo de ese día baja por el IGV.
select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
  $v$'saldo', round(v_cobrado - v_devuelto - v_comision - v_pagado - v_gastos, 2),$v$,
  $n$'saldo', round(v_cobrado - v_devuelto - v_igv - v_comision - v_pagado - v_gastos, 2),$n$, 1);

-- 4. El saldo de antes de ese día, igual.
select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
  $v$'saldo_anterior', round(v_cobrado_ant - v_devuelto_ant - v_comision_ant - v_pagado_ant - (v_gastos - v_gastos_hoy), 2),$v$,
  $n$'saldo_anterior', round(v_cobrado_ant - v_devuelto_ant - (v_igv - v_igv_hoy) - v_comision_ant - v_pagado_ant - (v_gastos - v_gastos_hoy), 2),$n$, 1);

-- 5. El bloque «hoy» dice cuánto IGV fue.
select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
  $v$'devuelto', round(v_devuelto_hoy, 2), 'comision'$v$,
  $n$'devuelto', round(v_devuelto_hoy, 2), 'igv', round(v_igv_hoy, 2), 'comision'$n$, 1);

comment on function retail.fn_claure_cierre(uuid) is
  'ADR-0560: lo que el cierre de caja muestra sobre CLAURE: el saldo con Claudia al terminar el día de esa caja (cobrado − devuelto − IGV − comisión − pagado − gastos suyos), lo del día por medio, y el efectivo de las ventas de la caja partido entre CAYLA y CLAURE (suma exacta de ventas_efectivo). Candado de fn_esperado_caja. Solo lee.';

do $$
declare
  v_def text := pg_get_functiondef('retail.fn_claure_cierre(uuid)'::regprocedure);
begin
  if position('v_devuelto - v_igv - v_comision' in v_def) = 0 or position('''igv'', round(v_igv_hoy, 2)' in v_def) = 0 then
    raise exception 'ADR-0560: fn_claure_cierre no quedó descontando el IGV del saldo';
  end if;
end $$;
