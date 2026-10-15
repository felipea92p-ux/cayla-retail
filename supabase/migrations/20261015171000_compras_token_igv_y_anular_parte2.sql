-- ============================================================================
-- 20261015171000_compras_token_igv_y_anular_parte2.sql — CAYLA V2 (/chaos de Compras, ADR-0421, 2026-10-15) · PARTE 2 de 2
--
-- EL PROBLEMA PRIMERO. /chaos de Compras (2026-10-13, repetido el 2026-10-15 sobre main):
--   1. GRAVEDAD 1 · Recibir y anular la MISMA factura a la vez terminaban bien las dos: la factura quedaba anulada y sus prendas en el
--      stock (INV-14, 3 de 3). `recibir_compras` bloquea la LÍNEA y `anular_compra` bloquea la FACTURA: cada una miraba a la otra antes
--      de que confirmara. Prendas que ya no le deben nada a nadie, y un costo de prenda cambiado por una factura que no existe.
--   2. GRAVEDAD 1 · El mismo token con OTRO contenido devolvía lo del primer envío: `registrar_compra` (una factura de 3 × S/ 30 devuelta
--      para un pedido de 9 × S/ 99) y los tres pagos (`registrar_pagos_compra`, `registrar_pago_compras`, `registrar_pago_compras_medios`:
--      S/ 100 guardados y S/ 200 anunciados). `recibir_envio` ya respondía «Este envío ya estaba registrado» y no se toca.
--   3. GRAVEDAD 2, solo por la API · una factura con IGV de 1000 %, emitida en 2030, o factura/boleta sin serie.
--
-- LA DECISIÓN. Las mismas piezas que en el resto del ERP:
--   1. `anular_compra` bloquea las líneas de la factura (en el orden de `fn_bloquear_en_orden`) ANTES de la factura y de mirar si hay
--      mercadería: el mismo orden que toda recepción, que bloquea las líneas y después actualiza la factura. Una recepción en curso termina
--      primero y anular la ve; o anular termina primero y la recepción ve la factura anulada. Con el orden al revés (la factura primero)
--      Postgres cortaba a uno por bloqueo mutuo (`deadlock detected`), y podía ser la recepción.
--   2. `fn_intento_con_huella` (ADR-0398) en las cuatro funciones, antes de mirar el token (`md5(row(…)::text)`: un `NaN` no pasa a jsonb).
--   3. En `registrar_compra`: el IGV va de 0 % a 18 % (`igv_fuera_de_rango`, como en Producción, ADR-0409), la emisión no es futura
--      (`emision_futura`) y una factura o una boleta llevan su serie (`serie_vacia`; una nota de venta o «sin comprobante» pueden no traerla).
--
-- CONTRATO (Liskov)
--   PROMETE: ninguna factura anulada queda con mercadería que entró en paralelo; el mismo token con otro contenido responde `token_reusado`
--            sin escribir nada; ninguna factura nueva con IGV fuera de 0–18 %, emitida en el futuro o (factura/boleta) sin serie.
--   ASUME:   las cinco funciones vivas a la fecha (anclas verificadas en local y en producción el 2026-10-15).
--   NO HACE: no toca tablas ni políticas; no cambia qué valida cada función fuera de esto.
--
-- CÓMO SE PEGA. Una sola parte, solo funciones. Reemplazos ANCLADOS sobre la definición viva (ADR-0288): cada bloque va antes de la
-- primera aparición de su ancla, que tiene que aparecer exactamente una vez (si no, se detiene sin tocar nada). Idempotente. Sin políticas.
-- ============================================================================
set lock_timeout = '3s';

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

-- 1. Anular espera a la recepción en curso (INV-14).
select pg_temp.insertar_antes(
  'retail.anular_compra(uuid, text)',
  $v$  select * into v_compra from compras where id = p_compra_id for update;$v$, 1,
  $v$  -- ADR-0421: primero las líneas y después la factura, en el mismo orden que toda recepción (bloquea las líneas con
  -- fn_bloquear_en_orden y después actualiza la factura): una recepción en curso termina antes de que se mire si hay mercadería, una
  -- que llegue después ve la factura anulada, y no hay bloqueo mutuo (anular_espera_recepcion).
  perform 1 from compra_items where compra_id = p_compra_id order by id for update;
$v$,
  $v$anular_espera_recepcion$v$);

-- 2. El token sigue al contenido.
select pg_temp.insertar_antes(
  'retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date)',
  $v$  if p_token is not null then$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otra factura se rechaza (token_reusado, ADR-0421).
  perform retail.fn_intento_con_huella('registrar_compra', p_token, md5(row(p_proveedor_id, p_serie, p_numero, p_condicion, p_ubicacion_destino_id, p_items, p_tipo, p_fecha_emision, p_fecha_vencimiento, p_igv_porcentaje, p_pago, p_nota, p_total, p_fecha_estimada_llegada)::text));
$v$,
  $v$fn_intento_con_huella('registrar_compra'$v$);

select pg_temp.insertar_antes(
  'retail.registrar_pagos_compra(uuid, jsonb, date, uuid, uuid)',
  $v$  if p_token is not null then$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otro pago u otra fecha se rechaza (token_reusado, ADR-0421).
  perform retail.fn_intento_con_huella('registrar_pagos_compra', p_token, md5(row(p_compra_id, p_pagos, p_fecha, p_ubicacion_id)::text));
$v$,
  $v$fn_intento_con_huella('registrar_pagos_compra'$v$);

select pg_temp.insertar_antes(
  'retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid, numeric, uuid)',
  $v$  if p_token is not null and exists (select 1 from compra_pagos where pago_grupo_id = p_token) then$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otro reparto u otro monto se rechaza (token_reusado, ADR-0421).
  perform retail.fn_intento_con_huella('registrar_pago_compras', p_token, md5(row(p_proveedor_id, p_metodo, p_aplicaciones, p_referencia, p_fecha, p_credito, p_ubicacion_id)::text));
$v$,
  $v$fn_intento_con_huella('registrar_pago_compras'$v$);

select pg_temp.insertar_antes(
  'retail.registrar_pago_compras_medios(uuid, jsonb, jsonb, date, uuid, numeric, uuid)',
  $v$  if p_token is not null and exists (select 1 from compra_pagos where pago_grupo_id = p_token) then$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otro reparto u otros medios se rechaza (token_reusado, ADR-0421).
  perform retail.fn_intento_con_huella('registrar_pago_compras_medios', p_token, md5(row(p_proveedor_id, p_aplicaciones, p_medios, p_fecha, p_credito, p_ubicacion_id)::text));
$v$,
  $v$fn_intento_con_huella('registrar_pago_compras_medios'$v$);

-- 3. El IGV, la emisión y la serie de una factura.
select pg_temp.insertar_antes(
  'retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date)',
  $v$  v_igv := round(v_subtotal * coalesce(p_igv_porcentaje, 0) / 100, 2);$v$, 1,
  $v$  -- ADR-0421: el IGV va de 0 % a 18 % (como en Producción); la emisión no es futura; una factura o una boleta llevan su serie.
  if p_igv_porcentaje is not null and not (p_igv_porcentaje >= 0 and p_igv_porcentaje <= 18) then
    raise exception 'El IGV de la factura va de 0 %% a 18 %%: llegó %.', p_igv_porcentaje
      using errcode = 'P0001', hint = 'igv_fuera_de_rango';
  end if;
  if p_fecha_emision > retail.fn_hoy_lima() then
    raise exception 'La fecha de emisión (%) no puede ser futura: hoy es %.', to_char(p_fecha_emision, 'DD/MM/YYYY'), to_char(retail.fn_hoy_lima(), 'DD/MM/YYYY')
      using errcode = 'P0001', hint = 'emision_futura';
  end if;
  if coalesce(p_tipo, 'factura') in ('factura', 'boleta') and nullif(btrim(coalesce(p_serie, '')), '') is null then
    raise exception 'El comprobante necesita su serie, como está impresa (F001, B002…).'
      using errcode = 'P0001', hint = 'serie_vacia';
  end if;
$v$,
  $v$hint = 'serie_vacia'$v$);
