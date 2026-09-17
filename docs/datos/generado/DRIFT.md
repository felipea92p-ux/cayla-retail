# Diferencias — lo que la pantalla llama vs. lo que producción acepta

> ⚠️ **ARCHIVO GENERADO.** Se reescribe con `pnpm datos:comparar --md`.
> Comparadas 62 llamadas de `apps/web` contra 110 funciones del schema `retail` en producción.

---

## Roto en producción — 0

Nada. Todas las llamadas encajan con la firma real.
## Avisos — 8

- `anular_comprobante` · `apps\web\app\api\lucode\consultar-anulacion\route.ts:72` — no manda `p_motivo` (normal si tienen valor por defecto)
- `actualizar_transmision_comprobante` · `apps\web\app\api\lucode\emitir\route.ts:159` — no manda `p_entorno`, `p_motivo_rechazo` (normal si tienen valor por defecto)
- `emitir_comprobante` · `apps\web\components\ComprobantesPanel.tsx:272` — no manda `p_venta_id`, `p_items` (normal si tienen valor por defecto)
- `registrar_serie_comprobante` · `apps\web\components\ComprobantesPanel.tsx:297` — no manda `p_siguiente_numero` (normal si tienen valor por defecto)
- `crear_producto_con_variantes` · `apps\web\components\NuevoProductoForm.tsx:131` — no manda `p_stock_minimo`, `p_temporada`, `p_permitir_venta_sin_stock`, `p_fotos`, `p_tejido_id`, `p_patron_id` (normal si tienen valor por defecto)
- `crear_proforma` · `apps\web\components\ProformasPanel.tsx:106` — no manda `p_items`, `p_cliente_num_doc` (normal si tienen valor por defecto)
- `convertir_proforma_a_comprobante` · `apps\web\components\ProformasPanel.tsx:136` — no manda `p_venta_id` (normal si tienen valor por defecto)
- `mover_interno` · `apps\web\components\ReponerPisoModal.tsx:51` — no manda `p_nota` (normal si tienen valor por defecto)

## No analizadas — 17

Estas llamadas arman sus parámetros fuera de la propia llamada, así que no se
pueden revisar leyendo el texto. **No están aprobadas: están sin revisar.**

- `registrar_movimiento` · `apps\web\components\AjustarInventarioModal.tsx:185` — el objeto se arma con «...», no se puede leer entero
- `registrar_compra` · `apps\web\components\CompraFormV2.tsx:191` — el objeto se arma con «...», no se puede leer entero
- `catalogo_actualizar_producto` · `apps\web\components\ProductoForm.tsx:214` — el objeto se arma con «...», no se puede leer entero
- `catalogo_crear_producto` · `apps\web\components\ProductoForm.tsx:226` — el objeto se arma con «...», no se puede leer entero
- `actualizar_proveedor` · `apps\web\components\ProveedoresPanel.tsx:264` — el objeto se arma con «...», no se puede leer entero
- `registrar_proveedor` · `apps\web\components\ProveedoresPanel.tsx:268` — los parámetros no van escritos ahí mismo
- `registrar_venta` · `apps\web\components\PuntoDeVenta.tsx:310` — los parámetros no van escritos ahí mismo
- `registrar_venta` · `apps\web\components\PuntoDeVenta.tsx:656` — los parámetros no van escritos ahí mismo
- `recibir_compras` · `apps\web\components\RecepcionCompraFormV2.tsx:175` — el objeto se arma con «...», no se puede leer entero
- `recibir_lote` · `apps\web\components\RecepcionFormV2.tsx:70` — el objeto se arma con «...», no se puede leer entero
- `fn_productos` · `apps\web\lib\catalogo-v2.ts:177` — el objeto se arma con «...», no se puede leer entero
- `fn_productos_resumen` · `apps\web\lib\catalogo-v2.ts:241` — los parámetros no van escritos ahí mismo
- `listar_compras` · `apps\web\lib\compras.ts:148` — el objeto se arma con «...», no se puede leer entero
- `fn_prioridad_conteo` · `apps\web\lib\conteos.ts:178` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos` · `apps\web\lib\movimientos-v2.ts:222` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos` · `apps\web\lib\movimientos-v2.ts:252` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos_resumen` · `apps\web\lib\movimientos-v2.ts:271` — los parámetros no van escritos ahí mismo

## Funciones que nadie llama — 20

Existen en producción y ninguna pantalla las usa. Cada una es una de dos cosas:
una pantalla que falta construir, o una función que sobra y habría que retirar.

- `actualizar_proveedor`
- `ajustar_insumo_por_conteo`
- `catalogo_actualizar_producto`
- `desactivar_categoria`
- `desactivar_proveedor`
- `emitir_nota`
- `listar_compras`
- `reactivar_categoria`
- `reactivar_proveedor`
- `recalcular_compras`
- `recalcular_stock`
- `recibir_compras`
- `recibir_insumo`
- `recibir_lote`
- `registrar_compra`
- `registrar_gasto`
- `registrar_movimiento`
- `registrar_pago_compra`
- `registrar_proveedor`
- `registrar_venta`
