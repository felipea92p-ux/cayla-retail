-- ============================================================================
-- ⚠️ SOLO PARA PEGAR EN EL SQL EDITOR DE PRODUCCIÓN. NO es la migración local.
-- Sin timestamp a propósito (mismo motivo que `pegar-en-produccion-archivar-datos-prueba-2026-09.sql`): `db reset` la
-- ignora. Toca una fila que existe una sola vez, en producción.
--
-- QUÉ HACE (2026-09-29, tarde; a pedido de Felipe). Marca como prueba (`ventas.es_prueba = true`, ADR-0159) la venta de
-- las 12:55 de Tienda TRU: `B001-000001`, una vendedora de TRU, 1 prenda, S/ 59.90 en efectivo. Una venta hecha para entender el
-- sistema: con la marca sale del Historial de ventas y de Finanzas, y —con `20260930030000_actividad_oculta_ventas_de_
-- prueba.sql`— del panel de Actividad y del Inicio.
--
-- LO QUE NO HACE, y hay que tener presente.
--   · NO la anula. Sigue `completada`: su prenda sigue fuera del stock y su boleta sigue «aceptada» por Lucode (producción,
--     con CDR). `anular_venta` se niega a anular una venta con comprobante aceptado (ADR-0016, ADR-0065): primero hay que
--     darla de baja en Ventas ▸ Comprobantes (resumen diario). Ver docs/backlog/2026-09-29-anular-venta-restaurar-stock-920c1a.md.
--   · NO toca el efectivo de la caja: los S/ 59.90 siguen en el «esperado» de la caja abierta hasta que se anule la venta.
--   · NO borra nada: la fila de `actividad` queda (es de solo agregar) y el comprobante sigue igual.
--
-- POR QUÉ POR ID Y NO POR FILTRO. ADR-0159: un filtro amplio marcaría ventas reales. Este script nombra UNA venta y comprueba
-- que sea la esperada antes de tocarla (sede, estado y el número de su comprobante).
--
-- TODO O NADA e idempotente: el SQL Editor corre lo pegado en UNA transacción; pegarlo dos veces no cambia nada.
-- Por qué no usa `archivar_venta_prueba`: el SQL Editor no tiene sesión de app (`fn_es_lider()` da falso). El `update` directo
-- es lo que hace esa función; la auditoría es este archivo.
--
-- CÓMO SE DESHACE: `update retail.ventas set es_prueba = false where id = 'df60dae1-1393-43e4-ab2f-a272d3e060d3';`
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare
  c_venta constant uuid := 'df60dae1-1393-43e4-ab2f-a272d3e060d3';
  v_venta retail.ventas%rowtype;
  v_comprobante text;
  v_sede text;
begin
  select * into v_venta from retail.ventas where id = c_venta;
  if v_venta.id is null then
    raise exception 'No existe la venta %: no se toca nada.', c_venta;
  end if;
  if v_venta.es_prueba then
    return; -- ya está hecho
  end if;

  select nombre into v_sede from retail.ubicaciones where id = v_venta.ubicacion_id;
  select serie || '-' || lpad(numero::text, 6, '0') into v_comprobante
    from retail.comprobantes where venta_id = c_venta and comprobante_original_id is null;

  if v_sede is distinct from 'Tienda TRU' or v_venta.estado <> 'completada' or v_comprobante is distinct from 'B001-000001' then
    raise exception 'La venta % no es la esperada (sede %, estado %, comprobante %): no se toca nada.',
      c_venta, v_sede, v_venta.estado, v_comprobante;
  end if;

  update retail.ventas set es_prueba = true where id = c_venta;
end $$;

-- Verificar: debe salir es_prueba = true, estado = completada (NO anulada) y el comprobante en «aceptado».
select v.id, v.estado, v.es_prueba, c.serie || '-' || lpad(c.numero::text, 6, '0') as comprobante, c.estado as estado_comprobante
  from retail.ventas v left join retail.comprobantes c on c.venta_id = v.id
 where v.id = 'df60dae1-1393-43e4-ab2f-a272d3e060d3';
