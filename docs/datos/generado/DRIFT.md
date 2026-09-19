# Diferencias — lo que la pantalla llama vs. lo que producción acepta

> ⚠️ **ARCHIVO GENERADO.** Se reescribe con `pnpm datos:comparar --md`.
> Comparadas 102 llamadas de `apps/web` contra 174 funciones del schema `retail` en producción.

---

## Roto en producción — 1

## Sobrecargas — 0

Ninguna. Cada función tiene una sola firma en producción.
### `fn_proveedores_serie_12m` — no existe

**Dónde:** `apps/web/lib/proveedores.ts:83`
**Qué pasa:** la función `fn_proveedores_serie_12m` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

## Avisos — 14

- `anular_comprobante` · `apps/web/app/api/lucode/consultar-anulacion/route.ts:72` — no manda `p_motivo` (normal si tienen valor por defecto)
- `actualizar_transmision_comprobante` · `apps/web/app/api/lucode/emitir/route.ts:159` — no manda `p_entorno`, `p_motivo_rechazo` (normal si tienen valor por defecto)
- `actualizar_categoria_ejes` · `apps/web/app/api/productos/categorias/ejes/route.ts:23` — no manda `p_talla_habitual_ids` (normal si tienen valor por defecto)
- `registrar_nota_credito_compra` · `apps/web/components/AccionesFaltantes.tsx:101` — no manda `p_nota`, `p_cierre_id` (normal si tienen valor por defecto)
- `cerrar_linea_compra` · `apps/web/components/CerrarFaltanteModal.tsx:37` — no manda `p_nota` (normal si tienen valor por defecto)
- `emitir_comprobante` · `apps/web/components/ComprobantesPanel.tsx:378` — no manda `p_venta_id`, `p_items` (normal si tienen valor por defecto)
- `registrar_serie_comprobante` · `apps/web/components/ComprobantesPanel.tsx:405` — no manda `p_siguiente_numero` (normal si tienen valor por defecto)
- `crear_proforma` · `apps/web/components/ProformasPanel.tsx:106` — no manda `p_items`, `p_cliente_num_doc` (normal si tienen valor por defecto)
- `convertir_proforma_a_comprobante` · `apps/web/components/ProformasPanel.tsx:136` — no manda `p_venta_id` (normal si tienen valor por defecto)
- `mover_interno` · `apps/web/components/ReponerPisoModal.tsx:65` — no manda `p_nota` (normal si tienen valor por defecto)
- `resolver_prenda_danada` · `apps/web/components/ResolverDanadosModal.tsx:59` — no manda `p_proveedor_id` (normal si tienen valor por defecto)
- `registrar_proveedor` · `apps/web/components/alta-producto/NuevaMarcaForm.tsx:76` — no manda `p_contacto`, `p_rubro`, `p_plazo_credito_dias`, `p_forma_pago_preferida`, `p_telefono`, `p_banco`, `p_cuenta_bancaria` (normal si tienen valor por defecto)
- `fn_proveedor_costo_evolucion` · `apps/web/lib/proveedores.ts:229` — no manda `p_limite` (normal si tienen valor por defecto)
- `fn_resumen_variantes` · `apps/web/lib/resumen-inventario.ts:41` — no manda `p_ventana_dias` (normal si tienen valor por defecto)

## No analizadas — 23

Estas llamadas arman sus parámetros fuera de la propia llamada, así que no se
pueden revisar leyendo el texto. **No están aprobadas: están sin revisar.**

- `registrar_movimiento` · `apps/web/components/AjustarInventarioModal.tsx:185` — el objeto se arma con «...», no se puede leer entero
- `registrar_compra` · `apps/web/components/CompraFormV2.tsx:230` — el objeto se arma con «...», no se puede leer entero
- `registrar_pago_compras` · `apps/web/components/PagoJuntosModal.tsx:139` — el objeto se arma con «...», no se puede leer entero
- `catalogo_actualizar_producto` · `apps/web/components/ProductoForm.tsx:323` — el objeto se arma con «...», no se puede leer entero
- `actualizar_proveedor` · `apps/web/components/ProveedorModal.tsx:185` — el objeto se arma con «...», no se puede leer entero
- `registrar_proveedor` · `apps/web/components/ProveedorModal.tsx:189` — los parámetros no van escritos ahí mismo
- `registrar_venta` · `apps/web/components/PuntoDeVenta.tsx:360` — los parámetros no van escritos ahí mismo
- `registrar_venta` · `apps/web/components/PuntoDeVenta.tsx:782` — los parámetros no van escritos ahí mismo
- `recibir_envio` · `apps/web/components/RecepcionEnvio.tsx:488` — los parámetros no van escritos ahí mismo
- `recibir_lote` · `apps/web/components/RecepcionFormV2.tsx:70` — el objeto se arma con «...», no se puede leer entero
- `registrar_reembolso_proveedor` · `apps/web/components/SaldoFavorAcciones.tsx:49` — el objeto se arma con «...», no se puede leer entero
- `fn_productos` · `apps/web/lib/catalogo-v2.ts:223` — el objeto se arma con «...», no se puede leer entero
- `fn_productos` · `apps/web/lib/catalogo-v2.ts:303` — el objeto se arma con «...», no se puede leer entero
- `fn_productos_resumen` · `apps/web/lib/catalogo-v2.ts:326` — los parámetros no van escritos ahí mismo
- `por_pagar_tramos` · `apps/web/lib/compras-indicadores.ts:110` — el objeto se arma con «...», no se puede leer entero
- `listar_recepciones_compras` · `apps/web/lib/compras-indicadores.ts:211` — el objeto se arma con «...», no se puede leer entero
- `recepciones_sin_comprobante` · `apps/web/lib/compras-indicadores.ts:280` — el objeto se arma con «...», no se puede leer entero
- `listar_compras_operativo` · `apps/web/lib/compras.ts:175` — el objeto se arma con «...», no se puede leer entero
- `listar_compras` · `apps/web/lib/compras.ts:195` — el objeto se arma con «...», no se puede leer entero
- `fn_prioridad_conteo` · `apps/web/lib/conteos.ts:189` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos` · `apps/web/lib/movimientos-v2.ts:177` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos` · `apps/web/lib/movimientos-v2.ts:207` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos_resumen` · `apps/web/lib/movimientos-v2.ts:226` — los parámetros no van escritos ahí mismo

## Funciones que nadie llama — 29

Existen en producción y ninguna pantalla las usa. Cada una es una de dos cosas:
una pantalla que falta construir, o una función que sobra y habría que retirar.

- `actualizar_proveedor`
- `ajustar_insumo_por_conteo`
- `catalogo_actualizar_producto`
- `catalogo_crear_producto`
- `desactivar_categoria`
- `desactivar_proveedor`
- `emitir_nota`
- `listar_compras`
- `listar_compras_operativo`
- `listar_recepciones_compras`
- `por_pagar_tramos`
- `reactivar_categoria`
- `reactivar_proveedor`
- `recalcular_compras`
- `recalcular_stock`
- `recepciones_sin_comprobante`
- `recibir_compras`
- `recibir_envio`
- `recibir_insumo`
- `recibir_lote`
- `recibir_y_cerrar_compras`
- `registrar_compra`
- `registrar_consumo_insumo`
- `registrar_gasto`
- `registrar_movimiento`
- `registrar_pago_compra`
- `registrar_pago_compras`
- `registrar_reembolso_proveedor`
- `registrar_venta`
