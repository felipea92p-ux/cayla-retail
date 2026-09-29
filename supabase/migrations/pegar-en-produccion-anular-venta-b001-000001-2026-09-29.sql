-- ============================================================================
-- ⚠️ SOLO PARA PEGAR EN EL SQL EDITOR DE PRODUCCIÓN. NO es la migración local.
-- Sin timestamp a propósito (mismo motivo que `pegar-en-produccion-archivar-datos-prueba-2026-09.sql`): `db reset` la
-- ignora. Toca filas que existen una sola vez, en producción.
--
-- QUÉ HACE (2026-09-29, tarde; a pedido de Felipe Alvarez, líder). Anula la venta de las 12:55 de Tienda TRU —
-- `B001-000001`, una vendedora de TRU, 1 prenda, S/ 59.90 en efectivo, una venta hecha para entender el sistema — y devuelve la
-- prenda al inventario. Es el mismo trabajo que `retail.anular_venta(uuid, text, jsonb)` (ADR-0065), escrito a mano:
--   · una ENTRADA `anulacion_venta` por cada salida `venta` de la venta, en la misma sububicación (aquí «Piso de venta»),
--     aplicada al stock con `fn_aplicar_movimiento`;
--   · una fila en `venta_anulacion_items` por línea, con condición `vendible` (la prenda nunca salió de la tienda);
--   · la venta pasa a `anulada`, con motivo, responsable y hora.
-- No toca el comprobante: la baja de la boleta ante SUNAT es otro trámite (ver abajo).
--
-- POR QUÉ A MANO Y NO CON LA FUNCIÓN. (1) El SQL Editor corre como `postgres` sin sesión de app: `fn_es_lider()` da falso y
-- `anular_venta` rechazaría todo. (2) `anular_venta` se niega a anular una venta con comprobante «aceptado» (usa Cambio o
-- Devolución). Aquí la boleta SIGUE «aceptada» pero con la baja ya SOLICITADA (16:02, motivo «ERROR»): Felipe la pidió en
-- Ventas ▸ Comprobantes y SUNAT aún no la confirma. Este script exige justo eso —o que ya esté «anulado»— y se detiene si la
-- baja nunca se pidió: anular la venta con la boleta viva y sin baja dejaría a la SUNAT con un ingreso que el ERP no tiene.
--
-- LO QUE QUEDA ABIERTO. La baja de una boleta la confirma SUNAT de forma diferida (resumen diario). Si la rechazara (plazo),
-- la boleta seguiría viva con la venta anulada: se corrige con una nota de crédito (ADR-0016), no con este script. Para verlo:
-- Ventas ▸ Comprobantes ▸ «Consultar anulación» en la fila de B001-000001; debe pasar de «en trámite» a «anulado».
--
-- ORDEN. Primero `pegar-en-produccion-archivar-venta-de-prueba-b001-000001-2026-09-29.sql` (marca `es_prueba`; exige la venta
-- `completada`) y DESPUÉS este. La caja abierta de hoy esperará S/ 59.90 menos en efectivo una vez anulada.
--
-- POR ID Y CON COMPROBACIONES (ADR-0159): nombra UNA venta y comprueba sede, estado, comprobante y baja antes de tocarla.
-- TODO O NADA e idempotente: el SQL Editor corre lo pegado en UNA transacción; pegarlo dos veces no cambia nada la segunda.
--
-- CÓMO SE DESHACE. No se deshace: `movimientos` es de solo agregar. Para revertir el stock habría que registrar una SALIDA
-- nueva (motivo `ajuste`) y dejar la venta como está.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare
  c_venta constant uuid := 'df60dae1-1393-43e4-ab2f-a272d3e060d3';
  -- Felipe Alvarez (líder): quien pidió la anulación. Es la misma persona que firmó la anulación de esta mañana.
  c_persona constant uuid := '13ef8ea3-7bd4-4522-bae0-264c087ece5f';
  v_venta retail.ventas%rowtype;
  v_comp retail.comprobantes%rowtype;
  v_item retail.venta_items%rowtype;
  v_salida retail.movimientos%rowtype;
  v_sede text;
  v_salidas integer;
  v_mov uuid;
begin
  select * into v_venta from retail.ventas where id = c_venta for update;
  if v_venta.id is null then
    raise exception 'No existe la venta %: no se toca nada.', c_venta;
  end if;
  if v_venta.estado = 'anulada' then
    return; -- ya está hecho
  end if;

  select nombre into v_sede from retail.ubicaciones where id = v_venta.ubicacion_id;
  select * into v_comp from retail.comprobantes where venta_id = c_venta and comprobante_original_id is null;

  if v_sede is distinct from 'Tienda TRU' or v_venta.estado <> 'completada'
     or v_comp.id is null or (v_comp.serie || '-' || lpad(v_comp.numero::text, 6, '0')) <> 'B001-000001' then
    raise exception 'La venta % no es la esperada (sede %, estado %): no se toca nada.', c_venta, v_sede, v_venta.estado;
  end if;

  -- La baja de la boleta tiene que estar pedida (o ya confirmada). Sin baja, no se anula la venta.
  if not (v_comp.estado = 'anulado' or (v_comp.estado = 'aceptado' and v_comp.anulacion_solicitada_at is not null)) then
    raise exception 'La boleta B001-000001 está «%» y nadie pidió su baja: primero Ventas ▸ Comprobantes ▸ Anular. No se toca nada.', v_comp.estado;
  end if;

  -- Los mismos candados de `anular_venta`: nada de cambios ni devoluciones sobre sus líneas.
  if exists (
    select 1 from retail.venta_items vi
    where vi.venta_id = c_venta
      and (
        exists (select 1 from retail.cambios ca where ca.venta_item_id = vi.id)
        or exists (
          select 1 from retail.devolucion_items di join retail.devoluciones d on d.id = di.devolucion_id
          where di.venta_item_id = vi.id and d.estado <> 'rechazada'
        )
      )
  ) then
    raise exception 'La venta ya tiene un cambio o una devolución registrada: se resuelve por separado. No se toca nada.';
  end if;

  for v_item in select * from retail.venta_items where venta_id = c_venta loop
    select count(*) into v_salidas from retail.movimientos
     where venta_item_id = v_item.id and tipo = 'salida' and motivo = 'venta';
    if v_salidas <> 1 then
      raise exception 'La línea % tiene % salidas de stock por venta (se esperaba 1): se revisa a mano. No se toca nada.', v_item.id, v_salidas;
    end if;
    select * into v_salida from retail.movimientos
     where venta_item_id = v_item.id and tipo = 'salida' and motivo = 'venta';

    insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
    values (v_salida.variante_id, v_salida.ubicacion_id, v_salida.sububicacion_id, 'entrada', v_salida.cantidad,
            'anulacion_venta', v_item.id, c_persona)
    returning id into v_mov;
    perform retail.fn_aplicar_movimiento(v_mov);

    insert into retail.venta_anulacion_items (venta_id, venta_item_id, condicion, movimiento_id)
    values (c_venta, v_item.id, 'vendible', v_mov);
  end loop;

  update retail.ventas
     set estado = 'anulada',
         motivo_anulacion = 'Venta de prueba (a pedido de Felipe Alvarez, 2026-09-29). Anulada con SQL equivalente a anular_venta (ADR-0065): '
                            || 'el editor SQL no tiene sesion de lider. La baja de la boleta B001-000001 quedo solicitada a Lucode (16:02, motivo ERROR) y esta en tramite.',
         anulado_por = c_persona,
         anulado_en = now()
   where id = c_venta;
end $$;

-- Verificar: la venta «anulada», la boleta todavía «aceptada» (baja en trámite), y la prenda de vuelta en «Piso de venta».
select v.estado as estado_venta, v.es_prueba, c.estado as estado_boleta, c.anulacion_solicitada_at is not null as baja_solicitada
  from retail.ventas v join retail.comprobantes c on c.venta_id = v.id
 where v.id = 'df60dae1-1393-43e4-ab2f-a272d3e060d3';

select sb.nombre as sububicacion, s.cantidad
  from retail.stock s left join retail.sububicaciones sb on sb.id = s.sububicacion_id
 where s.variante_id = '415daac1-b342-47fd-bd3a-244cab835929' order by sb.nombre;
