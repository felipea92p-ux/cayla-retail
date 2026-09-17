# Diferencias — lo que la pantalla llama vs. lo que producción acepta

> ⚠️ **ARCHIVO GENERADO.** Se reescribe con `pnpm datos:comparar --md`.
> Comparadas 63 llamadas de `apps/web` contra 73 funciones del schema `retail` en producción.

---

## Roto en producción — 18

### `actualizar_categoria` — no existe

**Dónde:** `apps/web/app/api/productos/categorias/route.ts:98`
**Qué pasa:** la función `actualizar_categoria` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `anular_venta` — no existe

**Dónde:** `apps/web/components/AnularVentaForm.tsx:86`
**Qué pasa:** la función `anular_venta` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `fn_prioridad_conteo` — no existe

**Dónde:** `apps/web/components/ConteoPanel.tsx:65`
**Qué pasa:** la función `fn_prioridad_conteo` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `abrir_conteo` — parámetro de más

**Dónde:** `apps/web/components/ConteoPanel.tsx:89`
**Qué pasa:** manda `p_alcance`, `p_alcance_categoria_id` y producción no lo acepta
**La app manda:** `p_ubicacion_id`, `p_sububicacion_id`, `p_alcance`, `p_alcance_categoria_id`
**Producción acepta:** `p_ubicacion_id`, `p_sububicacion_id`
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `iniciar_traslado` — no existe

**Dónde:** `apps/web/components/MoverMercaderiaFormV2.tsx:108`
**Qué pasa:** la función `iniciar_traslado` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `registrar_movimiento_caja` — parámetro de más

**Dónde:** `apps/web/components/MovimientoCajaModal.tsx:53`
**Qué pasa:** manda `p_nota`, `p_es_ajuste` y producción no lo acepta
**La app manda:** `p_caja_id`, `p_tipo`, `p_monto`, `p_motivo`, `p_nota`, `p_es_ajuste`
**Producción acepta:** `p_caja_id`, `p_tipo`, `p_monto`, `p_motivo`
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `abrir_produccion` — no existe

**Dónde:** `apps/web/components/NuevaOrdenProduccionForm.tsx:97`
**Qué pasa:** la función `abrir_produccion` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `crear_producto_con_variantes` — no existe

**Dónde:** `apps/web/components/NuevoProductoForm.tsx:131`
**Qué pasa:** la función `crear_producto_con_variantes` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `set_etapa_produccion` — no existe

**Dónde:** `apps/web/components/OrdenesProduccionV2.tsx:72`
**Qué pasa:** la función `set_etapa_produccion` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `cerrar_produccion` — no existe

**Dónde:** `apps/web/components/OrdenesProduccionV2.tsx:346`
**Qué pasa:** la función `cerrar_produccion` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `anular_produccion` — no existe

**Dónde:** `apps/web/components/OrdenesProduccionV2.tsx:437`
**Qué pasa:** la función `anular_produccion` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `revertir_produccion` — no existe

**Dónde:** `apps/web/components/OrdenesProduccionV2.tsx:477`
**Qué pasa:** la función `revertir_produccion` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `registrar_recepcion_traslado` — no existe

**Dónde:** `apps/web/components/TrasladoDetallePanel.tsx:58`
**Qué pasa:** la función `registrar_recepcion_traslado` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `confirmar_traslado` — no existe

**Dónde:** `apps/web/components/TrasladoDetallePanel.tsx:74`
**Qué pasa:** la función `confirmar_traslado` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `cerrar_traslado_con_diferencia` — no existe

**Dónde:** `apps/web/components/TrasladoDetallePanel.tsx:88`
**Qué pasa:** la función `cerrar_traslado_con_diferencia` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `fn_conteos_resumen` — no existe

**Dónde:** `apps/web/lib/conteos.ts:120`
**Qué pasa:** la función `fn_conteos_resumen` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `fn_historial_producto_cambios` — no existe

**Dónde:** `apps/web/lib/historial-producto.ts:53`
**Qué pasa:** la función `fn_historial_producto_cambios` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `fn_traslado_lineas` — no existe

**Dónde:** `apps/web/lib/traslados.ts:154`
**Qué pasa:** la función `fn_traslado_lineas` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

## Avisos — 7

- `anular_comprobante` · `apps/web/app/api/lucode/consultar-anulacion/route.ts:72` — no manda `p_motivo` (normal si tienen valor por defecto)
- `actualizar_transmision_comprobante` · `apps/web/app/api/lucode/emitir/route.ts:159` — no manda `p_entorno`, `p_motivo_rechazo` (normal si tienen valor por defecto)
- `emitir_comprobante` · `apps/web/components/ComprobantesPanel.tsx:272` — no manda `p_venta_id`, `p_items` (normal si tienen valor por defecto)
- `registrar_serie_comprobante` · `apps/web/components/ComprobantesPanel.tsx:297` — no manda `p_siguiente_numero` (normal si tienen valor por defecto)
- `crear_proforma` · `apps/web/components/ProformasPanel.tsx:106` — no manda `p_items`, `p_cliente_num_doc` (normal si tienen valor por defecto)
- `convertir_proforma_a_comprobante` · `apps/web/components/ProformasPanel.tsx:136` — no manda `p_venta_id` (normal si tienen valor por defecto)
- `mover_interno` · `apps/web/components/ReponerPisoModal.tsx:51` — no manda `p_nota` (normal si tienen valor por defecto)

## No analizadas — 17

Estas llamadas arman sus parámetros fuera de la propia llamada, así que no se
pueden revisar leyendo el texto. **No están aprobadas: están sin revisar.**

- `registrar_movimiento` · `apps/web/components/AjustarInventarioModal.tsx:185` — el objeto se arma con «...», no se puede leer entero
- `registrar_compra` · `apps/web/components/CompraFormV2.tsx:202` — el objeto se arma con «...», no se puede leer entero
- `catalogo_actualizar_producto` · `apps/web/components/ProductoForm.tsx:214` — el objeto se arma con «...», no se puede leer entero
- `catalogo_crear_producto` · `apps/web/components/ProductoForm.tsx:226` — el objeto se arma con «...», no se puede leer entero
- `actualizar_proveedor` · `apps/web/components/ProveedoresPanel.tsx:264` — el objeto se arma con «...», no se puede leer entero
- `registrar_proveedor` · `apps/web/components/ProveedoresPanel.tsx:268` — los parámetros no van escritos ahí mismo
- `registrar_venta` · `apps/web/components/PuntoDeVenta.tsx:310` — los parámetros no van escritos ahí mismo
- `registrar_venta` · `apps/web/components/PuntoDeVenta.tsx:656` — los parámetros no van escritos ahí mismo
- `recibir_compras` · `apps/web/components/RecepcionCompraFormV2.tsx:175` — el objeto se arma con «...», no se puede leer entero
- `recibir_lote` · `apps/web/components/RecepcionFormV2.tsx:70` — el objeto se arma con «...», no se puede leer entero
- `fn_productos` · `apps/web/lib/catalogo-v2.ts:177` — el objeto se arma con «...», no se puede leer entero
- `fn_productos_resumen` · `apps/web/lib/catalogo-v2.ts:241` — los parámetros no van escritos ahí mismo
- `listar_compras` · `apps/web/lib/compras.ts:149` — el objeto se arma con «...», no se puede leer entero
- `fn_prioridad_conteo` · `apps/web/lib/conteos.ts:178` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos` · `apps/web/lib/movimientos-v2.ts:222` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos` · `apps/web/lib/movimientos-v2.ts:252` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos_resumen` · `apps/web/lib/movimientos-v2.ts:271` — los parámetros no van escritos ahí mismo

## Funciones que nadie llama — 15

Existen en producción y ninguna pantalla las usa. Cada una es una de dos cosas:
una pantalla que falta construir, o una función que sobra y habría que retirar.

- `actualizar_proveedor`
- `desactivar_proveedor`
- `emitir_nota`
- `listar_compras`
- `reactivar_proveedor`
- `recalcular_compras`
- `recalcular_stock`
- `recibir_compras`
- `recibir_lote`
- `registrar_compra`
- `registrar_movimiento`
- `registrar_pago_compra`
- `registrar_proveedor`
- `registrar_venta`
- `transferir`
