-- ============================================================================
-- 20261014215000_produccion_token_sigue_al_contenido_parte2.sql — CAYLA V2 (/chaos de Producción, ADR-0409, 2026-10-14) · PARTE 2 de 2
--
-- EL PROBLEMA PRIMERO. /chaos lo vio en Producción el 2026-10-13 y lo repitió el 2026-10-14: se abre una orden de 6 prendas, la base
-- la guarda y la respuesta se pierde; la pantalla dice «no se pudo», la persona corrige a 8 y reintenta con el MISMO token. La base
-- devuelve la orden vieja (6) y la pantalla anuncia la nueva (8). El Taller corta 8, el sistema espera 6. Es el defecto que ADR-0398
-- cerró en Ventas y ADR-0401 en Inventario: el token se mira, pero no lo que se manda con él. En Producción lo tienen
-- `abrir_produccion`, `abrir_produccion_con_modelo_nuevo`, `recibir_insumo` (un lote de 10 m que se reintenta como 15 m queda en 10),
-- `registrar_comprobante_produccion` (otra factura con el mismo token devuelve la primera), `registrar_pago_comprobante_produccion`
-- (otro pago devuelve el primero) y `recibir_comprobante_produccion` (otra recepción devuelve la primera). `crear_orden_insumo` ya
-- resistía: su id lo pone la pantalla y la base compara el contenido.
-- Y una factura de insumos aceptaba cualquier porcentaje de IGV por la API (1000 % se guardó): el IGV de una factura sale de ahí.
--
-- LA DECISIÓN. La misma pieza de ADR-0398: cada una de esas funciones llama a `fn_intento_con_huella` ANTES de buscar su token, con
-- la huella de todo lo que se manda menos el token (en `abrir_produccion_con_modelo_nuevo`, tampoco `p_confirmo_distinto`: confirmar
-- que el modelo es distinto no cambia la orden). La huella es `md5(row(…)::text)` y no `jsonb_build_array`, porque un parámetro
-- `numeric` en `NaN` no se puede pasar a jsonb y la llamada se caería antes de que el candado de la tabla diera su frase. El mismo
-- token con otro contenido se rechaza (`token_reusado`); con el mismo contenido, todo sigue como siempre (devuelve lo que ya guardó).
-- Y el IGV de una factura de insumos va de 0 % a 18 % (`igv_fuera_de_rango`): la pantalla no lo manda (usa el 18 de la base), así
-- que solo frena a la API.
--
-- CONTRATO (Liskov)
--   PROMETE: con un token ya usado y otro contenido, esas seis funciones responden `token_reusado` sin escribir nada; con el mismo
--            contenido o un token nuevo, lo de siempre. Una factura con un IGV fuera de 0–18 % (o `NaN`) se rechaza sin escribir.
--   ASUME:   ADR-0398 (`intentos_con_token`, `fn_intento_con_huella`); las seis funciones vivas a la fecha (anclas verificadas en local
--            y en producción el 2026-10-14: misma definición, salvo comentarios en `recibir_insumo`).
--   NO HACE: no toca tablas ni políticas; no cambia qué valida cada función fuera del IGV. `fn_resolver_intento` no aprende las
--            operaciones de Producción: sus pantallas todavía no ofrecen «Revisar si se guardó» (queda en el backlog).
--
-- CÓMO SE PEGA. Una sola parte, solo funciones. Reemplazos ANCLADOS sobre la definición viva (ADR-0288): el bloque va antes de la
-- PRIMERA aparición del ancla, que tiene que aparecer exactamente las veces esperadas (si no, se detiene sin tocar nada). Anclas de
-- una línea de código, nunca comentarios. Idempotente (cada bloque lleva su marca). Sin `select … into` dentro de un texto entre
-- comillas.
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

select pg_temp.insertar_antes(
  'retail.abrir_produccion(uuid, uuid, jsonb, numeric, numeric, numeric, boolean, date, text, uuid)',
  $v$  if p_token is not null then$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otras tallas, otros costos u otra fecha se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('abrir_produccion', p_token, md5(row(p_ubicacion_id, p_producto_id, p_lineas, p_costo_tela, p_costo_avios, p_costo_maquila, p_es_muestra, p_fecha_entrega, p_nota)::text));
$v$,
  $v$fn_intento_con_huella('abrir_produccion'$v$);

select pg_temp.insertar_antes(
  'retail.abrir_produccion_con_modelo_nuevo(uuid, text, uuid, jsonb, numeric, numeric, numeric, numeric, boolean, date, text, boolean, uuid)',
  $v$  if p_token is not null then$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otro modelo, otras tallas u otros costos se rechaza (token_reusado).
  -- `p_confirmo_distinto` no entra: confirmar que el modelo es distinto no cambia la orden.
  perform retail.fn_intento_con_huella('abrir_produccion_con_modelo_nuevo', p_token, md5(row(p_ubicacion_id, p_referencia, p_categoria_id, p_variantes, p_precio, p_costo_tela, p_costo_avios, p_costo_maquila, p_es_muestra, p_fecha_entrega, p_nota)::text));
$v$,
  $v$fn_intento_con_huella('abrir_produccion_con_modelo_nuevo'$v$);

select pg_temp.insertar_antes(
  'retail.recibir_insumo(uuid, uuid, numeric, numeric, text, uuid, text, text, text, uuid)',
  $v$  if p_token is not null then$v$, 2,
  $v$  -- El token sigue al contenido: el mismo token con otra cantidad, otro costo u otro insumo se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('recibir_insumo', p_token, md5(row(p_insumo_id, p_ubicacion_id, p_cantidad, p_costo_total, p_codigo_lote, p_proveedor_id, p_documento, p_origen, p_nota)::text));
$v$,
  $v$fn_intento_con_huella('recibir_insumo'$v$);

select pg_temp.insertar_antes(
  'retail.registrar_comprobante_produccion(uuid, text, text, text, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid)',
  $v$  if p_token is not null then$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otra factura se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('registrar_comprobante_produccion', p_token, md5(row(p_proveedor_id, p_serie, p_numero, p_condicion, p_items, p_tipo, p_fecha_emision, p_fecha_vencimiento, p_igv_porcentaje, p_pago, p_nota, p_total)::text));
$v$,
  $v$fn_intento_con_huella('registrar_comprobante_produccion'$v$);

select pg_temp.insertar_antes(
  'retail.registrar_comprobante_produccion(uuid, text, text, text, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid)',
  $v$  v_igv := case when p_tipo = 'factura' then round(v_subtotal * coalesce(p_igv_porcentaje, 0) / 100, 2) else 0 end;$v$, 1,
  $v$  -- El IGV de una factura de insumos va de 0 % a 18 % (igv_fuera_de_rango). `NaN` no cumple `<= 18`: también se rechaza.
  if p_igv_porcentaje is not null and not (p_igv_porcentaje >= 0 and p_igv_porcentaje <= 18) then
    raise exception 'El IGV de la factura va de 0 %% a 18 %%: llegó %.', p_igv_porcentaje
      using errcode = 'P0001', hint = 'igv_fuera_de_rango';
  end if;
$v$,
  $v$igv_fuera_de_rango$v$);

select pg_temp.insertar_antes(
  'retail.registrar_pago_comprobante_produccion(uuid, jsonb, date, uuid)',
  $v$  if p_token is not null and exists (select 1 from retail.comprobantes_produccion_pagos where grupo_id = p_token) then$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otro pago u otra fecha se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('registrar_pago_comprobante_produccion', p_token, md5(row(p_comprobante_id, p_pagos, p_fecha)::text));
$v$,
  $v$fn_intento_con_huella('registrar_pago_comprobante_produccion'$v$);

select pg_temp.insertar_antes(
  'retail.recibir_comprobante_produccion(uuid, uuid, jsonb, jsonb, text, uuid)',
  $v$  if p_token is not null then$v$, 2,
  $v$  -- El token sigue al contenido: el mismo token con otras cantidades u otros cierres se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('recibir_comprobante_produccion', p_token, md5(row(p_comprobante_id, p_ubicacion_id, p_lineas, p_cierres, p_nota)::text));
$v$,
  $v$fn_intento_con_huella('recibir_comprobante_produccion'$v$);
