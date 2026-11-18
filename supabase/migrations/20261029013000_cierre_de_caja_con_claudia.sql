-- ============================================================================
-- 20261029013000 — El cierre de caja de Lima dice cuánto se le debe a Claudia y separa el efectivo de cada empresa
-- (ADR-0560; actividad 3 de 9; solo lectura)
--
-- EL PROBLEMA PRIMERO. Al cerrar la caja de Tienda LIM la persona cuenta un solo montón de efectivo, pero ahí hay plata de CAYLA y de CLAURE
-- (de Claudia), y lo que se cobró con tarjeta, QR o Yape cayó en cuentas de CAYLA y hay que dársela. Felipe (2026-10-28): al terminar cada
-- cierre el sistema avisa cuánto se le debe a Claudia (el neto, con el detalle a la mano) y deja listo el resumen para pasárselo; lo ve quien
-- cierra la caja y el líder; el pago se registra desde el cierre. Pero quien cierra casi nunca tiene el módulo Cuentas y dinero, que es el
-- candado de `fn_claure_cuenta`: esta función da lo del cierre con el candado del cierre.
--
-- CONTRATO (Liskov)
--   PROMETE: `fn_claure_cierre(caja)` devuelve UN jsonb con todo lo que el cierre muestra, de la caja y del día en que se cerró (o de hoy, si
--            sigue abierta): `hay_claure` (CLAURE opera en la sede de esa caja y se lleva su cuenta; si no, solo eso), la sede, la fecha, el
--            saldo con CLAURE al terminar ese día (lo cobrado en cuentas de CAYLA − lo devuelto − la comisión estimada del POS − lo ya pagado;
--            la MISMA suma que la pantalla de Finanzas, `fn_claure_filas`), el saldo de antes, lo del día (cobrado, devuelto, comisión,
--            pagado, y el cobrado por medio), el efectivo de las ventas de esa caja partido entre CAYLA y CLAURE, y si quien lo lee puede
--            registrar el pago (el líder). El efectivo de CAYLA + el de CLAURE es EXACTAMENTE `ventas_efectivo` de `fn_calcular_esperado_caja`
--            (el mismo filtro: ventas de esa caja, sin las anuladas), y cada pago se reparte por el valor de las líneas de cada empresa.
--   ASUME:   el candado de `fn_esperado_caja` (el líder, o quien puede gestionar la caja y operar esa sede). El efectivo de CLAURE lo tiene
--            Claudia y no suma a lo que se le debe; el efectivo de CAYLA sigue el traslado de siempre. NO se resta el efectivo de CAYLA que
--            quede con Claudia: no hay una regla aprobada para saber cuánto es (backlog).
--   FALLA:   `42501` sin permiso sobre esa caja; `P0001` si la caja no existe.
--   NO HACE: no escribe nada; no cierra la caja; no registra el pago (eso es `registrar_movimiento_dinero`, actividad 2).
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, después de 20261029004000. Una función nueva; sin tablas, políticas ni reemplazos. Idempotente.
-- SE ROMPE SI: una sede con dos empresas tiene ventas cuyas líneas no se pueden atribuir a ninguna (no pasa: `fn_dueno_de_la_linea` cae a la
-- ficha de la prenda, que tiene empresa obligatoria).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_claure_cierre(p_caja_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_caja retail.cajas%rowtype;
  v_claure uuid;
  v_desde date;
  v_fecha date;
  v_sede text;
  v_lider boolean := retail.fn_es_lider();
  v_ef_total numeric := 0;
  v_ef_claure numeric := 0;
  v_cobrado numeric := 0; v_devuelto numeric := 0; v_comision numeric := 0; v_pagado numeric := 0;
  v_cobrado_hoy numeric := 0; v_devuelto_hoy numeric := 0; v_comision_hoy numeric := 0; v_pagado_hoy numeric := 0;
  v_cobrado_ant numeric := 0; v_devuelto_ant numeric := 0; v_comision_ant numeric := 0; v_pagado_ant numeric := 0;
  v_por_medio jsonb;
  v_cambios integer := 0;
begin
  if not retail.fn_puede_gestionar_caja() then
    raise exception 'Solo quien puede cerrar la caja ve las cuentas con CLAURE' using errcode = '42501';
  end if;
  select * into v_caja from retail.cajas where id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id using errcode = 'P0001';
  end if;
  if not retail.fn_puede_operar_ubicacion(v_caja.ubicacion_id) then
    raise exception 'No tienes permiso sobre esa caja' using errcode = '42501';
  end if;

  select e.id, e.cuenta_corriente_desde into v_claure, v_desde from retail.empresas e where e.clave = 'claure' and e.activo;
  if v_claure is null or v_desde is null
     or not exists (select 1 from retail.empresa_sedes es where es.empresa_id = v_claure and es.ubicacion_id = v_caja.ubicacion_id) then
    return jsonb_build_object('hay_claure', false);
  end if;

  v_fecha := (coalesce(v_caja.cerrada_en, now()) at time zone 'America/Lima')::date;
  select u.nombre into v_sede from retail.ubicaciones u where u.id = v_caja.ubicacion_id;

  -- El efectivo de las ventas de esta caja (el mismo filtro de `fn_calcular_esperado_caja`), partido por el valor de las líneas de cada empresa.
  with v as (
    select vt.id, sum(i.subtotal) as total,
           coalesce(sum(i.subtotal) filter (where retail.fn_dueno_de_la_linea(i.id) = v_claure), 0) as de_claure
      from retail.ventas vt join retail.venta_items i on i.venta_id = vt.id
     where vt.caja_id = p_caja_id and vt.estado <> 'anulada'
     group by vt.id
  )
  select coalesce(sum(vp.monto), 0), coalesce(sum(vp.monto * v.de_claure / nullif(v.total, 0)), 0)
    into v_ef_total, v_ef_claure
    from retail.venta_pagos vp join v on v.id = vp.venta_id
   where vp.metodo = 'efectivo';
  v_ef_claure := round(v_ef_claure, 2);

  -- Lo cobrado en cuentas de CAYLA, de esta sede, hasta el día del cierre.
  select coalesce(sum(f.monto) filter (where f.origen = 'venta' and f.contado), 0),
         coalesce(-sum(f.monto) filter (where f.origen = 'devolucion' and f.contado), 0),
         coalesce(sum(coalesce(f.comision, 0)) filter (where f.contado), 0),
         coalesce(sum(f.monto) filter (where f.origen = 'venta' and f.contado and f.fecha = v_fecha), 0),
         coalesce(-sum(f.monto) filter (where f.origen = 'devolucion' and f.contado and f.fecha = v_fecha), 0),
         coalesce(sum(coalesce(f.comision, 0)) filter (where f.contado and f.fecha = v_fecha), 0),
         count(*) filter (where not f.contado)
    into v_cobrado, v_devuelto, v_comision, v_cobrado_hoy, v_devuelto_hoy, v_comision_hoy, v_cambios
    from retail.fn_claure_filas(array[v_caja.ubicacion_id]) f
   where f.fecha <= v_fecha;

  select coalesce(jsonb_agg(jsonb_build_object('medio', m.medio, 'monto', m.monto, 'comision', m.comision) order by m.medio), '[]'::jsonb)
    into v_por_medio
    from (select f.medio, round(sum(f.monto), 2) as monto, round(sum(coalesce(f.comision, 0)), 2) as comision
            from retail.fn_claure_filas(array[v_caja.ubicacion_id]) f
           where f.fecha = v_fecha and f.origen = 'venta' and f.contado
           group by f.medio) m;

  -- Lo ya pagado a CLAURE (movimientos vigentes): el total hasta ese día y lo de ese día.
  select coalesce(sum(d.monto) filter (where d.fecha <= v_fecha), 0), coalesce(sum(d.monto) filter (where d.fecha = v_fecha), 0)
    into v_pagado, v_pagado_hoy
    from retail.movimientos_dinero d where d.tipo = 'pago_claure' and d.estado = 'vigente';

  v_cobrado_ant := v_cobrado - v_cobrado_hoy;
  v_devuelto_ant := v_devuelto - v_devuelto_hoy;
  v_comision_ant := v_comision - v_comision_hoy;
  v_pagado_ant := v_pagado - v_pagado_hoy;

  return jsonb_build_object(
    'hay_claure', true,
    'sede', v_sede,
    'fecha', v_fecha,
    'puede_pagar', v_lider,
    'saldo', round(v_cobrado - v_devuelto - v_comision - v_pagado, 2),
    'saldo_anterior', round(v_cobrado_ant - v_devuelto_ant - v_comision_ant - v_pagado_ant, 2),
    'hoy', jsonb_build_object('cobrado', round(v_cobrado_hoy, 2), 'devuelto', round(v_devuelto_hoy, 2), 'comision', round(v_comision_hoy, 2), 'pagado', round(v_pagado_hoy, 2)),
    'por_medio', v_por_medio,
    'efectivo', jsonb_build_object('total', round(v_ef_total, 2), 'claure', v_ef_claure, 'cayla', round(v_ef_total - v_ef_claure, 2)),
    'cambios_por_revisar', v_cambios
  );
end $$;

comment on function retail.fn_claure_cierre(uuid) is
  'ADR-0560: lo que el cierre de caja muestra sobre CLAURE: el saldo con Claudia al terminar el día de esa caja, lo del día por medio, y el efectivo de las ventas de la caja partido entre CAYLA y CLAURE (suma exacta de ventas_efectivo). Candado de fn_esperado_caja. Solo lee.';

revoke all on function retail.fn_claure_cierre(uuid) from public, anon;
grant execute on function retail.fn_claure_cierre(uuid) to authenticated;
