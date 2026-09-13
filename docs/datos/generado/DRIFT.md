# Diferencias — lo que la pantalla llama vs. lo que producción acepta

> ⚠️ **ARCHIVO GENERADO.** Se reescribe con `pnpm datos:comparar --md`.
> Comparadas 33 llamadas de `apps/web` contra 56 funciones del schema `retail` en producción.

---

## Roto en producción — 2

### `recibir_lote` — parámetro de más

**Dónde:** `apps/web/components/RecibirLoteForm.tsx:431`
**Qué pasa:** manda `p_orden_produccion_id` y producción no lo acepta
**La app manda:** `p_sede_id`, `p_origen`, `p_proveedor`, `p_orden_compra_id`, `p_orden_produccion_id`, `p_numero_guia`, `p_nota`, `p_items`
**Producción acepta:** `p_sede_id`, `p_origen`, `p_items`, `p_proveedor`, `p_numero_guia`, `p_nota`, `p_orden_compra_id`
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `registrar_gasto` — parámetro de más

**Dónde:** `apps/web/components/RegistrarGastoModal.tsx:57`
**Qué pasa:** manda `p_metodo_pago` y producción no lo acepta
**La app manda:** `p_sede_id`, `p_categoria`, `p_subtotal`, `p_igv`, `p_total`, `p_especificacion`, `p_metodo_pago`
**Producción acepta:** `p_sede_id`, `p_categoria`, `p_subtotal`, `p_igv`, `p_total`, `p_especificacion`
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

## Avisos — 19

- `anular_comprobante` · `apps/web/app/api/lucode/consultar-anulacion/route.ts:72` — no manda `p_motivo` (normal si tienen valor por defecto)
- `actualizar_transmision_comprobante` · `apps/web/app/api/lucode/emitir/route.ts:159` — no manda `p_entorno`, `p_motivo_rechazo` (normal si tienen valor por defecto)
- `conteo_crear_variante` · `apps/web/components/AltaEnConteo.tsx:115` — no manda `p_talla`, `p_producto_id`, `p_costo`, `p_sku`, `p_contenedor_id` (normal si tienen valor por defecto)
- `bajar_a_piso` · `apps/web/components/BajarATiendaModal.tsx:39` — no manda `p_nota` (normal si tienen valor por defecto)
- `registrar_venta` · `apps/web/components/CajaPanel.tsx:93` — no manda `p_nota` (normal si tienen valor por defecto)
- `emitir_comprobante` · `apps/web/components/ComprobantesPanel.tsx:240` — no manda `p_venta_id`, `p_items` (normal si tienen valor por defecto)
- `registrar_serie_comprobante` · `apps/web/components/ComprobantesPanel.tsx:265` — no manda `p_siguiente_numero` (normal si tienen valor por defecto)
- `conteo_contar` · `apps/web/components/ConteoPanel.tsx:167` — no manda `p_contenedor_id` (normal si tienen valor por defecto)
- `conteo_contar` · `apps/web/components/ConteoPanel.tsx:247` — no manda `p_contenedor_id` (normal si tienen valor por defecto)
- `conteo_contar` · `apps/web/components/ConteoPanel.tsx:274` — no manda `p_contenedor_id` (normal si tienen valor por defecto)
- `abrir_conteo` · `apps/web/components/ConteoPanel.tsx:442` — no manda `p_alcance_familia`, `p_alcance_categoria_id`, `p_alcance_contenedor_id` (normal si tienen valor por defecto)
- `registrar_deposito` · `apps/web/components/EfectivoPanel.tsx:35` — no manda `p_fecha` (normal si tienen valor por defecto)
- `registrar_movimiento` · `apps/web/components/MovimientoModal.tsx:84` — no manda `p_canal`, `p_monto`, `p_venta_id`, `p_nota`, `p_lote_id` (normal si tienen valor por defecto)
- `cerrar_produccion` · `apps/web/components/OrdenesProduccion.tsx:368` — no manda `p_buenas` (normal si tienen valor por defecto)
- `registrar_produccion` · `apps/web/components/OrdenesProduccion.tsx:498` — no manda `p_categoria_id` (normal si tienen valor por defecto)
- `crear_proforma` · `apps/web/components/ProformasPanel.tsx:99` — no manda `p_items`, `p_cliente_num_doc` (normal si tienen valor por defecto)
- `convertir_proforma_a_comprobante` · `apps/web/components/ProformasPanel.tsx:126` — no manda `p_venta_id` (normal si tienen valor por defecto)
- `registrar_venta` · `apps/web/components/RegistrarVentaModal.tsx:235` — no manda `p_nota` (normal si tienen valor por defecto)
- `registrar_asiento` · `apps/web/components/RegistroContableForm.tsx:155` — no manda `p_referencia_tipo`, `p_referencia_id` (normal si tienen valor por defecto)

## No analizadas — 1

Estas llamadas arman sus parámetros fuera de la propia llamada, así que no se
pueden revisar leyendo el texto. **No están aprobadas: están sin revisar.**

- `importar_catalogo` · `apps/web/app/api/importacion/importar/route.ts:137` — el objeto se arma con «...», no se puede leer entero

## Funciones que nadie llama — 12

Existen en producción y ninguna pantalla las usa. Cada una es una de dos cosas:
una pantalla que falta construir, o una función que sobra y habría que retirar.

- `catalogo_con_stock`
- `conteo_contar_por_codigo`
- `devolver_a_almacen`
- `emitir_nota`
- `es_lider`
- `es_supervisor`
- `importar_catalogo`
- `mi_sede`
- `persona_actual`
- `puede_operar_sede`
- `recalcular_stock`
- `registrar_codigo_barras`
