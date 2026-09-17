-- ============================================================================
-- 20260915180000_reembolso_en_el_arqueo.sql — CAYLA V2
--
-- Cierra una fuga de dinero encontrada al analizar Devoluciones contra los
-- siete ERP/POS de la comparativa externa: cuando una Líder aprueba una
-- devolución con reembolso en EFECTIVO, ese dinero sale del cajón, pero
-- `cerrar_caja` nunca lo resta de lo esperado. Hoy el cajón cierra "sobrando"
-- exactamente el monto de cada reembolso en efectivo — un faltante disfrazado
-- de sobrante, indistinguible de un error real de conteo.
--
-- QUÉ AGREGA. `devoluciones.caja_id`: a qué caja pertenece el reembolso — la
-- que estaba abierta en esa ubicación en el instante en que se APROBÓ (no la
-- de la venta original, que puede ser de otro día). `aprobar_devolucion` la
-- fija sola; nadie la manda desde la pantalla.
--
-- QUÉ CAMBIA EN `cerrar_caja` (misma firma de 2 parámetros): `v_sistema` resta
-- los reembolsos en efectivo de ESTA caja, igual que ya suma ingresos y resta
-- egresos. Solo 'efectivo' — un reembolso por Yape/Plin/transferencia/tarjeta
-- no toca el cajón físico, así que no debe tocar lo esperado.
--
-- SE ROMPE SI: se aprueba una devolución sin caja abierta en esa ubicación —
-- `caja_id` queda null y ese reembolso nunca se resta de ningún cierre. Es un
-- caso raro (aprobar una devolución mientras la caja del día está cerrada) y
-- queda como hueco conocido, no resuelto acá: el dinero físico de todos modos
-- no puede salir de un cajón cerrado, así que el reembolso real ocurre cuando
-- se vuelva a abrir la caja — momento que hoy no se captura.
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.devoluciones add column caja_id uuid references retail.cajas(id);

comment on column retail.devoluciones.caja_id is
  'La caja que absorbe el reembolso — la que estaba abierta en aprobar_devolucion(), no la de la venta original. Null si no había caja abierta al aprobar.';

-- ---------- aprobar_devolucion: fija caja_id, sin cambiar la firma ----------
create or replace function retail.aprobar_devolucion(
  p_devolucion_id uuid, p_reembolso_monto numeric default null, p_reembolso_metodo text default null
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare d devoluciones%rowtype; r record; v_mov_id uuid; v_persona uuid; v_sub uuid; v_caja_id uuid;
begin
  select * into d from devoluciones where id = p_devolucion_id for update;
  if not found then raise exception 'La devolución % no existe', p_devolucion_id; end if;
  if d.estado <> 'pendiente' then raise exception 'Esa devolución ya está %', d.estado; end if;
  if not fn_es_lider() then
    raise exception 'Solo un líder puede aprobar una devolución';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub := fn_sububicacion_por_defecto(d.ubicacion_id, 'venta');
  select id into v_caja_id from cajas where ubicacion_id = d.ubicacion_id and estado = 'abierta';

  for r in select * from devolucion_items where devolucion_id = p_devolucion_id loop
    if r.condicion = 'vendible' then
      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, devolucion_item_id, usuario_id)
        select vi.variante_id, d.ubicacion_id, v_sub, 'entrada', r.cantidad, 'devolucion', r.id, v_persona
        from venta_items vi where vi.id = r.venta_item_id
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
      update devolucion_items set movimiento_id = v_mov_id where id = r.id;
    end if;
  end loop;

  update devoluciones set estado = 'aprobada', aprobado_por = v_persona, aprobado_en = now(),
                          reembolso_monto = p_reembolso_monto, reembolso_metodo = p_reembolso_metodo,
                          caja_id = v_caja_id
    where id = p_devolucion_id;
end;
$$;

-- ---------- cerrar_caja: resta los reembolsos en efectivo de esta caja ----------
create or replace function retail.cerrar_caja(p_caja_id uuid, p_monto_real numeric)
returns table (monto_sistema numeric, monto_real numeric, diferencia numeric)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_caja cajas%rowtype;
  v_ventas_efectivo numeric;
  v_ingresos numeric;
  v_egresos numeric;
  v_reembolsos_efectivo numeric;
  v_sistema numeric;
  v_persona uuid;
begin
  select * into v_caja from cajas where id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id;
  end if;
  if not fn_puede_operar_ubicacion(v_caja.ubicacion_id) then
    raise exception 'No tienes permiso para cerrar esa caja';
  end if;
  if v_caja.estado <> 'abierta' then
    raise exception 'Esta caja ya está cerrada';
  end if;
  if p_monto_real < 0 then
    raise exception 'El monto contado no puede ser negativo';
  end if;

  select coalesce(sum(vp.monto), 0) into v_ventas_efectivo
    from venta_pagos vp join ventas v on v.id = vp.venta_id
    where v.caja_id = p_caja_id and vp.metodo = 'efectivo';

  select coalesce(sum(monto) filter (where tipo = 'ingreso'), 0),
         coalesce(sum(monto) filter (where tipo = 'egreso'), 0)
    into v_ingresos, v_egresos
    from caja_movimientos where caja_id = p_caja_id;

  select coalesce(sum(reembolso_monto), 0) into v_reembolsos_efectivo
    from devoluciones
    where caja_id = p_caja_id and estado = 'aprobada' and reembolso_metodo = 'efectivo';

  v_sistema := v_caja.monto_apertura + v_ventas_efectivo + v_ingresos - v_egresos - v_reembolsos_efectivo;
  select id into v_persona from personas where auth_user_id = auth.uid();

  update cajas set
    estado = 'cerrada',
    monto_cierre_sistema = v_sistema,
    monto_cierre_real = p_monto_real,
    diferencia = p_monto_real - v_sistema,
    cerrada_por = v_persona,
    cerrada_en = now()
  where id = p_caja_id;

  return query select v_sistema, p_monto_real, p_monto_real - v_sistema;
end;
$$;
