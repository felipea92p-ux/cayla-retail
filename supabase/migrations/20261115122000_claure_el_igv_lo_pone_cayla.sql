-- ============================================================================
-- 20261115122000 — El IGV de lo vendido de CLAURE ya no se le descuenta a Claudia: lo pone CAYLA y queda por recuperar (ADR-0638, regla 5)
--
-- EL PROBLEMA PRIMERO. Felipe decidió el 2026-11-09 que CAYLA asume el IGV de todo lo de CLAURE (ADR-0638, regla 5), pero la base seguía con la regla
-- vieja (20261029142000): a Claudia se le restaba el IGV de lo que sus ventas cobraron en cuentas de CAYLA. Si Felipe le pagaba lo que decía la
-- pantalla, le quedaba debiendo ese IGV (cerca de un 15 % de lo cobrado), y la diferencia crecía con cada venta. Ese IGV no se pierde: CLAURE se lo devuelve a CAYLA con sus facturas de compra (crédito fiscal). Mientras esas
-- facturas no lleguen, el Diario lo lleva en una cuenta propia, la 1673 «IGV por acreditar» (Felipe eligió «Por recuperar», 2026-11-15).
--
-- CONTRATO (Liskov)
--   PROMETE: (1) lo que se le debe a Claudia es  cobrado − devuelto − comisión − pagado − gastos suyos  (sin restar el IGV) en las dos funciones que lo
--            calculan en la base: `fn_claure_cierre` (el aviso del cierre de caja; `hoy.igv` sigue saliendo, solo informa) y `fn_claure_saldo_a` (la
--            proyección de caja). La web hace la misma cuenta (`resumenClaure`). (2) En el Diario (`fn_asientos_claure`), cada venta, anulación,
--            devolución y cambio de CLAURE lleva a la 479 lo cobrado CON IGV, y el IGV va a la 1673 (al debe en una venta, al haber en lo que la deshace).
--            Cada asiento sigue cuadrando solo: 7011 (base) + 1673 (IGV) = 479 (base + IGV). El IGV de SUNAT (4011) no se toca.
--   ASUME:   `fn_claure_ventas` y `fn_claure_cambios` traen `igv` y `base` por documento (con el mismo signo que el `delta` en un cambio); ningún mes con
--            asientos de CLAURE está cerrado (`diario_cerrado`: 0 filas `claure%` al 2026-11-15), así que el cambio vale desde el arranque de la cuenta
--            con Claudia (23-oct) sin reescribir un mes congelado.
--   NO HACE: no registra las facturas de CLAURE (cuando lleguen, su IGV baja la 1673 y sube el crédito fiscal: es otra obra); no cambia `fn_claure_filas`
--            (cada fila sigue diciendo su IGV), los gastos repartidos ni el contraasiento del Yape de Claudia (`claure_fuera`, que ya va con IGV).
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, en cualquier momento (no depende de la web: la web vieja seguiría restando el IGV en la pestaña
-- CLAURE hasta publicar la nueva; por eso conviene pegarla justo después de publicar). Sin políticas ni `alter table`: un alta en `retail.cuentas` y
-- reemplazos anclados sobre tres funciones. ABORTAN SIN CAMBIAR NADA si el texto no es el esperado (dicen cuál). Idempotente: si el texto nuevo ya
-- está, no hace nada. Las huellas de producción del 2026-11-15, antes de pegar: fn_asientos_claure 34ed6a7a…, fn_claure_cierre 452be3b1…,
-- fn_claure_saldo_a 82055bff… (las mismas que deja `main` en una base nueva).
--
-- VUELTA ATRÁS (si hiciera falta): volver a pegar 20261110002000 (fn_asientos_claure), 20261029144000 (fn_claure_cierre) y 20261029162000
-- (fn_claure_saldo_a); la cuenta 1673 se queda sin movimiento y, sin saldo, no aparece en el Balance.
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

-- 1. La cuenta donde vive el IGV que CAYLA puso por CLAURE -------------------------------------------------------------------------------------------
-- 1673 = «Tributos por acreditar · IGV» del PCGE: un IGV que CAYLA recupera cuando llegue el comprobante (aquí, las facturas de compra de CLAURE).
-- Provisional hasta que el contador lo confirme, como la 479.
insert into retail.cuentas (codigo, nombre, tipo, seccion_resultados, orden)
values ('1673', 'IGV por acreditar (el que CAYLA puso por las ventas de CLAURE)', 'activo', null, 4)
on conflict (codigo) do nothing;

-- 2. El Diario: la 479 va con IGV y el IGV a la 1673 ---------------------------------------------------------------------------------------------------
-- 2a. Una venta de CLAURE.
select pg_temp.reemplazar('retail.fn_asientos_claure(date, date, boolean, uuid[])',
$v$  select x.fecha, x.ubicacion_id, 'claure:' || x.id, 'claure_venta', '479', 0, x.base, 'ventas', x.id, 'Se le debe a CLAURE (sin IGV)'
    from x where x.origen = 'venta' and x.base > 0$v$,
$n$  select x.fecha, x.ubicacion_id, 'claure:' || x.id, 'claure_venta', '479', 0, x.base + coalesce(x.igv, 0), 'ventas', x.id, 'Se le debe a CLAURE (lo cobrado con IGV: el IGV lo pone CAYLA)'
    from x where x.origen = 'venta' and x.base > 0
  -- ADR-0638, regla 5: el IGV de la boleta lo pone CAYLA y CLAURE lo devuelve con sus facturas de compra; hasta entonces queda por acreditar (1673).
  union all
  select x.fecha, x.ubicacion_id, 'claure:' || x.id, 'claure_venta', '1673', coalesce(x.igv, 0), 0, 'ventas', x.id, 'IGV que pone CAYLA por CLAURE: lo recupera con sus facturas'
    from x where x.origen = 'venta' and x.base > 0 and coalesce(x.igv, 0) <> 0$n$,
1);

-- 2b. Una anulación.
select pg_temp.reemplazar('retail.fn_asientos_claure(date, date, boolean, uuid[])',
$v$  select x.fecha, x.ubicacion_id, 'claure_anul:' || x.id, 'claure_anulacion', '479', x.base, 0, 'ventas', x.id, 'Se revierte lo que se le debía a CLAURE'
    from x where x.origen = 'anulacion' and x.base > 0$v$,
$n$  select x.fecha, x.ubicacion_id, 'claure_anul:' || x.id, 'claure_anulacion', '479', x.base + coalesce(x.igv, 0), 0, 'ventas', x.id, 'Se revierte lo que se le debía a CLAURE (con IGV)'
    from x where x.origen = 'anulacion' and x.base > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure_anul:' || x.id, 'claure_anulacion', '1673', 0, coalesce(x.igv, 0), 'ventas', x.id, 'Se revierte el IGV que CAYLA había puesto por CLAURE'
    from x where x.origen = 'anulacion' and x.base > 0 and coalesce(x.igv, 0) <> 0$n$,
1);

-- 2c. Una devolución.
select pg_temp.reemplazar('retail.fn_asientos_claure(date, date, boolean, uuid[])',
$v$  select x.fecha, x.ubicacion_id, 'claure_devol:' || x.id, 'claure_devolucion', '479', x.base, 0, 'devoluciones', x.id, 'Se revierte lo que se le debía a CLAURE'
    from x where x.origen = 'devolucion' and x.base > 0$v$,
$n$  select x.fecha, x.ubicacion_id, 'claure_devol:' || x.id, 'claure_devolucion', '479', x.base + coalesce(x.igv, 0), 0, 'devoluciones', x.id, 'Se revierte lo que se le debía a CLAURE (con IGV)'
    from x where x.origen = 'devolucion' and x.base > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure_devol:' || x.id, 'claure_devolucion', '1673', 0, coalesce(x.igv, 0), 'devoluciones', x.id, 'Se revierte el IGV que CAYLA había puesto por CLAURE'
    from x where x.origen = 'devolucion' and x.base > 0 and coalesce(x.igv, 0) <> 0$n$,
1);

-- 2d. Un cambio que le suma a Claudia (base > 0: el IGV también es positivo, sale del mismo `delta`).
select pg_temp.reemplazar('retail.fn_asientos_claure(date, date, boolean, uuid[])',
$v$  select k.fecha, k.ubicacion_id, 'claure_cambio:' || k.cambio_id, 'claure_cambio', '479', 0::numeric, k.base, 'cambios', k.cambio_id, 'Se le debe a CLAURE por un cambio (sin IGV)'
    from retail.fn_claure_cambios(p_desde, p_hasta, case when p_todo then array(select es.ubicacion_id from retail.empresa_sedes es) else p_ubics end) k where k.base > 0$v$,
$n$  select k.fecha, k.ubicacion_id, 'claure_cambio:' || k.cambio_id, 'claure_cambio', '479', 0::numeric, k.base + coalesce(k.igv, 0), 'cambios', k.cambio_id, 'Se le debe a CLAURE por un cambio (con IGV: lo pone CAYLA)'
    from retail.fn_claure_cambios(p_desde, p_hasta, case when p_todo then array(select es.ubicacion_id from retail.empresa_sedes es) else p_ubics end) k where k.base > 0
  union all
  select k.fecha, k.ubicacion_id, 'claure_cambio:' || k.cambio_id, 'claure_cambio', '1673', coalesce(k.igv, 0), 0::numeric, 'cambios', k.cambio_id, 'IGV que pone CAYLA por CLAURE en un cambio'
    from retail.fn_claure_cambios(p_desde, p_hasta, case when p_todo then array(select es.ubicacion_id from retail.empresa_sedes es) else p_ubics end) k where k.base > 0 and coalesce(k.igv, 0) <> 0$n$,
1);

-- 2e. Un cambio que le resta a Claudia (base < 0 e IGV < 0).
select pg_temp.reemplazar('retail.fn_asientos_claure(date, date, boolean, uuid[])',
$v$  select k.fecha, k.ubicacion_id, 'claure_cambio:' || k.cambio_id, 'claure_cambio', '479', -k.base, 0::numeric, 'cambios', k.cambio_id, 'Un cambio le devuelve a CAYLA lo que se le debía a CLAURE'
    from retail.fn_claure_cambios(p_desde, p_hasta, case when p_todo then array(select es.ubicacion_id from retail.empresa_sedes es) else p_ubics end) k where k.base < 0$v$,
$n$  select k.fecha, k.ubicacion_id, 'claure_cambio:' || k.cambio_id, 'claure_cambio', '479', -(k.base + coalesce(k.igv, 0)), 0::numeric, 'cambios', k.cambio_id, 'Un cambio le devuelve a CAYLA lo que se le debía a CLAURE (con IGV)'
    from retail.fn_claure_cambios(p_desde, p_hasta, case when p_todo then array(select es.ubicacion_id from retail.empresa_sedes es) else p_ubics end) k where k.base < 0
  union all
  select k.fecha, k.ubicacion_id, 'claure_cambio:' || k.cambio_id, 'claure_cambio', '1673', 0::numeric, -coalesce(k.igv, 0), 'cambios', k.cambio_id, 'Se revierte el IGV que CAYLA había puesto por CLAURE'
    from retail.fn_claure_cambios(p_desde, p_hasta, case when p_todo then array(select es.ubicacion_id from retail.empresa_sedes es) else p_ubics end) k where k.base < 0 and coalesce(k.igv, 0) <> 0$n$,
1);

comment on function retail.fn_asientos_claure(date, date, boolean, uuid[]) is
  'ADR-0560 / ADR-0638 (interna): reclasificación del Diario: lo vendido de CLAURE sin IGV sale de 7011, lo cobrado CON IGV va a 479 (lo que se le debe) y el IGV a 1673 (lo pone CAYLA y lo recupera con las facturas de CLAURE, regla 5); su costo vuelve a 201 y sale de 691; anulaciones, devoluciones y cambios lo deshacen en su día; la parte de CLAURE de un gasto baja la 479; lo que cayó en el Yape de Claudia se cancela. Un asiento por documento, que cuadra solo.';

-- 3. El aviso del cierre de caja deja de restar el IGV ------------------------------------------------------------------------------------------------
select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
$v$'saldo', round(v_cobrado - v_devuelto - v_igv - v_comision - v_pagado - v_ef_claudia - v_gastos, 2),$v$,
$n$'saldo', round(v_cobrado - v_devuelto - v_comision - v_pagado - v_ef_claudia - v_gastos, 2),$n$,
1);
select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
$v$'saldo_anterior', round(v_cobrado_ant - v_devuelto_ant - (v_igv - v_igv_hoy) - v_comision_ant - v_pagado_ant$v$,
$n$'saldo_anterior', round(v_cobrado_ant - v_devuelto_ant - v_comision_ant - v_pagado_ant$n$,
1);

comment on function retail.fn_claure_cierre(uuid) is
  'ADR-0560 / ADR-0638: lo que el cierre de caja muestra sobre CLAURE: el saldo con Claudia al terminar el día de esa caja (cobrado − devuelto − comisión − pagado − efectivo que se quedó con ella − gastos suyos; el IGV lo pone CAYLA desde la regla 5 y `hoy.igv` solo informa), lo del día por medio, y el efectivo de las ventas de la caja partido entre CAYLA y CLAURE (suma exacta de ventas_efectivo). Candado de fn_esperado_caja. Solo lee.';

-- 4. La proyección de caja, igual --------------------------------------------------------------------------------------------------------------------
select pg_temp.reemplazar('retail.fn_claure_saldo_a(date)',
$v$  -- Lo cobrado en cuentas de CAYLA menos lo devuelto, el IGV (lo paga CAYLA) y la comisión del POS (la asume CLAURE): las mismas filas de la pantalla CLAURE.
  v_saldo := coalesce((select sum(f.monto - coalesce(f.igv, 0) - coalesce(f.comision, 0))$v$,
$n$  -- Lo cobrado en cuentas de CAYLA menos lo devuelto y la comisión del POS (la asume CLAURE): las mismas filas de la pantalla CLAURE. El IGV lo pone CAYLA (ADR-0638, regla 5).
  v_saldo := coalesce((select sum(f.monto - coalesce(f.comision, 0))$n$,
1);

-- 5. Comprobación: si algo no quedó, la transacción entera se deshace -----------------------------------------------------------------------------------
do $$
declare
  v_asientos text := pg_get_functiondef('retail.fn_asientos_claure(date, date, boolean, uuid[])'::regprocedure);
  v_cierre text := pg_get_functiondef('retail.fn_claure_cierre(uuid)'::regprocedure);
  v_saldo text := pg_get_functiondef('retail.fn_claure_saldo_a(date)'::regprocedure);
begin
  if not exists (select 1 from retail.cuentas where codigo = '1673' and tipo = 'activo') then
    raise exception 'ADR-0638: falta la cuenta 1673';
  end if;
  if (length(v_asientos) - length(replace(v_asientos, '''1673''', ''))) / length('''1673''') <> 5 then
    raise exception 'ADR-0638: fn_asientos_claure no quedó con sus cinco líneas de la 1673';
  end if;
  if position('v_igv - v_comision' in v_cierre) > 0 or position('(v_igv - v_igv_hoy)' in v_cierre) > 0 then
    raise exception 'ADR-0638: fn_claure_cierre sigue restando el IGV';
  end if;
  if position('coalesce(f.igv, 0) - coalesce(f.comision, 0)' in v_saldo) > 0 then
    raise exception 'ADR-0638: fn_claure_saldo_a sigue restando el IGV';
  end if;
end $$;
