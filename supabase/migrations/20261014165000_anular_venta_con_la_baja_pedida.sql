-- ============================================================================
-- 20261014165000_anular_venta_con_la_baja_pedida.sql — CAYLA V2 (ADR-0016, act. 2026-10-14; Felipe 2026-10-14)
-- Dar de baja un comprobante anula la venta en el mismo acto: un comprobante aceptado cuya baja ya se pidió a SUNAT no sostiene la venta.
--
-- EL PROBLEMA. «Anular comprobante» (/api/lucode/anular → anular_comprobante) daba de baja la boleta ante SUNAT sin tocar la venta, y
-- `anular_venta` rechaza toda venta con un comprobante aceptado. En producción al 2026-10-13 (auditoría del ERP, solo lectura) había
-- 3 ventas completadas cuyo único comprobante está dado de baja (S/ 251,70); dos se cobraron otra vez por «era factura», con el ingreso,
-- el esperado de caja y el stock inflados. Principio 2 sin candado: dos actos que son uno se ejecutaban por separado.
--
-- LA DECISIÓN (Felipe, 2026-10-14): la baja de un comprobante que documenta una venta anula la venta en el mismo acto; si la venta no se
-- puede anular (su caja ya cerró, es de otro día, tiene un cambio o una devolución), la baja NO se pide y el camino es Devolución con
-- nota de crédito. La ruta /api/lucode/anular revisa eso ANTES de llamar a Lucode y, tras guardar la baja, llama `anular_venta`.
--
-- QUÉ HACE. La única guarda que lo impedía: una boleta se da de baja por el resumen diario, SUNAT lo procesa después, y mientras tanto el
-- comprobante sigue `aceptado` con `anulacion_solicitada_at` (ADR-0016). `anular_venta` lo leía como «comprobante aceptado» y frenaba.
-- Desde aquí un comprobante aceptado cuya baja ya se pidió no sostiene la venta: lo que se pidió a SUNAT no se deshace, así que la venta
-- tiene que seguirlo. Reemplazo anclado: la función vive en producción (md5 c4cf8893…; el ancla aparece una vez, verificado el 2026-10-14).
--
-- LO QUE NO CAMBIA. Un comprobante `enviado` o `aceptado` SIN baja pedida sigue frenando la anulación (Historial no anula una venta
-- facturada: se devuelve con nota de crédito). Caja abierta, mismo día, sin cambios ni devoluciones, módulo Devoluciones: igual que antes.
--
-- QUEDA ABIERTO (lo vigila la Fase 1 de la auditoría): si SUNAT RECHAZA la baja después (raro: fuera de plazo), la venta queda anulada con
-- un comprobante vigente, al revés de hoy. La invariante «toda venta completada tiene un comprobante vivo y toda venta anulada ninguno»
-- (INV-14, `fn_invariantes`) lo va a detectar; la salida es una nota de crédito.
--
-- PRODUCCIÓN: solo el reemplazo de una función; sin tablas, políticas ni `drop trigger`. Ya lleva `retail.`. Se puede pegar dos veces.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Reemplazo anclado (el mismo helper de 20261010233000) ----------
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está. Se mira primero porque, una vez aplicado, el ancla vieja ya no aparece y el conteo de abajo abortaría.
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Un comprobante aceptado cuya baja ya se pidió no sostiene la venta ----------
select pg_temp.reemplazar_anclado(
  'retail.anular_venta(uuid, text, jsonb)',
  $v$    select 1 from comprobantes where venta_id = p_venta_id and estado in ('enviado', 'aceptado')
$v$,
  $n$    -- ADR-0016 (act. 2026-10-14): la baja de un comprobante anula la venta en el mismo acto. Uno aceptado cuya baja ya se pidió a
    -- SUNAT (anulacion_solicitada_at) no sostiene la venta: /api/lucode/anular llama aquí justo después de pedirla.
    select 1 from comprobantes where venta_id = p_venta_id and estado in ('enviado', 'aceptado') and anulacion_solicitada_at is null
$n$
);

-- ---------- 2. Validación final: si algo no quedó, se deshace todo ----------
do $v$
declare
  v_def text := pg_get_functiondef('retail.anular_venta(uuid, text, jsonb)'::regprocedure);
  v_marca constant text := $m$and estado in ('enviado', 'aceptado') and anulacion_solicitada_at is null$m$;
begin
  if (length(v_def) - length(replace(v_def, v_marca, ''))) / length(v_marca) <> 1 then
    raise exception 'anular_venta: la guarda del comprobante con baja pedida tiene que quedar exactamente una vez';
  end if;
  -- La guarda del comprobante pendiente que ya se intentó enviar (20261012180100) sigue intacta.
  if position($p$estado in ('pendiente', 'pendiente_reintento') and intentos_transmision > 0$p$ in v_def) = 0 then
    raise exception 'anular_venta: se perdió la guarda del comprobante que pudo haber llegado a SUNAT';
  end if;
end
$v$;

reset lock_timeout;
